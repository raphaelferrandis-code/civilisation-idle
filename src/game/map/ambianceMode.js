// Réglage joueur de la VIE de la carte : 'full', 'sober' ou 'none'. Il coupe ce
// qui bouge sans porter d'information (feuilles, lucioles, fontaines, pluie,
// oiseaux, fumées) SANS toucher à la résolution ni à la densité d'habitants.
//
// Pourquoi séparé de la Qualité graphique (qualityMode.js) : la qualité sert la
// MACHINE, l'ambiance sert le CONFORT. Les confondre force qui est gêné par le
// mouvement, ou qui laisse le jeu tourner en fond, à jouer en image dégradée
// pour obtenir du calme.
//
// Préférence d'AFFICHAGE persistée hors save (localStorage, comme dayNightMode
// et qualityMode) : elle survit au Grand Reset et ne voyage pas avec l'export.
// Module-FEUILLE (aucun import) → utilisable depuis l'UI comme depuis le rendu.
const AMBIANCE_KEY = "civ-opt-ambiance";
const AMBIANCE_MODES = ["full", "sober", "none"];

export let ambianceMode = (() => {
  try {
    const saved = localStorage.getItem(AMBIANCE_KEY);
    return AMBIANCE_MODES.includes(saved) ? saved : "full";
  } catch {
    return "full";
  }
})();

// Multiplicateur unique appliqué à toutes les couches d'ambiance animées.
// 'sober' ne divise pas seulement le nombre de particules : il garde la ville
// habitée (on voit encore qu'il se passe quelque chose) en supprimant l'agitation
// de fond. 'none' coupe net, sans rien retirer d'autre à l'image.
const AMBIANCE_K = { full: 1, sober: 0.4, none: 0 };

export function ambianceK() {
  return AMBIANCE_K[ambianceMode] ?? 1;
}

export function setAmbianceMode(mode) {
  ambianceMode = AMBIANCE_MODES.includes(mode) ? mode : "full";
  try {
    localStorage.setItem(AMBIANCE_KEY, ambianceMode);
  } catch { /* stockage indisponible : le réglage vaut pour la session */ }
}
