"use strict";

import { localizeData } from '../core/i18n.js';

export const ACTIVE_RUIN_RUPTURE_START = 0.10;
export const ACTIVE_RUIN_FOOD_ENGINE_COST_MULT = 1.20;
export const ACTIVE_RUIN_GOLD_PROD_MULT = 0.75;
export const ACTIVE_RUIN_USURE_MULT = 1.10;
export const ACTIVE_RUIN_RUIN_GAIN_PER_MALUS = 0.10;
// Antée — « la force des fardeaux » : porter PLUSIEURS maluses simultanés (4) ET
// prospérer malgré eux (faire croître la pop ×ANTEE_POP_MULT depuis le départ).
export const ANTEE_MIN_ACTIVE_RUINS = 4;       // 4 maluses simultanés (était 2)
export const ANTEE_POWER_THRESHOLD = 10_000;   // (obsolète — remplacé par la croissance relative)
export const ANTEE_POP_MULT = 50;              // Réussite : pic de pop ≥ 50× le départ, sous le poids des 4 maluses

export const ACTIVE_RUIN_DEFINITIONS = [
  {
    id: "enee",
    stateKey: "eneeHeritage",
    title: { fr: "Migration fondatrice", en: "Founding Migration" },
    source: { fr: "Énée", en: "Énée" },
    bonus: { fr: "Boost de départ actif (+10% par effondrement, jusqu'à +100%).", en: "Active starting boost (+10% per collapse, up to +100%)." },
    malus: { fr: `Rupture initiale +${Math.round(ACTIVE_RUIN_RUPTURE_START * 100)}.`, en: `Initial Rupture +${Math.round(ACTIVE_RUIN_RUPTURE_START * 100)}.` }
  },
  {
    id: "promethee",
    stateKey: "prometheeBraisiers",
    title: { fr: "Braisiers ancestraux", en: "Ancestral Braziers" },
    source: { fr: "Prométhée", en: "Prométhée" },
    bonus: { fr: "Bonus Nourriture x2 actif en début de cycle.", en: "Active Food bonus x2 at the start of the cycle." },
    malus: { fr: `Chaque moteur de Nourriture coûte ${Math.round((ACTIVE_RUIN_FOOD_ENGINE_COST_MULT - 1) * 100)}% plus cher.`, en: `Each Food engine costs ${Math.round((ACTIVE_RUIN_FOOD_ENGINE_COST_MULT - 1) * 100)}% more.` }
  },
  {
    id: "age_or",
    stateKey: "orHeritage",
    title: { fr: "Equilibre Dore", en: "Golden Balance" },
    source: { fr: "Âge d'Or", en: "Golden Age" },
    bonus: { fr: "Bonus d'Usure actif (-20% quand Nourriture et Trésor sont équilibrés).", en: "Active Wear bonus (-20% when Food and Treasury are balanced)." },
    malus: { fr: `La production de Trésor démarre ${Math.round((1 - ACTIVE_RUIN_GOLD_PROD_MULT) * 100)}% plus lente.`, en: `Treasury production starts ${Math.round((1 - ACTIVE_RUIN_GOLD_PROD_MULT) * 100)}% slower.` }
  },
  {
    id: "hephaistos",
    stateKey: "hephHeritage",
    title: { fr: "Automates ancestraux", en: "Ancestral Automatons" },
    source: { fr: "Héphaïstos", en: "Héphaïstos" },
    bonus: { fr: "Automatisations permanentes actives.", en: "Permanent automations active." },
    malus: { fr: `L'Usure monte ${Math.round((ACTIVE_RUIN_USURE_MULT - 1) * 100)}% plus vite.`, en: `Wear rises ${Math.round((ACTIVE_RUIN_USURE_MULT - 1) * 100)}% faster.` }
  },
  {
    id: "atlas",
    stateKey: "atlasHeritage",
    title: { fr: "Slot futur", en: "Future slot" },
    source: { fr: "Atlas", en: "Atlas" },
    bonus: { fr: "Bonus à définir.", en: "Bonus to be defined." },
    malus: { fr: "Malus à définir.", en: "Malus to be defined." },
    pending: true
  },
  {
    id: "sisyphe",
    stateKey: "sisypheHeritage",
    title: { fr: "Slot futur", en: "Future slot" },
    source: { fr: "Sisyphe", en: "Sisyphe" },
    bonus: { fr: "Bonus à définir.", en: "Bonus to be defined." },
    malus: { fr: "Malus à définir.", en: "Malus to be defined." },
    pending: true
  },
  {
    id: "babel",
    stateKey: "babelHeritage",
    title: { fr: "Slot futur", en: "Future slot" },
    source: { fr: "Babel", en: "Babel" },
    bonus: { fr: "Bonus à définir.", en: "Bonus to be defined." },
    malus: { fr: "Malus à définir.", en: "Malus to be defined." },
    pending: true
  },
  {
    id: "icare",
    stateKey: "icareHeritage",
    title: { fr: "Slot futur", en: "Future slot" },
    source: { fr: "Icare", en: "Icare" },
    bonus: { fr: "Bonus à définir.", en: "Bonus to be defined." },
    malus: { fr: "Malus à définir.", en: "Malus to be defined." },
    pending: true
  },
  {
    id: "phenix",
    stateKey: "phoenixHeritage",
    title: { fr: "Slot futur", en: "Future slot" },
    source: { fr: "Phénix", en: "Phénix" },
    bonus: { fr: "Bonus à définir.", en: "Bonus to be defined." },
    malus: { fr: "Malus à définir.", en: "Malus to be defined." },
    pending: true
  },
  {
    id: "atrides",
    stateKey: "atridesHeritage",
    title: { fr: "Slot futur", en: "Future slot" },
    source: { fr: "Atrides", en: "Atrides" },
    bonus: { fr: "Bonus à définir.", en: "Bonus to be defined." },
    malus: { fr: "Malus à définir.", en: "Malus to be defined." },
    pending: true
  }
];

export function unlockedActiveRuinDefinitions(state) {
  return ACTIVE_RUIN_DEFINITIONS.filter((definition) => Boolean(state[definition.stateKey]));
}

export function activeRuinIds(state) {
  return Array.isArray(state.activeRuinIds) ? state.activeRuinIds : [];
}

export function hasActiveRuin(state, id) {
  return activeRuinIds(state).includes(id);
}

export function activeRuinCount(state) {
  return activeRuinIds(state).length;
}

export function activeRuinMultiplier(state) {
  return 1 + activeRuinCount(state) * ACTIVE_RUIN_RUIN_GAIN_PER_MALUS;
}

// Aplatit les feuilles { fr, en } (title/source/bonus/malus) en chaînes (i18n.js).
localizeData(ACTIVE_RUIN_DEFINITIONS);
