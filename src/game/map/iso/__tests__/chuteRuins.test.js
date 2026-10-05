"use strict";
// LA CHUTE (docs/PLAN-CHUTE.md) — les images de la chute : la poussière rangée
// recadrée sur son encre, et les ruines dessinées qui se chargent (ou pas).
// (Audit du 05/10 : CHUTE-6, CHUTE-15.)
import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { dustRaster, inkBox, cropRgba, dustFrame } from "../chuteDust.js";

describe("la poussière recadrée sur son encre", () => {
  it("la part rangée est exactement la part encrée de l'image pleine, et bien plus petite", () => {
    let full = 0, kept = 0;
    for (const [w, h] of [[40, 48], [64, 80], [80, 184]]) {
      for (const s of [0, 3]) {
        for (let f = 0; f < 18; f += 1) {
          const { id, W, H, ax, ay } = dustRaster(w, h, s, 2, f);
          expect(ax).toBeLessThan(W);
          expect(ay).toBeLessThan(H);
          full += W * H;
          const b = inkBox(id, W, H);
          if (!b) continue;
          kept += b.w * b.h;
          const c = cropRgba(id, W, b);
          // Hors de la boîte : rien. Dedans : les mêmes pixels, au même décalage.
          // (Comparaisons nues : un expect par pixel coûterait des secondes.)
          for (let y = 0; y < H; y += 1) {
            for (let x = 0; x < W; x += 1) {
              const i = (y * W + x) * 4;
              const inside = x >= b.x0 && x < b.x0 + b.w && y >= b.y0 && y < b.y0 + b.h;
              const o = ((y - b.y0) * b.w + (x - b.x0)) * 4;
              const bad = inside
                ? c[o] !== id[i] || c[o + 1] !== id[i + 1] || c[o + 2] !== id[i + 2] || c[o + 3] !== id[i + 3]
                : id[i + 3] !== 0;
              if (bad) throw new Error(`pixel ${x},${y} (${w}×${h}, tirage ${s}, image ${f}) mal rangé`);
            }
          }
        }
      }
    }
    expect(kept / full).toBeLessThan(0.5);
  });

  it("hors navigateur, pas de nuage", () => {
    expect(dustFrame(64, 80, 1, 2, 5)).toBe(null);
  });
});

// Image factice : elle ne charge que quand le test le décide.
class FakeImage {
  constructor() { this.complete = false; this.naturalWidth = 0; this.naturalHeight = 0; FakeImage.all.push(this); }
  set src(v) { this._src = v; }
  get src() { return this._src; }
  arrive(w = 16, h = 16) { this.complete = true; this.naturalWidth = w; this.naturalHeight = h; if (this.onload) this.onload(); }
  fail() { this.complete = true; if (this.onerror) this.onerror(); }
}
FakeImage.all = [];
const imgAt = (path) => FakeImage.all.find((im) => im.src === path);

describe("les ruines dessinées qui se chargent", () => {
  let S, P, RUINS, CM;
  beforeAll(async () => {
    vi.stubGlobal("Image", FakeImage);
    S = await import("../../cityEngineSprites.js");
    P = await import("../../pixelHouses.js");
    RUINS = await import("../../ruinArt.js");
    ({ CM } = await import("../../layout.js"));
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.stubGlobal("Image", FakeImage); });

  it("bâtiment de scène : compte les images en route, et la ruine arrivée sert", () => {
    const key = Object.keys(RUINS.RUIN_PROPS)[0];
    const before = S.propRuinsLoading();
    expect(S.propRelicCanvas(key)).toBe(null);
    expect(S.propRuinsLoading()).toBe(before + 1);
    S.propRelicCanvas(key);                                  // pas de seconde demande
    expect(S.propRuinsLoading()).toBe(before + 1);
    const ruin = imgAt("/pixelart/ruins/props/" + key + ".png");
    ruin.arrive();
    expect(S.propRuinsLoading()).toBe(before);
    expect(S.propRelicCanvas(key)).toBe(ruin);
  });

  it("bâtiment de scène : une ruine qui ne se charge pas retombe sur l'arasement", () => {
    const key = Object.keys(RUINS.RUIN_PROPS)[1];
    const before = S.propRuinsLoading();
    expect(S.propRelicCanvas(key)).toBe(null);
    imgAt("/pixelart/ruins/props/" + key + ".png").fail();
    expect(S.propRuinsLoading()).toBe(before);
    // Le sprite d'origine n'est pas encore là : rien, mais rien de RETENU non plus.
    expect(S.propRelicCanvas(key)).toBe(null);
    imgAt("/pixelart/agents/buildings/" + key + ".png").arrive(16, 16);
    const canvas = {
      width: 0, height: 0,
      getContext: () => ({
        drawImage() {},
        getImageData: (x, y, w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
        putImageData() {},
      }),
    };
    vi.stubGlobal("document", { createElement: () => canvas });
    expect(S.propRelicCanvas(key)).toBe(canvas);             // l'original arasé
  });

  it("habitation : une ruine qui ne se charge pas n'est plus attendue ni redemandée", () => {
    const key = Object.keys(RUINS.RUIN_HOUSES)[0];
    const path = "/pixelart/ruins/houses/" + key + ".png";
    const before = P.houseRuinsLoading();
    expect(P.houseRelicCanvas(key, 0, null, 0, false)).toBe(null);
    expect(P.houseRuinsLoading()).toBe(before + 1);
    imgAt(path).fail();
    expect(P.houseRuinsLoading()).toBe(before);
    P.houseRelicCanvas(key, 0, null, 0, false);              // repli : le sprite d'origine
    expect(FakeImage.all.filter((im) => im.src === path)).toHaveLength(1);
    expect(P.houseRuinsLoading()).toBe(before);
  });

  it("la signature des toiles retenues suit la neige", () => {
    const prev = CM.season;
    CM.season = 0;
    const a = P.relicArtSig();
    CM.season = 3;                                           // WINTER (seasonMode.js)
    expect(P.relicArtSig()).not.toBe(a);
    CM.season = prev;
  });
});
