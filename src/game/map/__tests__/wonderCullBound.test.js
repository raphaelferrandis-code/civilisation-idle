import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { state } from "../../core/state.js";
import { CM, CM_WONDERS, cmWonderSpriteDims, cmWonderExtent } from "../layout.js";
import { wonderKitForBand } from "../iso/wonderKits.js";
import * as WB from "../iso/wonderBake.js";
import { isleModel, bakeIsleBase } from "../iso/wonderIsle.js";
import { WINTER } from "../seasonMode.js";
import { wonderCullBound, pushIsoWonderItems } from "../iso/isoWonder.js";

// Audit 2026-10-05, PERF-9 — au passage d'une bande ou au premier hiver, les six
// monuments, l'îlot et les lieux cuisaient dans la même image, même hors champ.
// Deux gardes :
//  · le MAJORANT de cull (wonderCullBound) contient bien tout ce que le cull exact
//    regarde, pour chaque recette — sinon une merveille disparaîtrait au bord ;
//  · la passe vivante ne cuit pas une merveille hors champ, et étale les cuissons
//    d'une bascule (budget par image) en gardant l'ancienne variante affichée.

const T = 32, PPT = 34;
const RECIPE = {
  dynasty1: "bakeMausoleum", pop1m: "bakeColumn", era_kingdom: "bakePalace",
  era_empire: "bakeCathedral", era_mega: "bakeNeedle", era_singularity: "bakeEye",
};
function ink(R) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let j = 0; j < R.h; j += 1) for (let i = 0; i < R.w; i += 1) {
    if (!R.data[(j * R.w + i) * 4 + 3]) continue;
    x0 = Math.min(x0, R.ox + i); x1 = Math.max(x1, R.ox + i + 1); y0 = Math.min(y0, R.oy + j); y1 = Math.max(y1, R.oy + j + 1);
  }
  return { x0, x1, y0, y1 };
}
const IL = { x: 50, y: 50, rx: 7.6, ry: 2.4, tx: 0.966, ty: 0.259 };

describe("PERF-9 — le majorant de cull des merveilles", () => {
  beforeEach(() => { CM.TILE = T; });
  it("chaque monument cuit tient dans la boîte intérieure du majorant (rangs, bandes, saisons)", () => {
    for (const w of CM_WONDERS) {
      for (const tier of [1, 5]) {
        const d = cmWonderSpriteDims(w.id, tier), B = (d.nw / (2 * PPT)) * T, H = (d.nh / PPT) * T;
        const isle = w.id === "era_mega" ? isleModel(tier, IL) : null;
        const m = { w, tier, B, Hmax: H, isle, il: isle ? IL : null };
        const r = (cmWonderExtent(w.id, tier).halfW + 0.5) * T;
        const top = 1.5 * (H + B / 2 + (isle ? isle.top : 0)) + T;
        const { box } = wonderCullBound(m);
        // Le majorant porte les marges du cull exact (largeur ≥ 0,6 × hauteur d'encre,
        // anneau du lieu devant) autour de cette boîte intérieure.
        expect(box.x1).toBeGreaterThanOrEqual(2 * r + 0.6 * (top + r));
        expect(box.y0).toBeLessThanOrEqual(-top);
        for (const band of [0, 6, 9]) for (const wtr of [false, true]) {
          const K = wonderKitForBand(band, wtr);
          const out = WB[RECIPE[w.id]](K, tier, B, H, isle ? { lift: isle.top } : {});
          const b = ink(out.R), tag = `${w.id} rang ${tier} bande ${band}${wtr ? " hiver" : ""}`;
          // Le cœur animé de l'Œil compte dans la boîte du cull exact (bakeFor l'y ajoute).
          if (out.core) {
            const c = ink(WB.bakeEyeCore(K, out.core, 0, 32).R);
            b.x0 = Math.min(b.x0, c.x0); b.x1 = Math.max(b.x1, c.x1); b.y0 = Math.min(b.y0, c.y0); b.y1 = Math.max(b.y1, c.y1);
          }
          expect(b.x0, tag).toBeGreaterThanOrEqual(-2 * r);
          expect(b.x1, tag).toBeLessThanOrEqual(2 * r);
          expect(b.y1, tag).toBeLessThanOrEqual(r);
          expect(b.y0, tag).toBeGreaterThanOrEqual(-top);
        }
      }
    }
  });

  it("le raster de l'îlot tient dans son majorant", () => {
    for (const tier of [2, 5]) {
      const base = bakeIsleBase(wonderKitForBand(6, false), tier, IL);
      const m = { w: CM_WONDERS.find((x) => x.id === "era_mega"), tier, B: 64, Hmax: 300, isle: isleModel(tier, IL), il: IL };
      const q = wonderCullBound(m).isle, R = base.R;
      expect(R.ox).toBeGreaterThanOrEqual(q.x0);
      expect(R.ox + R.w).toBeLessThanOrEqual(q.x1);
      expect(R.oy).toBeGreaterThanOrEqual(q.y0);
      expect(R.oy + R.h).toBeLessThanOrEqual(q.y1);
    }
  });
});

// ── La passe vivante, avec un DOM factice (canvas comptés) ─────────────────────
let canvases = 0, clock = 0;
const fakeCanvas = () => {
  canvases += 1;
  return { width: 0, height: 0, getContext: () => ({ putImageData() {}, createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }) }) };
};
const saved = { wonders: state.wonders };
function scene() {
  CM.TILE = T;
  CM.cw = 1200; CM.ch = 800; CM.dpr = 1; CM.capture = null; CM.season = 1; CM.previewWonder = null;
  CM.born = {}; CM.ships = [];
  CM.layout = { gridN: 120, cx: 60, cy: 60, counts: { eraBand: 4, eraIndex: 13 }, wonderTiers: { dynasty1: 1, pop1m: 1 }, river: null, roadSet: new Set() };
  state.wonders = ["dynasty1", "pop1m"];
}
const look = (wi) => {
  // Caméra au centre du monument wi (emplacement de base), zoom 1.
  const items = [];
  pushIsoWonderItems(items, CM_WONDERS[wi], wi);
  return items;
};
const W = { dynasty1: 0, pop1m: 1 };

describe("PERF-9 — la passe vivante des merveilles", () => {
  beforeEach(() => {
    canvases = 0; clock = 0;
    vi.stubGlobal("document", { createElement: fakeCanvas });
    vi.stubGlobal("ImageData", class { constructor(d, w, h) { this.data = d; this.width = w; this.height = h; } });
    scene();
  });
  afterEach(() => {
    vi.unstubAllGlobals(); vi.restoreAllMocks();
    state.wonders = saved.wonders; CM.layout = null; CM._wonderBoxes = undefined; CM.capture = null;
  });

  it("une merveille hors champ ne cuit rien", () => {
    CM.cam = { x: -100000, y: -100000, zoom: 1 };
    CM._wonderBoxes = [];
    expect(look(W.dynasty1)).toHaveLength(0);
    expect(look(W.pop1m)).toHaveLength(0);
    expect(canvases).toBe(0);
  });

  it("une bascule d'hiver s'étale : au plus une variante neuve par image, l'ancienne tient l'écran", () => {
    // Les deux monuments dans le champ (dézoom, caméra entre les deux).
    CM.cam = { x: 60 * T, y: 60 * T, zoom: 0.25 };
    vi.spyOn(performance, "now").mockImplementation(() => (clock += 10));   // une cuisson « coûte » 10 ms
    CM._wonderBoxes = [];
    const a1 = look(W.dynasty1), b1 = look(W.pop1m);
    expect(a1.length).toBeGreaterThan(0);
    expect(b1.length).toBeGreaterThan(0);   // jamais montrée : cuite malgré le budget
    CM.season = WINTER;
    CM._wonderBoxes = [];                    // image suivante
    const a2 = look(W.dynasty1), b2 = look(W.pop1m);
    expect(a2[0].m.bk.key).toMatch(/:w/);    // première du budget : variante d'hiver
    expect(b2[0].m.bk.key).not.toMatch(/:w/); // budget épuisé : la variante d'été tient
    CM._wonderBoxes = [];
    const b3 = look(W.pop1m);
    expect(b3[0].m.bk.key).toMatch(/:w/);    // image d'après : la recuisson suit
  });

  it("en capture, tout cuit dans l'image (cliché complet)", () => {
    CM.cam = { x: 60 * T, y: 60 * T, zoom: 0.25 };
    vi.spyOn(performance, "now").mockImplementation(() => (clock += 10));
    CM._wonderBoxes = [];
    look(W.dynasty1); look(W.pop1m);
    CM.season = WINTER; CM.capture = { night: 0, health: 1 };
    CM._wonderBoxes = [];
    expect(look(W.dynasty1)[0].m.bk.key).toMatch(/:w/);
    expect(look(W.pop1m)[0].m.bk.key).toMatch(/:w/);
  });
});
