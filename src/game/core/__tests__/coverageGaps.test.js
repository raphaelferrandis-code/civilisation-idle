"use strict";
// Comble des trous de couverture du cœur relevés par l'audit 2026-07 :
//   G-24 : pickCrisisEvent (sélection de crise) + garde runtime G-13 (pool vide → null).
// (G-22 legitimacyGain retiré : la légitimité/dynastie a été supprimée du jeu.)

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { state, setState, hydrateState } from "../state.js";
import { Decimal, D } from "../num.js";
import { pickCrisisEvent } from "../actions/crisis.js";
import { generateEpitaph } from "../events.js";
import { CRISIS_POOL } from "../../data/world.js";
import { FIXED_NOW } from "./fixtures.js";

beforeAll(() => { vi.spyOn(Date, "now").mockReturnValue(FIXED_NOW); });
afterAll(() => { vi.restoreAllMocks(); });
beforeEach(() => { setState(hydrateState({})); });

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
