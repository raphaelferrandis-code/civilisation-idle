"use strict";
// Bulles des habitants (2026-07-16) : la récompense d'un clic suit la
// PRODUCTION nette courante (≈90 s du taux affiché), plus le stock — l'ancien
// « 5 % du stock » devenait dérisoire ou démesuré selon la phase de partie.
// Forfait plancher quand la ressource ne produit pas (ou pas encore).

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { state, setState, hydrateState, invalidateRenderCache } from "../state.js";
import { rewardCitizenThought } from "../actions.js";
import { rates, cityVitals, pressureBreakdown } from "../mechanics.js";
import { D, toNum } from "../num.js";
import { MID_GAME_FIXTURE, FIXED_NOW } from "./fixtures.js";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
  setState(hydrateState(MID_GAME_FIXTURE));
  invalidateRenderCache("all");
});

afterEach(() => {
  vi.useRealTimers();
});

const CITIZEN = { name: "Testeur", role: "test" };

describe("rewardCitizenThought", () => {
  it.each([
    ["lightning", "gold", 5, "Or"],
    ["scroll", "knowledge", 15, "Savoir"],
    ["thought", "food", 10, "Nourriture"]
  ])("%s verse ≈90 s de production de %s", (type, key, floor, label) => {
    const r = rates(cityVitals(), pressureBreakdown());
    const expected = D(r[key]).max(0).mul(90).ceil().max(floor);
    const before = D(state[key]);
    const text = rewardCitizenThought(type, CITIZEN);
    expect(toNum(D(state[key]).sub(before))).toBe(toNum(expected));
    expect(text).toContain(label);
    expect(text.startsWith("+")).toBe(true);
  });

  it("retombe sur le forfait plancher quand la ressource ne produit pas", () => {
    // Début de partie : aucune académie, la production de savoir est nulle.
    setState(hydrateState({}));
    invalidateRenderCache("all");
    const r = rates(cityVitals(), pressureBreakdown());
    expect(toNum(r.knowledge)).toBe(0);
    const before = toNum(state.knowledge);
    rewardCitizenThought("scroll", CITIZEN);
    expect(toNum(state.knowledge) - before).toBe(15);
  });
});
