"use strict";

import { state, renderCache, buildingById, upgradeById, defaultState } from './state.js';
import { buildings } from '../data/buildings.js';
import { upgrades, dogmaIds, PRESTIGE_TREE, PRESTIGE_DOGMAS } from '../data/upgrades.js';
import { eras } from '../data/world.js';
import { getCityMapEngineTileMap } from '../map/cityMapBridge.js';
import { clamp01, clamp, fmt, labelFor, canPayCost } from './utils.js';
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
  const effectiveRuins = (state.ruins || 0) + (state.chaosRuinsBonus || 0);
  const base = 1 + Math.pow(effectiveRuins, 0.62) * 0.09;
  return has("oral_tradition") ? 1 + (base - 1) * 1.2 : base;
}

export function ruinEffects() {
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

export function ownedRuinUpgradeCount() {
  return ruinEffects().ownedCount;
}

export function ownedRuinTreePurchaseCount() {
  return upgrades.filter((upgrade) => upgrade.group === "ruins" && !dogmaIds.has(upgrade.id) && has(upgrade.id)).length;
}

export function ownedRuinBranchPurchaseCount(branchId) {
  return PRESTIGE_TREE.filter((node) => node.branch === branchId && has(node.id)).length;
}

export function chronicleEngineMultiplier() {
  if (!has("chronicle_engine")) return 1;
  const ownedBonus = ownedRuinUpgradeCount() * 0.03;
  const unspentBonus = Math.log10(state.ruins + 1) * 0.08;
  return 1 + ownedBonus + unspentBonus;
}

export function unspentRuinsPowerMultiplier() {
  return 1 + state.ruins * ruinEffectSum("unspentRuinsPower");
}

export function institutionMultiplier() {
  if (isMythEffectActive("mythe_du_chaos")) return 1;
  return 1 + Math.pow(state.legitimacy, 0.7) * 0.22;
}

export function grandResetMultiplier() {
  if (isMythEffectActive("mythe_du_chaos")) return 1;
  return Math.pow(2, state.grandResetCount || 0);
}

export function grandResetRuinMultiplier() {
  if (isMythEffectActive("mythe_du_chaos")) return 1;
  const base = Math.pow(2, state.grandResetCount || 0);
  const ragnarokBonus = (state.ragnarokHeritage && (state.grandResetCount || 0) >= 11) ? 4 : 1;
  return base * ragnarokBonus;
}

export function marketMultiplier() {
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

export function crisisProductionMultiplier(type) {
  const global = state.crisisProduction.global ?? 1;
  return global * (state.crisisProduction[type] ?? 1);
}

export function theocracyKnowledgeRate() {
  return has("trait_theocracy") ? state.gold * 0.01 : 0;
}

export function ruptureGrowthMultiplier() {
  return has("trait_theocracy") ? 1.25 : 1;
}

export function amplifyRuptureFactor(factor) {
  if (factor <= 1 || !has("trait_theocracy")) return factor;
  return 1 + (factor - 1) * ruptureGrowthMultiplier();
}

export function cadmosPermanentBonus(orientation) {
  return (state.cadmosPermanentEpitaphs || [])
    .filter((entry) => entry.orientation === orientation)
    .length * CADMOS_EPITAPH_BONUS_PCT;
}

export function cadmosCycleBonus(orientation) {
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

export function activeEpitaphLegacy() {
  const active = state.activeEpitaphLegacy;
  const legacy = active ? epitaphLegacyById(active.id) : null;
  if (!legacy) return null;
  const startedAt = active.startedAt || state.cycleStartedAt || Date.now();
  const elapsed = Date.now() - startedAt;
  if (elapsed > EPITAPH_LEGACY_DURATION_MS) return null;
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

export function nomadInfrastructureCap() {
  if (!has("trait_nomadism")) return Infinity;
  const normalCapacity = 80 + state.population * 0.015 + state.knowledge * 0.003 + totalBuildingCount() * 5;
  return normalCapacity * 0.7;
}

export function enforceInfrastructureCap() {
  state.infrastructure = Math.min(state.infrastructure, nomadInfrastructureCap());
}

export function infraMultiplier() {
  return 1 + Math.log10(state.infrastructure + 1) * 0.018;
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

export function getBuildingSums() {
  if (renderCache._buildingSums) return renderCache._buildingSums;

  let positiveInstability = 0;
  let negativeInstability = 0;
  let buildingCount = 0;
  const baseSumsByCategory = {};

  for (const b of buildings) {
    const count = state.buildings[b.id] || 0;
    buildingCount += count;

    if (b.instability > 0) {
      positiveInstability += b.instability * count;
    } else if (b.instability < 0) {
      negativeInstability += b.instability * count;
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

  renderCache._buildingSums = {
    positiveInstability,
    negativeInstability,
    buildingCount,
    baseSumsByCategory
  };
  return renderCache._buildingSums;
}

export function buildingInstabilityLoad() {
  return getBuildingSums().positiveInstability;
}

export function pressureBreakdown() {
  // Retourne le cache frame si disponible (invalidé au début de chaque intervalle de tick)
  if (renderCache._framePressure) return renderCache._framePressure;
  const population = Math.max(1, state.population);

  const sums = getBuildingSums();
  const positiveInstability = sums.positiveInstability;
  const negativeInstability = sums.negativeInstability;
  const buildingCount = sums.buildingCount;

  const institutionalCapacity = 1 + state.infrastructure * 0.018 + state.legitimacy * 0.16;
  const stabilizers = 1 + Math.max(0, -negativeInstability) * 12;
  const cycleAgeSeconds = Math.max(0, (Date.now() - (state.cycleStartedAt || Date.now())) / 1000);
  const foundingGrace = Math.max(0, 1 - Math.min(1, state.cycles / 12))
    * Math.max(0, 1 - Math.min(1, population / 450000))
    * Math.max(0, 1 - Math.min(1, buildingCount / 65))
    * 0.34;
  const settlingGrace = Math.max(0, 1 - Math.min(1, cycleAgeSeconds / 420))
    * Math.max(0, 1 - Math.min(1, state.cycles / 10))
    * 0.18;

  const scarcityRaw = Math.max(0, (population * 2.4 - state.food) / Math.max(120, population * 2.4));
  const inequalityRaw = Math.max(0, state.gold / Math.max(80, population * 1.25) - 0.55);
  const complexityRaw = Math.max(0, buildingCount / 26 + state.knowledge / Math.max(180, state.infrastructure * 38 + 180) - 0.35);
  const dissentRaw = Math.max(0, state.cycles * 0.035 + Math.log10(state.ruins + 1) * 0.04 + state.instability * 0.12);

  const rationRelief = Math.min(0.35, state.crisisActions.rationing * 0.06);
  const scarcity = Math.max(0, Math.min(0.7, scarcityRaw * 0.55) - rationRelief);
  const inequality = Math.min(0.55, inequalityRaw * 0.28 + (state.buildings.markets || 0) * 0.006 + (state.buildings.guilds || 0) * 0.008);
  const complexity = Math.min(0.75, complexityRaw * 0.34);
  const dissentRelief = has("ruin_liturgy") ? 0.035 + Math.min(0.06, state.ruins * 0.0007) : 0;
  const dissent = Math.max(0, Math.min(0.55, dissentRaw * 0.22) - dissentRelief);
  const structural = Math.min(0.75, positiveInstability * 2.2);
  const mitigation = Math.min(0.75, Math.log10(institutionalCapacity * stabilizers) * 0.22 + ruinEffectSum("stability") + foundingGrace + settlingGrace);
  const baseTotal = Math.max(0, (scarcity + inequality + complexity + dissent + structural + ruinEffectSum("ruptureHaste")) * ruptureGrowthMultiplier() - mitigation);
  const total = hasDoctrine("acier") ? baseTotal * 1.25 : baseTotal;

  renderCache._framePressure = { scarcity, inequality, complexity, dissent, structural, mitigation, total };
  return renderCache._framePressure;
}

export function cityVitals() {
  // Retourne le cache frame si disponible (invalidé au début de chaque intervalle de tick)
  if (renderCache._frameVitals) return renderCache._frameVitals;
  const foodScore = state.food / Math.max(660, state.population * 24);
  const goldScore = state.gold / Math.max(80, state.population * 1.4);
  const knowledgeScore = state.knowledge / Math.max(90, state.population * 0.9);
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

export function rates(vitals = cityVitals(), pressure = pressureBreakdown()) {
  if (renderCache._frameRates) return renderCache._frameRates;
  let pop = 0.04;
  let food = state.population * 0.012;
  let gold = Math.max(0, state.population - 25) * 0.0015;
  let knowledge = 0;
  let infra = 0;

  const _babelExpMult  = babelExponentialMult();
  const _babelAdjMult  = babelAdjacencyMultiplier();
  const _hephInfraFactor = hephInfraMult();

  const sums = getBuildingSums();
  const baseSumsByCategory = sums.baseSumsByCategory;

  for (const [cat, catSums] of Object.entries(baseSumsByCategory)) {
    const babelMult = (isMythEffectActive("mythe_de_babel") && cat === state.babelCategory)
      ? _babelExpMult : 1;
    const totalMult = babelMult * _babelAdjMult;
    const hephBonus = (_hephInfraFactor > 1 && cat === "infra") ? _hephInfraFactor : 1;

    pop += catSums.pop * totalMult;
    food += catSums.food * totalMult;
    gold += catSums.gold * totalMult;
    knowledge += catSums.knowledge * totalMult;
    infra += catSums.infra * totalMult * hephBonus;
  }

  // ── Mythe de Prométhée : multiplicateur Nourriture pendant le cycle ──────
  if (isMythEffectActive("mythe_de_promethee")) {
    food *= PROMETHEE_FOOD_MULT;
  }
  // ── Héritage Braisiers ancestraux : bonus Nourriture en début de cycle ───
  if (state.prometheeBraisiers) {
    const cycleElapsed = Date.now() - (state.cycleStartedAt || Date.now());
    if (cycleElapsed < BRAISIERS_DURATION_MS) {
      food *= BRAISIERS_FOOD_MULT;
    }
  }

  const mult = globalMultiplier();
  if (has("root_cellars")) food *= 1.6;
  if (has("buried_coins")) gold *= 1.6;
  if (has("charcoal_tablets")) knowledge *= 1.6;
  food *= ruinEffectMultiplier("foodMult");
  gold *= ruinEffectMultiplier("goldMult") * (hasDoctrine("parchemin") ? 0.85 : 1);
  knowledge *= ruinEffectMultiplier("knowledgeMult") * (hasDoctrine("parchemin") ? 1.3 : 1);
  infra *= ruinEffectMultiplier("infraMult") * (hasDoctrine("sillon") ? 1.25 : 1);

  const _orPenaltyMult = orProdPenaltyMult();
  const _epitaphEffect = epitaphLegacyEffect();
  const _rawInstability = Math.max(0, pressure.total - vitals.instabilityRelief)
    * (isMythEffectActive("mythe_d_icare") ? ICARE_RUPTURE_MULT : 1)
    * (isMythEffectActive("mythe_de_babel") ? BABEL_RUPTURE_MULT : 1)
    * cadmosStabilityMultiplier()
    * _epitaphEffect.ruptureMult;
  const baseRates = {
    population: pop * mult * _epitaphEffect.globalMult * vitals.populationMult * ruinEffectMultiplier("populationMult") * crisisProductionMultiplier("population") * _orPenaltyMult,
    food: food * Math.sqrt(mult) * _epitaphEffect.globalMult * _epitaphEffect.foodMult * vitals.foodMult * crisisProductionMultiplier("food") * terminalPrepMultiplier("food") * _orPenaltyMult * cadmosProductionMultiplier("food"),
    gold: gold * Math.sqrt(mult) * _epitaphEffect.globalMult * _epitaphEffect.goldMult * (1 + state.buildings.markets * 0.032 + state.buildings.guilds * 0.024) * vitals.goldMult * crisisProductionMultiplier("gold") * terminalPrepMultiplier("gold") * _orPenaltyMult * (hasActiveRuin(state, "age_or") ? ACTIVE_RUIN_GOLD_PROD_MULT : 1) * cadmosProductionMultiplier("gold"),
    knowledge: knowledge * mult * _epitaphEffect.globalMult * _epitaphEffect.knowledgeMult * (1 + Math.log10(state.population + 10) * 0.05) * vitals.knowledgeMult * crisisProductionMultiplier("knowledge") * terminalPrepMultiplier("knowledge") * _orPenaltyMult + theocracyKnowledgeRate(),
    infrastructure: infra * mult * _epitaphEffect.globalMult * _epitaphEffect.infraMult * (1 + Math.log10(state.knowledge + 10) * 0.04) * vitals.infraMult * crisisProductionMultiplier("infrastructure") * terminalPrepMultiplier("infrastructure") * _orPenaltyMult,
    instability: isMythEffectActive("mythe_age_or")
      ? Math.min(OR_RUPTURE_CAP, _rawInstability)
      : _rawInstability
  };

  if (isMythEffectActive("mythe_atrides") && !state.atridesDrainDisabled) {
    baseRates.food *= 0.9;
    baseRates.gold *= 0.9;
    baseRates.knowledge *= 0.9;
    baseRates.infrastructure *= 0.9;
  }

  if (isMythEffectActive("mythe_d_enee") && state.eneeDegraded) {
    baseRates.food = 0;
    baseRates.gold = 0;
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

export function babelAdjacencyMultiplier() {
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

export function orProdPenaltyMult() {
  if (!isMythEffectActive("mythe_age_or")) return 1;
  if (state.population <= OR_POP_THRESHOLD) return 1;
  const excess = state.population - OR_POP_THRESHOLD;
  return Math.max(0.1, 1 - excess * OR_POP_PENALTY_PCT);
}

export function orHeritageUsureMult() {
  if (!state.orHeritage) return 1;
  const f = Math.max(state.food, 0);
  const g = Math.max(state.gold, 0);
  if (f <= 0 || g <= 0) return 1;
  const ratio = Math.abs(f - g) / Math.max(f, g);
  return ratio < OR_HERITAGE_BALANCE_RATIO ? (1 - OR_HERITAGE_USURE_RED) : 1;
}

export function hephInfraMult() {
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

export function nextMilestoneText(building, count) {
  const milestone = Math.floor(count / 25);
  const next = (milestone + 1) * 25;
  const multiplier = buildingOutputMultiplier(building, count);
  const milestoneLabel = building.category === "city" ? "palier x2" : "palier x1.5";
  return `Prod x${fmt(multiplier)} | ${milestoneLabel} dans ${next - count}`;
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
export function buildingEffectiveScale(building) {
  if (!state.sisypheHeritage) return building.scale;
  return 1 + (building.scale - 1) * (1 - SISYPHE_SCALE_REDUCTION);
}

export function buildingDiscount(building) {
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

export function buildingCostAt(building, count) {
  const discount = buildingDiscount(building);
  const scale = buildingEffectiveScale(building);
  const mainCost = building.base * Math.pow(scale, count) * discount;
  const costs = { [building.currency]: mainCost };
  if (building.extraCost) {
    for (const [currency, amount] of Object.entries(building.extraCost)) {
      costs[currency] = (costs[currency] || 0) + amount * Math.pow(scale, count) * discount;
    }
  }
  return costs;
}

export function buildingCostMainAt(building, count) {
  return building.base * Math.pow(building.scale, count) * buildingDiscount(building);
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
  const costs = {};
  for (let i = 0; i < batchSize; i += 1) {
    const n = count + i;
    const mainCost = building.base * Math.pow(scale, n) * discount;
    costs[building.currency] = (costs[building.currency] || 0) + mainCost;
    if (building.extraCost) {
      for (const [currency, base] of Object.entries(building.extraCost)) {
        costs[currency] = (costs[currency] || 0) + base * Math.pow(scale, n) * discount;
      }
    }
  }
  // Mythe de Sisyphe : malédiction cumulative sur tous les coûts
  if (isMythEffectActive("mythe_de_sisyphe") && (state.sisypheMult || 1) > 1) {
    const mult = state.sisypheMult;
    for (const currency of Object.keys(costs)) costs[currency] *= mult;
  }
  if (hasActiveRuin(state, "promethee") && building.food > 0) {
    for (const currency of Object.keys(costs)) costs[currency] *= ACTIVE_RUIN_FOOD_ENGINE_COST_MULT;
  }
  return costs;
}

export function archaeologyCost() {
  const remembered = Object.values(state.lastCollapsedBuildings || {}).reduce((sum, count) => sum + count, 0);
  return Math.max(25000, state.population * 0.12, remembered * 8500);
}

export function archaeologyTarget() {
  const entries = Object.entries(state.lastCollapsedBuildings || {}).filter(([, count]) => count > 0);
  if (entries.length) {
    return entries
      .map(([id, count]) => ({ building: buildingById[id], count }))
      .filter((entry) => entry.building)
      .sort((a, b) => (b.building.base * Math.max(1, b.count)) - (a.building.base * Math.max(1, a.count)))[0]?.building;
  }
  const advanced = buildings.filter((building) => building.base >= 100000 || building.category !== "city");
  const seed = Math.max(0, state.cycles * 31 + state.dynastyCount * 17 + totalBuildingCount());
  return advanced[seed % advanced.length] || buildings[buildings.length - 1];
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
  return has("skill_archaeology") && !state.archaeologyUsed && state.knowledge >= archaeologyCost();
}

export function upgradeCostText(upgrade) {
  return Object.entries(upgrade.cost).map(([key, value]) => `${fmt(value)} ${labelFor(key)}`).join(" + ");
}

export function canBuyUpgrade(upgrade) {
  if (dogmaIds.has(upgrade.id)) return checkDogmaAvailability(upgrade.id) === "available";
  if (upgrade.group === "ruins") return checkNodeAvailability(upgrade.id) === "available";
  return !has(upgrade.id) && canPayCost(upgrade.cost);
}

export function prestigeNodeFor(id) {
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

export function dogmaFor(id) {
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

export function canPerformGrandReset() {
  return has("grand_reset") && state.legitimacy >= 0; // le coût est déjà payé à l'achat de l'upgrade
}

export function currentEraIndex() {
  let index = 0;
  for (let i = 0; i < eras.length; i += 1) {
    if (state.population >= eras[i].at) index = i;
  }
  return index;
}

export function nextEraProgress(index) {
  const current = eras[index];
  const next = eras[index + 1];
  if (!next) return 1;
  const base = Math.max(1, current.at);
  const span = Math.log10(next.at) - Math.log10(base);
  const done = Math.log10(Math.max(base, state.population)) - Math.log10(base);
  return Math.max(0, Math.min(1, done / span));
}

export function heritageQuality() {
  if (!crisisOpen()) return "En formation";
  const gain = ruinGain();
  const age = Math.max(1, (Date.now() - state.cycleStartedAt) / 1000);
  if (gain >= 30 || (gain >= 16 && age >= 1200)) return "Mythique";
  if (gain >= 12 || (gain >= 7 && age >= 600)) return "Riche";
  if (gain >= 4 || age >= 300) return "Stable";
  return "Fragile";
}

export function crisisProgress() {
  return Math.max(state.instability, state.timeWear || 0);
}

export function crisisOpen() {
  return state.instability >= 1 || (state.timeWear || 0) >= 1;
}

export function ruinGain() {
  if (!crisisOpen()) return 0;
  const age = Math.max(1, (Date.now() - state.cycleStartedAt) / 1000);
  const peaks = state.cyclePeaks || defaultState().cyclePeaks;
  const patience = age < 120
    ? 0.18
    : age < 300
      ? 0.45
      : age < 600
        ? 0.8
        : Math.min(1.75, 1 + Math.log10(age / 600 + 1) * 0.55);
  const finalEraPopulation = eras[eras.length - 1]?.at || 150000000000;
  const normalizedEraIndex = clamp(
    (Math.log10(Math.max(10, peaks.population) + 10) - Math.log10(10)) /
    (Math.log10(finalEraPopulation + 10) - Math.log10(10)),
    0,
    1
  ) * 6;
  const ageDepth = 0.55 + normalizedEraIndex * 0.22;
  const populationDepth = Math.max(0.35, Math.pow(Math.max(10, peaks.population) / 25000, 0.42));
  const civicDepth = 0.75 + Math.log10((peaks.knowledge || 0) + (peaks.infrastructure || 0) * 4 + 10) * 0.14;
  const pressure = 1 + Math.max(0, crisisProgress() - 1) * 0.28;
  const preparation = 1 + Math.min(2.4, state.collapsePreparation || 0);
  const doctrineRuinMod = hasDoctrine("acier") ? 1.4 : hasDoctrine("sillon") ? 0.8 : 1;
  const atridesRuinMod = (isMythEffectActive("mythe_atrides") && state.atridesDrainDisabled) ? 1.5 : 1;
  const elapsed = (Date.now() - state.cycleStartedAt) / 1000;
  const sedimentMod = elapsed >= 604800 ? 5.0 : elapsed >= 259200 ? 2.35 : elapsed >= 86400 ? 1.45 : elapsed >= 28800 ? 1.15 : elapsed >= 3600 ? 1.02 : 1.0;
  const raw = ageDepth * populationDepth * civicDepth * patience * pressure * preparation * ruinEffectMultiplier("ruinGain") * doctrineRuinMod * atridesRuinMod * activeRuinMultiplier(state) * grandResetRuinMultiplier() * sedimentMod;
  return Math.max(age >= 120 ? 1 : 0, Math.floor(raw));
}

export function timeWearRate() {
  const cycleFatigue = 1 + Math.min(1.2, state.cycles * 0.045);
  const scaleFatigue = 1 + Math.min(0.9, Math.log10(state.population + 10) * 0.06);
  const mitigation = 1 + state.infrastructure * 0.0015 + state.knowledge * 0.000012 + state.legitimacy * 0.035;
  const doctrineMod = hasDoctrine("sillon") ? 0.7 : 1;
  const icareMult        = isMythEffectActive("mythe_d_icare") ? ICARE_USURE_MULT : 1;
  const atlasMult        = isMythEffectActive("mythe_d_atlas") ? ATLAS_USURE_MULT : 1;
  const atlasHeritRed    = state.atlasHeritage ? (1 - ATLAS_USURE_REDUCTION) : 1;
  const orImbalanceMult  = (isMythEffectActive("mythe_age_or") && state.orUsureImbalance) ? OR_USURE_IMBALANCE_MULT : 1;
  const orHeritageMult   = orHeritageUsureMult();
  const hephMult         = isMythEffectActive("mythe_d_hephaistos") ? HEPH_USURE_MULT : 1;
  const eneeUsureMult    = (isMythEffectActive("mythe_d_enee") && state.eneeDegraded) ? ENEE_USURE_DEGRADED_MULT : 1;
  const activeRuinUsureMult = hasActiveRuin(state, "hephaistos") ? ACTIVE_RUIN_USURE_MULT : 1;
  return 0.00003 * cycleFatigue * scaleFatigue * doctrineMod * icareMult * atlasMult * atlasHeritRed * orImbalanceMult * orHeritageMult * hephMult * eneeUsureMult * activeRuinUsureMult / (mitigation * ruinEffectMultiplier("timeWearSlow"));
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
  const depthScale = 1 + Math.max(0, ruinGain() - 1) * 0.08;
  const tierScale = TERMINAL_PREP_TIERS[type]?.[tier]?.costScale || 1;
  const scale = extensionScale * depthScale * tierScale;
  if (type === "prepareArchives") {
    return {
      knowledge: Math.max(90, state.population * 0.045 + totalBuildingCount() * 18) * scale,
      gold: Math.max(50, state.population * 0.025) * scale
    };
  }
  if (type === "exodus") {
    return { food: Math.max(120, state.population * 0.55) * scale };
  }
  return {
    gold: Math.max(120, state.population * 0.12) * scale,
    knowledge: Math.max(60, totalBuildingCount() * 10) * scale,
    food: Math.max(80, state.population * 0.18) * scale
  };
}

export function terminalCrisisReady(type, tier = 0) {
  if (!crisisOpen()) return false;
  if (state.terminalPreparations?.used?.[type]) return false;
  return canPayCost(terminalCrisisCost(type, tier));
}

// Multiplicateur de production issu des préparations terminales (malus jusqu'à l'effondrement).
export function terminalPrepMultiplier(resource) {
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
  if (state.ruins < 300) return 0;
  const base       = Math.pow(state.ruins / 160, 0.5);
  const cycleMod   = state.cycles / 12;
  // Palier dynastique : +1 légitimité par tranche de 5 dynasties fondées ce cycle.
  // Visible et ressenti : dynasty 5 → +1, dynasty 10 → +2, dynasty 15 → +3…
  const dynPalier  = Math.floor((state.dynastyCount || 0) / 5);
  return Math.floor(base + cycleMod + dynPalier);
}

export function crisisCosts() {
  const actionScale = 1 + Object.values(state.crisisActions).reduce((sum, value) => sum + value, 0) * 0.08;
  return {
    rationing: { food: Math.max(35, state.population * 0.9) * actionScale },
    festivals: { gold: Math.max(18, state.population * 0.18) * actionScale },
    census: { knowledge: Math.max(20, totalBuildingCount() * 12 + state.population * 0.04) * actionScale },
    reforms: {
      gold: Math.max(60, state.population * 0.24) * actionScale,
      knowledge: Math.max(45, totalBuildingCount() * 10) * actionScale
    },
    archiveCrisis: { knowledge: Math.max(120, state.cycles * 30 + state.population * 0.025) * actionScale },
    ancestorCrisis: { ruins: Math.max(8, state.cycles * 3) * actionScale, food: Math.max(300, state.population * 0.35) * actionScale }
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
