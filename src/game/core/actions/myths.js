"use strict";

import {
  state,
  gamePaused,
  collapseInProgress,
  defaultState,
  invalidateRenderCache,
  render,
  save,
  setGamePaused,
  resetTemporaryRunState
} from '../state.js';

import {
  computeStartFloor,
  enforceInfrastructureCap,
  rates as ratesFn
} from '../mechanics.js';

import { openChoiceDialog } from '../events.js';
import { COMPTOIR_LOT_SECONDS, COMPTOIR_BUY_MARKUP, COMPTOIR_SELL_RATE } from '../balance.js';
import {
  getMythById,
  isMythCompleted,
  isMythEffectActive,
  isMythUnlocked,
  checkActUnlocks,
  ICARE_CLIMB_RUPTURE,
  ATLAS_SHOULDER_TARGET,
  ATLAS_COUNT_THRESHOLD,
  ATLAS_SHOULDER_RELIEF,
  ATLAS_SHOULDER_CD_MS,
  SISYPHE_CRANS,
  SISYPHE_MONTEES_TARGET,
  SISYPHE_STEP_BASE,
  BABEL_CAT_LABELS,
  BABEL_COMMON_TONGUE_MULT,
  RAGNAROK_ID,
  RAGNAROK_ARK_TARGET,
  RAGNAROK_ARK_OFFERING_PROD_SEC,
  RAGNAROK_ARK_COOLDOWN_MS,
  OR_DEALS_TARGET,
  OR_DEAL_LOT_SECONDS,
  OR_DEAL_ASK_MARKUP,
  OR_DEAL_HAGGLE_STEP,
  OR_DEAL_PATIENCE_MIN,
  OR_DEAL_PATIENCE_MAX,
  ATRIDES_DEBT_PAYBACK_FACTOR,
  ATRIDES_RENEGOTIATE_COOLDOWN_MS,
  ATRIDES_RENEGOTIATE_DURATION_MS,
  ATRIDES_RENEGOTIATE_MULT,
  CADMOS_CYCLE_BONUS_PCT,
  CADMOS_MAX_PERMANENT_EPITAPHS,
  CADMOS_ORIENTATIONS
} from '../../data/myths.js';
import { clamp01, fmt, canPayCost, payCost } from '../utils.js';
import { tr } from '../i18n.js';
import { D } from '../num.js';
import { recordMythCompleted } from '../chronicleStats.js';
import { log, chronicle, resetCyclePeaks } from './utils.js';
import { pushOutcomeFloat } from '../outcomeFloat.js';
import {
  ACTIVE_RUIN_RUPTURE_START,
  ANTEE_MIN_ACTIVE_RUINS,
  unlockedActiveRuinDefinitions
} from '../../data/activeRuins.js';

// Sacre un Mythe RÉUSSI : marque accompli, enregistre à la Chronique, applique
// l'héritage, annonce. Partagé par les deux chemins de validation (vivant + chute).
function crownMyth(myth) {
  state.mythsCompleted[myth.id] = true;
  // Registre de la Chronique : instant d'accomplissement (horloge à vie),
  // durée du run gagnant (activation → maintenant) et ordre de sacre.
  recordMythCompleted(
    myth.id,
    myth.act,
    Math.max(0, (Date.now() - (state.cycleStartedAt || Date.now())) / 1000)
  );
  if (typeof myth.applyHeritage === "function") myth.applyHeritage();
  log(`Pacte honore: "${tr(myth.name)}". Heritage accorde: ${tr(myth.heritageDescription)}`);
  pushOutcomeFloat({ label: `⭐ ${tr({ fr: "Pacte honoré", en: "Pact honored" })} — ${tr(myth.name)}`, kind: "gain" });
  checkActUnlocks();
}

// Validation VIVANTE (décision Raph 2026-07-19) : un Mythe s'accomplit à l'INSTANT
// où son objectif est atteint — plus besoin d'effondrer pour sceller. La contrainte
// est levée dans la foulée (le pacte est honoré, le dieu se retire), ce qui rend
// aussi la main sur l'effondrement manuel qu'Atlas et Icare confisquaient.
// (L'exception `liftOnComplete: false` a disparu avec la refonte du Chaos
// 2026-07-20 : son héritage n'exige plus un cycle resté Chaos jusqu'à la chute.)
export function checkMythLiveCompletion() {
  if (!state.activeMythId || collapseInProgress) return;
  const myth = getMythById(state.activeMythId);
  if (!myth || typeof myth.onCollapse !== "function") return;
  if (isMythCompleted(myth.id)) return;
  if (!myth.onCollapse()) return;
  crownMyth(myth);
  state.activeMythId = null;
  save();
}

export function checkMythOnCollapse() {
  if (!state.activeMythId) return;
  const myth = getMythById(state.activeMythId);
  if (!myth) return;

  const success = typeof myth.onCollapse === "function" ? myth.onCollapse() : false;
  if (success && !isMythCompleted(myth.id)) {
    crownMyth(myth);
  } else if (!success && !isMythCompleted(myth.id)) {
    // Déjà sacré en vivant = pas un pacte brisé : ce log ne concerne que les
    // Mythes dont l'objectif n'a jamais été atteint sur le cycle.
    log(`Pacte brise: "${tr(myth.name)}" n'a pas ete honore ce cycle.`);
  }
}

export async function chooseActiveRuins({ required = false, title = "Ruines actives" } = {}) {
  const choices = unlockedActiveRuinDefinitions(state);
  if (!choices.length) {
    state.activeRuinIds = [];
    state.pendingActiveRuinsChoice = false;
    return [];
  }

  setGamePaused(true);
  render();
  const choice = await openChoiceDialog({
    title,
    // Le seuil est annoncé : sans lui, une sélection sous la barre est un échec
    // garanti que rien ne signale au joueur avant l'effondrement.
    body: required
      ? `Antée demande de porter vos Héritages comme des ruines vivantes. Sélectionnez les Héritages à activer avec leur malus pour ce cycle.\nIl en faut au moins ${ANTEE_MIN_ACTIVE_RUINS} portés simultanément pour que le Mythe puisse être accompli.`
      : "Vous pouvez volontairement activer certains Héritages comme Ruines actives pour augmenter les Ruines gagnées à l'effondrement.",
    variant: "active-ruins",
    preventClose: required,
    multiSelectOptions: choices.map((definition) => ({
      id: definition.id,
      label: `${definition.title} (${definition.source})${definition.pending ? " - slot futur" : ""}`,
      bonus: `Bonus: ${definition.bonus}`,
      malus: `Malus: ${definition.malus}`,
      disabled: Boolean(definition.pending)
    })),
    defaultSelectedIds: state.activeRuinIds || [],
    options: [
      {
        label: "Valider",
        detail: required ? `Sceller ces Ruines actives pour le cycle (${ANTEE_MIN_ACTIVE_RUINS} minimum).` : "Appliquer cette selection.",
        // Sous Antée, valider moins que le seuil est un échec garanti : on rend
        // le bouton inerte tant que la sélection n'y est pas.
        ...(required ? { minSelected: ANTEE_MIN_ACTIVE_RUINS } : {})
      },
      // « Aucune Ruine active » n'est proposé QUE hors Antée : sous le Mythe, c'est
      // un bouton perdant d'avance (0 fardeau < seuil).
      ...(required ? [] : [
        { label: "Aucune Ruine active", detail: "Cycle normal, sans multiplicateur de Ruines.", selectedIds: [] }
      ])
    ]
  });

  const selectedIds = choice.label === "Aucune Ruine active" ? [] : (choice.selectedIds || []);
  const allowedIds = new Set(choices.filter((definition) => !definition.pending).map((definition) => definition.id));
  state.activeRuinIds = selectedIds.filter((id, index, array) => allowedIds.has(id) && array.indexOf(id) === index);
  state.pendingActiveRuinsChoice = false;
  if (state.activeRuinIds.includes("enee")) {
    state.instability = clamp01((state.instability || 0) + ACTIVE_RUIN_RUPTURE_START);
  }
  // « Pacte signé d'office » : le joueur reçoit le doublement sans l'avoir demandé,
  // et donc la moitié pendant la crise. C'est le même appel que le bouton — le
  // fardeau n'est pas une taxe, c'est son propre pouvoir qui part sans lui.
  if (state.activeRuinIds.includes("atrides")) {
    activateAtridesPact();
  }
  invalidateRenderCache("all");
  save();
  render();
  return state.activeRuinIds;
}

export async function promptActiveRuinsForNewCycle() {
  if (!state.anteeHeritage || state.activeMythId || collapseInProgress) return;
  await chooseActiveRuins({
    required: false,
    title: "Choisir les Ruines actives"
  });
  setGamePaused(false);
  save();
  render();
}

function shuffleCadmosOrientations() {
  const orientations = Object.keys(CADMOS_ORIENTATIONS);
  const last = state.cadmosLastChosenOrientation;
  const shuffled = orientations
    .map((orientation) => ({ orientation, score: Math.random() + (orientation === last ? 1 : 0) }))
    .sort((a, b) => a.score - b.score)
    .map((entry) => entry.orientation);
  return shuffled.slice(0, 3);
}

function buildCadmosAgeOption(orientation, index, milestone) {
  const definition = CADMOS_ORIENTATIONS[orientation];
  const label = tr(definition.label);
  const article = tr(definition.article);
  // Mots résolus dans la langue courante : ils servent à la fois de clé interne
  // (dédup, cadmosRecentWords) et d'affichage — cohérents car la langue est figée
  // pour la session.
  const words = definition.words.map((w) => tr(w));
  const recentWords = new Set(state.cadmosRecentWords || []);
  const chosenNames = new Set((state.cadmosChronicle || []).map((entry) => entry.name));
  const candidates = words.filter((word) => !recentWords.has(word));
  const pool = candidates.length ? candidates : words;
  let word = pool[Math.floor(Math.random() * pool.length)] || words[0];
  let name = tr({ fr: `L'Âge ${article} ${word}`, en: `The Age of ${word}` });
  let guard = 0;
  while (chosenNames.has(name) && guard < words.length) {
    word = words[(words.indexOf(word) + 1 + guard) % words.length];
    name = tr({ fr: `L'Âge ${article} ${word}`, en: `The Age of ${word}` });
    guard += 1;
  }
  return {
    label: name,
    detail: `${label} - ${tr(definition.bonus)}`,
    cadmosAge: {
      id: `cadmos_${Date.now()}_${index}`,
      name,
      word,
      orientation,
      orientationLabel: label,
      milestoneType: milestone.type,
      threshold: milestone.threshold,
      cycle: state.cycles || 0,
      chosenAt: Date.now()
    }
  };
}

export async function promptCadmosAgeName(milestone) {
  if (!isMythEffectActive("mythe_de_cadmos") || state.cadmosPromptPending || collapseInProgress) return;
  state.cadmosPromptPending = true;
  render();

  const options = shuffleCadmosOrientations().map((orientation, index) => buildCadmosAgeOption(orientation, index, milestone));
  const choice = await openChoiceDialog({
    title: "Nommer l'Age",
    body: `${milestone.type === "population" ? "La population" : "L'infrastructure"} atteint un nouveau palier (${fmt(milestone.threshold)}). Cadmos exige un nom pour que la cite sache ce qu'elle devient.`,
    variant: "cadmos",
    preventClose: true,
    options
  });

  const chosen = choice.cadmosAge || options[0].cadmosAge;
  state.cadmosChronicle = [...(state.cadmosChronicle || []), chosen];
  state.cadmosCycleBonuses = {
    food: state.cadmosCycleBonuses?.food || 0,
    gold: state.cadmosCycleBonuses?.gold || 0,
    stability: state.cadmosCycleBonuses?.stability || 0
  };
  state.cadmosCycleBonuses[chosen.orientation] = (state.cadmosCycleBonuses[chosen.orientation] || 0) + 1;
  state.cadmosLastChosenOrientation = chosen.orientation;
  state.cadmosRecentWords = [chosen.word, ...(state.cadmosRecentWords || []).filter((word) => word !== chosen.word)].slice(0, 6);
  state.cadmosPromptPending = false;
  invalidateRenderCache("all");
  log(`Cadmos : ${chosen.name} est inscrit dans la Chronique. Bonus ${chosen.orientationLabel} +${Math.round(CADMOS_CYCLE_BONUS_PCT * 100)}% pour ce cycle.`);
  save();
  render();
}

export function engraveCadmosEpitaph(entryId) {
  if (!state.cadmosHeritage) return;
  const source = [...(state.cadmosLastRunChronicle || []), ...(state.cadmosChronicle || [])];
  const entry = source.find((item) => item.id === entryId);
  if (!entry) return;
  const current = state.cadmosPermanentEpitaphs || [];
  if (current.some((item) => item.id === entry.id)) return;
  if (current.length >= CADMOS_MAX_PERMANENT_EPITAPHS) return;

  state.cadmosPermanentEpitaphs = [...current, { ...entry, engravedAt: Date.now() }];
  log(`Epitaphe gravee : ${entry.name}. Son orientation devient un Nom de Pouvoir permanent.`);
  invalidateRenderCache("all");
  save();
  render();
}

export async function activateMyth(mythId) {
  if (gamePaused) return;
  const myth = getMythById(mythId);
  if (!myth || !isMythUnlocked(myth) || isMythCompleted(myth.id)) return;

  state.activeMythId = mythId;
  // « L'Hiver Fimbul » : la prod de la cité d'AVANT le reset — la puissance
  // réelle du joueur au moment de signer le pacte — sert d'ancre au prix des
  // offrandes. Capturée ICI, avant resetCivilization (après, elle est nulle :
  // c'est le bug du 1er jet, prix planchers et boss bouclé en 2 min 45).
  // ⚠ activeMythId est déjà posé : rates() est donc calculé SOUS les effets du
  // Mythe — sans conséquence pour le Ragnarok (ses fléaux dépendent de l'âge du
  // cycle, encore ancien ici), et le cache de frame est invalidé par le reset.
  const _preResetRates = mythId === RAGNAROK_ID ? ratesFn() : null;
  const _savedBabelCategory = state.babelCategory;
  resetCivilization();
  state.babelCategory = _savedBabelCategory;
  if (typeof myth.onActivate === "function") await myth.onActivate();
  if (_preResetRates) {
    const part = (rate, floor) => D(rate).max(0).mul(RAGNAROK_ARK_OFFERING_PROD_SEC).max(floor).floor();
    state.ragnarokArkCost = {
      food: part(_preResetRates.food, 100),
      gold: part(_preResetRates.gold, 50),
      knowledge: part(_preResetRates.knowledge, 25),
      infrastructure: part(_preResetRates.infrastructure, 10)
    };
  }
  if (myth.requiresActiveRuinsChoice) {
    await chooseActiveRuins({
      required: true,
      title: "Antée - Ruines actives"
    });
  }
  setGamePaused(false);
  log(`Pacte active: ${tr(myth.name)}. ${tr(myth.description)}`);
  invalidateRenderCache("all");
  save();
  render();
}

// ── « Le poids du ciel » — le verbe d'Atlas ──────────────────────────────────
// Pendant le Mythe seulement : ÉPAULER fait redescendre le Fardeau, avec un temps
// de récupération entre deux gestes. L'héritage (l'Épaule) ne passe plus par ce
// bouton : « Atlas prend le coup » est un choix supplémentaire dans les gestions
// de crise (voir crisis.js), une fois par cycle.
export function atlasEpauler() {
  if (!isMythEffectActive("mythe_d_atlas")) return;
  if (gamePaused || collapseInProgress || state.crisisLimitAnnounced) return;
  if (state.atlasCrushed) return;
  if (Date.now() < (state.atlasShoulderCdEnd || 0)) return;
  state.atlasShoulderCdEnd = Date.now() + ATLAS_SHOULDER_CD_MS;

  // Une épaulée ne COMPTE qu'en zone rouge : épauler un ciel léger soulage mais
  // gaspille la récupération. C'est ce qui fait du clic une décision (chevaucher
  // le rouge) et non un métronome (cliquer dès que possible).
  const compte = (state.atlasFardeau || 0) >= ATLAS_COUNT_THRESHOLD;
  state.atlasFardeau = Math.max(0, (state.atlasFardeau || 0) - ATLAS_SHOULDER_RELIEF);
  if (compte) {
    state.atlasEpaules = (state.atlasEpaules || 0) + 1;
    log(`Atlas : épaulée ${state.atlasEpaules}/${ATLAS_SHOULDER_TARGET}. Le ciel recule, un instant.`);
  } else {
    log("Atlas : le ciel était léger — le geste soulage, mais ne compte pas.");
  }
  invalidateRenderCache("all");
  checkMythLiveCompletion();
  save();
  render();
}

// ── « La Montée » — le verbe de Sisyphe ──────────────────────────────────────
// POUSSER paie le cran courant dans la matière choisie. Chaque matière ré-employée
// dans la même montée double son prix (1×, 2×, 4×…) : répartir est le casse-tête,
// et la bonne répartition dépend des stocks du joueur. La chute vit dans
// building.js (bâtir pendant la montée lâche le rocher) ; le premier sommet
// retombe TOUJOURS — seul le second scelle le Mythe (validation en direct).
export function sisyphePousser(res) {
  if (!isMythEffectActive("mythe_de_sisyphe")) return;
  if (gamePaused || collapseInProgress || state.crisisLimitAnnounced) return;
  if ((state.sisypheMontees || 0) >= SISYPHE_MONTEES_TARGET) return;
  const base = SISYPHE_STEP_BASE[res];
  if (!base) return;
  const usages = state.sisypheUsages || { food: 0, knowledge: 0, infrastructure: 0 };
  const cout = { [res]: base * Math.pow(2, usages[res] || 0) };
  if (!canPayCost(cout)) return;
  payCost(cout);
  // Nouvelle référence d'objet : le shallow-compare de useCityViewState doit voir
  // le changement (une mutation en place lui serait invisible).
  state.sisypheUsages = { ...usages, [res]: (usages[res] || 0) + 1 };
  state.sisypheCran = (state.sisypheCran || 0) + 1;

  if (state.sisypheCran >= SISYPHE_CRANS) {
    state.sisypheMontees = (state.sisypheMontees || 0) + 1;
    state.sisypheCran = 0;
    state.sisypheUsages = { food: 0, knowledge: 0, infrastructure: 0 };
    if (state.sisypheMontees >= SISYPHE_MONTEES_TARGET) {
      log("Sisyphe : le rocher tient au sommet. Cette fois, il ne retombe pas.");
    } else {
      log("Sisyphe : le sommet… et le rocher redévale la pente. Toujours. Remonte-le.");
    }
  } else {
    log(`Sisyphe : cran ${state.sisypheCran}/${SISYPHE_CRANS}. Le rocher tient — ne bâtis pas.`);
  }
  invalidateRenderCache("all");
  checkMythLiveCompletion();
  save();
  render();
}

// ── « La Langue commune » — l'héritage de Babel ──────────────────────────────
// Une déclaration par cycle, irréversible : la catégorie choisie produit +20 %
// jusqu'à la fin du cycle (babelCommonTongueMult, rates.js). La décision est le
// moment : déclarer tôt (profiter longtemps) ou attendre de voir où penche le
// cycle. Remplace la Synergie d'Urbanisme invisible (2026-07-20).
export function babelDeclareTongue(cat) {
  if (!state.babelHeritage) return;
  if (gamePaused || collapseInProgress) return;
  if (state.babelCommonTongue) return;            // une déclaration par cycle
  if (!BABEL_CAT_LABELS[cat]) return;
  state.babelCommonTongue = cat;
  log(`La Langue commune : le cycle parle « ${tr(BABEL_CAT_LABELS[cat])} » — production +${Math.round((BABEL_COMMON_TONGUE_MULT - 1) * 100)} % jusqu'à l'effondrement.`);
  invalidateRenderCache("all");
  save();
  render();
}

// Réglage AUTO de la Langue commune (demande Raph 2026-07-20 : la récompense
// doit être paramétrable en automatique). S'arme sur la langue DU CYCLE EN COURS
// et la fait repartir déclarée d'elle-même à chaque nouveau cycle
// (resetTemporaryRunState) ; se désarme à tout moment ; survit au Grand Reset.
// Changer de langue auto = désarmer, déclarer l'autre langue au cycle suivant,
// réarmer.
export function babelToggleAutoTongue() {
  if (!state.babelHeritage) return;
  if (state.babelAutoTongue) {
    state.babelAutoTongue = null;
    log("La Langue commune : réglage automatique levé — chaque cycle choisira sa langue.");
  } else {
    if (!state.babelCommonTongue) return; // rien à retenir : déclarer d'abord une langue
    state.babelAutoTongue = state.babelCommonTongue;
    log(`La Langue commune : « ${tr(BABEL_CAT_LABELS[state.babelAutoTongue])} » sera déclarée d'elle-même à chaque cycle.`);
  }
  invalidateRenderCache("all");
  save();
  render();
}

// ── « L'Hiver Fimbul » — le verbe du Ragnarok ────────────────────────────────
// Le prix d'une offrande : le lot FIGÉ par activateMyth (prod d'avant le reset),
// avec un repli planchers si un save arrive sans lot (hydraté d'une vieille
// version, par exemple). Pur (ne mute pas) : la carte l'affiche, OFFRIR le paie.
export function ragnarokOfferingCost() {
  const c = state.ragnarokArkCost;
  if (c) return c;
  return { food: D(100), gold: D(50), knowledge: D(25), infrastructure: D(10) };
}

// OFFRIR verse une offrande à l'Arche — une seule toutes les RAGNAROK_ARK_COOLDOWN_MS
// (la 8e ne peut donc pas tomber avant ~14 min : on ne rushe pas la Fin, on la
// traverse). À la 8e, l'Arche est prête — la Fin est conjurée et le Mythe se
// sacre en direct. Les fléaux (Hiver/Loup/Feu/Fin) vivent dans mythTicks.js et
// tick.js ; l'équilibrage veut que le revenu passif seul ne suffise pas sous
// l'Hiver — Comptoir, jeux du temple et héritages comblent l'écart.
export function ragnarokOffrir() {
  if (!isMythEffectActive(RAGNAROK_ID)) return;
  // PAS de garde crisisLimitAnnounced ici, contrairement aux autres verbes : la
  // crise terminale (que le Feu déclenche souvent vers ~22 min) n'empêche PAS
  // d'achever l'Arche — on la finit sous le ciel en feu, jusqu'à la Fin (24 min).
  // Sans cette exception, la 8e offrande était impossible stocks pleins (harnais).
  if (gamePaused || collapseInProgress) return;
  if ((state.ragnarokArkOfferings || 0) >= RAGNAROK_ARK_TARGET) return;
  if (Date.now() < (state.ragnarokArkNextAt || 0)) return;
  const lot = ragnarokOfferingCost();
  if (!canPayCost(lot)) return;
  payCost(lot);
  state.ragnarokArkNextAt = Date.now() + RAGNAROK_ARK_COOLDOWN_MS;
  state.ragnarokArkOfferings = (state.ragnarokArkOfferings || 0) + 1;
  if (state.ragnarokArkOfferings >= RAGNAROK_ARK_TARGET) {
    log("L'Arche est prête. La Fin regarde la cité — et passe son chemin.");
  } else {
    log(`Ragnarok : offrande ${state.ragnarokArkOfferings}/${RAGNAROK_ARK_TARGET} versée à l'Arche.`);
  }
  invalidateRenderCache("all");
  checkMythLiveCompletion();
  save();
  render();
}

// ── « Les Caravanes » — le mini-jeu de négociation de l'Âge d'Or ─────────────
// Un marchand vend un lot de Nourriture/Savoir/Infrastructure contre de l'Or.
// ACCEPTER paie le prix courant ; MARCHANDER le fait baisser (OR_DEAL_HAGGLE_STEP)
// mais sa patience est CACHÉE (2 à 4 marchandages) — la dépasser, c'est le voir
// partir, marché perdu. Tout l'état d'une négociation vit dans la fermeture de
// cette fonction : zéro champ persistant hors orDealsClosed (le compteur du défi).
const OR_DEAL_RESOURCES = [
  { key: "food", label: { fr: "Nourriture", en: "Food" } },
  { key: "knowledge", label: { fr: "Savoir", en: "Knowledge" } },
  { key: "infrastructure", label: { fr: "Infrastructure", en: "Infrastructure" } }
];
const OR_MOOD_LINES = [
  { fr: "Le marchand sourit, confiant.", en: "The merchant smiles, confident." },
  { fr: "Le marchand fronce les sourcils.", en: "The merchant frowns." },
  { fr: "Le marchand tapote sa balance, agacé.", en: "The merchant taps his scales, annoyed." },
  { fr: "Le marchand rassemble déjà ses affaires…", en: "The merchant is already packing…" }
];

export async function negotiateOrDeal() {
  if (!isMythEffectActive("mythe_age_or") || collapseInProgress || state.crisisLimitAnnounced || gamePaused) return;
  if ((state.orDealsClosed || 0) >= OR_DEALS_TARGET) return;

  setGamePaused(true);
  render();

  const res = OR_DEAL_RESOURCES[Math.floor(Math.random() * OR_DEAL_RESOURCES.length)];
  const r = ratesFn();
  // Lot et prix ancrés sur la production COURANTE (sans échelle) : le lot vaut
  // OR_DEAL_LOT_SECONDS de la ressource, le prix demandé la même durée de
  // production d'Or, majorée. Planchers pour les cités qui ne produisent presque rien.
  const lot = D(r[res.key]).max(0).mul(OR_DEAL_LOT_SECONDS).max(25).round();
  let price = D(r.gold).max(0).mul(OR_DEAL_LOT_SECONDS).mul(OR_DEAL_ASK_MARKUP).max(40).round();
  const patience = OR_DEAL_PATIENCE_MIN
    + Math.floor(Math.random() * (OR_DEAL_PATIENCE_MAX - OR_DEAL_PATIENCE_MIN + 1));
  let haggles = 0;
  let note = "";

  for (;;) {
    const mood = tr(OR_MOOD_LINES[Math.min(OR_MOOD_LINES.length - 1, haggles)]);
    const choice = await openChoiceDialog({
      title: tr({ fr: "Une caravane au portail", en: "A caravan at the gate" }),
      body: `${note}${tr({
        fr: `Le marchand propose ${fmt(lot)} ${tr(res.label)} contre ${fmt(price)} Or. ${mood}`,
        en: `The merchant offers ${fmt(lot)} ${tr(res.label)} for ${fmt(price)} Gold. ${mood}`
      })}`,
      preventClose: true,
      options: [
        { label: tr({ fr: "Accepter", en: "Accept" }), detail: tr({ fr: `Payer ${fmt(price)} Or.`, en: `Pay ${fmt(price)} Gold.` }) },
        { label: tr({ fr: "Marchander", en: "Haggle" }), detail: tr({ fr: "Le prix baisse… s'il reste.", en: "The price drops… if he stays." }) },
        { label: tr({ fr: "Refuser", en: "Refuse" }), detail: tr({ fr: "La caravane repart, sans rancune.", en: "The caravan moves on, no hard feelings." }) }
      ]
    });

    if (choice.label === tr({ fr: "Marchander", en: "Haggle" })) {
      haggles += 1;
      if (haggles > patience) {
        chronicle(tr({
          fr: "Le marchand remballe, vexé : « On ne me prend pas pour un âne. » La caravane s'éloigne.",
          en: "The merchant packs up, offended: 'I am no fool.' The caravan departs."
        }));
        break;
      }
      price = price.mul(OR_DEAL_HAGGLE_STEP).max(1).round();
      note = "";
      continue;
    }

    if (choice.label === tr({ fr: "Accepter", en: "Accept" })) {
      if (!canPayCost({ gold: price })) {
        note = tr({ fr: "Ton Trésor n'y suffit pas. ", en: "Your Treasury cannot cover it. " });
        continue;
      }
      payCost({ gold: price });
      state[res.key] = D(state[res.key]).add(lot);
      state.orDealsClosed = (state.orDealsClosed || 0) + 1;
      pushOutcomeFloat({ label: `🤝 +${fmt(lot)} ${tr(res.label)}`, kind: "gain" });
      chronicle(tr({
        fr: `Marché conclu (${state.orDealsClosed}/${OR_DEALS_TARGET}) : ${fmt(lot)} ${tr(res.label)} contre ${fmt(price)} Or.`,
        en: `Deal closed (${state.orDealsClosed}/${OR_DEALS_TARGET}): ${fmt(lot)} ${tr(res.label)} for ${fmt(price)} Gold.`
      }));
      break;
    }

    break; // Refuser
  }

  setGamePaused(false);
  invalidateRenderCache("all");
  // Le 8e marché sacre le Mythe sans attendre le prochain tick.
  checkMythLiveCompletion();
  save();
  render();
}

// ── « Le Comptoir » — l'héritage de l'Âge d'Or ───────────────────────────────
// L'onglet Marchandage : échange permanent, au tarif du marchand (sa marge est
// la contrepartie — le Comptoir dépanne, il n'enrichit pas). Lots ancrés sur la
// production courante : utilisables à toutes les échelles.
export function comptoirBuy(resourceKey) {
  if (!state.orHeritage || collapseInProgress || state.crisisLimitAnnounced) return;
  const res = OR_DEAL_RESOURCES.find((x) => x.key === resourceKey);
  if (!res) return;
  const r = ratesFn();
  const lot = D(r[res.key]).max(0).mul(COMPTOIR_LOT_SECONDS).max(25).round();
  const price = D(r.gold).max(0).mul(COMPTOIR_LOT_SECONDS).mul(COMPTOIR_BUY_MARKUP).max(40).round();
  if (!canPayCost({ gold: price })) {
    log(tr({ fr: "Comptoir : le Trésor n'y suffit pas.", en: "Trading post: the Treasury cannot cover it." }));
    return;
  }
  payCost({ gold: price });
  state[res.key] = D(state[res.key]).add(lot);
  pushOutcomeFloat({ label: `🤝 +${fmt(lot)} ${tr(res.label)}`, kind: "gain" });
  invalidateRenderCache("all");
  save();
  render();
}

export function comptoirSellFood() {
  if (!state.orHeritage || collapseInProgress || state.crisisLimitAnnounced) return;
  const r = ratesFn();
  const lot = D(r.food).max(0).mul(COMPTOIR_LOT_SECONDS).max(25).round();
  if (D(state.food).lt(lot)) {
    log(tr({ fr: "Comptoir : pas assez de Nourriture à vendre.", en: "Trading post: not enough Food to sell." }));
    return;
  }
  const gain = D(r.gold).max(0).mul(COMPTOIR_LOT_SECONDS).mul(COMPTOIR_SELL_RATE).max(10).round();
  state.food = D(state.food).sub(lot);
  state.gold = D(state.gold).add(gain);
  pushOutcomeFloat({ label: `🤝 +${fmt(gain)} ${tr({ fr: "Or", en: "Gold" })}`, kind: "gain" });
  invalidateRenderCache("all");
  save();
  render();
}

// « Le vol par paliers » — LE verbe d'Icare. Pendant le Mythe, chaque montée
// rapproche de l'altitude cible ; avec l'héritage (l'Aile), il reste disponible
// dans les cycles normaux, SANS plafond (décision Raph 2026-07-19 : libre au
// joueur de se saboter s'il n'a pas compris le principe). Remplace la Surchauffe.
export function icareClimb() {
  if (!isMythEffectActive("mythe_d_icare") && !state.icareHeritage) return;
  if (gamePaused || collapseInProgress || state.crisisLimitAnnounced) return;
  state.icareAltitude = (state.icareAltitude || 0) + 1;
  state.instability = clamp01((state.instability || 0) + ICARE_CLIMB_RUPTURE);
  log(`Icare : altitude ${state.icareAltitude}. L'air brûle un peu plus.`);
  invalidateRenderCache("all");
  save();
  render();
}

// La redescente est libre et gratuite : le prix a été payé à la montée (Rupture
// immédiate), redescendre n'efface que l'ACCÉLÉRATION, jamais le mal déjà fait.
export function icareDescend() {
  if ((state.icareAltitude || 0) <= 0) return;
  if (gamePaused || collapseInProgress) return;
  state.icareAltitude = state.icareAltitude - 1;
  log(`Icare : redescente — altitude ${state.icareAltitude}.`);
  invalidateRenderCache("all");
  save();
  render();
}

export function rembourserAtridesDebt() {
  if (!isMythEffectActive("mythe_atrides") || gamePaused || collapseInProgress) return;
  const cost = (state.atridesDebt || 0) * ATRIDES_DEBT_PAYBACK_FACTOR;
  if (D(state.gold).lt(cost)) return;

  state.gold = D(state.gold).sub(cost);
  state.atridesDebt = 0;
  log(`Dette remboursée ! Vous avez payé ${fmt(cost)} Trésor pour éteindre votre dette.`);
  invalidateRenderCache("all");
  save();
  render();
}

export function renegocierAtridesDebt() {
  if (!isMythEffectActive("mythe_atrides") || gamePaused || collapseInProgress) return;
  const now = Date.now();
  if (state.atridesRenegotiateCooldownEnd && now < state.atridesRenegotiateCooldownEnd) return;

  state.atridesRenegotiateActiveUntil = now + ATRIDES_RENEGOTIATE_DURATION_MS;
  state.atridesRenegotiateCooldownEnd = now + ATRIDES_RENEGOTIATE_COOLDOWN_MS;
  state.atridesDebtGrowthMultiplier = ATRIDES_RENEGOTIATE_MULT;
  log(`Dette renégociée ! Le taux de croissance de la dette est réduit de ${Math.round((1 - ATRIDES_RENEGOTIATE_MULT) * 100)}% pendant ${ATRIDES_RENEGOTIATE_DURATION_MS / 1000} secondes.`);
  invalidateRenderCache("all");
  save();
  render();
}

export function transmettreAtrides() {
  if (!isMythEffectActive("mythe_atrides") || gamePaused || collapseInProgress) return;
  if (state.atridesDrainDisabled) return;

  state.atridesDrainDisabled = true;
  log("Transmission activée ! Le drain de 10% sur les ressources est levé. Les Ruines gagnées à l'effondrement de ce cycle seront multipliées par 1.5, mais un malus de production de 20% s'appliquera au cycle suivant.");
  invalidateRenderCache("all");
  save();
  render();
}

export function activateAtridesPact() {
  if (!state.atridesHeritage || state.activeMythId || gamePaused || collapseInProgress) return;
  if (state.atridesPactActive) return;
  const elapsed = Date.now() - (state.cycleStartedAt || Date.now());
  if (elapsed >= 120_000) return; // Uniquement pendant les 2 premières minutes

  state.atridesPactActive = true;
  log("Pacte des Atrides scellé : production doublée pendant les 2 premières minutes, au prix d'un malus de production de 50% pendant la crise.");
  invalidateRenderCache("all");
  save();
  render();
}

export function resetCivilization() {
  // Socle de départ indexé sur l'échelle (effectType *PctPeak) — source unique.
  const startFloor = computeStartFloor;
  state.population = startFloor("Population", 10);
  state.food = startFloor("Food", 35);
  state.gold = startFloor("Gold", 0);
  state.knowledge = startFloor("Knowledge", 0);
  state.infrastructure = D(0);
  state.activeEpitaphLegacy = null;
  state.nextEpitaphLegacy = null;
  state.buildings = { ...defaultState().buildings };

  resetTemporaryRunState(state);

  // Overwrite any properties that have custom starting values on reset:
  state.orPopPeak = state.population;
  state.hephPopPeak = state.population;
  state.eneeTerritoryStartedAt = isMythEffectActive("mythe_d_enee") ? Date.now() : null;
  
  invalidateRenderCache("all");
  enforceInfrastructureCap();
  resetCyclePeaks();
  state.cycleStartedAt = Date.now();
}

export function migrerEnee() {
  if (!isMythEffectActive("mythe_d_enee") || gamePaused || collapseInProgress) return;
  if (!state.eneeDegraded) return;

  state.buildings = { ...defaultState().buildings };
  state.cityMapSlots = {};
  state.infrastructure = D(0);
  state.food = computeStartFloor("Food", 35);

  state.eneeMigrations = (state.eneeMigrations || 0) + 1;
  state.eneeDegraded = false;
  state.eneeTerritoryStartedAt = Date.now();

  log(`Migration de la cité effectuée (Total : ${state.eneeMigrations}). Les anciens bâtiments sont abandonnés, un nouveau territoire est colonisé.`);
  invalidateRenderCache("all");
  save();
  render();
}
