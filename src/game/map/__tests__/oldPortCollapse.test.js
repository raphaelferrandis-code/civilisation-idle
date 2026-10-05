// Audit du 2026-10-05, BUG-95 — pendant l'effondrement, le fleuve garde son corps d'eau
// (eau nue, sans texture) mais le bassin du Vieux-Port retirait le sien : un rectangle
// d'herbe (le sol cuit sous l'eau) au pied des forts et de la capitainerie encore
// debout. Le bassin garde désormais son eau jusqu'à ce que la vague de la chute
// emporte le port (docs/PLAN-CHUTE.md : les ports disparaissent sans ruine dessinée).
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

// Le crochet que le Vieux-Port publie au fleuve : on le garde pour l'appeler.
const hook = vi.hoisted(() => ({ fn: null }));
vi.mock("../iso/isoRiver.js", async (importOriginal) => ({
  ...(await importOriginal()),
  setRiverExtraWater: (fn) => { hook.fn = fn; },
}));

import { CM } from "../layout.js";
import { OLDPORT } from "../iso/isoOldPort.js";
import { CHUTE } from "../iso/chuteState.js";

// La cuisson du bassin veut un canvas : un faux, muet.
class FakeOC {
  constructor(w, h) { this.width = w; this.height = h; }
  getContext() {
    const { width: w, height: h } = this;
    return new Proxy({ canvas: this }, {
      get(t, k) {
        if (k in t) return t[k];
        if (k === "getImageData" || k === "createImageData") {
          return (a, b, c, d) => { const W = c || a || w, H = d || b || h; return { width: W, height: H, data: new Uint8ClampedArray(W * H * 4) }; };
        }
        if (typeof k === "string" && /^[a-z]/.test(k)) return () => {};
        return undefined;
      },
      set(t, k, v) { t[k] = v; return true; },
    });
  }
}
class FakeImageData {
  constructor(a, b, c) {
    if (a instanceof Uint8ClampedArray) { this.data = a; this.width = b; this.height = c || a.length / 4 / b; }
    else { this.width = a; this.height = b; this.data = new Uint8ClampedArray(a * b * 4); }
  }
}

let saved;
beforeAll(() => {
  saved = { oc: globalThis.OffscreenCanvas, id: globalThis.ImageData, layout: CM.layout, at: CM.layoutRecomputeAt, gate: CM.quayGate, collapse: CM.collapseAt, sh: OLDPORT.shadow, rf: OLDPORT.reflect };
  globalThis.OffscreenCanvas = FakeOC;
  if (!saved.id) globalThis.ImageData = FakeImageData;
  OLDPORT.shadow = false; OLDPORT.reflect = false;      // cuisson plus courte : seule l'eau compte ici
  const samples = [];
  for (let x = 0; x <= 80; x += 2) samples.push({ x, y: 40, hw: 3 });
  const basin = { gx: 26, gy: 33, w: 6, h: 4 };
  CM.layout = {
    mapSeed: 95, counts: { eraBand: 5, eraIndex: 25 }, river: { present: true, samples, cells: new Set(), banks: new Set() },
    tiles: [{ buildingId: "river_ports", type: "engine", key: "engine:river_ports:old", gx: 26, gy: 33, spanX: 6, spanY: 4, oldPort: basin }],
  };
  CM.layoutRecomputeAt = 95001;
});
afterAll(() => {
  globalThis.OffscreenCanvas = saved.oc; globalThis.ImageData = saved.id;
  CM.layout = saved.layout; CM.layoutRecomputeAt = saved.at; CM.quayGate = saved.gate; CM.collapseAt = saved.collapse;
  OLDPORT.shadow = saved.sh; OLDPORT.reflect = saved.rf;
  CHUTE.act = null; CHUTE.scrub = null;
});

describe("BUG-95 — le bassin du Vieux-Port garde son eau pendant l'effondrement", () => {
  it("hors effondrement comme pendant, le bassin publie son eau au fleuve", () => {
    expect(typeof hook.fn).toBe("function");
    CM.collapseAt = 0;
    const calm = hook.fn(false);
    expect(calm.length).toBe(1);
    CM.collapseAt = 1234;
    const falling = hook.fn(false);
    expect(falling.length).toBe(1);
    expect(falling[0]).toEqual(calm[0]);
  });

  it("la vague de la chute emporte le bassin avec ses forts, pas avant", () => {
    CM.collapseAt = 1234;
    CHUTE.act = "fall";
    CHUTE.scrub = 0;                  // la vague n'est pas encore partie : le port est debout
    expect(hook.fn(false).length).toBe(1);
    CHUTE.scrub = 1e7;                // bien après son passage : le port a disparu
    expect(hook.fn(false).length).toBe(0);
  });
});
