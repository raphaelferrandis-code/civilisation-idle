"use strict";
// LA ROULETTE DU SALON — lot 3 des gains « vrai casino » : une roue européenne à un
// zéro, chaque pari rendant 36/37 de la mise ; la table s'ouvre au titre de Familier.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { state, setState, hydrateState, resetTemporaryRunState, invalidateRenderCache } from "../state.js";
import {
  spinRoulette, rouletteUnlocked, betCovers, betPayout, payoutFor, cleanBets, betsTotal,
  couleurOf, rouletteHistory, ROULETTE_WHEEL, ROUGES, rouletteVipUnlocked, rouletteLimits
} from "../actions/roulette.js";
import { tableLimits, recettesPerHour } from "../actions/maisonTable.js";
import { maisonReputation } from "../actions/maisonRang.js";
import { ROULETTE_RTP, TEMPLE_POT_RECYCLE, ROULETTE_HISTORY_LEN } from "../balance.js";
import { MID_GAME_FIXTURE, FIXED_NOW } from "./fixtures.js";

const TOUS = [
  ...Array.from({ length: 37 }, (_, n) => `n${n}`),
  "rouge", "noir", "pair", "impair", "manque", "passe", "d1", "d2", "d3", "c1", "c2", "c3"
];
const tombe = (n) => vi.spyOn(Math, "random").mockReturnValue((n + 0.5) / 37);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
  setState(hydrateState(MID_GAME_FIXTURE));
  state.bestEraIndex = 10;
  state.maisonRank = 1; // Familier : le salon est ouvert
  state.faveur = 1e7;
  state.icarusPotFaveur = 0;
  state.maisonReputation = 0;
  invalidateRenderCache("all");
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("La roue et ses paris", () => {
  it("une roue européenne : 37 cases, 18 rouges, 18 noires, un zéro vert", () => {
    expect([...ROULETTE_WHEEL].sort((a, b) => a - b)).toEqual(Array.from({ length: 37 }, (_, n) => n));
    expect(ROUGES.size).toBe(18);
    expect(couleurOf(0)).toBe("vert");
    expect(couleurOf(1)).toBe("rouge");
    expect(couleurOf(2)).toBe("noir");
  });

  it("chaque pari rend EXACTEMENT 36/37 de sa mise sur les 37 cases", () => {
    for (const k of TOUS) {
      let gain = 0;
      for (let n = 0; n <= 36; n += 1) gain += betCovers(k, n) ? betPayout(k) : 0;
      expect(gain / 37).toBeCloseTo(ROULETTE_RTP, 12);
    }
    expect(betPayout("n17")).toBe(36);
    expect(betPayout("rouge")).toBe(2);
    expect(betPayout("d2")).toBe(3);
    expect(betPayout("bogus")).toBe(0);
    expect(betPayout("n37")).toBe(0);
  });

  it("le zéro ne fait gagner que son plein ; colonnes et douzaines au bon endroit", () => {
    for (const k of ["rouge", "noir", "pair", "impair", "manque", "passe", "d1", "c3"]) expect(betCovers(k, 0)).toBe(false);
    expect(betCovers("n0", 0)).toBe(true);
    expect([1, 4, 34].every((n) => betCovers("c1", n))).toBe(true);
    expect([3, 36].every((n) => betCovers("c3", n))).toBe(true);
    expect(betCovers("d2", 13) && betCovers("d2", 24) && !betCovers("d2", 25)).toBe(true);
    expect(betCovers("manque", 18) && betCovers("passe", 19)).toBe(true);
  });

  it("plusieurs paris : le gain additionne ceux qui couvrent la case", () => {
    const bets = { n17: 10, noir: 20, d2: 5, c2: 1 };
    // 17 : plein ×36, noir ×2, douzaine 2 ×3, colonne 2 ×3.
    expect(payoutFor(bets, 17)).toBe(360 + 40 + 15 + 3);
    expect(payoutFor(bets, 0)).toBe(0);
    expect(cleanBets({ n17: 2.9, rouge: 0, bogus: 5, d1: "3" })).toEqual({ n17: 2, d1: 3 });
    expect(betsTotal({ n17: 10, noir: 20 })).toBe(30);
  });
});

describe("Un tour de roue", () => {
  it("débite la mise, paie à la révélation (apply idempotent), garde l'historique", () => {
    tombe(17);
    const f0 = state.faveur;
    const res = spinRoulette({ n17: 10, rouge: 20 }, { defer: true, silent: true, render: false });
    expect(res).toMatchObject({ n: 17, couleur: "noir", stakeFaveur: 30, faveurGain: 360, wins: ["n17"] });
    expect(state.faveur).toBe(f0 - 30);              // la mise est partie, rien encore
    expect(rouletteHistory()).toEqual([]);           // la bille roule encore
    res.apply();
    res.apply();
    expect(state.faveur).toBe(f0 - 30 + 360);
    expect(rouletteHistory()).toEqual([17]);
  });

  it("nourrit la cagnotte et la réputation sur la mise, gagnée comme perdue", () => {
    tombe(0);
    spinRoulette({ rouge: 100 }, { silent: true, render: false });
    expect(state.icarusPotFaveur).toBeCloseTo(100 * TEMPLE_POT_RECYCLE * (1 - ROULETTE_RTP), 9);
    expect(maisonReputation()).toBeCloseTo((100 * (1 - ROULETTE_RTP)) / recettesPerHour(), 12);
  });

  it("refuse : sans le titre, hors limites, sans la Faveur", () => {
    const max = tableLimits().max;
    expect(spinRoulette({ rouge: max + 1 }, { silent: true })).toBeNull();
    state.faveur = 5;
    expect(spinRoulette({ rouge: 10 }, { silent: true })).toBeNull();
    state.faveur = 1e7;
    expect(spinRoulette({}, { silent: true })).toBeNull();
    state.maisonRank = 0; // Habitué : le salon est fermé
    expect(rouletteUnlocked()).toBe(false);
    expect(spinRoulette({ rouge: 10 }, { silent: true })).toBeNull();
    expect(state.faveur).toBe(1e7);
  });

  it("l'historique se borne, tombe à l'effondrement et survit à la sauvegarde", () => {
    for (let i = 0; i < ROULETTE_HISTORY_LEN + 3; i += 1) {
      tombe(i % 37);
      spinRoulette({ rouge: 1 }, { silent: true, render: false });
      Math.random.mockRestore();
    }
    expect(rouletteHistory()).toHaveLength(ROULETTE_HISTORY_LEN);
    expect(hydrateState(JSON.parse(JSON.stringify(state))).rouletteHistory).toEqual(rouletteHistory());
    expect(hydrateState({ rouletteHistory: [3, 40, -1, "x", 7] }).rouletteHistory).toEqual([3, 7]);
    resetTemporaryRunState(state);
    expect(state.rouletteHistory).toEqual([]);
  });

  it("LE SALON PRIVÉ (Mécène) : pas de plafond, la mise va jusqu'à toute la bourse", () => {
    const { max } = tableLimits();
    // Familier : le salon commun est ouvert, le privé non.
    expect(rouletteVipUnlocked()).toBe(false);
    expect(spinRoulette({ rouge: max * 3 }, { vip: true, silent: true })).toBeNull();
    // Au salon commun, la limite tient.
    expect(spinRoulette({ rouge: max * 3 }, { silent: true })).toBeNull();
    state.maisonRank = 3; // Mécène
    expect(rouletteVipUnlocked()).toBe(true);
    expect(rouletteLimits(true)).toMatchObject({ min: 1, max: Math.floor(state.faveur) });
    tombe(1); // rouge
    const res = spinRoulette({ rouge: state.faveur }, { vip: true, silent: true, render: false });
    expect(res.stakeFaveur).toBe(1e7);
    expect(res.faveurGain).toBe(2e7);
    expect(state.faveur).toBe(2e7);
    // La réputation suit la mise, comme partout (la Maison t'a pris 1/37 en théorie).
    expect(maisonReputation()).toBeCloseTo((1e7 * (1 - ROULETTE_RTP)) / recettesPerHour(), 9);
    // Pas plus que la bourse.
    Math.random.mockRestore();
    expect(spinRoulette({ rouge: state.faveur + 1 }, { vip: true, silent: true })).toBeNull();
  });

  it("Monte-Carlo : 97,3 % sur la durée (±1 pt)", () => {
    let mise = 0, gain = 0;
    for (let i = 0; i < 40000; i += 1) {
      const res = spinRoulette({ n7: 1, rouge: 2, d3: 1 }, { silent: true, render: false });
      mise += res.stakeFaveur;
      gain += res.faveurGain;
    }
    expect(gain / mise).toBeGreaterThan(ROULETTE_RTP - 0.03);
    expect(gain / mise).toBeLessThan(ROULETTE_RTP + 0.03);
  });
});
