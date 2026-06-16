"use strict";
// Couvre les invariants du chantier "gain idle + doctrine de crise"
// (cf. CE-spec-idle-crises.md) : état/hydratation/migration de crisisDoctrine,
// cap idle (Veilleurs de nuit), progression hors-ligne (prod + Usure capées),
// et auto-résolution des crises selon la posture (sans pause).

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import * as stateModule from "../state.js";
const { state, setState, hydrateState, defaultState, invalidateRenderCache, setGamePaused } = stateModule;
// Importer main.js enregistre aussi le pont world.js↔core (registerWorldEffects),
// nécessaire pour que les apply() des crises fonctionnent en environnement headless.
import { idleCapSeconds, applyOfflineProgress } from "../main.js";
import { autoResolveCrisisEvent } from "../actions/crisis.js";
import { CRISIS_POOL } from "../../data/world.js";
import { toNum } from "../num.js";
import { MID_GAME_FIXTURE, FIXED_NOW } from "./fixtures.js";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
  setState(hydrateState(MID_GAME_FIXTURE));
  setGamePaused(false);
  invalidateRenderCache("all");
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("crisisDoctrine — état / hydratation / migration", () => {
  it("defaultState fournit une doctrine neutre", () => {
    const d = defaultState().crisisDoctrine;
    expect(d.p25).toBe("ask");
    expect(d.p50).toBe("ask");
    expect(d.p75).toBe("ask");
    expect(d.autoCollapse.enabled).toBe(false);
    expect(d.autoCollapse.trigger).toBe("rupture100");
  });

  it("hydratation : postures valides conservées, invalides → ask", () => {
    const h = hydrateState({
      crisisDoctrine: {
        p25: "stabiliser",
        p50: "n_importe_quoi",
        autoCollapse: { trigger: "temps", timeSeconds: 300, usureThreshold: 5 }
      }
    });
    expect(h.crisisDoctrine.p25).toBe("stabiliser");
    expect(h.crisisDoctrine.p50).toBe("ask");
    expect(h.crisisDoctrine.autoCollapse.trigger).toBe("temps");
    expect(h.crisisDoctrine.autoCollapse.timeSeconds).toBe(300);
    expect(h.crisisDoctrine.autoCollapse.usureThreshold).toBeLessThanOrEqual(1); // borné
  });

  it("migration : anciens auto-effondrements → conseil_de_crise + edit_effondrement + auto activé", () => {
    const h = hydrateState({ upgrades: { conseil_de_regence: true } });
    expect(h.upgrades.conseil_de_crise).toBe(true);
    expect(h.upgrades.edit_effondrement).toBe(true);
    expect(h.crisisDoctrine.autoCollapse.enabled).toBe(true);
    // Les anciens ids ne sont plus des upgrades valides → filtrés.
    expect(h.upgrades.conseil_de_regence).toBeUndefined();
  });
});

describe("idleCapSeconds — paliers Veilleurs de nuit", () => {
  it("2 h de base sans aucun palier", () => {
    expect(idleCapSeconds()).toBe(2 * 3600);
  });

  it("les paliers possédés cumulent le cap (2h + 2h + 4h = 8h)", () => {
    state.upgrades.veilleurs_nuit_1 = true;
    state.upgrades.veilleurs_nuit_2 = true;
    expect(idleCapSeconds()).toBe(8 * 3600);
  });
});

describe("applyOfflineProgress — prod + Usure couplées, capées", () => {
  it("crédite la production et avance l'Usure", () => {
    const popBefore = toNum(state.population);
    const wearBefore = state.timeWear;
    applyOfflineProgress(3600); // 1 h, sous le cap de 2 h
    expect(toNum(state.population)).toBeGreaterThan(popBefore);
    expect(state.timeWear).toBeGreaterThan(wearBefore);
  });

  it("borne l'absence au cap (2 h) : 10 h ne crédite pas plus que 2 h", () => {
    setState(hydrateState(MID_GAME_FIXTURE));
    const base = toNum(state.population);
    applyOfflineProgress(2 * 3600);
    const at2h = toNum(state.population) - base;

    setState(hydrateState(MID_GAME_FIXTURE));
    const base2 = toNum(state.population);
    applyOfflineProgress(10 * 3600);
    const at10h = toNum(state.population) - base2;

    expect(at10h).toBeCloseTo(at2h, 6);
  });

  it("ne touche à rien si la crise terminale est déjà ouverte", () => {
    state.crisisLimitAnnounced = true;
    const popBefore = toNum(state.population);
    const wearBefore = state.timeWear;
    applyOfflineProgress(3600);
    expect(toNum(state.population)).toBe(popBefore);
    expect(state.timeWear).toBe(wearBefore);
  });
});

describe("autoResolveCrisisEvent — selon la posture, sans pause", () => {
  const grainPanic = CRISIS_POOL.find((e) => e.id === "grain_panic");

  it("Stabiliser baisse la Rupture, sans mettre le jeu en pause", () => {
    state.instability = 0.5;
    autoResolveCrisisEvent(grainPanic, "stabiliser");
    expect(state.instability).toBeLessThan(0.5);
    expect(stateModule.gamePaused).toBe(false);
  });

  it("Temporiser laisse monter la Rupture, sans pause", () => {
    state.instability = 0.5;
    autoResolveCrisisEvent(grainPanic, "temporiser");
    expect(state.instability).toBeGreaterThan(0.5);
    expect(stateModule.gamePaused).toBe(false);
  });
});

describe("simulateAwayCrises — farm hors-ligne (v2)", () => {
  const farmState = (overrides = {}) => hydrateState({
    population: 100000, food: 400000, gold: 200000, knowledge: 30000, infrastructure: 3000,
    legitimacy: 50, ruins: 5000, cycles: 10, dynastyCount: 8, instability: 0.3, timeWear: 0.1,
    bestEraIndex: 6, cyclePeaks: { population: 120000, knowledge: 35000, infrastructure: 3500, eraIndex: 6 },
    cycleStartedAt: FIXED_NOW - 2 * 3600 * 1000, lastTick: FIXED_NOW - 2 * 3600 * 1000,
    buildings: { foragers: 30, granaries_city: 20, caravans: 12, markets: 8, irrigated_fields: 6 },
    upgrades: { conseil_de_crise: true, edit_effondrement: true },
    hephHeritage: true,
    crisisDoctrine: { p25: "stabiliser", p50: "stabiliser", p75: "stabiliser", autoCollapse: { enabled: true, trigger: "temps", timeSeconds: 180, usureThreshold: 0.9, prepare: false } },
    ...overrides
  });

  it("enchaîne des effondrements, banque des ruines, plafonné à OFFLINE_MAX_COLLAPSES, sans fuite de pause", () => {
    setState(farmState());
    invalidateRenderCache("all");
    const cyclesBefore = state.cycles;
    const ruinsBefore = toNum(state.ruins);
    applyOfflineProgress(2 * 3600); // 2 h, cap de base ; temps=180 s → > 20 cycles possibles
    const collapses = state.cycles - cyclesBefore;
    expect(collapses).toBeGreaterThan(0);
    expect(collapses).toBeLessThanOrEqual(20); // OFFLINE_MAX_COLLAPSES
    expect(toNum(state.ruins)).toBeGreaterThan(ruinsBefore);
    expect(stateModule.gamePaused).toBe(false);
    expect(state.crisisLimitAnnounced).toBe(false);
  });

  it("sans auto-achat (hephHeritage false) → pas de farm, aucun effondrement (chemin linéaire)", () => {
    setState(farmState({ hephHeritage: false }));
    invalidateRenderCache("all");
    const cyclesBefore = state.cycles;
    const popBefore = toNum(state.population);
    applyOfflineProgress(2 * 3600);
    expect(state.cycles).toBe(cyclesBefore);          // aucun effondrement
    expect(toNum(state.population)).toBeGreaterThan(popBefore); // mais prod linéaire créditée
  });
});
