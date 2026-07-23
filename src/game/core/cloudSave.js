// ── Sauvegarde nuage (.exe + Google Drive) ───────────────────────────────────
// Le préload Electron (preload.cjs) expose window.civCloud : le contenu du
// fichier nuage lu AU LANCEMENT (synchrone) et write()/clear(). Dans le
// navigateur (dev, version web), civCloud n'existe pas → tout ici est neutre.
//
// Règle d'arbitrage : LA PARTIE LA PLUS AVANCÉE GAGNE. Le juge est l'horloge à
// vie chronicleStats.lifetimePlaySec (éternelle : elle survit au Grand Reset et
// ne peut que croître) ; à égalité, le save le plus récent (lastTick, horodaté
// par save()). On ne compare PAS les timestamps seuls : un poste resté hors
// ligne avec une vieille partie mais ouvert en dernier écraserait des heures de
// progression — l'horloge à vie, elle, ne ment jamais.
//
// ⚠ ORDRE D'IMPORT : l'arbitrage remplace la save localStorage AVANT que
// state.js ne la lise (`state = load()` court à l'IMPORT de state.js). Ce
// module doit donc être importé EN PREMIER dans src/main.jsx, et ne doit
// jamais importer state.js (ce qui déclencherait ce chargement trop tôt) —
// d'où saveKey.js.
import { SAVE_KEY, CURRENT_SAVE_VERSION, consumePendingWipe } from './saveKey.js';

const cc = () => (typeof window !== 'undefined' && window.civCloud) ? window.civCloud : null;

// Dossier nuage actif, ou null (pas de Google Drive / pas en .exe) — pour l'UI.
export function cloudSaveDir() {
  const c = cc();
  return c && c.dir ? c.dir : null;
}

// État du nuage POUR CETTE SESSION :
//   'off'        — pas de Drive / pas en .exe : rien à faire.
//   'ok'         — contenu du nuage CONNU (lu, ou fichier absent donc vide).
//   'unreadable' — le fichier EXISTE mais n'a pas pu être lu. On ignore ce
//                  qu'il contient → interdiction d'écrire (fail-closed).
//   'newer'      — le nuage vient d'un build PLUS RÉCENT (saveVersion dépasse
//                  CURRENT_SAVE_VERSION) : ni adopté, ni écrasé (fail-closed).
let cloudStatus = 'off';
// Horloge à vie de la partie qu'on SAIT être dans le nuage (-1 = nuage vide).
// Toute écriture doit être au moins aussi avancée, sinon on remplacerait une
// partie plus longue par une plus courte — la perte que l'arbitrage évite.
let cloudBaselineLife = -1;

export function cloudSaveStatus() { return cloudStatus; }

// Résultat de la DERNIÈRE écriture nuage tentée cette session (null = aucune
// encore). L'UI s'en sert : « Active » ne doit pas s'afficher si les écritures
// échouent en silence (dossier en lecture seule, quota Drive plein, verrou).
let lastWriteOk = null;
let lastWriteAt = 0;
export function cloudSyncInfo() { return { ok: lastWriteOk, at: lastWriteAt }; }

// Parse une save sérialisée, ou null. Le BOM UTF-8 (U+FEFF) est retiré : un
// fichier nuage réécrit par un éditeur, un outil de synchro ou un script
// PowerShell en porte un, et JSON.parse le refuse — sans ce strip, une partie
// PARFAITEMENT VALIDE passait pour illisible.
export function parseSave(raw) {
  if (typeof raw !== 'string' || !raw) return null;
  try {
    const s = JSON.parse(raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw);
    return (s && typeof s === 'object') ? s : null;
  } catch { return null; }
}

// Horloge à vie d'une save sérialisée ; -1 si illisible (donc « inconnue »,
// jamais « zéro » : un 0 passerait pour une partie neuve légitime).
function lifeOfRaw(raw) {
  const s = parseSave(raw);
  return s ? (Number(s?.chronicleStats?.lifetimePlaySec) || 0) : -1;
}

// A-t-on le droit d'écraser le fichier nuage ? PURE, exportée pour les tests.
// `force` = geste explicite du joueur (import, reset) : il fait autorité, mais
// ne peut jamais passer outre un nuage illisible.
export function mayOverwriteCloud(status, baselineLife, saveLife, force) {
  if (status !== 'ok') return false;
  if (force) return true;
  return saveLife >= baselineLife;
}

// Quelle save gagne ? 'cloud' ou 'local'. Exportée pure pour les tests.
export function pickMostAdvanced(cloudRaw, localRaw) {
  const cloud = parseSave(cloudRaw);
  if (!cloud) return 'local';
  const local = parseSave(localRaw);
  if (!local) return 'cloud';
  const life = (s) => Number(s?.chronicleStats?.lifetimePlaySec) || 0;
  const tick = (s) => Number(s?.lastTick) || 0;
  if (life(cloud) !== life(local)) return life(cloud) > life(local) ? 'cloud' : 'local';
  return tick(cloud) > tick(local) ? 'cloud' : 'local';
}

// Au lancement : si la save du nuage est plus avancée que la locale, elle la
// remplace dans localStorage — le chargement normal (state.js) fait le reste.
export function reconcileCloudAtBoot() {
  const c = cc();
  if (!c || !c.dir) { cloudStatus = 'off'; return false; }
  const res = (c.initial && typeof c.initial === 'object')
    ? c.initial
    : { status: 'error', text: null }; // forme inattendue : on se méfie
  if (res.status === 'none') { cloudStatus = 'ok'; cloudBaselineLife = -1; return false; }
  if (res.status !== 'ok' || typeof res.text !== 'string' || !res.text) {
    // FAIL-CLOSED : le nuage existe mais son contenu nous échappe. On joue en
    // local sans jamais l'écraser — mieux vaut une session non synchronisée
    // qu'une partie détruite.
    cloudStatus = 'unreadable';
    return false;
  }
  const cloudParsed = parseSave(res.text);
  if (!cloudParsed) {
    // Fichier lu mais illisible EN CONTENU (corrompu, tronqué par une synchro à
    // moitié faite). On ne sait pas ce qu'il vaut → même traitement qu'une
    // lecture ratée : on n'y touche pas.
    cloudStatus = 'unreadable';
    return false;
  }
  if ((Number(cloudParsed.saveVersion) || 0) > CURRENT_SAVE_VERSION) {
    // Nuage écrit par un build PLUS RÉCENT : l'adopter le rétrograderait (migrate
    // jette les champs inconnus puis ré-estampille), et le miroir republierait la
    // version mutilée — perte pour l'autre poste aussi. Fail-closed : local seul,
    // aucune écriture. Options invite à mettre le jeu à jour sur ce poste.
    cloudStatus = 'newer';
    return false;
  }
  cloudStatus = 'ok';
  cloudBaselineLife = Number(cloudParsed?.chronicleStats?.lifetimePlaySec) || 0;
  try {
    const localRaw = localStorage.getItem(SAVE_KEY);
    if (pickMostAdvanced(res.text, localRaw) === 'cloud') {
      // La save locale évincée est ARCHIVÉE avant l'écrasement : si l'arbitrage
      // se trompait, elle reste récupérable (sinon perdue sans trace ni invite).
      if (localRaw) localStorage.setItem(SAVE_KEY + ':pre-cloud', localRaw);
      localStorage.setItem(SAVE_KEY, res.text);
      return true;
    }
  } catch { /* stockage indisponible : on joue en mémoire, comme avant */ }
  return false;
}

// Miroir nuage de la save locale. Throttlé (Drive n'a pas besoin de
// synchroniser toutes les 5 s) ; force:true pour les moments qui ne peuvent
// pas attendre (import manuel, fermeture).
const CLOUD_WRITE_MIN_MS = 30000;
let lastCloudWrite = 0;
let cloudDirty = false;
export function cloudMirrorSave(opts) {
  const c = cc();
  if (!c || !c.dir) return;
  const force = Boolean(opts && opts.force);

  // Nuage illisible au lancement : re-tenter une lecture (Drive a pu revenir en
  // ligne, le placeholder a pu s'hydrater). On n'adopte QUE la référence — pas
  // question de remplacer la save d'une partie EN COURS sous les pieds du
  // joueur ; l'arbitrage complet n'a lieu qu'au lancement.
  if (cloudStatus === 'unreadable') {
    if (typeof c.read !== 'function') return;
    let again;
    try { again = c.read(); } catch { return; }
    if (!again) return;
    if (again.status === 'none') { cloudStatus = 'ok'; cloudBaselineLife = -1; }
    else if (again.status === 'ok' && lifeOfRaw(again.text) >= 0) {
      cloudStatus = 'ok';
      cloudBaselineLife = lifeOfRaw(again.text);
    } else return; // toujours illisible : on n'écrit toujours pas
  }

  const now = Date.now();
  if (!force && now - lastCloudWrite < CLOUD_WRITE_MIN_MS) {
    cloudDirty = true; // rattrapé par le prochain miroir ou le flush de sortie
    return;
  }
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return;
    // GARDE D'ÉCRITURE : le miroir ne doit JAMAIS remplacer une partie plus
    // avancée que la nôtre. Sans elle, l'auto-save des 2 premières secondes
    // (main.js) suffisait à écraser le nuage avec une cité neuve.
    if (!mayOverwriteCloud(cloudStatus, cloudBaselineLife, lifeOfRaw(raw), force)) {
      cloudDirty = false;
      return;
    }
    const wrote = c.write(raw);
    lastWriteOk = wrote;
    lastWriteAt = now;
    if (wrote) {
      lastCloudWrite = now;
      cloudDirty = false;
      cloudBaselineLife = Math.max(cloudBaselineLife, lifeOfRaw(raw));
    }
  } catch { /* le jeu continue en local, le nuage rattrapera */ }
}

// « Recommencer depuis le tout premier feu » : efface aussi le fichier nuage,
// sinon l'ancienne partie (plus avancée) ressusciterait au prochain lancement.
export function cloudWipe() {
  const c = cc();
  if (!c || !c.clear) return;
  try {
    if (c.clear()) {
      // Le fichier n'existe plus : le nuage est vide et CONNU — la partie neuve
      // pourra donc s'y écrire (sans ça, la garde d'écriture la bloquerait).
      cloudStatus = 'ok';
      cloudBaselineLife = -1;
    }
  } catch { /* tant pis */ }
}

// Effacement demandé au clic, exécuté ICI : le joueur a confirmé deux fois, puis
// la page a rechargé (cf. WIPE_KEY dans saveKey.js). On efface la save locale ET
// le fichier nuage, et surtout on n'adopte PAS `c.initial` : ce cliché a été pris
// par le préload AVANT cet effacement, et le `beforeunload` de la page sortante a
// pu réécrire l'ancienne partie dans les deux. L'adopter la ferait ressusciter —
// le geste le plus irréversible du jeu se solderait par « rien n'a changé ».
function applyPendingWipe() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* rien à effacer */ }
  cloudWipe();
  // Nuage vide et CONNU, même sans préload : la partie neuve pourra s'y écrire.
  cloudStatus = 'ok';
  cloudBaselineLife = -1;
}

if (typeof window !== 'undefined') {
  if (consumePendingWipe()) applyPendingWipe();
  else reconcileCloudAtBoot();
  // Fermeture de la fenêtre : pousser la dernière save si un miroir est en
  // attente de throttle. Écriture SYNCHRONE côté préload → fiable à la sortie.
  const flush = () => { if (cloudDirty) cloudMirrorSave({ force: true }); };
  window.addEventListener('pagehide', flush);
  window.addEventListener('beforeunload', flush);
}
