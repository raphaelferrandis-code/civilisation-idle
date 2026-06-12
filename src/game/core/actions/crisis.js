"use strict";

import {
  state,
  gamePaused,
  collapseInProgress,
  defaultState,
  invalidateRenderCache,
  openView,
  render,
  setGamePaused,
  setCollapseInProgress,
  save,
  renderCache,
  resetTemporaryRunState
} from '../state.js';

import {
  addProductionPenalty,
  cityVitals,
  ruinGain,
  terminalCrisisReady,
  terminalCrisisCost,
  TERMINAL_PREP_TIERS,
  ruinEffectSum,
  enforceInfrastructureCap,
  totalBuildingCount,
  crisisOpen,
  crisisCosts,
  has,
  hasDoctrine,
  currentEraIndex
} from '../mechanics.js';

import { runCollapseSequence, openChoiceDialog } from '../events.js';
import { pushOutcomeFloat } from '../outcomeFloat.js';
import { upgrades } from '../../data/upgrades.js';
import { eras, CRISIS_EVENTS, CRISIS_POOL } from '../../data/world.js';
import { epitaphLegacyById } from '../../data/epitaphs.js';
import { captureCurrentVestige, resetCameraCenter } from '../../map/cityMapBridge.js';
import { newCitySeed } from '../../map/procedural/seedManager.js';
import { clamp01, canPayCost, payCost, fmt } from '../utils.js';
import { D } from '../num.js';
import { COLLAPSE_PREP_MAX, CRISIS_ACTION_DECAY } from '../balance.js';
import { HEPH_POP_CRISIS_THRESHOLD, PHENIX_CYCLE_COUNT, PHENIX_FORCE_INTERVAL, ENEE_HERITAGE_MAX_COLLAPSES, isMythEffectActive } from '../../data/myths.js';
import { checkMythOnCollapse } from './myths.js';
import {
  olympusRuinBonus,
  registerOlympusCollapse,
  registerOlympusCrisisIgnored,
  registerOlympusCrisisResolved
} from './olympus.js';
import { log, chronicle, cycleYear, resetCyclePeaks } from './utils.js';

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

export function checkCrisisThresholds() {
  if (gamePaused || collapseInProgress || crisisOpen()) return;
  const slot = CRISIS_EVENTS.find((candidate) => (
    state.instability >= candidate.threshold &&
    !state.crisisThresholds[candidate.id]
  ));
  if (!slot) return;
  state.crisisThresholds[slot.id] = true;
  const event = pickCrisisEvent(slot.threshold);
  state.recentCrisisIds = [...(state.recentCrisisIds || []).slice(-7), event.id];
  openCrisisEvent(event);
}

export async function openCrisisEvent(event) {
  setGamePaused(true);
  render();
  if (isMythEffectActive("mythe_d_hephaistos") && D(state.population).lt(HEPH_POP_CRISIS_THRESHOLD)) {
    chronicle(`La colère d'Héphaïstos s'abat sur notre population affaiblie (${fmt(D(state.population).floor())} hab). Face à son courroux, nos appels restent vains et le déclin s'impose à nous.`);
    addProductionPenalty("global", 0.06);
    state.instability = clamp01(state.instability + 0.05);
    setGamePaused(false);
    render();
    return;
  }

  const choice = await openChoiceDialog({
    ...event,
    footnote: "Sauf mention contraire, les effets sur la production durent jusqu'à la fin du cycle en cours."
  });

  const instabilityBefore = state.instability || 0;
  const outcome = choice.apply();
  if (outcome && outcome.label) pushOutcomeFloat(outcome);
  if ((state.instability || 0) < instabilityBefore) registerOlympusCrisisResolved();
  else registerOlympusCrisisIgnored();
  state.instability = clamp01(state.instability);
  setGamePaused(false);
  render();
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
    // Nouvelle crise : chaque préparation terminale redevient utilisable une fois.
    if (state.terminalPreparations) state.terminalPreparations.used = {};
    const source = state.timeWear >= 1 ? "l'usure du temps" : "la rupture structurelle";
    chronicle(`La fin d'une ère approche : ${source} a vaincu nos dernières défenses. Le destin de notre cité se joue désormais dans la tourmente des crises.`);
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
  if (state.crisisLimitAnnounced) {
    if (state.instability >= 1) state.instability = 1;
    if ((state.timeWear || 0) >= 1) state.timeWear = 1;
    return;
  }
  if (state.instability >= 1) state.instability = Math.min(state.instability, targetInstability);
  if ((state.timeWear || 0) >= 1) state.timeWear = Math.min(state.timeWear, targetWear);
  if (!crisisOpen()) resumeAfterCrisisOutcome();
}

const TERMINAL_PREP_CHRONICLES = {
  exodus: [
    "Quelques familles quittent la cité par les portes de l'aube ; les champs se vident un peu, mais la colère retombe.",
    "Une longue procession franchit les portes sacrées : l'exode est en marche, portant l'espoir d'une nouvelle fondation.",
    "La moitié de la cité prend la route. Les greniers se taisent, mais ceux qui restent respirent enfin."
  ],
  prepareArchives: [
    "Nos scribes copient les registres essentiels ; quelques ateliers ferment pour fournir l'encre et les tablettes.",
    "Alors que les fondations tremblent, nos scribes mettent les chroniques à l'abri ; la mémoire de notre peuple survivra aux ruines.",
    "Tout le savoir de la cité est gravé, scellé, enterré. L'économie s'épuise à cette tâche, mais rien ne sera oublié."
  ],
  holdOrder: [
    "La garde double les patrouilles ; l'ordre coûte cher, mais les rues se calment.",
    "La garde maintient un ordre de fer à grands frais. Nos murs tiennent encore, mais le souffle de l'effondrement fait vaciller nos derniers feux.",
    "La loi martiale est proclamée. La cité entière vit au pas de la garde : la rupture recule, étouffée sous le poids du contrôle."
  ]
};

export function runTerminalCrisisAction(type, tier = 0) {
  if (!crisisOpen() || collapseInProgress) return;
  if (!terminalCrisisReady(type, tier)) return;
  const tierDef = TERMINAL_PREP_TIERS[type]?.[tier];
  if (!tierDef) return;
  payCost(terminalCrisisCost(type, tier));
  state.crisisExtensions = (state.crisisExtensions || 0) + 1;
  registerOlympusCrisisResolved();

  const tp = state.terminalPreparations || (state.terminalPreparations = {
    foodMalus: 0, goldMalus: 0, knowledgeMalus: 0, infraBonus: 0, ruptureSlow: 0, used: {}
  });
  if (!tp.used) tp.used = {};
  tp.used[type] = true;
  const addMalus = (key) => { tp[key] = Math.min(0.85, (tp[key] || 0) + tierDef.malus); };
  if (type === "exodus") {
    addMalus("foodMalus");
  } else if (type === "prepareArchives") {
    addMalus("knowledgeMalus");
    addMalus("goldMalus");
    tp.infraBonus = Math.min(1, (tp.infraBonus || 0) + (tierDef.infraBonus || 0));
  } else if (type === "holdOrder") {
    addMalus("foodMalus");
    addMalus("goldMalus");
    addMalus("knowledgeMalus");
    tp.ruptureSlow = Math.min(0.8, (tp.ruptureSlow || 0) + (tierDef.ruptureSlow || 0));
  }
  state.collapsePreparation = Math.min(COLLAPSE_PREP_MAX, (state.collapsePreparation || 0) + tierDef.prep);

  // Ramène la jauge qui a ouvert la crise au palier choisi, puis reprend la partie.
  state.crisisLimitAnnounced = false;
  if (state.instability >= 1) state.instability = Math.min(state.instability, tierDef.target);
  if ((state.timeWear || 0) >= 1) state.timeWear = Math.min(state.timeWear, tierDef.target);
  resumeAfterCrisisOutcome();

  chronicle(TERMINAL_PREP_CHRONICLES[type]?.[tier] || "La cité s'organise face à la fin qui approche.");
  save();
  render();
}

export function completeCollapse(gain, fallenDynasty, epitaph, reason) {
  if (state.crisisLimitAnnounced && (state.crisisExtensions || 0) <= 0) {
    registerOlympusCrisisIgnored();
  }
  registerOlympusCollapse(reason);
  gain = olympusRuinBonus(gain, reason);

  const wasChaos   = isMythEffectActive("mythe_du_chaos");
  const wasAtrides = isMythEffectActive("mythe_atrides");
  const applyAtridesPenalty = wasAtrides && state.atridesDrainDisabled;
  const wasPhoenix = state.activeMythId === "mythe_du_phenix";
  const runCadmosChronicle = Array.isArray(state.cadmosChronicle)
    ? state.cadmosChronicle.map((entry) => ({ ...entry }))
    : [];

  if (wasPhoenix) {
    state.phoenixTotalRuins = D(state.phoenixTotalRuins).add(gain);
    state.phoenixCycleCount = (state.phoenixCycleCount || 0) + 1;
  }
  const phoenixDone = wasPhoenix && state.phoenixCycleCount >= PHENIX_CYCLE_COUNT;

  if (!wasPhoenix || phoenixDone) {
    checkMythOnCollapse();
    state.activeMythId = null;
    state.ragnarokEffectsApplied = false;
  } else {
    log(`Phoenix : cycle ${state.phoenixCycleCount}/${PHENIX_CYCLE_COUNT} acheve. Ruines cumulees : ${fmt(state.phoenixTotalRuins)}.`);
  }

  if (state.eneeHeritage) {
    state.eneeCollapseCount = Math.min(ENEE_HERITAGE_MAX_COLLAPSES, (state.eneeCollapseCount || 0) + 1);
  }
  const doctrinePopBonus = hasDoctrine("acier") ? D(state.cyclePeaks?.population || 0).mul(0.08).floor() : D(0);
  const keptPop = (has("granaries") ? D(state.population).mul(0.03) : D(10))
    .max(10 + ruinEffectSum("startPopulation"))
    .add(doctrinePopBonus);
  const foodKeepRate = (has("ancestor_granaries") ? 0.16 : has("granaries") ? 0.08 : 0) + ruinEffectSum("foodKeep");
  const goldKeepRate = 0.04 + (has("ash_markets") ? 0.05 : 0) + (has("ash_contracts") ? 0.07 : 0) + ruinEffectSum("goldKeep");
  const knowledgeKeepRate = (has("memory_scribes") ? 0.04 : 0) + ruinEffectSum("knowledgeKeep") + (hasDoctrine("parchemin") ? 0.12 : 0);
  const infraKeepRate = ruinEffectSum("infraKeep") + (hasDoctrine("sillon") ? 0.06 : 0);
  const keptFood = foodKeepRate > 0 ? D(state.food).mul(foodKeepRate) : D(35);
  const keptGold = D(state.gold).mul(goldKeepRate);
  const keptKnowledge = D(state.knowledge).mul(knowledgeKeepRate);
  const keptInfra = D(state.infrastructure).mul(infraKeepRate);
  const era = eras[currentEraIndex()].name;
  const age = cycleYear();
  
  state.lastCollapsedBuildings = { ...state.buildings };
  
  captureCurrentVestige();
  
  state.ruins = D(state.ruins).add(gain);
  if (wasChaos && state.chaosRuinsDouble) {
    state.chaosRuinsBonus = D(state.chaosRuinsBonus).add(gain);
    chronicle(`L'ombre du Chaos transfigure notre héritage : +${fmt(gain)} ruines immatérielles s'inscrivent dans notre histoire, magnifiant à jamais la mémoire de nos vestiges.`);
  }
  state.cycles += 1;
  // Nouvelle civilisation : nouveau plan procédural (seed + rivière + enceinte régénérés).
  state.mapSeed = newCitySeed();
  state.riverWP = null;
  state.wallRadius = null;
  state.population = keptPop.max(10);
  state.food = keptFood.max(35 + ruinEffectSum("startFood"));
  state.gold = keptGold.max(ruinEffectSum("startGold"));

  const memoireSavoirBonus = has("codex_mythique") ? 250 * (state.bestEraIndex || 0) : 0;
  state.knowledge = keptKnowledge.max(ruinEffectSum("startKnowledge")).add(memoireSavoirBonus);

  state.infrastructure = keptInfra.add(has("fallen_roads") ? D(state.ruins).sqrt().mul(0.25).max(1) : 0);
  
  const chosenEpitaphLegacy = state.nextEpitaphLegacy || null;
  const chosenEpitaphDefinition = chosenEpitaphLegacy ? epitaphLegacyById(chosenEpitaphLegacy.id) : null;
  const activeEpitaphLegacyVal = chosenEpitaphDefinition
    ? { ...chosenEpitaphLegacy, startedAt: Date.now() }
    : null;

  const startingInstability = chosenEpitaphDefinition?.effects?.startingInstability || 0;

  state.buildings = { ...defaultState().buildings };

  resetTemporaryRunState(state);

  state.activeEpitaphLegacy = activeEpitaphLegacyVal;
  if (startingInstability > 0) {
    state.instability = Math.max(0, Math.min(1, startingInstability));
  }

  if (runCadmosChronicle.length) {
    state.cadmosLastRunChronicle = runCadmosChronicle;
    chronicle(`La stèle de Cadmos garde gravée à jamais la mémoire de notre passage : ${runCadmosChronicle.map((entry) => entry.name).join(", ")}.`);
  }

  state.atridesNextRunPenaltyActive = applyAtridesPenalty;
  
  invalidateRenderCache("all");
  enforceInfrastructureCap();
  resetCyclePeaks();
  state.cycleStartedAt = Date.now();
  const source = reason === "manual" ? "choisit l'effondrement" : "atteint sa limite";
  log(`Cycle ${state.cycles - 1}, an ${age}: ${fallenDynasty}, ${era}, ${source}. Epitaphe: ${epitaph} Les survivants nomment ${fmt(gain)} ruines et recommencent.`);
  
  if (has("conservateurs_ruines")) {
    const cheapest = upgrades
      .filter((u) => u.group === "ruins" && !has(u.id) && Number.isFinite(u.cost?.ruins) && D(state.ruins).gte(u.cost.ruins))
      .sort((a, b) => (a.cost?.ruins || 0) - (b.cost?.ruins || 0))[0];
    if (cheapest) {
      state.ruins = D(state.ruins).sub(cheapest.cost?.ruins || 0);
      state.upgrades[cheapest.id] = true;
      renderCache.cachedRuinEffects = null;
      renderCache.cachedRuinEffectsSignature = "";
      chronicle(`Nos archivistes, fouillant les vestiges des anciens âges, ont exhumé un secret perdu : ${cheapest.name}.`);
    }
  }
  if (memoireSavoirBonus > 0) {
    chronicle(`La mémoire des cycles anciens imprègne nos esprits : nous recueillons +${fmt(memoireSavoirBonus)} savoirs tirés des écrits oubliés.`);
  }

  if (wasPhoenix && !phoenixDone) {
    state.phoenixNextForceAt = Date.now() + PHENIX_FORCE_INTERVAL;
  } else {
    state.phoenixNextForceAt = null;
  }

  resetCameraCenter();
}

export function collapse(reason) {
  if (collapseInProgress) return;
  if (reason !== "forced" && reason !== "auto_script" && !crisisOpen()) return;
  setCollapseInProgress(true);
  setGamePaused(true);
  const gain = ruinGain();
  const reasonLabel = reason === "manual" ? "manuel"
    : reason === "forced"      ? "force (Phoenix)"
    : reason === "auto_script" ? "automatique (Script)"
    : "automatique";
  chronicle(`Le crépuscule s'abat sur la cité (effondrement ${reasonLabel}). Nos palais s'écroulent, laissant derrière eux un linceul de ${fmt(gain)} ruines.`);
  
  runCollapseSequence(gain, reason);
}

export function runCrisisAction(id, options = {}) {
  const opts = (typeof options === "object" && options !== null) ? options : { render: Boolean(options) };
  const { render: doRender = true, force = false } = opts;
  if (gamePaused || collapseInProgress) return;
  // Pendant la crise terminale, seules les actions auto de l'intendant (force) passent.
  if (state.crisisLimitAnnounced && !force) return;
  const costs = crisisCosts();
  const cost = costs[id];
  if (!cost || !canPayCost(cost)) return;
  payCost(cost);
  const effects = {
    rationing: { key: "rationing", drop: 0.06, note: "Les greniers ont été scellés et rationnés : nous apprenons à vivre de peu pour repousser la faim." },
    festivals: { key: "festivals", drop: 0.08, note: "De grands jeux civiques sont proclamés sur les places publiques ; le peuple oublie un instant sa colère sous les bannières de la dynastie." },
    census: { key: "census", drop: 0.12, note: "Nos scribes achèvent le grand recensement, gravant chaque nom sur l'argile pour redonner un visage à la cité." },
    reforms: { key: "reforms", drop: 0.18, note: "De profondes réformes institutionnelles sont votées, consolidant les assises de la cité face aux menaces imminentes." },
    archiveCrisis: { key: "census", drop: 0.09, note: "L'étude minutieuse des catastrophes passées est consignée par écrit, afin que les générations futures sachent comment faire face à l'effroi." },
    ancestorCrisis: { key: "festivals", drop: 0.14, note: "Les autels de nos ancêtres sont fleuris ; la peur s'efface devant la ferveur et la continuité de notre lignée." }
  };
  const effect = effects[id];
  if (!effect) return;
  if (!isMythEffectActive("mythe_d_atlas")) {
    // Rendements décroissants : chaque usage du même levier calme un peu moins
    // la rue (0.9^n). Tenir la jauge devient un délai, pas une immortalité.
    const usedCount = state.crisisActions[effect.key] || 0;
    const effectiveDrop = effect.drop * Math.pow(CRISIS_ACTION_DECAY, usedCount);
    state.instability = Math.max(0, state.instability - effectiveDrop);
  } else {
    state.atlasCrisisCount = (state.atlasCrisisCount || 0) + 1;
  }
  state.crisisActions[effect.key] += 1;
  if (id === "reforms") state.infrastructure = D(state.infrastructure).add(Math.max(1, totalBuildingCount() * 0.08));
  if (id === "archiveCrisis") state.knowledge = D(state.knowledge).add(Math.max(4, state.cycles * 2));
  if (id === "ancestorCrisis") state.legitimacy += 0.35;
  registerOlympusCrisisResolved();
  if (state.crisisLimitAnnounced) state.crisisOpenedAt = Date.now();
  chronicle(effect.note);
  if (doRender) render();
}
