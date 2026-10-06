"use strict";

// Coûts de crise & régulation : préparations terminales, coûts des actions de
// régulation, contexte/déblocage du registre, fatigue, délai d'auto-effondrement.
// Sommet du DAG : consomme production (rates) et prestige (mythes).
import { state } from '../state.js';
import { D } from '../num.js';
import { canPayCost } from '../utils.js';
import {
  CRISIS_COST_SECONDS,
  CRISIS_COST_ACTION_GROWTH,
  FOYER_REFORM,
  FATIGUE_EFFECT_PENALTY,
  FATIGUE_COST_PENALTY
} from '../balance.js';
import { REGULATION_ACTIONS, REGULATION_ACTIONS_BY_ID, POLICY_BY_ID } from '../../data/regulationActions.js';
import { crisisOpen, currentEraIndex, mapStage, ruinEffectSum, completedMythCount } from './shared.js';
import { rates } from './production.js';

// Fatigue de régulation — multiplicateurs dérivés de state.regulFatigue [0..1].
// Efficacité : réduit l'effet des actions (jamais sous 1 - FATIGUE_EFFECT_PENALTY).
// Coût : majore le coût des actions (jusqu'à ×(1 + FATIGUE_COST_PENALTY)).
export function regulFatigueEffectMult() {
  return 1 - (state.regulFatigue || 0) * FATIGUE_EFFECT_PENALTY;
}
function regulFatigueCostMult() {
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

// Paliers de CYCLE des deux actions de base de la Dissidence (hors registre).
// SEULE source (audit 2026-10-05, BUG-71) : runCrisisAction l'impose, l'Intendance
// (steward.js) et le Conseil (regulModel.js) la lisent — le palier vivait en
// double dans ces deux-là, et le moteur ne le vérifiait pas.
const BASE_ACTION_MIN_CYCLES = { archiveCrisis: 2, ancestorCrisis: 3 };

export function regulationActionUnlocked(id, ctx = regulationContext()) {
  const minCycles = BASE_ACTION_MIN_CYCLES[id];
  if (minCycles != null) return (ctx.cycles || 0) >= minCycles;
  const a = REGULATION_ACTIONS_BY_ID[id];
  if (!a) return true; // autres actions de base (hors registre) : toujours disponibles
  return !a.unlock || a.unlock(ctx);
}

export function regulationPolicyUnlocked(id, ctx = regulationContext()) {
  const p = POLICY_BY_ID[id];
  if (!p) return false;
  return !p.unlock || p.unlock(ctx);
}

// LES RITES DE LA CHUTE (décision de Raph, 2026-10-03 : option « A »). En crise
// terminale, la cité peut accomplir UN rite avant de tomber — sans sursis : la
// jauge ne redescend pas, aucun malus, aucun frein. Le rite rapporte des Ruines
// à la chute (préparation, × Préparations funèbres) et DÉCLARE la cause de la
// chute, donc l'affinité du legs : CHOISIR COMMENT TOMBER.
// Il se paie en SECONDES DE PRODUCTION de sa ressource : le palier Mesuré est à la
// portée de tous, le Total demande d'avoir mis de côté avant la chute (un joueur
// qui dépense tout ne garde que 20 à 70 s de production en stock — mesuré).
// Pourquoi plus de sursis : rendus payables, les anciens édits (jauge ramenée à
// 75/50/25 %, malus, frein) rapportaient de +40 % à ×4 de Ruines par jour quel que
// soit l'édit — les malus de Savoir allégeaient en douce la Complexité ; prolonger
// un cycle avec un bonus de Ruines est toujours rentable (bench-crises.js --edict).
const RITE_TIERS = [
  { prep: 0.10, seconds: 15 },
  { prep: 0.20, seconds: 45 },
  { prep: 0.35, seconds: 120 }
];
export const TERMINAL_PREP_TIERS = {
  exodus: RITE_TIERS,
  prepareArchives: RITE_TIERS,
  holdOrder: RITE_TIERS
};
// Ressource dont chaque rite consomme des secondes de production.
export const TERMINAL_RITE_RESOURCE = {
  exodus: "food",
  prepareArchives: "knowledge",
  holdOrder: "gold"
};
// Cause de chute DÉCLARÉE par chaque rite (au lieu du foyer dominant, cf.
// events.collapseCause) — donc l'affinité du legs. Si c'est l'Usure qui a
// ouvert la crise, elle reste la cause.
export const TERMINAL_EDICT_CAUSE = {
  exodus: "famine",          // on fuit les champs → le Grain
  prepareArchives: "time",   // on grave la mémoire → la Mémoire
  holdOrder: "rupture"       // on verrouille la cité → l'Ordre
};

export function terminalCrisisCost(type, tier = 0) {
  const resource = TERMINAL_RITE_RESOURCE[type] || "gold";
  const seconds = TERMINAL_PREP_TIERS[type]?.[tier]?.seconds || 0;
  // « Préparations funèbres » (terminalPrepDiscount) : mourir proprement coûte moins cher.
  const prepDiscount = 1 - Math.min(0.6, ruinEffectSum("terminalPrepDiscount"));
  return { [resource]: D(rates()[resource]).max(0).mul(seconds * prepDiscount).max(1) };
}

// Un seul rite par chute : vrai dès qu'un rite a été accompli dans cette crise.
export function terminalRiteSealed() {
  return Object.values(state.terminalPreparations?.used || {}).some(Boolean);
}

export function terminalCrisisReady(type, tier = 0) {
  if (!crisisOpen()) return false;
  if (terminalRiteSealed()) return false;
  if (!TERMINAL_PREP_TIERS[type]?.[tier]) return false;
  // Pas de scribes, pas d'archives : sans production de sa ressource, le rite
  // coûterait 1 (plancher) — +35 % de Ruines gratuits avant l'ère du Savoir.
  if (!D(rates()[TERMINAL_RITE_RESOURCE[type] || "gold"]).gt(0)) return false;
  return canPayCost(terminalCrisisCost(type, tier));
}

export function crisisCosts() {
  // actionScale = escalade par usage cumulé × majoration de fatigue (anti-spam).
  const actionScale = (1 + Object.values(state.crisisActions).reduce((sum, value) => sum + value, 0) * CRISIS_COST_ACTION_GROWTH) * regulFatigueCostMult();
  const r = rates();
  const cost = (resource, seconds) => D(r[resource]).max(0).mul(seconds).mul(actionScale).max(1);
  const S = CRISIS_COST_SECONDS;
  // Coûts des actions déblocables (registre) — même ancrage « secondes de prod ».
  // Les GAMBLES n'ont plus de coût-ressource : leur mise est en FAVEUR
  // (monnaie fermée, cf. AUGURY_STAKES et actions/augures.js).
  const regCosts = {};
  for (const a of REGULATION_ACTIONS) {
    if (a.kind === "gamble") continue;
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

// Délai d'inaction avant l'effondrement automatique, une fois la crise terminale
// ouverte (cf. CE-spec-idle-crises.md §A.4 ; tous déclencheurs depuis BUG-10) :
// une grâce laissant au joueur le temps d'intervenir avant que l'Édit
// d'effondrement ne tranche. Lu par checkAutoCollapse() (main.js) et par le
// compte à rebours de l'onglet Crises (PrestigeView).
export function autoCollapseDelay() {
  return 3 * 60 * 1000;
}
