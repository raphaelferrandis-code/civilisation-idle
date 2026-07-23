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
export const CURRENT_SAVE_VERSION = 4;

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
