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

// ── RAFALES ─────────────────────────────────────────────────────────────────
// Une averse ne tombe pas à débit constant : elle arrive par paquets. Le sursaut
// qu'on voyait en revenant sur l'onglet (l'horloge d'animation avait sauté, tout
// le rideau se redistribuait d'un coup et l'œil lisait « bourrasque ») plaisait
// à Raph — on le rend DÉLIBÉRÉ et répété au lieu de le laisser à un accident
// d'horloge.
//
// ATTAQUE BRÈVE, RETOMBÉE LONGUE : une rafale FRAPPE puis s'apaise. Une
// enveloppe symétrique (sinus) donne un soufflet qui respire, jamais un coup de
// vent — c'est le seul point de forme qui compte vraiment, et il est testé.
//
// Amplitude, décalage et durée tirés du NUMÉRO de rafale (hash pur, comme
// windAt) : deux bourrasques de suite ne se ressemblent pas, et la suite reste
// reproductible d'une session à l'autre. Le vent d'averse, lui, ne bouge pas :
// la rafale COUCHE la pluie, elle ne la fait pas tourner (cf. drawIsoRain).
const GUST_SLOT_MS = 9000;      // une rafale par créneau de 9 s
const GUST_ATTACK_MS = 480;     // montée : moins d'une demi-seconde
const GUST_DECAY_MS = 4200;     // retombée de référence, ×0,7 à ×1,5 selon la rafale

const gustHash = (k, s) => {
  const h = Math.sin(k * 127.1 + s * 311.7) * 43758.5453;
  return h - Math.floor(h);
};

// Enveloppe d'UNE rafale (créneau k) au temps t, nulle hors de sa fenêtre et
// continue partout (la retombée atterrit à pente nulle). Fenêtre la plus longue
// possible : 0,55 × 9000 + 480 + 6300 ≈ 11,7 s, donc une rafale déborde au plus
// sur le créneau SUIVANT — d'où les deux créneaux testés par gustAt.
function gustPulse(k, t) {
  const start = k * GUST_SLOT_MS + gustHash(k, 1) * GUST_SLOT_MS * 0.55;
  const u = t - start;
  if (u < 0) return 0;
  const amp = 0.4 + gustHash(k, 2) * 0.6;
  if (u < GUST_ATTACK_MS) return amp * smooth01(u / GUST_ATTACK_MS);
  const v = (u - GUST_ATTACK_MS) / (GUST_DECAY_MS * (0.7 + gustHash(k, 3) * 0.8));
  if (v >= 1) return 0;
  return amp * (1 - v) * (1 - v);          // chute franche, puis longue traîne
}

// Force de la bourrasque en cours ∈ [0,1]. Le max (et non la somme) : deux
// rafales qui se chevauchent ne s'additionnent pas en un mur de pluie.
export function gustAt(t) {
  const k = Math.floor(t / GUST_SLOT_MS);
  return Math.max(gustPulse(k, t), gustPulse(k - 1, t));
}

// État météo courant. `nowMs` injectable pour les tests (défaut : horloge murale,
// donc la position dans le cycle survit aux rechargements, comme le jour/nuit).
export function weatherState(nowMs) {
  const t = nowMs === undefined ? Date.now() : nowMs;
  const cycle = Math.floor(t / WEATHER_CYCLE_MS);
  if (weatherMode === "clear") return { rainF: 0, windX: 0, gustF: 0 };
  const rainF = weatherMode === "rain" ? 1 : rainAt((t / WEATHER_CYCLE_MS) % 1);
  // La rafale est une MODULATION de l'averse : pas d'averse, pas de bourrasque,
  // et les premières gouttes ne claquent pas (elle monte avec l'intensité).
  return { rainF, windX: windAt(cycle), gustF: rainF > 0 ? gustAt(t) * rainF : 0 };
}
