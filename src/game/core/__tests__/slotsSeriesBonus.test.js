"use strict";
// Revue du 2026-10-04 : le bonus (roue, Hold & Win) d'un tour PAYÉ dont les étoiles
// ouvrent une série de tours gratuits ne doit pas gonfler le gain de CETTE série
// (bandeau « ★ 0/8 · +X » avant même le premier tour gratuit).

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { state, setState, hydrateState, invalidateRenderCache } from "../state.js";
import { spinSlots, slotsWindow, slotsEvaluate, slotsFreeSpins } from "../actions/slots.js";
import { tableLimits } from "../actions/maisonTable.js";
import { SLOTS_REELS, SLOTS_WHEEL, SLOTS_UNLOCK_ERA } from "../balance.js";
import { MID_GAME_FIXTURE, FIXED_NOW } from "./fixtures.js";

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

function stopsWhere(pred) {
  const L = SLOTS_REELS.map((r) => r.length);
  for (let a = 0; a < L[0]; a += 1) for (let b = 0; b < L[1]; b += 1) for (let c = 0; c < L[2]; c += 1) {
    for (let d = 0; d < L[3]; d += 1) for (let e = 0; e < L[4]; e += 1) {
      const st = [a, b, c, d, e];
      if (pred(slotsEvaluate(slotsWindow(st)))) return st;
    }
  }
  return null;
}
function spinWith(stops, stake, tail = []) {
  const seq = [...stops.map((s, r) => (s + 0.5) / SLOTS_REELS[r].length), ...tail];
  vi.spyOn(Math, "random").mockImplementation(() => (seq.length ? seq.shift() : 0.999));
  const res = spinSlots(stake, { defer: true });
  Math.random.mockRestore();
  return res;
}

describe("Machine à sous — bonus d'un tour payé et série de tours gratuits", () => {
  it("la roue d'un tour payé qui ouvre une série n'est pas comptée dans la série", () => {
    const st = stopsWhere((ev) => ev.stars >= 3 && ev.wheel && !ev.holdWin);
    if (!st) return; // bandes sans cette combinaison : rien à vérifier
    const stake = tableLimits().min;
    const idx = SLOTS_WHEEL.findIndex((s) => typeof s === "number");
    const res = spinWith(st, stake, [(idx + 0.5) / SLOTS_WHEEL.length]);
    res.apply();
    expect(slotsFreeSpins()).toBeTruthy();
    res.wheel.apply();
    expect(slotsFreeSpins().won).toBe(0);
  });
});
