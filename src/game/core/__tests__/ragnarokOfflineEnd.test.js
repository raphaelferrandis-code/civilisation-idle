// LA FIN DU RAGNARÖK SOUS LA SIMULATION HORS-LIGNE (audit 2026-10-05, BUG-28).
// Le tick force la Fin à 24 min à deux endroits : le bloc principal (gardé hors
// ligne) et la branche « crise terminale » (pas gardée). Sous la sim, cette
// seconde branche lançait le deuil ASYNC de collapse() : gamePaused posé, la sim
// cassait, le reliquat était crédité à une cité condamnée, puis la stèle rasait
// tout ~2 s après le retour. Une seule fonction gardée désormais, et la sim fait
// tomber la Fin elle-même, par le chemin synchrone de l'Édit.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import * as stateModule from "../state.js";
const { state, setState, hydrateState, invalidateRenderCache, setGamePaused, setCollapseInProgress, setNotifyPaused, setOfflineSim } = stateModule;
import { applyOfflineProgress } from "../main.js";
import { tick } from "../actions/tick.js";
import { registerIdleReport, dismissIdleReport } from "../idleReport.js";
import { RAGNAROK_ID, RAGNAROK_DURATION_MS, RAGNAROK_WOLF_AT_MS, RAGNAROK_WOLF_EAT_INTERVAL_MS } from "../../data/myths.js";
import { MID_GAME_FIXTURE, FIXED_NOW } from "./fixtures.js";

const MIN = 60_000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  setGamePaused(false);
  setCollapseInProgress(false);
});

afterEach(() => {
  setNotifyPaused(false);
  setOfflineSim(false);
  dismissIdleReport();
  setGamePaused(false);
  setCollapseInProgress(false);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// Bouchées du Loup déjà prises à cet âge : le premier tick ne dévore pas d'un coup
// tout l'arriéré (ce n'est pas l'objet du test).
const wolfBitesAt = (ageMs) => (ageMs >= RAGNAROK_WOLF_AT_MS ? Math.floor((ageMs - RAGNAROK_WOLF_AT_MS) / RAGNAROK_WOLF_EAT_INTERVAL_MS) + 1 : 0);

const fimbul = (t, ageMs, extra = {}) => ({
  ...MID_GAME_FIXTURE, grandResetCount: 3, activeMythId: RAGNAROK_ID, mythsCompleted: {},
  cycleStartedAt: t - ageMs, lastTick: t, ragnarokWolfBites: wolfBitesAt(ageMs),
  crisisThresholds: { _25: true, _50: true, _75: true },
  ...extra
});

describe("BUG-28 — la Fin forcée ne lance plus de deuil asynchrone sous la sim", () => {
  it("sim + Ragnarök à 25 min en crise terminale : tick(10) ne lance ni chute ni pause", () => {
    for (const terminal of [false, true]) {
      setState(hydrateState(fimbul(FIXED_NOW, 25 * MIN, {
        instability: terminal ? 1 : 0.5, crisisLimitAnnounced: terminal, crisisOpenedAt: terminal ? FIXED_NOW - MIN : null
      })));
      invalidateRenderCache("all");
      setNotifyPaused(true);
      setOfflineSim(true);
      tick(10);
      expect(stateModule.collapseInProgress).toBe(false);
      expect(stateModule.gamePaused).toBe(false);
      setNotifyPaused(false);
      setOfflineSim(false);
    }
  });

  it("en ligne, la crise terminale ne retient toujours pas la Fin", async () => {
    setState(hydrateState(fimbul(FIXED_NOW, 25 * MIN, {
      instability: 1, crisisLimitAnnounced: true, crisisOpenedAt: FIXED_NOW - MIN,
      testamentLegacyId: "granaries" // pas de dialogue d'épitaphe à la stèle
    })));
    invalidateRenderCache("all");
    const cycles = state.cycles;
    tick(1);
    expect(stateModule.collapseInProgress).toBe(true);
    await vi.advanceTimersByTimeAsync(2500); // le deuil (pas de carte en test)
    expect(state.cycles).toBe(cycles + 1);
    expect(state.activeMythId).not.toBe(RAGNAROK_ID); // le pacte est brisé
    expect(state.mythsCompleted[RAGNAROK_ID]).toBeFalsy();
  });
});

describe("BUG-28 — farm hors ligne : la Fin tombe à 24 min, par le chemin synchrone", () => {
  // Cité qui farme (Héphaïstos + Édit) avec un déclencheur LOIN de la Fin : seule
  // la Fin peut effondrer pendant ces 10 minutes.
  const farmFimbul = (t) => fimbul(t, 23 * MIN, {
    population: 100000, food: 400000, gold: 200000, knowledge: 30000, infrastructure: 3000,
    instability: 0.2, timeWear: 0.1, cycles: 10, bestEraIndex: 6,
    cyclePeaks: { population: 120000, knowledge: 35000, infrastructure: 3500, eraIndex: 6 },
    buildings: { foragers: 30, granaries_city: 20, caravans: 12, markets: 8, irrigated_fields: 6 },
    upgrades: { conseil_de_crise: true, edit_effondrement: true },
    hephHeritage: true, testamentLegacyId: "granaries",
    crisisDoctrine: { p25: "stabiliser", p50: "stabiliser", p75: "stabiliser", autoCollapse: { enabled: true, trigger: "temps", timeSeconds: 3600, usureThreshold: 0.9, prepare: false } }
  });

  it("absence de 10 min partie à 23 min : une chute « forcée » à 24 min, pacte brisé et annoncé", () => {
    const ABS = 600;
    const departed = FIXED_NOW - ABS * 1000;
    vi.setSystemTime(departed);
    setState(hydrateState(farmFimbul(departed)));
    vi.setSystemTime(FIXED_NOW);
    invalidateRenderCache("all");
    let report = null;
    const unregister = registerIdleReport((r) => { report = r; });
    const cycles = state.cycles;
    applyOfflineProgress(ABS);
    unregister();

    expect(stateModule.collapseInProgress).toBe(false);
    expect(stateModule.gamePaused).toBe(false);
    expect(state.cycles).toBe(cycles + 1);
    // La Fin, à son heure — pas une chute de l'Édit plus tard dans l'absence.
    expect(state.prevCycle.cause).toBe("forced");
    expect(state.prevCycle.cycleSec).toBeGreaterThanOrEqual(RAGNAROK_DURATION_MS / 1000);
    expect(state.prevCycle.cycleSec).toBeLessThan(RAGNAROK_DURATION_MS / 1000 + 10);
    expect(state.activeMythId).not.toBe(RAGNAROK_ID);
    expect(state.mythsCompleted[RAGNAROK_ID]).toBeFalsy();
    expect(report.myths.broken).toBeTruthy();
  });
});
