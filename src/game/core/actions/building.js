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
  isUnlocked,
  crisisOpen,
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
import { buildings } from '../../data/buildings.js';
import { SISYPHE_MULT_PER_PURCHASE, PROMETHEE_RUPTURE_PER_FOOD, isMythEffectActive } from '../../data/myths.js';
import { chronicleBuilding, chronicle, log } from './utils.js';
import { resetCameraCenter } from '../../map/cityMapBridge.js';

export function buyBuilding(id) {
  if (buyBuildingCore(id)) {
    invalidateRenderCache("buildings");
    render();
  }
}

// Cœur d'achat SANS invalidation ni render : payer, incrémenter, appliquer tous
// les effets de bord (paliers, Sisyphe, Prométhée, lifetimePurchases, chronique).
// Retourne true si l'achat a bien eu lieu. Partagé par buyBuilding (1 achat +
// render immédiat) et buyAllAffordable (boucle de masse, un seul render en fin).
//   - amount : quantité forcée ; par défaut lit state.buyAmount (x1..x100/Max).
//   - silent : coupe le retour visuel par-achat (float doré de palier + chronique),
//     agrégé en un seul récapitulatif par l'appelant lors d'un achat de masse.
function buyBuildingCore(id, { amount: amountOverride = null, silent = false } = {}) {
  const building = buildingById[id];
  if (!building) return false;
  if (isMythEffectActive("mythe_de_babel") && state.babelCategory && building.category !== state.babelCategory) return false;
  // state.buyAmount est la source de vérité : la variable module exportée par
  // state.js n'est pas resynchronisée par setState (Grand Reset, import de save).
  const amount = amountOverride != null
    ? amountOverride
    : (state.buyAmount === "max" ? maxBuyAmount(building) : clamp(Math.floor(Number(state.buyAmount) || 1), 1, 500));
  const prices = buildingBatchCost(building, amount);
  if (!canPayCost(prices)) return false;
  const previousCount = state.buildings[id] || 0;
  payCost(prices);
  state.buildings[id] += amount;
  // Compteur d'achats cumulés sur toute la partie (jalon de merveille) :
  // survit aux effondrements, comme les ruines.
  state.lifetimePurchases = (state.lifetimePurchases || 0) + amount;
  const previousMilestone = Math.floor(previousCount / 25);
  const currentMilestone = Math.floor(state.buildings[id] / 25);
  if (currentMilestone > previousMilestone && !silent) {
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
  if (!silent) chronicleBuilding(building, previousCount, state.buildings[id]);
  return true;
}

// ── Raccourci « Tout acheter » (touche E) ────────────────────────────────────
// Catégories concernées : les 3 onglets de la boutique (Moteurs / Savoir / Infra).
const BUY_ALL_CATEGORIES = new Set(["city", "knowledge", "infra"]);
// Devises « courantes » dépensables en masse. On EXCLUT délibérément toute monnaie
// de prestige (ruins) : « Tout acheter » ne doit JAMAIS ponctionner les Ruines, qui
// financent l'arbre permanent — ex. ruin_architects paie extraCost:{ruins:85} et se
// retrouve donc écarté de l'achat de masse (mais reste achetable à la main).
const BUY_ALL_CURRENCIES = new Set(["food", "gold", "knowledge", "infrastructure"]);
// Garde-fou dur contre toute boucle pathologique (coût ~nul via discounts extrêmes).
// Jamais atteint en pratique : les coûts explosent géométriquement (scale^count).
const BUY_ALL_MAX_ITERS = 10000;

function buyableInMass(building) {
  if (!BUY_ALL_CATEGORIES.has(building.category)) return false;
  if (!isUnlocked(building)) return false;
  if (!BUY_ALL_CURRENCIES.has(building.currency)) return false;
  if (building.extraCost) {
    for (const currency of Object.keys(building.extraCost)) {
      if (!BUY_ALL_CURRENCIES.has(currency)) return false;
    }
  }
  return true;
}

// Achète, du PLUS CHER au moins cher, tout ce qui est abordable dans les onglets
// Moteurs / Savoir / Infrastructure — sans jamais toucher aux Ruines. Glouton par
// pas de 1 AVEC re-balayage à chaque tour : un seul appui enchaîne toute la
// cascade — chaque achat qui franchit un palier d'unlock (unlockBuilding) rend le
// bâtiment suivant achetable dans la MÊME passe, sans avoir à ré-appuyer. Les
// bâtiments encore verrouillés par leur ère (unlockCycles non atteint) restent,
// eux, hors de portée : on ne peut pas encore les bâtir. Un seul render() à la
// fin. Refuse en pleine crise (crisisOpen). Respecte le verrou de catégorie de
// Babel. Retourne le nombre de bâtiments érigés.
export function buyAllAffordable() {
  if (crisisOpen()) return 0;
  const babelLock = isMythEffectActive("mythe_de_babel") ? state.babelCategory : null;

  let bought = 0;
  while (bought < BUY_ALL_MAX_ITERS) {
    // Re-balayage de TOUS les bâtiments à chaque tour : buyableInMass relit
    // isUnlocked, donc un bâtiment débloqué par l'achat précédent entre aussitôt
    // dans la sélection (cascade). On retient l'unité la PLUS chère réellement
    // payable (toutes devises via canPayCost).
    let best = null;
    let bestKey = null;
    for (const b of buildings) {
      if (!buyableInMass(b)) continue;
      if (babelLock && b.category !== babelLock) continue;
      const cost1 = buildingBatchCost(b, 1);
      if (!canPayCost(cost1)) continue;
      const key = cost1[b.currency];
      if (best === null || key.gt(bestKey)) {
        best = b;
        bestKey = key;
      }
    }
    if (!best) break;                                   // plus rien d'abordable
    if (!buyBuildingCore(best.id, { amount: 1, silent: true })) break;
    bought += 1;
  }

  if (bought > 0) {
    pushOutcomeFloat({ label: tr({ fr: `🏗️ +${fmt(bought)} bâtiments`, en: `🏗️ +${fmt(bought)} buildings` }), kind: "gain" });
    chronicle(tr({
      fr: `Un vaste programme de construction érige ${fmt(bought)} bâtiments d'un seul élan.`,
      en: `A vast building program raises ${fmt(bought)} buildings in a single sweep.`
    }));
    enforceInfrastructureCap();
    invalidateRenderCache("buildings");
    render();
  }
  return bought;
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
