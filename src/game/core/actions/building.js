"use strict";

import {
  state,
  renderCache,
  buildGrandResetState,
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
  archaeologyCandidates,
  archaeologyCost,
  enforceInfrastructureCap,
  canBuyUpgrade,
  has,
  grandResetLegitimacyCost,
  grandResetMythsRequired,
  completedMythCount,
  buildingMilestoneInfo
} from '../mechanics.js';

import { openChoiceDialog } from '../events.js';
import { pushOutcomeFloat } from '../outcomeFloat.js';
import { clamp, clamp01, canPayCost, payCost, fmt } from '../utils.js';
import { D } from '../num.js';
import { tr } from '../i18n.js';
import { SISYPHE_MULT_PER_PURCHASE, PROMETHEE_RUPTURE_PER_FOOD, isMythEffectActive } from '../../data/myths.js';
import { chronicleBuilding, chronicle, log } from './utils.js';
import { resetCameraCenter } from '../../map/cityMapBridge.js';

export function buyBuilding(id) {
  const building = buildingById[id];
  if (!building) return;
  if (isMythEffectActive("mythe_de_babel") && state.babelCategory && building.category !== state.babelCategory) return;
  // state.buyAmount est la source de vérité : la variable module exportée par
  // state.js n'est pas resynchronisée par setState (Grand Reset, import de save).
  const amount = state.buyAmount === "max" ? maxBuyAmount(building) : clamp(Math.floor(Number(state.buyAmount) || 1), 1, 500);
  const prices = buildingBatchCost(building, amount);
  if (!canPayCost(prices)) return;
  const previousCount = state.buildings[id] || 0;
  payCost(prices);
  state.buildings[id] += amount;
  // Compteur d'achats cumulés sur toute la partie (jalon de merveille) :
  // survit aux effondrements, comme les ruines.
  state.lifetimePurchases = (state.lifetimePurchases || 0) + amount;
  const previousMilestone = Math.floor(previousCount / 25);
  const currentMilestone = Math.floor(state.buildings[id] / 25);
  if (currentMilestone > previousMilestone) {
    // B1 — Float doré de palier : récompense visible à chaque tranche de 25.
    const info = buildingMilestoneInfo(building, state.buildings[id]);
    pushOutcomeFloat({ label: `⭐ ${tr(building.name)} ×${fmt(info ? info.bonus : 1)}`, kind: "gain" });
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

export async function exhumeVestige() {
  if (!canExhume()) return;
  const candidates = archaeologyCandidates();
  if (!candidates.length) return;
  const cost = archaeologyCost();

  setGamePaused(true);
  render();

  const choice = await openChoiceDialog({
    title: "Vestige archéologique",
    body: `Coût : ${fmt(cost)} connaissance.\nQuel bâtiment vos archéologues ont-ils mis au jour ?`,
    options: candidates.map((b) => ({
      label: tr(b.name),
      detail: tr(b.desc),
      buildingId: b.id
    }))
  });

  setGamePaused(false);

  if (!choice?.buildingId) { render(); return; }
  if (!canExhume()) { render(); return; }

  const target = buildingById[choice.buildingId];
  if (!target) { render(); return; }

  state.knowledge = D(state.knowledge).sub(cost);
  state.buildings[target.id] = (state.buildings[target.id] || 0) + 1;
  state.archaeologyUsed = true;
  enforceInfrastructureCap();
  invalidateRenderCache("buildings");
  chronicle(`Nos archéologues ont exhumé les ruines de : ${tr(target.name)}. Ses fondations antiques ont été restaurées.`);
  render();
}

export async function performGrandReset() {
  if (collapseInProgress || gamePaused || !has("grand_reset")) return;
  const nextCount = (state.grandResetCount || 0) + 1;
  const maxGrandResets = state.ragnarokHeritage ? 11 : 10;
  if (nextCount > maxGrandResets) return;
  // Coût croissant (le 1er GR est couvert par l'achat de l'upgrade) : la
  // récompense double à chaque GR, le coût aussi — sinon les 10 GR s'enchaînent
  // sans être ressentis comme des sommets.
  const legitCost = grandResetLegitimacyCost(nextCount);
  if (state.legitimacy < legitCost) {
    log(`Le Grand Reset ${nextCount} exige ${fmt(legitCost)} légitimité (actuel : ${fmt(state.legitimacy)}). Fondez des dynasties pour mériter ce sommet.`);
    render();
    return;
  }
  // Gating doux par les Mythes : chaque GR à partir du 3e exige un pacte
  // mythique honoré de plus — les Mythes sont les chapitres de la route.
  const mythsRequired = grandResetMythsRequired(nextCount);
  if (completedMythCount() < mythsRequired) {
    log(`Le Grand Reset ${nextCount} exige ${mythsRequired} Mythe(s) complété(s) (actuel : ${completedMythCount()}). Honorez un pacte mythique pour continuer.`);
    render();
    return;
  }
  setGamePaused(true);
  const resetRewardText = nextCount === 11
    ? "un multiplicateur permanent x4 supplémentaire sur les Ruines gagnées"
    : `un bonus permanent x${Math.pow(2, nextCount).toFixed(0)} sur toute la production et les Ruines gagnées`;
  const costText = legitCost > 0 ? ` Coût : ${fmt(legitCost)} légitimité.` : "";
  const choice = await openChoiceDialog({
    title: "Grand Reset",
    body: `Tout sera efface: batiments, ruines, upgrades, cycles, heritage.${costText} En echange: ${resetRewardText}. Actuellement: x${Math.pow(2, state.grandResetCount || 0).toFixed(0)} production. Apres: x${Math.pow(2, nextCount).toFixed(0)} production.`,
    options: [
      { label: "Tout reinitialiser", detail: nextCount === 11 ? "+x4 Ruines permanent" : `+x${Math.pow(2, nextCount).toFixed(0)} production permanente` },
      { label: "Annuler", detail: "Ne rien faire" }
    ]
  });
  if (choice.label === "Annuler") { setGamePaused(false); return; }

  setMourning(true);
  await new Promise((resolve) => setTimeout(resolve, 1300));

  // Construit le state frais en préservant les héritages permanents.
  // SOURCE DE VÉRITÉ des champs conservés : GR_PERSISTENT_FIELDS (state.js).
  // Tout nouveau déblocage permanent DOIT y être ajouté, sinon il est effacé ici.
  const fresh = buildGrandResetState(nextCount, legitCost);

  setState(fresh);

  setGamePaused(false);
  setCollapseInProgress(false);
  setMourning(false);
  invalidateRenderCache("all");
  resetCameraCenter();
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
  state.lifetimePurchases = (state.lifetimePurchases || 0) + 1;
  renderCache.cachedRuinEffects = null;
  renderCache.cachedRuinEffectsSignature = "";
  invalidateRenderCache("all");
  chronicle(`Nos dirigeants ont décrété une nouvelle avancée pour la cité : ${upgrade.name}.`);
  render();
}

export function rewardCitizenThought(thoughtType, citizen) {
  let rewardText;
  if (thoughtType === "lightning") {
    const gain = D(state.gold).mul(0.05).ceil().max(5);
    state.gold = D(state.gold).add(gain);
    rewardText = `+${fmt(gain)} Or`;
    log(`Inspiration : ${citizen.name} a eu une idée lumineuse (+${fmt(gain)} Or).`);
  } else if (thoughtType === "scroll") {
    const gain = D(state.knowledge).mul(0.05).ceil().max(15);
    state.knowledge = D(state.knowledge).add(gain);
    rewardText = `+${fmt(gain)} Savoir`;
    log(`Découverte : ${citizen.name} a exhumé un parchemin antique (+${fmt(gain)} Savoir).`);
  } else {
    const gainFood = D(state.food).mul(0.05).ceil().max(10);
    state.food = D(state.food).add(gainFood);
    rewardText = `+${fmt(gainFood)} Nourriture`;
    log(`Murmure : ${citizen.name} partage ses pensées (+${fmt(gainFood)} Nourriture).`);
  }
  save();
  render();
  return rewardText;
}
