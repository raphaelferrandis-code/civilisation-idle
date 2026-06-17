"use strict";

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
    title: "Migration fondatrice",
    source: "Énée",
    bonus: "Boost de départ actif (+10% par effondrement, jusqu'à +100%).",
    malus: `Rupture initiale +${Math.round(ACTIVE_RUIN_RUPTURE_START * 100)}.`
  },
  {
    id: "promethee",
    stateKey: "prometheeBraisiers",
    title: "Braisiers ancestraux",
    source: "Prométhée",
    bonus: "Bonus Nourriture x2 actif en début de cycle.",
    malus: `Chaque moteur de Nourriture coûte ${Math.round((ACTIVE_RUIN_FOOD_ENGINE_COST_MULT - 1) * 100)}% plus cher.`
  },
  {
    id: "age_or",
    stateKey: "orHeritage",
    title: "Equilibre Dore",
    source: "Âge d'Or",
    bonus: "Bonus d'Usure actif (-20% quand Nourriture et Trésor sont équilibrés).",
    malus: `La production de Trésor démarre ${Math.round((1 - ACTIVE_RUIN_GOLD_PROD_MULT) * 100)}% plus lente.`
  },
  {
    id: "hephaistos",
    stateKey: "hephHeritage",
    title: "Automates ancestraux",
    source: "Héphaïstos",
    bonus: "Automatisations permanentes actives.",
    malus: `L'Usure monte ${Math.round((ACTIVE_RUIN_USURE_MULT - 1) * 100)}% plus vite.`
  },
  {
    id: "atlas",
    stateKey: "atlasHeritage",
    title: "Slot futur",
    source: "Atlas",
    bonus: "Bonus à définir.",
    malus: "Malus à définir.",
    pending: true
  },
  {
    id: "sisyphe",
    stateKey: "sisypheHeritage",
    title: "Slot futur",
    source: "Sisyphe",
    bonus: "Bonus à définir.",
    malus: "Malus à définir.",
    pending: true
  },
  {
    id: "babel",
    stateKey: "babelHeritage",
    title: "Slot futur",
    source: "Babel",
    bonus: "Bonus à définir.",
    malus: "Malus à définir.",
    pending: true
  },
  {
    id: "icare",
    stateKey: "icareHeritage",
    title: "Slot futur",
    source: "Icare",
    bonus: "Bonus à définir.",
    malus: "Malus à définir.",
    pending: true
  },
  {
    id: "phenix",
    stateKey: "phoenixHeritage",
    title: "Slot futur",
    source: "Phénix",
    bonus: "Bonus à définir.",
    malus: "Malus à définir.",
    pending: true
  },
  {
    id: "atrides",
    stateKey: "atridesHeritage",
    title: "Slot futur",
    source: "Atrides",
    bonus: "Bonus à définir.",
    malus: "Malus à définir.",
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
