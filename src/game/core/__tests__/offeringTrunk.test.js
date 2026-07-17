"use strict";
// Le TRONC DES OFFRANDES (monnaie fermée 2026-07-16) — la source de Faveur
// hors jeux : goutte-à-goutte plafonné, calculé à la volée depuis un timestamp
// (offline-safe), relevé d'un clic, plein à l'amorce (et donc aux migrations
// de save), survivant à l'effondrement, reparti plein au Grand Reset.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { state, setState, hydrateState, resetTemporaryRunState, buildGrandResetState } from "../state.js";
import { trunkValue, collectTrunk } from "../actions.js";
import { TRUNK_RATE_PER_S, TRUNK_CAP, AUTO_TRUNK_UNLOCK_COST } from "../balance.js";
import { setTempleAuto, unlockTempleAuto, tickTempleAutomation } from "../actions.js";
import { MID_GAME_FIXTURE, FIXED_NOW } from "./fixtures.js";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
  setState(hydrateState(MID_GAME_FIXTURE));
  state.faveur = 0;
  state.trunkFaveur = 0;
  state.trunkAt = FIXED_NOW;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Tronc des offrandes", () => {
  it("goutte au fil du temps réel et PLAFONNE (l'AFK ne farme pas)", () => {
    expect(trunkValue()).toBe(0);
    vi.setSystemTime(FIXED_NOW + 120_000); // 2 min
    expect(trunkValue()).toBeCloseTo(120 * TRUNK_RATE_PER_S, 9);
    vi.setSystemTime(FIXED_NOW + 10 * 3600_000); // 10 h
    expect(trunkValue()).toBe(TRUNK_CAP);
  });

  it("la relève encaisse les Faveurs ENTIÈRES et garde la fraction", () => {
    // Indépendant du débit (phase 6 l'a doublé) : on choisit une durée qui laisse
    // une fraction quel que soit TRUNK_RATE_PER_S raisonnable (75 s à 2/min = 2,5).
    const elapsedS = 75;
    vi.setSystemTime(FIXED_NOW + elapsedS * 1000);
    const total = elapsedS * TRUNK_RATE_PER_S;
    const whole = Math.floor(total);
    const frac = total - whole;
    expect(frac).toBeGreaterThan(0); // le test perd son sens si la durée tombe rond
    const gain = collectTrunk({ render: false, silent: true });
    expect(gain).toBe(whole);
    expect(state.faveur).toBe(whole);
    expect(state.trunkFaveur).toBeCloseTo(frac, 9);
    expect(state.trunkAt).toBe(FIXED_NOW + elapsedS * 1000);
    // Rien à relever (< 1) : no-op sans mutation.
    expect(collectTrunk({ render: false, silent: true })).toBe(0);
    expect(state.faveur).toBe(whole);
  });

  it("amorce : une save SANS champs tronc le découvre PLEIN (migration douce)", () => {
    const s = hydrateState({});
    expect(s.trunkFaveur).toBe(TRUNK_CAP);
  });

  it("survit à l'effondrement (comme la Faveur) et repart PLEIN au Grand Reset", () => {
    state.trunkFaveur = 7.25;
    resetTemporaryRunState(state);
    expect(state.trunkFaveur).toBe(7.25);
    const gr = buildGrandResetState(1);
    expect(gr.trunkFaveur).toBe(TRUNK_CAP);
  });

  it("auto-relève : se paie en Faveur, vide le tronc quand il frôle le plafond", () => {
    state.faveur = AUTO_TRUNK_UNLOCK_COST;
    expect(unlockTempleAuto("tronc")).toBe(true);
    expect(state.faveur).toBe(0);
    expect(state.templeAuto.tronc).toMatchObject({ unlocked: true, on: true });

    // Tronc loin du plafond : l'auto ne relève pas.
    vi.setSystemTime(FIXED_NOW + 5 * 60_000);
    tickTempleAutomation();
    expect(state.faveur).toBe(0);

    // Tronc quasi plein : relève automatique au tick.
    vi.setSystemTime(FIXED_NOW + 40 * 60_000);
    tickTempleAutomation();
    expect(state.faveur).toBe(TRUNK_CAP);
    expect(trunkValue()).toBeLessThan(1);

    // Suspendue (on=false) : le tronc plafonne sans être relevé.
    setTempleAuto("tronc", { on: false });
    vi.setSystemTime(FIXED_NOW + 120 * 60_000);
    tickTempleAutomation();
    expect(state.faveur).toBe(TRUNK_CAP); // inchangé
    expect(trunkValue()).toBe(TRUNK_CAP);
  });
});
