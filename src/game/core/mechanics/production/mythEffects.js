"use strict";

// Modificateurs de production propres aux Mythes et au legs d'épitaphe (Babel,
// Héphaïstos, Âge d'Or, Cadmos, legs d'épitaphe). Feuille du DAG production :
// dépend de state/data/shared/map-bridge, jamais d'un autre sous-module lourd.
// Les helpers consommés par rates.js sont exportés (hors API publique du baril).
import { state } from '../../state.js';
import { buildings } from '../../../data/buildings.js';
import { Decimal } from '../../num.js';
import {
  BABEL_PROD_BASE_MULT,
  BABEL_COMMON_TONGUE_MULT,
  HEPH_INFRA_MULT_BASE,
  HEPH_INFRA_MULT_GROWTH,
  HEPH_POP_DECAY_START_MIN,
  HEPH_POP_PROD_MULT,
  CADMOS_CYCLE_BONUS_PCT,
  CADMOS_EPITAPH_BONUS_PCT,
  isMythEffectActive
} from '../../../data/myths.js';
import { EPITAPH_LEGACY_DURATION_MS, epitaphLegacyById } from '../../../data/epitaphs.js';
import { ruinEffectSum } from '../shared.js';

// ── Babel ────────────────────────────────────────────────────────────────
export function babelExponentialMult() {
  if (!isMythEffectActive("mythe_de_babel") || !state.babelCategory) return 1;
  const cat = state.babelCategory;
  const n = buildings
    .filter((b) => b.category === cat)
    .reduce((sum, b) => sum + (state.buildings[b.id] || 0), 0);
  return Math.pow(BABEL_PROD_BASE_MULT, n);
}

export function babelExponentialMultDec() {
  if (!isMythEffectActive("mythe_de_babel") || !state.babelCategory) return new Decimal(1);
  const cat = state.babelCategory;
  const n = buildings
    .filter((b) => b.category === cat)
    .reduce((sum, b) => sum + (state.buildings[b.id] || 0), 0);
  return Decimal.pow(BABEL_PROD_BASE_MULT, n);
}

// Héritage « la Langue commune » : la catégorie DÉCLARÉE ce cycle
// (state.babelCommonTongue, posé par babelDeclareTongue, 1×/cycle) produit
// +20 %. Remplace la Synergie d'Urbanisme par adjacence (2026-07-20) : le
// placement est procédural, le joueur ne contrôlait pas ses voisins — le bonus
// était un pourcentage aléatoire invisible.
export function babelCommonTongueMult(cat) {
  return (state.babelHeritage && state.babelCommonTongue === cat)
    ? BABEL_COMMON_TONGUE_MULT
    : 1;
}

// ── Âge d'Or / Héphaïstos ──────────────────────────────────────────────────
export function hephInfraMult() {
  if (!isMythEffectActive("mythe_d_hephaistos")) return 1;
  const elapsed = (Date.now() - (state.cycleStartedAt || Date.now())) / 60_000;
  return HEPH_INFRA_MULT_BASE + elapsed * HEPH_INFRA_MULT_GROWTH;
}

// Sous Héphaïstos, une fois le déclin enclenché, la production de population est
// étouffée : les machines remplacent les hommes, plus aucune main-d'œuvre nouvelle.
// Découple le déclin (HEPH_POP_DECAY_RATE) de la courbe de production → la pop
// chute réellement, à toutes les échelles. Hors Héphaïstos : neutre (×1).
export function hephPopProdMult() {
  if (!isMythEffectActive("mythe_d_hephaistos")) return 1;
  const elapsed = (Date.now() - (state.cycleStartedAt || Date.now())) / 60_000;
  return elapsed > HEPH_POP_DECAY_START_MIN ? HEPH_POP_PROD_MULT : 1;
}

// ── Cadmos ─────────────────────────────────────────────────────────────────
function cadmosPermanentBonus(orientation) {
  return (state.cadmosPermanentEpitaphs || [])
    .filter((entry) => entry.orientation === orientation)
    .length * CADMOS_EPITAPH_BONUS_PCT;
}

function cadmosCycleBonus(orientation) {
  return isMythEffectActive("mythe_de_cadmos")
    ? (state.cadmosCycleBonuses?.[orientation] || 0) * CADMOS_CYCLE_BONUS_PCT
    : 0;
}

export function cadmosProductionMultiplier(orientation) {
  return 1 + cadmosPermanentBonus(orientation) + cadmosCycleBonus(orientation);
}

export function cadmosStabilityMultiplier() {
  const reduction = cadmosPermanentBonus("stability") + cadmosCycleBonus("stability");
  return Math.max(0.25, 1 - reduction);
}

// ── Legs d'épitaphe ──────────────────────────────────────────────────────────
// Durée EFFECTIVE du legs : constante de base amplifiée par « Épitaphes
// profondes » (epitaphAmp 1.5 → 8 min ×2.5 = 20 min). Source unique : le timer
// de CityView et le footnote du dialogue d'épitaphe doivent lire cette fonction,
// jamais EPITAPH_LEGACY_DURATION_MS brut.
export function epitaphLegacyDurationMs() {
  return EPITAPH_LEGACY_DURATION_MS * (1 + ruinEffectSum("epitaphAmp"));
}

export function activeEpitaphLegacy() {
  const active = state.activeEpitaphLegacy;
  const legacy = active ? epitaphLegacyById(active.id) : null;
  if (!legacy) return null;
  const startedAt = active.startedAt || state.cycleStartedAt || Date.now();
  const elapsed = Date.now() - startedAt;
  // elapsed < 0 : sous l'horloge virtuelle d'un versement de clepsydre, un legs
  // gravé « dans le futur » du référentiel n'est pas actif — sans ce garde, son
  // multiplicateur s'étalait sur tout le temps versé.
  if (elapsed < 0 || elapsed > epitaphLegacyDurationMs()) return null;
  return { ...active, definition: legacy, elapsed };
}

export function epitaphLegacyEffect() {
  const active = activeEpitaphLegacy();
  if (!active) {
    return { globalMult: 1, foodMult: 1, goldMult: 1, knowledgeMult: 1, infraMult: 1, ruptureMult: 1 };
  }
  const { definition } = active;
  const effects = definition.effects || {};
  const favored = active.cause === definition.favoredCause;
  return {
    globalMult: effects.globalMult || 1,
    foodMult: favored && effects.foodMultFavored ? effects.foodMultFavored : (effects.foodMult || 1),
    goldMult: effects.goldMult || 1,
    knowledgeMult: favored && effects.knowledgeMultFavored ? effects.knowledgeMultFavored : (effects.knowledgeMult || 1),
    infraMult: effects.infraMult || 1,
    ruptureMult: favored && effects.ruptureMultFavored ? effects.ruptureMultFavored : (effects.ruptureMult || 1)
  };
}
