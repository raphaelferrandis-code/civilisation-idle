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
  ruins: 5_000,
  cycles: 4,
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

// Profil de FARM HORS-LIGNE (simulateAwayCrises v2) : auto-achat (hephHeritage),
// doctrine de crise réglée et effondrement automatique au « temps » à 180 s, sur un
// cycle déjà vieux de 2 h — l'effondrement part donc au premier pas de 10 s, sur un
// état PRÉ-effondrement identique d'un run à l'autre. Une seule copie (audit
// 2026-10-05, TEST-9) : crisisDoctrine, epitaphLegacy et mythRepairs la recopiaient.
// Brut, comme MID_GAME_FIXTURE : passer par farmState() (src/test/core.js), qui en
// hydrate une copie fraîche.
export const FARM_FIXTURE = {
  population: 100000, food: 400000, gold: 200000, knowledge: 30000, infrastructure: 3000,
  ruins: 5000, cycles: 10, instability: 0.3, timeWear: 0.1,
  bestEraIndex: 6, cyclePeaks: { population: 120000, knowledge: 35000, infrastructure: 3500, eraIndex: 6 },
  cycleStartedAt: FIXED_NOW - 2 * 3600 * 1000, lastTick: FIXED_NOW - 2 * 3600 * 1000,
  buildings: { foragers: 30, granaries_city: 20, caravans: 12, markets: 8, irrigated_fields: 6 },
  upgrades: { conseil_de_crise: true, edit_effondrement: true },
  hephHeritage: true,
  crisisDoctrine: { p25: "stabiliser", p50: "stabiliser", p75: "stabiliser", autoCollapse: { enabled: true, trigger: "temps", timeSeconds: 180, usureThreshold: 0.9, prepare: false } }
};
