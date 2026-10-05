// LE RATTRAPAGE HORS-LIGNE NE BLOQUE PLUS LE DÉMARRAGE (audit 2026-10-05, BUG-30).
// startGameLoop appelait applyOfflineProgress sans garde, depuis l'effet d'App :
// une exception dans la simulation remontait jusqu'à React (écran blanc), les
// intervalles de tick et d'autosave n'étaient jamais posés, et lastTick restait
// l'ancien — chaque relance rejouait la même absence et retombait sur la même
// exception. On fait lever le rapport de reprise (publié APRÈS le crédit de
// l'absence : le pire moment, la production est déjà versée mais l'ancre pas
// recalée) et on vérifie que la boucle démarre quand même, sans double crédit.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { state, setState, hydrateState } from "../state.js";
import { registerIdleReport } from "../idleReport.js";
import { startGameLoop, applyOfflineProgressSafely } from "../main.js";
import { MID_GAME_FIXTURE, FIXED_NOW } from "./fixtures.js";

const HOUR = 3600 * 1000;
let listeners;
let unregister = () => {};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
  listeners = {};
  const on = (type, fn) => { (listeners[type] ||= []).push(fn); };
  const off = (type, fn) => { listeners[type] = (listeners[type] || []).filter((f) => f !== fn); };
  globalThis.window = { addEventListener: on, removeEventListener: off };
  globalThis.document = { hidden: false, addEventListener: on, removeEventListener: off };
  vi.spyOn(console, "warn").mockImplementation(() => {});
  setState(hydrateState({ ...MID_GAME_FIXTURE, saveVersion: 7 }));
  // Le rapport de reprise lève : c'est notre « exception dans la simulation ».
  unregister = registerIdleReport(() => { throw new Error("rapport cassé"); });
});

afterEach(() => {
  unregister();
  delete globalThis.window;
  delete globalThis.document;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("BUG-30 — rattrapage hors-ligne gardé", () => {
  it("au démarrage : pas d'exception, ancre recalée, boucle de tick posée", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    state.lastTick = FIXED_NOW - HOUR;
    let cleanup = null;
    expect(() => { cleanup = startGameLoop(); }).not.toThrow();
    expect(err).toHaveBeenCalled();
    expect(String(err.mock.calls[0][0])).toContain("Rattrapage hors-ligne interrompu");
    // L'absence ne sera PAS recréditée à la prochaine relance.
    expect(state.lastTick).toBe(FIXED_NOW);
    const food = state.food.toString();
    applyOfflineProgressSafely();
    expect(state.food.toString()).toBe(food);
    // La boucle tourne : le temps de jeu avance seconde par seconde.
    const played = state.playTimeSec || 0;
    vi.advanceTimersByTime(3000);
    expect(state.playTimeSec).toBe(played + 3);
    cleanup();
  });

  it("retour d'onglet et tick « veille système » : l'exception ne remonte pas", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    state.lastTick = FIXED_NOW;
    const cleanup = startGameLoop();
    // Retour d'onglet après 2 h : visibilitychange crédite l'absence.
    vi.setSystemTime(FIXED_NOW + 2 * HOUR);
    expect(() => (listeners.visibilitychange || []).forEach((fn) => fn())).not.toThrow();
    expect(state.lastTick).toBe(FIXED_NOW + 2 * HOUR);
    // Veille système onglet VISIBLE : le tick voit un écart de 30 min (régime offline).
    vi.setSystemTime(FIXED_NOW + 2.5 * HOUR);
    expect(() => vi.advanceTimersByTime(1000)).not.toThrow();
    expect(state.lastTick).toBe(FIXED_NOW + 2.5 * HOUR + 1000);
    // Et la boucle continue normalement derrière.
    const played = state.playTimeSec || 0;
    vi.advanceTimersByTime(2000);
    expect(state.playTimeSec).toBe(played + 2);
    cleanup();
  });
});
