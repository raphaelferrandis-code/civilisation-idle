import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// PERF-60 (audit du 2026-10-05) : isCoarsePointer() relançait la détection à CHAQUE
// appel (chaque rendu de la Cité, de la boutique, des encarts) — URLSearchParams,
// localStorage, matchMedia, et une écriture de localStorage tant que `?touch=1`
// restait dans l'URL. Le verdict est gardé, et remis à jour au changement de régime.

let coarse = false, ecoute = null;
const compte = { mm: 0, set: 0 };

beforeEach(() => {
  coarse = false; ecoute = null; compte.mm = 0; compte.set = 0;
  vi.resetModules();
  const store = new Map();
  globalThis.window = {
    location: { search: "?touch=auto" },
    matchMedia: (q) => {
      compte.mm += 1;
      return {
        matches: q === "(pointer: coarse)" ? coarse : false,
        addEventListener: (_t, fn) => { ecoute = fn; },
        removeEventListener: () => { ecoute = null; },
      };
    },
  };
  globalThis.document = { documentElement: { dataset: {} } };
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { compte.set += 1; store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
  };
  // (Node a son propre `navigator`, sans points de contact : le filet ne s'arme pas.)
});
afterEach(() => {
  delete globalThis.window; delete globalThis.document; delete globalThis.localStorage;
});

describe("régime de pointage", () => {
  it("le verdict se rend une fois, pas à chaque rendu", async () => {
    const { isCoarsePointer } = await import("../pointerMode.js");
    for (let i = 0; i < 50; i += 1) expect(isCoarsePointer()).toBe(false);
    expect(compte.mm).toBeLessThanOrEqual(2);
  });

  it("?touch=1 force le doigt et ne réécrit plus le stockage à chaque appel", async () => {
    window.location.search = "?touch=1";
    const { isCoarsePointer } = await import("../pointerMode.js");
    for (let i = 0; i < 50; i += 1) expect(isCoarsePointer()).toBe(true);
    expect(compte.set).toBe(1);
  });

  it("un changement de régime met le verdict à jour (watchPointerMode)", async () => {
    const { isCoarsePointer, watchPointerMode } = await import("../pointerMode.js");
    const stop = watchPointerMode();
    expect(isCoarsePointer()).toBe(false);
    expect(document.documentElement.dataset.pointer).toBe("fine");
    coarse = true;                        // la tablette quitte son clavier
    ecoute();
    expect(isCoarsePointer()).toBe(true);
    expect(document.documentElement.dataset.pointer).toBe("coarse");
    stop();
  });
});
