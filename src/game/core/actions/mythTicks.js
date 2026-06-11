"use strict";

import {
  collapseInProgress,
  gamePaused,
  invalidateRenderCache
} from '../state.js';

import { babelExponentialMult } from '../mechanics.js';

import { collapse } from './crisis.js';
import { promptCadmosAgeName } from './myths.js';

import { log } from './utils.js';
import { fmt } from '../utils.js';

import {
  ICARE_INFRA_TARGET,
  PROMETHEE_POP_TARGET,
  PROMETHEE_FATAL_RUPTURE,
  OR_POP_CAP,
  OR_GOLD_TARGET,
  OR_BALANCE_RATIO,
  BABEL_MULT_TARGET,
  BABEL_CAT_LABELS,
  HEPH_POP_DECAY_START_MIN,
  HEPH_POP_DECAY_RATE,
  HEPH_INFRA_TARGET,
  HEPH_POP_DECLINE_PCT,
  ENEE_TERRITORY_INTERVAL_MS,
  CADMOS_POPULATION_THRESHOLDS,
  CADMOS_INFRASTRUCTURE_THRESHOLDS,
  isMythEffectActive
} from '../../data/myths.js';

// Chaque handler reçoit (state, dt) et reprend exactement le bloc correspondant
// de tick(). Le prédicat isMythEffectActive(id) est testé en amont par runMythTicks.
// Un handler peut renvoyer "abort" pour demander l'interruption du tick parent.
export const MYTH_TICK_HANDLERS = {
  mythe_d_icare: (state) => {
    if (!state.icareInfraReached) {
      if (state.infrastructure >= ICARE_INFRA_TARGET) {
        state.icareInfraReached = true;
        log(`Icare : l'infrastructure a atteint ${fmt(ICARE_INFRA_TARGET)} ! Le soleil est touche.`);
      }
    }
  },

  mythe_de_promethee: (state) => {
    if (!state.prometheePopReached && state.population >= PROMETHEE_POP_TARGET) {
      state.prometheePopReached = true;
      log(`Promethee : la population a atteint ${fmt(PROMETHEE_POP_TARGET)} habitants ! L'epopee est accomplie.`);
    }
    if (!state.prometheePopReached && !state.prometheeFailed && state.instability >= PROMETHEE_FATAL_RUPTURE) {
      state.prometheeFailed = true;
      log(`Promethee echoue : la Rupture a consume la cite avant que la population n'atteigne sa gloire.`);
    }
  },

  mythe_age_or: (state) => {
    if (state.population > (state.orPopPeak || 0)) state.orPopPeak = state.population;
    const _orF = state.food;
    const _orG = state.gold;
    state.orUsureImbalance = Math.abs(_orF - _orG) / Math.max(_orF, _orG, 1) > OR_BALANCE_RATIO;
    if (!state.orGoldReached && state.gold >= OR_GOLD_TARGET && (state.orPopPeak || 0) <= OR_POP_CAP) {
      state.orGoldReached = true;
      log(`Age d'Or : le Tresor a atteint ${fmt(OR_GOLD_TARGET)} ! La prosperite est etablie — que le pacte soit scelle.`);
    }
  },

  mythe_de_babel: (state) => {
    if (!state.babelProdReached) {
      if (babelExponentialMult() >= BABEL_MULT_TARGET) {
        state.babelProdReached = true;
        const catLabel = BABEL_CAT_LABELS?.[state.babelCategory] || state.babelCategory;
        log(`Babel : la tour s'eleve ! La puissance de "${catLabel}" atteint x${BABEL_MULT_TARGET} — le pacte est en passe d'etre honore.`);
      }
    }
  },

  mythe_du_phenix: (state) => {
    if (state.phoenixNextForceAt &&
        Date.now() >= state.phoenixNextForceAt && !collapseInProgress && !gamePaused) {
      state.phoenixNextForceAt = null;
      collapse("forced");
      return "abort";
    }
  },

  mythe_d_hephaistos: (state, dt) => {
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
  },

  mythe_d_enee: (state) => {
    if (state.eneeTerritoryStartedAt && !state.eneeDegraded) {
      const elapsed = Date.now() - state.eneeTerritoryStartedAt;
      if (elapsed >= ENEE_TERRITORY_INTERVAL_MS) {
        state.eneeDegraded = true;
        log("Le territoire se dégrade — migrer.");
        invalidateRenderCache("all");
      }
    }
  },

  mythe_de_cadmos: (state) => {
    if (!state.cadmosPromptPending) {
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
  }
};

// Ordre d'exécution identique aux anciens blocs en ligne dans tick().
const MYTH_TICK_ORDER = [
  "mythe_d_icare",
  "mythe_de_promethee",
  "mythe_age_or",
  "mythe_de_babel",
  "mythe_du_phenix",
  "mythe_d_hephaistos",
  "mythe_d_enee",
  "mythe_de_cadmos"
];

export function runMythTicks(state, dt) {
  for (const id of MYTH_TICK_ORDER) {
    if (!isMythEffectActive(id)) continue;
    const handler = MYTH_TICK_HANDLERS[id];
    if (!handler) continue;
    if (handler(state, dt) === "abort") return "abort";
  }
}
