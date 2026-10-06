"use strict";
// LA MÊME VALLÉE SANS LA PLUS GRANDE GRILLE (audit du 05/10, CHUTE-4, choix B de Raph).
// La vallée gardait maxN : chaque recalcul de ville d'un cycle neuf se faisait sur la
// plus grande grille jamais atteinte (15 à 40 fois plus cher, à vie pour la
// sauvegarde). Elle ne garde plus que la largeur de pose du fleuve (cityCore.riverN).
// Ce fichier prouve, carte branchée et chute jouée par le vrai code :
//   - la cité neuve repart de sa grille NATURELLE (celle d'une vallée neuve) ;
//   - le fleuve reste où il était par rapport au centre de grille — mêmes échantillons
//     que la cité tombée (hors évasement des Plaisirs, qui suit la ville) —, donc
//     aligné sur les ruines, le cœur et le pont, qui y sont rangés ;
//   - son cours couvre toujours la grille d'un bord à l'autre, et bien au-delà.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { state, setState, hydrateState, invalidateRenderCache } from "../../core/state.js";
import { registerChoiceDialog } from "../../core/choiceDialog.js";
import { runCollapseSequence } from "../../core/events.js";
import { setChuteHandlers } from "../cityMapBridge.js";
import { computeCityLayout } from "../layout.js";
import { D } from "../../core/num.js";
import { eras } from "../../data/world.js";
import { MID_GAME_FIXTURE, FIXED_NOW } from "../../core/__tests__/fixtures.js";

// Échantillons du fleuve relatifs au centre de grille (le repère des ruines).
const rel = (L) => {
  const c = Math.floor(L.gridN / 2);
  return L.river.samples.map((sp) => [sp.x - c, sp.y - c]);
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
  setState(hydrateState(MID_GAME_FIXTURE));
  invalidateRenderCache("all");
});
afterEach(() => {
  setChuteHandlers(null);
  registerChoiceDialog(null);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("la même vallée, grille naturelle et fleuve gardé", () => {
  it("la cité neuve repart de sa grille naturelle ; le fleuve reste où il était", async () => {
    // La cité qui tombe : un bourg bien bâti.
    const pop = D(eras[8].at).mul(3);
    Object.assign(state, { mapSeed: 0x51a7c0de, population: pop, knowledge: pop.mul(0.05), infrastructure: pop.mul(0.1), instability: 0, timeWear: 0 });
    for (const k of Object.keys(state.buildings)) state.buildings[k] = k === "roads" ? 20 : 10;
    state.cityRoads = null; state.cityCore = null; state.cityMapSlots = {}; state.cityArchetype = null; state.cityPersonality = null; state.riverWP = null;
    const fallen = computeCityLayout(state);
    const fallenRiver = rel(fallen);
    const N1 = fallen.gridN;

    // La chute, par le vrai code (relevé du vestige branché : layout.js est chargé).
    setChuteHandlers({ fall: () => null, capture: () => true, take: () => null, rise: (f) => f && f(), abort: () => {} });
    registerChoiceDialog((dialog) => Promise.resolve(dialog.options[0]));
    const seq = runCollapseSequence(D(100), "manual");
    await vi.advanceTimersByTimeAsync(2000);
    await seq;
    expect(state.mapSeed).toBe(0x51a7c0de);
    expect(state.cityCore.maxN).toBeUndefined();
    expect(state.cityCore.riverN).toBeGreaterThanOrEqual(N1);

    // Le campement de la vallée…
    const valley = computeCityLayout(state);
    // …et celui d'une vallée neuve, mêmes comptes (la grille naturelle).
    const kept = { core: state.cityCore, roads: state.cityRoads, slots: state.cityMapSlots, arch: state.cityArchetype };
    state.cityCore = null; state.cityRoads = null; state.cityMapSlots = {}; state.cityArchetype = null;
    const fresh = computeCityLayout(state);
    Object.assign(state, { cityCore: kept.core, cityRoads: kept.roads, cityMapSlots: kept.slots, cityArchetype: kept.arch });

    expect(valley.gridN).toBe(fresh.gridN);
    expect(valley.gridN).toBeLessThan(N1);

    // Mêmes échantillons, au même endroit par rapport au centre (l'évasement des
    // Plaisirs, qui suit l'emprise de la ville, est le seul écart permis).
    const river = rel(valley);
    expect(river.length).toBe(fallenRiver.length);
    const same = river.filter((p, i) => Math.abs(p[0] - fallenRiver[i][0]) < 1e-9 && Math.abs(p[1] - fallenRiver[i][1]) < 1e-9).length;
    expect(same / river.length).toBeGreaterThan(0.8);

    // Le cours traverse la grille d'un bord à l'autre, et au-delà (le ruban du bord du monde).
    const xs = valley.river.samples.map((sp) => sp.x);
    expect(Math.min(...xs)).toBeLessThan(-valley.gridN);
    expect(Math.max(...xs)).toBeGreaterThan(2 * valley.gridN);
  });
});
