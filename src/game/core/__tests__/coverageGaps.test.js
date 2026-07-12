"use strict";
// Comble des trous de couverture du cœur relevés par l'audit 2026-07 :
//   G-22 : legitimacyGain (devise de prestige qui gate dynasties/Grand Reset) — 0 test.
//   G-24 : pickCrisisEvent (sélection de crise) + garde runtime G-13 (pool vide → null).

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { state, setState, hydrateState } from "../state.js";
import { Decimal, D } from "../num.js";
import { legitimacyGain, dynastyRuinsThreshold } from "../mechanics.js";
import { pickCrisisEvent } from "../actions/crisis.js";
import { generateEpitaph } from "../events.js";
import { CRISIS_POOL } from "../../data/world.js";
import { FIXED_NOW } from "./fixtures.js";

beforeAll(() => { vi.spyOn(Date, "now").mockReturnValue(FIXED_NOW); });
afterAll(() => { vi.restoreAllMocks(); });
beforeEach(() => { setState(hydrateState({})); });

describe("legitimacyGain (G-22)", () => {
  it("vaut 0 sous le seuil de fondation de dynastie", () => {
    state.ruins = new Decimal(0);
    expect(legitimacyGain()).toBe(0);
    // juste sous le seuil dynamique
    state.ruins = D(dynastyRuinsThreshold()).sub(1).max(0);
    expect(legitimacyGain()).toBe(0);
  });

  it("floor(sqrt(ruins/160) + cycles/12 + floor(dynastyCount/5)) au-dessus du seuil", () => {
    state.dynastiesSinceGR = 0;               // → seuil = base (petit devant 160000)
    state.ruins = new Decimal(160000);        // sqrt(160000/160) = sqrt(1000) ≈ 31.6228
    state.cycles = 0;
    state.dynastyCount = 0;
    expect(legitimacyGain()).toBe(31);
    state.cycles = 24;                         // +24/12 = 2
    state.dynastyCount = 15;                   // +floor(15/5) = 3
    expect(legitimacyGain()).toBe(36);        // floor(31.6228 + 2 + 3)
  });

  it("ne propage PAS Infinity : Ruines gigantesques → gain fini (plafond MAX_VALUE)", () => {
    state.dynastiesSinceGR = 0;
    state.ruins = new Decimal("1e650");       // toNum → Infinity, sqrt → Infinity, min(MAX_VALUE,…)
    state.cycles = 4;
    state.dynastyCount = 4;
    expect(Number.isFinite(legitimacyGain())).toBe(true);
  });
});

describe("pickCrisisEvent (G-24) + garde runtime G-13", () => {
  it("retourne un event du seuil demandé, de façon déterministe (même état → même choix)", () => {
    const e = pickCrisisEvent(0.25);
    expect(e).toBeTruthy();
    expect(e.threshold).toBe(0.25);
    expect(pickCrisisEvent(0.25)).toBe(e);
  });

  it("seuil sans crise → null (garde : pas de state.cycles % 0 = NaN → crash event.id)", () => {
    expect(pickCrisisEvent(0.99)).toBe(null);
  });

  it("tous les ids déjà récents → repli sur les candidats (jamais null tant que le pool existe)", () => {
    const pool25 = CRISIS_POOL.filter((e) => e.threshold === 0.25);
    expect(pool25.length).toBeGreaterThan(0);
    state.recentCrisisIds = pool25.map((e) => e.id);
    const e = pickCrisisEvent(0.25);
    expect(e).toBeTruthy();
    expect(e.threshold).toBe(0.25);
  });

  it("sélection reproductible à state.cycles fixé", () => {
    state.recentCrisisIds = [];
    state.cycles = 0;
    const a = pickCrisisEvent(0.25);
    state.cycles = 0;
    expect(pickCrisisEvent(0.25)).toBe(a);
  });
});

describe("generateEpitaph (G-23 / CORE-15 — était 0 test)", () => {
  it("produit une épitaphe non vide, localisée, pour la cause 'time'", () => {
    state.timeWear = 1;                       // → collapseCause() renvoie "time"
    const ep = generateEpitaph();
    expect(typeof ep).toBe("string");
    expect(ep.length).toBeGreaterThan(10);
    expect(ep.toLowerCase()).toContain("temps"); // épitaphe du temps, en FR (défaut test)
  });

  it("ne plante pas et renvoie une string sur un état de crise ordinaire (autre cause)", () => {
    state.timeWear = 0;
    const ep = generateEpitaph();
    expect(typeof ep).toBe("string");
    expect(ep.length).toBeGreaterThan(10);
  });
});
