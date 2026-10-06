// Réglage joueur de LA CHUTE jouée sur la carte (docs/PLAN-CHUTE.md ; audit du
// 05/10, CHUTE-9, choix de Raph) : 'full' (complète à chaque chute), 'session'
// (complète à la première chute regardée de la session, courte ensuite — le défaut)
// ou 'short' (toujours courte). La version courte (iso/chuteState.js, setChuteShort)
// joue toutes les durées × 0,3, sans nuit : avec l'Édit et la Cité affichée, la
// version complète figeait la partie ~13 s par cycle.
//
// Préférence d'AFFICHAGE persistée hors save (localStorage, comme dayNightMode) :
// elle survit au Grand Reset et ne voyage pas avec l'export. Module-FEUILLE (aucun
// import). La « session » est la vie de la page : un rechargement la recommence.
const CHUTE_KEY = "civ-opt-chute";
const CHUTE_MODES = ["full", "session", "short"];

export let chuteMode = (() => {
  try {
    const saved = localStorage.getItem(CHUTE_KEY);
    return CHUTE_MODES.includes(saved) ? saved : "session";
  } catch {
    return "session";
  }
})();

export function setChuteMode(mode) {
  chuteMode = CHUTE_MODES.includes(mode) ? mode : "session";
  try {
    localStorage.setItem(CHUTE_KEY, chuteMode);
  } catch { /* stockage indisponible : le réglage vaut pour la session */ }
}

// Une chute complète a-t-elle déjà été jouée sur la carte depuis le chargement ?
let fullSeen = false;

// La prochaine chute regardée sera-t-elle courte ?
export function chuteShortNext() {
  return chuteMode === "short" || (chuteMode === "session" && fullSeen);
}

// La carte joue une chute (iso/isoChute.js, startFall) : une complète compte pour la
// session, quel que soit le réglage du moment.
export function noteChutePlayed(short) {
  if (!short) fullSeen = true;
}

// Tests : une session neuve.
export function resetChuteSession() {
  fullSeen = false;
}
