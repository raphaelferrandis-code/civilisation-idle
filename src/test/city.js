// Villes de test (audit 2026-10-05, TEST-9) : les mêmes fonctions vivaient en quatre
// ou cinq copies dans src/game/map/__tests__.
//
// ⚠ L'ère vient de l'état GLOBAL (`currentEraIndex` lit `state`, pas l'état passé au
// layout) : growCity fait donc grandir `state` lui-même, et un fichier qui l'appelle
// deux fois de suite fait grandir LA MÊME ville (mémoire des rues, des îlots…). Pas
// de mémoïsation ici pour cette raison : remettre à zéro (cityRoads, cityCore…) reste
// l'affaire du beforeEach de chaque fichier.
import { computeCityLayout } from "../game/map/layout.js";
import { state, defaultState } from "../game/core/state.js";
import { D } from "../game/core/num.js";
import { eras } from "../game/data/world.js";

// Tous les bâtiments, sauf les routes (achetées à part).
export const BUILDING_KEYS = Object.keys(state.buildings).filter((k) => k !== "roads");

// La ville de la graine 0x2b1c07 à l'ère `i` (population au seuil de l'ère), `level`
// exemplaires de chaque bâtiment et 20 routes — celle des tests de la ville par îlots.
export function growCity(i, level = 30) {
  const pop = D(eras[i].at);
  Object.assign(state, {
    cycles: 1, mapSeed: 0x2b1c07, population: pop,
    knowledge: pop.mul(0.05), infrastructure: pop.mul(0.1), instability: 0, timeWear: 0,
  });
  BUILDING_KEYS.forEach((k) => { state.buildings[k] = level; });
  state.buildings.roads = 20;
  return computeCityLayout(state);
}

// Un état NEUF de ville dense (graine 0x51a7c0de, 1e18 habitants), `perType`
// exemplaires de chaque type — à passer à computeCityLayout. N'écrit pas `state`.
export function cityState(perType) {
  const s = defaultState();
  s.cycles = 1;
  s.mapSeed = 0x51a7c0de;
  s.population = D("1e18");
  s.infrastructure = D("1e12");
  s.knowledge = D("1e12");
  for (const k of Object.keys(s.buildings)) s.buildings[k] = perType;
  return s;
}
