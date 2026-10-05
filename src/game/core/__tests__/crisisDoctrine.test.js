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
import { pressureBreakdown } from "../mechanics.js";
import { AUTO_COLLAPSE_MIN_SECONDS, OFFLINE_MAX_COLLAPSES } from "../balance.js";
import { MID_GAME_FIXTURE, FIXED_NOW } from "./fixtures.js";
import { farmState } from "../../../test/core.js";

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
    // 300 s est sous le plancher des minuteurs d'effondrement → relevé.
    expect(h.crisisDoctrine.autoCollapse.timeSeconds).toBe(AUTO_COLLAPSE_MIN_SECONDS);
    expect(h.crisisDoctrine.autoCollapse.usureThreshold).toBeLessThanOrEqual(1); // borné
    const longer = hydrateState({ crisisDoctrine: { autoCollapse: { trigger: "temps", timeSeconds: 1800 } } });
    expect(longer.crisisDoctrine.autoCollapse.timeSeconds).toBe(1800);
  });

  it("le Script du Phénix ne descend pas non plus sous le plancher (vieilles saves)", () => {
    const h = hydrateState({ autoScriptRules: [{ id: "rule_time", type: "time", label: "x", unit: "min", threshold: 2, enabled: true }] });
    const rule = h.autoScriptRules.find((r) => r.id === "rule_time");
    expect(rule.threshold).toBe(AUTO_COLLAPSE_MIN_SECONDS / 60);
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

  it("le 1er palier porte le cap à 8 h, le dernier à 24 h", () => {
    state.upgrades.veilleurs_nuit_1 = true;
    expect(idleCapSeconds()).toBe(8 * 3600);
    state.upgrades.veilleurs_nuit_4 = true;
    expect(idleCapSeconds()).toBe(24 * 3600);
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

  it("crise terminale déjà ouverte (hors farm) : rien n'est crédité, l'absence va dans la clepsydre (BUG-9)", () => {
    state.crisisLimitAnnounced = true;
    state.lastTick = FIXED_NOW - 3600 * 1000;
    const popBefore = toNum(state.population);
    const wearBefore = state.timeWear;
    applyOfflineProgress(3600);
    expect(toNum(state.population)).toBe(popBefore);
    expect(state.timeWear).toBe(wearBefore);
    // L'absence n'est plus jetée : elle attend d'être versée, et l'ancre est recalée.
    expect(state.storedSeconds).toBe(3600);
    expect(state.lastTick).toBe(FIXED_NOW);
  });
});

describe("autoResolveCrisisEvent — selon la posture, sans pause", () => {
  const grainPanic = CRISIS_POOL.find((e) => e.id === "grain_panic");

  // Depuis les « crises qui comptent » (2026-10), une crise déplace la CIBLE de
  // Rupture via son foyer (state.foyerShift), plus l'aiguille.
  const targetNow = () => { invalidateRenderCache("all"); return pressureBreakdown().total; };

  it("Stabiliser (traiter) baisse la cible de Rupture, sans mettre le jeu en pause", () => {
    const before = targetNow();
    autoResolveCrisisEvent(grainPanic, "stabiliser");
    expect(state.foyerShift.scarcity).toBeLessThan(0);
    expect(targetNow()).toBeLessThanOrEqual(before);
    expect(stateModule.gamePaused).toBe(false);
  });

  it("Temporiser (profiter) fait monter la cible de Rupture, sans pause", () => {
    const before = targetNow();
    autoResolveCrisisEvent(grainPanic, "temporiser");
    expect(state.foyerShift.scarcity).toBeGreaterThan(0);
    expect(targetNow()).toBeGreaterThan(before);
    expect(stateModule.gamePaused).toBe(false);
  });
});

describe("simulateAwayCrises — farm hors-ligne (v2)", () => {
  it("enchaîne des effondrements, banque des ruines, plafonné à OFFLINE_MAX_COLLAPSES, sans fuite de pause", () => {
    // 8 h d'absence (Veilleurs de nuit I), cycle commencé au départ : minuteur
    // relevé à 10 min (plancher) → ~48 chutes possibles, le plafond doit mordre.
    const departed = FIXED_NOW - 8 * 3600 * 1000;
    setState(farmState({ cycleStartedAt: departed, lastTick: departed }));
    state.upgrades.veilleurs_nuit_1 = true;
    invalidateRenderCache("all");
    const cyclesBefore = state.cycles;
    const ruinsBefore = toNum(state.ruins);
    applyOfflineProgress(8 * 3600);
    const collapses = state.cycles - cyclesBefore;
    expect(collapses).toBeGreaterThan(0);
    expect(collapses).toBe(OFFLINE_MAX_COLLAPSES);
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
