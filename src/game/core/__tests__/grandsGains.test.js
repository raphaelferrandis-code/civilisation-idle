"use strict";
// LES GRANDS GAINS — lot 3 des gains « vrai casino » : trois paliers au multiple de la
// mise (×10, ×50, ×250), l'effet pour l'abonné de la scène, et la Chronique pour les
// coups de légende.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { state, setState, hydrateState } from "../state.js";
import { PALIERS, palierOf, celebrerGain, onGrandGain } from "../grandsGains.js";
import { MID_GAME_FIXTURE, FIXED_NOW } from "./fixtures.js";

let off = null;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
  setState(hydrateState(MID_GAME_FIXTURE));
});
afterEach(() => {
  if (off) off();
  off = null;
  vi.useRealTimers();
});

describe("Les grands gains", () => {
  it("trois paliers : ×10, ×50, ×250 (le plus haut atteint)", () => {
    expect(PALIERS.map((p) => p.x)).toEqual([250, 50, 10]);
    expect([0, 9.99, 10, 49, 50, 249, 250, 5000, NaN].map((m) => palierOf(m)?.id ?? null))
      .toEqual([null, null, "gros", "gros", "enorme", "enorme", "legende", "legende", null]);
  });

  it("l'effet reçoit le palier ; la Chronique ne retient que la légende", () => {
    const seen = [];
    off = onGrandGain((e) => seen.push(e));
    const n0 = state.history.length;
    expect(celebrerGain({ gain: 900, stake: 100, game: "icare" })).toBeNull(); // ×9
    expect(celebrerGain({ gain: 1200, stake: 100, game: "icare" }).id).toBe("gros");
    expect(state.history.length).toBe(n0);
    expect(celebrerGain({ gain: 30000, stake: 100, game: "tickets" }).id).toBe("legende");
    expect(state.history.length).toBe(n0 + 1);
    expect(state.history[state.history.length - 1]).toContain("Coup de légende aux tickets : ×300 la mise");
    expect(seen.map((e) => e.palier.id)).toEqual(["gros", "legende"]);
    expect(seen[1]).toMatchObject({ gain: 30000, stake: 100, mult: 300, game: "tickets" });
  });

  it("show: false écrit la légende sans l'effet (la machine a son bandeau)", () => {
    const seen = [];
    off = onGrandGain((e) => seen.push(e));
    expect(celebrerGain({ gain: 50000, stake: 100, game: "machine", show: false }).id).toBe("legende");
    expect(seen).toEqual([]);
    expect(state.history[state.history.length - 1]).toContain("à la machine à sous");
  });

  it("rien pour une mise ou un gain nuls", () => {
    expect(celebrerGain({ gain: 0, stake: 10 })).toBeNull();
    expect(celebrerGain({ gain: 1000, stake: 0 })).toBeNull();
    expect(celebrerGain()).toBeNull();
  });
});
