// Préréglage de QUALITÉ de la carte : 'auto' (adapté à l'appareil), 'high',
// 'balanced' ou 'perf'. Un seul réglage joueur pilote trois leviers lus par le
// runtime de la carte (cf. cityMapRuntime.js) :
//   - dpr        : plafond de résolution de rendu (coût GPU en dpr²)
//   - citizenMul : densité d'habitants (coût par frame des agents)
//   - fps        : cap de rafraîchissement de la boucle (fluidité du geste)
// Préférence d'AFFICHAGE persistée hors save (localStorage, comme dayNightMode) :
// elle survit au Grand Reset et ne voyage pas avec l'export. Module quasi FEUILLE
// (un seul import, rendererProbe.js, feuille lui aussi) → utilisable depuis l'UI
// comme depuis la couche rendu.
import { slowRenderer } from "./rendererProbe.js";

const QUALITY_KEY = "civ-opt-quality";
const QUALITY_MODES = ["auto", "high", "balanced", "perf"];

export let qualityMode = (() => {
  try {
    const saved = localStorage.getItem(QUALITY_KEY);
    return QUALITY_MODES.includes(saved) ? saved : "auto";
  } catch {
    return "auto";
  }
})();

// Réglages concrets par palier. `dpr` est un PLAFOND : le rendu utilise
// min(devicePixelRatio, dpr) (cf. cityMapResizeCanvas), donc 2.0 ne coûte plus
// cher que sur un écran HiDPI (dpr natif > 1.5) — là il rend PLUS NET que l'ancien
// plafond fixe de 1.5. 'balanced' garde 1.5 (= ancien défaut : jamais plus flou
// qu'avant). La netteté n'est vraiment sacrifiée qu'en 'perf' (opt-in machines
// modestes). Densité et fps allègent sans toucher à la résolution ressentie.
// `lodZoom` = seuil de zoom SOUS lequel la carte simplifie (LOD : masses plates
// au lieu des sprites, lumières/animations/agents coupés). 0 = jamais de LOD →
// TOUT reste visible même en dézoom total (le sens de « Élevée »). Plus la valeur
// est haute, plus la simplification arrive tôt (allège le dézoom). Zoom ∈ [0.35, 3.2].
// `fx` = l'OMBRE DU SOLEIL et les REFLETS dans l'eau (docs/PLAN-MAQUETTE-VIVANTE.md) :
// mesurés à +4 ms chacun par image au zoom 1 en rendu logiciel (2026-09-30). Le
// palier des machines modestes s'en passe. Les lumières, elles, restent OCCULTÉES
// à tous les paliers (décision de Raph du 2026-10-07, qui revient sur PERF-2 :
// sans découpe, les halos traversaient les toits ; cf. lightLayer.js).
// `balancedNoFx` (« Équilibrée sans effets ») n'est pas un choix du joueur : c'est
// le palier que prend « Auto » quand le navigateur dessine sans carte graphique
// (décision de Raph du 2026-10-05, PERF-4 = b ; cf. detectAutoTier).
// `rainVeils` = les nappes plein écran du rideau de pluie (iso/isoWeather.js). En
// rendu logiciel c'est la surface composée qui se paie : quatre nappes (huit sous
// rafale) coûtaient 5 à 6 ms par image. Deux suffisent aux paliers des machines
// modestes (décision de Raph du 2026-10-06, PERF-23) ; les autres n'ont pas bougé.
const QUALITY_TIERS = {
  high:         { dpr: 2.0, citizenMul: 1.0, fps: 60, lodZoom: 0,    fx: true,  rainVeils: 4 },
  balanced:     { dpr: 1.5, citizenMul: 0.7, fps: 30, lodZoom: 0.55, fx: true,  rainVeils: 4 },
  balancedNoFx: { dpr: 1.5, citizenMul: 0.7, fps: 30, lodZoom: 0.55, fx: false, rainVeils: 2 },
  perf:         { dpr: 1.0, citizenMul: 0.4, fps: 30, lodZoom: 0.85, fx: false, rainVeils: 2 },
};

// 'auto' : palier deviné à partir de l'appareil. On reste conservateur — on ne
// descend en 'balanced' que sur une machine visiblement modeste (HiDPI + peu de
// cœurs, ou très peu de cœurs), sinon 'high'. Le 60 fps du palier haut ne peut
// jamais ralentir : il élève seulement le plafond, la boucle s'auto-limite si la
// machine ne suit pas.
function detectAutoTier() {
  try {
    const dpr = (typeof window !== "undefined" && window.devicePixelRatio) || 1;
    const cores = (typeof navigator !== "undefined" && navigator.hardwareConcurrency) || 4;
    // ⚠ APPAREIL TACTILE (P3) — testé AVANT le reste, et c'est le point du spike.
    // La règle « HiDPI + peu de cœurs » ci-dessous a été écrite pour des portables :
    // un téléphone récent annonce 6 à 8 cœurs et un dpr de 2,5 à 3, donc elle le
    // classait « élevé » — plafond dpr 2, aucun LOD, 60 fps visés et recuisson
    // nette pendant le geste. C'est-à-dire le pire réglage possible, sur la
    // machine la plus faible, avec le coût GPU qui monte en dpr² (la carte est
    // GPU-bound, cf. la séance du 2026-07-27).
    //
    // ⚠⚠ `(pointer: coarse) and (hover: none)` NE SUFFIT PAS — MESURÉ sur le
    // téléphone de Raph le 2026-07-28 : la conjonction ne matchait pas et
    // l'appareil est reparti en « élevé ». C'est `hover` qui trahit : plusieurs
    // navigateurs mobiles annoncent `hover: hover` (héritage, stylet, mode
    // « site pour ordinateur »). Le signal FIABLE est le pointeur grossier seul ;
    // `hover: none` ne sert plus qu'à rattraper un appareil purement tactile qui
    // n'annoncerait pas `coarse`. Un portable à écran tactile garde un pointeur
    // FIN en primaire, donc il n'est pas pris ici — c'est ce qui compte.
    const mq = (q) => typeof window !== "undefined" && typeof window.matchMedia === "function"
      && window.matchMedia(q).matches;
    const points = (typeof navigator !== "undefined" && navigator.maxTouchPoints) || 0;
    const tactile = mq("(pointer: coarse)") || (points > 0 && mq("(hover: none)"));
    // ⚠ LE dpr NE SERT PAS à juger la faiblesse d'un appareil tactile — corrigé
    // le 2026-07-28 sur mesure réelle. Un écran dense n'est pas une machine
    // lente, et le plafond de résolution du palier traite DÉJÀ le coût de
    // remplissage : sur un téléphone en dpr 3, plafonner à 1,5 divise déjà la
    // surface à peindre par quatre. Compter le dpr une seconde fois ici faisait
    // tomber en « perf » (dpr 1, moitié des habitants, LOD précoce) un téléphone
    // qui tenait 60-120 fps AU PALIER LE PLUS LOURD. On ne garde donc que le
    // nombre de cœurs, qui dit vraiment la classe de l'appareil.
    if (tactile) return withRenderer(cores <= 4 ? "perf" : "balanced");
    const weak = (dpr >= 2 && cores <= 4) || cores <= 2;
    return withRenderer(weak ? "balanced" : "high");
  } catch {
    return "balanced";
  }
}

// RENDU SANS CARTE GRAPHIQUE (décision de Raph du 2026-10-05, PERF-4 = b) : rendu
// logiciel reconnu ou WebGL absent (rendererProbe.slowRenderer) → « Équilibrée sans
// effets » : 70 % d'habitants, simplification sous le zoom 0,55, ni ombre du soleil,
// ni reflets (les lumières restent occultées). Un PC à 16 cœurs au GPU coupé recevait
// « Élevée », le palier le plus lourd sur la machine la plus lente. « Performance »,
// plus léger encore, est gardé. La sonde est faite une fois et gardée : le palier ne
// change JAMAIS en cours de partie (pas de descente sur des images lentes, choix de
// Raph). Un palier choisi à la main n'y passe pas : il est respecté.
function withRenderer(tier) {
  return tier !== "perf" && slowRenderer() ? "balancedNoFx" : tier;
}

// Palier que « Auto » retient sur cet appareil ('high' | 'balanced' | 'balancedNoFx' | 'perf'),
// affiché dans les Options (« Auto (Élevée) ») : le joueur ne savait pas quel
// palier tournait chez lui (audit du 2026-10-05, PERF-4).
export function autoQualityTier() {
  return detectAutoTier();
}

// Résout le préréglage courant (dont 'auto') en réglages concrets pour le runtime.
export function qualitySettings() {
  const tier = qualityMode === "auto" ? detectAutoTier() : qualityMode;
  return QUALITY_TIERS[tier] || QUALITY_TIERS.high;
}

export function setQualityMode(mode) {
  qualityMode = QUALITY_MODES.includes(mode) ? mode : "auto";
  try {
    localStorage.setItem(QUALITY_KEY, qualityMode);
  } catch { /* stockage indisponible : le réglage vaut pour la session */ }
}
