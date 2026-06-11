"use strict";
// Fixtures partagées pour les tests golden-master du cœur économique.
// Un état de jeu réaliste de milieu de partie : quelques bâtiments répartis sur
// plusieurs paliers, des ressources non triviales, une crise en cours, un cycle
// déjà bien entamé. Sert de référence stable pour rates / pressureBreakdown /
// ruinGain / timeWearRate / buildingBatchCost avant la migration Decimal (Phase 3).

// Temps figé pour tout calcul lisant Date.now() (cycleStartedAt, sédiments…).
export const FIXED_NOW = 1_700_000_000_000;

// Brut : passé dans hydrateState() qui complète les champs manquants depuis
// defaultState() et normalise/borne les valeurs.
export const MID_GAME_FIXTURE = {
  population: 50_000,
  food: 80_000,
  gold: 40_000,
  knowledge: 12_000,
  infrastructure: 800,
  legitimacy: 35,
  ruins: 5_000,
  cycles: 4,
  dynastyCount: 4,
  instability: 0.45,
  timeWear: 0.30,
  collapsePreparation: 0.5,
  // 1 heure écoulée dans le cycle courant → palier de sédiment "elapsed >= 3600".
  cycleStartedAt: FIXED_NOW - 3_600_000,
  bestEraIndex: 5,
  cyclePeaks: {
    population: 60_000,
    knowledge: 15_000,
    infrastructure: 900,
    eraIndex: 5
  },
  buildings: {
    foragers: 20,
    granaries_city: 12,
    caravans: 8,
    markets: 5,
    guilds: 3,
    aqueducts: 2,
    sewers: 1
  }
};
