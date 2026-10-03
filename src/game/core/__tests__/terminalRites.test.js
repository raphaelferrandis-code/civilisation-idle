"use strict";
// Rites de la chute (décision de Raph, 2026-10-03, option « A ») : en crise
// terminale, UN rite avant de tomber — sans sursis (la jauge ne redescend pas,
// aucun malus), il rapporte des Ruines et déclare la cause de la chute. Coût en
// secondes de production de sa ressource : le Total demande d'avoir épargné.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as stateModule from "../state.js";
import "../main.js";
import { runTerminalCrisisAction } from "../actions/crisis.js";
import { collapseCause } from "../events.js";
import {
  rates, crisisOpen, terminalCrisisCost, terminalCrisisReady, terminalRiteSealed,
  TERMINAL_PREP_TIERS, TERMINAL_RITE_RESOURCE, TERMINAL_EDICT_CAUSE
} from "../mechanics.js";
import { D, toNum } from "../num.js";
import { MID_GAME_FIXTURE, FIXED_NOW } from "./fixtures.js";

const { state, setState, hydrateState, invalidateRenderCache } = stateModule;

// Crise terminale ouverte (jauge à 100 %), stocks confortables.
const openCrisis = () => {
  setState(hydrateState(MID_GAME_FIXTURE));
  state.instability = 1;
  state.crisisLimitAnnounced = true;
  state.crisisOpenedAt = FIXED_NOW;
  state.collapsePreparation = 0;
  state.declaredFallCause = null;
  state.terminalPreparations = { used: {} };
  invalidateRenderCache("all");
};
const rate = (res) => toNum(rates()[res]);

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(FIXED_NOW); openCrisis(); });
afterEach(() => { vi.useRealTimers(); });

describe("rites de la chute", () => {
  it("chaque rite se paie en secondes de production de SA ressource", () => {
    for (const [type, res] of Object.entries(TERMINAL_RITE_RESOURCE)) {
      if (!(rate(res) > 0)) continue; // ressource pas encore produite : cf. test dédié
      const cost = terminalCrisisCost(type, 0);
      expect(Object.keys(cost)).toEqual([res]);
      expect(toNum(cost[res])).toBeCloseTo(rate(res) * TERMINAL_PREP_TIERS[type][0].seconds, 0);
    }
  });

  it("sans sursis : la crise reste ouverte, la jauge ne redescend pas, aucun malus", () => {
    state.food = D(rate("food") * 1000);
    const goldRateBefore = rate("gold");
    runTerminalCrisisAction("exodus", 0);
    invalidateRenderCache("all");
    expect(crisisOpen()).toBe(true);
    expect(state.instability).toBe(1);
    expect(rate("gold")).toBeCloseTo(goldRateBefore, 6);
    expect(state.collapsePreparation).toBeCloseTo(TERMINAL_PREP_TIERS.exodus[0].prep, 9);
  });

  it("le rite déclare la cause de la chute", () => {
    state.gold = D(rate("gold") * 1000);
    runTerminalCrisisAction("holdOrder", 0);
    expect(state.declaredFallCause).toBe(TERMINAL_EDICT_CAUSE.holdOrder);
    expect(collapseCause()).toBe("rupture");
  });

  it("pas de rite sans production de sa ressource (sinon il coûterait 1)", () => {
    // La fixture ne produit pas encore de Savoir (avant l'ère 3, c'est la règle).
    expect(rate("knowledge")).toBe(0);
    state.knowledge = D(1e9);
    expect(terminalCrisisReady("prepareArchives", 2)).toBe(false);
  });

  it("un seul rite par chute", () => {
    state.food = D(rate("food") * 1000);
    state.gold = D(rate("gold") * 1000);
    runTerminalCrisisAction("exodus", 0);
    expect(terminalRiteSealed()).toBe(true);
    const goldBefore = toNum(state.gold);
    expect(terminalCrisisReady("holdOrder", 0)).toBe(false);
    runTerminalCrisisAction("holdOrder", 0);
    expect(toNum(state.gold)).toBe(goldBefore);
    expect(state.declaredFallCause).toBe("famine");
  });

  it("le Total demande d'avoir épargné ; le Mesuré, non", () => {
    state.food = D(rate("food") * 30); // 30 s de production en stock
    expect(terminalCrisisReady("exodus", 0)).toBe(true);
    expect(terminalCrisisReady("exodus", 2)).toBe(false);
    state.food = D(rate("food") * 200);
    expect(terminalCrisisReady("exodus", 2)).toBe(true);
  });

  it("hors crise, aucun rite", () => {
    state.crisisLimitAnnounced = false;
    state.instability = 0.5;
    invalidateRenderCache("all");
    expect(terminalCrisisReady("exodus", 0)).toBe(false);
  });
});
