"use strict";
// UNE RÈGLE, UN ENDROIT (audit du 05/10, STRUCT-12). Ces petites règles étaient
// recopiées, avec en commentaire « ne pas laisser diverger » : l'horloge figée du cycle
// (vœux / moisson), le compte des Mythes (Effondrement, sceaux, merveille), la
// Bénédiction (boutique / production), la résolution d'une crise (Conseil / dialogue).
// Les copies sont devenues des lectures ; ces gardes tiennent qu'elles rendent la même
// chose que la source.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import * as stateModule from "../state.js";
const { state, setState, hydrateState, invalidateRenderCache, setGamePaused } = stateModule;
// main.js enregistre le pont world.js↔core (registerWorldEffects) : les apply() des
// crises en ont besoin en environnement headless (cf. crisisDoctrine.test.js).
import "../main.js";
import { cycleYearFrozen } from "../actions/utils.js";
import { cycleClockNow, completedMythCount as mythCountBarrel } from "../mechanics.js";
import { completedMythCount } from "../mechanics/shared.js";
import { WONDERS } from "../mechanics/wonders.js";
import { blessingMultiplier } from "../actions/faveurShop.js";
import { blessingProductionMultiplier } from "../mechanics/production/crisisLevers.js";
import { autoResolveCrisisEvent } from "../actions/crisis.js";
import { CRISIS_POOL } from "../../data/world.js";
import { HEPH_POP_CRISIS_THRESHOLD } from "../../data/myths.js";
import { MID_GAME_FIXTURE, FIXED_NOW } from "./fixtures.js";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
  setState(hydrateState(MID_GAME_FIXTURE));
  setGamePaused(false);
  invalidateRenderCache("all");
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("l'horloge du cycle : celle des vœux EST celle de la moisson", () => {
  it("hors crise, elle suit l'heure", () => {
    state.cycleStartedAt = FIXED_NOW - 5 * 60 * 1000;
    expect(cycleClockNow()).toBe(FIXED_NOW);
    expect(cycleYearFrozen()).toBe(6);
  });
  it("en crise terminale, elle se fige à l'ouverture — et l'an des vœux avec elle", () => {
    state.cycleStartedAt = FIXED_NOW - 5 * 60 * 1000;
    state.crisisLimitAnnounced = true;
    state.crisisOpenedAt = FIXED_NOW - 2 * 60 * 1000;
    expect(cycleClockNow()).toBe(state.crisisOpenedAt);
    expect(cycleYearFrozen()).toBe(4);
    vi.setSystemTime(FIXED_NOW + 60 * 60 * 1000);
    expect(cycleClockNow()).toBe(state.crisisOpenedAt);
    expect(cycleYearFrozen()).toBe(4);
  });
});

describe("le compte des Mythes : une seule règle", () => {
  it("pure sur l'état donné, et la même partout", () => {
    const s = { mythsCompleted: { a: true, b: false, c: 1, d: null, e: true } };
    expect(completedMythCount(s)).toBe(3);
    expect(completedMythCount({})).toBe(0);
    expect(mythCountBarrel).toBe(completedMythCount);
    const eye = WONDERS.find((w) => w.id === "era_singularity");
    expect(eye.metric(s)).toBe(3);
    state.mythsCompleted = { x: true, y: true };
    expect(completedMythCount()).toBe(2);
  });
});

describe("la Bénédiction : la boutique lit celle de la production", () => {
  it("sans, active, expirée, rendue permanente par le Char du Soleil", () => {
    const cases = [
      () => { state.blessingUntil = 0; state.blessingMult = 1; },
      () => { state.blessingUntil = FIXED_NOW + 1000; state.blessingMult = 1.5; },
      () => { state.blessingUntil = FIXED_NOW - 1; state.blessingMult = 1.5; },
      () => { state.blessingUntil = 0; state.templeArtifacts = { ...(state.templeArtifacts || {}), char: true }; },
    ];
    for (const set of cases) {
      set();
      expect(blessingMultiplier()).toBe(blessingProductionMultiplier());
    }
  });
});

describe("la crise : le Conseil et le dialogue appliquent les mêmes règles", () => {
  const grainPanic = CRISIS_POOL.find((e) => e.id === "grain_panic");
  it("Héphaïstos sous son seuil : la crise s'impose, aucun choix appliqué", () => {
    state.activeMythId = "mythe_d_hephaistos";
    state.population = HEPH_POP_CRISIS_THRESHOLD - 1;
    const shift = { ...(state.foyerShift || {}) };
    const before = state.instability || 0;
    autoResolveCrisisEvent(grainPanic, "stabiliser");
    expect(state.instability).toBeCloseTo(Math.min(1, before + 0.05), 10);
    expect(state.foyerShift || {}).toEqual(shift);
  });
  it("un choix appliqué compte la crise (stabilisée ou dont on a profité)", () => {
    const r0 = state.cycleCrisesResolved || 0, p0 = state.cycleCrisesProfited || 0;
    autoResolveCrisisEvent(grainPanic, "stabiliser");
    expect(state.cycleCrisesResolved).toBe(r0 + 1);
    autoResolveCrisisEvent(grainPanic, "temporiser");
    expect(state.cycleCrisesProfited).toBe(p0 + 1);
    expect(state.instability).toBeGreaterThanOrEqual(0);
    expect(state.instability).toBeLessThanOrEqual(1);
  });
});
