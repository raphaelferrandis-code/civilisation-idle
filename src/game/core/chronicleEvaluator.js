"use strict";

import { chronicleArticles } from '../data/chronicleArticles.js';
import { eras } from '../data/world.js';
import { save } from './state.js';

function getStage(state) {
  const b = state.buildings || {};
  const cnt = (id) => b[id] || 0;
  if (cnt("imperial_exchanges") >= 1) return 16;
  if (cnt("mint_houses") >= 1 || cnt("public_works") >= 3) return 15;
  if (cnt("water_mills") >= 3) return 14;
  if (cnt("water_mills") >= 1 || cnt("courthouses") >= 3) return 13;
  if (cnt("river_ports") >= 3) return 12;
  if (cnt("river_ports") >= 1 || cnt("bureaucracy") >= 3) return 11;
  if (cnt("irrigated_fields") >= 3) return 10;
  if (cnt("irrigated_fields") >= 1 || cnt("sewers") >= 3) return 9;
  if (cnt("guilds") >= 3) return 8;
  if (cnt("guilds") >= 1 || cnt("aqueducts") >= 3) return 7;
  if (cnt("markets") >= 3) return 6;
  if (cnt("caravans") >= 3 || cnt("markets") >= 1) return 5;
  if (cnt("caravans") >= 1) return 4;
  if (cnt("granaries_city") >= 3) return 3;
  if (cnt("granaries_city") >= 1) return 2;
  if (cnt("foragers") >= 3) return 1;
  return 0;
}

function getEraName(population) {
  let index = 0;
  for (let i = 0; i < eras.length; i += 1) {
    if (population >= eras[i].at) index = i;
  }
  return eras[index]?.name || "Campement";
}

function cycleYear(state) {
  const elapsed = Math.max(0, (Date.now() - (state.cycleStartedAt || Date.now())) / 1000);
  return Math.floor(elapsed / 60) + 1;
}

function getEraIndexLocal(population) {
  let index = 0;
  for (let i = 0; i < eras.length; i += 1) {
    if (population >= eras[i].at) index = i;
  }
  return index;
}

export function getPeriod(eraIndex) {
  if (eraIndex < 4)  return 1;
  if (eraIndex < 9)  return 2;
  if (eraIndex < 15) return 3;
  if (eraIndex < 21) return 4;
  if (eraIndex < 27) return 5;
  if (eraIndex < 32) return 6;
  return 7;
}

const CATEGORY_LABELS = {
  crise: "Crise",
  tension: "Tension",
  usure: "Usure",
  nourriture: "Abondance",
  or: "Proto-richesse",
  savoir: "Savoir",
  stage_start: "Fondation",
  stage_6: "Développement",
  stage_12: "Sédentarité",
  pop_10k: "Démographie",
  pop_100k: "Démographie",
  pop_1m: "Démographie",
  paix: "Paix",
  bonus_libre: "Chronique"
};

const CATEGORY_PRIORITIES = {
  stage_start: 1,
  stage_6: 1,
  stage_12: 1,
  pop_10k: 1,
  pop_100k: 1,
  pop_1m: 1,
  crise: 2,
  tension: 3,
  usure: 3,
  nourriture: 4,
  or: 4,
  savoir: 4,
  paix: 5,
  bonus_libre: 6
};

export function evaluateCondition(type, state) {
  const stage = getStage(state);
  switch (type) {
    case "crise":
      return state.instability >= 0.75 || state.timeWear >= 0.75;
    case "tension":
      // Eviter le chevauchement si crise est déjà active
      return state.instability >= 0.5 && state.instability < 0.75 && state.timeWear < 0.75;
    case "usure":
      // Eviter le chevauchement si crise est déjà active
      return state.timeWear >= 0.5 && state.timeWear < 0.75 && state.instability < 0.75;
    case "nourriture":
      return state.food > state.gold && state.food > state.knowledge;
    case "or":
      return state.gold > state.food && state.gold > state.knowledge;
    case "savoir":
      return state.knowledge > 0;
    case "stage_start":
      return stage <= 1;
    case "stage_6":
      return stage >= 6;
    case "stage_12":
      return stage >= 12;
    case "pop_10k":
      return state.population > 10000;
    case "pop_100k":
      return state.population > 100000;
    case "pop_1m":
      return state.population > 1000000;
    case "paix":
      return state.instability < 0.35 && state.timeWear < 0.35;
    case "bonus_libre":
      return true;
    default:
      return false;
  }
}

export function checkAndTriggerChronicleEntries(state, dt) {
  if (state.chronicleCooldown === undefined || state.chronicleCooldown === null) {
    state.chronicleCooldown = 0;
  }

  // Decrement cooldown
  if (state.chronicleCooldown > 0) {
    state.chronicleCooldown = Math.max(0, state.chronicleCooldown - dt);
    return;
  }

  const eraIndex = getEraIndexLocal(state.population);
  const currentPeriod = getPeriod(eraIndex);

  const triggeredIds = new Set((state.chronicleEntries || []).map(e => e.id));
  const candidates = [];

  const types = [
    "stage_start", "stage_6", "stage_12", "pop_10k", "pop_100k", "pop_1m",
    "crise", "tension", "usure",
    "nourriture", "or", "savoir",
    "paix", "bonus_libre"
  ];

  for (const type of types) {
    if (evaluateCondition(type, state)) {
      const matching = chronicleArticles.filter(
        art => art.period === currentPeriod && art.conditionType === type && !triggeredIds.has(art.id)
      );
      candidates.push(...matching);
    }
  }

  if (candidates.length === 0) return;

  // Sort by priority (lower number = higher priority)
  candidates.sort((a, b) => {
    const prioA = CATEGORY_PRIORITIES[a.conditionType] || 99;
    const prioB = CATEGORY_PRIORITIES[b.conditionType] || 99;
    return prioA - prioB;
  });

  // Keep only candidates of the highest available priority
  const topPriority = CATEGORY_PRIORITIES[candidates[0].conditionType];
  const topCandidates = candidates.filter(
    c => CATEGORY_PRIORITIES[c.conditionType] === topPriority
  );

  // Pick one randomly
  const chosenIndex = Math.floor(Math.random() * topCandidates.length);
  const chosenArticle = topCandidates[chosenIndex];

  // Build entry
  const year = cycleYear(state);
  const era = getEraName(state.population);

  const newEntry = {
    id: chosenArticle.id,
    title: chosenArticle.title,
    text: chosenArticle.text,
    author: chosenArticle.author,
    age: era,
    date: `An ${year}`,
    category: CATEGORY_LABELS[chosenArticle.conditionType] || "Chronique",
    isNew: true
  };

  state.chronicleEntries = [newEntry, ...(state.chronicleEntries || [])];
  state.chronicleCooldown = 60; // 60 seconds cooldown

  save();
}
