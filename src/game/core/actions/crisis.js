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
  cityVitals,
  ruinGain,
  terminalCrisisReady,
  terminalCrisisCost,
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
import { upgrades } from '../../data/upgrades.js';
import { eras, CRISIS_EVENTS, CRISIS_POOL } from '../../data/world.js';
import { epitaphLegacyById } from '../../data/epitaphs.js';
import { captureCurrentVestige, resetCameraCenter } from '../../map/cityMapBridge.js';
import { newCitySeed } from '../../map/procedural/seedManager.js';
import { clamp01, canPayCost, payCost, fmt } from '../utils.js';
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
  state.recentCrisisIds = [...(state.recentCrisisIds || []).slice(-8), event.id];
  openCrisisEvent(event);
}

export async function openCrisisEvent(event) {
  setGamePaused(true);
  render();
  if (isMythEffectActive("mythe_d_hephaistos") && state.population < HEPH_POP_CRISIS_THRESHOLD) {
    chronicle(`La colère d'Héphaïstos s'abat sur notre population affaiblie (${Math.floor(state.population)} hab). Face à son courroux, nos appels restent vains et le déclin s'impose à nous.`);
    addProductionPenalty("global", 0.06);
    state.instability = clamp01(state.instability + 0.05);
    setGamePaused(false);
    render();
    return;
  }

  const choice = await openChoiceDialog(event);

  const instabilityBefore = state.instability || 0;
  choice.apply();
  if ((state.instability || 0) < instabilityBefore) registerOlympusCrisisResolved();
  else registerOlympusCrisisIgnored();
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

export function runTerminalCrisisAction(type) {
  if (!crisisOpen() || collapseInProgress) return;
  if (!terminalCrisisReady(type)) return;
  const cost = terminalCrisisCost(type);
  payCost(cost);
  state.crisisExtensions = (state.crisisExtensions || 0) + 1;
  registerOlympusCrisisResolved();

  if (type === "prepareArchives") {
    state.collapsePreparation = Math.min(2.4, (state.collapsePreparation || 0) + 0.34);
    lowerTerminalPressure(0.88, 0.88);
    chronicle("Alors que les fondations tremblent, nos scribes mettent les chroniques à l'abri ; la mémoire de notre peuple survivra aux ruines.");
  } else if (type === "exodus") {
    state.collapsePreparation = Math.min(2.4, (state.collapsePreparation || 0) + 0.24);
    lowerTerminalPressure(0.90, 0.90);
    chronicle("Une longue procession franchit les portes sacrées : l'exode est en marche, portant l'espoir d'une nouvelle fondation.");
  } else if (type === "holdOrder") {
    state.collapsePreparation = Math.min(2.4, (state.collapsePreparation || 0) + 0.08);
    lowerTerminalPressure(0.92, 0.92);
    chronicle("La garde maintient un ordre de fer à grands frais. Nos murs tiennent encore, mais le souffle de l'effondrement fait vaciller nos derniers feux.");
  }

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
    state.phoenixTotalRuins = (state.phoenixTotalRuins || 0) + gain;
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
  
  captureCurrentVestige();
  
  state.ruins += gain;
  if (wasChaos && state.chaosRuinsDouble) {
    state.chaosRuinsBonus = (state.chaosRuinsBonus || 0) + gain;
    chronicle(`L'ombre du Chaos transfigure notre héritage : +${fmt(gain)} ruines immatérielles s'inscrivent dans notre histoire, magnifiant à jamais la mémoire de nos vestiges.`);
  }
  state.cycles += 1;
  // Nouvelle civilisation : nouveau plan procédural (seed + rivière + enceinte régénérés).
  state.mapSeed = newCitySeed();
  state.riverWP = null;
  state.wallRadius = null;
  state.population = Math.max(10, keptPop);
  state.food = Math.max(35 + ruinEffectSum("startFood"), keptFood);
  state.gold = Math.max(ruinEffectSum("startGold"), keptGold);
  
  const memoireSavoirBonus = has("codex_mythique") ? 250 * (state.bestEraIndex || 0) : 0;
  state.knowledge = Math.max(ruinEffectSum("startKnowledge"), keptKnowledge) + memoireSavoirBonus;
  
  state.infrastructure = keptInfra + (has("fallen_roads") ? Math.max(1, Math.sqrt(state.ruins) * 0.25) : 0);
  
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
      .filter((u) => u.group === "ruins" && !has(u.id) && state.ruins >= (u.cost?.ruins || Infinity))
      .sort((a, b) => (a.cost?.ruins || 0) - (b.cost?.ruins || 0))[0];
    if (cheapest) {
      state.ruins -= (cheapest.cost?.ruins || 0);
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

export function runCrisisAction(id, shouldRender = true) {
  const doRender = shouldRender === true || (shouldRender && shouldRender.render !== false);
  if (gamePaused || collapseInProgress || state.crisisLimitAnnounced) return;
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
    state.instability = Math.max(0, state.instability - effect.drop);
  } else {
    state.atlasCrisisCount = (state.atlasCrisisCount || 0) + 1;
  }
  state.crisisActions[effect.key] += 1;
  if (id === "reforms") state.infrastructure += Math.max(1, totalBuildingCount() * 0.08);
  if (id === "archiveCrisis") state.knowledge += Math.max(4, state.cycles * 2);
  if (id === "ancestorCrisis") state.legitimacy += 0.35;
  registerOlympusCrisisResolved();
  if (state.crisisLimitAnnounced) state.crisisOpenedAt = Date.now();
  chronicle(effect.note);
  if (doRender) render();
}
