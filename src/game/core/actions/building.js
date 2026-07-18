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
  grandResetMilestone,
  isGrandResetMilestoneClaimable,
  isGrandResetMilestoneClaimed,
  buildingMilestoneInfo,
  milestoneStepSize,
  ruinNodeCost,
  rates,
  cityVitals,
  pressureBreakdown
} from '../mechanics.js';

import { openChoiceDialog } from '../events.js';
import { pushOutcomeFloat } from '../outcomeFloat.js';
import { clamp, clamp01, canPayCost, payCost, fmt } from '../utils.js';
import { D } from '../num.js';
import { tr } from '../i18n.js';
import { buildings } from '../../data/buildings.js';
import { MILESTONE_BOON_SECONDS, grandResetProductionMult } from '../balance.js';
import { SISYPHE_MULT_PER_PURCHASE, PROMETHEE_RUPTURE_PER_FOOD, isMythEffectActive } from '../../data/myths.js';
import { chronicleBuilding, chronicle, log } from './utils.js';
import { resetAnnals } from '../annals.js';
import { resetCameraCenter } from '../../map/cityMapBridge.js';
import { recordGrPerformed } from '../chronicleStats.js';

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
  const milestoneStep = milestoneStepSize(); // 25, ou 20 avec « Ville-Monde »
  const previousMilestone = Math.floor(previousCount / milestoneStep);
  const currentMilestone = Math.floor(state.buildings[id] / milestoneStep);
  if (currentMilestone > previousMilestone && !silent) {
    // B1 — Float doré de palier : récompense visible à chaque tranche.
    const info = buildingMilestoneInfo(building, state.buildings[id]);
    pushOutcomeFloat({ label: `⭐ ${tr(building.name)} ×${fmt(info ? info.bonus : 1)}`, kind: "gain" });
    // « Fêtes de jalon » : le jalon franchi déclenche une aubaine dorée.
    if (has("fetes_jalon")) fireMilestoneBoon(building);
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

// « Fêtes de jalon » : crédite N secondes de la production courante de la
// ressource DOMINANTE du bâtiment fêté (même ancrage « secondes de prod » que
// les aubaines B2 — pertinent à toute échelle).
function fireMilestoneBoon(building) {
  const outputs = [
    ["food", building.food || 0],
    ["gold", building.gold || 0],
    ["knowledge", building.knowledge || 0],
    ["infrastructure", building.infra || 0],
    ["population", building.pop || 0]
  ];
  const main = outputs.reduce((best, cur) => (cur[1] > best[1] ? cur : best));
  const res = main[1] > 0 ? main[0] : "gold";
  const gain = D(rates()[res]).max(0).mul(MILESTONE_BOON_SECONDS).floor();
  if (gain.lte(0)) return;
  state[res] = D(state[res]).add(gain);
  pushOutcomeFloat({ label: `🎉 Fête de jalon : +${fmt(gain)}`, kind: "gain" });
  chronicle(tr({
    fr: `La cité fête le jalon des ${tr(building.name)} : les célébrations rapportent +${fmt(gain)}.`,
    en: `The city celebrates the ${tr(building.name)} milestone: the festivities yield +${fmt(gain)}.`
  }));
}

// ── Raccourci « Tout acheter » (touche E) ────────────────────────────────────
// Catégories concernées : les 3 onglets de la boutique (Moteurs / Savoir / Infra).
const BUY_ALL_CATEGORIES = new Set(["city", "knowledge", "infra"]);
// Libellés d'onglet, pour le retour visuel d'un achat de masse ciblé sur UNE
// catégorie (raccourcis M / S / I). Mêmes intitulés que les onglets de la boutique.
const BUY_ALL_CATEGORY_LABELS = {
  city: { fr: "Moteurs", en: "Engines" },
  knowledge: { fr: "Savoir", en: "Knowledge" },
  infra: { fr: "Infrastructure", en: "Infrastructure" }
};
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
// pas de 1 AVEC re-balayage à chaque tour : l'ordre « plus cher d'abord » peut
// changer après chaque achat (les coûts croissent avec le compteur), donc on
// re-sélectionne à chaque pas. Les bâtiments verrouillés par leur ère
// (unlockCycles) ou pas encore révélés par l'économie (apparition via
// cyclePeaks, cf. isUnlocked) restent hors de portée. Un seul render() à la
// fin. Refuse en pleine crise (crisisOpen). Respecte le verrou de catégorie de
// Babel. Retourne le nombre de bâtiments érigés.
//   - category : quand fourni ("city" | "knowledge" | "infra"), restreint l'achat
//     de masse à ce SEUL onglet (raccourcis M / S / I) ; null = les trois (touche E).
export function buyAllAffordable(category = null) {
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
      if (category && b.category !== category) continue; // achat ciblé sur un onglet
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
    const catLabel = category ? BUY_ALL_CATEGORY_LABELS[category] : null;
    pushOutcomeFloat({
      label: catLabel
        ? `🏗️ +${fmt(bought)} ${tr(catLabel)}`
        : tr({ fr: `🏗️ +${fmt(bought)} bâtiments`, en: `🏗️ +${fmt(bought)} buildings` }),
      kind: "gain"
    });
    chronicle(catLabel
      ? tr({
          fr: `Un programme de construction érige ${fmt(bought)} bâtiments (${tr(catLabel)}) d'un seul élan.`,
          en: `A building program raises ${fmt(bought)} ${tr(catLabel)} buildings in a single sweep.`
        })
      : tr({
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
  // Compteur d'exhumations du cycle (1 de base, 3 avec « Chantiers de fouilles »).
  state.archaeologyUses = (state.archaeologyUses || 0) + 1;
  enforceInfrastructureCap();
  invalidateRenderCache("buildings");
  chronicle(`Nos archéologues ont exhumé les ruines de : ${tr(target.name)}. Ses fondations antiques ont été restaurées.`);
  render();
}

export async function performGrandReset(gr) {
  if (collapseInProgress || gamePaused) return;
  const milestone = grandResetMilestone(gr);
  if (!milestone) return;
  // ORDRE-LIBRE : on réclame le sceau `gr` s'il est réclamable (banké + non réclamé
  // + — pour le Ragnarök — héritage acquis). Sa condition a pu retomber depuis le
  // latch (banking) : c'est grRevealed qui fait foi, pas la condition à l'instant.
  if (!isGrandResetMilestoneClaimable(gr)) {
    if (isGrandResetMilestoneClaimed(gr)) {
      log(`Le sceau « ${tr(milestone.name)} » est déjà réclamé.`);
    } else if (gr === 11 && !state.ragnarokHeritage) {
      log(`Le sceau du Ragnarök exige d'avoir honoré le pacte final avant d'être réclamé.`);
    } else {
      log(`Le sceau « ${tr(milestone.name)} » n'est pas encore débloqué. Fais grandir ta civilisation pour l'atteindre.`);
    }
    render();
    return;
  }
  const nextCount = (state.grandResetCount || 0) + 1;
  const isRagnarok = gr === 11;
  setGamePaused(true);
  const resetRewardText = isRagnarok
    ? "un multiplicateur permanent x4 supplémentaire sur les Ruines gagnées"
    : `un bonus permanent x${grandResetProductionMult(nextCount).toFixed(0)} sur toute la production et les Ruines gagnées`;
  const choice = await openChoiceDialog({
    title: `Grand Reset — ${tr(milestone.name)}`,
    body: `Tu réclames le sceau « ${tr(milestone.name)} ». Tout sera effacé : bâtiments, ruines, upgrades, cycles. En échange : ${resetRewardText}. Actuellement : x${grandResetProductionMult(state.grandResetCount).toFixed(0)} production. Après : x${grandResetProductionMult(nextCount).toFixed(0)} production.`,
    options: [
      { label: "Réclamer le sceau", detail: isRagnarok ? "+x4 Ruines permanent" : `+x${grandResetProductionMult(nextCount).toFixed(0)} production permanente` },
      { label: "Annuler", detail: "Ne rien faire" }
    ]
  });
  if (choice.label === "Annuler") { setGamePaused(false); return; }

  setMourning(true);
  await new Promise((resolve) => setTimeout(resolve, 1300));

  // Registre de la Chronique : horodatage (horloge à vie) du GR effectué —
  // gravé AVANT le clone, pour que buildGrandResetState l'emporte dans le state
  // frais (chronicleStats est éternel, cf. GR_PERSISTENT_FIELDS).
  recordGrPerformed(nextCount);

  // Marque le sceau réclamé sur le state COURANT avant le clone : buildGrandResetState
  // recopie grClaimed (GR_PERSISTENT_FIELDS) dans le state frais et fixe
  // grandResetCount = nextCount (= |grClaimed|). SOURCE DE VÉRITÉ : GR_PERSISTENT_FIELDS.
  if (!state.grClaimed) state.grClaimed = {};
  state.grClaimed[gr] = true;

  const fresh = buildGrandResetState(nextCount);

  setState(fresh);
  // Le buffer d'annales (module-scope) survivrait au swap d'état : on l'efface
  // — la courbe de Régulation repart avec la nouvelle lignée.
  resetAnnals();

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
  if (!upgrade) return false;
  if (!canBuyUpgrade(upgrade)) return false;
  // Nœuds de ruines : coût EFFECTIF (remise « Grammaire des ruines »).
  if (upgrade.group === "ruins") payCost({ ruins: ruinNodeCost(upgrade) });
  else payCost(upgrade.cost);
  state.upgrades[id] = true;
  state.lifetimePurchases = (state.lifetimePurchases || 0) + 1;
  renderCache.cachedRuinEffects = null;
  renderCache.cachedRuinEffectsSignature = "";
  invalidateRenderCache("all");
  chronicle(`Nos dirigeants ont décrété une nouvelle avancée pour la cité : ${upgrade.name}.`);
  render();
  return true;
}

export function rewardCitizenThought(thoughtType, citizen) {
  // Récompense indexée sur la PRODUCTION nette courante, pas sur le stock :
  // l'équilibrage vit dans les taux (l'ancien « 5 % du stock » devenait
  // dérisoire ou démesuré selon la phase). Un clic ≈ 90 s de production de la
  // ressource ; forfait plancher quand elle ne produit pas encore (ou plus).
  const r = rates(cityVitals(), pressureBreakdown());
  const gainOf = (rate, floor) => D(rate).max(0).mul(90).ceil().max(floor);
  let rewardText;
  if (thoughtType === "lightning") {
    const gain = gainOf(r.gold, 5);
    state.gold = D(state.gold).add(gain);
    rewardText = `+${fmt(gain)} Or`;
    log(`Aubaine : ${citizen.name} verse sa bonne fortune au trésor (+${fmt(gain)} Or).`);
  } else if (thoughtType === "scroll") {
    const gain = gainOf(r.knowledge, 15);
    state.knowledge = D(state.knowledge).add(gain);
    rewardText = `+${fmt(gain)} Savoir`;
    log(`Trouvaille : ${citizen.name} dépose un parchemin aux archives (+${fmt(gain)} Savoir).`);
  } else {
    const gain = gainOf(r.food, 10);
    state.food = D(state.food).add(gain);
    rewardText = `+${fmt(gain)} Nourriture`;
    log(`Offrande : ${citizen.name} partage sa récolte avec la cité (+${fmt(gain)} Nourriture).`);
  }
  save();
  render();
  return rewardText;
}
