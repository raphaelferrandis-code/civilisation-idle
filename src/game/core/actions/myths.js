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
  resetTemporaryRunState,
  openView
} from '../state.js';

import {
  legitimacyGain,
  computeStartFloor,
  enforceInfrastructureCap
} from '../mechanics.js';

import { openChoiceDialog } from '../events.js';
import { DOCTRINES } from '../../data/world.js';
import { CM } from '../../map/layout.js';
import {
  getMythById,
  isMythCompleted,
  isMythEffectActive,
  isMythUnlocked,
  checkActUnlocks,
  SURCHAUFFE_DURATION_MS,
  SURCHAUFFE_COOLDOWN_MS,
  SURCHAUFFE_RUPTURE,
  SURCHAUFFE_PROD_MULT,
  ATRIDES_DEBT_PAYBACK_FACTOR,
  ATRIDES_RENEGOTIATE_COOLDOWN_MS,
  ATRIDES_RENEGOTIATE_DURATION_MS,
  ATRIDES_RENEGOTIATE_MULT,
  CADMOS_CYCLE_BONUS_PCT,
  CADMOS_MAX_PERMANENT_EPITAPHS,
  CADMOS_ORIENTATIONS
} from '../../data/myths.js';
import { clamp01, fmt } from '../utils.js';
import { D } from '../num.js';
import { log, resetCyclePeaks } from './utils.js';
import {
  ACTIVE_RUIN_RUPTURE_START,
  unlockedActiveRuinDefinitions
} from '../../data/activeRuins.js';

export function checkMythOnCollapse() {
  if (!state.activeMythId) return;
  const myth = getMythById(state.activeMythId);
  if (!myth) return;

  const success = typeof myth.onCollapse === "function" ? myth.onCollapse() : false;
  if (success && !isMythCompleted(myth.id)) {
    state.mythsCompleted[myth.id] = true;
    if (typeof myth.applyHeritage === "function") myth.applyHeritage();
    log(`Pacte honore: "${myth.name}". Heritage accorde: ${myth.heritageDescription}`);
    checkActUnlocks();
  } else if (!success) {
    log(`Pacte brise: "${myth.name}" n'a pas ete honore ce cycle.`);
  }
}

export async function foundDynasty() {
  const gain = legitimacyGain();
  if (gain <= 0 || gamePaused) return;
  setGamePaused(true);
  render();

  const choice = await openChoiceDialog({
    title: "Choisir une Doctrine",
    body: `La Dynastie ${state.dynastyCount + 1} s'apprete a s'ecrire dans l'histoire. Quelle doctrine guidera cette lignee?`,
    options: DOCTRINES.map((d) => ({ label: d.name, detail: d.detail, doctrineId: d.id })),
    variant: "dynasty"
  });

  state.dynastyDoctrine = choice.doctrineId || DOCTRINES[0].id;
  state.legitimacy += gain;
  state.dynastyCount += 1;
  // Seuil croissant de la prochaine fondation (remis à zéro au Grand Reset).
  state.dynastiesSinceGR = (state.dynastiesSinceGR || 0) + 1;
  state.ruins = D(0);
  setGamePaused(false);
  resetCivilization();
  openView("city");
  CM.centered = false; // force le recentrage de la caméra sur le nouveau village
  const doctrine = DOCTRINES.find((d) => d.id === state.dynastyDoctrine);
  log(`Dynastie ${state.dynastyCount}: les ruines deviennent ${fmt(gain)} legitimite. La ${doctrine?.name || "doctrine"} est proclamee.`);
  save();
  render();
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
    body: required
      ? "Antée demande de porter vos Héritages comme des ruines vivantes. Sélectionnez les Héritages à activer avec leur malus pour ce cycle."
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
      { label: "Valider", detail: required ? "Sceller ces Ruines actives pour le cycle." : "Appliquer cette selection." },
      { label: "Aucune Ruine active", detail: required ? "Tenter Antée sans malus actifs." : "Cycle normal, sans multiplicateur de Ruines.", selectedIds: [] }
    ]
  });

  const selectedIds = choice.label === "Aucune Ruine active" ? [] : (choice.selectedIds || []);
  const allowedIds = new Set(choices.filter((definition) => !definition.pending).map((definition) => definition.id));
  state.activeRuinIds = selectedIds.filter((id, index, array) => allowedIds.has(id) && array.indexOf(id) === index);
  state.pendingActiveRuinsChoice = false;
  if (state.activeRuinIds.includes("enee")) {
    state.instability = clamp01((state.instability || 0) + ACTIVE_RUIN_RUPTURE_START);
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
  const recentWords = new Set(state.cadmosRecentWords || []);
  const chosenNames = new Set((state.cadmosChronicle || []).map((entry) => entry.name));
  const candidates = definition.words.filter((word) => !recentWords.has(word));
  const pool = candidates.length ? candidates : definition.words;
  let word = pool[Math.floor(Math.random() * pool.length)] || definition.words[0];
  let name = `L'Age ${definition.article} ${word}`;
  let guard = 0;
  while (chosenNames.has(name) && guard < definition.words.length) {
    word = definition.words[(definition.words.indexOf(word) + 1 + guard) % definition.words.length];
    name = `L'Age ${definition.article} ${word}`;
    guard += 1;
  }
  return {
    label: name,
    detail: `${definition.label} - ${definition.bonus}`,
    cadmosAge: {
      id: `cadmos_${Date.now()}_${index}`,
      name,
      word,
      orientation,
      orientationLabel: definition.label,
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
  const _savedBabelCategory = state.babelCategory;
  resetCivilization();
  state.babelCategory = _savedBabelCategory;
  if (typeof myth.onActivate === "function") await myth.onActivate();
  if (myth.requiresActiveRuinsChoice) {
    await chooseActiveRuins({
      required: true,
      title: "Antée - Ruines actives"
    });
  }
  setGamePaused(false);
  log(`Pacte active: ${myth.name}. ${myth.description}`);
  invalidateRenderCache("all");
  save();
  render();
}

export function activateSurchauffe() {
  if (!state.icareHeritage || gamePaused || collapseInProgress) return;
  const now = Date.now();
  if (state.surchauffeCooldownEnd && now < state.surchauffeCooldownEnd) return;

  state.surchauffeEndTime    = now + SURCHAUFFE_DURATION_MS;
  state.surchauffeCooldownEnd = now + SURCHAUFFE_DURATION_MS + SURCHAUFFE_COOLDOWN_MS;
  state.instability = clamp01((state.instability || 0) + SURCHAUFFE_RUPTURE);
  invalidateRenderCache("all");
  log(`Surchauffe : production x${SURCHAUFFE_PROD_MULT} pendant ${SURCHAUFFE_DURATION_MS / 1000}s. Rupture +${Math.round(SURCHAUFFE_RUPTURE * 100)}%.`);
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
