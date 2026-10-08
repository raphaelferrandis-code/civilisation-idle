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
  dominantBuildingCategory,
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
import { hasActiveRuin, ACTIVE_RUIN_SISYPHE_CREEP, ACTIVE_RUIN_SISYPHE_MULT_CAP } from '../../data/activeRuins.js';
import { chronicleBuilding, chronicle, log, onUpgradeAcquired } from './utils.js';
import { resetAnnals } from '../annals.js';
import { resetCameraCenter } from '../../map/cityMapBridge.js';
import { recordGrPerformed, recordShopSpend } from '../chronicleStats.js';
import { purgeIcarusFlight } from './icarus.js';
import { purgeBlackjackHand } from './blackjack.js';
import { buyRoadWorkCore } from './roadWorks.js';
import { annoncer } from '../../audio/moments/annonces.js';

// Retourne le résultat de buyBuildingCore (true = achat effectué) : permet aux
// appelants — et aux tests — de distinguer un achat réel d'un refus (verrou
// Babel, coût impayable, id inconnu).
export function buyBuilding(id) {
  const bought = buyBuildingCore(id);
  if (bought) {
    invalidateRenderCache("buildings");
    render();
    // Un achat à la main : la maison qui sort de terre aura son son (audio/moments).
    annoncer('achat', { id });
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
//   - auto : achat d'un automate d'Héphaïstos. Ne change AUCUNE règle (il lâche
//     le rocher comme une main, M5) : seul le journal dit qui l'a lâché.
export function buyBuildingCore(id, { amount: amountOverride = null, silent = false, auto = false } = {}) {
  // GEL MOTEUR (audit 2026-10-05, BUG-71) : dialogue en pause, deuil et chute
  // (gamePaused / collapseInProgress), crise terminale. Seule l'interface le
  // tenait : pendant le deuil d'un Édit on achetait avec des ressources vouées
  // à la perte (que Racine-mère gardait), et un raccourci passait sous une
  // modale de crise. Couvre aussi la voirie, redirigée plus bas.
  if (gamePaused || collapseInProgress || state.crisisLimitAnnounced) return false;
  const building = buildingById[id];
  if (!building) return false;
  // Verrou de Babel AVANT la redirection de la voirie : placé après, il laissait
  // poser des chantiers (et toucher le bonus réseau) sous une langue qui
  // interdit l'Infrastructure (audit 2026-10-05, BUG-24).
  if (isMythEffectActive("mythe_de_babel") && state.babelCategory && building.category !== state.babelCategory) return false;
  // Les routes ne s'achètent plus au compteur : tout chemin d'achat (clavier,
  // automation, boutique) débouche sur le CHANTIER de voirie — un seul par clic,
  // au coût du chantier, mis en file. Cf. actions/roadWorks.js.
  if (id === "roads") return buyRoadWorkCore();
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
      // Un automate qui bâtit lâche le rocher au tick suivant la poussée : sans
      // le dire, le joueur le voyait redévaler sans cause, essai après essai
      // (audit 2026-10-05, BUG-77).
      log(auto
        ? tr({
            fr: "Sisyphe : un automate a bâti — le rocher dévale jusqu'au pied de la pente.",
            en: "Sisyphus: an automaton built — the boulder rolls back to the foot of the slope."
          })
        : tr({
            fr: "Sisyphe : les mains quittent le rocher — il dévale jusqu'au pied de la pente.",
            en: "Sisyphus: his hands slip from the boulder — it rolls back to the foot of the slope."
          }));
    }
  } else if (hasActiveRuin(state, "sisyphe")) {
    // Ruine active « Pente du rocher » : la malédiction cumulative de l'ANCIEN
    // Sisyphe survit dans le fardeau (state.sisypheMult, lu par cost.js). Un cran
    // PAR UNITÉ, plus par appel : un Max de 100 inflait comme un seul achat (audit
    // 2026-10-05, BUG-35) ; le prix du lot suit la même pente (cost.js). Plafonné.
    state.sisypheMult = Math.min(ACTIVE_RUIN_SISYPHE_MULT_CAP,
      (state.sisypheMult || 1) * Math.pow(ACTIVE_RUIN_SISYPHE_CREEP, amount));
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
  pushOutcomeFloat({ label: tr({ fr: `🎉 Fête de jalon : +${fmt(gain)}`, en: `🎉 Milestone feast: +${fmt(gain)}` }), kind: "gain" });
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
// ATTEINT en fin de partie (audit 2026-10-05, BUG-79) : les coûts explosent
// géométriquement (scale^count), mais une chute à ressources ~1e60 et plus laisse
// une pression sur E acheter 10 000 bâtiments d'un trait (0,4 s en test, 1,5 à
// 2,1 s mesurés en jeu), et il en reste d'abordables. D'où, pour le clavier et le
// bouton, la passe EN TRANCHES (buyAllAffordableChained) ; ce plafond ne borne
// plus que l'appel synchrone (simulation, harnais, tests).
const BUY_ALL_MAX_ITERS = 10000;
// Passe en tranches (décision de Raph sur BUG-79 : c) : ~16 ms d'achats par
// image, enchaînées d'une image à l'autre. Le plafond d'unités ne sert plus que
// contre la boucle pathologique : une vraie fin de partie en demande des
// dizaines de milliers (coûts en scale^count, ressources en e2000 et plus).
const BUY_ALL_SLICE_MS = 16;
const BUY_ALL_MAX_UNITS = 1_000_000;

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
// pas de 1 : le plus cher payable, unité après unité tant qu'il le reste, puis
// re-balayage pour le suivant (les coûts croissent avec le compteur et la
// caisse baisse). Les bâtiments verrouillés par leur ère
// (unlockCycles) ou pas encore révélés par l'économie (apparition via
// cyclePeaks, cf. isUnlocked) restent hors de portée. Un seul render() à la
// fin. Refuse en pleine crise (crisisOpen). Respecte le verrou de catégorie de
// Babel. Retourne le nombre de bâtiments érigés.
//   - category : quand fourni ("city" | "knowledge" | "infra"), restreint l'achat
//     de masse à ce SEUL onglet (raccourcis M / S / I) ; null = les trois (touche E).
// Appel SYNCHRONE (simulation, harnais, tests) ; le clavier et le bouton passent
// par buyAllAffordableChained, la même chose en tranches.
export function buyAllAffordable(category = null) {
  if (buyAllFrozen()) return 0;
  const { bought } = buyAllGreedy(category, BUY_ALL_MAX_ITERS);
  const works = buyAllRoadWorks(category);
  concludeBuyAll(category, bought, works);
  return bought + works;
}

// Passe EN COURS du clavier ou du bouton : une seule à la fois.
let buyAllChain = null;

// « Tout acheter » du CLAVIER (E, M, S, I) et du bouton de la Cité (décision de
// Raph sur BUG-79 : c). Même glouton, même ordre d'achats, mais par tranches de
// ~16 ms enchaînées d'une image à l'autre jusqu'à ce que plus rien ne soit
// abordable : une pression achète TOUT, sans le gel de 1,5 à 2,1 s d'une fin de
// partie. Le gel moteur est revérifié à chaque tranche (une crise, une chute, un
// dialogue arrivés entre deux images arrêtent la passe), et UN seul float, UNE
// seule ligne de Chronique disent le total à la fin. La passe s'arrête dès
// qu'une tranche finit avant son horloge : sinon la production de chaque image
// la ferait tourner sans fin, comme un automate. Une pression pendant une passe
// ne la relance pas. Rend false si rien n'a été lancé.
export function buyAllAffordableChained(category = null) {
  if (buyAllChain || buyAllFrozen()) return false;
  const chain = { bought: 0 };
  buyAllChain = chain;
  const finish = (frozen) => {
    buyAllChain = null;
    concludeBuyAll(category, chain.bought, frozen ? 0 : buyAllRoadWorks(category));
  };
  const step = () => {
    if (buyAllFrozen()) { finish(true); return; }
    const { bought, done } = buyAllGreedy(category, BUY_ALL_MAX_UNITS - chain.bought, nowMs() + BUY_ALL_SLICE_MS);
    chain.bought += bought;
    if (done || chain.bought >= BUY_ALL_MAX_UNITS) { finish(false); return; }
    // Les achats comptent dès le tick qui suit (sommes de bâtiments, débits).
    invalidateRenderCache("buildings");
    nextFrame(step);
  };
  step();
  return true;
}

const nowMs = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

// Image suivante : requestAnimationFrame, ou un délai nul hors navigateur et
// onglet caché (rAF y est suspendu : la passe attendrait le retour du joueur).
function nextFrame(fn) {
  if (typeof requestAnimationFrame === "function" && !(typeof document !== "undefined" && document.hidden)) requestAnimationFrame(fn);
  else setTimeout(fn, 0);
}

// Même gel moteur que buyBuildingCore (BUG-71), plus la crise ouverte : sans
// lui, le glouton tournait à vide et les chantiers de voirie, eux, passaient.
function buyAllFrozen() {
  return gamePaused || collapseInProgress || state.crisisLimitAnnounced || crisisOpen();
}

// Le glouton seul, borné par `maxUnits` et par l'horloge (`deadline`, en
// performance.now()). Rend { bought, done } : done = plus rien d'abordable (ou
// un refus) ; faux quand une borne l'a coupé avant.
function buyAllGreedy(category, maxUnits, deadline = Infinity) {
  const babelLock = isMythEffectActive("mythe_de_babel") ? state.babelCategory : null;
  const babelRuin = hasActiveRuin(state, "babel");
  const timed = deadline !== Infinity;

  let bought = 0;
  while (bought < maxUnits) {
    if (timed && nowMs() >= deadline) return { bought, done: false };
    // Re-balayage de TOUS les bâtiments à chaque tour : buyableInMass relit
    // isUnlocked. On retient l'unité la PLUS chère réellement payable (toutes
    // devises via canPayCost).
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
    if (!best) return { bought, done: true };          // plus rien d'abordable
    const dominant = babelRuin ? dominantBuildingCategory() : null;
    if (!buyBuildingCore(best.id, { amount: 1, silent: true })) return { bought, done: true };
    bought += 1;
    // Le PLUS CHER LE RESTE tant qu'il est payable : son achat ne fait que monter
    // son propre prix (scale > 1) et ne baisse celui d'aucun autre — la Pente du
    // rocher les multiplie tous d'autant. Re-balayer après chaque unité
    // rechoisissait donc le même bâtiment : on enchaîne ses unités, une à une et
    // au même prix qu'avant (aucun lot en forme fermée), jusqu'au premier refus,
    // puis on re-balaie. Même suite d'achats au bit près, sans les B chiffrages
    // par unité : 0,3 à 0,9 s de gel par appui sur E en fin de partie (audit
    // 2026-10-05, PERF-16). Une exception : sous la Confusion des langues, la
    // bascule de la catégorie dominante ALLÈGE l'ancienne, dont un bâtiment plus
    // cher peut redevenir payable — on re-balaie dès qu'elle bascule. Un achat ne
    // révèle aucun bâtiment (les pics de cycle ne bougent qu'au tick).
    // (Coupé aussi par l'horloge d'une tranche : on reprend à l'image suivante.)
    while (bought < maxUnits
      && (!timed || nowMs() < deadline)
      && (!babelRuin || dominantBuildingCategory() === dominant)
      && buyBuildingCore(best.id, { amount: 1, silent: true })) bought += 1;
  }
  return { bought, done: false };
}

// VOIRIE (Raph 2026-07-29 : « branche le raccourci Tout acheter ») : les
// chantiers passent par leur propre guichet, hors du glouton — buyRoadWorkCore
// borne tout (file de ROAD_WORK_QUEUE_MAX, réserve plafonnée), la boucle
// s'arrête donc d'elle-même. La rangée vit dans l'onglet Infrastructure et
// respecte le verrou de Babel comme les autres.
function buyAllRoadWorks(category) {
  const babelLock = isMythEffectActive("mythe_de_babel") ? state.babelCategory : null;
  let works = 0;
  if ((!category || category === "infra") && (!babelLock || babelLock === "infra")) {
    while (works < ROAD_WORK_QUEUE_MAX + ROAD_WORKS_BANK_MAX && buyRoadWorkCore()) works += 1;
  }
  return works;
}

// Le retour d'un achat de masse : UN float, UNE ligne de Chronique, un render.
function concludeBuyAll(category, bought, works) {
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
    if (bought > 0) annoncer('achats', { n: bought });
  }
}

export async function exhumeVestige() {
  // Gel moteur (BUG-71) : une seconde modale ne s'ouvre pas sur une pause en cours.
  if (gamePaused || collapseInProgress) return;
  if (!canExhume()) return;
  const candidates = archaeologyCandidates();
  if (!candidates.length) return;
  const cost = archaeologyCost();

  setGamePaused(true);
  render();

  const choice = await openChoiceDialog({
    label: { fr: "Archéologie", en: "Archaeology" },
    title: tr({ fr: "Vestige archéologique", en: "Archaeological Vestige" }),
    body: tr({
      fr: `Coût : ${fmt(cost)} connaissance.\nQuel bâtiment vos archéologues ont-ils mis au jour ?`,
      en: `Cost: ${fmt(cost)} knowledge.\nWhich building have your archaeologists unearthed?`
    }),
    options: [
      // options[0] = défaut sûr : Échap (ou un clic) renonce au lieu de payer et
      // d'exhumer le premier candidat (coût savoir ≥ 25000, ∝ population).
      // La décision se lit sur `buildingId` (absent ici), jamais sur le libellé.
      { label: tr({ fr: "Renoncer", en: "Give up" }), detail: tr({ fr: "Ne rien exhumer", en: "Unearth nothing" }), cancel: true },
      ...candidates.map((b) => ({
        label: tr(b.name),
        detail: tr(b.desc),
        buildingId: b.id
      }))
    ]
  });

  setGamePaused(false);

  if (!choice?.buildingId || choice.cancel) { render(); return; }
  if (!canExhume()) { render(); return; }

  const target = buildingById[choice.buildingId];
  if (!target) { render(); return; }

  state.knowledge = D(state.knowledge).sub(cost);
  state.buildings[target.id] = (state.buildings[target.id] || 0) + 1;
  // Compteur d'exhumations du cycle (1 de base, 3 avec « Chantiers de fouilles »).
  state.archaeologyUses = (state.archaeologyUses || 0) + 1;
  enforceInfrastructureCap();
  invalidateRenderCache("buildings");
  chronicle(tr({
    fr: `Nos archéologues ont exhumé les ruines de : ${tr(target.name)}. Ses fondations antiques ont été restaurées.`,
    en: `Our archaeologists have unearthed the ruins of: ${tr(target.name)}. Its ancient foundations have been restored.`
  }));
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
      log(tr({
        fr: `Le sceau « ${tr(milestone.name)} » est déjà réclamé.`,
        en: `The “${tr(milestone.name)}” seal has already been claimed.`
      }));
    } else if (first === 11 && !state.ragnarokHeritage) {
      log(tr({
        fr: `Le sceau du Ragnarök exige d'avoir honoré le pacte final avant d'être réclamé.`,
        en: `The Ragnarök seal can only be claimed once the final pact has been honored.`
      }));
    } else {
      log(tr({
        fr: `Le sceau « ${tr(milestone.name)} » n'est pas encore débloqué. Fais grandir ta civilisation pour l'atteindre.`,
        en: `The “${tr(milestone.name)}” seal is not unlocked yet. Grow your civilization to reach it.`
      }));
    }
    render();
    return;
  }
  const names = seals.map((n) => tr(grandResetMilestone(n).name));
  const nextCount = (state.grandResetCount || 0) + seals.length;
  const isRagnarok = seals.includes(11);
  const prodNext = fmt(grandResetProductionMult(nextCount));
  const prodNow = fmt(grandResetProductionMult(state.grandResetCount));
  const ruinsNext = fmt(grandResetRuinGainMult(nextCount));
  setGamePaused(true);
  // Production et moisson de Ruines ont des bases DISTINCTES : le dialogue
  // annonce les deux séparément, sinon il ment sur l'une des deux. Le x4 du
  // Ragnarök s'AJOUTE aux deux (il ne les remplace pas).
  const resetRewardText = tr({
    fr: `un bonus permanent x${prodNext} sur toute la production, et x${ruinsNext} sur les Ruines gagnées${isRagnarok ? ", plus le x4 Ruines du Ragnarok" : ""}`,
    en: `a permanent x${prodNext} bonus to all production, and x${ruinsNext} on Ruins gained${isRagnarok ? ", plus Ragnarok's x4 Ruins" : ""}`
  });
  const sealText = seals.length === 1
    ? tr({ fr: `Tu réclames le sceau « ${names[0]} ».`, en: `You claim the “${names[0]}” seal.` })
    : tr({
        fr: `Tu réclames ${seals.length} sceaux d'un coup : ${names.map((name) => `« ${name} »`).join(", ")}.`,
        en: `You claim ${seals.length} seals at once: ${names.map((name) => `“${name}”`).join(", ")}.`
      });
  const choice = await openChoiceDialog({
    label: { fr: "Grand Reset", en: "Grand Reset" },
    title: seals.length === 1
      ? `Grand Reset — ${names[0]}`
      : tr({ fr: `Grand Reset — ${seals.length} sceaux`, en: `Grand Reset — ${seals.length} seals` }),
    body: tr({
      fr: `${sealText} Tout sera effacé : bâtiments, ruines, upgrades, cycles. En échange : ${resetRewardText}. Actuellement : x${prodNow} production. Après : x${prodNext} production.`,
      en: `${sealText} Everything will be erased: buildings, ruins, upgrades, cycles. In exchange: ${resetRewardText}. Currently: x${prodNow} production. After: x${prodNext} production.`
    }),
    // preventClose : un Grand Reset est irréversible (efface tout). Échap ne
    // doit pas pouvoir déclencher options[0], qui est l'action destructrice — le
    // joueur choisit explicitement. Sûr depuis le fix B2 (ChoiceDialog).
    preventClose: true,
    // La décision se lit sur les MARQUES `claim` / `cancel`, jamais sur le
    // libellé affiché : comparer « Annuler » faisait passer « Cancel » (version
    // anglaise) dans la branche « réclamer » — un Grand Reset irréversible au
    // lieu d'une annulation (audit 2026-10-05, I18N-3).
    options: [
      {
        label: seals.length === 1
          ? tr({ fr: "Réclamer le sceau", en: "Claim the seal" })
          : tr({ fr: `Réclamer les ${seals.length} sceaux`, en: `Claim the ${seals.length} seals` }),
        detail: tr({
          fr: `+x${prodNext} production permanente${isRagnarok ? " & x4 Ruines" : ""}`,
          en: `+x${prodNext} permanent production${isRagnarok ? " & x4 Ruins" : ""}`
        }),
        claim: true
      },
      { label: tr({ fr: "Annuler", en: "Cancel" }), detail: tr({ fr: "Ne rien faire", en: "Do nothing" }), cancel: true }
    ]
  });
  // Seule l'option marquée `claim` lance le reset : toute autre réponse (Annuler,
  // réponse vide) annule — l'erreur sûre pour un geste irréversible.
  if (!choice?.claim || choice.cancel) { setGamePaused(false); return; }

  setMourning(true);
  annoncer('sceau');
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
  annoncer('renouveau');
}

export function buyUpgrade(id) {
  if (gamePaused || collapseInProgress || state.crisisLimitAnnounced) return false; // gel moteur (BUG-71)
  const upgrade = upgradeById[id];
  if (!upgrade) return false;
  if (!canBuyUpgrade(upgrade)) return false;
  // Nœuds de ruines : coût EFFECTIF (remise « Grammaire des ruines »).
  if (upgrade.group === "ruins") payCost({ ruins: ruinNodeCost(upgrade) });
  else {
    payCost(upgrade.cost);
    // Héritages payés en FAVEUR (« comme tout à la Boutique », HeritageView) :
    // comptés au registre de la Chronique comme les autres achats de la
    // Boutique — c'en étaient les plus gros, et ils manquaient (BUG-69).
    if (upgrade.cost && upgrade.cost.faveur) recordShopSpend(upgrade.cost.faveur);
  }
  state.upgrades[id] = true;
  onUpgradeAcquired(id); // l'Édit arrive réglé sur « Durée » (BUG-78)
  state.lifetimePurchases = (state.lifetimePurchases || 0) + 1;
  renderCache.cachedRuinEffects = null;
  renderCache.cachedRuinEffectsSignature = "";
  invalidateRenderCache("all");
  chronicle(tr({
    fr: `Nos dirigeants ont décrété une nouvelle avancée pour la cité : ${tr(upgrade.name)}.`,
    en: `Our leaders have decreed a new advance for the city: ${tr(upgrade.name)}.`
  }));
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
    rewardText = tr({ fr: `+${fmt(gain)} Or`, en: `+${fmt(gain)} Treasury` });
    log(tr({
      fr: `Aubaine : ${citizen.name} verse sa bonne fortune au trésor (+${fmt(gain)} Or).`,
      en: `Windfall: ${citizen.name} pours their good fortune into the treasury (+${fmt(gain)} Treasury).`
    }));
  } else if (thoughtType === "scroll") {
    const gain = gainOf(r.knowledge, 15);
    state.knowledge = D(state.knowledge).add(gain);
    rewardText = tr({ fr: `+${fmt(gain)} Savoir`, en: `+${fmt(gain)} Knowledge` });
    log(tr({
      fr: `Trouvaille : ${citizen.name} dépose un parchemin aux archives (+${fmt(gain)} Savoir).`,
      en: `Discovery: ${citizen.name} leaves a scroll in the archives (+${fmt(gain)} Knowledge).`
    }));
  } else {
    const gain = gainOf(r.food, 10);
    state.food = D(state.food).add(gain);
    rewardText = tr({ fr: `+${fmt(gain)} Nourriture`, en: `+${fmt(gain)} Food` });
    log(tr({
      fr: `Offrande : ${citizen.name} partage sa récolte avec la cité (+${fmt(gain)} Nourriture).`,
      en: `Offering: ${citizen.name} shares their harvest with the city (+${fmt(gain)} Food).`
    }));
  }
  save();
  render();
  return rewardText;
}
