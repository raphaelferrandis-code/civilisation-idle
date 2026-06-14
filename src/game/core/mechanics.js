"use strict";

import { state, renderCache, buildingById, upgradeById, defaultState } from './state.js';
import { buildings } from '../data/buildings.js';
import { upgrades, dogmaIds, PRESTIGE_TREE, PRESTIGE_DOGMAS } from '../data/upgrades.js';
import { eras } from '../data/world.js';
import { REGULATION_ACTIONS, REGULATION_ACTIONS_BY_ID, POLICY_BY_ID } from '../data/regulationActions.js';
import { getCityMapEngineTileMap } from '../map/cityMapBridge.js';
import { clamp01, clamp, fmt, labelFor, canPayCost } from './utils.js';
import { Decimal, D, toNum } from './num.js';
import {
  RUIN_POWER_EXP,
  RUIN_POWER_COEF,
  TIME_WEAR_BASE_RATE,
  COLLAPSE_PREP_MAX,
  RUIN_REFERENCE_POP,
  LEGITIMACY_POWER_EXP,
  LEGITIMACY_COEF,
  TIME_WEAR_MITIGATION_CAP,
  RUIN_GAIN_SCALE_FLOOR_LOG_DIV,
  FOUNDING_GRACE_BUILDINGS,
  RUIN_POP_DEPTH_REF,
  RUIN_POP_DEPTH_EXP,
  DYNASTY_BASE_RUINS,
  DYNASTY_COST_GROWTH,
  GRAND_RESET_LEGIT_BASE,
  MYTH_GATE_START_GR,
  ERA_RUIN_BONUS_PER_INDEX,
  INFRA_COVERAGE_POP_FACTOR,
  INFRA_COVERAGE_BUILDING_FACTOR,
  INFRA_COVERAGE_MIN_BASE,
  INFRA_COVERAGE_EFFECTIVE_CAP,
  INFRA_COVERAGE_MITIGATION_MULT,
  MITIGATION_LOG_COEF,
  MITIGATION_CAP,
  STABILIZER_DIRECT_FACTOR,
  STRUCTURAL_COVERAGE_DAMP,
  COMPLEXITY_COVERAGE_ABSORB,
  CRISIS_COST_SECONDS,
  CRISIS_COST_ACTION_GROWTH,
  FOYER_RELIEF_CAP,
  FOYER_REFORM,
  FATIGUE_EFFECT_PENALTY,
  FATIGUE_COST_PENALTY
} from './balance.js';
import {
  ICARE_PROD_MULT,
  SURCHAUFFE_PROD_MULT,
  ICARE_RUPTURE_MULT,
  BABEL_RUPTURE_MULT,
  ICARE_USURE_MULT,
  ATLAS_USURE_MULT,
  ATLAS_USURE_REDUCTION,
  OR_USURE_IMBALANCE_MULT,
  OR_HERITAGE_BALANCE_RATIO,
  OR_HERITAGE_USURE_RED,
  HEPH_USURE_MULT,
  PROMETHEE_FOOD_MULT,
  BRAISIERS_DURATION_MS,
  BRAISIERS_FOOD_MULT,
  BABEL_PROD_BASE_MULT,
  BABEL_ADJ_BONUS,
  OR_POP_THRESHOLD,
  OR_POP_PENALTY_PCT,
  HEPH_INFRA_MULT_BASE,
  HEPH_INFRA_MULT_GROWTH,
  SISYPHE_SCALE_REDUCTION,
  OR_RUPTURE_CAP,
  ATLAS_LEGIT_MAX_REDUCTION,
  ATRIDES_NEXT_RUN_PENALTY_MULT,
  ENEE_USURE_DEGRADED_MULT,
  ENEE_HERITAGE_DURATION_MS,
  ENEE_HERITAGE_BOOST_PER_COLLAPSE,
  CADMOS_CYCLE_BONUS_PCT,
  CADMOS_EPITAPH_BONUS_PCT,
  isMythEffectActive
} from '../data/myths.js';
import {
  ACTIVE_RUIN_FOOD_ENGINE_COST_MULT,
  ACTIVE_RUIN_GOLD_PROD_MULT,
  ACTIVE_RUIN_USURE_MULT,
  activeRuinMultiplier,
  hasActiveRuin
} from '../data/activeRuins.js';
import { EPITAPH_LEGACY_DURATION_MS, epitaphLegacyById } from '../data/epitaphs.js';
import { olympusAbyssProductionMultiplier } from './actions/olympus.js';

export function isUnlocked(item) {
  if (item.id && item.category && (state.buildings[item.id] || 0) > 0) return true;
  if (item.unlockCycles && state.cycles < item.unlockCycles) return false;
  if (item.unlockBuilding) {
    const have = state.buildings[item.unlockBuilding.id] || 0;
    if (have < item.unlockBuilding.count) return false;
  }
  if (item.group === "ruins" && item.cost?.ruins > 500000000) {
    const minCycles = item.cost.ruins > 50000000000 ? 10 : item.cost.ruins > 5000000000 ? 9 : 8;
    if (state.cycles < minCycles) return false;
  }
  return true;
}

export function totalBuildingCount() {
  return Object.values(state.buildings).reduce((sum, count) => sum + count, 0);
}

export function ruinMultiplier() {
  if (isMythEffectActive("mythe_du_chaos")) return 1;
  const effectiveRuins = toNum(state.ruins) + toNum(state.chaosRuinsBonus || 0);
  const base = 1 + Math.pow(effectiveRuins, RUIN_POWER_EXP) * RUIN_POWER_COEF;
  return has("oral_tradition") ? 1 + (base - 1) * 1.2 : base;
}

// Miroir Decimal de ruinMultiplier, pour le chemin tardif où ruins^0.62
// déborde le float. Doit évoluer en parallèle de la version float.
export function ruinMultiplierDec() {
  if (isMythEffectActive("mythe_du_chaos")) return new Decimal(1);
  const effectiveRuins = D(state.ruins).add(state.chaosRuinsBonus || 0);
  const base = effectiveRuins.pow(RUIN_POWER_EXP).mul(RUIN_POWER_COEF).add(1);
  return has("oral_tradition") ? base.sub(1).mul(1.2).add(1) : base;
}

function ruinEffects() {
  if (isMythEffectActive("mythe_du_chaos")) return { sums: {}, ownedCount: 0 };

  const signature = Object.keys(state.upgrades)
    .filter((id) => state.upgrades[id])
    .sort()
    .join("|");

  if (renderCache.cachedRuinEffects && renderCache.cachedRuinEffectsSignature === signature) return renderCache.cachedRuinEffects;

  const sums = {};
  let ownedCount = 0;
  for (const upgrade of upgrades) {
    if (upgrade.group !== "ruins" || !has(upgrade.id)) continue;
    ownedCount += 1;
    if (upgrade.effectType) sums[upgrade.effectType] = (sums[upgrade.effectType] || 0) + upgrade.amount;
  }

  renderCache.cachedRuinEffectsSignature = signature;
  renderCache.cachedRuinEffects = { sums, ownedCount };
  return renderCache.cachedRuinEffects;
}

export function ruinEffectSum(type) {
  return ruinEffects().sums[type] || 0;
}

export function ruinEffectMultiplier(type) {
  return 1 + ruinEffectSum(type);
}

function ownedRuinUpgradeCount() {
  return ruinEffects().ownedCount;
}

export function ownedRuinTreePurchaseCount() {
  return upgrades.filter((upgrade) => upgrade.group === "ruins" && !dogmaIds.has(upgrade.id) && has(upgrade.id)).length;
}

export function ownedRuinBranchPurchaseCount(branchId) {
  return PRESTIGE_TREE.filter((node) => node.branch === branchId && has(node.id)).length;
}

function chronicleEngineMultiplier() {
  if (!has("chronicle_engine")) return 1;
  const ownedBonus = ownedRuinUpgradeCount() * 0.03;
  // log10 Decimal : reste fini même quand les ruines dépassent le domaine float.
  const unspentBonus = D(state.ruins).add(1).log10() * 0.08;
  return 1 + ownedBonus + unspentBonus;
}

export function unspentRuinsPowerMultiplier() {
  return 1 + toNum(state.ruins) * ruinEffectSum("unspentRuinsPower");
}

export function unspentRuinsPowerMultiplierDec() {
  return D(state.ruins).mul(ruinEffectSum("unspentRuinsPower")).add(1);
}

export function institutionMultiplier() {
  if (isMythEffectActive("mythe_du_chaos")) return 1;
  return 1 + Math.pow(state.legitimacy, LEGITIMACY_POWER_EXP) * LEGITIMACY_COEF;
}

export function institutionMultiplierDec() {
  if (isMythEffectActive("mythe_du_chaos")) return new Decimal(1);
  return Decimal.pow(Math.max(0, state.legitimacy), LEGITIMACY_POWER_EXP).mul(LEGITIMACY_COEF).add(1);
}

function grandResetMultiplier() {
  if (isMythEffectActive("mythe_du_chaos")) return 1;
  return Math.pow(2, state.grandResetCount || 0);
}

function grandResetRuinMultiplier() {
  if (isMythEffectActive("mythe_du_chaos")) return 1;
  const base = Math.pow(2, state.grandResetCount || 0);
  const ragnarokBonus = (state.ragnarokHeritage && (state.grandResetCount || 0) >= 11) ? 4 : 1;
  return base * ragnarokBonus;
}

function marketMultiplier() {
  return 1 + state.buildings.bureaucracy * 0.08;
}

export function addProductionPenalty(type, amount) {
  let effectiveAmount = amount;
  // Héritage Atlas — Légitimité haute atténue les effets négatifs des crises
  if (state.atlasHeritage && (state.atlasLegitimite || 0) > 50) {
    const legBonus = ((state.atlasLegitimite || 50) - 50) / 50; // 0→1
    effectiveAmount *= (1 - legBonus * ATLAS_LEGIT_MAX_REDUCTION);
  }
  const current = state.crisisProduction[type] ?? 1;
  state.crisisProduction[type] = Math.max(0.1, current * (1 - effectiveAmount));
}

function crisisProductionMultiplier(type) {
  const global = state.crisisProduction.global ?? 1;
  return global * (state.crisisProduction[type] ?? 1) * policyProductionMultiplier(type);
}

// Levier C — coût de production CONTINU et RÉCUPÉRABLE des politiques actives
// (revient à 1 dès qu'on les désactive, contrairement à crisisProduction qui ne
// se rétablit jamais). Replié dans crisisProductionMultiplier → s'applique à
// toutes les ressources, chemins float et Decimal. Plancher 0.1 (max 90 % malus).
export function policyProductionMultiplier(type) {
  const policies = state.activePolicies;
  if (!policies || !policies.length) return 1;
  let m = 1;
  for (const id of policies) {
    const cost = POLICY_BY_ID[id]?.cost;
    if (!cost) continue;
    if (cost.global) m *= (1 - cost.global);
    if (cost[type]) m *= (1 - cost[type]);
  }
  return Math.max(0.1, m);
}

// Levier C — ralentissement de la MONTÉE de la Rupture par les politiques actives
// (ajouté à orderSlow dans tick.js, plafonné en commun à 0.8 → jamais un gel).
export function policyRiseSlow() {
  const policies = state.activePolicies;
  if (!policies || !policies.length) return 0;
  let s = 0;
  for (const id of policies) s += POLICY_BY_ID[id]?.riseSlow || 0;
  return s;
}

// Levier C — atténuation de la SURCHARGE par les politiques actives (plafond 0.8).
// La surcharge accélère la montée quand la cible dépasse 100 % ; la réduire ne fait
// que gagner du temps (la cible ne bouge pas) → sûr.
export function policyOvershootDamp() {
  const policies = state.activePolicies;
  if (!policies || !policies.length) return 0;
  let s = 0;
  for (const id of policies) s += POLICY_BY_ID[id]?.overshootDamp || 0;
  return Math.min(0.8, s);
}

// Levier C — étouffement CONTINU d'un foyer par les politiques actives (entre dans
// le plafond partagé foyerCut → jamais d'immortalité). Récupérable à l'extinction.
export function policyFoyerDamp(foyer) {
  const policies = state.activePolicies;
  if (!policies || !policies.length) return 0;
  let s = 0;
  for (const id of policies) s += POLICY_BY_ID[id]?.foyerDamp?.[foyer] || 0;
  return s;
}

export function regulationPolicyUnlocked(id, ctx = regulationContext()) {
  const p = POLICY_BY_ID[id];
  if (!p) return false;
  return !p.unlock || p.unlock(ctx);
}

// Fatigue de régulation — multiplicateurs dérivés de state.regulFatigue [0..1].
// Efficacité : réduit l'effet des actions (jamais sous 1 - FATIGUE_EFFECT_PENALTY).
// Coût : majore le coût des actions (jusqu'à ×(1 + FATIGUE_COST_PENALTY)).
export function regulFatigueEffectMult() {
  return 1 - (state.regulFatigue || 0) * FATIGUE_EFFECT_PENALTY;
}
export function regulFatigueCostMult() {
  return 1 + (state.regulFatigue || 0) * FATIGUE_COST_PENALTY;
}

function theocracyKnowledgeRate() {
  return has("trait_theocracy") ? toNum(state.gold) * 0.01 : 0;
}

function ruptureGrowthMultiplier() {
  return has("trait_theocracy") ? 1.25 : 1;
}

export function amplifyRuptureFactor(factor) {
  if (factor <= 1 || !has("trait_theocracy")) return factor;
  return 1 + (factor - 1) * ruptureGrowthMultiplier();
}

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

function cadmosProductionMultiplier(orientation) {
  return 1 + cadmosPermanentBonus(orientation) + cadmosCycleBonus(orientation);
}

function cadmosStabilityMultiplier() {
  const reduction = cadmosPermanentBonus("stability") + cadmosCycleBonus("stability");
  return Math.max(0.25, 1 - reduction);
}

export function activeEpitaphLegacy() {
  const active = state.activeEpitaphLegacy;
  const legacy = active ? epitaphLegacyById(active.id) : null;
  if (!legacy) return null;
  const startedAt = active.startedAt || state.cycleStartedAt || Date.now();
  const elapsed = Date.now() - startedAt;
  if (elapsed > EPITAPH_LEGACY_DURATION_MS) return null;
  return { ...active, definition: legacy, elapsed };
}

function epitaphLegacyEffect() {
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

export function nomadInfrastructureCap() {
  if (!has("trait_nomadism")) return null;
  return D(state.population).mul(0.015)
    .add(D(state.knowledge).mul(0.003))
    .add(80 + totalBuildingCount() * 5)
    .mul(0.7);
}

export function enforceInfrastructureCap() {
  const cap = nomadInfrastructureCap();
  if (cap !== null) state.infrastructure = D(state.infrastructure).min(cap);
}

export function infraMultiplier() {
  return 1 + Math.log10(toNum(state.infrastructure) + 1) * 0.018;
}

export function infraMultiplierDec() {
  return new Decimal(1 + D(state.infrastructure).add(1).log10() * 0.018);
}

export function globalMultiplier() {
  if (renderCache._frameGlobalMult !== null) return renderCache._frameGlobalMult;
  const normalizedBestEraIndex = (state.bestEraIndex || 0) * (19 / Math.max(1, eras.length - 1));
  const recurringAgeBonus = has("recurring_ages") ? 1 + normalizedBestEraIndex * 0.035 : 1;
  const icareMult       = isMythEffectActive("mythe_d_icare") ? ICARE_PROD_MULT : 1;
  const surchauffeMult  = (state.surchauffeEndTime && Date.now() < state.surchauffeEndTime) ? SURCHAUFFE_PROD_MULT : 1;
  
  const elapsed = Date.now() - (state.cycleStartedAt || Date.now());
  const atridesMult = (isMythEffectActive("mythe_atrides") && elapsed < 120_000) ? 3 : 1;
  
  let pactMult = 1;
  if (state.atridesPactActive) {
    if (elapsed < 120_000) {
      pactMult = 2.0;
    } else if (crisisOpen()) {
      pactMult = 0.5;
    }
  }
  
  const nextRunPenaltyMult = state.atridesNextRunPenaltyActive ? ATRIDES_NEXT_RUN_PENALTY_MULT : 1;

  let eneeBoost = 1;
  if (state.eneeHeritage && elapsed < ENEE_HERITAGE_DURATION_MS) {
    eneeBoost = 1 + ENEE_HERITAGE_BOOST_PER_COLLAPSE * Math.min(10, state.eneeCollapseCount || 0);
  }

  renderCache._frameGlobalMult = ruinMultiplier() * institutionMultiplier() * marketMultiplier() * infraMultiplier() * recurringAgeBonus * ruinEffectMultiplier("globalMult") * chronicleEngineMultiplier() * unspentRuinsPowerMultiplier() * grandResetMultiplier() * icareMult * surchauffeMult * atridesMult * pactMult * nextRunPenaltyMult * eneeBoost * olympusAbyssProductionMultiplier();
  return renderCache._frameGlobalMult;
}

// Miroir Decimal de globalMultiplier pour le chemin tardif (au-delà du float).
// Seuls ruinMultiplier, institutionMultiplier et unspentRuinsPowerMultiplier
// peuvent déborder : ils ont leur variante Decimal, le reste est borné.
export function globalMultiplierDec() {
  if (renderCache._frameGlobalMultDec !== null) return renderCache._frameGlobalMultDec;
  const normalizedBestEraIndex = (state.bestEraIndex || 0) * (19 / Math.max(1, eras.length - 1));
  const recurringAgeBonus = has("recurring_ages") ? 1 + normalizedBestEraIndex * 0.035 : 1;
  const icareMult       = isMythEffectActive("mythe_d_icare") ? ICARE_PROD_MULT : 1;
  const surchauffeMult  = (state.surchauffeEndTime && Date.now() < state.surchauffeEndTime) ? SURCHAUFFE_PROD_MULT : 1;
  const elapsed = Date.now() - (state.cycleStartedAt || Date.now());
  const atridesMult = (isMythEffectActive("mythe_atrides") && elapsed < 120_000) ? 3 : 1;
  let pactMult = 1;
  if (state.atridesPactActive) {
    if (elapsed < 120_000) pactMult = 2.0;
    else if (crisisOpen()) pactMult = 0.5;
  }
  const nextRunPenaltyMult = state.atridesNextRunPenaltyActive ? ATRIDES_NEXT_RUN_PENALTY_MULT : 1;
  let eneeBoost = 1;
  if (state.eneeHeritage && elapsed < ENEE_HERITAGE_DURATION_MS) {
    eneeBoost = 1 + ENEE_HERITAGE_BOOST_PER_COLLAPSE * Math.min(10, state.eneeCollapseCount || 0);
  }
  renderCache._frameGlobalMultDec = ruinMultiplierDec()
    .mul(institutionMultiplierDec())
    .mul(unspentRuinsPowerMultiplierDec())
    .mul(infraMultiplierDec())
    .mul(marketMultiplier() * recurringAgeBonus * ruinEffectMultiplier("globalMult") * chronicleEngineMultiplier() * grandResetMultiplier() * icareMult * surchauffeMult * atridesMult * pactMult * nextRunPenaltyMult * eneeBoost * olympusAbyssProductionMultiplier());
  return renderCache._frameGlobalMultDec;
}

function getBuildingSums() {
  if (renderCache._buildingSums) return renderCache._buildingSums;

  let positiveInstability = 0;
  let negativeInstability = 0;
  let buildingCount = 0;
  let stabilizerCount = 0; // bâtiments à instabilité négative (égouts, tribunaux…)
  const baseSumsByCategory = {};

  for (const b of buildings) {
    const count = state.buildings[b.id] || 0;
    buildingCount += count;

    if (b.instability > 0) {
      positiveInstability += b.instability * count;
    } else if (b.instability < 0) {
      negativeInstability += b.instability * count;
      stabilizerCount += count;
    }

    if (count > 0) {
      const synergy = buildingOutputMultiplier(b, count);
      const cat = b.category || "other";
      if (!baseSumsByCategory[cat]) {
        baseSumsByCategory[cat] = { pop: 0, food: 0, gold: 0, knowledge: 0, infra: 0 };
      }
      baseSumsByCategory[cat].pop += (b.pop || 0) * count * synergy;
      baseSumsByCategory[cat].food += (b.food || 0) * count * synergy;
      baseSumsByCategory[cat].gold += (b.gold || 0) * count * synergy;
      baseSumsByCategory[cat].knowledge += (b.knowledge || 0) * count * synergy;
      baseSumsByCategory[cat].infra += (b.infra || 0) * count * synergy;
    }
  }

  // Détection de débordement float : très tard, les synergies exponentielles
  // (1.025^count * 2^paliers) dépassent 1.8e308. On rebascule alors les sommes
  // en Decimal — rates() suivra le chemin Decimal.
  let overflow = false;
  for (const catSums of Object.values(baseSumsByCategory)) {
    if (!Number.isFinite(catSums.pop + catSums.food + catSums.gold + catSums.knowledge + catSums.infra)) {
      overflow = true;
      break;
    }
  }
  if (overflow) {
    for (const b of buildings) {
      const count = state.buildings[b.id] || 0;
      if (count <= 0) continue;
      const cat = b.category || "other";
      const catSums = baseSumsByCategory[cat];
      if (!(catSums.pop instanceof Decimal)) {
        baseSumsByCategory[cat] = { pop: D(0), food: D(0), gold: D(0), knowledge: D(0), infra: D(0) };
      }
      const target = baseSumsByCategory[cat];
      const synergy = buildingOutputMultiplierDec(b, count);
      target.pop = target.pop.add(synergy.mul((b.pop || 0) * count));
      target.food = target.food.add(synergy.mul((b.food || 0) * count));
      target.gold = target.gold.add(synergy.mul((b.gold || 0) * count));
      target.knowledge = target.knowledge.add(synergy.mul((b.knowledge || 0) * count));
      target.infra = target.infra.add(synergy.mul((b.infra || 0) * count));
    }
  }

  renderCache._buildingSums = {
    positiveInstability,
    negativeInstability,
    buildingCount,
    stabilizerCount,
    baseSumsByCategory,
    overflow
  };
  return renderCache._buildingSums;
}

// Cible de Rupture (instabilité) décomposée en sources additives, chacune bornée
// individuellement avant sommation :
//   - scarcity    : pénurie alimentaire face à la population
//   - inequality  : inégalité de richesse (or)
//   - complexity  : complexité administrative (bâtiments/savoir)
//   - dissent     : dissidence/légitimité insuffisante
//   - structural  : instabilité intrinsèque des bâtiments, portée par l'infra
//     et réduite en prise directe par les bâtiments stabilisants
// De cette somme on retranche la mitigation (couverture d'infrastructure en
// RATIO + légitimité, ruines, grâces de fondation/installation). Complexity,
// inequality et structural utilisent des plafonds DOUX (cap·x/(x+cap)) : la
// jauge reste sensible aux achats à toutes les échelles. Les constantes nues
// ci-dessous (0.55, 0.34, 0.22, 2.2, …) sont des poids/plafonds locaux non
// extraits ; les leviers d'équilibrage sont dans balance.js.
export function pressureBreakdown() {
  // Retourne le cache frame si disponible (invalidé au début de chaque intervalle de tick)
  if (renderCache._framePressure) return renderCache._framePressure;
  const popF = toNum(state.population);
  const foodF = toNum(state.food);
  const goldF = toNum(state.gold);
  const knowF = toNum(state.knowledge);
  const infraF = toNum(state.infrastructure);
  const population = Math.max(1, popF);

  const sums = getBuildingSums();
  const positiveInstability = sums.positiveInstability;
  const negativeInstability = sums.negativeInstability;
  const buildingCount = sums.buildingCount;
  // Les bâtiments stabilisants SONT de l'infrastructure : ils ne comptent ni
  // dans la demande de couverture, ni dans la charge administrative — sinon
  // acheter un égout AUGMENTERAIT paradoxalement la pression (mesuré : +0.116).
  const riskyBuildingCount = Math.max(0, buildingCount - (sums.stabilizerCount || 0));

  const cycleAgeSeconds = Math.max(0, (Date.now() - (state.cycleStartedAt || Date.now())) / 1000);
  // Terme bâtiments : décroissance quadratique sur une portée étendue — la
  // protection s'efface progressivement au lieu de tomber en mur à 65 bâtiments.
  const foundingGrace = Math.max(0, 1 - Math.min(1, state.cycles / 12))
    * Math.max(0, 1 - Math.min(1, population / 450000))
    * Math.pow(Math.max(0, 1 - Math.min(1, buildingCount / FOUNDING_GRACE_BUILDINGS)), 2)
    * 0.34;
  const settlingGrace = Math.max(0, 1 - Math.min(1, cycleAgeSeconds / 420))
    * Math.max(0, 1 - Math.min(1, state.cycles / 10))
    * 0.18;

  // Couverture d'infrastructure : infra jugée RELATIVEMENT à la taille de la
  // cité (≈1 = bien équipée), comme la nourriture l'est face à la population.
  // C'est ce ratio — discriminant à toutes les échelles — qui donne à l'infra
  // ses trois canaux anti-Rupture (mitigation, structural, complexity).
  let scarcityRaw, inequalityRaw, knowledgeStrain, infraCoverage;
  const coverageDemandBase = Math.max(INFRA_COVERAGE_MIN_BASE, riskyBuildingCount * INFRA_COVERAGE_BUILDING_FACTOR);
  if (Number.isFinite(popF) && Number.isFinite(foodF) && Number.isFinite(goldF) && Number.isFinite(knowF) && Number.isFinite(infraF)) {
    // Chemin float.
    scarcityRaw = Math.max(0, (population * 2.4 - foodF) / Math.max(120, population * 2.4));
    inequalityRaw = Math.max(0, goldF / Math.max(80, population * 1.25) - 0.55);
    knowledgeStrain = knowF / Math.max(180, infraF * 38 + 180);
    infraCoverage = infraF / Math.max(coverageDemandBase, population * INFRA_COVERAGE_POP_FACTOR);
  } else {
    // Au-delà du float : mêmes formules en ratios Decimal (les sorties restent bornées).
    const popDec = D(state.population).max(1);
    scarcityRaw = Math.max(0, popDec.mul(2.4).sub(state.food).div(popDec.mul(2.4).max(120)).toNumber());
    inequalityRaw = Math.max(0, D(state.gold).div(popDec.mul(1.25).max(80)).toNumber() - 0.55);
    knowledgeStrain = D(state.knowledge).div(D(state.infrastructure).mul(38).add(180).max(180)).toNumber();
    infraCoverage = D(state.infrastructure).div(popDec.mul(INFRA_COVERAGE_POP_FACTOR).max(coverageDemandBase)).toNumber();
  }
  if (!Number.isFinite(infraCoverage)) infraCoverage = 1e6; // infra >> pop au-delà du float

  // Plafond doux (Michaelis-Menten) : approche le plafond sans jamais l'atteindre
  // → la dérivée n'est jamais nulle, chaque achat garde un effet mesurable.
  const softCap = (x, cap) => (x <= 0 ? 0 : cap * x / (x + cap));

  // Couverture EFFECTIVE plafonnée en doux : le stock d'infra (jamais consommé)
  // finit toujours par dépasser la demande sur un long cycle — sans ce plafond,
  // l'accumulation passive tue la Rupture (couverture 16 mesurée, cible 0.15).
  const effCoverage = softCap(infraCoverage, INFRA_COVERAGE_EFFECTIVE_CAP);
  const complexityRaw = Math.max(
    0,
    riskyBuildingCount / (26 * (1 + effCoverage * COMPLEXITY_COVERAGE_ABSORB)) + knowledgeStrain - 0.35
  );
  const dissentRaw = Math.max(0, state.cycles * 0.035 + Math.log10(toNum(state.ruins) + 1) * 0.04 + state.instability * 0.12);

  // Étape 2 : relief temporaire par foyer (multiplicatif, décroît dans le tick).
  // Chaque action de régulation calme SON foyer → la barre descend en prise
  // directe. `rationRelief` (ancien, propre à Rationner) est désormais unifié
  // dans fr.scarcity. Plafonné < 1 (cf. FOYER_RELIEF_CAP) : un foyer n'est jamais
  // annulé, donc tenir la jauge reste un délai et non une immortalité.
  const fr = state.foyerRelief || {};
  const rf = state.foyerReform || {};
  // Réduction d'un foyer = apaisement temporaire (fr, décline) + réforme durable
  // (rf, permanente), PLAFONNÉE en commun à FOYER_RELIEF_CAP. Le plafond partagé
  // garantit l'invariant anti-immortalité : la réforme rend le recul durable,
  // sans jamais dépasser le maximum déjà atteignable par l'apaisement (cf.
  // FOYER_REFORM dans balance.js, mesuré par measure-foyers.js).
  const foyerCut = (key) => Math.min(FOYER_RELIEF_CAP, (fr[key] || 0) + (rf[key] || 0) + policyFoyerDamp(key));
  const scarcity = Math.max(0, Math.min(0.7, scarcityRaw * 0.55)) * (1 - foyerCut("scarcity"));
  const inequality = softCap(inequalityRaw * 0.28 + (state.buildings.markets || 0) * 0.006 + (state.buildings.guilds || 0) * 0.008, 0.55) * (1 - foyerCut("inequality"));
  const complexity = softCap(complexityRaw * 0.34, 0.75) * (1 - foyerCut("complexity"));
  const dissentRelief = has("ruin_liturgy") ? 0.035 + Math.min(0.06, toNum(state.ruins) * 0.0007) : 0;
  const dissent = Math.max(0, Math.min(0.55, dissentRaw * 0.22) - dissentRelief) * (1 - foyerCut("dissent"));
  // Charge structurelle : les bâtiments stabilisants (instabilité négative)
  // soustraient en PRISE DIRECTE, et l'infrastructure « porte » la charge.
  const structuralNet = Math.max(0, positiveInstability + negativeInstability * STABILIZER_DIRECT_FACTOR);
  const structural = softCap(structuralNet * 2.2 / (1 + effCoverage * STRUCTURAL_COVERAGE_DAMP), 0.75);
  const institutionalLog = Math.log10(1 + effCoverage * INFRA_COVERAGE_MITIGATION_MULT + state.legitimacy * 0.16);
  const mitigation = Math.min(MITIGATION_CAP, institutionalLog * MITIGATION_LOG_COEF + ruinEffectSum("stability") + foundingGrace + settlingGrace);
  const baseTotal = Math.max(0, (scarcity + inequality + complexity + dissent + structural + ruinEffectSum("ruptureHaste")) * ruptureGrowthMultiplier() - mitigation);
  const total = hasDoctrine("acier") ? baseTotal * 1.25 : baseTotal;

  renderCache._framePressure = { scarcity, inequality, complexity, dissent, structural, mitigation, total };
  return renderCache._framePressure;
}

export function cityVitals() {
  // Retourne le cache frame si disponible (invalidé au début de chaque intervalle de tick)
  if (renderCache._frameVitals) return renderCache._frameVitals;
  const popF = toNum(state.population);
  const foodF = toNum(state.food);
  const goldF = toNum(state.gold);
  const knowF = toNum(state.knowledge);
  let foodScore, goldScore, knowledgeScore;
  if (Number.isFinite(popF) && Number.isFinite(foodF) && Number.isFinite(goldF) && Number.isFinite(knowF)) {
    // Chemin float : identique bit-à-bit à l'implémentation pré-Decimal.
    foodScore = foodF / Math.max(660, popF * 24);
    goldScore = goldF / Math.max(80, popF * 1.4);
    knowledgeScore = knowF / Math.max(90, popF * 0.9);
  } else {
    // Au-delà du float : les ratios de deux Decimals restent significatifs.
    foodScore = D(state.food).div(D(state.population).mul(24).max(660)).toNumber();
    goldScore = D(state.gold).div(D(state.population).mul(1.4).max(80)).toNumber();
    knowledgeScore = D(state.knowledge).div(D(state.population).mul(0.9).max(90)).toNumber();
  }
  const foodBonus = clamp((foodScore - 0.32) * 0.45, -0.18, 0.12);
  const goldBonus = clamp(goldScore - 0.2, -0.12, 0.22);
  const knowledgeBonus = clamp(knowledgeScore - 0.18, -0.1, 0.26);

  renderCache._frameVitals = {
    foodScore,
    goldScore,
    knowledgeScore,
    foodBonus,
    goldBonus,
    knowledgeBonus,
    populationMult: Math.max(0.7, 1 + foodBonus),
    foodMult: 1,
    goldMult: Math.max(0.85, 1 + goldBonus),
    knowledgeMult: Math.max(0.85, 1 + knowledgeBonus),
    infraMult: Math.max(0.85, 1 + goldBonus * 0.35 + knowledgeBonus * 0.22),
    instabilityRelief: isMythEffectActive("mythe_d_atlas")
      ? 0
      : Math.max(0, clamp01(foodScore - 0.92) * 0.018 + knowledgeBonus * 0.06)
  };
  return renderCache._frameVitals;
}

// rates() retourne les 5 taux de ressources en Decimal (le tick fait .add) et
// `instability` en number natif (jauge bornée 0-1).
// Deux chemins qui DOIVENT évoluer ensemble :
//   - float : identique bit-à-bit à l'implémentation pré-Decimal tant que tout
//     reste fini (cas de 99,9 % des parties — et garantie golden-master) ;
//   - Decimal : miroir activé dès qu'une valeur déborde ~1.8e308.
export function rates(vitals = cityVitals(), pressure = pressureBreakdown()) {
  if (renderCache._frameRates) return renderCache._frameRates;

  const _babelExpMult  = babelExponentialMult();
  const _babelAdjMult  = babelAdjacencyMultiplier();
  const _hephInfraFactor = hephInfraMult();
  const babelActive = isMythEffectActive("mythe_de_babel");

  const sums = getBuildingSums();
  const baseSumsByCategory = sums.baseSumsByCategory;

  // Facteurs « petits » partagés par les deux chemins (tous bornés).
  let prometheeFoodMult = 1;
  if (isMythEffectActive("mythe_de_promethee")) prometheeFoodMult *= PROMETHEE_FOOD_MULT;
  if (state.prometheeBraisiers) {
    const cycleElapsed = Date.now() - (state.cycleStartedAt || Date.now());
    if (cycleElapsed < BRAISIERS_DURATION_MS) prometheeFoodMult *= BRAISIERS_FOOD_MULT;
  }
  const _orPenaltyMult = orProdPenaltyMult();
  const _epitaphEffect = epitaphLegacyEffect();
  const _rawInstability = Math.max(0, pressure.total - vitals.instabilityRelief)
    * (isMythEffectActive("mythe_d_icare") ? ICARE_RUPTURE_MULT : 1)
    * (babelActive ? BABEL_RUPTURE_MULT : 1)
    * cadmosStabilityMultiplier()
    * _epitaphEffect.ruptureMult;
  const instability = isMythEffectActive("mythe_age_or")
    ? Math.min(OR_RUPTURE_CAP, _rawInstability)
    : _rawInstability;
  const atridesDrain = isMythEffectActive("mythe_atrides") && !state.atridesDrainDisabled;
  const eneeDegraded = isMythEffectActive("mythe_d_enee") && state.eneeDegraded;

  const popF = toNum(state.population);
  const knowF = toNum(state.knowledge);

  // ── Chemin float (rapide et exact sous le plafond float) ────────────────
  if (!sums.overflow) {
    let pop = 0.04;
    let food = popF * 0.012;
    let gold = Math.max(0, popF - 25) * 0.0015;
    let knowledge = 0;
    let infra = 0;

    for (const [cat, catSums] of Object.entries(baseSumsByCategory)) {
      const babelMult = (babelActive && cat === state.babelCategory) ? _babelExpMult : 1;
      const totalMult = babelMult * _babelAdjMult;
      const hephBonus = (_hephInfraFactor > 1 && cat === "infra") ? _hephInfraFactor : 1;

      pop += catSums.pop * totalMult;
      food += catSums.food * totalMult;
      gold += catSums.gold * totalMult;
      knowledge += catSums.knowledge * totalMult;
      infra += catSums.infra * totalMult * hephBonus;
    }

    food *= prometheeFoodMult;

    const mult = globalMultiplier();
    if (has("root_cellars")) food *= 1.6;
    if (has("buried_coins")) gold *= 1.6;
    if (has("charcoal_tablets")) knowledge *= 1.6;
    food *= ruinEffectMultiplier("foodMult");
    gold *= ruinEffectMultiplier("goldMult") * (hasDoctrine("parchemin") ? 0.85 : 1);
    knowledge *= ruinEffectMultiplier("knowledgeMult") * (hasDoctrine("parchemin") ? 1.3 : 1);
    infra *= ruinEffectMultiplier("infraMult") * (hasDoctrine("sillon") ? 1.25 : 1);

    let populationRate = pop * mult * _epitaphEffect.globalMult * vitals.populationMult * ruinEffectMultiplier("populationMult") * crisisProductionMultiplier("population") * _orPenaltyMult;
    let foodRate = food * Math.sqrt(mult) * _epitaphEffect.globalMult * _epitaphEffect.foodMult * vitals.foodMult * crisisProductionMultiplier("food") * terminalPrepMultiplier("food") * _orPenaltyMult * cadmosProductionMultiplier("food");
    let goldRate = gold * Math.sqrt(mult) * _epitaphEffect.globalMult * _epitaphEffect.goldMult * (1 + state.buildings.markets * 0.032 + state.buildings.guilds * 0.024) * vitals.goldMult * crisisProductionMultiplier("gold") * terminalPrepMultiplier("gold") * _orPenaltyMult * (hasActiveRuin(state, "age_or") ? ACTIVE_RUIN_GOLD_PROD_MULT : 1) * cadmosProductionMultiplier("gold");
    let knowledgeRate = knowledge * mult * _epitaphEffect.globalMult * _epitaphEffect.knowledgeMult * (1 + Math.log10(popF + 10) * 0.05) * vitals.knowledgeMult * crisisProductionMultiplier("knowledge") * terminalPrepMultiplier("knowledge") * _orPenaltyMult + theocracyKnowledgeRate();
    let infrastructureRate = infra * mult * _epitaphEffect.globalMult * _epitaphEffect.infraMult * (1 + Math.log10(knowF + 10) * 0.04) * vitals.infraMult * crisisProductionMultiplier("infrastructure") * terminalPrepMultiplier("infrastructure") * _orPenaltyMult;

    if (atridesDrain) {
      foodRate *= 0.9;
      goldRate *= 0.9;
      knowledgeRate *= 0.9;
      infrastructureRate *= 0.9;
    }
    if (eneeDegraded) {
      foodRate = 0;
      goldRate = 0;
    }

    if (Number.isFinite(populationRate) && Number.isFinite(foodRate) && Number.isFinite(goldRate)
      && Number.isFinite(knowledgeRate) && Number.isFinite(infrastructureRate)) {
      const baseRates = {
        population: new Decimal(populationRate),
        food: new Decimal(foodRate),
        gold: new Decimal(goldRate),
        knowledge: new Decimal(knowledgeRate),
        infrastructure: new Decimal(infrastructureRate),
        instability
      };
      renderCache._frameRates = baseRates;
      return baseRates;
    }
  }

  // ── Chemin Decimal (au-delà du plafond float) ────────────────────────────
  const babelExpD = babelExponentialMultDec();
  let popD = new Decimal(0.04);
  let foodD = D(state.population).mul(0.012);
  let goldD = D(state.population).sub(25).max(0).mul(0.0015);
  let knowledgeD = new Decimal(0);
  let infraD = new Decimal(0);

  for (const [cat, catSums] of Object.entries(baseSumsByCategory)) {
    const babelMultD = (babelActive && cat === state.babelCategory) ? babelExpD : new Decimal(1);
    const totalMultD = babelMultD.mul(_babelAdjMult);
    const hephBonus = (_hephInfraFactor > 1 && cat === "infra") ? _hephInfraFactor : 1;

    popD = popD.add(D(catSums.pop).mul(totalMultD));
    foodD = foodD.add(D(catSums.food).mul(totalMultD));
    goldD = goldD.add(D(catSums.gold).mul(totalMultD));
    knowledgeD = knowledgeD.add(D(catSums.knowledge).mul(totalMultD));
    infraD = infraD.add(D(catSums.infra).mul(totalMultD).mul(hephBonus));
  }

  foodD = foodD.mul(prometheeFoodMult);

  const multD = globalMultiplierDec();
  const sqrtMultD = multD.sqrt();
  if (has("root_cellars")) foodD = foodD.mul(1.6);
  if (has("buried_coins")) goldD = goldD.mul(1.6);
  if (has("charcoal_tablets")) knowledgeD = knowledgeD.mul(1.6);
  foodD = foodD.mul(ruinEffectMultiplier("foodMult"));
  goldD = goldD.mul(ruinEffectMultiplier("goldMult") * (hasDoctrine("parchemin") ? 0.85 : 1));
  knowledgeD = knowledgeD.mul(ruinEffectMultiplier("knowledgeMult") * (hasDoctrine("parchemin") ? 1.3 : 1));
  infraD = infraD.mul(ruinEffectMultiplier("infraMult") * (hasDoctrine("sillon") ? 1.25 : 1));

  const theocracyD = has("trait_theocracy") ? D(state.gold).mul(0.01) : new Decimal(0);
  const baseRates = {
    population: popD.mul(multD).mul(_epitaphEffect.globalMult * vitals.populationMult * ruinEffectMultiplier("populationMult") * crisisProductionMultiplier("population") * _orPenaltyMult),
    food: foodD.mul(sqrtMultD).mul(_epitaphEffect.globalMult * _epitaphEffect.foodMult * vitals.foodMult * crisisProductionMultiplier("food") * terminalPrepMultiplier("food") * _orPenaltyMult * cadmosProductionMultiplier("food")),
    gold: goldD.mul(sqrtMultD).mul(_epitaphEffect.globalMult * _epitaphEffect.goldMult * (1 + state.buildings.markets * 0.032 + state.buildings.guilds * 0.024) * vitals.goldMult * crisisProductionMultiplier("gold") * terminalPrepMultiplier("gold") * _orPenaltyMult * (hasActiveRuin(state, "age_or") ? ACTIVE_RUIN_GOLD_PROD_MULT : 1) * cadmosProductionMultiplier("gold")),
    knowledge: knowledgeD.mul(multD).mul(_epitaphEffect.globalMult * _epitaphEffect.knowledgeMult * (1 + D(state.population).add(10).log10() * 0.05) * vitals.knowledgeMult * crisisProductionMultiplier("knowledge") * terminalPrepMultiplier("knowledge") * _orPenaltyMult).add(theocracyD),
    infrastructure: infraD.mul(multD).mul(_epitaphEffect.globalMult * _epitaphEffect.infraMult * (1 + D(state.knowledge).add(10).log10() * 0.04) * vitals.infraMult * crisisProductionMultiplier("infrastructure") * terminalPrepMultiplier("infrastructure") * _orPenaltyMult),
    instability
  };

  if (atridesDrain) {
    baseRates.food = baseRates.food.mul(0.9);
    baseRates.gold = baseRates.gold.mul(0.9);
    baseRates.knowledge = baseRates.knowledge.mul(0.9);
    baseRates.infrastructure = baseRates.infrastructure.mul(0.9);
  }
  if (eneeDegraded) {
    baseRates.food = new Decimal(0);
    baseRates.gold = new Decimal(0);
  }

  renderCache._frameRates = baseRates;
  return baseRates;
}

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

function babelAdjacencyMultiplier() {
  if (!state.babelHeritage) return 1;
  const tileMap = getCityMapEngineTileMap();
  if (!tileMap || tileMap.size === 0) return 1;
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  let totalBonus = 0;
  let count = 0;
  for (const tile of tileMap.values()) {
    const cat = buildingById[tile.buildingId]?.category;
    if (!cat) continue;
    let adj = 0;
    for (const [dx, dy] of DIRS) {
      const nb = tileMap.get((tile.gx + dx) + "," + (tile.gy + dy));
      if (nb && buildingById[nb.buildingId]?.category === cat) adj++;
    }
    totalBonus += adj * BABEL_ADJ_BONUS;
    count++;
  }
  return count > 0 ? 1 + totalBonus / count : 1;
}

function orProdPenaltyMult() {
  if (!isMythEffectActive("mythe_age_or")) return 1;
  if (D(state.population).lte(OR_POP_THRESHOLD)) return 1;
  const excess = toNum(state.population) - OR_POP_THRESHOLD;
  return Math.max(0.1, 1 - excess * OR_POP_PENALTY_PCT);
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

function hephInfraMult() {
  if (!isMythEffectActive("mythe_d_hephaistos")) return 1;
  const elapsed = (Date.now() - (state.cycleStartedAt || Date.now())) / 60_000;
  return HEPH_INFRA_MULT_BASE + elapsed * HEPH_INFRA_MULT_GROWTH;
}

export function buildingOutputMultiplier(building, count) {
  if (count <= 0) return 1;
  const milestone = Math.floor(count / 25);
  if (building.category !== "city") {
    return Math.pow(1.015, count) * Math.pow(1.5, milestone) * (1 + Math.log10(count + 1) * 0.12);
  }
  const continuousGrowth = Math.pow(1.025, count);
  const milestoneGrowth = Math.pow(2, milestone);
  const earlySurge = 1 + Math.log10(count + 1) * 0.18;
  return continuousGrowth * milestoneGrowth * earlySurge;
}

// Miroir Decimal de buildingOutputMultiplier (synergies au-delà du float).
export function buildingOutputMultiplierDec(building, count) {
  if (count <= 0) return new Decimal(1);
  const milestone = Math.floor(count / 25);
  if (building.category !== "city") {
    return Decimal.pow(1.015, count).mul(Decimal.pow(1.5, milestone)).mul(1 + Math.log10(count + 1) * 0.12);
  }
  return Decimal.pow(1.025, count).mul(Decimal.pow(2, milestone)).mul(1 + Math.log10(count + 1) * 0.18);
}

export function buildingMilestoneInfo(building, count) {
  const milestone = Math.floor(count / 25);
  if (milestone <= 0) return null;
  const bonus = building.category === "city" ? Math.pow(2, milestone) : Math.pow(1.5, milestone);
  return {
    milestone,
    bonus,
    label: `x${fmt(bonus)} atteint`
  };
}

export function has(id) {
  return Boolean(state.upgrades[id]);
}

export function hasDoctrine(id) {
  return state.dynastyDoctrine === id;
}

// Retourne le facteur de scaling effectif d'un bâtiment.
// Héritage Sisyphe : réduit la croissance du scaling de SISYPHE_SCALE_REDUCTION.
function buildingEffectiveScale(building) {
  if (!state.sisypheHeritage) return building.scale;
  return 1 + (building.scale - 1) * (1 - SISYPHE_SCALE_REDUCTION);
}

function buildingDiscount(building) {
  let discount = 1;
  // -5% par dynastie fondée, plafonné à -60% (sinon trivialise la progression longue)
  if (has("reseau_routes")) discount *= Math.max(0.40, Math.pow(0.95, state.dynastyCount));
  if (has("broken_milestones") && building.category === "city") discount *= 0.94;
  if (has("trait_nomadism")) discount *= 0.7;
  if (building.category === "city") discount *= Math.max(0.35, 1 - ruinEffectSum("cityDiscount"));
  if (building.category === "knowledge") discount *= Math.max(0.35, 1 - ruinEffectSum("knowledgeDiscount"));
  if (has("old_wall_maps") && building.category === "infra") discount *= 0.92;
  if (building.category === "infra") discount *= Math.max(0.35, 1 - ruinEffectSum("infraDiscount"));
  return discount;
}

// Coût unitaire base * scale^count * discount, en Decimal.
// Chemin float tant que le résultat est fini (identique bit-à-bit sous 2^53),
// arithmétique Decimal seulement au-delà de ~1.8e308.
function scaledCost(base, scale, count, discount) {
  const flt = base * Math.pow(scale, count) * discount;
  if (Number.isFinite(flt)) return new Decimal(flt);
  return D(scale).pow(count).mul(base).mul(discount);
}

export function buildingCostAt(building, count) {
  const discount = buildingDiscount(building);
  const scale = buildingEffectiveScale(building);
  const costs = { [building.currency]: scaledCost(building.base, scale, count, discount) };
  if (building.extraCost) {
    for (const [currency, amount] of Object.entries(building.extraCost)) {
      const extra = scaledCost(amount, scale, count, discount);
      costs[currency] = costs[currency] ? costs[currency].add(extra) : extra;
    }
  }
  return costs;
}

export function maxBuyAmount(building) {
  let lo = 0, hi = 500;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (canPayCost(buildingBatchCost(building, mid))) lo = mid;
    else hi = mid - 1;
  }
  return Math.max(1, lo);
}

export function buildingBatchCost(building, amount = state.buyAmount) {
  const resolved = amount === "max" ? 1 : amount;
  const batchSize = clamp(Math.floor(Number(resolved) || 1), 1, 500);
  const count = state.buildings[building.id] || 0;
  // Calcule le discount et le scale effectif une seule fois pour tout le lot
  const discount = buildingDiscount(building);
  const scale    = buildingEffectiveScale(building);
  // Somme fermée de la série géométrique : coûts du palier count à count+batchSize-1.
  // Chemin float tant que le résultat est fini (identique sous 2^53), Decimal au-delà.
  const geomSum = (B, s, n, k) => {
    const flt = s === 1 ? B * k : B * Math.pow(s, n) * (Math.pow(s, k) - 1) / (s - 1);
    if (Number.isFinite(flt)) return new Decimal(flt * discount);
    return s === 1
      ? D(B).mul(k).mul(discount)
      : D(s).pow(n).mul(B).mul(D(s).pow(k).sub(1)).div(s - 1).mul(discount);
  };
  const costs = {};
  const mainSum = geomSum(building.base, scale, count, batchSize);
  costs[building.currency] = costs[building.currency] ? costs[building.currency].add(mainSum) : mainSum;
  if (building.extraCost) {
    for (const [currency, base] of Object.entries(building.extraCost)) {
      const extraSum = geomSum(base, scale, count, batchSize);
      costs[currency] = costs[currency] ? costs[currency].add(extraSum) : extraSum;
    }
  }
  // Mythe de Sisyphe : malédiction cumulative sur tous les coûts
  if (isMythEffectActive("mythe_de_sisyphe") && (state.sisypheMult || 1) > 1) {
    const mult = state.sisypheMult;
    for (const currency of Object.keys(costs)) costs[currency] = costs[currency].mul(mult);
  }
  if (hasActiveRuin(state, "promethee") && building.food > 0) {
    for (const currency of Object.keys(costs)) costs[currency] = costs[currency].mul(ACTIVE_RUIN_FOOD_ENGINE_COST_MULT);
  }
  return costs;
}

export function archaeologyCost() {
  const remembered = Object.values(state.lastCollapsedBuildings || {}).reduce((sum, count) => sum + count, 0);
  return D(state.population).mul(0.12).max(Math.max(25000, remembered * 8500));
}

export function archaeologyCandidates() {
  const entries = Object.entries(state.lastCollapsedBuildings || {})
    .filter(([, count]) => count > 0)
    .map(([id, count]) => ({ building: buildingById[id], count }))
    .filter((e) => e.building)
    .sort((a, b) => (b.building.base * Math.max(1, b.count)) - (a.building.base * Math.max(1, a.count)));
  const collapsed = entries.map((e) => e.building).slice(0, 5);
  if (collapsed.length >= 3) return collapsed;
  // Compléter avec des bâtiments avancés si peu de collapsed
  const seen = new Set(collapsed.map((b) => b.id));
  const advanced = buildings.filter((b) => (b.base >= 100000 || b.category !== "city") && !seen.has(b.id));
  const seed = Math.max(0, state.cycles * 31 + state.dynastyCount * 17 + totalBuildingCount());
  const extras = [];
  for (let i = 0; extras.length < 5 - collapsed.length && i < advanced.length * 2; i++) {
    const b = advanced[(seed + i * 7) % advanced.length];
    if (b && !extras.find((e) => e.id === b.id)) extras.push(b);
  }
  return [...collapsed, ...extras];
}

export function canExhume() {
  return has("skill_archaeology") && !state.archaeologyUsed && D(state.knowledge).gte(archaeologyCost());
}

export function upgradeCostText(upgrade) {
  return Object.entries(upgrade.cost).map(([key, value]) => `${fmt(value)} ${labelFor(key)}`).join(" + ");
}

export function canBuyUpgrade(upgrade) {
  if (dogmaIds.has(upgrade.id)) return checkDogmaAvailability(upgrade.id) === "available";
  if (upgrade.group === "ruins") return checkNodeAvailability(upgrade.id) === "available";
  return !has(upgrade.id) && canPayCost(upgrade.cost);
}

function prestigeNodeFor(id) {
  return PRESTIGE_TREE.find((node) => node.id === id);
}

export function checkNodeAvailability(id) {
  const node = prestigeNodeFor(id);
  const upgrade = upgradeById[id];
  if (!node || !upgrade) return "locked";
  if (has(id)) return "purchased";
  if (upgrade.conflictsWith && has(upgrade.conflictsWith)) return "blocked";
  if (!isUnlocked(upgrade)) return "locked";
  if (node.requires && !has(node.requires)) return "locked";
  return canPayCost(node.cost) ? "available" : "locked";
}

function dogmaFor(id) {
  return PRESTIGE_DOGMAS.find((dogma) => dogma.id === id);
}

export function checkDogmaAvailability(id) {
  const dogma = dogmaFor(id);
  const upgrade = upgradeById[id];
  if (!dogma || !upgrade) return "locked";
  if (has(id)) return "purchased";
  if (ownedRuinBranchPurchaseCount(dogma.branch) < dogma.requiredPurchases) return "locked";
  return "available";
}

export function currentEraIndex() {
  let index = 0;
  const population = D(state.population);
  for (let i = 0; i < eras.length; i += 1) {
    if (population.gte(eras[i].at)) index = i;
  }
  return index;
}

export function nextEraProgress(index) {
  const current = eras[index];
  const next = eras[index + 1];
  if (!next) return 1;
  const base = Math.max(1, current.at);
  const span = Math.log10(next.at) - Math.log10(base);
  const done = D(state.population).max(base).log10() - Math.log10(base);
  return Math.max(0, Math.min(1, done / span));
}

export function heritageQuality() {
  if (!crisisOpen()) return "En formation";
  const gain = ruinGain();
  const age = Math.max(1, (Date.now() - state.cycleStartedAt) / 1000);
  if (gain.gte(30) || (gain.gte(16) && age >= 1200)) return "Mythique";
  if (gain.gte(12) || (gain.gte(7) && age >= 600)) return "Riche";
  if (gain.gte(4) || age >= 300) return "Stable";
  return "Fragile";
}

function crisisProgress() {
  return Math.max(state.instability, state.timeWear || 0);
}

export function crisisOpen() {
  return state.instability >= 1 || (state.timeWear || 0) >= 1;
}

// projected=true : calcule le gain « si on s'effondrait maintenant » même hors
// crise (pour l'indicateur d'aide à la décision). Sans argument : comportement
// inchangé (0 hors crise) → toutes les autres dépendances restent identiques.
export function ruinGain(projected = false) {
  if (!projected && !crisisOpen()) return new Decimal(0);
  const age = Math.max(1, (Date.now() - state.cycleStartedAt) / 1000);
  const peaks = state.cyclePeaks || defaultState().cyclePeaks;
  const peakPopulation = toNum(peaks.population);
  const patience = age < 120
    ? 0.18
    : age < 300
      ? 0.45
      : age < 600
        ? 0.8
        : Math.min(1.75, 1 + Math.log10(age / 600 + 1) * 0.55);
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
  const preparation = 1 + Math.min(COLLAPSE_PREP_MAX, state.collapsePreparation || 0);
  const doctrineRuinMod = hasDoctrine("acier") ? 1.4 : hasDoctrine("sillon") ? 0.8 : 1;
  const atridesRuinMod = (isMythEffectActive("mythe_atrides") && state.atridesDrainDisabled) ? 1.5 : 1;
  const elapsed = (Date.now() - state.cycleStartedAt) / 1000;
  const sedimentMod = elapsed >= 604800 ? 5.0 : elapsed >= 259200 ? 2.35 : elapsed >= 86400 ? 1.45 : elapsed >= 28800 ? 1.15 : elapsed >= 3600 ? 1.02 : 1.0;
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
  const eraFlatBonus = ERA_RUIN_BONUS_PER_INDEX * (state.bestEraIndex || 0);
  const raw = ageDepth * populationDepth * civicDepth * patience * pressure * preparation * ruinEffectMultiplier("ruinGain") * doctrineRuinMod * atridesRuinMod * activeRuinMultiplier(state) * grandResetRuinMultiplier() * sedimentMod;
  // Chemin float (identique sous 2^53) ; au-delà du domaine float, seul
  // populationDepth peut exploser : on le recalcule en Decimal.
  if (Number.isFinite(raw)) return new Decimal(Math.max(minGain, Math.floor(raw)) + eraFlatBonus);
  const populationDepthDec = D(peaks.population).max(10).div(RUIN_POP_DEPTH_REF).pow(RUIN_POP_DEPTH_EXP).max(0.35);
  const restProduct = ageDepth * civicDepth * patience * pressure * preparation * ruinEffectMultiplier("ruinGain") * doctrineRuinMod * atridesRuinMod * activeRuinMultiplier(state) * grandResetRuinMultiplier() * sedimentMod;
  return populationDepthDec.mul(restProduct).floor().max(minGain).add(eraFlatBonus);
}

// Seuil de ruines requis pour fonder une dynastie : croît à chaque fondation
// depuis le dernier Grand Reset (anti-spam — 1820 fondations mesurées avec un
// seuil fixe), remis à zéro par le GR pour que chaque boucle re-déroule l'arc
// dynastique depuis un seuil accessible.
export function dynastyRuinsThreshold() {
  return DYNASTY_BASE_RUINS * Math.pow(DYNASTY_COST_GROWTH, state.dynastiesSinceGR || 0);
}

// Coût en légitimité du n-ième Grand Reset. Le 1er est couvert par l'achat de
// l'upgrade « grand_reset » ; chaque suivant double (la récompense double aussi).
export function grandResetLegitimacyCost(nextCount) {
  return nextCount <= 1 ? 0 : GRAND_RESET_LEGIT_BASE * Math.pow(2, nextCount - 1);
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
    1 + toNum(state.infrastructure) * 0.0015 + toNum(state.knowledge) * 0.000012 + state.legitimacy * 0.035
  );
  const doctrineMod = hasDoctrine("sillon") ? 0.7 : 1;
  const icareMult        = isMythEffectActive("mythe_d_icare") ? ICARE_USURE_MULT : 1;
  const atlasMult        = isMythEffectActive("mythe_d_atlas") ? ATLAS_USURE_MULT : 1;
  const atlasHeritRed    = state.atlasHeritage ? (1 - ATLAS_USURE_REDUCTION) : 1;
  const orImbalanceMult  = (isMythEffectActive("mythe_age_or") && state.orUsureImbalance) ? OR_USURE_IMBALANCE_MULT : 1;
  const orHeritageMult   = orHeritageUsureMult();
  const hephMult         = isMythEffectActive("mythe_d_hephaistos") ? HEPH_USURE_MULT : 1;
  const eneeUsureMult    = (isMythEffectActive("mythe_d_enee") && state.eneeDegraded) ? ENEE_USURE_DEGRADED_MULT : 1;
  const activeRuinUsureMult = hasActiveRuin(state, "hephaistos") ? ACTIVE_RUIN_USURE_MULT : 1;
  return TIME_WEAR_BASE_RATE * cycleFatigue * scaleFatigue * doctrineMod * icareMult * atlasMult * atlasHeritRed * orImbalanceMult * orHeritageMult * hephMult * eneeUsureMult * activeRuinUsureMult / (mitigation * ruinEffectMultiplier("timeWearSlow"));
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

// Multiplicateur de production issu des préparations terminales (malus jusqu'à l'effondrement).
function terminalPrepMultiplier(resource) {
  const tp = state.terminalPreparations;
  if (!tp) return 1;
  if (resource === "infrastructure") return 1 + (tp.infraBonus || 0);
  const malus = resource === "food" ? tp.foodMalus
    : resource === "gold" ? tp.goldMalus
    : resource === "knowledge" ? tp.knowledgeMalus
    : 0;
  return Math.max(0.15, 1 - (malus || 0));
}

export function legitimacyGain() {
  if (D(state.ruins).lt(dynastyRuinsThreshold())) return 0;
  // legitimacy reste un number natif : au-delà du domaine float on plafonne
  // à MAX_VALUE pour éviter de propager Infinity dans le state.
  const base       = Math.min(Number.MAX_VALUE, Math.pow(toNum(state.ruins) / 160, 0.5));
  const cycleMod   = state.cycles / 12;
  // Palier dynastique : +1 légitimité par tranche de 5 dynasties fondées ce cycle.
  // Visible et ressenti : dynasty 5 → +1, dynasty 10 → +2, dynasty 15 → +3…
  const dynPalier  = Math.floor((state.dynastyCount || 0) / 5);
  return Math.floor(base + cycleMod + dynPalier);
}

// Coût des actions de régulation, ancré sur la PRODUCTION du joueur (et non plus
// la population) : coût = N secondes de production courante × escalade par usage.
// Devient inpayable si le joueur a tout dépensé → il faut garder une réserve.
// Voir CRISIS_COST_* dans balance.js. (Les Ruines, qui ne sont pas un flux de
// production, gardent un ancrage cycle pour ancestorCrisis.)
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

export function mapStage() {
  const b = state.buildings;
  const cnt = (id) => b[id] || 0;
  if (cnt("imperial_exchanges") >= 1) return 16;
  if (cnt("mint_houses") >= 1 || cnt("public_works") >= 3) return 15;
  if (cnt("water_mills") >= 3) return 14;
  if (cnt("water_mills") >= 1 || cnt("courthouses") >= 3) return 13;
  if (cnt("river_ports") >= 3) return 12;
  if (cnt("river_ports") >= 1 || cnt("bureaucracy") >= 3) return 11;
  if (cnt("irrigated_fields") >= 3) return 10;
  if (cnt("irrigated_fields") >= 1 || cnt("sewers") >= 3) return 9;
  if (cnt("guilds") >= 3) return 8;
  if (cnt("guilds") >= 1 || cnt("aqueducts") >= 3) return 7;
  if (cnt("markets") >= 3) return 6;
  if (cnt("caravans") >= 3 || cnt("markets") >= 1) return 5;
  if (cnt("caravans") >= 1) return 4;
  if (cnt("granaries_city") >= 3) return 3;
  if (cnt("granaries_city") >= 1) return 2;
  if (cnt("foragers") >= 3) return 1;
  return 0;
}

// Délai avant effondrement automatique (intendant_de_crise).
// Utilisé par checkAutoCollapse() dans main.js et renderCrisisSummary() dans render.js.
export function autoCollapseDelay() {
  const hasTier3 = has("memoire_institutionnelle");
  const hasTier2 = hasTier3 || has("conseil_de_regence");
  return hasTier3 ? 3 * 60 * 1000 : hasTier2 ? 6 * 60 * 1000 : 10 * 60 * 1000;
}
