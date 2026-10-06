// FICHIERS DU .EXE tenus par le process principal (main.cjs) : la save canonique
// en fichier (Steam Cloud), la détection de Google Drive et son fichier nuage,
// l'export vers un fichier, le protocole app://, l'état de la fenêtre, et le pont
// optionnel des succès Steam (STEAM-9).
// Module SANS `electron` (seulement fs, path, os) : il se teste tel quel sous
// Vitest (src/__tests__/desktopFiles.test.js), main.cjs ne fait que le brancher.
"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");

// ── SAVE CANONIQUE EN FICHIER (audit 2026-10-05, STEAM-4) ─────────────────────
// La partie vivait SEULEMENT dans le localStorage de Chromium : un LevelDB
// verrouillé et multi-fichiers (LOCK, MANIFEST, .log réécrits à chaque compactage)
// que Steam Auto-Cloud ne sait pas synchroniser sans le corrompre. Elle est
// désormais AUSSI écrite ici, en un seul fichier : userData/saves/save.json.
// Réglage Steamworks › Auto-Cloud : racine WinAppDataRoaming, sous-dossier
// « civilisation-effondrement/saves », motif « save.json » (ni .tmp ni .bak).
// L'arbitrage « quelle save gagne » ne vit PAS ici : src/game/core/fileSave.js.
//
// Écriture ATOMIQUE : fichier temporaire vidé sur le disque (fsync), puis renommé
// par-dessus save.json — une coupure de courant ou un « Arrêter » de Steam laisse
// l'ancienne save ou la nouvelle, jamais une moitié. La save précédente est gardée
// en save.json.bak : relue seulement si save.json ne se relit plus.
const SAVE_FILE_MAX_CHARS = 64 * 1024 * 1024; // garde-fou : une save pèse quelques centaines de ko

function saveFilePaths(userData) {
  const dir = path.join(userData, "saves");
  const file = path.join(dir, "save.json");
  return { dir, file, tmp: file + ".tmp", bak: file + ".bak" };
}

// Se relit-il comme du JSON (BOM toléré, comme stripBom côté jeu) ? Le contenu,
// lui, est jugé par le jeu : ici on ne fait que choisir entre save.json et .bak.
function readsAsJson(text) {
  if (typeof text !== "string" || !text) return false;
  try {
    JSON.parse(text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text);
    return true;
  } catch {
    return false;
  }
}

// Une save par dossier userData. `read` rend { status, text } :
//   'none'  — aucun fichier (premier lancement, ou effacé) : rien à adopter ;
//   'ok'    — texte lu (le jeu le juge : version, contenu) ;
//   'error' — le fichier EXISTE mais ne se lit pas (droits, verrou, vide) : le jeu
//             ne doit ni l'adopter ni l'écraser — même règle que le nuage Drive.
function createSaveStore(userData) {
  const { dir, file, tmp, bak } = saveFilePaths(userData);
  // Dernier texte écrit (ou lu) : une écriture identique est sautée — le flush
  // synchrone de fermeture suit presque toujours l'autosave qui vient d'écrire.
  let lastText = null;
  // save.json est-il SAIN (relu, ou écrit par nous) ? Sinon il ne part pas en
  // .bak : un fichier abîmé ne doit pas chasser la dernière bonne copie.
  let knownGood = false;

  function read() {
    let text;
    try {
      text = fs.readFileSync(file, "utf8");
    } catch (e) {
      if (e && e.code === "ENOENT") return { status: "none", text: null };
      return { status: "error", text: null };
    }
    if (readsAsJson(text)) {
      lastText = text;
      knownGood = true;
      return { status: "ok", text };
    }
    // Vide ou tronqué : la copie précédente, si elle se relit.
    try {
      const prev = fs.readFileSync(bak, "utf8");
      if (readsAsJson(prev)) return { status: "ok", text: prev, recovered: true };
    } catch { /* pas de copie */ }
    // Contenu présent mais illisible : le jeu l'archive (copie de secours) avant
    // de le remplacer. Vide : illisible, JAMAIS « pas de partie ».
    return text ? { status: "ok", text } : { status: "error", text: null };
  }

  function write(text) {
    if (typeof text !== "string" || !text || text.length > SAVE_FILE_MAX_CHARS) return false;
    if (text === lastText) return true;
    try {
      fs.mkdirSync(dir, { recursive: true });
      const fd = fs.openSync(tmp, "w");
      try {
        fs.writeFileSync(fd, text, "utf8");
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
      if (knownGood) {
        try { fs.copyFileSync(file, bak); } catch { /* première save : rien à garder */ }
      }
      fs.renameSync(tmp, file);
      lastText = text;
      knownGood = true;
      return true;
    } catch {
      return false; // disque plein, droits : la save localStorage tient toujours
    }
  }

  // « Recommencer depuis le tout premier feu » : la partie effacée ne doit pas
  // ressusciter au lancement suivant (ni via Steam Cloud sur un autre poste).
  function clear() {
    try {
      fs.rmSync(file, { force: true });
      lastText = null;
      knownGood = false;
      return true;
    } catch {
      return false;
    }
  }

  return { read, write, clear, file };
}

// ── GOOGLE DRIVE, DÉTECTÉ EN ASYNCHRONE (audit 2026-10-05, ELEC-3) ────────────
// « Google Drive pour ordinateur » n'expose AUCUNE variable d'environnement : on
// cherche ses deux visages, dans les deux langues — le lecteur virtuel (G:\Mon
// Drive, lettre variable), puis les dossiers miroir du profil. Cette recherche
// tournait dans le préload, en SYNCHRONE, avant la page : jusqu'à 46 existsSync,
// et un lecteur réseau mappé hors ligne (NAS éteint, VPN coupé) gelait la fenêtre
// blanche le temps que Windows renonce à le reconnecter. Désormais : process
// principal, toutes les pistes en parallèle, chacune bornée, dès le lancement ; le
// chemin trouvé est retenu pour les lancements suivants.
const DRIVE_PROBE_TIMEOUT_MS = 300;
// Le chemin retenu au lancement précédent a droit à plus de patience : c'est le
// seul attendu, et le rater couperait le nuage pour toute la session.
const DRIVE_CACHED_TIMEOUT_MS = 1500;

// VERSION STEAM : PAS DE MIROIR GOOGLE DRIVE (audit 2026-10-05, STEAM-4 / ELEC-3,
// décision C de Raph). Steam Cloud transporte déjà la partie (saves/save.json,
// ci-dessus) ; un second nuage écrirait dans le Drive du joueur sans le lui demander,
// et deux transports qui arbitrent chacun « la plus avancée » se marcheraient dessus.
// Le miroir reste dans l'.exe hors Steam (le navigateur n'en a jamais eu). Est
// « version Steam » :
//   · un jeu LANCÉ par le client Steam — il pose SteamAppId / SteamGameId dans
//     l'environnement (comme pour les drapeaux d'overlay, main.cjs) ;
//   · une BUILD Steam, même lancée à la main depuis son dossier : `npm run dist-steam`
//     injecte `civSteamBuild: true` dans le package.json empaqueté
//     (-c.extraMetadata, package.json › scripts) ; `meta` = ce package.json.
function isSteamVersion({ env = process.env, meta = null } = {}) {
  if (env && (env.SteamAppId || env.SteamGameId)) return true;
  return Boolean(meta && (meta.civSteamBuild === true || meta.civSteamBuild === "true"));
}

function driveCandidates({ platform = process.platform, home = os.homedir() } = {}) {
  const out = [];
  const names = ["Mon Drive", "My Drive"];
  if (platform === "win32") {
    for (let c = 68; c <= 90; c += 1) { // lettres D: à Z: (jamais A/B/C)
      for (const name of names) out.push(String.fromCharCode(c) + ":\\" + name);
    }
  }
  for (const name of ["Google Drive", "Mon Drive", "My Drive"]) out.push(path.join(home, name));
  return out;
}

// Dossier présent ? Borné : un lecteur réseau capricieux répond « non » au bout
// de `timeoutMs` au lieu de tenir tout le monde en attente (sa requête, elle,
// finit dans le vide quand Windows abandonne).
function probeDir(p, timeoutMs = DRIVE_PROBE_TIMEOUT_MS) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    fs.promises.stat(p)
      .then((st) => st.isDirectory(), () => false)
      .then((ok) => { clearTimeout(timer); resolve(ok); });
  });
}

// ── FICHIER NUAGE DANS GOOGLE DRIVE (audit 2026-10-05, ELEC-4) ────────────────
// Lu et écrit ICI, par le process principal : le préload le faisait lui-même avec
// fs, ce qui imposait `sandbox: false` — tout le moteur de rendu tournait hors du
// bac à sable de l'OS. Mêmes règles qu'avant (celles du préload d'origine).
// ⚠ Noms STABLES (STEAM-10) : ce dossier et ce fichier existent déjà dans le Drive
// des joueurs. Ils ne suivent PAS le nom affiché du jeu — les renommer couperait
// en silence la synchro de toutes les parties existantes.
const CLOUD_DIR_NAME = "Civilisation Idle";
const CLOUD_FILE_NAME = "civilisation-idle-save.json";

// Fichier nuage sous la racine Drive `root` (detectGoogleDriveRoot), ou un
// magasin éteint (`dir: null`, statut 'off') sans Drive.
function createCloudStore(root) {
  const dir = root ? path.join(root, CLOUD_DIR_NAME) : null;
  const file = dir ? path.join(dir, CLOUD_FILE_NAME) : null;

  // ⚠ Le statut est AUSSI IMPORTANT que le contenu : « pas de fichier » (premier
  // lancement, on peut écrire sans risque) et « fichier présent mais illisible »
  // (Drive hors ligne, placeholder « en ligne seulement » non hydraté, EPERM,
  // verrou de synchro) doivent être DISTINGUÉS. Les confondre en un `null`
  // laissait le jeu croire le nuage vide et l'écraser avec une partie neuve.
  function read() {
    if (!file) return { status: "off", text: null };
    let exists;
    try {
      exists = fs.existsSync(file);
    } catch {
      return { status: "error", text: null }; // même l'existence est indécidable
    }
    if (!exists) return { status: "none", text: null };
    try {
      const text = fs.readFileSync(file, "utf8");
      // Un placeholder Drive non hydraté peut se lire VIDE sans lever d'erreur :
      // on le traite comme illisible, JAMAIS comme « pas de partie ».
      if (!text) return { status: "error", text: null };
      return { status: "ok", text };
    } catch {
      return { status: "error", text: null };
    }
  }

  function write(text) {
    if (!file || typeof text !== "string" || !text || text.length > SAVE_FILE_MAX_CHARS) return false;
    try {
      fs.mkdirSync(dir, { recursive: true });
      // Écriture atomique (temp + rename) : Drive ne doit jamais synchroniser
      // un fichier à moitié écrit.
      const tmp = file + ".tmp";
      fs.writeFileSync(tmp, text, "utf8");
      fs.renameSync(tmp, file);
      return true;
    } catch {
      return false; // disque plein, verrou Drive… : le jeu continue en local
    }
  }

  function clear() {
    if (!file) return false;
    try {
      fs.rmSync(file, { force: true });
      return true;
    } catch {
      return false;
    }
  }

  return { dir, file, read, write, clear };
}

// ── EXPORT VERS UN FICHIER CHOISI (audit 2026-10-05, SAV-14 et ELEC-4) ─────────
// Le préload écrivait dans `~/Documents` codé en dur, sans dialogue : sous OneDrive
// (le défaut de Windows 11) le fichier tombait dans un Documents créé à la volée,
// invisible depuis l'Explorateur — et n'importe quelle extension passait (« x.bat »).
// Désormais le dialogue d'enregistrement natif (main.cjs), et seulement .txt ou
// .json : une page détournée ne peut plus déposer un exécutable.
const EXPORT_EXTENSIONS = [".txt", ".json"];

// Nom proposé dans le dialogue : caractères sûrs, extension permise (.txt sinon).
function safeExportName(filename) {
  let name = String(filename || "civilisation.txt").replace(/[^\w.-]+/g, "-").slice(0, 80);
  if (!EXPORT_EXTENSIONS.includes(path.extname(name).toLowerCase())) name += ".txt";
  return name;
}

// Chemin choisi dans le dialogue, ramené à une extension permise : celle du nom
// proposé s'ajoute au besoin (« sauvegarde » ou « x.bat » → « … .txt »).
function exportTarget(chosenPath, suggestedName) {
  if (EXPORT_EXTENSIONS.includes(path.extname(chosenPath).toLowerCase())) return chosenPath;
  const ext = path.extname(safeExportName(suggestedName)).toLowerCase();
  return chosenPath + ext;
}

// ── PROTOCOLE app:// (audit 2026-10-05, ELEC-5) ───────────────────────────────
// app://localhost/<chemin> → dist/<chemin> (index.html par défaut). Rend
// { status: 200, filePath, size } ou { status: 400 | 404 }.
//   · 400 — pourcentage mal formé (« %E0% ») : decodeURIComponent levait, et la
//     requête échouait sans réponse au lieu d'un refus franc ;
//   · 404 — hors de dist/ (anti-traversée, G-42 : les « ../ » percent-encodés
//     survivent à la normalisation d'URL puis reviennent au décodage), absent, ou
//     DOSSIER : existsSync le disait présent et net.fetch servait un dossier.
function resolveAppRequest(distRoot, requestUrl) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(requestUrl).pathname);
  } catch {
    return { status: 400 };
  }
  if (pathname === "/" || pathname === "") pathname = "/index.html";
  const filePath = path.resolve(distRoot, "." + pathname);
  if (filePath !== distRoot && !filePath.startsWith(distRoot + path.sep)) return { status: 404 };
  let st;
  try {
    st = fs.statSync(filePath);
  } catch {
    return { status: 404 };
  }
  if (!st.isFile()) return { status: 404 };
  return { status: 200, filePath, size: st.size };
}

// En-tête Range d'une requête (les <audio> en demandent pour lire la fin d'un
// .ogg, connaître sa durée et revenir au début en boucle) sur un fichier de
// `size` octets : { start, end } inclusifs, { unsatisfiable: true } (416), ou null
// (absent, ou forme non gérée comme les plages multiples : fichier entier). Sans
// réponse 206, Chromium jouait la musique comme un direct sans fin — durée
// infinie, rien de « seekable », boucle à la merci du lecteur (ELEC-5).
function parseByteRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(header || "").trim());
  if (!m || (m[1] === "" && m[2] === "")) return null;
  let start;
  let end;
  if (m[1] === "") { // « bytes=-500 » : les 500 derniers octets
    const suffix = Number(m[2]);
    if (!suffix) return { unsatisfiable: true };
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (!(start < size) || start > end) return { unsatisfiable: true };
  return { start, end };
}

// CONTENT-SECURITY-POLICY de la page du .exe (ELEC-4), posée en en-tête par le
// protocole app:// — pas en <meta> dans index.html : le serveur de dev de Vite
// injecte un script en ligne (rechargement à chaud de React) qu'elle bloquerait.
// Tout est local : aucun script en ligne ni eval dans dist/, d'où script-src 'self'.
//   · data: en image ET en police — les toDataURL posés en fond CSS (plaisirsMaterial,
//     chipsArt, SlotsStage, sapRenderer) et les petites polices que Vite inline en
//     base64 dans le CSS (sans font-src data:, des glyphes tomberaient) ;
//   · blob: — l'export du navigateur (saveSlots.js) et les images de canvas ;
//   · style-src 'unsafe-inline' — les attributs style de React.
const APP_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "media-src 'self' data: blob:",
  "connect-src 'self' data: blob:",
  "object-src 'none'",
  "base-uri 'self'",
].join("; ");

function readDriveCache(cacheFile) {
  try {
    const root = JSON.parse(fs.readFileSync(cacheFile, "utf8")).root;
    return typeof root === "string" && root ? root : null;
  } catch {
    return null;
  }
}

function writeDriveCache(cacheFile, root) {
  try {
    fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
    fs.writeFileSync(cacheFile, JSON.stringify({ root }), "utf8");
  } catch { /* pas de mémoire : on cherchera de nouveau au prochain lancement */ }
}

// Racine Drive, ou null. Le chemin retenu au lancement précédent d'abord ; sinon
// toutes les pistes à la fois, et la PREMIÈRE trouvée dans l'ordre de priorité
// (lecteur virtuel avant dossiers du profil, comme avant).
async function detectGoogleDriveRoot({ cacheFile, candidates = driveCandidates(), probe = probeDir, timeoutMs = DRIVE_PROBE_TIMEOUT_MS, cachedTimeoutMs = DRIVE_CACHED_TIMEOUT_MS } = {}) {
  const cached = cacheFile ? readDriveCache(cacheFile) : null;
  if (cached && await probe(cached, cachedTimeoutMs)) return cached;
  const found = await Promise.all(candidates.map((p) => probe(p, timeoutMs).catch(() => false)));
  const root = candidates[found.indexOf(true)] || null;
  if (root && cacheFile && root !== cached) writeDriveCache(cacheFile, root);
  return root;
}

// ── ÉTAT DE LA FENÊTRE (audit 2026-10-05, ELEC-2) ─────────────────────────────
// Position, taille, agrandie, plein écran : relus au lancement depuis
// userData/window.json, écrits à la fermeture. null = premier lancement.
function readWindowState(file) {
  try {
    const st = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!st || typeof st !== "object") return null;
    const b = st.bounds;
    const bounds = b && [b.x, b.y, b.width, b.height].every(Number.isFinite) ? { x: b.x, y: b.y, width: b.width, height: b.height } : null;
    return { bounds, maximized: st.maximized === true, fullscreen: st.fullscreen === true };
  } catch {
    return null;
  }
}

function writeWindowState(file, st) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(st), "utf8");
  } catch { /* la fenêtre rouvrira à sa taille par défaut */ }
}

// Ramène des bounds mémorisés sur un écran BRANCHÉ (`workAreas` : zones de travail
// des écrans, screen.getAllDisplays()). Écran débranché, résolution changée : une
// fenêtre qui ne recoupe plus aucun écran sur au moins 64×64 px est abandonnée
// (null : position par défaut) ; trop grande, elle est rognée à son écran.
function fitWindowBounds(bounds, workAreas) {
  if (!bounds || !Array.isArray(workAreas) || !workAreas.length) return null;
  let best = null;
  let bestArea = 0;
  for (const wa of workAreas) {
    const w = Math.min(bounds.x + bounds.width, wa.x + wa.width) - Math.max(bounds.x, wa.x);
    const h = Math.min(bounds.y + bounds.height, wa.y + wa.height) - Math.max(bounds.y, wa.y);
    if (w >= 64 && h >= 64 && w * h > bestArea) { best = wa; bestArea = w * h; }
  }
  if (!best) return null;
  const width = Math.min(Math.round(bounds.width), best.width);
  const height = Math.min(Math.round(bounds.height), best.height);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  return {
    x: clamp(Math.round(bounds.x), best.x, best.x + best.width - width),
    y: clamp(Math.round(bounds.y), best.y, best.y + best.height - height),
    width,
    height,
  };
}

// ── SUCCÈS STEAM (audit 2026-10-05, STEAM-9) ──────────────────────────────────
// Pont OPTIONNEL vers Steamworks : steamworks.js n'est PAS une dépendance du jeu.
// Sans le module, sans App ID ou sans client Steam lancé, rien ne casse : les succès
// vivent dans la save (src/game/core/achievements.js), qui les renvoie tous à chaque
// lancement. Mode d'emploi : docs/STEAM-SUCCES.md.
const STEAM_APP_ID_RE = /^[1-9][0-9]{0,9}$/;
// Même forme que data/achievements.js (ACHIEVEMENT_ID_RE) : le nom d'API Steam.
const STEAM_ACHIEVEMENT_ID_RE = /^[A-Z][A-Z0-9_]{0,63}$/;
const STEAM_ACHIEVEMENTS_MAX = 256;

// App ID : `constant` (main.cjs, à remplir quand Valve l'aura attribué), sinon
// SteamAppId posé par le client Steam, sinon le premier steam_appid.txt lisible dans
// `dirs` (développement seulement : ce fichier ne se livre pas). null = pas de pont.
function resolveSteamAppId({ constant = "", env = process.env, dirs = [] } = {}) {
  const pick = (value) => {
    const text = String(value == null ? "" : value).trim();
    return STEAM_APP_ID_RE.test(text) ? Number(text) : null;
  };
  const fromConstant = pick(constant);
  if (fromConstant) return fromConstant;
  const fromEnv = pick(env && env.SteamAppId);
  if (fromEnv) return fromEnv;
  for (const dir of dirs) {
    if (!dir) continue;
    try {
      const fromFile = pick(fs.readFileSync(path.join(dir, "steam_appid.txt"), "utf8"));
      if (fromFile) return fromFile;
    } catch { /* pas de fichier ici */ }
  }
  return null;
}

// Les noms reçus de la page : chaînes au format d'API, sans doublon, bornées.
function sanitizeAchievementIds(ids) {
  if (!Array.isArray(ids)) return [];
  const out = [];
  for (const id of ids) {
    if (typeof id !== "string" || !STEAM_ACHIEVEMENT_ID_RE.test(id) || out.includes(id)) continue;
    out.push(id);
    if (out.length >= STEAM_ACHIEVEMENTS_MAX) break;
  }
  return out;
}

// Le pont. `load` rend le module steamworks.js (un require gardé par l'appelant),
// `log` écrit au journal. Steamworks s'initialise UNE fois, au premier start() ou
// unlock() ; un échec (module absent, Steam fermé, App ID refusé) est noté et le
// pont reste éteint pour la session. unlock() n'active que les succès qui manquent
// et rend leur nombre ; un nom inconnu de Steamworks est noté une seule fois.
function createSteamAchievements({ appId = null, load = null, log = () => {} } = {}) {
  let client = null;
  let tried = false;
  const reported = new Set();
  // Le journal du .exe (texte de support, jamais montré au joueur).
  const journal = (line) => { try { log(line); } catch { /* journal indisponible */ } };
  const start = () => {
    if (tried) return client;
    tried = true;
    if (!appId || typeof load !== "function") return null;
    try {
      const steamworks = load();
      const api = steamworks && typeof steamworks.init === "function" ? steamworks.init(appId) : null;
      client = api && api.achievement && typeof api.achievement.activate === "function" ? api : null;
      journal(client ? `[steam] Steamworks prêt (App ID ${appId})` : "[steam] steamworks.js sans API de succès : pont éteint");
    } catch (e) {
      client = null;
      journal(`[steam] Steamworks indisponible, succès gardés dans la save : ${e && e.message ? e.message : e}`);
    }
    return client;
  };
  const unlock = (ids) => {
    const list = sanitizeAchievementIds(ids);
    if (!list.length) return 0;
    const api = start();
    if (!api) return 0;
    let done = 0;
    for (const id of list) {
      try {
        if (typeof api.achievement.isActivated === "function" && api.achievement.isActivated(id)) continue;
        if (api.achievement.activate(id)) done += 1;
        else if (!reported.has(id)) { reported.add(id); journal(`[steam] succès refusé par Steamworks (nom d'API inconnu ?) : ${id}`); }
      } catch (e) {
        if (!reported.has(id)) { reported.add(id); journal(`[steam] succès ${id} : ${e && e.message ? e.message : e}`); }
      }
    }
    return done;
  };
  return { start, unlock, isReady: () => Boolean(client) };
}

module.exports = {
  saveFilePaths,
  createSaveStore,
  createCloudStore,
  CLOUD_DIR_NAME,
  safeExportName,
  exportTarget,
  resolveAppRequest,
  parseByteRange,
  APP_CSP,
  isSteamVersion,
  driveCandidates,
  probeDir,
  detectGoogleDriveRoot,
  readWindowState,
  writeWindowState,
  fitWindowBounds,
  DRIVE_PROBE_TIMEOUT_MS,
  resolveSteamAppId,
  sanitizeAchievementIds,
  createSteamAchievements,
};
