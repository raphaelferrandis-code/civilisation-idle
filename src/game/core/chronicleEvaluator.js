"use strict";

import { chronicleArticles } from '../data/chronicleArticles.js';
import { eras } from '../data/world.js';
import { save } from './state.js';
import { mapStage, currentEraIndex } from './mechanics.js';
import { cycleYear } from './actions/utils.js';
import { D } from './num.js';

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
  pop_100m: "Démographie",
  pop_1b: "Démographie",
  pop_100b: "Démographie",
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
  pop_100m: 1,
  pop_1b: 1,
  pop_100b: 1,
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
  const stage = mapStage();
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
      return D(state.food).gt(state.gold) && D(state.food).gt(state.knowledge);
    case "or":
      return D(state.gold).gt(state.food) && D(state.gold).gt(state.knowledge);
    case "savoir":
      return D(state.knowledge).gt(0);
    case "stage_start":
      return stage <= 1;
    case "stage_6":
      return stage >= 6;
    case "stage_12":
      return stage >= 12;
    case "pop_10k":
      return D(state.population).gt(10000);
    case "pop_100k":
      return D(state.population).gt(100000);
    case "pop_1m":
      return D(state.population).gt(1000000);
    case "pop_100m":
      return D(state.population).gt(100000000);
    case "pop_1b":
      return D(state.population).gt(1000000000);
    case "pop_100b":
      return D(state.population).gt(100000000000);
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

  const eraIndex = currentEraIndex();
  const currentPeriod = getPeriod(eraIndex);

  const triggeredIds = new Set((state.chronicleEntries || []).map(e => e.id));
  const candidates = [];

  const types = [
    "stage_start", "stage_6", "stage_12", "pop_10k", "pop_100k", "pop_1m", "pop_100m", "pop_1b", "pop_100b",
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
  const year = cycleYear();
  const era = eras[currentEraIndex()]?.name || "Campement";

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

  state.chronicleEntries = [newEntry, ...(state.chronicleEntries || [])].slice(0, 250);
  state.chronicleCooldown = 60; // 60 seconds cooldown

  save();
}
