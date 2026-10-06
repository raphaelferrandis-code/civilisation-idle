// L'ANCIEN PLACEMENT RETIRÉ (audit 2026-10-05, MORT-4, choix de Raph).
//
// La molette `__ilots(false)` était le seul accès restant au placement d'avant la
// ville par îlots ; elle est partie avec tout ce qu'elle seule atteignait, dont les
// GRANDS ENSEMBLES civiques. Leur place se réservait pourtant encore dans la grille
// (`c.megaDistricts × 18` dans le calcul de N), alors qu'aucun ne se posait plus.
// Choix (3) de Raph : retirer ce terme — les villes NEUVES sont plus compactes dès la
// bande 3, les villes existantes gardent leur grille (maxN, elle ne rétrécit jamais).
// L'ère se lit sur l'état GLOBAL : on fait donc grandir `state` lui-même.
import { describe, it, expect, beforeEach } from "vitest";
import { computeCityLayout, cityCounts, cityGridDims } from "../layout.js";
import { state } from "../../core/state.js";
import { D } from "../../core/num.js";
import { eras } from "../../data/world.js";

const KEYS = Object.keys(state.buildings).filter((k) => k !== "roads");

// Une ville de l'ère `i` (bande 4 à l'ère 21), `level` exemplaires de chaque bâtiment.
function setCity(i, level = 8) {
  const pop = D(eras[i].at);
  Object.assign(state, {
    cycles: 1, mapSeed: 0x2b1c07, population: pop,
    knowledge: pop.mul(0.05), infrastructure: pop.mul(0.1), instability: 0, timeWear: 0, wonders: [],
  });
  KEYS.forEach((k) => { state.buildings[k] = level; });
  state.buildings.roads = 10;
}

beforeEach(() => {
  state.cityRoads = null; state.cityCore = null; state.cityMapSlots = {}; state.cityArchetype = null; state.cityPersonality = null; state.riverWP = null;
});

describe("ancien placement retiré (MORT-4)", () => {
  it("ville neuve : la grille ne réserve plus la place des grands ensembles", () => {
    for (const i of [16, 26, 36]) {          // bandes 3, 5, 7
      setCity(i);
      const c = cityCounts(state);
      expect(c.megaDistricts, `ère ${i} : aucun grand ensemble compté, scénario vide`).toBeGreaterThan(0);
      const N = cityGridDims(state, c, state.mapSeed).N;
      // Le compte ne pèse plus : sans lui, ou triplé, la même grille.
      expect(cityGridDims(state, { ...c, megaDistricts: 0 }, state.mapSeed).N, `ère ${i}`).toBe(N);
      expect(cityGridDims(state, { ...c, megaDistricts: c.megaDistricts * 3 }, state.mapSeed).N, `ère ${i}`).toBe(N);
    }
  });

  it("aucun grand ensemble n'est posé ni figé dans la fiche", () => {
    setCity(26);
    const L = computeCityLayout(state);
    expect(L.counts.eraBand).toBe(5);
    expect(L.districts).toBeUndefined();
    expect(state.cityCore.districts).toBeUndefined();
  });

  it("ville existante : sa grille (maxN), plus large, ne rétrécit pas", () => {
    setCity(21);
    const L0 = computeCityLayout(state);
    const maxN = L0.gridN + 24;   // une grille posée par l'ancien calcul, plus large
    state.cityCore.maxN = maxN;
    const L1 = computeCityLayout(state);
    expect(L1.gridN).toBe(maxN);
    expect(state.cityCore.maxN).toBe(maxN);
  });
});
