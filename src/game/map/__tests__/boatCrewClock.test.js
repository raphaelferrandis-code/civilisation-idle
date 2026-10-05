// Audit du 2026-10-05, BUG-101 — l'équipage des bateaux respirait et saluait sur
// performance.now(), quand tout le reste de la flotte suit l'horloge de la FRAME
// (`now` de drawBoat) : les captures à horloge figée (captureFrame({ now })) n'étaient
// pas déterministes pour les marins.
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

// Les images d'habitant : on note l'instant demandé au lieu de lire des bandes PNG.
const seen = vi.hoisted(() => ({ idle: [], wave: [] }));
vi.mock("../agents.js", async (importOriginal) => ({
  ...(await importOriginal()),
  agentFrameIso: () => ({ img: {}, drawH: 8, feetF: 0.9, fh: 16 }),
  agentIdleFrameIso: (name, dir, z, scale, now) => { seen.idle.push(now); return { img: {}, fh: 16, sx: 0 }; },
  agentPoseFrameIso: (name, dir, z, scale, kind, u) => { seen.wave.push(u); return { img: {}, fh: 16, sx: 0 }; },
}));

import { drawBoat } from "../iso/boatKit.js";

// Canvas muets : la cuisson et la découpe de l'équipage ne dessinent rien ici.
const ctx2d = () => new Proxy({ globalAlpha: 1, imageSmoothingEnabled: false }, {
  get(t, k) { if (k in t) return t[k]; return typeof k === "string" ? () => {} : undefined; },
  set(t, k, v) { t[k] = v; return true; },
});
class FakeImageData {
  constructor(a, b, c) {
    if (a instanceof Uint8ClampedArray) { this.data = a; this.width = b; this.height = c || a.length / 4 / b; }
    else { this.width = a; this.height = b; this.data = new Uint8ClampedArray(a * b * 4); }
  }
}

let saved;
beforeAll(() => {
  saved = { doc: globalThis.document, id: globalThis.ImageData };
  if (!saved.doc) globalThis.document = { createElement: () => { const g = ctx2d(); return { width: 0, height: 0, getContext: () => g }; } };
  if (!saved.id) globalThis.ImageData = FakeImageData;
});
afterAll(() => {
  globalThis.document = saved.doc; globalThis.ImageData = saved.id;
  vi.restoreAllMocks();
});

describe("BUG-101 — l'équipage suit l'horloge de la frame", () => {
  it("respiration et salut se lisent sur `now`, pas sur performance.now()", () => {
    const spy = vi.spyOn(performance, "now");
    const draw = (perf) => {
      spy.mockReturnValue(perf);
      seen.idle.length = 0; seen.wave.length = 0;
      const r = drawBoat(ctx2d(), { id: "scapha", seed: 3 }, 100, 100, 0.4, 2, 4242, { state: "salute", band: 4, reflect: false });
      expect(r, "bateau posé").toBeTruthy();
      return { idle: [...seen.idle], wave: [...seen.wave] };
    };
    const a = draw(10), b = draw(987654);
    expect(a.idle.length).toBeGreaterThan(0);
    expect(a.wave.length).toBeGreaterThan(0);          // la scapha salue : sa pose 'wave' est lue
    for (const t of a.idle) expect(t).toBe(4242);
    expect(b).toEqual(a);                               // horloge du navigateur ailleurs : même image
  });
});
