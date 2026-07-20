// Réglage joueur du cycle jour/nuit de la carte : 'auto' (cycle ancré sur
// l'horloge murale), 'day' (toujours plein jour) ou 'night' (toujours nuit).
// Préférence d'AFFICHAGE : persistée hors save (localStorage, comme le format
// des nombres) — elle survit au Grand Reset et ne voyage pas avec l'export.
const DAY_NIGHT_KEY = "civ-opt-daynight";
const DAY_NIGHT_MODES = ["auto", "day", "night"];

export let dayNightMode = (() => {
  try {
    const saved = localStorage.getItem(DAY_NIGHT_KEY);
    return DAY_NIGHT_MODES.includes(saved) ? saved : "auto";
  } catch {
    return "auto";
  }
})();

export function setDayNightMode(mode) {
  dayNightMode = DAY_NIGHT_MODES.includes(mode) ? mode : "auto";
  try {
    localStorage.setItem(DAY_NIGHT_KEY, dayNightMode);
  } catch { /* stockage indisponible : le réglage vaut pour la session */ }
}
