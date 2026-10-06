/**
 * LE RETOUR D'ACHAT, UN SEUL HOOK (audit du 05/10, STRUCT-12). La rangée d'achat et
 * l'encart Voirie recopiaient le « +N » flottant (900 ms), le tremblement au refus
 * (400 ms) et la purge des minuteries au démontage. Ici, le hook seul : un mini-moteur
 * de hooks (pas de DOM sous Vitest), une horloge pilotée.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const eng = vi.hoisted(() => ({ slots: [], idx: 0, cleanups: [] }));

vi.mock("react", () => {
  const useState = (init) => {
    const i = eng.idx++;
    if (!eng.slots[i]) {
      const s = { v: init };
      s.set = (v) => { s.v = typeof v === "function" ? v(s.v) : v; };
      eng.slots[i] = s;
    }
    return [eng.slots[i].v, eng.slots[i].set];
  };
  const useRef = (init) => {
    const i = eng.idx++;
    if (!eng.slots[i]) eng.slots[i] = { current: init };
    return eng.slots[i];
  };
  const useEffect = (fn) => {
    const i = eng.idx++;
    if (!eng.slots[i]) { eng.slots[i] = { ran: true }; const c = fn(); if (c) eng.cleanups.push(c); }
  };
  return { useState, useRef, useEffect };
});

const { useBuyFeedback } = await import("../useBuyFeedback.js");
// Un « composant » minimal (nom en majuscule : les règles des hooks le reconnaissent).
const Rangee = () => useBuyFeedback();
const render = () => { eng.idx = 0; return Rangee(); };

beforeEach(() => { eng.slots = []; eng.cleanups = []; vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe("useBuyFeedback", () => {
  it("le « +N » flotte 900 ms, chacun avec son id", () => {
    let h = render();
    h.spawnFloat("+1");
    h.spawnFloat("+10");
    h = render();
    expect(h.floats.map((f) => f.text)).toEqual(["+1", "+10"]);
    expect(new Set(h.floats.map((f) => f.id)).size).toBe(2);
    vi.advanceTimersByTime(899);
    expect(render().floats).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(render().floats).toEqual([]);
  });
  it("le refus fait trembler 400 ms", () => {
    render().doShake();
    expect(render().shaking).toBe(true);
    vi.advanceTimersByTime(400);
    expect(render().shaking).toBe(false);
  });
  it("au démontage, les minuteries en cours sont purgées", () => {
    const h = render();
    h.spawnFloat("+1");
    h.doShake();
    expect(vi.getTimerCount()).toBe(2);
    for (const c of eng.cleanups) c();
    expect(vi.getTimerCount()).toBe(0);
  });
});
