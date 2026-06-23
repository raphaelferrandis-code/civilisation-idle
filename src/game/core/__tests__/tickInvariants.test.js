"use strict";
// G-02 — Invariants du hot path tick(). decimal.smoke couvre déjà « pas de NaN /
// croissance Decimal » ; on verrouille ici les BORNES (que rien d'autre ne teste) :
// population >= 1, ressources >= 0, instability/timeWear dans [0,1], et le PLAFOND
// de montée de l'instabilité (anti-immortalité : INSTABILITY_MAX_RISE_PER_SEC).
// Setup calqué sur decimal.smoke (Date.now figé + fixture mid-game + crises
// neutralisées) : 50 ticks restent dans la zone sûre, sans déclencher d'effondrement
// (qui appellerait render()/save(), indisponibles en environnement node).

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { state, setState, hydrateState, invalidateRenderCache } from "../state.js";
import { tick } from "../actions/tick.js";
import { D } from "../num.js";
import { CRISIS_EVENTS } from "../../data/world.js";
import { INSTABILITY_MAX_RISE_PER_SEC } from "../balance.js";
import { MID_GAME_FIXTURE, FIXED_NOW } from "./fixtures.js";

beforeAll(() => {
  vi.spyOn(Date, "now").mockReturnValue(FIXED_NOW);
});
afterAll(() => {
  vi.restoreAllMocks();
});
beforeEach(() => {
  setState(hydrateState(MID_GAME_FIXTURE));
  // Neutralise les événements de crise (ouvriraient un dialogue UI absent en test).
  state.crisisThresholds = Object.fromEntries(CRISIS_EVENTS.map((e) => [e.id, true]));
  invalidateRenderCache("all");
});

describe("tick() — invariants de bornes", () => {
  it("maintient les bornes sur 50 ticks (pop>=1, ressources>=0, instability/timeWear in [0,1])", () => {
    for (let i = 0; i < 50; i += 1) {
      tick(1);
      expect(D(state.population).gte(1), `population@${i}`).toBe(true);
      for (const k of ["food", "gold", "knowledge", "infrastructure"]) {
        expect(D(state[k]).gte(0), `${k}@${i}`).toBe(true);
      }
      expect(state.instability >= 0 && state.instability <= 1, `instability@${i}=${state.instability}`).toBe(true);
      expect(state.timeWear >= 0 && state.timeWear <= 1, `timeWear@${i}=${state.timeWear}`).toBe(true);
    }
  });

  it("plafonne la MONTÉE de l'instabilité à INSTABILITY_MAX_RISE_PER_SEC * dt", () => {
    const dt = 1;
    const eps = 1e-9;
    for (let i = 0; i < 50; i += 1) {
      const before = state.instability;
      tick(dt);
      const rise = state.instability - before;
      // la hausse est plafonnée ; la baisse n'est pas concernée ; le snap final à 1
      // (instabilityTarget>=1 && next>=0.995) est l'unique exception tolérée.
      expect(
        rise <= INSTABILITY_MAX_RISE_PER_SEC * dt + eps || state.instability === 1,
        `montée@${i}=${rise}`
      ).toBe(true);
    }
  });

  it("dt=0 : aucune progression temporelle (ressources inchangées)", () => {
    const pop = D(state.population);
    const food = D(state.food);
    tick(0);
    expect(D(state.population).eq(pop)).toBe(true);
    expect(D(state.food).eq(food)).toBe(true);
  });
});
