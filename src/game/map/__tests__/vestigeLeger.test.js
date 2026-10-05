"use strict";
// LE RELEVÉ LÉGER DU VESTIGE (PERF-8, audit du 2026-10-05). captureVestige retraçait
// toute la ville à chaque chute : ~150-250 ms en fin de partie, ×170 chutes pour une
// nuit hors ligne avec le Phénix calendaire = 28 à 32 s de gel au lancement. Le
// relevé lit désormais la grille (cityGridDims) sans tracé dès que la fiche de cœur
// et le fleuve sont posés. Ce fichier prouve deux choses :
//   - le relevé léger laisse l'état EXACTEMENT comme le recalcul complet (la fiche de
//     cœur que completeCollapse garde pour la vallée, maxN compris) et le même
//     vestige — seul le rayon, que rien ne dessine, est estimé ;
//   - la farm hors ligne ne retrace plus la ville à chaque chute.
// Sonde : `__layoutProfile` fait écrire `__layoutProfileLast` par CHAQUE
// computeCityLayout — s'il reste vide, aucune ville n'a été tracée.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { state, setState, hydrateState, invalidateRenderCache, setGamePaused } from "../../core/state.js";
import { applyOfflineProgress } from "../../core/main.js";
import { computeCityLayout } from "../layout.js";
import { captureCurrentVestige } from "../cityMapBridge.js";
import { D } from "../../core/num.js";
import { eras } from "../../data/world.js";
import { FIXED_NOW } from "../../core/__tests__/fixtures.js";

const KEYS = Object.keys(state.buildings).filter((k) => k !== "roads");
const VALLEY = (c) => ({ seed: c.seed, dx: c.dx, dy: c.dy, bx: c.bx, maxN: c.maxN });
const layoutRan = () => globalThis.__layoutProfileLast !== undefined;
const probe = () => { globalThis.__layoutProfile = true; delete globalThis.__layoutProfileLast; };

afterEach(() => {
  delete globalThis.__layoutProfile; delete globalThis.__layoutProfileLast; delete globalThis.__vestigeFull;
  vi.useRealTimers();
});

describe("relevé léger du vestige", () => {
  beforeEach(() => {
    const pop = D(eras[8].at).mul(3);
    Object.assign(state, { cycles: 1, mapSeed: 0x51a7c0de, population: pop, knowledge: pop.mul(0.05), infrastructure: pop.mul(0.1), instability: 0, timeWear: 0, vestiges: [] });
    KEYS.forEach((k) => { state.buildings[k] = 4; });
    state.buildings.roads = 20;
    state.cityRoads = null; state.cityCore = null; state.cityMapSlots = {}; state.cityArchetype = null; state.riverWP = null;
    computeCityLayout(state);                 // la carte a posé la fiche de cœur et le fleuve
    KEYS.forEach((k) => { state.buildings[k] = 10; });   // la ville a grandi depuis : la grille aussi
  });

  it("ne trace aucune ville et laisse la fiche de cœur du recalcul complet, maxN compris", () => {
    const before = JSON.stringify(state.cityCore);
    const meta = { cityName: "Ys", year: 12, eraIndex: 8, cycleIndex: 1 };
    probe();
    captureCurrentVestige(meta);
    expect(layoutRan()).toBe(false);
    const light = { core: VALLEY(state.cityCore), rec: state.vestiges[0] };

    state.cityCore = JSON.parse(before); state.vestiges = [];
    globalThis.__vestigeFull = true;          // le chemin d'avant, pour comparer
    probe();
    captureCurrentVestige(meta);
    expect(layoutRan()).toBe(true);
    const full = { core: VALLEY(state.cityCore), rec: state.vestiges[0] };

    expect(light.core.maxN).toBeGreaterThan(JSON.parse(before).maxN);   // la grille a bien grandi
    expect(light.core).toEqual(full.core);
    const { footprint: fl, ...restL } = light.rec, { footprint: ff, ...restF } = full.rec;
    expect(restL).toEqual(restF);
    expect({ gridN: fl.gridN, cx: fl.cx, cy: fl.cy }).toEqual({ gridN: ff.gridN, cx: ff.cx, cy: ff.cy });
    expect(Math.abs(fl.radius - ff.radius)).toBeLessThanOrEqual(ff.radius * 0.25);
  });

  it("sans fiche pour cette graine : recalcul complet, qui pose la fiche (la vallée en dépend)", () => {
    state.cityCore = { seed: 999, dx: 0, dy: 0, bx: 0 };
    probe();
    captureCurrentVestige({ cityName: "Ys", year: 1, eraIndex: 8, cycleIndex: 1 });
    expect(layoutRan()).toBe(true);
    expect(state.cityCore.seed).toBe(0x51a7c0de);
    expect(state.vestiges.length).toBe(1);
  });
});

describe("farm hors ligne : plus de ville retracée à chaque chute", () => {
  it("20 chutes simulées, aucun tracé, la vallée et ses trois vestiges gardés", () => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    const departed = FIXED_NOW - 8 * 3600 * 1000;
    setState(hydrateState({
      population: 100000, food: 400000, gold: 200000, knowledge: 30000, infrastructure: 3000,
      ruins: 5000, cycles: 10, instability: 0.3, timeWear: 0.1, mapSeed: 0x2b1c07,
      bestEraIndex: 6, cyclePeaks: { population: 120000, knowledge: 35000, infrastructure: 3500, eraIndex: 6 },
      cycleStartedAt: departed, lastTick: departed,
      buildings: { foragers: 30, granaries_city: 20, caravans: 12, markets: 8, irrigated_fields: 6 },
      upgrades: { conseil_de_crise: true, edit_effondrement: true, veilleurs_nuit_1: true },
      hephHeritage: true,
      crisisDoctrine: { p25: "stabiliser", p50: "stabiliser", p75: "stabiliser", autoCollapse: { enabled: true, trigger: "temps", timeSeconds: 180, usureThreshold: 0.9, prepare: false } }
    }));
    setGamePaused(false);
    invalidateRenderCache("all");
    computeCityLayout(state);                 // la carte montée a posé la fiche
    const seed = state.mapSeed, cycles0 = state.cycles;
    probe();
    applyOfflineProgress(8 * 3600);
    expect(state.cycles - cycles0).toBe(20);
    expect(layoutRan()).toBe(false);
    expect(state.mapSeed).toBe(seed);
    expect(state.cityCore && state.cityCore.seed).toBe(seed);
    expect(state.vestiges.length).toBe(3);
    for (const v of state.vestiges) expect(v.footprint.gridN).toBeGreaterThan(0);
  });
});
