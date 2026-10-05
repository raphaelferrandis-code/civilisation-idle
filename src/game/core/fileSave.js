// ── Sauvegarde canonique en FICHIER (.exe, Steam Cloud) ──────────────────────
// Le préload Electron (preload.cjs) expose window.civSave : lire, écrire, effacer
// userData/saves/save.json, tenu par le process principal (main.cjs et
// desktopFiles.cjs : écriture atomique, copie .bak). C'est CE fichier que Steam
// Auto-Cloud synchronise d'un poste à l'autre (audit 2026-10-05, STEAM-4) : la
// partie ne vivait que dans le localStorage de Chromium, un LevelDB verrouillé et
// multi-fichiers qu'aucune synchro ne sait copier sans l'abîmer.
// Dans le navigateur (dev, version web), civSave n'existe pas → tout ici est neutre.
//
// Le localStorage reste la save de TRAVAIL : load() (state.js) la lit, rien n'y
// change. Le fichier est relu AU LANCEMENT, avant elle, et la remplace s'il porte
// une partie plus avancée (Steam Cloud l'a rapportée d'un autre poste, le LevelDB
// s'est perdu) — mêmes règles que le nuage Drive (cloudSave.js) : l'époque
// d'abord (le geste explicite le plus récent), puis l'horloge à vie. Ensuite
// chaque save() le réécrit, sous la même garde d'écriture.
//
// ⚠ ORDRE D'IMPORT : comme cloudSave.js, ce module doit courir AVANT `state =
// load()`. state.js l'importe (fileMirrorSave) : il est donc évalué avant le corps
// de state.js, et après cloudSave.js qu'il importe — c'est là-bas que
// l'effacement et le chargement en attente sont consommés (bootSaveAction). Ne
// jamais importer state.js d'ici.
import { SAVE_KEY, stripBom, isLocalSaveUnreadable, isFutureSave } from './saveKey.js';
import { parseSave, pickMostAdvanced, mayOverwriteCloud, lifeOf, epochOf, compareEpochs, bootSaveAction } from './cloudSave.js';
import { archiveUnreadableSave, PRE_CLOUD_KEY } from './saveBackups.js';

const cs = () => (typeof window !== 'undefined' && window.civSave) ? window.civSave : null;

// État du fichier POUR CETTE SESSION (mêmes mots que le nuage) :
//   'off'        — pas en .exe : rien à faire ;
//   'ok'         — contenu CONNU (lu, absent, ou abîmé et archivé) ;
//   'unreadable' — le fichier existe mais le disque refuse de le lire : ni adopté
//                  ni écrasé (fail-closed), relu toutes les 5 min ;
//   'newer'      — écrit par un build PLUS RÉCENT (bêta Steam) : ni adopté ni
//                  écrasé, l'adopter le rétrograderait (SAV-6).
let fileStatus = 'off';
// Ce qu'on SAIT être dans le fichier (lu au lancement) : horloge à vie (-1 =
// vide) et époque. La garde d'écriture du nuage (mayOverwriteCloud) juge contre.
let baselineLife = -1;
let baselineEpoch = { id: '', at: 0 };
// La garde a refusé la dernière écriture : le fichier porte une partie plus
// avancée que celle-ci (ou posée par un geste plus récent).
let fileBehind = false;
// Une écriture de CETTE partie est déjà passée : les suivantes passent sans
// re-parser toute la save à chaque autosave — l'époque ne change qu'au
// rechargement, l'horloge à vie ne fait que croître.
let trusted = false;
let lastSent = null;
let lastUnreadableRead = 0;
const FILE_UNREADABLE_RETRY_MS = 5 * 60 * 1000;

export function fileSaveStatus() { return fileStatus; }
export function fileSaveBehind() { return fileBehind; }

function adoptFileContent(raw) {
  const s = raw == null ? null : parseSave(raw);
  baselineLife = lifeOf(s);
  baselineEpoch = epochOf(s);
  fileBehind = false;
}

function readFile(c) {
  try { return c.read(); } catch { return null; }
}

// Statut et référence d'après une lecture { status, text } ; rend le texte s'il
// peut être adopté (lisible, de notre version), sinon null.
function learnFile(res) {
  if (!res || typeof res !== 'object' || res.status === 'error') { fileStatus = 'unreadable'; return null; }
  if (res.status === 'none') { fileStatus = 'ok'; adoptFileContent(null); return null; }
  if (res.status !== 'ok' || typeof res.text !== 'string' || !res.text) { fileStatus = 'unreadable'; return null; }
  const parsed = parseSave(res.text);
  if (!parsed) {
    // Contenu abîmé (ni save.json ni sa copie .bak ne se relisent) : gardé en
    // copie de secours (Options), puis remplacé par la partie en cours — sinon
    // plus rien ne s'écrirait jamais dans ce fichier.
    archiveUnreadableSave(res.text);
    console.warn("Sauvegarde en fichier illisible : copie de secours gardée, elle sera remplacée par la partie en cours.");
    fileStatus = 'ok';
    adoptFileContent(null);
    return null;
  }
  if (isFutureSave(parsed)) { fileStatus = 'newer'; return null; }
  fileStatus = 'ok';
  adoptFileContent(res.text);
  return res.text;
}

// Au lancement : si la save du fichier est plus avancée que la locale, elle la
// remplace dans localStorage — le chargement normal (state.js) fait le reste.
export function reconcileFileAtBoot() {
  const c = cs();
  if (!c) { fileStatus = 'off'; return false; }
  const text = learnFile(readFile(c));
  if (text == null) return false;
  try {
    const localRaw = localStorage.getItem(SAVE_KEY);
    if (pickMostAdvanced(text, localRaw) === 'cloud') {
      // La save locale évincée est ARCHIVÉE (copie de secours « avant le nuage » :
      // Steam Cloud en est un) — le même filet que l'arbitrage Drive.
      if (localRaw) localStorage.setItem(PRE_CLOUD_KEY, localRaw);
      localStorage.setItem(SAVE_KEY, stripBom(text));
      return true;
    }
  } catch { /* stockage refusé : la partie en place se joue, la garde d'écriture protège le fichier */ }
  return false;
}

// Écrit `text` — la save que save() vient de sérialiser — dans le fichier.
//   force — geste explicite du joueur (partie choisie, mise en place au
//           démarrage) : passe la garde, jamais un fichier illisible ou plus récent ;
//   sync  — attend que le disque ait la save (fermeture).
export function fileMirrorSave(text, opts) {
  const c = cs();
  if (!c || typeof text !== 'string' || !text) return;
  // Save locale illisible au lancement : la partie en mémoire est une partie
  // neuve de repli, elle ne remplace pas le fichier (saveKey.js, SAV-1).
  if (isLocalSaveUnreadable()) return;
  const force = Boolean(opts && opts.force);
  if (fileStatus === 'unreadable') {
    // Le disque a pu se libérer (verrou d'un antivirus, d'une synchro) : relu, on
    // n'adopte QUE la référence — la garde ci-dessous décide.
    const now = Date.now();
    if (!force && lastUnreadableRead && now - lastUnreadableRead < FILE_UNREADABLE_RETRY_MS) return;
    lastUnreadableRead = now;
    learnFile(readFile(c));
  }
  if (fileStatus !== 'ok') return;
  if (text === lastSent) return;
  if (!trusted) {
    // GARDE D'ÉCRITURE (celle du nuage) : jamais une partie moins avancée par-
    // dessus une plus avancée de la même époque, ni une époque plus ancienne
    // par-dessus un geste plus récent — sauf geste explicite (force).
    const ours = parseSave(text);
    if (!mayOverwriteCloud(fileStatus, baselineLife, lifeOf(ours), force, compareEpochs(epochOf(ours), baselineEpoch))) {
      fileBehind = true;
      return;
    }
  }
  try {
    if (opts && opts.sync) {
      if (c.writeSync(text) !== true) return;
    } else {
      c.write(text);
    }
  } catch { return; }
  lastSent = text;
  trusted = true;
  fileBehind = false;
}

// Fermeture (pagehide, APRÈS la save() de sortie de main.js) : la dernière save
// part en SYNCHRONE — l'écriture asynchrone de cette save() pourrait encore être
// en route quand la page disparaît. Le process principal saute une écriture
// identique à la précédente : en temps normal, rien n'est réécrit.
function flushOnExit() {
  const c = cs();
  if (!c || lastSent == null || isLocalSaveUnreadable()) return;
  try { c.writeSync(lastSent); } catch { /* la save asynchrone, ou localStorage, couvre */ }
}

if (typeof window !== 'undefined' && cs()) {
  const action = bootSaveAction();
  if (action === 'wipe') {
    // « Recommencer depuis le tout premier feu » : le fichier part avec le reste,
    // sinon la partie effacée ressusciterait ici (ou via Steam Cloud ailleurs).
    let cleared = false;
    try { cleared = cs().clear() === true; } catch { /* verrou : traité dessous */ }
    if (cleared) { fileStatus = 'ok'; adoptFileContent(null); }
    // Effacement raté : on retient ce qu'il porte encore, SANS l'arbitrer — la
    // partie neuve naît d'une époque fraîche et a le droit de l'écraser.
    else learnFile(readFile(cs()));
  } else if (action === 'load') {
    // Partie choisie (import, emplacement, copie de secours) : elle fait autorité,
    // même moins avancée — sinon le fichier la remplacerait au lancement suivant.
    learnFile(readFile(cs()));
    let chosen = null;
    try { chosen = localStorage.getItem(SAVE_KEY); } catch { /* stockage indisponible */ }
    if (chosen) fileMirrorSave(chosen, { force: true });
  } else {
    reconcileFileAtBoot();
  }
  window.addEventListener('pagehide', flushOnExit);
}
