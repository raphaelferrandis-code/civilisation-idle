"use strict";

/* ============================================================================
 * actions.js - Logique de jeu mutante: achats, crises, effondrement, dynastie, mythe, resets, gather, log/chronicle, tick.
 * Ordre de chargement (index.html): U -> DB -> DU -> DW -> ST -> ME -> EV -> AC -> RE -> MA
 * Scope global partage (pas de modules) - ne pas envelopper dans une IIFE.
 * ============================================================================ */

// Selectionne un event contextuel pour un palier donne.
// Evite de repeter les events recents (state.recentCrisisIds).
function pickCrisisEvent(threshold) {
  const vitals = cityVitals();
  const pool = CRISIS_POOL.filter((e) => e.threshold === threshold);
  const eligible = pool.filter((e) => !e.condition || e.condition(state, vitals));
  const candidates = eligible.length ? eligible : pool;
  const recent = state.recentCrisisIds || [];
  const fresh = candidates.filter((e) => !recent.includes(e.id));
  const choices = fresh.length ? fresh : candidates;
  return choices[state.cycles % choices.length];
}

function buyBuilding(id) {
  const building = buildingById[id];
  if (!building) return;
  // ── Mythe de Babel : seule la catégorie choisie est achetable ────────────
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
  // ── Mythe de Sisyphe : chaque achat hausse la malédiction de coût ──────────
  if (state.activeMythId === "mythe_de_sisyphe") {
    state.sisypheMult = (state.sisypheMult || 1) * SISYPHE_MULT_PER_PURCHASE;
  }
  // ── Mythe de Prométhée : chaque moteur de nourriture acheté hausse la Rupture ──
  if (state.activeMythId === "mythe_de_promethee" && building.food > 0) {
    const ruptureAdded = amount * PROMETHEE_RUPTURE_PER_FOOD;
    state.instability = clamp01((state.instability || 0) + ruptureAdded);
  }
  chronicleBuilding(building, previousCount, state.buildings[id]);
  invalidateRenderCache("buildings");
  render();
}

function exhumeVestige() {
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

async function performGrandReset() {
  if (collapseInProgress || gamePaused || !has("grand_reset")) return;
  // Guard double-appel : bloquer immédiatement avant le premier await
  gamePaused = true;
  const nextCount = (state.grandResetCount || 0) + 1;
  const choice = await openChoiceDialog({
    title: "Grand Reset",
    body: `Tout sera efface: batiments, ruines, upgrades, cycles, heritage. Mais un bonus permanent x${Math.pow(2, nextCount).toFixed(0)} sur toute la production est ajoute pour toujours. Actuellement: x${Math.pow(2, state.grandResetCount || 0).toFixed(0)}. Apres: x${Math.pow(2, nextCount).toFixed(0)}.`,
    options: [
      { label: "Tout reinitialiser", detail: `+x${Math.pow(2, nextCount).toFixed(0)} production permanente` },
      { label: "Annuler", detail: "Ne rien faire" }
    ]
  });
  if (choice.label === "Annuler") { gamePaused = false; return; }

  // gamePaused est déjà true depuis le début de la fonction

  // Fondu au noir
  const app = document.querySelector(".app");
  app.style.transition = "opacity 1.2s ease";
  app.style.opacity = "0";
  await new Promise((resolve) => setTimeout(resolve, 1300));

  // Reset complet in-place (mutation directe de l'objet state pour éviter
  // tout problème de référence avec les closures du setInterval)
  // grandResetCount, mythsCompleted et mythActsAnnounced survivent (méta-progression permanente)
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
  for (const key of Object.keys(state)) delete state[key];
  Object.assign(state, fresh);

  gamePaused = false;
  collapseInProgress = false;
  invalidateRenderCache("all");
  save();
  openView("city");
  render();

  // Retour progressif
  app.style.transition = "opacity 1.2s ease";
  app.style.opacity = "1";
}

// ── Helpers calcul ──────────────────────────────────────────────────────────

function totalBuildingCount() {
  return Object.values(state.buildings).reduce((sum, count) => sum + count, 0);
}

function nomadInfrastructureCap() {
  if (!has("trait_nomadism")) return Infinity;
  const normalCapacity = 80 + state.population * 0.015 + state.knowledge * 0.003 + totalBuildingCount() * 5;
  return normalCapacity * 0.7;
}

function enforceInfrastructureCap() {
  state.infrastructure = Math.min(state.infrastructure, nomadInfrastructureCap());
}

function maxBuyAmount(building) {
  let lo = 0, hi = 500;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (canPayCost(buildingBatchCost(building, mid))) lo = mid;
    else hi = mid - 1;
  }
  return Math.max(1, lo);
}

function buildingBatchCost(building, amount = buyAmount) {
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
  if (state.activeMythId === "mythe_de_sisyphe" && (state.sisypheMult || 1) > 1) {
    const mult = state.sisypheMult;
    for (const currency of Object.keys(costs)) costs[currency] *= mult;
  }
  return costs;
}

function canExhume() {
  return has("skill_archaeology") && !state.archaeologyUsed && state.knowledge >= archaeologyCost();
}

function archaeologyCost() {
  const remembered = Object.values(state.lastCollapsedBuildings || {}).reduce((sum, count) => sum + count, 0);
  return Math.max(25000, state.population * 0.12, remembered * 8500);
}

function archaeologyTarget() {
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

function crisisCosts() {
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

function terminalCrisisCost(type) {
  const extensionScale = 1 + (state.crisisExtensions || 0) * 0.55;
  const depthScale = 1 + Math.max(0, ruinGain() - 1) * 0.08;
  const scale = extensionScale * depthScale;
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
    knowledge: Math.max(60, totalBuildingCount() * 10) * scale
  };
}

function terminalCrisisReady(type) {
  if (!crisisOpen()) return false;
  if ((state.crisisExtensions || 0) >= 7) return false;
  return canPayCost(terminalCrisisCost(type));
}

function ruinGain() {
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
  const maxEraIndex = (typeof eras !== "undefined" && eras.length > 1) ? eras.length - 1 : 6;
  const normalizedEraIndex = (peaks.eraIndex || 0) * (6 / Math.max(1, maxEraIndex));
  const ageDepth = 0.55 + normalizedEraIndex * 0.22;
  const populationDepth = Math.max(0.35, Math.pow(Math.max(10, peaks.population) / 25000, 0.34));
  const civicDepth = 0.75 + Math.log10((peaks.knowledge || 0) + (peaks.infrastructure || 0) * 4 + 10) * 0.14;
  const pressure = 1 + Math.max(0, crisisProgress() - 1) * 0.28;
  const preparation = 1 + Math.min(2.4, state.collapsePreparation || 0);
  const doctrineRuinMod = hasDoctrine("acier") ? 1.4 : hasDoctrine("sillon") ? 0.8 : 1;
  const raw = ageDepth * populationDepth * civicDepth * patience * pressure * preparation * ruinEffectMultiplier("ruinGain") * doctrineRuinMod;
  return Math.max(age >= 120 ? 1 : 0, Math.floor(raw));
}

function legitimacyGain() {
  if (state.ruins < 300) return 0;
  return Math.floor(Math.pow(state.ruins / 160, 0.5) + state.cycles / 12);
}

// ── Achats ───────────────────────────────────────────────────────────────────

function buyUpgrade(id) {
  const upgrade = upgradeById[id];
  if (!upgrade) return;
  if (!canBuyUpgrade(upgrade)) return;
  if (upgrade.group === "ruins") {
    state.ruins -= upgrade.cost.ruins || 0;
  } else {
    payCost(upgrade.cost);
  }
  state.upgrades[id] = true;
  cachedRuinEffects = null;
  cachedRuinEffectsSignature = "";
  invalidateRenderCache("all");
  chronicle(`Amelioration acquise: ${upgrade.name}.`);
  render();
}

function log(message) {
  state.history = [...(state.history || []), message].slice(-48);
}

function chronicle(message) {
  const year = cycleYear();
  const era = eras[currentEraIndex()].name;
  log(`An ${fmt(year)}, ${era}: ${message}`);
}

function cycleYear() {
  const elapsed = Math.max(0, (Date.now() - (state.cycleStartedAt || Date.now())) / 1000);
  return Math.floor(elapsed / 60) + 1;
}

function chronicleBuilding(building, previousCount, newCount) {
  const amount = newCount - previousCount;
  if (amount <= 0) return;
  if (previousCount === 0) {
    chronicle(`${building.name} apparait pour la premiere fois dans la cite (+${fmt(amount)}).`);
  } else if (amount >= 25 || newCount % 25 === 0) {
    chronicle(`${building.name} atteint ${fmt(newCount)} unites (+${fmt(amount)}).`);
  }
}

function resetCyclePeaks() {
  state.cyclePeaks = {
    population: state.population,
    knowledge: state.knowledge,
    infrastructure: state.infrastructure,
    eraIndex: currentEraIndex()
  };
}

function checkCrisisThresholds() {
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
  if (gamePaused || collapseInProgress) return;
}

async function openCrisisEvent(event) {
  gamePaused = true;
  render();
  // Héphaïstos : crises narratives irrésolubles si pop < seuil critique
  if (state.activeMythId === "mythe_d_hephaistos" && state.population < HEPH_POP_CRISIS_THRESHOLD) {
    chronicle(`Hephaistos : population critique (${Math.floor(state.population)} hab). La crise est irresolvable — ses effets negatifs s'imposent sans remede.`);
    addProductionPenalty("global", 0.06);
    state.instability = clamp01(state.instability + 0.05);
    gamePaused = false;
    render();
    return;
  }
  const choice = await openChoiceDialog(event);
  choice.apply();
  state.instability = clamp01(state.instability);
  gamePaused = false;
  render();
}

function addProductionPenalty(type, amount) {
  const current = state.crisisProduction[type] ?? 1;
  state.crisisProduction[type] = Math.max(0.1, current * (1 - amount));
}

function clearProductionPenalties(key) {
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

function triggerCollapseChoices(shouldRender = true) {
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

function resumeAfterCrisisOutcome() {
  if (collapseInProgress) return;
  gamePaused = false;
  state.crisisLimitAnnounced = false;
  state.crisisOpenedAt = null;
}

function lowerTerminalPressure(targetInstability, targetWear) {
  if (state.instability >= 1) state.instability = Math.min(state.instability, targetInstability);
  if ((state.timeWear || 0) >= 1) state.timeWear = Math.min(state.timeWear, targetWear);
  if (!crisisOpen()) resumeAfterCrisisOutcome();
}

function runTerminalCrisisAction(type) {
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

function completeCollapse(gain, fallenDynasty, epitaph, reason) {
  const wasChaos   = state.activeMythId === "mythe_du_chaos";
  const wasPhoenix = state.activeMythId === "mythe_du_phenix";

  // Phoenix : accumule les ruines et incrémente le compteur de cycles AVANT l'évaluation
  if (wasPhoenix) {
    state.phoenixTotalRuins = (state.phoenixTotalRuins || 0) + gain;
    state.phoenixCycleCount = (state.phoenixCycleCount || 0) + 1;
  }
  const phoenixDone = wasPhoenix && state.phoenixCycleCount >= PHENIX_CYCLE_COUNT;

  if (!wasPhoenix || phoenixDone) {
    // Évaluation normale (dernier cycle Phoenix ou tout autre mythe)
    checkMythOnCollapse();
    state.activeMythId = null;
  } else {
    // Cycle intermédiaire Phoenix : le mythe reste actif
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
  // Carte: fige la disposition actuelle comme vestige du run qui s'effondre
  // (conserve au maximum les 3 derniers runs).
  if (typeof captureVestige === "function") captureVestige();
  state.ruins += gain;
  if (wasChaos && state.chaosRuinsDouble) {
    state.chaosRuinsBonus = (state.chaosRuinsBonus || 0) + gain;
    chronicle(`Heritage Chaos: +${fmt(gain)} ruines virtuelles — le multiplicateur de Ruines en beneficie en permanence.`);
  }
  state.cycles += 1;
  state.population = Math.max(10, keptPop);
  state.food = Math.max(35 + ruinEffectSum("startFood"), keptFood);
  state.gold = Math.max(ruinEffectSum("startGold"), keptGold);
  // "Memoire des Cycles" : bonus Savoir proportionnel à l'ère max atteinte historiquement
  const memoireSavoirBonus = has("codex_mythique") ? 250 * (state.bestEraIndex || 0) : 0;
  state.knowledge = Math.max(ruinEffectSum("startKnowledge"), keptKnowledge) + memoireSavoirBonus;
  // state.ruins contient déjà le gain (state.ruins += gain ligne précédente) — ne pas l'additionner deux fois
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
  // Héritage Atlas : Légitimité reset à 50 au début de chaque cycle
  if (state.atlasHeritage) state.atlasLegitimite = 50;
  state.atlasCrisisCount = 0;
  state.babelProdReached = false;
  state.babelCategory    = null;
  state.orPopPeak        = 0;
  state.orGoldReached    = false;
  state.orUsureImbalance = false;
  state.hephPopPeak      = 0;
  state.hephGoalReached  = false;
  // Phoenix: les compteurs (cycleCount, totalRuins, nextForceAt) sont gérés
  // séparément dans le bloc Phoenix en tête de completeCollapse()
  invalidateRenderCache("all");
  enforceInfrastructureCap();
  resetCyclePeaks();
  state.cycleStartedAt = Date.now();
  const source = reason === "manual" ? "choisit l'effondrement" : "atteint sa limite";
  log(`Cycle ${state.cycles - 1}, an ${age}: ${fallenDynasty}, ${era}, ${source}. Epitaphe: ${epitaph} Les survivants nomment ${fmt(gain)} ruines et recommencent.`);
  // "Archivistes des Ruines" : achète automatiquement le premier upgrade de ruines abordable
  if (has("conservateurs_ruines")) {
    const cheapest = upgrades
      .filter((u) => u.group === "ruins" && !has(u.id) && state.ruins >= (u.cost?.ruins || Infinity))
      .sort((a, b) => (a.cost?.ruins || 0) - (b.cost?.ruins || 0))[0];
    if (cheapest) {
      state.ruins -= (cheapest.cost?.ruins || 0);
      state.upgrades[cheapest.id] = true;
      cachedRuinEffects = null;
      cachedRuinEffectsSignature = "";
      chronicle(`Archivistes: ${cheapest.name} acquis automatiquement.`);
    }
  }
  if (memoireSavoirBonus > 0) {
    chronicle(`Memoire des Cycles: +${fmt(memoireSavoirBonus)} savoir issu des eres precedentes.`);
  }

  // Phoenix : planifie le prochain effondrement forcé si le cycle continue
  if (wasPhoenix && !phoenixDone) {
    state.phoenixNextForceAt = Date.now() + PHENIX_FORCE_INTERVAL;
  } else {
    state.phoenixNextForceAt = null;
  }
}

async function foundDynasty() {
  const gain = legitimacyGain();
  if (gain <= 0 || gamePaused) return;
  gamePaused = true;
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
  gamePaused = false;
  resetCivilization();
  const doctrine = DOCTRINES.find((d) => d.id === state.dynastyDoctrine);
  log(`Dynastie ${state.dynastyCount}: les ruines deviennent ${fmt(gain)} legitimite. La ${doctrine?.name || "doctrine"} est proclamee.`);
  save();
  render();
}

// ── Système de Mythes ────────────────────────────────────────────────────────

function checkMythOnCollapse() {
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

function activateSurchauffe() {
  if (!state.icareHeritage || gamePaused || collapseInProgress) return;
  const now = Date.now();
  if (state.surchauffeCooldownEnd && now < state.surchauffeCooldownEnd) return;

  state.surchauffeEndTime    = now + SURCHAUFFE_DURATION_MS;
  state.surchauffeCooldownEnd = now + SURCHAUFFE_DURATION_MS + SURCHAUFFE_COOLDOWN_MS;
  state.instability = clamp01((state.instability || 0) + SURCHAUFFE_RUPTURE);
  _frameGlobalMult = null;
  log(`Surchauffe : production x${SURCHAUFFE_PROD_MULT} pendant ${SURCHAUFFE_DURATION_MS / 1000}s. Rupture +${Math.round(SURCHAUFFE_RUPTURE * 100)}%.`);
  save();
  render();
}

// ── Script d'Automatisation ──────────────────────────────────────────────────

function initAutoScriptRules() {
  state.autoScriptRules = [
    { id: "rule_rupture", type: "rupture", label: "Effondrer si Rupture atteint", unit: "%",   threshold: 80, enabled: false },
    { id: "rule_usure",   type: "usure",   label: "Effondrer si Usure atteint",   unit: "%",   threshold: 80, enabled: false },
    { id: "rule_time",    type: "time",    label: "Effondrer apres",               unit: "min", threshold: 5,  enabled: false }
  ];
  return state.autoScriptRules;
}

function getAutoScriptRules() {
  if (!state.autoScriptRules) initAutoScriptRules();
  return state.autoScriptRules;
}

function toggleAutoScriptRule(id) {
  const rule = getAutoScriptRules().find((r) => r.id === id);
  if (!rule) return;
  rule.enabled = !rule.enabled;
  save();
  invalidateRenderCache("all");
  render();
}

function setAutoScriptThreshold(id, raw) {
  const rule = getAutoScriptRules().find((r) => r.id === id);
  if (!rule) return;
  const val = parseFloat(raw);
  if (!isNaN(val)) rule.threshold = Math.max(1, Math.min(9999, val));
  save();
}

function checkAutoScriptRules() {
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
      log(`Script : "${rule.label} ${rule.threshold}${rule.unit}" — effondrement declenche.`);
      collapse("auto_script");
      return;
    }
  }
}

// ── Automates ancestraux ─────────────────────────────────────────────────────

function initAutomateRules() {
  state.automateRules = [
    { id: "auto_buy_city",  type: "buy_cheapest",  category: "city",      label: "Acheter bati. (Cite) si abordable",  enabled: false },
    { id: "auto_buy_infra", type: "buy_cheapest",  category: "infra",     label: "Acheter bati. (Infra) si abordable", enabled: false },
    { id: "auto_rationing", type: "crisis_action", actionId: "rationing", label: "Rationnement si Rupture >=", unit: "%", threshold: 60, enabled: false }
  ];
  return state.automateRules;
}

function getAutomateRules() {
  if (!state.automateRules) initAutomateRules();
  return state.automateRules;
}

function toggleAutomate(id) {
  const rule = getAutomateRules().find((r) => r.id === id);
  if (!rule) return;
  rule.enabled = !rule.enabled;
  save();
  invalidateRenderCache("all");
  render();
}

function setAutomateThreshold(id, raw) {
  const rule = getAutomateRules().find((r) => r.id === id);
  if (!rule) return;
  const val = parseFloat(raw);
  if (!isNaN(val)) rule.threshold = Math.max(1, Math.min(99, val));
  save();
}

function checkAutomateRules() {
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

function activateMyth(mythId) {
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

function resetCivilization() {
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
  // Héritage Atlas : Légitimité reset à 50 au début de chaque cycle
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

function autoUnlockDogmas() {
  // Hook de déverrouillage automatique des dogmes (réservé aux futurs mécanismes).
  // Les dogmes s'achètent manuellement via buyUpgrade — cette fonction existe
  // pour être appelée sans erreur si invoquée depuis d'autres modules.
}

function collapse(reason) {
  if (collapseInProgress) return;
  // "forced" (Phoenix) et "auto_script" (Heritage Phenix) bypassent la garde crisisOpen
  if (reason !== "forced" && reason !== "auto_script" && !crisisOpen()) return;
  collapseInProgress = true;
  gamePaused = true;
  const gain = ruinGain();
  const reasonLabel = reason === "manual" ? "manuel"
    : reason === "forced"      ? "force (Phoenix)"
    : reason === "auto_script" ? "automatique (Script)"
    : "automatique";
  chronicle(`Effondrement ${reasonLabel}: la cite s'effondre avec ${fmt(gain)} ruines.`);
  runCollapseSequence(gain, reason);
}

function runCrisisAction(id, shouldRender = true) {
  // shouldRender peut être un booléen ou un objet { render: bool } (compatibilité checkAutoCollapse)
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
  // Atlas : la Rupture ne peut pas être réduite — on bloque effect.drop
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

function gather() {
  if (gamePaused || collapseInProgress) return;
  const manualScale = Math.sqrt(globalMultiplier());
  const salvage = has("salvage_crews") ? 1.6 : 1;
  state.population += (0.15 + Math.sqrt(state.population) * 0.018) * manualScale;
  state.food += (1.1 + Math.sqrt(state.population) * 0.08) * manualScale * salvage;
  state.gold += Math.max(0, Math.log10(state.population) - 1) * 0.012 * salvage;
  state.knowledge += Math.max(0, Math.log10(state.population) - 1.5) * 0.006 * manualScale;
  render();
}

function tick(dt) {
  if (gamePaused || collapseInProgress) return;

  // Invalide les caches frame en debut de tick pour forcer un recalcul propre
  _frameVitals = null;
  _framePressure = null;
  _frameGlobalMult = null;

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

  // Usure du temps (progresse meme hors crise, meme hors ligne)
  state.timeWear = clamp01((state.timeWear || 0) + timeWearRate() * dt);

  // Instabilite : la pression devient une cible, pas une vitesse brute.
  const instabilityTarget = clamp01(r.instability);
  const instabilityDrift = instabilityTarget - state.instability;
  const nextInstability = state.instability + instabilityDrift * 0.045 * dt;
  state.instability = instabilityTarget >= 1 && nextInstability >= 0.995
    ? 1
    : clamp01(nextInstability);

  // Mise a jour des pics du cycle
  const peaks = state.cyclePeaks;
  if (state.population > peaks.population) peaks.population = state.population;
  if (state.knowledge > peaks.knowledge) peaks.knowledge = state.knowledge;
  if (state.infrastructure > peaks.infrastructure) peaks.infrastructure = state.infrastructure;
  const currentEra = currentEraIndex();
  if (currentEra > peaks.eraIndex) {
    peaks.eraIndex = currentEra;
    if (currentEra > (state.bestEraIndex || 0)) state.bestEraIndex = currentEra;
  }

  // ── Héritage Atlas : montée passive de la Légitimité ─────────────────────
  if (state.atlasHeritage) {
    state.atlasLegitimite = Math.min(100, (state.atlasLegitimite || 50) + ATLAS_LEGIT_PASSIVE_RATE * dt);
  }

  // ── Mythe d'Icare : suivi du seuil d'Infrastructure ─────────────────────
  if (state.activeMythId === "mythe_d_icare" && !state.icareInfraReached) {
    if (state.infrastructure >= ICARE_INFRA_TARGET) {
      state.icareInfraReached = true;
      log(`Icare : l'infrastructure a atteint ${fmt(ICARE_INFRA_TARGET)} ! Le soleil est touche.`);
    }
  }

  // ── Mythe de Prométhée : suivi pop cible vs seuil fatal de Rupture ──────
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

  // ── Mythe de l'Âge d'Or : imbalance Nourriture/Trésor + condition de réussite ──
  if (state.activeMythId === "mythe_age_or") {
    if (state.population > (state.orPopPeak || 0)) state.orPopPeak = state.population;
    const _orF = state.food;
    const _orG = state.gold;
    state.orUsureImbalance = Math.abs(_orF - _orG) / Math.max(_orF, _orG, 1) > OR_BALANCE_RATIO;
    if (!state.orGoldReached && state.gold >= OR_GOLD_TARGET && (state.orPopPeak || 0) <= OR_POP_CAP) {
      state.orGoldReached = true;
      log(`Age d'Or : le Tresor a atteint ${fmt(OR_GOLD_TARGET)} ! La prosperite est etablie — que le pacte soit scelle.`);
    }
  }

  // ── Mythe de Babel : suivi du multiplicateur cible ───────────────────────
  if (state.activeMythId === "mythe_de_babel" && !state.babelProdReached) {
    if (babelExponentialMult() >= BABEL_MULT_TARGET) {
      state.babelProdReached = true;
      const catLabel = BABEL_CAT_LABELS?.[state.babelCategory] || state.babelCategory;
      log(`Babel : la tour s'eleve ! La puissance de "${catLabel}" atteint x${BABEL_MULT_TARGET} — le pacte est en passe d'etre honore.`);
    }
  }

  // ── Mythe du Phénix : effondrement forcé toutes les 5 minutes ─────────────
  if (state.activeMythId === "mythe_du_phenix" && state.phoenixNextForceAt &&
      Date.now() >= state.phoenixNextForceAt && !collapseInProgress && !gamePaused) {
    state.phoenixNextForceAt = null;
    collapse("forced");
    return;
  }

  // ── Mythe d'Héphaïstos : déclin de population + suivi + condition de réussite ──
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

  // ── Automates ancestraux (Héritage Héphaïstos) ───────────────────────────
  if (state.hephHeritage && !collapseInProgress && !gamePaused) {
    checkAutomateRules();
  }

  // ── Script d'Automatisation (Héritage Phénix) ────────────────────────────
  if (state.phoenixHeritage && !collapseInProgress && !gamePaused) {
    checkAutoScriptRules();
  }

  // "Protocoles de stabilisation" : auto-crise à 65% et 82% de rupture
  if (has("protocoles_urgence") && !crisisOpen() && !gamePaused && !collapseInProgress) {
    const inst = state.instability;
    const costs = crisisCosts();
    if (inst >= 0.82 && canPayCost(costs.census)) runCrisisAction("census", false);
    else if (inst >= 0.65 && canPayCost(costs.rationing)) runCrisisAction("rationing", false);
  }

  // Crises contextuelles (paliers 25/50/75%)
  // openCrisisEvent() pose gamePaused=true synchronement — on re-verifie apres.
  checkCrisisThresholds();
  if (gamePaused || collapseInProgress) return;

  // Declenchement du panneau terminal si rupture ou usure atteint 100%
  if (crisisOpen() && !state.crisisLimitAnnounced && !collapseInProgress) {
    triggerCollapseChoices(false);
  }
}
