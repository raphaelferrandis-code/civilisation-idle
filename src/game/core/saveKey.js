// Clé localStorage de LA sauvegarde. Module minuscule et SANS dépendance :
// cloudSave.js doit la connaître AVANT que state.js ne s'évalue (state = load()
// court à l'import de state.js) — l'importer depuis state.js déclencherait
// justement ce chargement trop tôt. state.js la ré-exporte pour ses clients.
// ⚠ Ne JAMAIS bumper cette clé (ça effacerait tous les saves) : la version du
// schéma vit DANS le payload (state.saveVersion), cf. le commentaire de state.js.
export const SAVE_KEY = "civilization-collapse-idle-v1";

// Version de schéma que CE build comprend. Vit ici (pas dans state.js) pour que
// cloudSave.js puisse la lire sans importer state.js — ce qui déclencherait le
// chargement de la save trop tôt. state.js la ré-exporte ; l'historique des
// versions est documenté à côté de cette ré-export.
export const CURRENT_SAVE_VERSION = 7;

// Retire le BOM UTF-8 (U+FEFF) de tête. Un fichier réécrit par PowerShell, un
// éditeur ou un outil de synchro en porte un, et JSON.parse le refuse : une
// partie PARFAITEMENT VALIDE passait pour illisible. Partagée par tous ceux qui
// relisent une save sérialisée (nuage, load(), import) — un seul oubli suffisait :
// le nuage retirait le BOM pour arbitrer mais le recopiait tel quel, et load()
// repartait sur une partie neuve (audit 2026-10-05, SAV-1).
export function stripBom(text) {
  return typeof text === "string" && text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
}

// ── Save locale illisible au démarrage ───────────────────────────────────────
// Posé par load() (state.js) quand la sauvegarde n'a PAS pu être relue : la
// partie en mémoire est une partie neuve de repli, pas celle du joueur. Tant
// qu'il tient, rien ne s'écrit — ni la clé principale (la save illisible y reste,
// « Réessayer » la relit), ni le nuage (sa copie est peut-être la seule bonne :
// l'écriture de fermeture la remplaçait par la partie neuve). Seul un geste
// explicite le lève : import, emplacement, copie de secours chargée, ou
// « Garder cette partie » dans les Options (audit 2026-10-05, SAV-1 et SAV-3).
// Variable de module, jamais un champ de `state` : elle ne doit ni partir dans
// l'export ni survivre au rechargement.
// La RAISON compte pour l'interface, pas pour la garde : 'unreadable' (la save ne
// se relit pas, on joue une partie neuve de repli) ou 'newer' (la save vient d'une
// version PLUS RÉCENTE du jeu — branche bêta Steam, ancien build en cache — et se
// joue rétrogradée : l'écrire jetterait ses champs inconnus, SAV-6).
let localSaveUnreadable = false;
let suspendReason = "";
export function markLocalSaveUnreadable(reason = "unreadable") { localSaveUnreadable = true; suspendReason = reason; }
export function clearLocalSaveUnreadable() { localSaveUnreadable = false; suspendReason = ""; }
export function isLocalSaveUnreadable() { return localSaveUnreadable; }
export function localSaveSuspendReason() { return localSaveUnreadable ? suspendReason : ""; }

// saveVersion d'une save PARSÉE : un entier, ou NaN si elle est absente ou abîmée
// (null, {}, 7.0001, « abc »). UNE seule lecture pour migrate (state.js), la garde
// « version plus récente » et le nuage : migrate exigeait un entier, le nuage
// prenait `Number(...) || 0` — une save « 7 » en chaîne était adoptée par l'un
// puis rejouait toutes ses migrations dans l'autre (audit 2026-10-05, SAV-11).
// Une chaîne d'entier (« 7 ») est acceptée : c'est bien la version 7.
export function saveVersionOf(parsed) {
  if (!parsed || typeof parsed !== "object") return NaN;
  const v = parsed.saveVersion;
  const n = typeof v === "number" ? v : (typeof v === "string" && v.trim() ? Number(v) : NaN);
  return Number.isInteger(n) ? n : NaN;
}

// Save écrite par un build PLUS RÉCENT que celui-ci (saveVersion au-delà de
// CURRENT_SAVE_VERSION). migrate() la ré-estampillerait à la version courante et
// hydrateState jetterait les champs qu'il ne connaît pas : la relire puis la
// réécrire, c'est la rétrograder en silence (audit 2026-10-05, SAV-6).
export function isFutureSave(parsed) {
  return saveVersionOf(parsed) > CURRENT_SAVE_VERSION;
}

// Un objet a-t-il la FORME d'une save de ce jeu ? hydrateState accepte tout (42,
// null, [], « toto ») et rend alors une partie neuve sans lever — un code d'un
// autre jeu idle, collé par erreur, remplaçait des dizaines d'heures de partie et
// partait de force dans le nuage (audit 2026-10-05, SAV-7). Toute save écrite
// depuis la v1 du schéma porte saveVersion ; les plus anciennes, au moins la
// population et les bâtiments.
export function looksLikeSave(parsed) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false;
  if (Object.getPrototypeOf(parsed) !== Object.prototype && Object.getPrototypeOf(parsed) !== null) return false;
  return "saveVersion" in parsed || ("population" in parsed && "buildings" in parsed);
}

// ── « Recommencer depuis le tout premier feu » ───────────────────────────────
// L'effacement ne se fait PAS sur place : il pose un drapeau et recharge la
// page, et c'est le DÉMARRAGE qui efface (cloudSave.js, avant toute lecture).
// Trois raisons, toutes vécues :
//   1. sur place, l'effacement dépend de qui détient l'objet `state` — en dev,
//      un hot-update de src/game/ en laisse deux vivants et le geste tombe dans
//      la copie morte : les fenêtres défilent, la partie revient intacte ;
//   2. le handler `beforeunload` (main.js) sauvegarde en sortant, donc toute
//      approche « efface puis recharge » réécrit la partie qu'on vient d'effacer
//      une milliseconde plus tard ;
//   3. au démarrage il n'existe qu'un seul graphe de modules, donc une seule
//      vérité — l'effacement y est déterministe.
export const WIPE_KEY = SAVE_KEY + ":wipe";

// Fenêtre de validité du drapeau. Un plantage entre la pose et le rechargement
// laisserait sinon une bombe à retardement : au prochain lancement, des heures
// plus tard, la partie partirait sans que personne n'ait rien demandé.
const WIPE_MAX_AGE_MS = 60000;

export function markPendingWipe() {
  try { localStorage.setItem(WIPE_KEY, String(Date.now())); } catch { /* stockage indisponible */ }
}

// Le drapeau est TOUJOURS consommé (même périmé) : il ne doit jamais survivre à
// un démarrage. Renvoie true seulement s'il faut réellement effacer.
export function consumePendingWipe() {
  let raw;
  try {
    raw = localStorage.getItem(WIPE_KEY);
    if (raw === null) return false;
    localStorage.removeItem(WIPE_KEY);
  } catch { return false; }
  const at = Number(raw);
  return Number.isFinite(at) && Date.now() - at < WIPE_MAX_AGE_MS;
}

// ── Charger une AUTRE partie (import, emplacement, copie de secours) ─────────
// Même recette que l'effacement : la partie choisie est posée sous cette clé, la
// page recharge, et c'est le DÉMARRAGE qui la met en place (cloudSave.js, avant
// state.js). Remplacer l'état sur place laissait vivre tout ce que la partie
// quittée avait en vol : la main de vingt-et-un et le vol d'Icare (mise rendue par
// le chargement, gain encaissé quand même), les tours différés, le deuil du Grand
// Reset et celui de l'effondrement, la caméra, les faits divers, le rapport de
// reprise (audit 2026-10-05, SAV-8). Le rechargement remet tout à neuf d'un coup.
// Contenu : { at, save } — `save` est l'objet DÉJÀ hydraté (format courant).
export const PENDING_LOAD_KEY = SAVE_KEY + ":pending-load";

// Fenêtre de validité, comme WIPE_MAX_AGE_MS : une clé restée là (rechargement
// raté, puis la partie quittée jouée encore des heures) ne doit pas remplacer, au
// lancement suivant, une progression que personne n'a demandé à jeter.
const PENDING_LOAD_MAX_AGE_MS = 60000;

// false si le stockage la refuse (plein) : rien n'est alors rechargé.
export function markPendingLoad(saveObject) {
  try {
    localStorage.setItem(PENDING_LOAD_KEY, JSON.stringify({ at: Date.now(), save: saveObject }));
    return true;
  } catch {
    try { localStorage.removeItem(PENDING_LOAD_KEY); } catch { /* rien à retirer */ }
    return false;
  }
}

// TOUJOURS consommée, même périmée ou invalide (elle ne survit jamais à un
// démarrage). Rend le texte de la save à mettre en place, ou null.
export function consumePendingLoad() {
  let raw;
  try {
    raw = localStorage.getItem(PENDING_LOAD_KEY);
    if (raw === null) return null;
    localStorage.removeItem(PENDING_LOAD_KEY);
  } catch { return null; }
  try {
    const entry = JSON.parse(raw);
    const at = Number(entry && entry.at);
    if (!Number.isFinite(at) || Date.now() - at >= PENDING_LOAD_MAX_AGE_MS) {
      console.warn("Chargement en attente périmé : ignoré, la partie en place est gardée.");
      return null;
    }
    // Revalidée ici : la clé a pu être retouchée entre les deux pages.
    if (!looksLikeSave(entry.save) || isFutureSave(entry.save)) return null;
    return JSON.stringify(entry.save);
  } catch { return null; }
}

// ── Époque de la partie (state.saveEpoch) ────────────────────────────────────
// Marque les gestes qui REMPLACENT la partie : import, chargement d'emplacement
// ou de copie de secours, « Recommencer depuis le tout premier feu ». L'arbitrage
// du nuage la compare AVANT l'horloge à vie (cloudSave.js, pickMostAdvanced) :
// sans elle, un poste resté sur l'ancienne partie, plus avancée, la remettait
// dans Drive à son lancement suivant et elle ressuscitait partout — le geste du
// joueur se soldait par « rien n'a changé » (audit 2026-10-05, SAV-4).
// Une partie jamais remplacée n'en porte pas (null) : c'est l'époque la plus
// ancienne de toutes, donc une partie neuve de premier lancement ne l'emporte
// jamais sur un nuage existant.
export function newSaveEpoch() {
  const id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  return { id, at: Date.now() };
}

// L'effacement a lieu au démarrage, AVANT que state.js ne crée la partie neuve :
// cloudSave.js le signale ici, load() (state.js) estampille alors la partie neuve
// d'une époque fraîche. Consommé une fois, comme le drapeau d'effacement.
let freshEpochRequested = false;
export function requestFreshEpoch() { freshEpochRequested = true; }
export function consumeFreshEpochRequest() {
  const asked = freshEpochRequested;
  freshEpochRequested = false;
  return asked;
}
