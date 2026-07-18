"use strict";
// Registre de la Chronique (stats à vie) : les recorders nourrissent
// state.chronicleStats, qui survit aux effondrements ET au Grand Reset. On teste
// les recorders (source unique de mutation), l'intégration d'un jeu, la
// préservation au GR et la normalisation à l'hydratation.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  state, setState, hydrateState, defaultState, defaultChronicleStats,
  buildGrandResetState, GR_PERSISTENT_FIELDS, invalidateRenderCache
} from "../state.js";
import {
  recordOsselets, recordIcarus, recordScratch, recordBlackjack,
  recordOffering, recordShopSpend, recordCollapse, recordEraGain,
  recordGrDiscovered, recordGrPerformed, recordMythCompleted
} from "../chronicleStats.js";
import { dealBlackjack } from "../actions.js";
import { __resetBlackjackForTests } from "../actions/blackjack.js";
import { D } from "../num.js";
import { MID_GAME_FIXTURE } from "./fixtures.js";

const C = (rank, suit = "olive") => ({ rank, suit });

beforeEach(() => {
  setState(hydrateState({}));
});
afterEach(() => {
  __resetBlackjackForTests();
  vi.restoreAllMocks();
});

describe("chronicleStats — recorders de jeux", () => {
  it("cumule parties / mise / gain / plus gros gain, et la Faveur gagnée à vie", () => {
    recordOsselets({ wagered: 4, won: 12, tier: "venus" });
    recordOsselets({ wagered: 4, won: 0, tier: "dog" });
    recordOsselets({ wagered: 4, won: 8, tier: "pair" });
    const g = state.chronicleStats.games.osselets;
    expect(g.plays).toBe(3);
    expect(g.wagered).toBe(12);
    expect(g.won).toBe(20);
    expect(g.biggest).toBe(12);   // le plus gros gain unique
    expect(g.venus).toBe(1);
    expect(g.dog).toBe(1);
    // La Faveur gagnée à vie agrège les gains de tous les jeux.
    expect(state.chronicleStats.faveurEarned).toBe(20);
  });

  it("Icare : record de multiplicateur, jackpots et chutes ; jackpot → plus grosse cagnotte", () => {
    recordIcarus({ wagered: 5, won: 12, mult: 2.4, crashed: false });
    recordIcarus({ wagered: 5, won: 0, crashed: true });
    recordIcarus({ wagered: 5, won: 60, mult: 12, jackpot: 40, crashed: false });
    const g = state.chronicleStats.games.icarus;
    expect(g.plays).toBe(3);
    expect(g.crashes).toBe(1);
    expect(g.bestMult).toBeCloseTo(12);
    expect(g.jackpots).toBe(1);
    expect(g.biggestJackpot).toBe(40);
    expect(state.chronicleStats.biggestPotRaked).toBe(40);
  });

  it("un vol offert (mise 0) reste un gain net positif", () => {
    recordIcarus({ wagered: 0, won: 15, mult: 3, crashed: false });
    const g = state.chronicleStats.games.icarus;
    expect(g.wagered).toBe(0);
    expect(g.won).toBe(15);
  });

  it("gratteux et vingt-et-un enregistrent leurs temps forts", () => {
    recordScratch({ wagered: 4, won: 20, symbol: "venus" });
    recordScratch({ wagered: 4, won: 40, symbol: "soleil" });
    recordBlackjack({ wagered: 5, won: 12, natural: true, streak: 3 });
    recordBlackjack({ wagered: 5, won: 0, natural: false, streak: 0 });
    expect(state.chronicleStats.games.scratch.venus).toBe(1);
    expect(state.chronicleStats.games.scratch.soleil).toBe(1);
    expect(state.chronicleStats.games.blackjack.naturals).toBe(1);
    expect(state.chronicleStats.games.blackjack.bestStreak).toBe(3);
  });
});

describe("chronicleStats — économie de Faveur & records", () => {
  it("offrandes et dépenses de Boutique", () => {
    recordOffering(50);
    recordShopSpend(30);
    expect(state.chronicleStats.offeringsCollected).toBe(50);
    expect(state.chronicleStats.faveurEarned).toBe(50); // l'offrande compte comme gagnée
    expect(state.chronicleStats.faveurSpentShop).toBe(30);
  });

  it("records d'effondrement : plus gros gain de ruines (Decimal), cycle, crises", () => {
    recordCollapse({ ruinGain: D("1.5e12"), cycleSec: 300, crises: 4 });
    recordCollapse({ ruinGain: D("2e10"), cycleSec: 900, crises: 2 });
    const cs = state.chronicleStats;
    expect(D(cs.biggestRuinGain).eq(D("1.5e12"))).toBe(true); // max conservé
    expect(cs.longestCycleSec).toBe(900);
    expect(cs.mostCrisesInCycle).toBe(4);
  });

  it("montée d'ère la plus rapide = minimum strict, ignore 0", () => {
    recordEraGain(0);
    expect(state.chronicleStats.fastestEraGainSec).toBe(0);
    recordEraGain(120);
    recordEraGain(90);
    recordEraGain(200);
    expect(state.chronicleStats.fastestEraGainSec).toBe(90);
  });
});

describe("chronicleStats — horodatages (horloge à vie)", () => {
  it("GR : découverte gravée une fois, GR effectué renseigne les deux instants", () => {
    state.chronicleStats.lifetimePlaySec = 1000;
    recordGrDiscovered(3);
    state.chronicleStats.lifetimePlaySec = 1500;
    recordGrDiscovered(3);                    // déjà découvert : inchangé
    expect(state.chronicleStats.grTimings[3].discovered).toBe(1000);
    state.chronicleStats.lifetimePlaySec = 2000;
    recordGrPerformed(3);
    expect(state.chronicleStats.grTimings[3].performed).toBe(2000);
  });

  it("Mythe : instant, durée du run et ordre ; idempotent", () => {
    state.chronicleStats.lifetimePlaySec = 500;
    recordMythCompleted("mythe_du_chaos", 1, 240);
    state.chronicleStats.lifetimePlaySec = 800;
    recordMythCompleted("mythe_de_promethee", 1, 120);
    recordMythCompleted("mythe_du_chaos", 1, 999); // idempotent : n'écrase pas
    const t = state.chronicleStats.mythTimings;
    expect(t.mythe_du_chaos).toEqual({ at: 500, runSec: 240, order: 1, act: 1 });
    expect(t.mythe_de_promethee.order).toBe(2);
    expect(t.mythe_de_promethee.at).toBe(800);
  });
});

describe("chronicleStats — intégration jeu", () => {
  it("une donne de vingt-et-un naturelle est comptée dans le registre", () => {
    setState(hydrateState(MID_GAME_FIXTURE));
    state.bestEraIndex = 4;   // vingt-et-un débloqué (>=3)
    state.faveur = 500;
    state.icarusPotFaveur = 0;
    __resetBlackjackForTests();
    invalidateRenderCache("all");
    // Sabot injecté : joueur A+K (naturel), croupier 9+7.
    dealBlackjack("legere", { deck: [C("A"), C("K"), C("9"), C("7")] });
    const g = state.chronicleStats.games.blackjack;
    expect(g.plays).toBe(1);
    expect(g.naturals).toBe(1);
    expect(g.won).toBeGreaterThan(0);
  });
});

describe("chronicleStats — persistance", () => {
  it("figure dans GR_PERSISTENT_FIELDS et survit au Grand Reset", () => {
    expect(GR_PERSISTENT_FIELDS).toContain("chronicleStats");
    state.chronicleStats.lifetimePlaySec = 9999;
    state.chronicleStats.games.osselets.plays = 42;
    state.chronicleStats.biggestRuinGain = "1.5e30";
    state.chronicleStats.mythTimings.mythe_du_chaos = { at: 10, runSec: 5, order: 1, act: 1 };
    const fresh = buildGrandResetState(3);
    expect(fresh.chronicleStats.lifetimePlaySec).toBe(9999);
    expect(fresh.chronicleStats.games.osselets.plays).toBe(42);
    expect(fresh.chronicleStats.biggestRuinGain).toBe("1.5e30");
    expect(fresh.chronicleStats.mythTimings.mythe_du_chaos.order).toBe(1);
  });

  it("defaultState fournit un registre plein (pas de null)", () => {
    const base = defaultState();
    expect(base.chronicleStats).toEqual(defaultChronicleStats());
    expect(base.chronicleStats.games.blackjack.bestStreak).toBe(0);
  });

  it("hydratation : normalise un registre partiel sans perte, biggestRuinGain reste une string", () => {
    const hydrated = hydrateState({
      chronicleStats: {
        lifetimePlaySec: 100,
        games: { osselets: { plays: 5, wagered: 20, won: 30, biggest: 12, venus: 2, dog: 1 } },
        faveurEarned: 30,
        biggestRuinGain: "1.5e30",
        grTimings: { 3: { discovered: 50, performed: null }, 99: { discovered: 1 } },
        mythTimings: { mythe_du_chaos: { at: 10, runSec: 5, order: 1, act: 1 } }
      }
    });
    const cs = hydrated.chronicleStats;
    expect(cs.lifetimePlaySec).toBe(100);
    expect(cs.games.osselets.plays).toBe(5);
    expect(cs.games.osselets.venus).toBe(2);
    // Jeux absents de la source → remplis à zéro.
    expect(cs.games.icarus.plays).toBe(0);
    expect(typeof cs.biggestRuinGain).toBe("string");
    expect(D(cs.biggestRuinGain).eq(D("1.5e30"))).toBe(true);
    expect(cs.grTimings[3].discovered).toBe(50);
    expect(cs.grTimings[99]).toBeUndefined();  // gr hors 1..11 rejeté
    expect(cs.mythTimings.mythe_du_chaos.order).toBe(1);
  });
});
