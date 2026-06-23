"use strict";

import {
  invalidateRenderCache
} from '../state.js';

import { babelExponentialMult, rates, ruinGain, totalBuildingCount } from '../mechanics.js';

import { promptCadmosAgeName } from './myths.js';

import { log } from './utils.js';
import { fmt } from '../utils.js';
import { D } from '../num.js';

import {
  PROMETHEE_POP_MULT,
  PROMETHEE_FATAL_RUPTURE,
  OR_POP_CAP,
  OR_POP_CAP_GROWTH,
  OR_BALANCE_RATIO,
  BABEL_MULT_TARGET,
  BABEL_CAT_LABELS,
  HEPH_POP_DECAY_START_MIN,
  HEPH_POP_DECAY_RATE,
  HEPH_INFRA_PER_PEAK,
  HEPH_POP_DECLINE_PCT,
  ENEE_TERRITORY_INTERVAL_MS,
  CADMOS_POPULATION_THRESHOLDS,
  CADMOS_INFRASTRUCTURE_THRESHOLDS,
  CHAOS_RAW_RUIN_TARGET,
  SISYPHE_BUILDING_TARGET,
  ATRIDES_GAIN_SECONDS,
  OR_GAIN_SECONDS,
  ICARE_GAIN_SECONDS,
  isMythEffectActive
} from '../../data/myths.js';

// Paliers Cadmos (type + seuil) construits UNE fois puis mis en cache : évite de
// réallouer un tableau de spreads/maps à CHAQUE tick. Init paresseuse (et non un
// const top-level) car CADMOS_*_THRESHOLDS arrivent via un import circulaire et
// ne sont pas encore initialisés au chargement de ce module. L'ordre (population
// puis infrastructure) reproduit le .find() d'origine.
let _cadmosMilestoneSpecs = null;
function cadmosMilestoneSpecs() {
  if (!_cadmosMilestoneSpecs) {
    _cadmosMilestoneSpecs = [
      ...CADMOS_POPULATION_THRESHOLDS.map((threshold) => ({ type: "population", threshold })),
      ...CADMOS_INFRASTRUCTURE_THRESHOLDS.map((threshold) => ({ type: "infrastructure", threshold }))
    ];
  }
  return _cadmosMilestoneSpecs;
}

// ── Objectifs « gain de CE cycle ≥ N secondes de production » ─────────────────
// Les seuils absolus d'origine (50k Or, 5000 infra…) sont triviaux post-GR, et
// les MULTIPLIER ne suffit pas : le stock GARDÉ à l'effondrement (fraction d'un
// stock déjà énorme) franchit n'importe quelle cible. On mesure donc le GAIN
// réalisé PENDANT le cycle (current − départ), et on exige ≥ N secondes de la
// production courante de la ressource → difficulté ≈ constante (N s d'effort) à
// toutes les échelles, insensible au reliquat. Cf. analyse-mythe-hephaistos.md.

// Chaque handler reçoit (state, dt) et reprend exactement le bloc correspondant
// de tick(). Le prédicat isMythEffectActive(id) est testé en amont par runMythTicks.
// Un handler peut renvoyer "abort" pour demander l'interruption du tick parent.
export const MYTH_TICK_HANDLERS = {
  mythe_d_icare: (state) => {
    if (!state.icareInfraReached) {
      const gained = D(state.infrastructure).sub(state.mythStartInfra || 0);
      const need = D(rates().infrastructure).max(0).mul(ICARE_GAIN_SECONDS);
      if (gained.gte(need) && gained.gt(0)) {
        state.icareInfraReached = true;
        log(`Icare : +${fmt(gained)} d'infrastructure batie ce cycle (${ICARE_GAIN_SECONDS}s de production) ! Le soleil est touche.`);
      }
    }
  },

  mythe_du_chaos: (state) => {
    // Bâtir sans béquilles : les bonus de méta étant coupés, ruinGain(projeté)
    // renvoie la valeur BRUTE → seuil plat = difficulté constante.
    if (!state.chaosReached && D(ruinGain(true)).gte(CHAOS_RAW_RUIN_TARGET)) {
      state.chaosReached = true;
      log(`Chaos : ${CHAOS_RAW_RUIN_TARGET} Ruines brutes en vue, sans le moindre bonus. Le monde se construit du néant.`);
    }
  },

  mythe_de_sisyphe: (state) => {
    // Le rocher : pousser jusqu'à SISYPHE_BUILDING_TARGET bâtiments malgré
    // l'inflation cumulative des coûts (+3% par achat).
    if (!state.sisypheReached && totalBuildingCount() >= SISYPHE_BUILDING_TARGET) {
      state.sisypheReached = true;
      log(`Sisyphe : ${SISYPHE_BUILDING_TARGET} bâtiments érigés malgré la malédiction des coûts. Le rocher atteint le sommet.`);
    }
  },

  mythe_atrides: (state) => {
    if (!state.atridesReached) {
      const netGained = D(state.gold).sub(state.atridesDebt || 0).sub(state.mythStartGold || 0);
      const need = D(rates().gold).max(0).mul(ATRIDES_GAIN_SECONDS);
      if (netGained.gte(need) && netGained.gt(0)) {
        state.atridesReached = true;
        log(`Atrides : +${fmt(netGained)} de Tresor net gagne ce cycle malgre la dette maudite. La malediction est conjuree.`);
      }
    }
  },

  mythe_de_promethee: (state) => {
    // La course du feu : croître ×PROMETHEE_POP_MULT depuis le départ AVANT la Rupture fatale.
    const target = D(state.mythStartPop || 1).mul(PROMETHEE_POP_MULT);
    if (!state.prometheePopReached && D(state.population).gte(target)) {
      state.prometheePopReached = true;
      log(`Promethee : la population a ete multipliee par ${PROMETHEE_POP_MULT} (${fmt(target)} hab) ! L'epopee est accomplie.`);
    }
    if (!state.prometheePopReached && !state.prometheeFailed && state.instability >= PROMETHEE_FATAL_RUPTURE) {
      state.prometheeFailed = true;
      log(`Promethee echoue : la Rupture a consume la cite avant que la population n'atteigne sa gloire.`);
    }
  },

  mythe_age_or: (state) => {
    // Plafond DUR de population : la production post-GR est si forte qu'un seul
    // tick fait exploser la pop (10^21 mesuré) avant que l'arrêt de production ne
    // réagisse. On CLAMPE donc la pop au plafond (comme le cap d'infrastructure),
    // garantissant que la cité dorée ne s'étale jamais. Relatif au départ du cycle.
    const orPopCap = D(state.orStartPop || 0).mul(OR_POP_CAP_GROWTH).max(OR_POP_CAP);
    if (D(state.population).gt(orPopCap)) state.population = orPopCap;
    if (D(state.population).gt(state.orPopPeak || 0)) state.orPopPeak = state.population;
    const _orF = D(state.food);
    const _orG = D(state.gold);
    state.orUsureImbalance = _orF.sub(_orG).abs().div(_orF.max(_orG).max(1)).toNumber() > OR_BALANCE_RATIO;
    const orGained = D(state.gold).sub(state.mythStartGold || 0);
    const orNeed = D(rates().gold).max(0).mul(OR_GAIN_SECONDS);
    if (!state.orGoldReached && orGained.gte(orNeed) && orGained.gt(0) && D(state.orPopPeak || 0).lte(orPopCap)) {
      state.orGoldReached = true;
      log(`Age d'Or : +${fmt(orGained)} de Tresor accumule ce cycle sans laisser la cite s'etaler ! La prosperite est etablie — que le pacte soit scelle.`);
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

  mythe_d_hephaistos: (state, dt) => {
    if (D(state.population).gt(state.hephPopPeak || 0)) state.hephPopPeak = state.population;
    const hephElapsed = (Date.now() - (state.cycleStartedAt || Date.now())) / 60_000;
    if (hephElapsed > HEPH_POP_DECAY_START_MIN) {
      const decayRate = D(state.population).mul(HEPH_POP_DECAY_RATE / 60); // par seconde
      state.population = D(state.population).sub(decayRate.mul(dt)).max(1);
    }
    if (!state.hephGoalReached) {
      const hephDecline = 1 - D(state.population).div(D(state.hephPopPeak || 1).max(1)).toNumber();
      // Objectif « machines par habitant » : l'infrastructure doit atteindre un
      // RATIO du pic de population (HEPH_INFRA_PER_PEAK), pendant que la pop a
      // suffisamment décliné. Le ratio garde du sens à toutes les échelles.
      const infraTarget = D(state.hephPopPeak || 1).max(1).mul(HEPH_INFRA_PER_PEAK);
      if (D(state.infrastructure).gte(infraTarget) && hephDecline >= HEPH_POP_DECLINE_PCT) {
        state.hephGoalReached = true;
        log(`Hephaistos : les machines ont supplante les hommes. Infrastructure ${fmt(infraTarget)} atteinte (${HEPH_INFRA_PER_PEAK}x le pic de pop), population en declin de ${Math.round(hephDecline * 100)}% depuis son pic.`);
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
    if (state.cadmosPromptPending) return;
    for (const spec of cadmosMilestoneSpecs()) {
      const value = spec.type === "population" ? state.population : state.infrastructure;
      const key = `${spec.type}:${spec.threshold}`;
      if (D(value).gte(spec.threshold) && !state.cadmosTriggeredMilestones?.[key]) {
        state.cadmosTriggeredMilestones = { ...(state.cadmosTriggeredMilestones || {}), [key]: true };
        promptCadmosAgeName({ type: spec.type, threshold: spec.threshold, value });
        break;
      }
    }
  }
};

// Ordre d'exécution identique aux anciens blocs en ligne dans tick().
const MYTH_TICK_ORDER = [
  "mythe_du_chaos",
  "mythe_d_icare",
  "mythe_de_sisyphe",
  "mythe_atrides",
  "mythe_de_promethee",
  "mythe_age_or",
  "mythe_de_babel",
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
