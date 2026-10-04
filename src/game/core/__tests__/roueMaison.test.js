"use strict";
// LA ROUE DE LA MAISON, LES BOURSES DES TITRES ET L'ÉCHELLE DE LA FAVEUR (2026-10-04,
// docs/PLAN-GAINS-CASINO.md) — « comme les applis de casino » : un tour offert par
// heure, une bourse à chaque titre, et tous les nombres de la Faveur ×1 000 (les
// parties existantes passent à l'échelle par la migration 6 → 7).

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { state, setState, hydrateState, migrate, invalidateRenderCache, CURRENT_SAVE_VERSION } from "../state.js";
import { spinRoue, roueReady, roueUnlocked, roueValues, roueWaitMinutes } from "../actions/roueMaison.js";
import { recettesPerHour } from "../actions/maisonTable.js";
import { promoteRank } from "../actions/maisonRang.js";
import { ROUE_SEGMENTS_H, ROUE_INTERVAL_S, MAISON_RANKS, FAVEUR_ECHELLE } from "../balance.js";
import { MID_GAME_FIXTURE, FIXED_NOW } from "./fixtures.js";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
  setState(hydrateState(MID_GAME_FIXTURE));
  state.bestEraIndex = 10;
  state.faveur = 0;
  state.roueAt = 0;
  invalidateRenderCache("all");
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("La roue de la Maison", () => {
  it("seize cases égales, 1,125 h de recettes en moyenne", () => {
    expect(ROUE_SEGMENTS_H).toHaveLength(16);
    const moyenne = ROUE_SEGMENTS_H.reduce((a, b) => a + b, 0) / ROUE_SEGMENTS_H.length;
    expect(moyenne).toBeCloseTo(1.125, 12);
    expect(roueValues()).toEqual(ROUE_SEGMENTS_H.map((h) => Math.round(h * recettesPerHour())));
  });

  it("s'ouvre avec la Maison (Ère II)", () => {
    state.bestEraIndex = 1;
    expect(roueUnlocked()).toBe(false);
    expect(spinRoue({ silent: true, render: false })).toBeNull();
    state.bestEraIndex = 2;
    expect(roueReady()).toBe(true);
  });

  it("un tour verse sa case, puis attend une heure ; une absence n'en accumule pas", () => {
    vi.spyOn(Math, "random").mockReturnValue((15 + 0.5) / 16); // la couronne (5 h)
    const res = spinRoue({ silent: true, render: false });
    expect(res.index).toBe(15);
    expect(res.gain).toBe(Math.round(5 * recettesPerHour()));
    expect(state.faveur).toBe(res.gain);
    expect(state.chronicleStats.roueSpins).toBe(1);
    expect(state.chronicleStats.roueBest).toBe(res.gain);
    // La couronne s'écrit dans la Chronique.
    expect(state.history.some((l) => l.includes("plus belle case"))).toBe(true);
    expect(roueReady()).toBe(false);
    expect(roueWaitMinutes()).toBe(60);
    expect(spinRoue({ silent: true, render: false })).toBeNull();
    vi.setSystemTime(FIXED_NOW + ROUE_INTERVAL_S * 1000 - 1);
    expect(roueReady()).toBe(false);
    vi.setSystemTime(FIXED_NOW + 10 * ROUE_INTERVAL_S * 1000); // dix heures d'absence…
    expect(roueReady()).toBe(true);
    expect(spinRoue({ silent: true, render: false })).not.toBeNull(); // … un seul tour
    expect(spinRoue({ silent: true, render: false })).toBeNull();
  });

  it("le tour différé : la case est tirée, la Faveur attend l'arrêt de la roue", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.01); // case 0
    const res = spinRoue({ defer: true, silent: true, render: false });
    expect(state.faveur).toBe(0);
    expect(roueReady()).toBe(false); // le tour est pris dès le lancer
    res.apply();
    res.apply(); // idempotent
    expect(state.faveur).toBe(Math.round(ROUE_SEGMENTS_H[0] * recettesPerHour()));
  });

  it("l'heure du dernier tour survit à la sauvegarde", () => {
    spinRoue({ silent: true, render: false });
    expect(hydrateState(JSON.parse(JSON.stringify(state))).roueAt).toBe(FIXED_NOW);
    expect(hydrateState({ saveVersion: CURRENT_SAVE_VERSION, roueAt: -5 }).roueAt).toBe(0);
  });
});

describe("Les bourses des titres", () => {
  it("chaque titre verse ses heures de recettes (2, 5, 10, 20)", () => {
    expect(MAISON_RANKS.map((r) => r.faveurH)).toEqual([0, 2, 5, 10, 20]);
    state.maisonRank = 0;
    state.maisonReputation = 3; // Familier puis Notable
    promoteRank();
    expect(state.maisonRank).toBe(2);
    expect(state.faveur).toBe(Math.round(2 * recettesPerHour()) + Math.round(5 * recettesPerHour()));
    expect(state.history.some((l) => l.includes("elle te verse"))).toBe(true);
  });

  it("Prince à 40 h de réputation", () => {
    expect(MAISON_RANKS[4].threshold).toBe(40);
  });
});

describe("Migration 6 → 7 : l'échelle de la Faveur (×1 000)", () => {
  it("multiplie tout ce qui se compte en Faveur, rien d'autre", () => {
    const K = FAVEUR_ECHELLE;
    const out = migrate({
      saveVersion: 6,
      faveur: 1234, icarusPotFaveur: 56.5, trunkFaveur: 12.5, maisonRefund: 3, maisonGiftRefund: 4,
      icarusFreeFlights: [10, "plume", 25],
      slotsFreeSpins: { left: 5, stakeFaveur: 20, won: 7, total: 8 },
      templeAuto: { osselets: { unlocked: true, faveurFloor: 30 }, tronc: { unlocked: true } },
      chronicleStats: {
        faveurEarned: 100, faveurSpentShop: 50, offeringsCollected: 40, biggestPotRaked: 9,
        games: { icarus: { plays: 3, wagered: 30, won: 20, biggest: 15, biggestJackpot: 5, crashes: 1 } }
      },
      maisonReputation: 2.5, maisonRank: 1
    });
    expect(out.saveVersion).toBe(CURRENT_SAVE_VERSION);
    expect(out.faveur).toBe(1234 * K);
    expect(out.icarusPotFaveur).toBe(56.5 * K);
    expect(out.trunkFaveur).toBe(12.5 * K);
    expect(out.maisonRefund).toBe(3 * K);
    expect(out.maisonGiftRefund).toBe(4 * K);
    expect(out.icarusFreeFlights).toEqual([10 * K, 4 * K, 25 * K]);
    expect(out.slotsFreeSpins).toEqual({ left: 5, stakeFaveur: 20 * K, won: 7 * K, total: 8 });
    expect(out.templeAuto.osselets.faveurFloor).toBe(30 * K);
    expect(out.chronicleStats.faveurEarned).toBe(100 * K);
    expect(out.chronicleStats.games.icarus).toMatchObject({ plays: 3, wagered: 30 * K, won: 20 * K, biggest: 15 * K, biggestJackpot: 5 * K, crashes: 1 });
    // La réputation se compte en heures : elle ne bouge pas, le titre non plus.
    expect(out.maisonReputation).toBe(2.5);
    expect(out.maisonRank).toBe(1);
  });

  it("une bourse de fin de partie survit au rechargement (au-delà de MAX_SAFE_INTEGER)", () => {
    state.faveur = 1e20;
    state.chronicleStats.faveurEarned = 3e21;
    state.chronicleStats.games.roulette.wagered = 2e20;
    const s = hydrateState(JSON.parse(JSON.stringify(state)));
    expect(s.faveur).toBe(1e20);
    expect(s.chronicleStats.faveurEarned).toBe(3e21);
    expect(s.chronicleStats.games.roulette.wagered).toBe(2e20);
  });

  it("une save déjà à l'échelle n'est pas multipliée deux fois", () => {
    const s = hydrateState({ ...MID_GAME_FIXTURE, saveVersion: CURRENT_SAVE_VERSION, faveur: 777 });
    expect(s.faveur).toBe(777);
  });
});
