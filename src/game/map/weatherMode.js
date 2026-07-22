// Réglage joueur de la MÉTÉO de la carte : 'auto' (horloge ancrée sur l'horloge
// murale), 'clear' (toujours dégagé) ou 'rain' (toujours l'averse).
//
// Courbe à PLATEAUX, comme le cycle jour/nuit : le temps dégagé est l'état de
// lecture normal, l'averse un événement COURT (≈ 12 % du cycle, soit moins de
// 3 min sur 24) qui change l'image sans s'installer. Une pluie permanente sur un
// jeu qu'on laisse tourner des heures fatigue et masque la ville.
//
// Préférence d'AFFICHAGE persistée hors save (localStorage, comme dayNightMode,
// qualityMode et ambianceMode) : elle survit au Grand Reset et ne voyage pas
// avec l'export. Module-FEUILLE (aucun import).
const WEATHER_KEY = "civ-opt-weather";
const WEATHER_MODES = ["auto", "clear", "rain"];

export let weatherMode = (() => {
  try {
    const saved = localStorage.getItem(WEATHER_KEY);
    return WEATHER_MODES.includes(saved) ? saved : "auto";
  } catch {
    return "auto";
  }
})();

export function setWeatherMode(mode) {
  weatherMode = WEATHER_MODES.includes(mode) ? mode : "auto";
  try {
    localStorage.setItem(WEATHER_KEY, weatherMode);
  } catch { /* stockage indisponible : le réglage vaut pour la session */ }
}

const WEATHER_CYCLE_MS = 1440000;          // 24 min : nettement plus lent que le jour/nuit (9 min)
const RAIN_IN = 0.78, RAIN_FULL = 0.84, RAIN_OUT = 0.94;   // dégagé | arrivée | averse | éclaircie
const smooth01 = (t) => t * t * (3 - 2 * t);

// Intensité de pluie ∈ [0,1] pour une position p ∈ [0,1[ dans le cycle.
export function rainAt(p) {
  if (p < RAIN_IN) return 0;
  if (p < RAIN_FULL) return smooth01((p - RAIN_IN) / (RAIN_FULL - RAIN_IN));
  if (p < RAIN_OUT) return 1;
  return smooth01((1 - p) / (1 - RAIN_OUT));
}

// Vent horizontal ∈ [-1,1], CONSTANT pendant une averse et différent à la
// suivante : l'inclinaison de la pluie ne doit pas tourner sous les yeux du
// joueur, mais deux averses de suite ne doivent pas se ressembler. Dérivé du
// numéro de cycle, donc pur et reproductible.
export function windAt(cycleIndex) {
  const h = Math.sin(cycleIndex * 12.9898) * 43758.5453;
  return (h - Math.floor(h)) * 1.4 - 0.7;
}

// État météo courant. `nowMs` injectable pour les tests (défaut : horloge murale,
// donc la position dans le cycle survit aux rechargements, comme le jour/nuit).
export function weatherState(nowMs) {
  const t = nowMs === undefined ? Date.now() : nowMs;
  const cycle = Math.floor(t / WEATHER_CYCLE_MS);
  if (weatherMode === "clear") return { rainF: 0, windX: 0 };
  if (weatherMode === "rain") return { rainF: 1, windX: windAt(cycle) };
  return { rainF: rainAt((t / WEATHER_CYCLE_MS) % 1), windX: windAt(cycle) };
}
