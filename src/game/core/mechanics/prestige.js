"use strict";

// Prestige & fin de cycle : gain de ruines, seuils dynastie / Grand Reset,
// légitimité, usure du temps, qualité d'héritage. Dépend uniquement de shared.
import { state, defaultState } from '../state.js';
import { Decimal, D, toNum } from '../num.js';
import { clamp } from '../utils.js';
import { eraTier } from '../../data/world.js';
import {
  RUIN_REFERENCE_POP,
  COLLAPSE_PREP_MAX,
  RUIN_GAIN_SCALE_FLOOR_LOG_DIV,
  RUIN_POP_DEPTH_REF,
  RUIN_POP_DEPTH_EXP,
  ERA_RUIN_BONUS_PER_INDEX,
  RUIN_SHORT_CYCLE_SEC,
  CRISIS_RESOLVE_RUIN_CAP,
  PREP_FUNEBRE_BOOST,
  MYTH_GATE_START_GR,
  TIME_WEAR_BASE_RATE,
  TIME_WEAR_MITIGATION_CAP,
  STAGNATION_USURE_RAMP_SEC,
  STAGNATION_USURE_MAX_BONUS,
  grandResetProductionMult
} from '../balance.js';
import {
  isMythEffectActive,
  ICARE_USURE_MULT,
  ATLAS_USURE_MULT,
  ATLAS_USURE_REDUCTION,
  OR_USURE_IMBALANCE_MULT,
  OR_HERITAGE_BALANCE_RATIO,
  OR_HERITAGE_USURE_RED,
  HEPH_USURE_MULT,
  ENEE_USURE_DEGRADED_MULT
} from '../../data/myths.js';
import { ACTIVE_RUIN_USURE_MULT, activeRuinMultiplier, hasActiveRuin } from '../../data/activeRuins.js';
import { crisisOpen, ruinEffectMultiplier, ruinEffectSum, has } from './shared.js';
import { tr } from '../i18n.js';

function grandResetRuinMultiplier() {
  if (isMythEffectActive("mythe_du_chaos")) return 1;
  const base = grandResetProductionMult(state.grandResetCount);
  const ragnarokBonus = (state.ragnarokHeritage && (state.grandResetCount || 0) >= 11) ? 4 : 1;
  return base * ragnarokBonus;
}

function orHeritageUsureMult() {
  if (!state.orHeritage) return 1;
  const f = D(state.food).max(0);
  const g = D(state.gold).max(0);
  if (f.lte(0) || g.lte(0)) return 1;
  // Ratio de déséquilibre [0,1] : significatif même au-delà du float.
  const ratio = f.sub(g).abs().div(f.max(g)).toNumber();
  return ratio < OR_HERITAGE_BALANCE_RATIO ? (1 - OR_HERITAGE_USURE_RED) : 1;
}

function crisisProgress() {
  return Math.max(state.instability, state.timeWear || 0);
}

// Horloge du cycle : FIGÉE pendant la crise terminale (le tick est en pause,
// rien ne vit — regarder l'écran ne doit pas faire mûrir la moisson). Elle
// repart quand un édit relance la cité (crisisLimitAnnounced retombe).
function cycleClockNow() {
  return (state.crisisLimitAnnounced && state.crisisOpenedAt)
    ? state.crisisOpenedAt
    : Date.now();
}

// Courbe de patience du gain de ruines : récompense les cycles longs (partagée
// entre ruinGain et l'autel de la Chute — ne pas laisser diverger).
function patienceAt(age) {
  return age < 120
    ? 0.18
    : age < 300
      ? 0.45
      : age < 600
        ? 0.8
        : Math.min(1.75, 1 + Math.log10(age / 600 + 1) * 0.55);
}

// Facteurs « vivants » de la moisson, pour l'autel de la Chute (PrestigeView) :
// uniquement les leviers encore actionnables pendant la crise — tenir
// (patience, sur le temps réel : elle mûrit même jeu figé) et sceller des
// édits (préparations). Les profondeurs (population, civisme) sont figées par
// les pics. NB : le terme « surpression » de ruinGain (crisisProgress > 1) est
// inatteignable — les deux jauges sont clamp01 dans le tick — donc pas exposé.
export function ruinGainFactors() {
  const age = Math.max(1, (cycleClockNow() - state.cycleStartedAt) / 1000);
  return {
    patience: patienceAt(age),
    preparationBonus: Math.min(COLLAPSE_PREP_MAX, state.collapsePreparation || 0)
  };
}

// Moisson projetée si l'on scellait un édit apportant `prep` de préparation —
// préviz au survol des paliers (autel de la Chute). Applique le boost
// « Préparations funèbres » exactement comme le fera runTerminalCrisisAction.
export function ruinGainWithPrep(prep) {
  const boost = has("preparations_funebres") ? PREP_FUNEBRE_BOOST : 1;
  return ruinGain(false, prep * boost);
}

export const HERITAGE_QUALITY_LABELS = [
  { fr: "Fragile", en: "Fragile" },
  { fr: "Stable", en: "Stable" },
  { fr: "Riche", en: "Rich" },
  { fr: "Mythique", en: "Mythic" }
];

// Cran de qualité (0-3) — -1 hors crise (« en formation »). Sert à l'échelle
// colorée de l'autel ; heritageQuality() reste la façade texte historique.
export function heritageQualityTier() {
  if (!crisisOpen()) return -1;
  const gain = ruinGain();
  const age = Math.max(1, (cycleClockNow() - state.cycleStartedAt) / 1000);
  if (gain.gte(30) || (gain.gte(16) && age >= 1200)) return 3;
  if (gain.gte(12) || (gain.gte(7) && age >= 600)) return 2;
  if (gain.gte(4) || age >= 300) return 1;
  return 0;
}

export function heritageQuality() {
  const tier = heritageQualityTier();
  if (tier < 0) return tr({ fr: "En formation", en: "Forming" });
  return tr(HERITAGE_QUALITY_LABELS[tier]);
}

// projected=true : calcule le gain « si on s'effondrait maintenant » même hors
// crise (pour l'indicateur d'aide à la décision). extraPrep : préparation
// SUPPLÉMENTAIRE hypothétique (préviz au survol d'un palier d'édit). Sans
// argument : comportement inchangé → toutes les dépendances restent identiques.
export function ruinGain(projected = false, extraPrep = 0) {
  if (!projected && !crisisOpen()) return new Decimal(0);
  const age = Math.max(1, (cycleClockNow() - state.cycleStartedAt) / 1000);
  const peaks = state.cyclePeaks || defaultState().cyclePeaks;
  const peakPopulation = toNum(peaks.population);
  const patience = patienceAt(age);
  // Référence figée (balance.js) et non eras[eras.length - 1].at : la longueur
  // de la courbe des ères ne doit pas influencer le gain de Ruines.
  const normalizedEraIndex = clamp(
    (Math.log10(Math.max(10, peakPopulation) + 10) - Math.log10(10)) /
    (Math.log10(RUIN_REFERENCE_POP + 10) - Math.log10(10)),
    0,
    1
  ) * 6;
  const ageDepth = 0.55 + normalizedEraIndex * 0.22;
  const populationDepth = Math.max(0.35, Math.pow(Math.max(10, peakPopulation) / RUIN_POP_DEPTH_REF, RUIN_POP_DEPTH_EXP));
  const civicDepth = 0.75 + Math.log10(toNum(peaks.knowledge || 0) + toNum(peaks.infrastructure || 0) * 4 + 10) * 0.14;
  const pressure = 1 + Math.max(0, crisisProgress() - 1) * 0.28;
  const preparation = 1 + Math.min(COLLAPSE_PREP_MAX, (state.collapsePreparation || 0) + extraPrep);
  const atridesRuinMod = (isMythEffectActive("mythe_atrides") && state.atridesDrainDisabled) ? 1.5 : 1;
  const elapsed = (cycleClockNow() - state.cycleStartedAt) / 1000;
  // « Limon des âges » (sedimentBoost) : les paliers d'absence longue démarrent
  // deux fois plus tôt et le bonus culmine à ×7 (au lieu de ×5).
  const sedimentMod = ruinEffectSum("sedimentBoost") > 0
    ? (elapsed >= 302400 ? 7.0 : elapsed >= 129600 ? 3.2 : elapsed >= 43200 ? 1.8 : elapsed >= 14400 ? 1.25 : elapsed >= 1800 ? 1.05 : 1.0)
    : (elapsed >= 604800 ? 5.0 : elapsed >= 259200 ? 2.35 : elapsed >= 86400 ? 1.45 : elapsed >= 28800 ? 1.15 : elapsed >= 3600 ? 1.02 : 1.0);
  // « Rites du feu court » : les cycles bouclés en moins de 15 min rapportent plus
  // (synergie Culte Apocalyptique / farm rapide).
  const shortCycleMod = (age <= RUIN_SHORT_CYCLE_SEC) ? 1 + ruinEffectSum("shortCycleRuinBonus") : 1;
  // « Moisson de crise » : +3 % de ruines par crise résolue pendant le cycle
  // (compteur cycleCrisesResolved, remis à zéro à l'effondrement), plafonné.
  const crisisHarvestMod = 1 + Math.min(
    CRISIS_RESOLVE_RUIN_CAP,
    ruinEffectSum("crisisResolveRuinBonus") * (state.cycleCrisesResolved || 0)
  );
  // Plancher basé sur l'ÉCHELLE et plus seulement l'âge : une cité d'un million
  // d'habitants qui tombe en 90 s n'a pas « rien construit ». Évite l'effondrement
  // à gain nul des cités sur-puissantes (Rupture à 100 % en <120 s).
  const peakPopLog = Number.isFinite(peakPopulation)
    ? Math.log10(Math.max(10, peakPopulation))
    : D(peaks.population).max(10).log10();
  const scaleFloor = Math.floor(peakPopLog / RUIN_GAIN_SCALE_FLOOR_LOG_DIV);
  const minGain = Math.max(age >= 120 ? 1 : 0, scaleFloor);
  // Bonus PLAT par palier d'ère maximale jamais atteint : la retraversée
  // express des ères après un Grand Reset devient une pluie de gains visibles.
  const eraFlatBonus = ERA_RUIN_BONUS_PER_INDEX * eraTier(state.bestEraIndex || 0);
  const raw = ageDepth * populationDepth * civicDepth * patience * pressure * preparation * ruinEffectMultiplier("ruinGain") * atridesRuinMod * activeRuinMultiplier(state) * grandResetRuinMultiplier() * sedimentMod * shortCycleMod * crisisHarvestMod;
  // Chemin float (identique sous 2^53) ; au-delà du domaine float, seul
  // populationDepth peut exploser : on le recalcule en Decimal.
  if (Number.isFinite(raw)) return new Decimal(Math.max(minGain, Math.floor(raw)) + eraFlatBonus);
  const populationDepthDec = D(peaks.population).max(10).div(RUIN_POP_DEPTH_REF).pow(RUIN_POP_DEPTH_EXP).max(0.35);
  const restProduct = ageDepth * civicDepth * patience * pressure * preparation * ruinEffectMultiplier("ruinGain") * atridesRuinMod * activeRuinMultiplier(state) * grandResetRuinMultiplier() * sedimentMod * shortCycleMod * crisisHarvestMod;
  return populationDepthDec.mul(restProduct).floor().max(minGain).add(eraFlatBonus);
}

// Nombre de Mythes complétés requis pour le n-ième Grand Reset (gating doux :
// GR3 : 1, GR4 : 2, … — les Mythes sont les chapitres de la route principale).
export function grandResetMythsRequired(nextCount) {
  return nextCount >= MYTH_GATE_START_GR ? nextCount - (MYTH_GATE_START_GR - 1) : 0;
}

export function completedMythCount() {
  return Object.values(state.mythsCompleted || {}).filter(Boolean).length;
}

export function timeWearRate() {
  const cycleFatigue = 1 + Math.min(1.2, state.cycles * 0.045);
  const scaleFatigue = 1 + Math.min(0.9, Math.log10(toNum(state.population) + 10) * 0.06);
  // Mitigation PLAFONNÉE : non bornée, elle gelait l'Usure en fin de partie
  // (taux mesuré ~0.002 → cité immortelle). Le plafond garantit que l'Usure
  // reste une deadline : toute civilisation finit par tomber par le temps.
  const mitigation = Math.min(
    TIME_WEAR_MITIGATION_CAP,
    1 + toNum(state.infrastructure) * 0.0015 + toNum(state.knowledge) * 0.000012
  );
  const icareMult        = isMythEffectActive("mythe_d_icare") ? ICARE_USURE_MULT : 1;
  const atlasMult        = isMythEffectActive("mythe_d_atlas") ? ATLAS_USURE_MULT : 1;
  const atlasHeritRed    = state.atlasHeritage ? (1 - ATLAS_USURE_REDUCTION) : 1;
  const orImbalanceMult  = (isMythEffectActive("mythe_age_or") && state.orUsureImbalance) ? OR_USURE_IMBALANCE_MULT : 1;
  const orHeritageMult   = orHeritageUsureMult();
  const hephMult         = isMythEffectActive("mythe_d_hephaistos") ? HEPH_USURE_MULT : 1;
  const eneeUsureMult    = (isMythEffectActive("mythe_d_enee") && state.eneeDegraded) ? ENEE_USURE_DEGRADED_MULT : 1;
  const activeRuinUsureMult = hasActiveRuin(state, "hephaistos") ? ACTIVE_RUIN_USURE_MULT : 1;
  // A6 — Stagnation : une cité maintenue durablement sous le seuil de Rupture se
  // sclérose, et le temps la rattrape d'autant plus vite. `stagnationSec` est
  // accumulé dans le tick ; ici il majore l'Usure (jusqu'à ×(1+MAX)). À 0
  // (cité jeune ou agitée) le facteur vaut exactement 1 → aucune régression.
  // « Stagnation féconde » retourne le malus : plus d'accélération d'Usure —
  // la stagnation charge des aubaines à la place (cf. tick.js).
  const stagnationMult = has("stagnation_feconde")
    ? 1
    : 1 + Math.min(STAGNATION_USURE_MAX_BONUS, (state.stagnationSec || 0) / STAGNATION_USURE_RAMP_SEC);
  return TIME_WEAR_BASE_RATE * cycleFatigue * scaleFatigue * stagnationMult * icareMult * atlasMult * atlasHeritRed * orImbalanceMult * orHeritageMult * hephMult * eneeUsureMult * activeRuinUsureMult / (mitigation * ruinEffectMultiplier("timeWearSlow"));
}

