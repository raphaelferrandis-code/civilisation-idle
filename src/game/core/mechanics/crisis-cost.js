"use strict";

// Coûts de crise & régulation : préparations terminales, coûts des actions de
// régulation, contexte/déblocage du registre, fatigue, délai d'auto-effondrement.
// Sommet du DAG : consomme production (rates) et prestige (ruinGain, mythes).
import { state } from '../state.js';
import { D, toNum } from '../num.js';
import { canPayCost } from '../utils.js';
import {
  CRISIS_COST_SECONDS,
  CRISIS_COST_ACTION_GROWTH,
  FOYER_REFORM,
  FATIGUE_EFFECT_PENALTY,
  FATIGUE_COST_PENALTY
} from '../balance.js';
import { REGULATION_ACTIONS, REGULATION_ACTIONS_BY_ID, POLICY_BY_ID } from '../../data/regulationActions.js';
import { totalBuildingCount, crisisOpen, currentEraIndex, mapStage, has } from './shared.js';
import { rates } from './production.js';
import { ruinGain, completedMythCount } from './prestige.js';

// Fatigue de régulation — multiplicateurs dérivés de state.regulFatigue [0..1].
// Efficacité : réduit l'effet des actions (jamais sous 1 - FATIGUE_EFFECT_PENALTY).
// Coût : majore le coût des actions (jusqu'à ×(1 + FATIGUE_COST_PENALTY)).
export function regulFatigueEffectMult() {
  return 1 - (state.regulFatigue || 0) * FATIGUE_EFFECT_PENALTY;
}
export function regulFatigueCostMult() {
  return 1 + (state.regulFatigue || 0) * FATIGUE_COST_PENALTY;
}

// Contexte de déblocage des actions de régulation (ères/paliers/mythes). Fourni
// aux prédicats `unlock` du registre — calculé ici car le registre est pur (data).
export function regulationContext() {
  return {
    era: currentEraIndex(),
    bestEra: state.bestEraIndex || 0,
    cycles: state.cycles || 0,
    mythCount: completedMythCount(),
    mapStage: mapStage()
  };
}

export function regulationActionUnlocked(id, ctx = regulationContext()) {
  const a = REGULATION_ACTIONS_BY_ID[id];
  if (!a) return true; // actions de base (hors registre) : toujours disponibles
  return !a.unlock || a.unlock(ctx);
}

export function regulationPolicyUnlocked(id, ctx = regulationContext()) {
  const p = POLICY_BY_ID[id];
  if (!p) return false;
  return !p.unlock || p.unlock(ctx);
}

// Préparations terminales : 3 actions × 3 paliers. Chaque palier coûte un
// montant flat + un malus de production (%) qui dure jusqu'à l'effondrement,
// et ramène la rupture au niveau cible (75 / 50 / 25 %).
export const TERMINAL_PREP_TIERS = {
  exodus: [
    { malus: 0.15, target: 0.75, prep: 0.08, costScale: 1 },
    { malus: 0.30, target: 0.50, prep: 0.16, costScale: 1.7 },
    { malus: 0.50, target: 0.25, prep: 0.26, costScale: 2.6 }
  ],
  prepareArchives: [
    { malus: 0.12, target: 0.75, infraBonus: 0.10, prep: 0.12, costScale: 1 },
    { malus: 0.25, target: 0.50, infraBonus: 0.20, prep: 0.26, costScale: 1.7 },
    { malus: 0.40, target: 0.25, infraBonus: 0.35, prep: 0.45, costScale: 2.6 }
  ],
  holdOrder: [
    { malus: 0.08, target: 0.75, ruptureSlow: 0.25, prep: 0.05, costScale: 1 },
    { malus: 0.16, target: 0.50, ruptureSlow: 0.45, prep: 0.10, costScale: 1.7 },
    { malus: 0.28, target: 0.25, ruptureSlow: 0.65, prep: 0.18, costScale: 2.6 }
  ]
};

export function terminalCrisisCost(type, tier = 0) {
  const extensionScale = 1 + (state.crisisExtensions || 0) * 0.55;
  const depthScale = 1 + Math.max(0, toNum(ruinGain()) - 1) * 0.08;
  const tierScale = TERMINAL_PREP_TIERS[type]?.[tier]?.costScale || 1;
  // Borné : un ruinGain au-delà du float donnerait Infinity, que Decimal.mul
  // ne sait pas représenter proprement.
  const scale = Math.min(Number.MAX_VALUE, extensionScale * depthScale * tierScale);
  if (type === "prepareArchives") {
    return {
      knowledge: D(state.population).mul(0.045).add(totalBuildingCount() * 18).max(90).mul(scale),
      gold: D(state.population).mul(0.025).max(50).mul(scale)
    };
  }
  if (type === "exodus") {
    return { food: D(state.population).mul(0.55).max(120).mul(scale) };
  }
  return {
    gold: D(state.population).mul(0.12).max(120).mul(scale),
    knowledge: D(Math.max(60, totalBuildingCount() * 10)).mul(scale),
    food: D(state.population).mul(0.18).max(80).mul(scale)
  };
}

export function terminalCrisisReady(type, tier = 0) {
  if (!crisisOpen()) return false;
  if (state.terminalPreparations?.used?.[type]) return false;
  return canPayCost(terminalCrisisCost(type, tier));
}

export function crisisCosts() {
  // actionScale = escalade par usage cumulé × majoration de fatigue (anti-spam).
  const actionScale = (1 + Object.values(state.crisisActions).reduce((sum, value) => sum + value, 0) * CRISIS_COST_ACTION_GROWTH) * regulFatigueCostMult();
  const r = rates();
  const cost = (resource, seconds) => D(r[resource]).max(0).mul(seconds).mul(actionScale).max(1);
  const S = CRISIS_COST_SECONDS;
  // Coûts des actions déblocables (registre) — même ancrage « secondes de prod ».
  const regCosts = {};
  for (const a of REGULATION_ACTIONS) {
    regCosts[a.id] = { [a.cost.res]: cost(a.cost.res, a.cost.seconds) };
  }
  return {
    ...regCosts,
    rationing: { food: cost("food", S.rationing) },
    festivals: { gold: cost("gold", S.festivals) },
    census: { knowledge: cost("knowledge", S.census) },
    reforms: {
      gold: cost("gold", S.reformsGold),
      knowledge: cost("knowledge", S.reformsKnowledge)
    },
    archiveCrisis: { knowledge: cost("knowledge", S.archiveCrisis) },
    ancestorCrisis: { ruins: D(Math.max(8, state.cycles * 3)).mul(actionScale), food: cost("food", S.ancestorCrisis) },
    // Réformes de fond : recul DURABLE, coût LOURD (≈5× l'apaisement), ancré sur
    // la même base « secondes de production » (cf. FOYER_REFORM dans balance.js).
    reformScarcity: { [FOYER_REFORM.scarcity.resource]: cost(FOYER_REFORM.scarcity.resource, FOYER_REFORM.scarcity.seconds) },
    reformInequality: { [FOYER_REFORM.inequality.resource]: cost(FOYER_REFORM.inequality.resource, FOYER_REFORM.inequality.seconds) },
    reformComplexity: { [FOYER_REFORM.complexity.resource]: cost(FOYER_REFORM.complexity.resource, FOYER_REFORM.complexity.seconds) },
    reformDissent: { [FOYER_REFORM.dissent.resource]: cost(FOYER_REFORM.dissent.resource, FOYER_REFORM.dissent.seconds) }
  };
}

// Délai avant effondrement automatique (intendant_de_crise).
// Utilisé par checkAutoCollapse() dans main.js et renderCrisisSummary() dans render.js.
export function autoCollapseDelay() {
  const hasTier3 = has("memoire_institutionnelle");
  const hasTier2 = hasTier3 || has("conseil_de_regence");
  return hasTier3 ? 3 * 60 * 1000 : hasTier2 ? 6 * 60 * 1000 : 10 * 60 * 1000;
}
