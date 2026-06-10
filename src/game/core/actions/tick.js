"use strict";

import {
  state,
  gamePaused,
  collapseInProgress,
  renderCache,
  invalidateRenderCache
} from '../state.js';

import {
  cityVitals,
  pressureBreakdown,
  rates,
  babelExponentialMult,
  timeWearRate,
  crisisOpen,
  crisisCosts,
  currentEraIndex,
  has
} from '../mechanics.js';

import {
  collapse,
  checkCrisisThresholds,
  triggerCollapseChoices,
  runCrisisAction
} from './crisis.js';

import { promptCadmosAgeName } from './myths.js';
import { tickOlympus } from './olympus.js';

import {
  checkAutomateRules,
  checkAutoScriptRules
} from './automation.js';

import { log } from './utils.js';
import { clamp01, fmt, canPayCost } from '../utils.js';
import { checkAndTriggerChronicleEntries } from '../chronicleEvaluator.js';
import {
  ICARE_INFRA_TARGET,
  PROMETHEE_POP_TARGET,
  PROMETHEE_FATAL_RUPTURE,
  OR_POP_CAP,
  OR_GOLD_TARGET,
  OR_BALANCE_RATIO,
  BABEL_MULT_TARGET,
  BABEL_CAT_LABELS,
  ATLAS_LEGIT_PASSIVE_RATE,
  HEPH_POP_DECAY_START_MIN,
  HEPH_POP_DECAY_RATE,
  HEPH_INFRA_TARGET,
  HEPH_POP_DECLINE_PCT,
  ENEE_TERRITORY_INTERVAL_MS,
  CADMOS_POPULATION_THRESHOLDS,
  CADMOS_INFRASTRUCTURE_THRESHOLDS,
  isMythEffectActive
} from '../../data/myths.js';

export function tick(dt) {
  if (gamePaused || collapseInProgress) return;

  renderCache._frameVitals = null;
  renderCache._framePressure = null;
  renderCache._frameGlobalMult = null;
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

  state.population = Math.max(1, state.population + r.population * dt);
  state.food = Math.max(0, state.food + r.food * dt);
  state.gold = Math.max(0, state.gold + r.gold * dt);
  state.knowledge = Math.max(0, state.knowledge + r.knowledge * dt);
  state.infrastructure = Math.max(0, state.infrastructure + r.infrastructure * dt);

  enforceInfrastructureCapLocal();

  if (isMythEffectActive("mythe_atrides")) {
    const totalProd = Math.max(0, r.food + r.gold + r.knowledge + r.infrastructure);
    const growthPerSec = Math.max(10, totalProd * 0.01) * (state.atridesDebtGrowthMultiplier || 1);
    state.atridesDebt = (state.atridesDebt || 0) + growthPerSec * dt;

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
  const nextInstability = state.instability + instabilityDrift * 0.045 * orderSlow * dt;
  state.instability = instabilityTarget >= 1 && nextInstability >= 0.995
    ? 1
    : clamp01(nextInstability);

  const peaks = state.cyclePeaks;
  if (state.population > peaks.population) peaks.population = state.population;
  if (state.knowledge > peaks.knowledge) peaks.knowledge = state.knowledge;
  if (state.infrastructure > peaks.infrastructure) peaks.infrastructure = state.infrastructure;
  const currentEra = currentEraIndex();
  if (currentEra > peaks.eraIndex) {
    peaks.eraIndex = currentEra;
    if (currentEra > (state.bestEraIndex || 0)) state.bestEraIndex = currentEra;
  }

  if (state.atlasHeritage) {
    state.atlasLegitimite = Math.min(100, (state.atlasLegitimite || 50) + ATLAS_LEGIT_PASSIVE_RATE * dt);
  }

  if (isMythEffectActive("mythe_d_icare") && !state.icareInfraReached) {
    if (state.infrastructure >= ICARE_INFRA_TARGET) {
      state.icareInfraReached = true;
      log(`Icare : l'infrastructure a atteint ${fmt(ICARE_INFRA_TARGET)} ! Le soleil est touche.`);
    }
  }

  if (isMythEffectActive("mythe_de_promethee")) {
    if (!state.prometheePopReached && state.population >= PROMETHEE_POP_TARGET) {
      state.prometheePopReached = true;
      log(`Promethee : la population a atteint ${fmt(PROMETHEE_POP_TARGET)} habitants ! L'epopee est accomplie.`);
    }
    if (!state.prometheePopReached && !state.prometheeFailed && state.instability >= PROMETHEE_FATAL_RUPTURE) {
      state.prometheeFailed = true;
      log(`Promethee echoue : la Rupture a consume la cite avant que la population n'atteigne sa gloire.`);
    }
  }

  if (isMythEffectActive("mythe_age_or")) {
    if (state.population > (state.orPopPeak || 0)) state.orPopPeak = state.population;
    const _orF = state.food;
    const _orG = state.gold;
    state.orUsureImbalance = Math.abs(_orF - _orG) / Math.max(_orF, _orG, 1) > OR_BALANCE_RATIO;
    if (!state.orGoldReached && state.gold >= OR_GOLD_TARGET && (state.orPopPeak || 0) <= OR_POP_CAP) {
      state.orGoldReached = true;
      log(`Age d'Or : le Tresor a atteint ${fmt(OR_GOLD_TARGET)} ! La prosperite est etablie — que le pacte soit scelle.`);
    }
  }

  if (isMythEffectActive("mythe_de_babel") && !state.babelProdReached) {
    if (babelExponentialMult() >= BABEL_MULT_TARGET) {
      state.babelProdReached = true;
      const catLabel = BABEL_CAT_LABELS?.[state.babelCategory] || state.babelCategory;
      log(`Babel : la tour s'eleve ! La puissance de "${catLabel}" atteint x${BABEL_MULT_TARGET} — le pacte est en passe d'etre honore.`);
    }
  }

  if (isMythEffectActive("mythe_du_phenix") && state.phoenixNextForceAt &&
      Date.now() >= state.phoenixNextForceAt && !collapseInProgress && !gamePaused) {
    state.phoenixNextForceAt = null;
    collapse("forced");
    return;
  }

  if (isMythEffectActive("mythe_d_hephaistos")) {
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

  if (isMythEffectActive("mythe_d_enee") && state.eneeTerritoryStartedAt && !state.eneeDegraded) {
    const elapsed = Date.now() - state.eneeTerritoryStartedAt;
    if (elapsed >= ENEE_TERRITORY_INTERVAL_MS) {
      state.eneeDegraded = true;
      log("Le territoire se dégrade — migrer.");
      invalidateRenderCache("all");
    }
  }

  if (isMythEffectActive("mythe_de_cadmos") && !state.cadmosPromptPending) {
    const milestones = [
      ...CADMOS_POPULATION_THRESHOLDS.map((threshold) => ({ type: "population", threshold, value: state.population })),
      ...CADMOS_INFRASTRUCTURE_THRESHOLDS.map((threshold) => ({ type: "infrastructure", threshold, value: state.infrastructure }))
    ];
    const reached = milestones.find((milestone) => {
      const key = `${milestone.type}:${milestone.threshold}`;
      return milestone.value >= milestone.threshold && !state.cadmosTriggeredMilestones?.[key];
    });
    if (reached) {
      const key = `${reached.type}:${reached.threshold}`;
      state.cadmosTriggeredMilestones = { ...(state.cadmosTriggeredMilestones || {}), [key]: true };
      promptCadmosAgeName(reached);
    }
  }

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
    if (inst >= 0.82 && canPayCost(costs.census)) runCrisisAction("census", false);
    else if (inst >= 0.65 && canPayCost(costs.rationing)) runCrisisAction("rationing", false);
  }

  checkAndTriggerChronicleEntries(state, dt);

  checkCrisisThresholds();
  if (gamePaused || collapseInProgress) return;

  if (crisisOpen() && !state.crisisLimitAnnounced && !collapseInProgress) {
    triggerCollapseChoices(false);
  }
}

// Local helper for clean infrastructure encapsulation
import { enforceInfrastructureCap } from '../mechanics.js';
function enforceInfrastructureCapLocal() {
  enforceInfrastructureCap();
}
