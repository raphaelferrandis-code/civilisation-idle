"use strict";
// Le plancher et le bonus PLAT d'ère de ruinGain mûrissent avec le cycle (courbe
// de patience, plafonnée à 1). Versés tels quels à chaque chute, ils faisaient
// des cycles éclair une rente : ~340 chutes de 3 min à 4 Ruines (bench-crises.js).

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as stateModule from "../state.js";
import { ruinGain } from "../mechanics.js";
import { eraTier } from "../../data/world.js";
import { ERA_RUIN_BONUS_PER_INDEX } from "../balance.js";
import { FIXED_NOW } from "./fixtures.js";

const { state, setState, hydrateState, invalidateRenderCache } = stateModule;

// Petite cité (gain « réel » ≈ 0) mais ère maximale haute : tout le gain vient
// du plancher et du bonus plat — exactement le profil des cycles éclair.
const youngCity = (ageSec) => hydrateState({
  population: 2000, food: 8000, gold: 2000, knowledge: 500, infrastructure: 100,
  cycles: 12, bestEraIndex: 12,
  cyclePeaks: { population: 2000, knowledge: 500, infrastructure: 100, eraIndex: 3 },
  cycleStartedAt: FIXED_NOW - ageSec * 1000, lastTick: FIXED_NOW
});
const gainAt = (ageSec) => {
  setState(youngCity(ageSec));
  invalidateRenderCache("all");
  return ruinGain(true).toNumber();
};

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(FIXED_NOW); });
afterEach(() => { vi.useRealTimers(); });

describe("ruinGain — le bonus plat mûrit avec le cycle", () => {
  const flat = ERA_RUIN_BONUS_PER_INDEX * eraTier(12);

  it("un cycle mûr (≥ 10 min) touche tout le bonus d'ère", () => {
    expect(flat).toBeGreaterThanOrEqual(4);
    expect(gainAt(15 * 60)).toBeGreaterThanOrEqual(flat);
  });

  it("un cycle de 3 min n'en touche qu'une partie (patience ×0.45)", () => {
    const g3 = gainAt(3 * 60);
    expect(g3).toBeLessThanOrEqual(Math.floor(flat * 0.45) + 1);
    expect(g3).toBeLessThan(gainAt(15 * 60));
  });

  it("au moins 1 Ruine après 2 min : le bouton d'effondrement ne se bloque jamais", () => {
    expect(gainAt(150)).toBeGreaterThanOrEqual(1);
    expect(state.cycles).toBe(12);
  });
});
