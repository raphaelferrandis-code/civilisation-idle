"use strict";

import {
  state,
  gamePaused,
  collapseInProgress,
  renderCache
} from '../state.js';

import {
  cityVitals,
  pressureBreakdown,
  rates,
  timeWearRate,
  crisisOpen,
  crisisCosts,
  currentEraIndex,
  enforceInfrastructureCap,
  has
} from '../mechanics.js';

import {
  checkCrisisThresholds,
  triggerCollapseChoices,
  runCrisisAction
} from './crisis.js';

import { tickOlympus } from './olympus.js';
import { runMythTicks } from './mythTicks.js';

import {
  checkAutomateRules,
  checkAutoScriptRules
} from './automation.js';

import { log } from './utils.js';
import { clamp01, canPayCost } from '../utils.js';
import { D, toNum } from '../num.js';
import { checkAndTriggerChronicleEntries } from '../chronicleEvaluator.js';
import { INSTABILITY_DRIFT_SPEED } from '../balance.js';
import {
  ATLAS_LEGIT_PASSIVE_RATE,
  isMythEffectActive
} from '../../data/myths.js';

export function tick(dt) {
  if (gamePaused || collapseInProgress) return;

  renderCache._frameVitals = null;
  renderCache._framePressure = null;
  renderCache._frameGlobalMult = null;
  renderCache._frameGlobalMultDec = null;
  renderCache._frameRates = null;

  if (state.crisisLimitAnnounced) {
    if (state.instability >= 1) state.instability = 1;
    if ((state.timeWear || 0) >= 1) state.timeWear = 1;
    return;
  }

  const vitals = cityVitals();
  const pressure = pressureBreakdown();
  const r = rates(vitals, pressure);
  tickOlympus(dt);

  state.population = D(state.population).add(r.population.mul(dt)).max(1);
  state.food = D(state.food).add(r.food.mul(dt)).max(0);
  state.gold = D(state.gold).add(r.gold.mul(dt)).max(0);
  state.knowledge = D(state.knowledge).add(r.knowledge.mul(dt)).max(0);
  state.infrastructure = D(state.infrastructure).add(r.infrastructure.mul(dt)).max(0);

  enforceInfrastructureCap();

  if (isMythEffectActive("mythe_atrides")) {
    // La dette Atrides reste un number natif (mythe de milieu de partie) :
    // on borne à MAX_VALUE pour ne jamais propager Infinity.
    const totalProd = Math.max(0, toNum(r.food.add(r.gold).add(r.knowledge).add(r.infrastructure)));
    const growthPerSec = Math.min(Number.MAX_VALUE, Math.max(10, totalProd * 0.01) * (state.atridesDebtGrowthMultiplier || 1));
    state.atridesDebt = Math.min(Number.MAX_VALUE, (state.atridesDebt || 0) + growthPerSec * dt);

    if (state.atridesDebtGrowthMultiplier < 1 && Date.now() >= (state.atridesRenegotiateActiveUntil || 0)) {
      state.atridesDebtGrowthMultiplier = 1;
      log("Les accords de renegociation ont expire. La dette de la cite reprend sa croissance normale.");
    }
  }

  state.timeWear = clamp01((state.timeWear || 0) + timeWearRate() * dt);

  const instabilityTarget = clamp01(r.instability);
  const instabilityDrift = instabilityTarget - state.instability;
  // "Maintenir l'ordre" ralentit la montée de la rupture (jamais sa descente).
  const orderSlow = instabilityDrift > 0
    ? 1 - Math.min(0.8, state.terminalPreparations?.ruptureSlow || 0)
    : 1;
  const nextInstability = state.instability + instabilityDrift * INSTABILITY_DRIFT_SPEED * orderSlow * dt;
  state.instability = instabilityTarget >= 1 && nextInstability >= 0.995
    ? 1
    : clamp01(nextInstability);

  const peaks = state.cyclePeaks;
  if (D(state.population).gt(peaks.population)) peaks.population = state.population;
  if (D(state.knowledge).gt(peaks.knowledge)) peaks.knowledge = state.knowledge;
  if (D(state.infrastructure).gt(peaks.infrastructure)) peaks.infrastructure = state.infrastructure;
  const currentEra = currentEraIndex();
  if (currentEra > peaks.eraIndex) {
    peaks.eraIndex = currentEra;
    if (currentEra > (state.bestEraIndex || 0)) state.bestEraIndex = currentEra;
  }

  if (state.atlasHeritage) {
    state.atlasLegitimite = Math.min(100, (state.atlasLegitimite || 50) + ATLAS_LEGIT_PASSIVE_RATE * dt);
  }

  if (runMythTicks(state, dt) === "abort") return;

  if (state.cadmosPromptPending) return;

  if (state.hephHeritage && !collapseInProgress && !gamePaused) {
    checkAutomateRules();
  }

  if (state.phoenixHeritage && !collapseInProgress && !gamePaused) {
    checkAutoScriptRules();
  }

  if (has("protocoles_urgence") && !crisisOpen() && !gamePaused && !collapseInProgress) {
    const inst = state.instability;
    const costs = crisisCosts();
    if (inst >= 0.82 && canPayCost(costs.census)) runCrisisAction("census", { render: false });
    else if (inst >= 0.65 && canPayCost(costs.rationing)) runCrisisAction("rationing", { render: false });
  }

  checkAndTriggerChronicleEntries(state, dt);

  checkCrisisThresholds();
  if (gamePaused || collapseInProgress) return;

  if (crisisOpen() && !state.crisisLimitAnnounced && !collapseInProgress) {
    triggerCollapseChoices(false);
  }
}
