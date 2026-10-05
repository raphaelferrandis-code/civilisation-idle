import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Le dessin seul est mis de côté (ombre, calque de lumière) : on regarde la cuisson.
vi.mock("../iso/isoSunShadow.js", () => ({ drawSunShadow: () => {} }));
vi.mock("../lightLayer.js", () => ({ lightCtx: () => null, lightCutImage: () => {} }));

import { CM } from "../layout.js";
import { WINTER } from "../seasonMode.js";
import { drawIsoMill } from "../iso/isoMill.js";

// Audit 2026-10-05, PERF-9 (moulins) — le cache des moulins gardait toutes les
// bandes de la session, chacune avec ses pixels bruts et treize silhouettes dorées
// cuites d'avance ; et la cuisson d'une bande neuve (10-22 ms) tombait dans l'image
// déjà chargée du passage d'ère. Gardes : seule la bande courante reste, la dorure
// se fait au premier survol, et la recuisson passe par le budget de l'image.

let canvases = 0, clock = 0;
const fakeCanvas = () => {
  canvases += 1;
  return { width: 1, height: 1, getContext: () => ({ putImageData() {}, drawImage() {}, fillRect() {} }) };
};
const ctx = { imageSmoothingEnabled: false, drawImage() {} };
const tile = { gx: 10, gy: 10, size: 1, buildingId: "water_mills" };
const draw = (band) => { CM.layout.counts.eraBand = band; return drawIsoMill(ctx, tile, 1000); };

beforeEach(() => {
  canvases = 0; clock = 0;
  vi.stubGlobal("document", { createElement: fakeCanvas });
  vi.stubGlobal("ImageData", class { constructor(d, w, h) { this.data = d; this.width = w; this.height = h; } });
  CM.TILE = 32; CM.cam = { x: 0, y: 0, zoom: 1 }; CM.cw = 800; CM.ch = 600;
  CM.season = 1; CM.capture = null; CM.hover = null; CM.nightF = 0;
  CM.layout = { counts: { eraBand: 3 } };
  if (typeof window !== "undefined" && window.__millTune) window.__millTune();
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); CM.layout = null; CM._wonderBoxes = undefined; });

describe("PERF-9 — les moulins", () => {
  it("une bande se cuit une fois, sans silhouette dorée tant qu'on ne survole pas", () => {
    expect(draw(3)).toBeTruthy();
    const first = canvases;
    expect(first).toBeGreaterThan(0);
    draw(3);
    expect(canvases).toBe(first);                 // en cache
    CM.hover = { tile };
    draw(3);
    expect(canvases).toBe(first + 2);             // tour + pose d'ailes du moment
  });

  it("seule la bande courante reste en cache (été et hiver)", () => {
    draw(3);
    CM.season = WINTER; draw(3); CM.season = 1;
    const n = canvases;
    draw(3);
    expect(canvases).toBe(n);                     // les deux saisons de la bande 3
    draw(4);
    const n4 = canvases;
    draw(3);
    expect(canvases).toBeGreaterThan(n4);         // la bande 3 a été libérée
  });

  it("une bande neuve attend le budget de l'image : l'ancienne cuisson tient l'écran", () => {
    vi.spyOn(performance, "now").mockImplementation(() => (clock += 10));
    CM._wonderBoxes = [];
    draw(7);                                      // une cuisson : le budget est pris
    const n = canvases;
    expect(n).toBeGreaterThan(0);
    expect(draw(8)).toBeTruthy();                 // même image : la bande 7 tient l'écran
    expect(canvases).toBe(n);
    CM._wonderBoxes = [];                         // image suivante
    draw(8);
    expect(canvases).toBeGreaterThan(n);
  });
});
