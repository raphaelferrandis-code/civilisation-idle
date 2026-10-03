"use strict";
// Vœux du cycle (« pactes », 2026-10) branchés sur les VRAIS actes du jeu : une
// politique rompt « Le laisser-faire », une réforme de fond rompt « La
// tradition », une crise dont on profite compte pour « L'audace ».

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as stateModule from "../state.js";
import "../main.js";
import { togglePolicy, runCrisisAction, autoResolveCrisisEvent } from "../actions/crisis.js";
import { cycleVowStatus, cycleVowRuinMult } from "../../data/vows.js";
import { CRISIS_POOL } from "../../data/world.js";
import { VOW_FAIL_MULT } from "../balance.js";
import { D } from "../num.js";
import { MID_GAME_FIXTURE, FIXED_NOW } from "./fixtures.js";

const { state, setState, hydrateState, invalidateRenderCache, setGamePaused } = stateModule;
const pledge = (id, target = 0) => { state.cycleVow = { offered: [], chosen: { id, target, base: 0 }, done: false, broken: false }; };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
  setState(hydrateState(MID_GAME_FIXTURE));
  setGamePaused(false);
  state.food = D(1e12); state.gold = D(1e12); state.knowledge = D(1e12);
  invalidateRenderCache("all");
});
afterEach(() => { vi.useRealTimers(); });

describe("vœux du cycle — ruptures par les actes du jeu", () => {
  it("activer une politique rompt « Le laisser-faire »", () => {
    pledge("sans_politique");
    togglePolicy("curfew");
    expect(state.activePolicies).toContain("curfew");
    expect(cycleVowStatus(state).broken).toBe(true);
    expect(cycleVowRuinMult(state)).toBe(VOW_FAIL_MULT);
  });

  it("une réforme de fond rompt « La tradition », un apaisement non", () => {
    pledge("sans_reforme");
    runCrisisAction("rationing", { render: false });
    expect(cycleVowStatus(state).broken).toBe(false);
    runCrisisAction("reformScarcity", { render: false });
    expect(cycleVowStatus(state).broken).toBe(true);
  });

  it("profiter d'une crise compte pour « L'audace », la traiter non", () => {
    pledge("audace", 3);
    const ev = CRISIS_POOL[0];
    autoResolveCrisisEvent(ev, "stabiliser");
    expect(state.cycleCrisesProfited || 0).toBe(0);
    autoResolveCrisisEvent(ev, "temporiser");
    expect(state.cycleCrisesProfited).toBe(1);
    expect(cycleVowStatus(state).progress).toBeCloseTo(1 / 3, 5);
  });
});
