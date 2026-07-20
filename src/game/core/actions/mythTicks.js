"use strict";

import {
  invalidateRenderCache,
  buildingById
} from '../state.js';
import { tr } from '../i18n.js';

import { rates, ruinGain } from '../mechanics.js';

import { promptCadmosAgeName } from './myths.js';

import { log } from './utils.js';
import { fmt } from '../utils.js';
import { D } from '../num.js';

import {
  PROMETHEE_POP_TARGET,
  PROMETHEE_FATAL_RUPTURE,
  OR_BALANCE_RATIO,
  ATLAS_FARDEAU_RISE,
  HEPH_POP_DECAY_START_MIN,
  HEPH_POP_DECAY_RATE,
  HEPH_INFRA_PER_PEAK,
  HEPH_POP_DECLINE_PCT,
  ENEE_TERRITORY_INTERVAL_MS,
  CADMOS_POPULATION_THRESHOLDS,
  CADMOS_INFRASTRUCTURE_THRESHOLDS,
  CADMOS_AGE_NAME_TARGET,
  CHAOS_RAW_RUIN_TARGET,
  ATRIDES_GAIN_SECONDS,
  ragnarokAge,
  RAGNAROK_WOLF_AT_MS,
  RAGNAROK_WOLF_EAT_INTERVAL_MS,
  RAGNAROK_WOLF_EAT_PCT,
  RAGNAROK_FIRE_AT_MS,
  RAGNAROK_FIRE_RUPTURE_PER_SEC,
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
  mythe_du_chaos: (state) => {
    // Bâtir sans béquilles : les bonus de méta étant coupés, ruinGain(projeté)
    // renvoie la valeur BRUTE → seuil plat = difficulté constante.
    if (!state.chaosReached && D(ruinGain(true)).gte(CHAOS_RAW_RUIN_TARGET)) {
      state.chaosReached = true;
      log(`Chaos : ${CHAOS_RAW_RUIN_TARGET} Ruines brutes en vue, sans le moindre bonus. Le monde se construit du néant.`);
    }
  },

  // Sisyphe (« la Montée ») n'a plus de handler de tick : le rocher ne bouge que
  // par les verbes — POUSSER (actions/myths.js) et bâtir qui le lâche (building.js).

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
    // La course du feu : atteindre la cible ABSOLUE avant la Rupture fatale.
    if (!state.prometheePopReached && D(state.population).gte(PROMETHEE_POP_TARGET)) {
      state.prometheePopReached = true;
      log(`Promethee : ${PROMETHEE_POP_TARGET} habitants sous le feu ! L'epopee est accomplie.`);
    }
    if (!state.prometheePopReached && !state.prometheeFailed && state.instability >= PROMETHEE_FATAL_RUPTURE) {
      state.prometheeFailed = true;
      log(`Promethee echoue : la Rupture a consume la cite avant que la population n'atteigne sa gloire.`);
    }
  },

  mythe_age_or: (state) => {
    // « Les Caravanes » : le tick ne fait plus que tenir la jauge de déséquilibre
    // (Usure ×3 via prestige.js). Le plafond de pop et l'objectif d'Or ont disparu
    // — la réussite (8 marchés) se joue dans le mini-jeu de négociation, et la
    // validation vivante lit orDealsClosed via onCollapse.
    const _orF = D(state.food);
    const _orG = D(state.gold);
    state.orUsureImbalance = _orF.sub(_orG).abs().div(_orF.max(_orG).max(1)).toNumber() > OR_BALANCE_RATIO;
  },

  mythe_d_atlas: (state, dt) => {
    // « Le poids du ciel » : le Fardeau monte sans arrêt. ÉPAULER le fait
    // redescendre (actions/myths.js) ; ici on ne fait que le laisser peser. À 100 %,
    // le ciel écrase la cité — échec du Mythe (comme la Rupture fatale de Prométhée).
    if (state.atlasCrushed) return;
    state.atlasFardeau = Math.min(100, (state.atlasFardeau || 0) + ATLAS_FARDEAU_RISE * dt);
    if (state.atlasFardeau >= 100) {
      state.atlasCrushed = true;
      log("Atlas : le ciel a eu raison de nos épaules. La cité ploie et se brise.");
    }
  },

  // Babel n'a plus de handler de tick : l'objectif est le COMPTE de bâtiments de
  // la catégorie (babelTowerCount, data/myths.js) — onCollapse le lit, et
  // checkMythLiveCompletion (appelé au tick) sacre en direct au 70e.

  // « L'Hiver Fimbul » : le Loup et le Feu. (L'Hiver vit dans globalMultipliers
  // — c'est un facteur de production — et la Fin forcée dans tick.js, à côté du
  // bûcher programmé du Phénix.)
  mythe_du_ragnarok: (state, dt) => {
    const age = ragnarokAge();
    // Le LOUP (dès 14 min) : une bouchée toutes les 10 s — 2 % du parc (min 1),
    // prise au bâtiment le plus NOMBREUX (lisible, et mord à toute échelle).
    // Compteur dérivé de l'âge du cycle : survit au reload sans horloge dédiée.
    if (age >= RAGNAROK_WOLF_AT_MS) {
      const dues = Math.floor((age - RAGNAROK_WOLF_AT_MS) / RAGNAROK_WOLF_EAT_INTERVAL_MS) + 1;
      let devore = false;
      while ((state.ragnarokWolfBites || 0) < dues) {
        state.ragnarokWolfBites = (state.ragnarokWolfBites || 0) + 1;
        const parc = Object.entries(state.buildings).filter(([, n]) => (n || 0) > 0);
        if (!parc.length) break;
        const total = parc.reduce((somme, [, n]) => somme + n, 0);
        const bouchee = Math.max(1, Math.floor(total * RAGNAROK_WOLF_EAT_PCT));
        const [grosId, grosN] = parc.sort((a, b) => b[1] - a[1])[0];
        const pris = Math.min(grosN, bouchee);
        state.buildings[grosId] = grosN - pris;
        devore = true;
        const nom = buildingById[grosId] ? tr(buildingById[grosId].name) : grosId;
        log(`Le Loup dévore ${pris} × ${nom}. Le monde rétrécit.`);
      }
      if (devore) invalidateRenderCache("buildings");
    }
    // Le FEU DE SURT (dès 20 min) : la Rupture monte, brute — un apport ADDITIF
    // que les leviers de régulation ne peuvent qu'éponger, pas éteindre.
    if (age >= RAGNAROK_FIRE_AT_MS) {
      state.instability = Math.min(1, (state.instability || 0) + RAGNAROK_FIRE_RUPTURE_PER_SEC * dt);
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
        log("Le territoire se dégrade : migrer.");
        invalidateRenderCache("all");
      }
    }
  },

  mythe_de_cadmos: (state) => {
    if (state.cadmosPromptPending) return;
    // Les seuils sont ABSOLUS : une cité qui a farmé les franchit tous d'emblée, et
    // c'est voulu (cf. myths.js). Mais on ne réclame plus un nom une fois l'objectif
    // atteint — sinon franchir dix paliers d'un coup imposait dix modales bloquantes
    // à la file, dont sept APRÈS que le Mythe soit déjà gagné. Le joueur nomme ses
    // trois Âges en trois clics et on le laisse tranquille.
    if ((state.cadmosChronicle || []).length >= CADMOS_AGE_NAME_TARGET) return;
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
  "mythe_atrides",
  "mythe_de_promethee",
  "mythe_age_or",
  "mythe_d_atlas",
  "mythe_du_ragnarok",
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
