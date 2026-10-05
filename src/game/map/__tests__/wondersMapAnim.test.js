"use strict";
// BUG-12 (audit du 2026-10-05) : la carte ne grave plus les rangs de merveille,
// elle ne fait que jouer l'érection de ce que le cœur a gravé — même quand le
// rang est monté pendant qu'elle ne tournait pas.

import { describe, it, expect, beforeEach } from "vitest";
import { CM, CM_WONDERS, cmCheckWonders } from "../layout.js";
import { WONDERS } from "../../core/mechanics/wonders.js";
import { state, setState, hydrateState } from "../../core/state.js";
import { D } from "../../core/num.js";

beforeEach(() => {
  setState(hydrateState({ population: 50_000, cycles: 0, wonders: [], wonderTiers: {} }));
  CM.born = {};
});

describe("carte : animation seule des merveilles (BUG-12)", () => {
  it("relit la liste du cœur (même tableau, même ordre de slots)", () => {
    expect(CM_WONDERS).toBe(WONDERS);
  });

  it("n'écrit jamais l'état, anime ce que le cœur a gravé, et seulement ce qui monte", () => {
    cmCheckWonders(1000);                       // premier relevé : simple alignement
    expect(CM.born).toEqual({});

    // Métrique franchie mais rien de gravé : la carte ne grave plus rien.
    state.population = D(5e6);
    state.cyclePeaks.population = D(5e6);
    cmCheckWonders(2000);
    expect(state.wonders).toEqual([]);
    expect(state.wonderTiers).toEqual({});
    expect(CM.born["wonder:pop1m"]).toBeUndefined();

    // Le cœur grave (tick, chute, absence) : la frame suivante joue l'érection.
    state.wonders = ["pop1m"];
    state.wonderTiers = { pop1m: 1 };
    cmCheckWonders(3000);
    expect(CM.born["wonder:pop1m"]).toBe(3000);

    // Rien n'a monté depuis : pas de nouvelle érection.
    cmCheckWonders(4000);
    expect(CM.born["wonder:pop1m"]).toBe(3000);

    // Montée de rang gravée pendant que la carte était démontée : rejouée au retour.
    state.wonderTiers.pop1m = 2;
    cmCheckWonders(5000);
    expect(CM.born["wonder:pop1m"]).toBe(5000);

    // Grand Reset (merveilles effacées) : suivi sans animation, puis re-érection animée.
    state.wonders = [];
    state.wonderTiers = {};
    CM.born = {};
    cmCheckWonders(6000);
    expect(CM.born).toEqual({});
    state.wonders = ["pop1m"];
    state.wonderTiers = { pop1m: 1 };
    cmCheckWonders(7000);
    expect(CM.born["wonder:pop1m"]).toBe(7000);
  });
});
