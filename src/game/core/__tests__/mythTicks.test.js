"use strict";
// G-21 : le système de mythes PAR TICK (runMythTicks + MYTH_TICK_HANDLERS, ~140 l.)
// n'était exercé par AUCUN test (aucune fixture n'avait d'activeMythId + tick).
// On active un mythe (isMythEffectActive = activeMythId === id) puis on appelle
// runMythTicks et on asserte l'effet du handler. Représentants des 3 familles :
// détection d'objectif (Sisyphe), clamp de state (Âge d'Or), décroissance (Héphaïstos).

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { state, setState, hydrateState } from "../state.js";
import { Decimal, D } from "../num.js";
import { runMythTicks } from "../actions/mythTicks.js";
import { totalBuildingCount } from "../mechanics.js";
import {
  SISYPHE_BUILDING_TARGET,
  OR_POP_CAP,
  OR_POP_CAP_GROWTH,
  HEPH_POP_DECAY_START_MIN
} from "../../data/myths.js";
import { FIXED_NOW } from "./fixtures.js";

beforeAll(() => { vi.spyOn(Date, "now").mockReturnValue(FIXED_NOW); });
afterAll(() => { vi.restoreAllMocks(); });
beforeEach(() => { setState(hydrateState({})); });

describe("runMythTicks — handler Sisyphe (détection d'objectif)", () => {
  it("passe sisypheReached à true quand le nombre de bâtiments atteint la cible", () => {
    state.activeMythId = "mythe_de_sisyphe";
    state.buildings = { ...state.buildings, foragers: SISYPHE_BUILDING_TARGET + 20 };
    expect(totalBuildingCount()).toBeGreaterThanOrEqual(SISYPHE_BUILDING_TARGET);
    expect(state.sisypheReached).toBeFalsy();
    runMythTicks(state, 1);
    expect(state.sisypheReached).toBe(true);
  });

  it("ne déclenche PAS sous la cible", () => {
    state.activeMythId = "mythe_de_sisyphe";
    state.buildings = { foragers: 1 };
    runMythTicks(state, 1);
    expect(state.sisypheReached).toBeFalsy();
  });

  it("un handler ne s'exécute pas si son mythe n'est pas actif", () => {
    state.activeMythId = null;
    state.buildings = { foragers: SISYPHE_BUILDING_TARGET + 20 };
    runMythTicks(state, 1);
    expect(state.sisypheReached).toBeFalsy();
  });
});

describe("runMythTicks — handler Âge d'Or (clamp dur de population)", () => {
  it("plafonne la population au cap doré (empêche l'étalement)", () => {
    state.activeMythId = "mythe_age_or";
    state.orStartPop = 1000;
    state.population = new Decimal("1e12"); // très au-dessus du cap
    state.food = new Decimal(5000);
    state.gold = new Decimal(5000);
    const cap = D(state.orStartPop).mul(OR_POP_CAP_GROWTH).max(OR_POP_CAP);
    runMythTicks(state, 1);
    expect(D(state.population).lte(cap)).toBe(true);
    expect(D(state.population).eq(cap)).toBe(true);
  });
});

describe("runMythTicks — handler Héphaïstos (décroissance de population)", () => {
  it("fait décroître la population une fois le délai de déclin passé", () => {
    state.activeMythId = "mythe_d_hephaistos";
    // cycle démarré il y a (délai + 5) minutes → le déclin s'applique.
    state.cycleStartedAt = FIXED_NOW - (HEPH_POP_DECAY_START_MIN + 5) * 60_000;
    state.population = new Decimal(1_000_000);
    runMythTicks(state, 1);
    expect(D(state.population).lt(1_000_000)).toBe(true);
    expect(D(state.population).gt(0)).toBe(true); // borné à >= 1
  });

  it("ne décroît PAS avant le délai de déclin", () => {
    state.activeMythId = "mythe_d_hephaistos";
    state.cycleStartedAt = FIXED_NOW; // élapsé = 0 < délai
    state.population = new Decimal(1_000_000);
    runMythTicks(state, 1);
    expect(D(state.population).eq(1_000_000)).toBe(true);
  });
});
