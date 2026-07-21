// Préréglage de QUALITÉ de la carte : 'auto' (adapté à l'appareil), 'high',
// 'balanced' ou 'perf'. Un seul réglage joueur pilote trois leviers lus par le
// runtime de la carte (cf. cityMapRuntime.js) :
//   - dpr        : plafond de résolution de rendu (coût GPU en dpr²)
//   - citizenMul : densité d'habitants (coût par frame des agents)
//   - fps        : cap de rafraîchissement de la boucle (fluidité du geste)
// Préférence d'AFFICHAGE persistée hors save (localStorage, comme dayNightMode) :
// elle survit au Grand Reset et ne voyage pas avec l'export. Module-FEUILLE (aucun
// import) → utilisable depuis l'UI comme depuis la couche rendu.
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
// `crispGesture` = pas de flou pendant le geste : au lieu du re-blit lissé du sol
// baké pendant zoom/dézoom/drag, on recuit le sol NET à l'échelle exacte à chaque
// frame (coûteux — geste moins fluide sur très grande ville ; réservé à « Élevée »).
const QUALITY_TIERS = {
  high:     { dpr: 2.0, citizenMul: 1.0, fps: 60, lodZoom: 0,    crispGesture: true },
  balanced: { dpr: 1.5, citizenMul: 0.7, fps: 30, lodZoom: 0.55, crispGesture: false },
  perf:     { dpr: 1.0, citizenMul: 0.4, fps: 30, lodZoom: 0.85, crispGesture: false },
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
    const weak = (dpr >= 2 && cores <= 4) || cores <= 2;
    return weak ? "balanced" : "high";
  } catch {
    return "balanced";
  }
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
