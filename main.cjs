const { app, BrowserWindow, Menu, dialog, ipcMain, protocol, net, screen, session } = require("electron");
const path = require("path");
const fs = require("fs");
const { pathToFileURL } = require("url");
const {
  createSaveStore, createCloudStore, detectGoogleDriveRoot, safeExportName, exportTarget,
  resolveAppRequest, parseByteRange, APP_CSP, readWindowState, writeWindowState, fitWindowBounds,
} = require("./desktopFiles.cjs");

// Nom affiché dans les fenêtres du système (questions, erreurs). ⚠ Le nom définitif
// du produit reste à trancher (audit 2026-10-05, STEAM-10 : « Civilisation Idle »
// ici et dans build.productName, « Civilisation: Effondrement Idle » dans le
// <title>) : une seule ligne à changer ici. Il ne commande RIEN d'autre — ni le
// dossier de la save (USER_DATA_DIR) ni celui du nuage (CLOUD_DIR_NAME,
// desktopFiles.cjs), figés à part.
const APP_TITLE = "Civilisation Idle";

// DOSSIER DE LA SAVE, FIGÉ (audit 2026-10-05, STEAM-4) — AVANT tout le reste : le
// verrou d'instance unique, le journal, le localStorage (la partie) et la save en
// fichier en dépendent. Electron le déduisait EN SILENCE du « name » de
// package.json (electron-builder n'injecte pas build.productName dans le paquet) :
// renommer « name », ajouter un productName au premier niveau ou un app.setName()
// aurait ouvert un dossier vide — toutes les parties existantes envolées en
// apparence. ⚠ « civilisation-effondrement » est le dossier où vivent AUJOURD'HUI
// les saves (dev et .exe confondus) : ne JAMAIS le changer (surtout pas en
// « Civilisation Idle »).
// CE_USER_DATA (tests seulement) : un autre dossier, pour lancer le jeu sans
// jamais toucher la vraie partie (%APPDATA%\civilisation-effondrement).
const USER_DATA_DIR = process.env.CE_USER_DATA
  ? path.resolve(process.env.CE_USER_DATA)
  : path.join(app.getPath("appData"), "civilisation-effondrement");
app.setPath("userData", USER_DATA_DIR);

// .exe empaqueté = la version des joueurs (ELEC-1) : ni menu Electron, ni
// DevTools, ni rechargement, ni zoom de page. `npm run electron` (non empaqueté)
// garde tout. CIV_DEVTOOLS=1 ou --devtools rouvre les DevTools dans l'.exe (mesures
// de perf, docs/PERF-CARTE-REPRISE.md).
const isPackaged = app.isPackaged;
const devToolsAllowed = !isPackaged || process.env.CIV_DEVTOOLS === "1" || process.argv.includes("--devtools");

// Autorise la musique de fond à démarrer sans clic préalable de l'utilisateur.
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

// OVERLAY STEAM (audit 2026-10-05, STEAM-9) — SEULEMENT lancé par le client Steam,
// qui pose SteamAppId / SteamGameId dans l'environnement du jeu : ailleurs (.exe
// hors Steam, `npm run electron`) rien ne change. L'overlay (Maj+Tab) s'accroche au
// processus qui présente les images ; dans un Electron multi-processus il ne
// s'affiche pas, ou fait clignoter / noircir l'écran. Les deux drapeaux sont ceux
// de steamworks.js (electronEnableSteamOverlay) : GPU dans le processus principal,
// sans DirectComposition. Leur coût est à MESURER sur la branche privée Steam ;
// `--no-steam-overlay` (options de lancement Steam) les retire pour l'A/B.
const launchedBySteam = Boolean(process.env.SteamAppId || process.env.SteamGameId);
const steamOverlayFlags = launchedBySteam && !process.argv.includes("--no-steam-overlay");
if (steamOverlayFlags) {
  app.commandLine.appendSwitch("in-process-gpu");
  app.commandLine.appendSwitch("disable-direct-composition");
}

// Une seule instance à la fois : deux fenêtres partageraient le même userData
// (la save vit dans localStorage — verrou LevelDB exclusif) et se disputeraient
// l'écriture. Au mieux la session la plus avancée est perdue (dernier fermé
// gagne), au pire le stockage se corrompt. Si le verrou est refusé, une instance
// tourne déjà : on la ramène au premier plan et on rend la main.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}
app.on("second-instance", () => {
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    if (win.isMinimized()) win.restore();
    if (!win.isVisible()) win.show(); // encore cachée (premier rendu en attente)
    win.focus();
  }
});

// On sert le jeu via un protocole interne « app:// » (comme un serveur web local)
// au lieu de file://. C'EST INDISPENSABLE : les sprites pixel-art sont chargés
// avec des chemins absolus ('/pixelart/...') et le terrain fait un fetch() de JSON.
// En file:// ces deux mécanismes échouent (racine disque + fetch local interdit),
// les images ne se chargent pas et le jeu retombe sur l'ancien rendu procédural.
// En app:// tout fonctionne exactement comme dans `npm run dev`.
// Privilèges (ELEC-5) : `stream` pour la musique (<audio> en boucle sur app://, ce
// que la doc d'Electron demande pour les médias d'un protocole maison — sans lui,
// la piste ne se chargeait pas du tout : erreur média 4, mesuré le 2026-10-05) ;
// `codeCache` pour le cache V8 — sans lui, ~2 Mo de JS recompilés à chaque lancement.
// ⚠ JAMAIS allowServiceWorkers : le cache du service worker se superposerait à
// l'.exe (src/main.jsx l'exclut aussi, ELEC-7).
protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, codeCache: true },
  },
]);

// JOURNAL D'ERREURS (audit 2026-10-05, BUG-18) : userData/logs/civilisation.log.
// Sans lui, un plantage du moteur de rendu laissait une fenêtre blanche sans
// aucune trace pour le support. Bascule en .old au-delà de 1 Mo ; une même
// ligne répétée en rafale (erreur rejouée à chaque image) n'est écrite qu'une
// fois, avec son compte.
const LOG_MAX_BYTES = 1024 * 1024;
let logFile = null;
let lastLogLine = "";
let lastLogRepeats = 0;
function journal(line) {
  try {
    if (line === lastLogLine) {
      lastLogRepeats += 1;
      return;
    }
    if (!logFile) {
      const dir = path.join(app.getPath("userData"), "logs");
      fs.mkdirSync(dir, { recursive: true });
      logFile = path.join(dir, "civilisation.log");
    }
    try {
      if (fs.statSync(logFile).size > LOG_MAX_BYTES) fs.renameSync(logFile, logFile + ".old");
    } catch { /* pas encore de journal */ }
    const repeats = lastLogRepeats ? `  (ligne précédente répétée ${lastLogRepeats} fois)\n` : "";
    lastLogLine = line;
    lastLogRepeats = 0;
    fs.appendFileSync(logFile, `${repeats}[${new Date().toISOString()}] ${line}\n`, "utf8");
  } catch { /* disque plein, droits : le jeu continue sans journal */ }
}

// ── CANAUX DU PRÉLOAD : save en fichier, nuage, export, plein écran ──────────
// Seule la page du jeu (app://) y a droit — ni une page tierce, ni un cadre :
// window.open et les navigations hors app:// sont déjà refusés (G-42), c'est la
// ceinture en plus des bretelles.
function fromGame(event) {
  const url = (event && event.senderFrame && event.senderFrame.url)
    || (event && event.sender && typeof event.sender.getURL === "function" ? event.sender.getURL() : "");
  return typeof url === "string" && url.startsWith("app://");
}

// Langue du jeu (réglage « civ-opt-lang », que i18n.js écrit dès le premier
// lancement — langue du système pour un joueur neuf ; français à défaut),
// relevée à chaque chargement de page (watchRenderer) : celle des fenêtres du
// système que le jeu ouvre (dialogue d'export, questions du moteur de rendu).
let pageLang = "fr";

// SAVE EN FICHIER (STEAM-4) : userData/saves/save.json, ce que Steam Auto-Cloud
// synchronise (réglages dans desktopFiles.cjs). Le jeu la relit au lancement AVANT
// le localStorage et l'y recopie si elle est plus avancée (src/game/core/fileSave.js),
// puis la réécrit à chaque sauvegarde. Lecture et effacement SYNCHRONES (le jeu
// arbitre avant de charger la partie) ; écriture asynchrone, sauf à la fermeture.
const saveStore = createSaveStore(USER_DATA_DIR);
let saveWriteFailed = false;
function writeSave(text) {
  const ok = saveStore.write(text);
  // Une ligne au journal par passage de « ça marche » à « ça échoue », pas une
  // toutes les 10 s.
  if (!ok && !saveWriteFailed) journal(`[save] écriture impossible : ${saveStore.file}`);
  saveWriteFailed = !ok;
  return ok;
}
ipcMain.on("save:read", (event) => {
  event.returnValue = fromGame(event) ? saveStore.read() : { status: "error", text: null };
});
ipcMain.on("save:write", (event, text) => {
  if (fromGame(event)) writeSave(text);
});
ipcMain.on("save:write-sync", (event, text) => {
  event.returnValue = fromGame(event) ? writeSave(text) : false;
});
ipcMain.on("save:clear", (event) => {
  event.returnValue = fromGame(event) ? saveStore.clear() : false;
});

// GOOGLE DRIVE (ELEC-3) : cherché dès maintenant, en parallèle du démarrage, au
// lieu de geler le préload. Le préload demande le résultat en synchrone : le
// rendu n'attend que si la recherche n'est pas finie (chaque piste est bornée :
// 300 ms, 1,5 s pour le chemin retenu la fois d'avant) ; `event.returnValue` posé
// plus tard débloque la page à ce moment-là.
// Le fichier nuage lui-même est lu et écrit ICI (ELEC-4) : le préload n'a plus fs,
// la page tourne dans le bac à sable (sandbox: true, createWindow). Lecture,
// écriture et effacement restent SYNCHRONES pour la page, comme quand le préload
// les faisait : le jeu arbitre au lancement, et la fermeture écrit sa dernière save.
let cloudStore = createCloudStore(null); // éteint tant que Drive n'est pas trouvé
const driveRootReady = gotSingleInstanceLock
  ? detectGoogleDriveRoot({ cacheFile: path.join(USER_DATA_DIR, "drive.json") }).catch(() => null)
  : Promise.resolve(null); // instance perdante : elle se ferme, rien à chercher
const cloudReady = driveRootReady.then((root) => {
  if (root) cloudStore = createCloudStore(root);
  return cloudStore;
});
// { dir, initial } : le dossier nuage (null = pas de Drive) et le fichier lu AU
// LANCEMENT — le cliché que src/game/core/cloudSave.js arbitre avant state = load().
ipcMain.on("cloud:init", (event) => {
  if (!fromGame(event)) { event.returnValue = { dir: null, initial: { status: "off", text: null } }; return; }
  cloudReady.then((store) => { event.returnValue = { dir: store.dir, initial: store.read() }; });
});
ipcMain.on("cloud:read", (event) => {
  event.returnValue = fromGame(event) ? cloudStore.read() : { status: "error", text: null };
});
ipcMain.on("cloud:write", (event, text) => {
  event.returnValue = fromGame(event) ? cloudStore.write(text) : false;
});
ipcMain.on("cloud:clear", (event) => {
  event.returnValue = fromGame(event) ? cloudStore.clear() : false;
});

// EXPORT VERS UN FICHIER (SAV-14, ELEC-4) : le dialogue d'enregistrement natif,
// ouvert sur les Documents de Windows (app.getPath : le vrai dossier, celui que
// OneDrive déplace), seulement .txt ou .json. Le préload écrivait dans
// ~/Documents en dur, sans rien demander. Rend { ok, path } ou { ok: false,
// canceled? } — un dialogue fermé n'est pas une erreur, le jeu se tait.
ipcMain.handle("file:save-as", async (event, text, filename) => {
  if (!fromGame(event) || typeof text !== "string" || !text) return { ok: false };
  try {
    const name = safeExportName(filename);
    const ext = path.extname(name).slice(1);
    const win = BrowserWindow.fromWebContents(event.sender);
    const say = (fr, en) => (pageLang === "en" ? en : fr);
    const options = {
      title: say("Exporter la sauvegarde", "Export the save"),
      defaultPath: path.join(app.getPath("documents"), name),
      filters: [{ name: say("Sauvegarde", "Save"), extensions: [ext] }],
    };
    const { canceled, filePath } = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options);
    if (canceled || !filePath) return { ok: false, canceled: true };
    const target = exportTarget(filePath, name);
    await fs.promises.writeFile(target, text, "utf8");
    return { ok: true, path: target };
  } catch (e) {
    journal(`[export] écriture impossible : ${e?.message || e}`);
    return { ok: false };
  }
});

// PLEIN ÉCRAN (ELEC-2) : l'interrupteur des Options. F11 et Alt+Entrée passent
// par before-input-event (createWindow).
ipcMain.on("window:get-fullscreen", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  event.returnValue = Boolean(win && !win.isDestroyed() && win.isFullScreen());
});
ipcMain.on("window:set-fullscreen", (event, on) => {
  if (!fromGame(event)) return;
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win && !win.isDestroyed()) win.setFullScreen(Boolean(on));
});

// Garde-fous du moteur de rendu (BUG-18). Rien n'y ferme la fenêtre d'office :
// la partie vit dans le localStorage, l'autosave la garde à 10 s près.
function watchRenderer(win) {
  const contents = win.webContents;
  // Erreurs de la page (console.error, exceptions non rattrapées, frontières
  // d'erreur React) : recopiées dans le journal. Electron 42 passe le détail dans
  // l'évènement lui-même (les arguments positionnels sont dépréciés).
  contents.on("console-message", (event) => {
    if (event?.level !== "error") return;
    const source = event.sourceId ? ` (${event.sourceId}:${event.lineNumber})` : "";
    journal(`[page] ${String(event.message).slice(0, 2000)}${source}`);
  });
  contents.on("preload-error", (_event, preloadPath, error) => {
    journal(`[préload] ${preloadPath} : ${error?.stack || error}`);
  });
  contents.on("did-fail-load", (_event, code, description, url, isMainFrame) => {
    if (isMainFrame) journal(`[chargement] ${url} : ${description} (${code})`);
  });

  // Langue des questions ci-dessous : celle du jeu (réglage « civ-opt-lang »,
  // écrit par i18n.js ; français à défaut), relevée à chaque chargement de page — au
  // moment de demander, la page figée ou disparue ne peut plus répondre.
  let lang = "fr";
  const say = (fr, en) => (lang === "en" ? en : fr);
  contents.on("did-finish-load", () => {
    if (typeof contents.executeJavaScript !== "function") return;
    contents.executeJavaScript('localStorage.getItem("civ-opt-lang")')
      .then((value) => { lang = value === "en" ? "en" : "fr"; pageLang = lang; })
      .catch(() => { /* page déjà repartie : on garde la langue connue */ });
  });

  // Moteur de rendu disparu (plantage, mémoire, tué par le système) : on le note
  // et on RECHARGE — la partie repart de la dernière sauvegarde au lieu d'une
  // fenêtre blanche définitive. Trois chutes en une minute : on cesse de boucler
  // et on demande.
  const goneAt = [];
  contents.on("render-process-gone", (_event, details) => {
    journal(`[rendu] moteur de rendu disparu : ${details?.reason} (code ${details?.exitCode})`);
    if (details?.reason === "clean-exit" || win.isDestroyed()) return;
    const now = Date.now();
    while (goneAt.length && now - goneAt[0] > 60000) goneAt.shift();
    goneAt.push(now);
    if (goneAt.length < 3) {
      contents.reload();
      return;
    }
    dialog.showMessageBox(win, {
      type: "error",
      title: APP_TITLE,
      message: say("Le jeu s'est arrêté plusieurs fois de suite.", "The game stopped several times in a row."),
      detail: logFile ? say(`Journal : ${logFile}`, `Log: ${logFile}`) : undefined,
      buttons: [say("Recharger", "Reload"), say("Fermer", "Close")],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    }).then(({ response }) => {
      if (win.isDestroyed()) return;
      if (response === 1) win.close();
      else { goneAt.length = 0; contents.reload(); }
    }).catch(() => {});
  });

  // Page figée : on DEMANDE au lieu de tuer — le rendu reprend souvent seul, et
  // la question se referme alors d'elle-même ('responsive').
  let unresponsiveAsk = null;
  win.on("unresponsive", () => {
    journal("[rendu] la page ne répond plus");
    if (unresponsiveAsk || win.isDestroyed()) return;
    unresponsiveAsk = new AbortController();
    dialog.showMessageBox(win, {
      type: "warning",
      title: APP_TITLE,
      message: say("Le jeu ne répond plus.", "The game is not responding."),
      buttons: [say("Attendre", "Wait"), say("Recharger", "Reload")],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
      signal: unresponsiveAsk.signal,
    }).then(({ response }) => {
      unresponsiveAsk = null;
      if (response === 1 && !win.isDestroyed()) contents.reload();
    }).catch(() => { unresponsiveAsk = null; });
  });
  win.on("responsive", () => {
    journal("[rendu] la page répond de nouveau");
    unresponsiveAsk?.abort();
  });
}

// FENÊTRE DE JEU (audit 2026-10-05, ELEC-2). Avant : 1600×900 fixe à chaque
// lancement (plus grand qu'un portable 1366×768), réductible à 200 px de large,
// blanche le temps de parser le JS, sans plein écran. Désormais : position, taille,
// agrandie et plein écran retrouvés (userData/window.json), agrandie au tout
// premier lancement, fond sombre du jeu, montrée au premier rendu.
const WINDOW_STATE_FILE = path.join(USER_DATA_DIR, "window.json");
const WINDOW_DEFAULT_SIZE = { width: 1600, height: 900 };
const WINDOW_MIN_SIZE = { width: 1024, height: 640 };
const WINDOW_BACKGROUND = "#0E1320"; // fond du jeu (theme-color d'index.html)

function createWindow() {
  const saved = readWindowState(WINDOW_STATE_FILE);
  const primary = screen.getPrimaryDisplay().workArea;
  // Bounds mémorisés, s'ils tombent encore sur un écran branché.
  const bounds = fitWindowBounds(saved && saved.bounds, screen.getAllDisplays().map((d) => d.workArea));
  const win = new BrowserWindow({
    ...(bounds || {
      width: Math.min(WINDOW_DEFAULT_SIZE.width, primary.width),
      height: Math.min(WINDOW_DEFAULT_SIZE.height, primary.height),
    }),
    // Plancher de l'interface, jamais plus grand que l'écran lui-même.
    minWidth: Math.min(WINDOW_MIN_SIZE.width, primary.width),
    minHeight: Math.min(WINDOW_MIN_SIZE.height, primary.height),
    backgroundColor: WINDOW_BACKGROUND,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      // Bac à sable de l'OS (ELEC-4). Il était coupé pour que le préload lise et
      // écrive le fichier nuage avec fs : tout ce qui touche au disque passe
      // désormais par le process principal (canaux IPC plus haut), le préload ne
      // garde que contextBridge et ipcRenderer.
      sandbox: true,
      devTools: devToolsAllowed,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  // Montrée au PREMIER RENDU (plus de flash blanc), dans l'état retrouvé. Filet :
  // une page qui ne peint jamais ne doit pas laisser un jeu invisible.
  let revealed = false;
  const reveal = () => {
    if (revealed || win.isDestroyed()) return;
    revealed = true;
    clearTimeout(revealTimer);
    if (!saved || saved.maximized) win.maximize(); // tout premier lancement : agrandie
    win.show();
    if (saved && saved.fullscreen) win.setFullScreen(true);
  };
  const revealTimer = setTimeout(reveal, 10000);
  revealTimer.unref?.();
  win.once("ready-to-show", reveal);

  // Mémorisée à la fermeture : bounds « normaux » (hors agrandie / plein écran).
  win.on("close", () => {
    writeWindowState(WINDOW_STATE_FILE, {
      bounds: win.getNormalBounds(),
      maximized: win.isMaximized(),
      fullscreen: win.isFullScreen(),
    });
  });
  // L'interrupteur des Options suit F11 / Alt+Entrée.
  const tellFullScreen = () => {
    if (!win.isDestroyed()) win.webContents.send("window:fullscreen", win.isFullScreen());
  };
  win.on("enter-full-screen", tellFullScreen);
  win.on("leave-full-screen", tellFullScreen);

  const contents = win.webContents;
  // Clavier avant la page et le menu (ELEC-1, ELEC-2).
  contents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;
    const key = String(input.key || "");
    // Plein écran : F11, ou Alt+Entrée (le réflexe des jeux PC).
    if (key === "F11" || (input.alt && key === "Enter")) {
      event.preventDefault();
      if (!input.isAutoRepeat) win.setFullScreen(!win.isFullScreen());
      return;
    }
    if (!isPackaged) return; // dev : le menu par défaut garde ses raccourcis
    const mod = input.control || input.meta;
    // Zoom de page (Ctrl±, Ctrl+0) : il casse la grille de pixels et le sol
    // (BUG-21). Le menu retiré n'en porte plus les raccourcis ; on ferme aussi
    // la porte au clavier.
    if (mod && ["+", "=", "-", "_", "0"].includes(key)) {
      event.preventDefault();
      return;
    }
    // DevTools : seulement si autorisés (CIV_DEVTOOLS=1, --devtools).
    if (devToolsAllowed && (key === "F12" || (mod && input.shift && key.toLowerCase() === "i"))) {
      event.preventDefault();
      contents.toggleDevTools();
    }
  });
  // Pas de zoom au pincement (pavé ou écran tactile) : c'est déjà le défaut
  // d'Electron, on le fige explicitement. Ctrl+molette ne zoome pas dans Electron
  // (il émet seulement `zoom-changed`, que personne n'écoute).
  Promise.resolve(contents.setVisualZoomLevelLimits(1, 1)).catch(() => {});

  watchRenderer(win);
  // ⚠ Hôte « localhost » = origine du localStorage = LA SAVE de travail. Ne
  // jamais le changer (ni le schéma app://) : la partie disparaîtrait en apparence.
  win.loadURL("app://localhost/");

  // Durcissement (audit G-42) : le jeu est mono-page et local → on refuse toute
  // fenêtre externe (window.open) et toute navigation hors du protocole app://.
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith("app://")) event.preventDefault();
  });
}

app.whenReady().then(() => {
  // Instance perdante (verrou refusé) : app.quit() est déjà en cours, ne rien monter.
  if (!gotSingleInstanceLock) return;
  // .exe : aucun menu (ELEC-1). Celui d'Electron, masqué mais vivant, gardait ses
  // raccourcis — DevTools (Ctrl+Maj+I), rechargement (Ctrl+R), fermeture sans
  // prévenir (Ctrl+W), zoom de page (Ctrl±) — et sa barre anglaise « File Edit
  // View » surgissait sur Alt. Sous Windows, copier/coller dans les champs ne
  // dépend pas du menu.
  if (isPackaged) Menu.setApplicationMenu(null);
  if (launchedBySteam) journal(`[steam] lancé par Steam, drapeaux d'overlay ${steamOverlayFlags ? "posés" : "retirés (--no-steam-overlay)"}`);
  // Permissions du navigateur (ELEC-4) : aucune, sauf écrire dans le presse-papiers
  // (« Exporter » y copie la sauvegarde). Le jeu ne demande ni caméra, ni micro, ni
  // notifications système, ni position : tout autre demande est refusée sans
  // question au lieu de suivre le défaut d'Electron, qui accorde tout.
  const ALLOWED_PERMISSIONS = new Set(["clipboard-sanitized-write"]);
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => {
    const url = String((details && details.requestingUrl) || (contents && contents.getURL && contents.getURL()) || "");
    callback(ALLOWED_PERMISSIONS.has(permission) && url.startsWith("app://"));
  });
  const distRoot = path.join(__dirname, "dist");
  // app://localhost/<chemin>  ->  dist/<chemin>  (index.html par défaut) ; refus,
  // anti-traversée et dossiers : resolveAppRequest (desktopFiles.cjs, ELEC-5).
  protocol.handle("app", async (request) => {
    const target = resolveAppRequest(distRoot, request.url);
    if (target.status === 400) return new Response("Bad request", { status: 400 });
    // Fichier absent : net.fetch sur un file:// inexistant REJETTE, et la
    // fenêtre restait blanche sans un mot. Un 404 franc laisse la page vivre
    // et l'absence se lit dans la console au lieu d'être avalée.
    if (target.status !== 200) return new Response("Not found", { status: 404 });
    // Plages d'octets (ELEC-5) : net.fetch(file://) tronque bien le corps selon
    // l'en-tête Range, mais répond 200 sans Content-Range ni taille — la musique
    // passait pour un direct sans fin. Sans le privilège `stream`, elle ne se
    // chargeait même pas (erreur média 4, mesuré dans l'.exe le 2026-10-05).
    const range = parseByteRange(request.headers.get("range"), target.size);
    if (range && range.unsatisfiable) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${target.size}` } });
    }
    const fileUrl = pathToFileURL(target.filePath).toString();
    const response = await net.fetch(fileUrl, range ? { headers: { Range: `bytes=${range.start}-${range.end}` } } : undefined);
    const headers = new Headers(response.headers);
    headers.set("Accept-Ranges", "bytes");
    if (range) {
      headers.set("Content-Range", `bytes ${range.start}-${range.end}/${target.size}`);
      headers.set("Content-Length", String(range.end - range.start + 1));
      return new Response(response.body, { status: 206, headers });
    }
    headers.set("Content-Length", String(target.size));
    // La page elle-même porte sa Content-Security-Policy (ELEC-4, APP_CSP).
    if (path.extname(target.filePath).toLowerCase() === ".html") headers.set("Content-Security-Policy", APP_CSP);
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  });

  // dist/ pas construit : sans ce contrôle, la fenêtre s'ouvrait blanche et
  // muette (le 404 ci-dessus ne dit rien à qui n'ouvre pas les DevTools).
  if (!fs.existsSync(path.join(distRoot, "index.html"))) {
    dialog.showErrorBox(
      `${APP_TITLE} — fichiers manquants`,
      "dist/index.html est introuvable. Lancer `npm run build` d'abord, puis relancer le jeu."
    );
    app.quit();
    return;
  }

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Processus annexes (GPU, réseau, utilitaires) : un GPU qui tombe fait clignoter
// ou figer la carte sans rien dire — au moins une ligne au journal (BUG-18).
app.on("child-process-gone", (_event, details) => {
  journal(`[processus] ${details?.type} disparu : ${details?.reason} (code ${details?.exitCode})`);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
