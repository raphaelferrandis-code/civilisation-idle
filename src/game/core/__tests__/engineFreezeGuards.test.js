"use strict";
// BUG-71 (audit du 2026-10-05) : le gel en crise et en deuil ne tenait que par
// l'interface. Les verbes moteur refusent désormais eux-mêmes sous une pause
// (dialogue, deuil d'un Édit), pendant la chute et en crise terminale ; Atlas
// coupe l'effondrement manuel au moteur ; les paliers de cycle des actions de
// base de la Dissidence ont une source unique, imposée par runCrisisAction.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  state, setState, hydrateState, invalidateRenderCache, setGamePaused, setCollapseInProgress,
  collapseInProgress
} from "../state.js";
import { buyBuilding, buyAllAffordable, buyUpgrade } from "../actions/building.js";
import { buyBuildingCore } from "../actions/building.js";
import { buyRoadWorkCore } from "../actions/roadWorks.js";
import { togglePolicy, collapse, runCrisisAction } from "../actions/crisis.js";
import { comptoirBuy, comptoirSellFood } from "../actions/myths.js";
import { stewardActionAllowed } from "../actions/steward.js";
import { regulationActionUnlocked, regulationContext } from "../mechanics/crisis-cost.js";
import { REGULATION_POLICIES } from "../../data/regulationActions.js";
import { D } from "../num.js";
import { MID_GAME_FIXTURE, FIXED_NOW } from "./fixtures.js";

const RICH = 1e30;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
  setState(hydrateState(MID_GAME_FIXTURE));
  setGamePaused(false);
  setCollapseInProgress(false);
  state.food = D(RICH); state.gold = D(RICH); state.knowledge = D(RICH);
  state.infrastructure = D(RICH); state.population = D(RICH);
  state.faveur = RICH;
  invalidateRenderCache("all");
});

afterEach(() => {
  setGamePaused(false);
  setCollapseInProgress(false);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// Les trois gels : pause de dialogue (et deuil), chute en cours, crise terminale.
const FREEZES = [
  ["sous une pause (dialogue, deuil d'un Édit)", () => setGamePaused(true)],
  ["pendant la chute", () => setCollapseInProgress(true)],
  ["en crise terminale", () => { state.crisisLimitAnnounced = true; }]
];

describe("achats gelés au moteur (BUG-71)", () => {
  for (const [label, freeze] of FREEZES) {
    it(`aucun achat ${label}`, () => {
      freeze();
      const before = JSON.stringify({ b: state.buildings, k: String(state.knowledge), u: state.upgrades, rw: state.roadWorks, bank: state.roadWorksBank });
      expect(buyBuilding("foragers")).toBe(false);
      expect(buyBuildingCore("foragers", { amount: 1 })).toBe(false);
      expect(buyBuildingCore("roads")).toBe(false);          // la voirie redirigée aussi
      expect(buyRoadWorkCore()).toBe(false);
      expect(buyAllAffordable(null)).toBe(0);
      expect(buyUpgrade("reforme_administrative")).toBe(false);
      expect(JSON.stringify({ b: state.buildings, k: String(state.knowledge), u: state.upgrades, rw: state.roadWorks, bank: state.roadWorksBank })).toBe(before);
    });
  }

  it("hors gel, les mêmes achats passent (le test ci-dessus ne refuse pas pour une autre raison)", () => {
    const n = state.buildings.foragers;
    expect(buyBuilding("foragers")).toBe(true);
    expect(state.buildings.foragers).toBeGreaterThan(n);
    expect(buyUpgrade("reforme_administrative")).toBe(true);
  });
});

describe("politiques et Comptoir gelés au moteur (BUG-71)", () => {
  const policyId = REGULATION_POLICIES.find((p) => !p.unlock)?.id || REGULATION_POLICIES[0].id;

  for (const [label, freeze] of FREEZES) {
    it(`aucune politique basculée ${label}`, () => {
      state.activePolicies = [];
      freeze();
      togglePolicy(policyId);
      expect(state.activePolicies).toEqual([]);
    });
  }

  it("Comptoir refusé sous une pause", () => {
    state.orHeritage = true;
    setGamePaused(true);
    const gold = String(state.gold), food = String(state.food);
    comptoirBuy("food");
    comptoirSellFood();
    expect(String(state.gold)).toBe(gold);
    expect(String(state.food)).toBe(food);
  });
});

describe("Atlas coupe l'effondrement manuel au moteur (BUG-71)", () => {
  it("collapse(\"manual\") refusé sous Atlas, même Rupture pleine", () => {
    state.activeMythId = "mythe_d_atlas";
    state.instability = 1;
    expect(collapse("manual")).toBe(false);
    expect(collapseInProgress).toBe(false);
  });
});

describe("paliers de cycle des actions de base : une source moteur (BUG-71)", () => {
  it("Catastrophes au 2e cycle, Culte des ancêtres au 3e — moteur, Intendance et contexte d'accord", () => {
    for (const [cycles, archive, ancestor] of [[1, false, false], [2, true, false], [3, true, true]]) {
      state.cycles = cycles;
      const ctx = regulationContext();
      expect(regulationActionUnlocked("archiveCrisis", ctx)).toBe(archive);
      expect(regulationActionUnlocked("ancestorCrisis", ctx)).toBe(ancestor);
      expect(stewardActionAllowed("archiveCrisis", ctx)).toBe(archive);
      expect(stewardActionAllowed("ancestorCrisis", ctx)).toBe(ancestor);
    }
    // Les actions de base sans palier restent ouvertes.
    expect(regulationActionUnlocked("rationing")).toBe(true);
  });

  it("runCrisisAction impose le palier : Culte des ancêtres refusé au 2e cycle, accepté au 3e", () => {
    // Coût en secondes de production : population de la fixture, stocks pleins.
    state.population = D(MID_GAME_FIXTURE.population);
    invalidateRenderCache("all");
    state.instability = 0.5;
    state.cycles = 2;
    const before = state.crisisActions.festivals;
    runCrisisAction("ancestorCrisis", { render: false });
    expect(state.crisisActions.festivals).toBe(before);
    state.cycles = 3;
    runCrisisAction("ancestorCrisis", { render: false });
    expect(state.crisisActions.festivals).toBe(before + 1);
  });
});
