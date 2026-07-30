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
  stepBuyAmount,
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
  selectClaimableSeals,
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
import { MILESTONE_BOON_SECONDS, MAX_BATCH_AMOUNT, grandResetProductionMult, grandResetRuinGainMult, ROAD_WORK_QUEUE_MAX, ROAD_WORKS_BANK_MAX } from '../balance.js';
import { PROMETHEE_RUPTURE_PER_FOOD, isMythEffectActive } from '../../data/myths.js';
import { hasActiveRuin, ACTIVE_RUIN_SISYPHE_CREEP } from '../../data/activeRuins.js';
import { chronicleBuilding, chronicle, log } from './utils.js';
import { resetAnnals } from '../annals.js';
import { resetCameraCenter } from '../../map/cityMapBridge.js';
import { recordGrPerformed } from '../chronicleStats.js';
import { purgeIcarusFlight } from './icarus.js';
import { purgeBlackjackHand } from './blackjack.js';
import { buyRoadWorkCore } from './roadWorks.js';

// Retourne le résultat de buyBuildingCore (true = achat effectué) : permet aux
// appelants — et aux tests — de distinguer un achat réel d'un refus (verrou
// Babel, coût impayable, id inconnu).
export function buyBuilding(id) {
  const bought = buyBuildingCore(id);
  if (bought) {
    invalidateRenderCache("buildings");
    render();
  }
  return bought;
}

// Cœur d'achat SANS invalidation ni render : payer, incrémenter, appliquer tous
// les effets de bord (paliers, Sisyphe, Prométhée, lifetimePurchases, chronique).
// Retourne true si l'achat a bien eu lieu. Partagé par buyBuilding (1 achat +
// render immédiat) et buyAllAffordable (boucle de masse, un seul render en fin).
//   - amount : quantité forcée ; par défaut lit state.buyAmount (x1..x100/Max).
//   - silent : coupe le retour visuel par-achat (float doré de palier + chronique),
//     agrégé en un seul récapitulatif par l'appelant lors d'un achat de masse.
export function buyBuildingCore(id, { amount: amountOverride = null, silent = false } = {}) {
  const building = buildingById[id];
  if (!building) return false;
  // Les routes ne s'achètent plus au compteur : tout chemin d'achat (clavier,
  // automation, boutique) débouche sur le CHANTIER de voirie — un seul par clic,
  // au coût du chantier, mis en file. Cf. actions/roadWorks.js.
  if (id === "roads") return buyRoadWorkCore();
  if (isMythEffectActive("mythe_de_babel") && state.babelCategory && building.category !== state.babelCategory) return false;
  // state.buyAmount est la source de vérité : la variable module exportée par
  // state.js n'est pas resynchronisée par setState (Grand Reset, import de save).
  // 'max' et 'step' sont des SENTINELLES résolues par bâtiment : les faire passer
  // par le clamp numérique ci-dessous les ramènerait silencieusement à 1.
  const amount = amountOverride != null
    ? amountOverride
    : state.buyAmount === "max" ? maxBuyAmount(building)
      : state.buyAmount === "step" ? stepBuyAmount(building)
        : clamp(Math.floor(Number(state.buyAmount) || 1), 1, MAX_BATCH_AMOUNT);
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
    // « La Montée » : bâtir pendant la montée LÂCHE le rocher — retour au pied,
    // prix de matière remis à la base. Au pied (cran 0), on construit librement :
    // c'est le rythme voulu du défi (préparer en bas, pousser d'une traite).
    if ((state.sisypheCran || 0) > 0) {
      state.sisypheCran = 0;
      state.sisypheUsages = { food: 0, knowledge: 0, infrastructure: 0 };
      log("Sisyphe : les mains quittent le rocher — il dévale jusqu'au pied de la pente.");
    }
  } else if (hasActiveRuin(state, "sisyphe")) {
    // Ruine active « Pente du rocher » : la malédiction cumulative de l'ANCIEN
    // Sisyphe survit dans le fardeau (state.sisypheMult, lu par cost.js).
    state.sisypheMult = (state.sisypheMult || 1) * ACTIVE_RUIN_SISYPHE_CREEP;
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
export const BUY_ALL_CURRENCIES = new Set(["food", "gold", "knowledge", "infrastructure"]);
// Garde-fou dur contre toute boucle pathologique (coût ~nul via discounts extrêmes).
// Jamais atteint en pratique : les coûts explosent géométriquement (scale^count).
const BUY_ALL_MAX_ITERS = 10000;

// Exportée pour BuildingShop.jsx (délai avant achat, B5), qui a besoin EXACTEMENT
// de la même garde : ce qui ne s'achète pas en masse n'entre pas dans le délai.
export function buyableInMass(building) {
  // Voirie : hors du GLOUTON (son prix ne rentre pas dans l'ordre « plus cher
  // d'abord ») et du délai B5 — mais « Tout acheter » la sert quand même par
  // son propre guichet (file + réserve), cf. buyAllAffordable.
  if (building.id === "roads") return false;
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

  // VOIRIE (Raph 2026-07-29 : « branche le raccourci Tout acheter ») : les
  // chantiers passent par leur propre guichet, hors du glouton — buyRoadWorkCore
  // borne tout (file de ROAD_WORK_QUEUE_MAX, réserve plafonnée), la boucle
  // s'arrête donc d'elle-même. La rangée vit dans l'onglet Infrastructure et
  // respecte le verrou de Babel comme les autres.
  let works = 0;
  if ((!category || category === "infra") && (!babelLock || babelLock === "infra")) {
    while (works < ROAD_WORK_QUEUE_MAX + ROAD_WORKS_BANK_MAX && buyRoadWorkCore()) works += 1;
  }

  if (bought > 0 || works > 0) {
    const catLabel = category ? BUY_ALL_CATEGORY_LABELS[category] : null;
    const worksFr = works > 0 ? ` · +${fmt(works)} chantier${works > 1 ? "s" : ""}` : "";
    const worksEn = works > 0 ? ` · +${fmt(works)} work site${works > 1 ? "s" : ""}` : "";
    pushOutcomeFloat({
      label: bought > 0
        ? (catLabel
          ? `🏗️ +${fmt(bought)} ${tr(catLabel)}${tr({ fr: worksFr, en: worksEn })}`
          : tr({ fr: `🏗️ +${fmt(bought)} bâtiments${worksFr}`, en: `🏗️ +${fmt(bought)} buildings${worksEn}` }))
        : tr({ fr: `🏗️ +${fmt(works)} chantiers de voirie`, en: `🏗️ +${fmt(works)} road work sites` }),
      kind: "gain"
    });
    if (bought > 0) chronicle(catLabel
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
  return bought + works;
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
    options: [
      // options[0] = défaut sûr : Échap (ou un clic) renonce au lieu de payer et
      // d'exhumer le premier candidat (coût savoir ≥ 25000, ∝ population).
      { label: "Renoncer", detail: "Ne rien exhumer" },
      ...candidates.map((b) => ({
        label: tr(b.name),
        detail: tr(b.desc),
        buildingId: b.id
      }))
    ]
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

// ORDRE-LIBRE + LOT. `gr` accepte un numéro de sceau ou une LISTE de sceaux à
// réclamer d'un coup. Réclamer N sceaux dans un même reset donne exactement le
// même résultat que N resets d'affilée (grandResetCount monte de N, donc x2^N) :
// le lot n'est qu'un confort quand plusieurs sceaux sont prêts, il ne saute
// aucune étape et n'accorde aucun bonus supplémentaire.
export async function performGrandReset(gr) {
  if (collapseInProgress || gamePaused) return;
  // On ne garde que les sceaux réclamables (bankés + non réclamés + — pour le
  // Ragnarök — héritage acquis). Leur condition a pu retomber depuis le latch :
  // c'est grRevealed qui fait foi, pas la condition à l'instant.
  const seals = selectClaimableSeals(gr);
  if (!seals.length) {
    const first = Number(Array.isArray(gr) ? gr[0] : gr);
    const milestone = grandResetMilestone(first);
    if (!milestone) return;
    if (isGrandResetMilestoneClaimed(first)) {
      log(`Le sceau « ${tr(milestone.name)} » est déjà réclamé.`);
    } else if (first === 11 && !state.ragnarokHeritage) {
      log(`Le sceau du Ragnarök exige d'avoir honoré le pacte final avant d'être réclamé.`);
    } else {
      log(`Le sceau « ${tr(milestone.name)} » n'est pas encore débloqué. Fais grandir ta civilisation pour l'atteindre.`);
    }
    render();
    return;
  }
  const names = seals.map((n) => `« ${tr(grandResetMilestone(n).name)} »`);
  const nextCount = (state.grandResetCount || 0) + seals.length;
  const isRagnarok = seals.includes(11);
  setGamePaused(true);
  // Production et moisson de Ruines ont des bases DISTINCTES : le dialogue
  // annonce les deux séparément, sinon il ment sur l'une des deux. Le x4 du
  // Ragnarök s'AJOUTE aux deux (il ne les remplace pas).
  const resetRewardText = `un bonus permanent x${fmt(grandResetProductionMult(nextCount))} sur toute la production, et x${fmt(grandResetRuinGainMult(nextCount))} sur les Ruines gagnées${isRagnarok ? ", plus le x4 Ruines du Ragnarok" : ""}`;
  const sealText = seals.length === 1
    ? `Tu réclames le sceau ${names[0]}.`
    : `Tu réclames ${seals.length} sceaux d'un coup : ${names.join(", ")}.`;
  const choice = await openChoiceDialog({
    title: `Grand Reset — ${seals.length === 1 ? tr(grandResetMilestone(seals[0]).name) : `${seals.length} sceaux`}`,
    body: `${sealText} Tout sera effacé : bâtiments, ruines, upgrades, cycles. En échange : ${resetRewardText}. Actuellement : x${fmt(grandResetProductionMult(state.grandResetCount))} production. Après : x${fmt(grandResetProductionMult(nextCount))} production.`,
    // preventClose : un Grand Reset est irréversible (efface tout). Échap ne
    // doit pas pouvoir déclencher options[0], qui est l'action destructrice — le
    // joueur choisit explicitement. Sûr depuis le fix B2 (ChoiceDialog).
    preventClose: true,
    options: [
      {
        label: seals.length === 1 ? "Réclamer le sceau" : `Réclamer les ${seals.length} sceaux`,
        detail: `+x${fmt(grandResetProductionMult(nextCount))} production permanente${isRagnarok ? " & x4 Ruines" : ""}`
      },
      { label: "Annuler", detail: "Ne rien faire" }
    ]
  });
  if (choice.label === "Annuler") { setGamePaused(false); return; }

  setMourning(true);
  await new Promise((resolve) => setTimeout(resolve, 1300));

  // Registre de la Chronique : horodatage (horloge à vie) des GR effectués —
  // gravé AVANT le clone, pour que buildGrandResetState l'emporte dans le state
  // frais (chronicleStats est éternel, cf. GR_PERSISTENT_FIELDS).
  // Marque les sceaux réclamés sur le state COURANT avant le clone : buildGrandResetState
  // recopie grClaimed (GR_PERSISTENT_FIELDS) dans le state frais et fixe
  // grandResetCount = nextCount (= |grClaimed|). SOURCE DE VÉRITÉ : GR_PERSISTENT_FIELDS.
  if (!state.grClaimed) state.grClaimed = {};
  for (const n of seals) {
    recordGrPerformed(n); // le n° du SCEAU réclamé (comme recordGrDiscovered), pas le rang nextCount
    state.grClaimed[n] = true;
  }

  const fresh = buildGrandResetState(nextCount, seals);

  setState(fresh);
  // Le buffer d'annales (module-scope) survivrait au swap d'état : on l'efface
  // — la courbe de Régulation repart avec la nouvelle lignée.
  resetAnnals();
  // Idem pour les états module des jeux du temple : un vol d'Icare (avec son timer)
  // ou une main de vingt-et-un qui survivraient au reset se résoudraient contre la
  // cité FRAÎCHE, mintant de la Faveur depuis une mise effacée (M-temple de l'audit).
  purgeIcarusFlight();
  purgeBlackjackHand();

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
