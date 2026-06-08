"use strict";

import {
  state,
  buyAmount,
  recentBuildingMilestones,
  renderCache,
  defaultState,
  invalidateRenderCache,
  openView,
  render,
  setGamePaused,
  setCollapseInProgress,
  setMourning,
  setState,
  buildingById,
  upgradeById,
  save,
  gamePaused,
  collapseInProgress
} from '../state.js';

import {
  maxBuyAmount,
  buildingBatchCost,
  canExhume,
  archaeologyTarget,
  archaeologyCost,
  enforceInfrastructureCap,
  canBuyUpgrade,
  has,
  globalMultiplier
} from '../mechanics.js';

import { openChoiceDialog } from '../events.js';
import { clamp, clamp01, canPayCost, payCost, fmt } from '../utils.js';
import { SISYPHE_MULT_PER_PURCHASE, PROMETHEE_RUPTURE_PER_FOOD, isMythEffectActive } from '../../data/myths.js';
import { chronicleBuilding, chronicle, log } from './utils.js';

export function buyBuilding(id) {
  const building = buildingById[id];
  if (!building) return;
  if (isMythEffectActive("mythe_de_babel") && state.babelCategory && building.category !== state.babelCategory) return;
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
  if (isMythEffectActive("mythe_de_sisyphe")) {
    state.sisypheMult = (state.sisypheMult || 1) * SISYPHE_MULT_PER_PURCHASE;
  }
  if (isMythEffectActive("mythe_de_promethee") && building.food > 0) {
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
  chronicle(`Nos archéologues ont exhumé les ruines de : ${target.name}. Ses fondations antiques ont été restaurées.`);
  render();
}

export async function performGrandReset() {
  if (collapseInProgress || gamePaused || !has("grand_reset")) return;
  setGamePaused(true);
  const nextCount = (state.grandResetCount || 0) + 1;
  const maxGrandResets = state.ragnarokHeritage ? 11 : 10;
  if (nextCount > maxGrandResets) {
    setGamePaused(false);
    return;
  }
  const resetRewardText = nextCount === 11
    ? "un multiplicateur permanent x4 supplémentaire sur les Ruines gagnées"
    : `un bonus permanent x${Math.pow(2, nextCount).toFixed(0)} sur toute la production et les Ruines gagnées`;
  const choice = await openChoiceDialog({
    title: "Grand Reset",
    body: `Tout sera efface: batiments, ruines, upgrades, cycles, heritage. En echange: ${resetRewardText}. Actuellement: x${Math.pow(2, state.grandResetCount || 0).toFixed(0)} production. Apres: x${Math.pow(2, nextCount).toFixed(0)} production.`,
    options: [
      { label: "Tout reinitialiser", detail: nextCount === 11 ? "+x4 Ruines permanent" : `+x${Math.pow(2, nextCount).toFixed(0)} production permanente` },
      { label: "Annuler", detail: "Ne rien faire" }
    ]
  });
  if (choice.label === "Annuler") { setGamePaused(false); return; }

  setMourning(true);
  await new Promise((resolve) => setTimeout(resolve, 1300));

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
  const savedAtridesHeritage      = Boolean(state.atridesHeritage);
  const savedAutoScriptRules      = state.autoScriptRules ? JSON.parse(JSON.stringify(state.autoScriptRules)) : null;
  const savedHephHeritage         = Boolean(state.hephHeritage);
  const savedAutomateRules        = state.automateRules ? JSON.parse(JSON.stringify(state.automateRules)) : null;
  const savedSurchauffeEndTime    = state.surchauffeEndTime || 0;
  const savedSurchauffeCooldown   = state.surchauffeCooldownEnd || 0;
  const savedLegitimacy = state.legitimacy || 0;
  const savedDynastyCount = state.dynastyCount || 0;
  const savedDynastyDoctrine = state.dynastyDoctrine || null;
  const savedCadmosHeritage = Boolean(state.cadmosHeritage);
  const savedCadmosPermanentEpitaphs = Array.isArray(state.cadmosPermanentEpitaphs)
    ? JSON.parse(JSON.stringify(state.cadmosPermanentEpitaphs))
    : [];
  const savedCadmosLastRunChronicle = Array.isArray(state.cadmosLastRunChronicle)
    ? JSON.parse(JSON.stringify(state.cadmosLastRunChronicle))
    : [];
  const savedAnteeHeritage = Boolean(state.anteeHeritage);
  const savedRagnarokHeritage = Boolean(state.ragnarokHeritage);
  const savedFinalChronicleTitle = state.finalChronicleTitle || "";
  
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
  fresh.atridesHeritage       = savedAtridesHeritage;
  if (savedAutoScriptRules)   fresh.autoScriptRules = savedAutoScriptRules;
  fresh.hephHeritage          = savedHephHeritage;
  if (savedAutomateRules)     fresh.automateRules = savedAutomateRules;
  fresh.surchauffeEndTime     = savedSurchauffeEndTime;
  fresh.surchauffeCooldownEnd = savedSurchauffeCooldown;
  fresh.legitimacy = savedLegitimacy;
  fresh.dynastyCount = savedDynastyCount;
  fresh.dynastyDoctrine = savedDynastyDoctrine;
  fresh.cadmosHeritage = savedCadmosHeritage;
  fresh.cadmosPermanentEpitaphs = savedCadmosPermanentEpitaphs;
  fresh.cadmosLastRunChronicle = savedCadmosLastRunChronicle;
  fresh.anteeHeritage = savedAnteeHeritage;
  fresh.ragnarokHeritage = savedRagnarokHeritage;
  fresh.finalChronicleTitle = savedFinalChronicleTitle;
  fresh.history = [`Grand Reset x${nextCount} : tout a été effacé. Bonus permanent : ${nextCount === 11 ? "x4 Ruines supplémentaire" : `x${Math.pow(2, nextCount).toFixed(0)} production et Ruines gagnées`}. Les pactes mythiques demeurent.`];
  
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
  payCost(upgrade.cost);
  state.upgrades[id] = true;
  renderCache.cachedRuinEffects = null;
  renderCache.cachedRuinEffectsSignature = "";
  invalidateRenderCache("all");
  chronicle(`Nos dirigeants ont décrété une nouvelle avancée pour la cité : ${upgrade.name}.`);
  render();
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

export function rewardCitizenThought(thoughtType, citizen) {
  let rewardText;
  if (thoughtType === "lightning") {
    const gain = Math.max(5, Math.ceil(state.gold * 0.05));
    state.gold += gain;
    rewardText = `+${fmt(gain)} Or`;
    log(`Inspiration : ${citizen.name} a eu une idée lumineuse (+${fmt(gain)} Or).`);
  } else if (thoughtType === "scroll") {
    const gain = Math.max(15, Math.ceil(state.knowledge * 0.05));
    state.knowledge += gain;
    rewardText = `+${fmt(gain)} Savoir`;
    log(`Découverte : ${citizen.name} a exhumé un parchemin antique (+${fmt(gain)} Savoir).`);
  } else {
    const gainFood = Math.max(10, Math.ceil(state.food * 0.05));
    state.food += gainFood;
    rewardText = `+${fmt(gainFood)} Nourriture`;
    log(`Murmure : ${citizen.name} partage ses pensées (+${fmt(gainFood)} Nourriture).`);
  }
  save();
  render();
  return rewardText;
}
