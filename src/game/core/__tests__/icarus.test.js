"use strict";
// Le Vol d'Icare (crash game du temple) — loi du jeu (jeux DÉCOUPLÉS) :
//   C = (1-EDGE)/U (borné [1, CAP]) tiré à l'envol ; m(t) = e^(K·t) . La mise
//   reste en OR (le puits) ; le GAIN est de la FAVEUR = secondes × m × K. La
//   chute nourrit la cagnotte EN FAVEUR ; se poser à ×JACKPOT+ la rafle.
// EDGE = 0.18 (odds très bas early) → C = 0.82 / U. Vol résolu par un setTimeout
// moteur (autoritaire, même scène fermée).

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { state, setState, hydrateState, invalidateRenderCache, resetTemporaryRunState } from "../state.js";
import {
  launchIcarus,
  cashOutIcarus,
  icarusStakes,
  icarusFlying,
  icarusMultiplierAt,
  icarusLastOutcome,
  icarusPotFaveur
} from "../actions.js";
import { __resetIcarusForTests } from "../actions/icarus.js";
import { toNum } from "../num.js";
import { ICARUS_K, ICARUS_FAVEUR_K, ICARUS_POT_FEED, ICARUS_POT_CAP_FAVEUR, ICARUS_HISTORY_LEN } from "../balance.js";
import { MID_GAME_FIXTURE, FIXED_NOW } from "./fixtures.js";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
  setState(hydrateState(MID_GAME_FIXTURE));
  state.gold = 1e9; // la fixture (40 k) ne couvre pas les grosses mises
  state.faveur = 0;
  __resetIcarusForTests();
  invalidateRenderCache("all");
});

afterEach(() => {
  __resetIcarusForTests();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// Un vol dont le point de crash est TIRÉ via U (Math.random mocké une fois).
function launch(stakeId, u) {
  vi.spyOn(Math, "random").mockReturnValueOnce(u);
  const res = launchIcarus(stakeId);
  Math.random.mockRestore();
  return res;
}

describe("Vol d'Icare — moteur (gains en Faveur)", () => {
  it("paie la mise EN OR à l'envol et refuse un second vol simultané", () => {
    const stake = icarusStakes().find((s) => s.id === "plume");
    const before = toNum(state.gold);
    expect(launch("plume", 0.01)).toBeTruthy(); // C = 82 : tout le temps de voler
    expect(toNum(state.gold)).toBeCloseTo(before - toNum(stake.gold), 0);
    expect(icarusFlying()).toBe(true);
    expect(launchIcarus("plume")).toBeNull(); // un seul Icare à la fois
  });

  it("la courbe double toutes les 5 s (K = ln2/5)", () => {
    expect(icarusMultiplierAt(5000)).toBeCloseTo(2, 5);
    expect(icarusMultiplierAt(10000)).toBeCloseTo(4, 5);
  });

  it("se poser paie de la FAVEUR (secondes × m × K) et révèle le point de crash", () => {
    launch("plume", 0.01); // C = 82
    vi.advanceTimersByTime(5000); // m ≈ ×2.00
    const out = cashOutIcarus();
    expect(out.type).toBe("cashout");
    expect(out.m).toBeCloseTo(2, 2);
    expect(out.faveur).toBe(Math.round(30 * out.m * ICARUS_FAVEUR_K)); // plume = 30 s
    expect(state.faveur).toBe(out.faveur);
    expect(out.crashPoint).toBeCloseTo(82, 0); // near-miss : le soleil est révélé
    expect(icarusFlying()).toBe(false);
    expect(cashOutIcarus()).toBeNull(); // le vol est résolu
  });

  it("la chute (timer moteur) brûle la mise et nourrit la cagnotte EN FAVEUR", () => {
    launch("plume", 0.5); // C = 1.64 → chute à ~3.6 s
    const goldAfterPay = toNum(state.gold);
    vi.advanceTimersByTime(6000);
    const out = icarusLastOutcome();
    expect(out.type).toBe("crash");
    expect(out.crashPoint).toBeCloseTo(1.64, 2);
    expect(toNum(state.gold)).toBeCloseTo(goldAfterPay, 0); // rien ne revient
    expect(state.faveur).toBe(0); // un vol brûlé ne paie pas de Faveur
    expect(state.icarusPotFaveur).toBeCloseTo(30 * ICARUS_POT_FEED, 6); // plume 30 s
    expect(icarusFlying()).toBe(false);
  });

  it("le soleil peut frapper au décollage (C = 1)", () => {
    launch("plume", 0.999); // (1-edge)/U < 1 → C = 1
    vi.advanceTimersByTime(50);
    const out = icarusLastOutcome();
    expect(out.type).toBe("crash");
    expect(out.crashPoint).toBe(1);
  });

  it("se poser à ×10+ rafle la cagnotte de Faveur", () => {
    state.icarusPotFaveur = 1000;
    invalidateRenderCache("all");
    expect(icarusPotFaveur()).toBe(1000);
    launch("plume", 0.05); // C = 17.6
    vi.advanceTimersByTime(16700); // m ≈ ×10.03
    const out = cashOutIcarus();
    expect(out.m).toBeGreaterThanOrEqual(10);
    expect(out.jackpotFaveur).toBe(1000);
    expect(state.icarusPotFaveur).toBe(0);
    expect(state.faveur).toBe(out.faveur + out.jackpotFaveur);
  });

  it("un vol offert (Coup de Vénus) ne coûte rien et paie en Faveur", () => {
    state.icarusFreeFlights = 1;
    const before = toNum(state.gold);
    launch("plume", 0.01); // C = 88
    expect(toNum(state.gold)).toBe(before); // le temple paie la mise
    expect(state.icarusFreeFlights).toBe(0);
    vi.advanceTimersByTime(5000);
    const out = cashOutIcarus();
    expect(out.faveur).toBeGreaterThan(0);
    expect(state.faveur).toBe(out.faveur);
  });

  it("hydratation : cagnotte de Faveur bornée, historique re-typé", () => {
    const s = hydrateState({ icarusPotFaveur: 999999, icarusHistory: [2.4, "junk", -3, 1.1, Infinity] });
    expect(s.icarusPotFaveur).toBe(ICARUS_POT_CAP_FAVEUR);
    expect(s.icarusHistory).toEqual([2.4, 1.1]);
    expect(hydrateState({ icarusPotFaveur: -5 }).icarusPotFaveur).toBe(0);
    expect(hydrateState({}).icarusHistory).toEqual([]);
  });

  it("reset de cycle : historique effacé, cagnotte de Faveur SURVIT", () => {
    launch("plume", 0.5);
    vi.advanceTimersByTime(6000); // chute → cagnotte nourrie + historique
    expect(state.icarusHistory.length).toBe(1);
    const pot = state.icarusPotFaveur;
    resetTemporaryRunState(state);
    expect(state.icarusHistory).toEqual([]);
    expect(state.icarusPotFaveur).toBe(pot);
  });

  it("l'historique est capé", () => {
    for (let i = 0; i < ICARUS_HISTORY_LEN + 4; i++) {
      launch("plume", 0.5);
      vi.advanceTimersByTime(6000);
    }
    expect(state.icarusHistory.length).toBe(ICARUS_HISTORY_LEN);
  });
});
