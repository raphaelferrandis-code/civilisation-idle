"use strict";
// G-21 : le système de mythes PAR TICK (runMythTicks + MYTH_TICK_HANDLERS, ~140 l.)
// n'était exercé par AUCUN test (aucune fixture n'avait d'activeMythId + tick).
// On active un mythe (isMythEffectActive = activeMythId === id) puis on appelle
// runMythTicks et on asserte l'effet du handler. Représentants des 2 familles :
// clamp de state (Âge d'Or), décroissance (Héphaïstos). Sisyphe n'a plus de
// handler depuis la refonte « la Montée » (le rocher ne bouge que par les verbes) —
// ses tests vivent dans mythRepairs.test.js.

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { state, setState, hydrateState } from "../state.js";
import { Decimal, D } from "../num.js";
import { runMythTicks } from "../actions/mythTicks.js";
import { HEPH_POP_DECAY_START_MIN } from "../../data/myths.js";
import { FIXED_NOW } from "./fixtures.js";

beforeAll(() => { vi.spyOn(Date, "now").mockReturnValue(FIXED_NOW); });
afterAll(() => { vi.restoreAllMocks(); });
beforeEach(() => { setState(hydrateState({})); });

describe("runMythTicks — handler Âge d'Or (« les Caravanes »)", () => {
  it("un handler ne s'exécute pas si son mythe n'est pas actif", () => {
    state.activeMythId = null;
    state.food = new Decimal(100000);
    state.gold = new Decimal(1000);
    runMythTicks(state, 1);
    expect(state.orUsureImbalance).toBeFalsy(); // déséquilibre ignoré : mythe inactif
  });

  it("ne plafonne PLUS la population (refonte : le clamp doré a disparu)", () => {
    // Le Mythe est devenu un mini-jeu de négociation : le handler ne tient plus que
    // la jauge de déséquilibre Nourriture/Trésor (Usure ×3 via prestige.js).
    state.activeMythId = "mythe_age_or";
    state.population = new Decimal("1e12");
    state.food = new Decimal(5000);
    state.gold = new Decimal(5000);
    runMythTicks(state, 1);
    expect(D(state.population).eq("1e12")).toBe(true); // intacte
    expect(state.orUsureImbalance).toBe(false);        // 5000 vs 5000 : équilibré
  });

  it("lève la jauge de déséquilibre quand Nourriture et Trésor divergent", () => {
    state.activeMythId = "mythe_age_or";
    state.food = new Decimal(100000);
    state.gold = new Decimal(1000);
    runMythTicks(state, 1);
    expect(state.orUsureImbalance).toBe(true);
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
