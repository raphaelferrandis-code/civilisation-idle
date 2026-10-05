"use strict";
// BUG-85 (audit du 2026-10-05) : la Chronique du Hold & Win annonçait le MAJEUR à
// ×100 écrit en dur, et UN seul quand deux tombaient (le gain réel, lui, les comptait
// tous). Elle lit désormais la valeur de la pièce dans SLOTS_HW et compte chaque MAJEUR.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { state, setState, hydrateState, invalidateRenderCache } from "../state.js";
import { spinSlots, slotsWindow, slotsEvaluate } from "../actions/slots.js";
import { SLOTS_REELS, SLOTS_HW, SLOTS_UNLOCK_ERA, FAVEUR_ECHELLE } from "../balance.js";
import { fmt } from "../utils.js";
import { MID_GAME_FIXTURE, FIXED_NOW } from "./fixtures.js";

const STAKE = 10;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
  setState(hydrateState(MID_GAME_FIXTURE));
  state.bestEraIndex = SLOTS_UNLOCK_ERA;
  state.faveur = 100000 * FAVEUR_ECHELLE;
  state.icarusPotFaveur = 0;
  state.slotsHistory = [];
  state.slotsFreeSpins = null;
  state.history = [];
  invalidateRenderCache("all");
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// Des arrêts qui déclenchent le Hold & Win seul (ni roue ni tours gratuits) : même
// balayage partiel que slots.test.js.
function holdWinStops() {
  const L = SLOTS_REELS.map((r) => r.length);
  for (let a = 0; a < L[0]; a += 1) for (let b = 0; b < L[1]; b += 1) for (let c = 0; c < L[2]; c += 1) {
    for (let d = 0; d < L[3]; d += 3) for (let e = 0; e < L[4]; e += 3) {
      const st = [a, b, c, d, e];
      const ev = slotsEvaluate(slotsWindow(st));
      if (ev.holdWin && !ev.wheel && !ev.freeSpins) return { st, coins: ev.coinCells.length };
    }
  }
  return null;
}

// Les pièces de départ : `majeurs` MAJEURS d'abord, puis des pièces de 1 ; aucune
// relance ne remplit de case (aléa 0.999 > pNew).
function holdWinWith(majeurs) {
  const found = holdWinStops();
  expect(found).toBeTruthy();
  const tot = SLOTS_HW.values.reduce((s, c) => s + c.w, 0);
  const rMajeur = (tot - 0.25) / tot; // dans la dernière tranche, celle du MAJEUR
  const seq = [
    ...found.st.map((s, r) => (s + 0.5) / SLOTS_REELS[r].length),
    ...Array.from({ length: found.coins }, (_, i) => (i < majeurs ? rMajeur : 0))
  ];
  vi.spyOn(Math, "random").mockImplementation(() => (seq.length ? seq.shift() : 0.999));
  const res = spinSlots(STAKE, { defer: true });
  res.apply();
  res.holdWin.apply();
  Math.random.mockRestore();
  return res.holdWin;
}

describe("Hold & Win — la Chronique du MAJEUR", () => {
  const mj = SLOTS_HW.values.find((c) => c.jp === "majeur");

  it("deux MAJEURS : la Chronique annonce les deux, à la valeur de la table des pièces", () => {
    const hw = holdWinWith(2);
    expect(hw.full).toBe(false);
    expect(hw.majeurs).toBe(2);
    const line = state.history.find((l) => /MAJEURS|MAJORS/.test(l));
    expect(line).toBeTruthy();
    expect(line).toContain(`+${fmt(STAKE * mj.v * 2)}`);
  });

  it("un seul MAJEUR : la phrase au singulier, son montant", () => {
    const hw = holdWinWith(1);
    expect(hw.majeurs).toBe(1);
    const line = state.history.find((l) => /MAJEUR|MAJOR/.test(l));
    expect(line).toMatch(/le MAJEUR tombe|the MAJOR lands/);
    expect(line).toContain(`+${fmt(STAKE * mj.v)}`);
  });
});
