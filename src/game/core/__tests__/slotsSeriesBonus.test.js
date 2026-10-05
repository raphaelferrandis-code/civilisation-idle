"use strict";
// Revue du 2026-10-04 : le bonus (roue, Hold & Win) d'un tour PAYÉ dont les étoiles
// ouvrent une série de tours gratuits ne doit pas gonfler le gain de CETTE série
// (bandeau « ★ 0/8 · +X » avant même le premier tour gratuit).

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { state, setState, hydrateState, invalidateRenderCache } from "../state.js";
import { slotsFreeSpins } from "../actions/slots.js";
import { tableLimits } from "../actions/maisonTable.js";
import { SLOTS_WHEEL, SLOTS_UNLOCK_ERA } from "../balance.js";
import { MID_GAME_FIXTURE, FIXED_NOW } from "./fixtures.js";
import { stopsWhere, spinWith } from "../../../test/slots.js";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
  setState(hydrateState(MID_GAME_FIXTURE));
  state.bestEraIndex = SLOTS_UNLOCK_ERA;
  state.faveur = 1e12;
  state.icarusPotFaveur = 0;
  state.slotsHistory = [];
  state.slotsFreeSpins = null;
  state.icarusFreeFlights = [];
  invalidateRenderCache("all");
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("Machine à sous — bonus d'un tour payé et série de tours gratuits", () => {
  it("la roue d'un tour payé qui ouvre une série n'est pas comptée dans la série", () => {
    // Arrêts connus d'abord : la recherche ne tourne que si les rouleaux ont changé.
    // EXIGÉE (audit 2026-10-05, TEST-13) : l'ancien `if (!st) return` rendait le test
    // vide et vert après un balayage complet de 29⁵ fenêtres (~22 s, plus que le délai
    // de la CI) si la combinaison disparaissait.
    const st = stopsWhere((ev) => ev.stars >= 3 && ev.wheel && !ev.holdWin, [0, 10, 15, 18, 3]);
    expect(st, "combinaison introuvable : trois étoiles et la roue, sans Hold & Win").toBeTruthy();
    const stake = tableLimits().min;
    const idx = SLOTS_WHEEL.findIndex((s) => typeof s === "number");
    const res = spinWith(st, stake, [(idx + 0.5) / SLOTS_WHEEL.length], { defer: true });
    res.apply();
    expect(slotsFreeSpins()).toBeTruthy();
    res.wheel.apply();
    expect(slotsFreeSpins().won).toBe(0);
  });
});
