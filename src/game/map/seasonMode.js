// SAISONS (A6). Le jeu manque d'un marqueur de TEMPS LONG : revenir après une
// absence montre la même image. Quatre saisons font changer la couleur de la
// ville, sans un seul sprite nouveau.
//
// Règle de conception, non négociable : QUATRE ÉTATS DIRIGÉS, jamais
// d'interpolation libre. Toute teinte intermédiaire non validée à la main fait
// virer la palette au vert ou au violet. La saison est donc un ENTIER (0 à 3) et
// rien de continu n'est publié.
//
// Corollaire perf : le sol est BAKÉ et la saison entre dans sa clé. Chaque
// changement de saison paie une recuisson (37 ms au zoom de jeu, plus de 100 ms
// au dézoom maximal) — d'où un cycle très lent, et des crans nets.
//
// Préférence d'AFFICHAGE persistée hors save (localStorage, comme dayNightMode,
// qualityMode, ambianceMode et weatherMode). Module-FEUILLE (aucun import).
const SEASON_KEY = "civ-opt-season";
const SEASON_MODES = ["auto", "spring", "summer", "autumn", "winter"];

export const SPRING = 0, SUMMER = 1, AUTUMN = 2, WINTER = 3;

export let seasonMode = (() => {
  try {
    const saved = localStorage.getItem(SEASON_KEY);
    return SEASON_MODES.includes(saved) ? saved : "auto";
  } catch {
    return "auto";
  }
})();

export function setSeasonMode(mode) {
  seasonMode = SEASON_MODES.includes(mode) ? mode : "auto";
  try {
    localStorage.setItem(SEASON_KEY, seasonMode);
  } catch { /* stockage indisponible : le réglage vaut pour la session */ }
}

// Une saison vaut environ 4 cycles jour/nuit (le cycle fait 9 min) : l'année
// complète dure ~2 h 24. Assez lent pour que la couleur soit un repère de temps
// long, assez court pour qu'une session en voie passer une.
const SEASON_MS = 2160000;

export function seasonAt(nowMs) {
  return Math.floor(((nowMs === undefined ? Date.now() : nowMs) / SEASON_MS) % 4);
}

// Saison courante, entière. Le mode joueur fige l'affichage sans rien casser :
// aucune mécanique de jeu ne lit cette valeur.
export function currentSeason(nowMs) {
  const forced = SEASON_MODES.indexOf(seasonMode) - 1;   // 'auto' → -1
  return forced >= 0 ? forced : seasonAt(nowMs);
}

// ── Palettes dirigées ───────────────────────────────────────────────────────
// Herbe, pointe de brin et densité de fleurs, validées à la capture saison par
// saison. L'hiver ne blanchit pas l'herbe (une ville sous la neige demanderait
// un vrai jeu de sprites) : il la décolore et supprime les fleurs.
const GRASS_BY_SEASON = [
  [122, 148, 84],   // printemps : vert clair, vif
  [116, 138, 84],   // été : la teinte d'origine, référence
  [140, 132, 74],   // automne : rouille, herbe qui sèche
  [112, 118, 96],   // hiver : décoloré, froid
];
// Nature HORS ville : garde son léger contraste avec l'herbe urbaine à chaque
// saison. Dirigée à la main plutôt que dérivée par un facteur, pour la même
// raison que le reste.
const WILD_BY_SEASON = [
  [104, 130, 76],
  [98, 120, 76],
  [120, 114, 66],
  [96, 102, 86],
];
const TIP_BY_SEASON = [
  [168, 194, 104],
  [156, 180, 96],
  [190, 172, 92],
  [150, 156, 138],
];
// Multiplicateur de densité de fleurs : rien ne fleurit en hiver.
const FLOWER_BY_SEASON = [1.35, 1, 0.5, 0];

export function seasonGrass(season) { return GRASS_BY_SEASON[season] || GRASS_BY_SEASON[SUMMER]; }
export function seasonWild(season) { return WILD_BY_SEASON[season] || WILD_BY_SEASON[SUMMER]; }
export function seasonTip(season) { return TIP_BY_SEASON[season] || TIP_BY_SEASON[SUMMER]; }
export function seasonFlowerMul(season) {
  const v = FLOWER_BY_SEASON[season];
  return v === undefined ? 1 : v;
}

// Teinte multipliée appliquée aux SPRITES de feuillage (arbres). null en été :
// pas de passe, pas de canvas hors écran, coût nul à la saison de référence.
const CANOPY_BY_SEASON = [
  "rgba(196, 232, 150, 0.30)",   // printemps : pousse claire
  null,                          // été : sprite d'origine
  "rgba(226, 158, 66, 0.42)",    // automne : rouille
  "rgba(178, 186, 190, 0.34)",   // hiver : feuillage éteint
];

export function seasonCanopyTint(season) { return CANOPY_BY_SEASON[season] ?? null; }
