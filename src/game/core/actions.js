"use strict";

import {
  state,
  buyAmount,
  gamePaused,
  collapseInProgress,
  recentBuildingMilestones,
  renderCache,
  defaultState,
  defaultAutoScriptRules,
  defaultAutomateRules,
  buildingById,
  upgradeById,
  save,
  invalidateRenderCache,
  openView,
  render,
  setGamePaused,
  setCollapseInProgress,
  setMourning,
  setState,
  notify
} from './state.js';

import {
  cityVitals,
  pressureBreakdown,
  rates,
  babelExponentialMult,
  babelAdjacencyMultiplier,
  orProdPenaltyMult,
  orHeritageUsureMult,
  hephInfraMult,
  buildingOutputMultiplier,
  nextMilestoneText,
  buildingMilestoneInfo,
  has,
  hasDoctrine,
  buildingEffectiveScale,
  buildingDiscount,
  buildingCostAt,
  buildingCostMainAt,
  maxBuyAmount,
  buildingBatchCost,
  archaeologyCost,
  archaeologyTarget,
  canExhume,
  upgradeCostText,
  canBuyUpgrade,
  prestigeNodeFor,
  checkNodeAvailability,
  dogmaFor,
  checkDogmaAvailability,
  canPerformGrandReset,
  currentEraIndex,
  nextEraProgress,
  heritageQuality,
  crisisProgress,
  crisisOpen,
  timeWearRate,
  terminalCrisisReady,
  terminalCrisisCost,
  ruinGain,
  legitimacyGain,
  crisisCosts,
  mapStage,
  autoCollapseDelay,
  isUnlocked,
  totalBuildingCount,
  globalMultiplier,
  ruinEffectSum,
  enforceInfrastructureCap
} from './mechanics.js';

import { runCollapseSequence, openChoiceDialog } from './events.js';

import { buildings, dynastyNames } from '../data/buildings.js';
import { upgrades } from '../data/upgrades.js';
import { eras, CRISIS_EVENTS, CRISIS_POOL, DOCTRINES } from '../data/world.js';
import { captureCurrentVestige } from '../citymap/cityMapBridge.js';
import { clamp01, clamp, fmt, roman, seededRng, labelFor, canPayCost, payCost } from './utils.js';

import {
  getMythById,
  isMythCompleted,
  isMythActive,
  isMythUnlocked,
  checkActUnlocks,
  MYTHS,
  PHENIX_CYCLE_COUNT,
  PHENIX_FORCE_INTERVAL,
  PHENIX_RUIN_TARGET,
  HEPH_POP_CRISIS_THRESHOLD,
  HEPH_POP_DECAY_START_MIN,
  HEPH_POP_DECAY_RATE,
  HEPH_INFRA_MULT_BASE,
  HEPH_INFRA_TARGET,
  HEPH_POP_DECLINE_PCT,
  ICARE_INFRA_TARGET,
  PROMETHEE_POP_TARGET,
  PROMETHEE_FATAL_RUPTURE,
  PROMETHEE_FOOD_MULT,
  PROMETHEE_RUPTURE_PER_FOOD,
  SISYPHE_MULT_PER_PURCHASE,
  OR_POP_CAP,
  OR_GOLD_TARGET,
  OR_BALANCE_RATIO,
  OR_USURE_IMBALANCE_MULT,
  OR_POP_THRESHOLD,
  OR_POP_PENALTY_PCT,
  OR_RUPTURE_CAP,
  BABEL_MULT_TARGET,
  BABEL_CAT_LABELS,
  ATLAS_LEGIT_PASSIVE_RATE,
  SURCHAUFFE_DURATION_MS,
  SURCHAUFFE_COOLDOWN_MS,
  SURCHAUFFE_RUPTURE,
  SURCHAUFFE_PROD_MULT
} from '../data/myths.js';

// Selectionne un event contextuel pour un palier donne.
// Evite de repeter les events recents (state.recentCrisisIds).
export function pickCrisisEvent(threshold) {
  const vitals = cityVitals();
  const pool = CRISIS_POOL.filter((e) => e.threshold === threshold);
  const eligible = pool.filter((e) => !e.condition || e.condition(state, vitals));
  const candidates = eligible.length ? eligible : pool;
  const recent = state.recentCrisisIds || [];
  const fresh = candidates.filter((e) => !recent.includes(e.id));
  const choices = fresh.length ? fresh : candidates;
  return choices[state.cycles % choices.length];
}

export function buyBuilding(id) {
  const building = buildingById[id];
  if (!building) return;
  // â”€â”€ Mythe de Babel : seule la catÃ©gorie choisie est achetable â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (state.activeMythId === "mythe_de_babel" && state.babelCategory && building.category !== state.babelCategory) return;
  const amount = buyAmount === "max" ? maxBuyAmount(building) : clamp(Math.floor(Number(buyAmount) || 1), 1, 500);
  const prices = buildingBatchCost(building, amount);
  if (!canPayCost(prices)) return;
  const previousCount = state.buildings[id] || 0;
  payCost(prices);
  state.buildings[id] += amount;
  const previousMilestone = Math.floor(previousCount / 25);
  const currentMilestone = Math.floor(state.buildings[id] / 25);
  if (currentMilestone > previousMilestone) {
    recentBuildingMilestones[id] = currentMilestone;
  }
  // â”€â”€ Mythe de Sisyphe : chaque achat hausse la malÃ©diction de coÃ»t â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (state.activeMythId === "mythe_de_sisyphe") {
    state.sisypheMult = (state.sisypheMult || 1) * SISYPHE_MULT_PER_PURCHASE;
  }
  // â”€â”€ Mythe de PromÃ©thÃ©e : chaque moteur de nourriture achetÃ© hausse la Rupture â”€â”€
  if (state.activeMythId === "mythe_de_promethee" && building.food > 0) {
    const ruptureAdded = amount * PROMETHEE_RUPTURE_PER_FOOD;
    state.instability = clamp01((state.instability || 0) + ruptureAdded);
  }
  chronicleBuilding(building, previousCount, state.buildings[id]);
  invalidateRenderCache("buildings");
  render();
}

export function exhumeVestige() {
  if (!canExhume()) return;
  const target = archaeologyTarget();
  if (!target) return;
  state.knowledge -= archaeologyCost();
  state.buildings[target.id] = (state.buildings[target.id] || 0) + 1;
  state.archaeologyUsed = true;
  enforceInfrastructureCap();
  chronicle(`Archeologie: les fouilles exhument ${target.name}. La cite reconstruit un vestige sans payer son cout ordinaire.`);
  render();
}

export async function performGrandReset() {
  if (collapseInProgress || gamePaused || !has("grand_reset")) return;
  // Guard double-appel : bloquer immÃ©diatement avant le premier await
  setGamePaused(true);
  const nextCount = (state.grandResetCount || 0) + 1;
  const choice = await openChoiceDialog({
    title: "Grand Reset",
    body: `Tout sera efface: batiments, ruines, upgrades, cycles, heritage. Mais un bonus permanent x${Math.pow(2, nextCount).toFixed(0)} sur toute la production est ajoute pour toujours. Actuellement: x${Math.pow(2, state.grandResetCount || 0).toFixed(0)}. Apres: x${Math.pow(2, nextCount).toFixed(0)}.`,
    options: [
      { label: "Tout reinitialiser", detail: `+x${Math.pow(2, nextCount).toFixed(0)} production permanente` },
      { label: "Annuler", detail: "Ne rien faire" }
    ]
  });
  if (choice.label === "Annuler") { setGamePaused(false); return; }

  setMourning(true);
  await new Promise((resolve) => setTimeout(resolve, 1300));

  // Reset complet in-place
  const savedMythsCompleted = { ...(state.mythsCompleted || {}) };
  const savedMythActsAnnounced = { ...(state.mythActsAnnounced || {}) };
  const savedChaosRuinsDouble = Boolean(state.chaosRuinsDouble);
  const savedChaosRuinsBonus = state.chaosRuinsBonus || 0;
  const savedPrometheeBraisiers   = Boolean(state.prometheeBraisiers);
  const savedAtlasHeritage        = Boolean(state.atlasHeritage);
  const savedSisypheHeritage      = Boolean(state.sisypheHeritage);
  const savedIcareHeritage        = Boolean(state.icareHeritage);
  const savedBabelHeritage        = Boolean(state.babelHeritage);
  const savedOrHeritage           = Boolean(state.orHeritage);
  const savedPhoenixHeritage      = Boolean(state.phoenixHeritage);
  const savedAutoScriptRules      = state.autoScriptRules ? JSON.parse(JSON.stringify(state.autoScriptRules)) : null;
  const savedHephHeritage         = Boolean(state.hephHeritage);
  const savedAutomateRules        = state.automateRules ? JSON.parse(JSON.stringify(state.automateRules)) : null;
  const savedSurchauffeEndTime    = state.surchauffeEndTime || 0;
  const savedSurchauffeCooldown   = state.surchauffeCooldownEnd || 0;
  const savedLegitimacy = state.legitimacy || 0;
  const savedDynastyCount = state.dynastyCount || 0;
  const savedDynastyDoctrine = state.dynastyDoctrine || null;
  
  const fresh = defaultState();
  fresh.grandResetCount = nextCount;
  fresh.mythsCompleted = savedMythsCompleted;
  fresh.mythActsAnnounced = savedMythActsAnnounced;
  fresh.chaosRuinsDouble = savedChaosRuinsDouble;
  fresh.chaosRuinsBonus = savedChaosRuinsBonus;
  fresh.prometheeBraisiers    = savedPrometheeBraisiers;
  fresh.atlasHeritage         = savedAtlasHeritage;
  fresh.sisypheHeritage       = savedSisypheHeritage;
  fresh.icareHeritage         = savedIcareHeritage;
  fresh.babelHeritage         = savedBabelHeritage;
  fresh.orHeritage            = savedOrHeritage;
  fresh.phoenixHeritage       = savedPhoenixHeritage;
  if (savedAutoScriptRules)   fresh.autoScriptRules = savedAutoScriptRules;
  fresh.hephHeritage          = savedHephHeritage;
  if (savedAutomateRules)     fresh.automateRules = savedAutomateRules;
  fresh.surchauffeEndTime     = savedSurchauffeEndTime;
  fresh.surchauffeCooldownEnd = savedSurchauffeCooldown;
  fresh.legitimacy = savedLegitimacy;
  fresh.dynastyCount = savedDynastyCount;
  fresh.dynastyDoctrine = savedDynastyDoctrine;
  fresh.history = [`Grand Reset x${nextCount}: tout a ete efface. Bonus permanent: x${Math.pow(2, nextCount).toFixed(0)}. Les pactes mythiques demeurent.`];
  
  setState(fresh);

  setGamePaused(false);
  setCollapseInProgress(false);
  setMourning(false);
  invalidateRenderCache("all");
  save();
  openView("city");
  render();
}

export function buyUpgrade(id) {
  const upgrade = upgradeById[id];
  if (!upgrade) return;
  if (!canBuyUpgrade(upgrade)) return;
  if (upgrade.group === "ruins") {
    state.ruins -= upgrade.cost.ruins || 0;
  } else {
    payCost(upgrade.cost);
  }
  state.upgrades[id] = true;
  renderCache.cachedRuinEffects = null;
  renderCache.cachedRuinEffectsSignature = "";
  invalidateRenderCache("all");
  chronicle(`Amelioration acquise: ${upgrade.name}.`);
  render();
}

export function log(message) {
  state.history = [...(state.history || []), message].slice(-48);
}

export function chronicle(message) {
  const year = cycleYear();
  const era = eras[currentEraIndex()].name;
  log(`An ${fmt(year)}, ${era}: ${message}`);
}

export function cycleYear() {
  const elapsed = Math.max(0, (Date.now() - (state.cycleStartedAt || Date.now())) / 1000);
  return Math.floor(elapsed / 60) + 1;
}

export function chronicleBuilding(building, previousCount, newCount) {
  const amount = newCount - previousCount;
  if (amount <= 0) return;
  if (previousCount === 0) {
    chronicle(`${building.name} apparait pour la premiere fois dans la cite (+${fmt(amount)}).`);
  } else if (amount >= 25 || newCount % 25 === 0) {
    chronicle(`${building.name} atteint ${fmt(newCount)} unites (+${fmt(amount)}).`);
  }
}

export function resetCyclePeaks() {
  state.cyclePeaks = {
    population: state.population,
    knowledge: state.knowledge,
    infrastructure: state.infrastructure,
    eraIndex: currentEraIndex()
  };
}

export function checkCrisisThresholds() {
  if (gamePaused || collapseInProgress || crisisOpen()) return;
  const slot = CRISIS_EVENTS.find((candidate) => (
    state.instability >= candidate.threshold &&
    !state.crisisThresholds[candidate.id]
  ));
  if (!slot) return;
  state.crisisThresholds[slot.id] = true;
  const event = pickCrisisEvent(slot.threshold);
  state.recentCrisisIds = [...(state.recentCrisisIds || []).slice(-8), event.id];
  openCrisisEvent(event);
}

export async function openCrisisEvent(event) {
  setGamePaused(true);
  render();
  // HÃ©phaÃ¯stos : crises narratives irrÃ©solubles si pop < seuil critique
  if (state.activeMythId === "mythe_d_hephaistos" && state.population < HEPH_POP_CRISIS_THRESHOLD) {
    chronicle(`Hephaistos : population critique (${Math.floor(state.population)} hab). La crise est irresolvable â€” ses effets negatifs s'imposent sans remede.`);
    addProductionPenalty("global", 0.06);
    state.instability = clamp01(state.instability + 0.05);
    setGamePaused(false);
    render();
    return;
  }

  const choice = await openChoiceDialog(event);

  choice.apply();
  state.instability = clamp01(state.instability);
  setGamePaused(false);
  render();
}

export function addProductionPenalty(type, amount) {
  const current = state.crisisProduction[type] ?? 1;
  state.crisisProduction[type] = Math.max(0.1, current * (1 - amount));
}

export function clearProductionPenalties(key) {
  if (key) {
    if (key in state.crisisProduction) {
      state.crisisProduction[key] = 1;
    }
  } else {
    const base = defaultState().crisisProduction;
    for (const k of Object.keys(base)) {
      state.crisisProduction[k] = base[k];
    }
  }
}

export function triggerCollapseChoices(shouldRender = true) {
  if (collapseInProgress) return;
  if (!state.crisisLimitAnnounced) {
    state.crisisLimitAnnounced = true;
    state.crisisOpenedAt = Date.now();
    const source = state.timeWear >= 1 ? "l'usure du temps" : "la rupture structurelle";
    chronicle(`Seuil terminal: ${source} atteint 100%. La cite doit choisir son issue dans l'onglet Crises.`);
    openView("prestige");
    save();
    if (shouldRender) render();
  }
}

export function resumeAfterCrisisOutcome() {
  if (collapseInProgress) return;
  setGamePaused(false);
  state.crisisLimitAnnounced = false;
  state.crisisOpenedAt = null;
}

export function lowerTerminalPressure(targetInstability, targetWear) {
  if (state.instability >= 1) state.instability = Math.min(state.instability, targetInstability);
  if ((state.timeWear || 0) >= 1) state.timeWear = Math.min(state.timeWear, targetWear);
  if (!crisisOpen()) resumeAfterCrisisOutcome();
}

export function runTerminalCrisisAction(type) {
  if (!crisisOpen() || collapseInProgress) return;
  if (!terminalCrisisReady(type)) return;
  const cost = terminalCrisisCost(type);
  payCost(cost);
  state.crisisExtensions = (state.crisisExtensions || 0) + 1;

  if (type === "prepareArchives") {
    state.collapsePreparation = Math.min(2.4, (state.collapsePreparation || 0) + 0.34);
    lowerTerminalPressure(0.88, 0.88);
    chronicle("Les archives de la cite sont mises en surete. L'heritage de ce cycle sera plus riche.");
  } else if (type === "exodus") {
    state.collapsePreparation = Math.min(2.4, (state.collapsePreparation || 0) + 0.24);
    lowerTerminalPressure(0.90, 0.90);
    chronicle("Une partie de la population s'est mise en marche. L'exode organise prepare la suite.");
  } else if (type === "holdOrder") {
    state.collapsePreparation = Math.min(2.4, (state.collapsePreparation || 0) + 0.08);
    lowerTerminalPressure(0.92, 0.92);
    chronicle("L'ordre est maintenu a grands frais. La cite tient encore, mais plus pour longtemps.");
  }

  render();
}

export function completeCollapse(gain, fallenDynasty, epitaph, reason) {
  const wasChaos   = state.activeMythId === "mythe_du_chaos";
  const wasPhoenix = state.activeMythId === "mythe_du_phenix";

  // Phoenix : accumule les ruines et incrÃ©mente le compteur de cycles AVANT l'Ã©valuation
  if (wasPhoenix) {
    state.phoenixTotalRuins = (state.phoenixTotalRuins || 0) + gain;
    state.phoenixCycleCount = (state.phoenixCycleCount || 0) + 1;
  }
  const phoenixDone = wasPhoenix && state.phoenixCycleCount >= PHENIX_CYCLE_COUNT;

  if (!wasPhoenix || phoenixDone) {
    // Ã‰valuation normale (dernier cycle Phoenix ou tout autre mythe)
    checkMythOnCollapse();
    state.activeMythId = null;
  } else {
    // Cycle intermÃ©diaire Phoenix : le mythe reste actif
    log(`Phoenix : cycle ${state.phoenixCycleCount}/${PHENIX_CYCLE_COUNT} acheve. Ruines cumulees : ${fmt(state.phoenixTotalRuins)}.`);
  }
  const doctrinePopBonus = hasDoctrine("acier") ? Math.floor((state.cyclePeaks?.population || 0) * 0.08) : 0;
  const keptPop = Math.max(has("granaries") ? state.population * 0.03 : 10, 10 + ruinEffectSum("startPopulation")) + doctrinePopBonus;
  const foodKeepRate = (has("ancestor_granaries") ? 0.16 : has("granaries") ? 0.08 : 0) + ruinEffectSum("foodKeep");
  const goldKeepRate = 0.04 + (has("ash_markets") ? 0.05 : 0) + (has("ash_contracts") ? 0.07 : 0) + ruinEffectSum("goldKeep");
  const knowledgeKeepRate = (has("memory_scribes") ? 0.04 : 0) + ruinEffectSum("knowledgeKeep") + (hasDoctrine("parchemin") ? 0.12 : 0);
  const infraKeepRate = ruinEffectSum("infraKeep") + (hasDoctrine("sillon") ? 0.06 : 0);
  const keptFood = foodKeepRate > 0 ? state.food * foodKeepRate : 35;
  const keptGold = state.gold * goldKeepRate;
  const keptKnowledge = state.knowledge * knowledgeKeepRate;
  const keptInfra = state.infrastructure * infraKeepRate;
  const era = eras[currentEraIndex()].name;
  const age = cycleYear();
  
  state.lastCollapsedBuildings = { ...state.buildings };
  
  // Carte: fige la disposition actuelle comme vestige.
  captureCurrentVestige();
  
  state.ruins += gain;
  if (wasChaos && state.chaosRuinsDouble) {
    state.chaosRuinsBonus = (state.chaosRuinsBonus || 0) + gain;
    chronicle(`Heritage Chaos: +${fmt(gain)} ruines virtuelles â€” le multiplicateur de Ruines en beneficie en permanence.`);
  }
  state.cycles += 1;
  state.population = Math.max(10, keptPop);
  state.food = Math.max(35 + ruinEffectSum("startFood"), keptFood);
  state.gold = Math.max(ruinEffectSum("startGold"), keptGold);
  
  // "Memoire des Cycles" : bonus Savoir proportionnel Ã  l'Ã¨re max atteinte historiquement
  const memoireSavoirBonus = has("codex_mythique") ? 250 * (state.bestEraIndex || 0) : 0;
  state.knowledge = Math.max(ruinEffectSum("startKnowledge"), keptKnowledge) + memoireSavoirBonus;
  
  state.infrastructure = keptInfra + (has("fallen_roads") ? Math.max(1, Math.sqrt(state.ruins) * 0.25) : 0);
  state.instability = 0;
  state.timeWear = 0;
  state.crisisActions = { ...defaultState().crisisActions };
  state.crisisThresholds = {};
  state.crisisProduction = { ...defaultState().crisisProduction };
  state.collapsePreparation = 0;
  state.crisisExtensions = 0;
  state.crisisLimitAnnounced = false;
  state.crisisOpenedAt = null;
  state.archaeologyUsed = false;
  state.buildings = { ...defaultState().buildings };
  state.cityMapSlots = {};
  
  // HÃ©ritage Atlas : LÃ©gitimitÃ© reset Ã  50 au dÃ©but de chaque cycle
  if (state.atlasHeritage) state.atlasLegitimite = 50;
  state.atlasCrisisCount = 0;
  state.babelProdReached = false;
  state.babelCategory    = null;
  state.orPopPeak        = 0;
  state.orGoldReached    = false;
  state.orUsureImbalance = false;
  state.hephPopPeak      = 0;
  state.hephGoalReached  = false;
  
  invalidateRenderCache("all");
  enforceInfrastructureCap();
  resetCyclePeaks();
  state.cycleStartedAt = Date.now();
  const source = reason === "manual" ? "choisit l'effondrement" : "atteint sa limite";
  log(`Cycle ${state.cycles - 1}, an ${age}: ${fallenDynasty}, ${era}, ${source}. Epitaphe: ${epitaph} Les survivants nomment ${fmt(gain)} ruines et recommencent.`);
  
  // "Archivistes des Ruines" : achÃ¨te automatiquement le premier upgrade de ruines abordable
  if (has("conservateurs_ruines")) {
    const cheapest = upgrades
      .filter((u) => u.group === "ruins" && !has(u.id) && state.ruins >= (u.cost?.ruins || Infinity))
      .sort((a, b) => (a.cost?.ruins || 0) - (b.cost?.ruins || 0))[0];
    if (cheapest) {
      state.ruins -= (cheapest.cost?.ruins || 0);
      state.upgrades[cheapest.id] = true;
      renderCache.cachedRuinEffects = null;
      renderCache.cachedRuinEffectsSignature = "";
      chronicle(`Archivistes: ${cheapest.name} acquis automatiquement.`);
    }
  }
  if (memoireSavoirBonus > 0) {
    chronicle(`Memoire des Cycles: +${fmt(memoireSavoirBonus)} savoir issu des eres precedentes.`);
  }

  // Phoenix : planifie le prochain effondrement forcÃ© si le cycle continue
  if (wasPhoenix && !phoenixDone) {
    state.phoenixNextForceAt = Date.now() + PHENIX_FORCE_INTERVAL;
  } else {
    state.phoenixNextForceAt = null;
  }
}

export async function foundDynasty() {
  const gain = legitimacyGain();
  if (gain <= 0 || gamePaused) return;
  setGamePaused(true);
  render();

  const choice = await openChoiceDialog({
    title: "Choisir une Doctrine",
    body: `La Dynastie ${state.dynastyCount + 1} s'apprete a s'ecrire dans l'histoire. Quelle doctrine guidera cette lignee?`,
    options: DOCTRINES.map((d) => ({ label: d.name, detail: d.detail, doctrineId: d.id })),
    variant: "dynasty"
  });

  state.dynastyDoctrine = choice.doctrineId || DOCTRINES[0].id;
  state.legitimacy += gain;
  state.dynastyCount += 1;
  state.ruins = 0;
  setGamePaused(false);
  resetCivilization();
  const doctrine = DOCTRINES.find((d) => d.id === state.dynastyDoctrine);
  log(`Dynastie ${state.dynastyCount}: les ruines deviennent ${fmt(gain)} legitimite. La ${doctrine?.name || "doctrine"} est proclamee.`);
  save();
  render();
}

// â”€â”€ SystÃ¨me de Mythes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function checkMythOnCollapse() {
  if (!state.activeMythId) return;
  const myth = getMythById(state.activeMythId);
  if (!myth) return;

  const success = typeof myth.onCollapse === "function" ? myth.onCollapse() : false;
  if (success && !isMythCompleted(myth.id)) {
    state.mythsCompleted[myth.id] = true;
    if (typeof myth.applyHeritage === "function") myth.applyHeritage();
    log(`Pacte honore: "${myth.name}". Heritage accorde: ${myth.heritageDescription}`);
    checkActUnlocks();
  } else if (!success) {
    log(`Pacte brise: "${myth.name}" n'a pas ete honore ce cycle.`);
  }
}

export function activateSurchauffe() {
  if (!state.icareHeritage || gamePaused || collapseInProgress) return;
  const now = Date.now();
  if (state.surchauffeCooldownEnd && now < state.surchauffeCooldownEnd) return;

  state.surchauffeEndTime    = now + SURCHAUFFE_DURATION_MS;
  state.surchauffeCooldownEnd = now + SURCHAUFFE_DURATION_MS + SURCHAUFFE_COOLDOWN_MS;
  state.instability = clamp01((state.instability || 0) + SURCHAUFFE_RUPTURE);
  invalidateRenderCache("all");
  log(`Surchauffe : production x${SURCHAUFFE_PROD_MULT} pendant ${SURCHAUFFE_DURATION_MS / 1000}s. Rupture +${Math.round(SURCHAUFFE_RUPTURE * 100)}%.`);
  save();
  render();
}

// â”€â”€ Script d'Automatisation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function initAutoScriptRules() {
  state.autoScriptRules = defaultAutoScriptRules();
  return state.autoScriptRules;
}

export function getAutoScriptRules() {
  if (!state.autoScriptRules) initAutoScriptRules();
  return state.autoScriptRules;
}

export function toggleAutoScriptRule(id) {
  const rule = getAutoScriptRules().find((r) => r.id === id);
  if (!rule) return;
  rule.enabled = !rule.enabled;
  save();
  invalidateRenderCache("all");
  render();
}

export function setAutoScriptThreshold(id, raw) {
  const rule = getAutoScriptRules().find((r) => r.id === id);
  if (!rule) return;
  const val = parseFloat(raw);
  if (!isNaN(val)) rule.threshold = Math.max(1, Math.min(9999, val));
  save();
  render();
}

export function checkAutoScriptRules() {
  for (const rule of getAutoScriptRules()) {
    if (!rule.enabled) continue;
    let triggered = false;
    if (rule.type === "rupture") triggered = state.instability * 100 >= rule.threshold;
    if (rule.type === "usure")   triggered = (state.timeWear || 0) * 100 >= rule.threshold;
    if (rule.type === "time") {
      const elapsed = (Date.now() - (state.cycleStartedAt || Date.now())) / 60_000;
      triggered = elapsed >= rule.threshold;
    }
    if (triggered) {
      log(`Script : "${rule.label} ${rule.threshold}${rule.unit}" â€” effondrement declenche.`);
      collapse("auto_script");
      return;
    }
  }
}

// â”€â”€ Automates ancestraux â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function initAutomateRules() {
  state.automateRules = defaultAutomateRules();
  return state.automateRules;
}

export function getAutomateRules() {
  if (!state.automateRules) initAutomateRules();
  return state.automateRules;
}

export function toggleAutomate(id) {
  const rule = getAutomateRules().find((r) => r.id === id);
  if (!rule) return;
  rule.enabled = !rule.enabled;
  save();
  invalidateRenderCache("all");
  render();
}

export function setAutomateThreshold(id, raw) {
  const rule = getAutomateRules().find((r) => r.id === id);
  if (!rule) return;
  const val = parseFloat(raw);
  if (!isNaN(val)) rule.threshold = Math.max(1, Math.min(99, val));
  save();
  render();
}

export function checkAutomateRules() {
  let didBuy = false;
  for (const rule of getAutomateRules()) {
    if (!rule.enabled) continue;
    if (rule.type === "buy_cheapest") {
      const cheapest = buildings
        .filter((b) => b.category === rule.category && isUnlocked(b))
        .sort((a, b) => {
          const cA = buildingCostAt(a, state.buildings[a.id] || 0)[a.currency] || 0;
          const cB = buildingCostAt(b, state.buildings[b.id] || 0)[b.currency] || 0;
          return cA - cB;
        })[0];
      if (cheapest) {
        const cost = buildingBatchCost(cheapest, 1);
        if (canPayCost(cost)) {
          payCost(cost);
          state.buildings[cheapest.id] = (state.buildings[cheapest.id] || 0) + 1;
          invalidateRenderCache("buildings");
          didBuy = true;
          chronicle(`Automate : ${cheapest.name} achete automatiquement.`);
        }
      }
    }
    if (rule.type === "crisis_action") {
      if (!crisisOpen()) continue;
      if (state.instability * 100 >= rule.threshold) {
        const costs = crisisCosts();
        if (canPayCost(costs[rule.actionId])) {
          runCrisisAction(rule.actionId, false);
        }
      }
    }
  }
  if (didBuy) render();
}

export function activateMyth(mythId) {
  if (gamePaused) return;
  const myth = getMythById(mythId);
  if (!myth || !isMythUnlocked(myth) || isMythCompleted(myth.id)) return;

  state.activeMythId = mythId;
  const _savedBabelCategory = state.babelCategory;
  resetCivilization();
  state.babelCategory = _savedBabelCategory;
  if (typeof myth.onActivate === "function") myth.onActivate();
  log(`Pacte active: ${myth.name}. ${myth.description}`);
  invalidateRenderCache("all");
  save();
  render();
}

export function resetCivilization() {
  state.population = 10 + ruinEffectSum("startPopulation");
  state.food = 35 + ruinEffectSum("startFood");
  state.gold = ruinEffectSum("startGold");
  state.knowledge = ruinEffectSum("startKnowledge");
  state.infrastructure = 0;
  state.instability = 0;
  state.timeWear = 0;
  state.crisisActions = { ...defaultState().crisisActions };
  state.crisisThresholds = {};
  state.crisisProduction = { ...defaultState().crisisProduction };
  state.collapsePreparation = 0;
  state.crisisExtensions = 0;
  state.crisisLimitAnnounced = false;
  state.crisisOpenedAt = null;
  state.archaeologyUsed = false;
  state.buildings = { ...defaultState().buildings };
  state.cityMapSlots = {};
  
  // HÃ©ritage Atlas : LÃ©gitimitÃ© reset Ã  50 au dÃ©but de chaque cycle
  if (state.atlasHeritage) state.atlasLegitimite = 50;
  state.atlasCrisisCount = 0;
  state.babelProdReached = false;
  state.orPopPeak          = state.population;
  state.orGoldReached      = false;
  state.orUsureImbalance   = false;
  state.phoenixCycleCount  = 0;
  state.phoenixTotalRuins  = 0;
  state.phoenixNextForceAt = null;
  state.hephPopPeak        = state.population;
  state.hephGoalReached    = false;
  
  invalidateRenderCache("all");
  enforceInfrastructureCap();
  resetCyclePeaks();
  state.cycleStartedAt = Date.now();
}

export function autoUnlockDogmas() {
  // Optionnel
}

export function collapse(reason) {
  if (collapseInProgress) return;
  // "forced" (Phoenix) et "auto_script" (Heritage Phenix) bypassent la garde crisisOpen
  if (reason !== "forced" && reason !== "auto_script" && !crisisOpen()) return;
  setCollapseInProgress(true);
  setGamePaused(true);
  const gain = ruinGain();
  const reasonLabel = reason === "manual" ? "manuel"
    : reason === "forced"      ? "force (Phoenix)"
    : reason === "auto_script" ? "automatique (Script)"
    : "automatique";
  chronicle(`Effondrement ${reasonLabel}: la cite s'effondre avec ${fmt(gain)} ruines.`);
  
  runCollapseSequence(gain, reason);
}

export function runCrisisAction(id, shouldRender = true) {
  const doRender = shouldRender === true || (shouldRender && shouldRender.render !== false);
  if (gamePaused || collapseInProgress) return;
  const costs = crisisCosts();
  const cost = costs[id];
  if (!cost || !canPayCost(cost)) return;
  payCost(cost);
  const effects = {
    rationing: { key: "rationing", drop: 0.06, note: "Les greniers sont rationnes: la pression de subsistance baisse pour ce cycle." },
    festivals: { key: "festivals", drop: 0.08, note: "Des jeux civiques apaisent les places et rendent la dynastie visible." },
    census: { key: "census", drop: 0.12, note: "Un recensement remet des noms sur la complexite de la cite." },
    reforms: { key: "reforms", drop: 0.18, note: "Des reformes retardent la rupture et renforcent les institutions." },
    archiveCrisis: { key: "census", drop: 0.09, note: "Les archives des catastrophes rendent la prochaine panique plus lisible." },
    ancestorCrisis: { key: "festivals", drop: 0.14, note: "Le culte des ancetres transforme la peur en continuite." }
  };
  const effect = effects[id];
  if (!effect) return;
  // Atlas : la Rupture ne peut pas Ãªtre rÃ©duite â€” on bloque effect.drop
  if (state.activeMythId !== "mythe_d_atlas") {
    state.instability = Math.max(0, state.instability - effect.drop);
  } else {
    state.atlasCrisisCount = (state.atlasCrisisCount || 0) + 1;
  }
  state.crisisActions[effect.key] += 1;
  if (id === "reforms") state.infrastructure += Math.max(1, totalBuildingCount() * 0.08);
  if (id === "archiveCrisis") state.knowledge += Math.max(4, state.cycles * 2);
  if (id === "ancestorCrisis") state.legitimacy += 0.35;
  if (state.crisisLimitAnnounced) state.crisisOpenedAt = Date.now();
  chronicle(effect.note);
  if (doRender) render();
}

export function gather() {
  if (gamePaused || collapseInProgress) return;
  const manualScale = Math.sqrt(globalMultiplier());
  const salvage = has("salvage_crews") ? 1.6 : 1;
  state.population += (0.15 + Math.sqrt(state.population) * 0.018) * manualScale;
  state.food += (1.1 + Math.sqrt(state.population) * 0.08) * manualScale * salvage;
  state.gold += Math.max(0, Math.log10(state.population) - 1) * 0.012 * salvage;
  state.knowledge += Math.max(0, Math.log10(state.population) - 1.5) * 0.006 * manualScale;
  render();
}

export function tick(dt) {
  if (gamePaused || collapseInProgress) return;

  // Caches frame invalidÃ©s au dÃ©but de tick
  renderCache._frameVitals = null;
  renderCache._framePressure = null;
  renderCache._frameGlobalMult = null;

  const vitals = cityVitals();
  const pressure = pressureBreakdown();
  const r = rates(vitals, pressure);

  // Accumulation des ressources
  state.population = Math.max(1, state.population + r.population * dt);
  state.food = Math.max(0, state.food + r.food * dt);
  state.gold = Math.max(0, state.gold + r.gold * dt);
  state.knowledge = Math.max(0, state.knowledge + r.knowledge * dt);
  state.infrastructure = Math.max(0, state.infrastructure + r.infrastructure * dt);

  enforceInfrastructureCap();

  // Usure du temps
  state.timeWear = clamp01((state.timeWear || 0) + timeWearRate() * dt);

  // Instabilite
  const instabilityTarget = clamp01(r.instability);
  const instabilityDrift = instabilityTarget - state.instability;
  const nextInstability = state.instability + instabilityDrift * 0.045 * dt;
  state.instability = instabilityTarget >= 1 && nextInstability >= 0.995
    ? 1
    : clamp01(nextInstability);

  // Pics du cycle
  const peaks = state.cyclePeaks;
  if (state.population > peaks.population) peaks.population = state.population;
  if (state.knowledge > peaks.knowledge) peaks.knowledge = state.knowledge;
  if (state.infrastructure > peaks.infrastructure) peaks.infrastructure = state.infrastructure;
  const currentEra = currentEraIndex();
  if (currentEra > peaks.eraIndex) {
    peaks.eraIndex = currentEra;
    if (currentEra > (state.bestEraIndex || 0)) state.bestEraIndex = currentEra;
  }

  // HÃ©ritage Atlas
  if (state.atlasHeritage) {
    state.atlasLegitimite = Math.min(100, (state.atlasLegitimite || 50) + ATLAS_LEGIT_PASSIVE_RATE * dt);
  }

  // Mythe d'Icare
  if (state.activeMythId === "mythe_d_icare" && !state.icareInfraReached) {
    if (state.infrastructure >= ICARE_INFRA_TARGET) {
      state.icareInfraReached = true;
      log(`Icare : l'infrastructure a atteint ${fmt(ICARE_INFRA_TARGET)} ! Le soleil est touche.`);
    }
  }

  // Mythe de PromÃ©thÃ©e
  if (state.activeMythId === "mythe_de_promethee") {
    if (!state.prometheePopReached && state.population >= PROMETHEE_POP_TARGET) {
      state.prometheePopReached = true;
      log(`Promethee : la population a atteint ${fmt(PROMETHEE_POP_TARGET)} habitants ! L'epopee est accomplie.`);
    }
    if (!state.prometheePopReached && !state.prometheeFailed && state.instability >= PROMETHEE_FATAL_RUPTURE) {
      state.prometheeFailed = true;
      log(`Promethee echoue : la Rupture a consume la cite avant que la population n'atteigne sa gloire.`);
    }
  }

  // Mythe de l'Ã‚ge d'Or
  if (state.activeMythId === "mythe_age_or") {
    if (state.population > (state.orPopPeak || 0)) state.orPopPeak = state.population;
    const _orF = state.food;
    const _orG = state.gold;
    state.orUsureImbalance = Math.abs(_orF - _orG) / Math.max(_orF, _orG, 1) > OR_BALANCE_RATIO;
    if (!state.orGoldReached && state.gold >= OR_GOLD_TARGET && (state.orPopPeak || 0) <= OR_POP_CAP) {
      state.orGoldReached = true;
      log(`Age d'Or : le Tresor a atteint ${fmt(OR_GOLD_TARGET)} ! La prosperite est etablie â€” que le pacte soit scelle.`);
    }
  }

  // Mythe de Babel
  if (state.activeMythId === "mythe_de_babel" && !state.babelProdReached) {
    if (babelExponentialMult() >= BABEL_MULT_TARGET) {
      state.babelProdReached = true;
      const catLabel = BABEL_CAT_LABELS?.[state.babelCategory] || state.babelCategory;
      log(`Babel : la tour s'eleve ! La puissance de "${catLabel}" atteint x${BABEL_MULT_TARGET} â€” le pacte est en passe d'etre honore.`);
    }
  }

  // Mythe du PhÃ©nix
  if (state.activeMythId === "mythe_du_phenix" && state.phoenixNextForceAt &&
      Date.now() >= state.phoenixNextForceAt && !collapseInProgress && !gamePaused) {
    state.phoenixNextForceAt = null;
    collapse("forced");
    return;
  }

  // Mythe d'HÃ©phaÃ¯stos
  if (state.activeMythId === "mythe_d_hephaistos") {
    if (state.population > (state.hephPopPeak || 0)) state.hephPopPeak = state.population;
    const hephElapsed = (Date.now() - (state.cycleStartedAt || Date.now())) / 60_000;
    if (hephElapsed > HEPH_POP_DECAY_START_MIN) {
      const decayRate = state.population * HEPH_POP_DECAY_RATE / 60; // par seconde
      state.population = Math.max(1, state.population - decayRate * dt);
    }
    if (!state.hephGoalReached) {
      const hephDecline = 1 - state.population / Math.max(1, state.hephPopPeak || 1);
      if (state.infrastructure >= HEPH_INFRA_TARGET && hephDecline >= HEPH_POP_DECLINE_PCT) {
        state.hephGoalReached = true;
        log(`Hephaistos : les machines ont supplante les hommes. Infrastructure ${fmt(HEPH_INFRA_TARGET)} atteinte, population en declin de ${Math.round(hephDecline * 100)}% depuis son pic.`);
      }
    }
  }

  // Automates ancestraux
  if (state.hephHeritage && !collapseInProgress && !gamePaused) {
    checkAutomateRules();
  }

  // Script d'Automatisation
  if (state.phoenixHeritage && !collapseInProgress && !gamePaused) {
    checkAutoScriptRules();
  }

  // Protocoles de stabilisation
  if (has("protocoles_urgence") && !crisisOpen() && !gamePaused && !collapseInProgress) {
    const inst = state.instability;
    const costs = crisisCosts();
    if (inst >= 0.82 && canPayCost(costs.census)) runCrisisAction("census", false);
    else if (inst >= 0.65 && canPayCost(costs.rationing)) runCrisisAction("rationing", false);
  }

  // Crises contextuelles
  checkCrisisThresholds();
  if (gamePaused || collapseInProgress) return;

  // DÃ©clenchement du panneau terminal
  if (crisisOpen() && !state.crisisLimitAnnounced && !collapseInProgress) {
    triggerCollapseChoices(false);
  }
}

