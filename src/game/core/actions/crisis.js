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
  currentEraIndex,
  regulationActionUnlocked,
  regulationPolicyUnlocked,
  regulFatigueEffectMult
} from '../mechanics.js';
import { REGULATION_ACTIONS_BY_ID, POLICY_BY_ID } from '../../data/regulationActions.js';

import { runCollapseSequence, openChoiceDialog } from '../events.js';
import { pushOutcomeFloat } from '../outcomeFloat.js';
import { upgrades } from '../../data/upgrades.js';
import { eras, eraTier, CRISIS_EVENTS, CRISIS_POOL } from '../../data/world.js';
import { epitaphLegacyById } from '../../data/epitaphs.js';
import { captureCurrentVestige, resetCameraCenter } from '../../map/cityMapBridge.js';
import { newCitySeed } from '../../map/procedural/seedManager.js';
import { clamp01, canPayCost, payCost, fmt } from '../utils.js';
import { D } from '../num.js';
import { COLLAPSE_PREP_MAX, FOYER_RELIEF_CAP, FOYER_RELIEF_ADD, FOYER_RELIEF_INSTANT_FACTOR, FOYER_MALUS_RESOURCE, FOYER_MALUS_PCT, FOYER_REFORM, REFORM_ACTION_FOYER, POLICY_MAX_ACTIVE, FATIGUE_PER_ACTION } from '../balance.js';
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
  // Doctrine de crise : si le palier est automatisé (Conseil de crise possédé +
  // posture ≠ "ask"), on résout l'event sans dialogue ni pause. Sinon, dialogue.
  const stance = crisisAutoStance(slot.id);
  if (stance) { autoResolveCrisisEvent(event, stance); return; }
  openCrisisEvent(event);
}

// Posture configurée pour un palier (slot.id "_25"/"_50"/"_75"), ou null si le
// joueur n'a pas le Conseil de crise ou a laissé "ask" (dialogue manuel).
function crisisAutoStance(slotId) {
  if (!has("conseil_de_crise")) return null;
  const d = state.crisisDoctrine;
  if (!d) return null;
  const stance = slotId === "_25" ? d.p25 : slotId === "_50" ? d.p50 : slotId === "_75" ? d.p75 : "ask";
  return (stance === "stabiliser" || stance === "temporiser") ? stance : null;
}

// Résolution automatique d'un event de crise selon la posture, SANS pause ni
// dialogue (cf. CE-spec-idle-crises.md §A.3). Miroir des effets d'openCrisisEvent.
export function autoResolveCrisisEvent(event, stance) {
  // Mythe d'Héphaïstos : sous le seuil de population, la crise s'impose sans choix
  // — même override qu'openCrisisEvent, pour ne pas court-circuiter le mythe.
  if (isMythEffectActive("mythe_d_hephaistos") && D(state.population).lt(HEPH_POP_CRISIS_THRESHOLD)) {
    chronicle(`La colère d'Héphaïstos s'abat sur notre population affaiblie (${fmt(D(state.population).floor())} hab). Face à son courroux, nos appels restent vains et le déclin s'impose à nous.`);
    addProductionPenalty("global", 0.06);
    state.instability = clamp01(state.instability + 0.05);
    return;
  }
  const opts = event.options || [];
  const choice = opts.find((o) => o.stance === stance) || opts[0];
  if (!choice || typeof choice.apply !== "function") return;
  const before = state.instability || 0;
  const outcome = choice.apply();
  if (outcome && outcome.label) pushOutcomeFloat(outcome);
  if ((state.instability || 0) < before) registerOlympusCrisisResolved();
  else registerOlympusCrisisIgnored();
  state.instability = clamp01(state.instability);
  chronicle(`Le Conseil de crise tranche : « ${choice.label} » — appliqué sans délai.`);
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
  // Pics du cycle qui vient de tomber (cyclePeaks n'est remis à zéro qu'en fin de
  // fonction) : socle de départ indexé sur l'ÉCHELLE via les effectType *PctPeak.
  const peaks = state.cyclePeaks || {};
  const startFloor = (resource, flat) =>
    D(flat + ruinEffectSum(`start${resource}`)).add(D(peaks[resource.toLowerCase()] || 0).mul(ruinEffectSum(`start${resource}PctPeak`)));
  const doctrinePopBonus = hasDoctrine("acier") ? D(peaks.population || 0).mul(0.08).floor() : D(0);
  const keptPop = (has("granaries") ? D(state.population).mul(0.03) : D(10))
    .max(startFloor("Population", 10))
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
  state.food = keptFood.max(startFloor("Food", 35));
  state.gold = keptGold.max(startFloor("Gold", 0));

  const memoireSavoirBonus = has("codex_mythique") ? 250 * eraTier(state.bestEraIndex || 0) : 0;
  state.knowledge = keptKnowledge.max(startFloor("Knowledge", 0)).add(memoireSavoirBonus);

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

// Étape 2 : quelle barre (foyer de pressureBreakdown) chaque action calme.
const ACTION_FOYER = {
  rationing: "scarcity",
  festivals: "inequality",
  census: "complexity",
  reforms: "complexity",
  archiveCrisis: "dissent",
  ancestorCrisis: "dissent"
};

// Dépêches des réformes de fond (recul DURABLE par foyer).
const REFORM_CHRONICLES = {
  scarcity: "Des greniers d'État sont édifiés pour toujours : la cité ne craint plus la disette d'une mauvaise saison.",
  inequality: "Une charte des communs est gravée dans le marbre : le partage des richesses devient loi, et la rue s'apaise durablement.",
  complexity: "Le grand cadastre est achevé : chaque rue, chaque toit est enregistré ; l'administration cesse d'étouffer sous sa propre taille.",
  dissent: "Un panthéon d'État unit les cultes sous un même toit : la mémoire commune scelle l'unité du peuple pour les années à venir."
};

// Chaque action de régulation fatigue l'administration (anti-spam) : la fatigue
// monte, redescend avec le temps (cf. tick.js), réduit l'efficacité et majore le coût.
function raiseRegulFatigue() {
  state.regulFatigue = Math.min(1, (state.regulFatigue || 0) + FATIGUE_PER_ACTION);
}

export function runCrisisAction(id, options = {}) {
  const opts = (typeof options === "object" && options !== null) ? options : { render: Boolean(options) };
  const { render: doRender = true, force = false } = opts;
  if (gamePaused || collapseInProgress) return;
  // Pendant la crise terminale, seules les actions auto de l'intendant (force) passent.
  if (state.crisisLimitAnnounced && !force) return;
  const costs = crisisCosts();

  // Réforme de fond : dépose un recul DURABLE sur son foyer (ne décline pas),
  // sous le plafond partagé avec l'apaisement. Branche séparée : pas de relief
  // temporaire ni de malus de prod — le coût lourd EST la contrepartie.
  const reformFoyer = REFORM_ACTION_FOYER[id];
  if (reformFoyer) {
    const rf = state.foyerReform || (state.foyerReform = { scarcity: 0, inequality: 0, complexity: 0, dissent: 0 });
    if ((rf[reformFoyer] || 0) >= FOYER_RELIEF_CAP) return; // foyer déjà réformé au max
    const reformCost = costs[id];
    if (!reformCost || !canPayCost(reformCost)) return;
    payCost(reformCost);
    rf[reformFoyer] = Math.min(FOYER_RELIEF_CAP, (rf[reformFoyer] || 0) + (FOYER_REFORM[reformFoyer]?.add || 0) * regulFatigueEffectMult());
    // Kicker économique modeste : la réforme bâtit aussi de l'institution.
    state.infrastructure = D(state.infrastructure).add(Math.max(1, totalBuildingCount() * 0.05));
    raiseRegulFatigue();
    registerOlympusCrisisResolved();
    renderCache._framePressureVer = -1;
    renderCache._frameRatesVer = -1;
    if (state.crisisLimitAnnounced) state.crisisOpenedAt = Date.now();
    chronicle(REFORM_CHRONICLES[reformFoyer] || "Une réforme de fond s'installe durablement dans la cité.");
    if (doRender) render();
    return;
  }

  // Actions déblocables (registre regulationActions) : apaisement OU réforme,
  // avec effets économiques optionnels (infra/légitimité). Gating ères/mythes.
  const regAction = REGULATION_ACTIONS_BY_ID[id];
  if (regAction) {
    if (!regulationActionUnlocked(id)) return; // pas encore débloquée
    const foyer = regAction.foyer;
    if (regAction.kind === "reform") {
      const rf = state.foyerReform || (state.foyerReform = { scarcity: 0, inequality: 0, complexity: 0, dissent: 0 });
      if ((rf[foyer] || 0) >= FOYER_RELIEF_CAP) return; // foyer déjà réformé au max
    }
    const regCost = costs[id];
    if (!regCost || !canPayCost(regCost)) return;
    payCost(regCost);

    const eff = regulFatigueEffectMult();
    let note = regAction.note;
    if (regAction.kind === "gamble") {
      // Pari : proba de gros apaisement, sinon retour de bâton (hausse de Rupture).
      const win = Math.random() < (regAction.p ?? 0.5);
      if (win && !isMythEffectActive("mythe_d_atlas")) {
        const fr = state.foyerRelief || (state.foyerRelief = { scarcity: 0, inequality: 0, complexity: 0, dissent: 0 });
        const add = (regAction.relief || 0) * eff;
        fr[foyer] = Math.min(FOYER_RELIEF_CAP, (fr[foyer] || 0) + add);
        state.instability = Math.max(0, state.instability - add * FOYER_RELIEF_INSTANT_FACTOR);
      } else if (!win) {
        state.instability = clamp01(state.instability + (regAction.failInstability || 0));
      } else {
        state.atlasCrisisCount = (state.atlasCrisisCount || 0) + 1;
      }
      if (regAction.counter && regAction.counter in state.crisisActions) state.crisisActions[regAction.counter] += 1;
      note = win ? (regAction.noteWin || regAction.note) : (regAction.noteFail || "Le pari tourne court : la tension remonte.");
      pushOutcomeFloat({ label: win ? "🎲 Pari réussi" : "🎲 Pari perdu", kind: win ? "gain" : "cost" });
    } else if (regAction.kind === "reform") {
      const rf = state.foyerReform;
      rf[foyer] = Math.min(FOYER_RELIEF_CAP, (rf[foyer] || 0) + (regAction.reformAdd || 0) * eff);
    } else if (!isMythEffectActive("mythe_d_atlas")) {
      const fr = state.foyerRelief || (state.foyerRelief = { scarcity: 0, inequality: 0, complexity: 0, dissent: 0 });
      const add = (regAction.relief || 0) * eff;
      fr[foyer] = Math.min(FOYER_RELIEF_CAP, (fr[foyer] || 0) + add);
      state.instability = Math.max(0, state.instability - add * FOYER_RELIEF_INSTANT_FACTOR);
      if (regAction.malusRes) addProductionPenalty(regAction.malusRes, regAction.malusPct || 0);
      if (regAction.counter && regAction.counter in state.crisisActions) state.crisisActions[regAction.counter] += 1;
    } else {
      state.atlasCrisisCount = (state.atlasCrisisCount || 0) + 1;
    }
    // Effets économiques (tous kinds) : la gestion de crise nourrit la croissance.
    if (regAction.infraAdd) state.infrastructure = D(state.infrastructure).add(Math.max(1, totalBuildingCount() * regAction.infraAdd));
    if (regAction.legitAdd) state.legitimacy += regAction.legitAdd;

    raiseRegulFatigue();
    registerOlympusCrisisResolved();
    renderCache._framePressureVer = -1;
    renderCache._frameRatesVer = -1;
    if (state.crisisLimitAnnounced) state.crisisOpenedAt = Date.now();
    chronicle(note);
    if (doRender) render();
    return;
  }

  const cost = costs[id];
  if (!cost || !canPayCost(cost)) return;
  payCost(cost);
  // `key` = compteur de coût (escalade actionScale + partage census/festivals) ;
  // `note` = dépêche de chronique. L'effet sur la Rupture passe désormais par le
  // relief de foyer (cf. ACTION_FOYER / FOYER_RELIEF_*), plus un coup instantané.
  const effects = {
    rationing: { key: "rationing", note: "Les greniers ont été scellés et rationnés : nous apprenons à vivre de peu pour repousser la faim." },
    festivals: { key: "festivals", note: "De grands jeux civiques sont proclamés sur les places publiques ; le peuple oublie un instant sa colère sous les bannières de la dynastie." },
    census: { key: "census", note: "Nos scribes achèvent le grand recensement, gravant chaque nom sur l'argile pour redonner un visage à la cité." },
    reforms: { key: "reforms", note: "De profondes réformes institutionnelles sont votées, consolidant les assises de la cité face aux menaces imminentes." },
    archiveCrisis: { key: "census", note: "L'étude minutieuse des catastrophes passées est consignée par écrit, afin que les générations futures sachent comment faire face à l'effroi." },
    ancestorCrisis: { key: "festivals", note: "Les autels de nos ancêtres sont fleuris ; la peur s'efface devant la ferveur et la continuité de notre lignée." }
  };
  const effect = effects[id];
  if (!effect) return;
  if (!isMythEffectActive("mythe_d_atlas")) {
    // Étape 2 : l'action calme SON foyer (relief multiplicatif décroissant → la
    // barre du foyer descend), plus un petit coup instantané sur la jauge globale
    // pour la réactivité. Le relief est plafonné et décline : tenir la jauge
    // reste un délai, pas une immortalité.
    const foyer = ACTION_FOYER[id];
    if (foyer) {
      const fr = state.foyerRelief || (state.foyerRelief = { scarcity: 0, inequality: 0, complexity: 0, dissent: 0 });
      const add = (FOYER_RELIEF_ADD[id] || 0) * regulFatigueEffectMult();
      fr[foyer] = Math.min(FOYER_RELIEF_CAP, (fr[foyer] || 0) + add);
      state.instability = Math.max(0, state.instability - add * FOYER_RELIEF_INSTANT_FACTOR);
    }
    // Étape 3 : contrepartie de production — malus temporaire (jusqu'au prochain
    // effondrement) sur une ressource, pour que chaque clic soit un sacrifice
    // ressenti dans les taux. Cumulatif, plafonné par addProductionPenalty.
    const malusRes = FOYER_MALUS_RESOURCE[id];
    if (malusRes) addProductionPenalty(malusRes, FOYER_MALUS_PCT[id] || 0);
  } else {
    state.atlasCrisisCount = (state.atlasCrisisCount || 0) + 1;
  }
  state.crisisActions[effect.key] += 1;
  if (id === "reforms") state.infrastructure = D(state.infrastructure).add(Math.max(1, totalBuildingCount() * 0.08));
  if (id === "ancestorCrisis") state.legitimacy += 0.35;
  raiseRegulFatigue();
  registerOlympusCrisisResolved();
  // Barres/coûts à jour dès ce render (sinon ~1 tick de retard sur le cache frame).
  renderCache._framePressureVer = -1;
  renderCache._frameRatesVer = -1;
  if (state.crisisLimitAnnounced) state.crisisOpenedAt = Date.now();
  chronicle(effect.note);
  if (doRender) render();
}

// Levier C — bascule une politique permanente (toggle). Pas de coût ponctuel : le
// coût est le malus de production CONTINU tant qu'elle est active (récupérable à
// l'extinction). Borné par POLICY_MAX_ACTIVE (budget de stabilité).
export function togglePolicy(id) {
  if (collapseInProgress) return;
  if (!POLICY_BY_ID[id]) return;
  const list = state.activePolicies || (state.activePolicies = []);
  const idx = list.indexOf(id);
  if (idx >= 0) {
    list.splice(idx, 1);
  } else {
    if (!regulationPolicyUnlocked(id)) return;
    if (list.length >= POLICY_MAX_ACTIVE) return;
    list.push(id);
  }
  // Coût et ralentissement changent immédiatement (sinon ~1 tick de retard).
  renderCache._frameRatesVer = -1;
  renderCache._framePressureVer = -1;
  save();
  render();
}
