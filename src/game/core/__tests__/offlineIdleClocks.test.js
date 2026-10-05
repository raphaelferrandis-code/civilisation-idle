// CE QUI TOURNE PENDANT L'ABSENCE LINÉAIRE, ET LE TEMPS DE JEU QUI NE DÉRIVE PLUS
// (audit 2026-10-05, BUG-72 et BUG-73).
//  - BUG-72 : le crédit linéaire (tous les joueurs sans Héphaïstos + Édit) ne
//    faisait avancer ni les chantiers de voirie ni les décroissances du tick :
//    cinq chantiers en file, deux heures d'absence, aucune route posée — et la
//    fatigue de régulation du départ, intacte.
//  - BUG-73 : le tick « live » était borné à 1 s alors que le régime hors-ligne
//    ne prend le relais qu'au-delà de 10 s : chaque intervalle retardé perdait
//    `écart − 1` s de cité et de temps de jeu.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { state, setState, hydrateState, invalidateRenderCache, setGamePaused, setCollapseInProgress } from "../state.js";
import { applyOfflineProgress, spendStoredTime, startGameLoop } from "../main.js";
import { dismissIdleReport } from "../idleReport.js";
import { D } from "../num.js";
import { MID_GAME_FIXTURE, FIXED_NOW } from "./fixtures.js";

const ABS = 7200;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  setGamePaused(false);
  setCollapseInProgress(false);
});

afterEach(() => {
  dismissIdleReport();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const work = (total, left = total) => ({ kind: "link", tiles: 6, targetId: null, toRank: null, total, left });

// Cité LINÉAIRE (ni Héphaïstos ni Édit) avec cinq chantiers en file, une fatigue
// de régulation au plus haut et des foyers apaisés au départ.
const linearRaw = (t, extra = {}) => ({
  ...MID_GAME_FIXTURE,
  buildings: { foragers: 30, granaries_city: 20, roads: 3 },
  instability: 0.1, cycles: 20,
  cycleStartedAt: t - 600_000, lastTick: t,
  roadWorks: { active: work(300, 120), queue: [work(300), work(300), work(300), work(300)] },
  regulFatigue: 0.9,
  foyerRelief: { scarcity: 0.3, inequality: 0.2, complexity: 0.1, dissent: 0.05 },
  ...extra
});

function runAbsence(extra = {}) {
  const departed = FIXED_NOW - ABS * 1000;
  vi.setSystemTime(departed);
  setState(hydrateState(linearRaw(departed, extra)));
  vi.setSystemTime(FIXED_NOW);
  invalidateRenderCache("all");
  const food = D(state.food);
  applyOfflineProgress(ABS);
  return { foodGain: D(state.food).sub(food) };
}

describe("BUG-72 — absence linéaire : la voirie avance, fatigue et apaisement s'estompent", () => {
  it("cinq chantiers en file et 2 h d'absence → cinq routes posées, file vide", () => {
    runAbsence();
    expect(state.buildings.roads).toBe(3 + 5);
    expect(state.roadWorks.active).toBe(null);
    expect(state.roadWorks.queue).toEqual([]);
  });

  it("la fatigue de régulation et l'apaisement des foyers ont décru comme en jeu", () => {
    runAbsence();
    expect(state.regulFatigue).toBe(0); // demi-vie de 18 s : 2 h l'ont éteinte
    for (const v of Object.values(state.foyerRelief)) expect(v).toBeLessThan(1e-6);
  });

  it("les routes posées pendant l'absence ne changent ni le crédit ni l'Usure", () => {
    const withWorks = runAbsence();
    const wear = state.timeWear;
    const without = runAbsence({ roadWorks: { active: null, queue: [] } });
    expect(withWorks.foodGain.toString()).toBe(without.foodGain.toString());
    expect(state.timeWear).toBe(wear);
  });

  it("versement de 2 h = absence de 2 h : mêmes routes, même fatigue", () => {
    runAbsence();
    const abs = { roads: state.buildings.roads, fatigue: state.regulFatigue, relief: { ...state.foyerRelief } };
    vi.setSystemTime(FIXED_NOW);
    setState(hydrateState({ ...linearRaw(FIXED_NOW), storedSeconds: ABS }));
    invalidateRenderCache("all");
    expect(spendStoredTime().ok).toBe(true);
    expect({ roads: state.buildings.roads, fatigue: state.regulFatigue, relief: { ...state.foyerRelief } }).toEqual(abs);
  });

  it("une file plus longue que l'absence : le chantier en cours garde son reste exact", () => {
    // Deux chantiers de 5 000 s : le premier se pose, le second reçoit le reliquat (2 200 s).
    runAbsence({ roadWorks: { active: work(5000, 5000), queue: [work(5000)] } });
    expect(state.buildings.roads).toBe(3 + 1);
    expect(state.roadWorks.active.left).toBeCloseTo(5000 - (ABS - 5000), 6);
    expect(state.roadWorks.queue).toEqual([]);
  });
});

describe("BUG-73 — le tick « live » crédite l'écart réel jusqu'au seuil", () => {
  let listeners;
  beforeEach(() => {
    listeners = {};
    const on = (type, fn) => { (listeners[type] ||= []).push(fn); };
    const off = (type, fn) => { listeners[type] = (listeners[type] || []).filter((f) => f !== fn); };
    globalThis.window = { addEventListener: on, removeEventListener: off };
    globalThis.document = { hidden: false, addEventListener: on, removeEventListener: off };
  });
  afterEach(() => {
    delete globalThis.window;
    delete globalThis.document;
  });

  it("un intervalle retardé de 3,5 s (tâche longue) crédite 4,5 s de jeu, pas 1", () => {
    setState(hydrateState({ ...MID_GAME_FIXTURE, instability: 0.1, lastTick: FIXED_NOW }));
    const cleanup = startGameLoop();
    vi.advanceTimersByTime(1000); // un tick normal
    const played = state.playTimeSec || 0;
    const lifetime = state.chronicleStats.lifetimePlaySec || 0;
    vi.setSystemTime(Date.now() + 3500); // le fil principal bloqué 3,5 s
    vi.advanceTimersByTime(1000);
    expect(state.playTimeSec).toBeCloseTo(played + 4.5, 9);
    expect(state.chronicleStats.lifetimePlaySec).toBeCloseTo(lifetime + 4.5, 9);
    expect(state.lastTick).toBe(Date.now());
    cleanup();
  });
});
