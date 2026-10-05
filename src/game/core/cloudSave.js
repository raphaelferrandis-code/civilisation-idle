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
import { SAVE_KEY, consumePendingWipe, consumePendingLoad, stripBom, isLocalSaveUnreadable, requestFreshEpoch, isFutureSave } from './saveKey.js';

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
//   'conflict'   — un AUTRE poste a réécrit le fichier pendant cette session (il
//                  est relu avant chaque écriture) : plus aucune écriture, sinon
//                  les deux postes s'écraseraient tour à tour toutes les 30 s et
//                  le dernier fermé gagnerait (audit 2026-10-05, SAV-4).
let cloudStatus = 'off';
// Ce qu'on SAIT être dans le nuage (lu au lancement, ou écrit par nous) :
//   cloudBaselineLife  — son horloge à vie (-1 = nuage vide). Toute écriture doit
//                        être au moins aussi avancée, sinon on remplacerait une
//                        partie plus longue par une plus courte ;
//   cloudBaselineEpoch — son époque (epochOf) : un geste explicite plus récent
//                        (import, emplacement, reset) l'emporte sur l'horloge ;
//   cloudKnownStamp    — l'empreinte du fichier (stampOf), null = absent. Si le
//                        fichier relu ne la porte plus, un autre poste a écrit.
// Avant (SAV-4), seule l'horloge était retenue, figée au lancement, et le fichier
// n'était jamais relu avant d'écrire.
let cloudBaselineLife = -1;
let cloudBaselineEpoch = { id: '', at: 0 };
let cloudKnownStamp = null;

export function cloudSaveStatus() { return cloudStatus; }

// Résultat de la DERNIÈRE écriture nuage tentée cette session (null = aucune
// encore). L'UI s'en sert : « Active » ne doit pas s'afficher si les écritures
// échouent en silence (dossier en lecture seule, quota Drive plein, verrou).
let lastWriteOk = null;
let lastWriteAt = 0;
// La garde d'écriture a refusé le dernier miroir : le nuage porte une partie plus
// avancée que celle-ci (ou posée par un geste plus récent). Rien n'y est perdu,
// mais rien n'est répliqué non plus — Options le dit au lieu d'afficher « Active »
// (audit 2026-10-05, SAV-5). Retombe à la prochaine écriture réussie.
let cloudBehind = false;
export function cloudSyncInfo() { return { ok: lastWriteOk, at: lastWriteAt, behind: cloudBehind }; }

// Parse une save sérialisée, ou null. Le BOM UTF-8 (U+FEFF) est retiré : un
// fichier nuage réécrit par un éditeur, un outil de synchro ou un script
// PowerShell en porte un, et JSON.parse le refuse — sans ce strip, une partie
// PARFAITEMENT VALIDE passait pour illisible.
export function parseSave(raw) {
  if (typeof raw !== 'string' || !raw) return null;
  try {
    const s = JSON.parse(stripBom(raw));
    return (s && typeof s === 'object') ? s : null;
  } catch { return null; }
}

// Horloge à vie d'une save PARSÉE (parseSave) ; -1 si illisible (donc « inconnue »,
// jamais « zéro » : un 0 passerait pour une partie neuve légitime).
function lifeOf(s) {
  return s ? (Number(s?.chronicleStats?.lifetimePlaySec) || 0) : -1;
}

// Époque d'une save parsée (state.saveEpoch, cf. saveKey.js) : { id, at }. Une
// save sans époque — d'avant, ou jamais remplacée — a l'époque vide, la plus
// ancienne de toutes.
function epochOf(s) {
  const e = s && s.saveEpoch;
  return (e && typeof e === 'object' && typeof e.id === 'string' && e.id)
    ? { id: e.id, at: Number(e.at) || 0 }
    : { id: '', at: 0 };
}

// > 0 si l'époque `a` est PLUS RÉCENTE que `b` (autre partie, posée par un geste
// postérieur), < 0 si plus ancienne, 0 si c'est la même partie.
function compareEpochs(a, b) {
  if (a.id === b.id) return 0;
  return Math.sign(a.at - b.at);
}

// Empreinte d'une save sérialisée : de quoi reconnaître « le fichier qu'on a
// laissé » (horloge à vie, dernier tick, époque). undefined si illisible.
function stampOf(raw) {
  const s = parseSave(raw);
  if (!s) return undefined;
  return `${lifeOf(s)}|${Number(s.lastTick) || 0}|${epochOf(s).id}`;
}

// Retient le contenu qu'on SAIT être dans le nuage : lu, ou écrit par nous.
// null = fichier absent (nuage vide et connu).
// La référence change du tout au tout (écrite par nous, effacée, relue) : le
// prochain miroir rejugera s'il est en retard sur elle.
function adoptCloudContent(raw) {
  const s = raw == null ? null : parseSave(raw);
  cloudBaselineLife = lifeOf(s);
  cloudBaselineEpoch = epochOf(s);
  cloudKnownStamp = raw == null ? null : stampOf(raw);
  cloudBehind = false;
}

// A-t-on le droit d'écraser le fichier nuage ? PURE, exportée pour les tests.
// `force` = geste explicite du joueur (import, chargement d'emplacement) : il
// fait autorité, mais ne peut jamais passer outre un nuage illisible. La
// fermeture de la fenêtre n'en est PAS un (cloudMirrorSave, option flush).
// `epochCmp` = notre époque face à celle du nuage (compareEpochs) : une partie
// remplacée APRÈS celle du nuage (import, reset sur ce poste) fait autorité même
// moins avancée ; une partie d'époque plus ANCIENNE n'écrase jamais celle d'un
// geste plus récent, même plus avancée — l'arbitrage du lancement juge pareil.
export function mayOverwriteCloud(status, baselineLife, saveLife, force, epochCmp = 0) {
  if (status !== 'ok') return false;
  if (force) return true;
  if (epochCmp !== 0) return epochCmp > 0;
  return saveLife >= baselineLife;
}

// Quelle save gagne ? 'cloud' ou 'local'. Exportée pure pour les tests.
// L'ÉPOQUE d'abord : la partie posée par le geste explicite le plus récent
// (import, emplacement, reset) gagne, même moins avancée. Sans ce critère, un
// poste resté sur l'ancienne partie la remettait dans Drive à son lancement, et
// elle ressuscitait sur le poste où le joueur l'avait abandonnée (SAV-4). Puis,
// au sein d'une même partie, la plus avancée.
export function pickMostAdvanced(cloudRaw, localRaw) {
  const cloud = parseSave(cloudRaw);
  if (!cloud) return 'local';
  const local = parseSave(localRaw);
  if (!local) return 'cloud';
  const byEpoch = compareEpochs(epochOf(cloud), epochOf(local));
  if (byEpoch !== 0) return byEpoch > 0 ? 'cloud' : 'local';
  const life = (s) => Number(s?.chronicleStats?.lifetimePlaySec) || 0;
  const tick = (s) => Number(s?.lastTick) || 0;
  if (life(cloud) !== life(local)) return life(cloud) > life(local) ? 'cloud' : 'local';
  return tick(cloud) > tick(local) ? 'cloud' : 'local';
}

// Statut et référence du nuage d'après le cliché du préload (c.initial). Rend le
// texte du nuage s'il est lisible et de notre version, sinon null (statut posé).
function learnInitialCloud(c) {
  const res = (c.initial && typeof c.initial === 'object')
    ? c.initial
    : { status: 'error', text: null }; // forme inattendue : on se méfie
  if (res.status === 'none') { cloudStatus = 'ok'; adoptCloudContent(null); return null; }
  if (res.status !== 'ok' || typeof res.text !== 'string' || !res.text) {
    // FAIL-CLOSED : le nuage existe mais son contenu nous échappe. On joue en
    // local sans jamais l'écraser — mieux vaut une session non synchronisée
    // qu'une partie détruite.
    cloudStatus = 'unreadable';
    return null;
  }
  const cloudParsed = parseSave(res.text);
  if (!cloudParsed) {
    // Fichier lu mais illisible EN CONTENU (corrompu, tronqué par une synchro à
    // moitié faite). On ne sait pas ce qu'il vaut → même traitement qu'une
    // lecture ratée : on n'y touche pas.
    cloudStatus = 'unreadable';
    return null;
  }
  // Même lecture de saveVersion que migrate (saveKey.js, SAV-11) : `Number() || 0`
  // adoptait une save « 7 » en chaîne que migrate prenait ensuite pour une v0.
  if (isFutureSave(cloudParsed)) {
    // Nuage écrit par un build PLUS RÉCENT : l'adopter le rétrograderait (migrate
    // jette les champs inconnus puis ré-estampille), et le miroir republierait la
    // version mutilée — perte pour l'autre poste aussi. Fail-closed : local seul,
    // aucune écriture. Options invite à mettre le jeu à jour sur ce poste.
    cloudStatus = 'newer';
    return null;
  }
  cloudStatus = 'ok';
  adoptCloudContent(res.text);
  return res.text;
}

// Au lancement : si la save du nuage est plus avancée que la locale, elle la
// remplace dans localStorage — le chargement normal (state.js) fait le reste.
export function reconcileCloudAtBoot() {
  const c = cc();
  if (!c || !c.dir) { cloudStatus = 'off'; return false; }
  const cloudText = learnInitialCloud(c);
  if (cloudText == null) return false;
  try {
    const localRaw = localStorage.getItem(SAVE_KEY);
    if (pickMostAdvanced(cloudText, localRaw) === 'cloud') {
      // La save locale évincée est ARCHIVÉE avant l'écrasement : si l'arbitrage
      // se trompait, elle reste récupérable (sinon perdue sans trace ni invite).
      if (localRaw) localStorage.setItem(SAVE_KEY + ':pre-cloud', localRaw);
      // Texte NETTOYÉ du BOM : recopié brut, load() le refusait (JSON.parse) et
      // le jeu repartait sur une partie neuve — que la fermeture renvoyait
      // ensuite dans le nuage à la place des 40 h qu'on venait d'adopter (SAV-1).
      localStorage.setItem(SAVE_KEY, stripBom(cloudText));
      return true;
    }
  } catch { /* stockage indisponible : on joue en mémoire, comme avant */ }
  return false;
}

// Miroir nuage de la save locale. Throttlé (Drive n'a pas besoin de
// synchroniser toutes les 5 s). Deux options à NE PAS confondre :
//   flush:true — la fermeture : saute le délai de 30 s, mais GARDE la garde
//                d'écriture (une partie moins avancée n'écrase jamais le nuage) ;
//   force:true — geste explicite du joueur (import, chargement d'emplacement) :
//                il fait autorité et passe outre la garde (jamais un nuage illisible).
// La fermeture était « forcée » (audit 2026-10-05, SAV-2) : un nuage redevenu
// lisible EN COURS de session (référence 100 h, cf. plus bas) était écrasé au
// beforeunload par la partie de quelques minutes jouée en attendant.
const CLOUD_WRITE_MIN_MS = 30000;
// Nuage illisible : relecture toutes les 5 min, pas à chaque autosave (10 s) —
// un placeholder Drive « en ligne seulement » relu en boucle déclenchait autant
// de téléchargements (SAV-4).
const CLOUD_UNREADABLE_RETRY_MS = 5 * 60 * 1000;
let lastCloudWrite = 0;
let lastUnreadableRead = 0;
let cloudDirty = false;
// La page recharge pour mettre en place une AUTRE partie (PENDING_LOAD_KEY,
// saveKey.js) : la partie quittée ne part plus au nuage, ni par l'autosave ni par
// l'écriture de fermeture — la page suivante y écrit la partie choisie (SAV-8).
let leavingForReload = false;
export function suspendCloudMirrorForReload() { leavingForReload = true; }
export function cloudMirrorSave(opts) {
  const c = cc();
  if (!c || !c.dir) return;
  if (leavingForReload) return;
  const force = Boolean(opts && opts.force);
  const flush = force || Boolean(opts && opts.flush);
  // Save LOCALE illisible au démarrage (saveKey.js) : la partie en mémoire est une
  // partie neuve de repli, et la copie du nuage est peut-être la seule bonne.
  // Aucune écriture, même forcée. Charger une autre partie (import, emplacement,
  // copie de secours) passe par un rechargement : la page suivante démarre sans ce
  // drapeau et écrit la partie choisie (applyPendingLoad) ; « Garder » le lève.
  if (isLocalSaveUnreadable()) return;
  const now = Date.now();

  // Nuage illisible au lancement : re-tenter une lecture (Drive a pu revenir en
  // ligne, le placeholder a pu s'hydrater). On n'adopte QUE la référence — pas
  // question de remplacer la save d'une partie EN COURS sous les pieds du
  // joueur ; l'arbitrage complet n'a lieu qu'au lancement.
  if (cloudStatus === 'unreadable') {
    if (typeof c.read !== 'function') return;
    if (!force && lastUnreadableRead && now - lastUnreadableRead < CLOUD_UNREADABLE_RETRY_MS) return;
    lastUnreadableRead = now;
    let again;
    try { again = c.read(); } catch { return; }
    if (!again) return;
    if (again.status === 'none') { cloudStatus = 'ok'; adoptCloudContent(null); }
    else if (again.status === 'ok' && parseSave(again.text)) {
      if (isFutureSave(parseSave(again.text))) {
        cloudStatus = 'newer'; // même garde qu'au lancement : ni adopté, ni écrasé
        return;
      }
      cloudStatus = 'ok';
      adoptCloudContent(again.text);
    } else return; // toujours illisible : on n'écrit toujours pas
  }

  if (!flush && now - lastCloudWrite < CLOUD_WRITE_MIN_MS) {
    cloudDirty = true; // rattrapé par le prochain miroir ou le flush de sortie
    return;
  }
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return;
    // GARDE D'ÉCRITURE : le miroir ne doit JAMAIS remplacer une partie plus
    // avancée que la nôtre. Sans elle, l'auto-save des 2 premières secondes
    // (main.js) suffisait à écraser le nuage avec une cité neuve.
    const ours = parseSave(raw);
    const epochCmp = compareEpochs(epochOf(ours), cloudBaselineEpoch);
    if (!mayOverwriteCloud(cloudStatus, cloudBaselineLife, lifeOf(ours), force, epochCmp)) {
      cloudDirty = false;
      // Refus de la GARDE (nuage lisible, mais en avance) : à dire dans Options.
      // Les autres refus (conflit, version plus récente) ont leur propre statut.
      if (cloudStatus === 'ok') cloudBehind = true;
      return;
    }
    // RELIRE AVANT D'ÉCRIRE (SAV-4) — miroirs ordinaires ET fermeture ; un geste
    // forcé (import, emplacement) fait autorité sans relire. Si le fichier n'est
    // plus celui qu'on a laissé, un autre poste joue en même temps : on s'arrête
    // là pour la session, plutôt que d'écraser sa progression toutes les 30 s.
    if (!force && typeof c.read === 'function') {
      let cur = null;
      try { cur = c.read(); } catch { /* lecture ratée : traitée juste dessous */ }
      if (!cur || (cur.status !== 'ok' && cur.status !== 'none')) {
        cloudDirty = true; // verrou de synchro, Drive hors ligne : on retentera
        return;
      }
      const curStamp = cur.status === 'none' ? null : stampOf(cur.text);
      if (curStamp === undefined) { cloudDirty = true; return; } // synchro à moitié faite
      if (curStamp !== cloudKnownStamp) {
        const theirs = cur.status === 'ok' ? parseSave(cur.text) : null;
        cloudStatus = isFutureSave(theirs) ? 'newer' : 'conflict';
        cloudDirty = false;
        return;
      }
    }
    const wrote = c.write(raw);
    lastWriteOk = wrote;
    lastWriteAt = now;
    if (wrote) {
      lastCloudWrite = now;
      cloudDirty = false;
      // Le nuage contient désormais EXACTEMENT ce qu'on vient d'écrire.
      adoptCloudContent(raw);
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
      adoptCloudContent(null);
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
  // Nuage CONNU, même sans préload : la partie neuve pourra s'y écrire.
  cloudStatus = 'ok';
  // Si l'effacement du fichier a raté (verrou de synchro), on retient ce qu'il
  // porte encore : la relecture avant écriture (SAV-4) ne doit pas le prendre pour
  // un autre poste, et la partie neuve — d'époque fraîche, ci-dessous — a le droit
  // de l'écraser même moins avancée.
  let left = null;
  const c = cc();
  try {
    const cur = c && typeof c.read === 'function' ? c.read() : null;
    if (cur && cur.status === 'ok' && parseSave(cur.text)) left = cur.text;
  } catch { /* illisible : on le tient pour effacé, comme avant */ }
  adoptCloudContent(left);
  // La partie neuve (load, state.js) naît avec une époque fraîche : les autres
  // postes adopteront le reset au lieu de remettre l'ancienne partie (SAV-4).
  requestFreshEpoch();
}

// Partie choisie au clic (import, emplacement, copie de secours), mise en place ICI
// après le rechargement (PENDING_LOAD_KEY dans saveKey.js, SAV-8). Elle devient la
// save locale AVANT que state.js ne la lise, et SANS arbitrage : un nuage plus
// avancé la remplacerait, alors que le joueur vient justement de la choisir. Le
// nuage n'est lu que pour son statut et sa référence, puis reçoit la partie choisie
// par un miroir FORCÉ, comme le faisait l'import à chaud — sans lui, « la plus
// avancée gagne » ressusciterait la partie abandonnée au lancement suivant. Jamais
// par-dessus un nuage illisible ou d'une version plus récente (fail-closed).
function applyPendingLoad(text) {
  try {
    localStorage.setItem(SAVE_KEY, text);
  } catch {
    // Stockage plein (rare : la clé en attente vient d'être libérée) : la partie
    // en place reste, avec l'arbitrage ordinaire.
    console.warn("Chargement en attente impossible à mettre en place : la partie en place est gardée.");
    reconcileCloudAtBoot();
    return;
  }
  const c = cc();
  if (!c || !c.dir) { cloudStatus = 'off'; return; }
  learnInitialCloud(c);
  if (cloudStatus === 'ok') cloudMirrorSave({ force: true });
}

if (typeof window !== 'undefined') {
  // Les deux clés sont TOUJOURS consommées (aucune ne survit à un démarrage) ;
  // l'effacement, confirmé deux fois, l'emporte sur un chargement.
  const wipe = consumePendingWipe();
  const pendingLoad = consumePendingLoad();
  if (wipe) applyPendingWipe();
  else if (pendingLoad) applyPendingLoad(pendingLoad);
  else reconcileCloudAtBoot();
  // Fermeture de la fenêtre : pousser la dernière save si un miroir est en
  // attente de throttle. Écriture SYNCHRONE côté préload → fiable à la sortie.
  // flush et non force : la sortie n'est pas un geste du joueur sur sa partie,
  // la garde d'écriture tient jusqu'au bout (SAV-2).
  const flush = () => { if (cloudDirty) cloudMirrorSave({ flush: true }); };
  window.addEventListener('pagehide', flush);
  window.addEventListener('beforeunload', flush);
}
