// LA NEIGE ÉPARGNE LES SKINS COSMIQUES DES MAISONS (audit 05/10, BUG-96).
//
// snowRoof exclut les clés « -cosmic- » (« une calotte blanche les éteint ») —
// mais seulement sur son chemin à clé, snowSprite (tours-moteur). Les habitations
// enneigent un buffer déjà en main (snowImageData, qui ne voit pas de clé) : en
// hiver aux bandes 7-9, tower, megablock, arcologyhome… prenaient la calotte que
// leurs voisines moteur n'ont pas. La garde rejoue le vrai chemin de dessin
// (pixelHouseSprite) avec un faux DOM et compte les passes de neige.
import { describe, it, expect, vi, afterAll, beforeEach } from "vitest";

const snowCalls = [];
vi.mock("../snowRoof.js", async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, snowImageData: (img, w, h) => { snowCalls.push(w + "x" + h); return 0; } };
});

// Faux DOM minimal : une image de 40 × 60 entièrement opaque, décodée aussitôt.
class FakeCtx {
  drawImage() {}
  getImageData(x, y, w, h) { const d = new Uint8ClampedArray(w * h * 4); for (let i = 3; i < d.length; i += 4) d[i] = 255; return { data: d, width: w, height: h }; }
  createImageData(w, h) { return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h }; }
  putImageData() {}
}
class FakeCanvas {
  constructor(w = 0, h = 0) { this.width = w; this.height = h; }
  getContext() { return new FakeCtx(); }
}
class FakeImage {
  constructor() { this.onload = null; this.naturalWidth = 0; this.naturalHeight = 0; this._src = ""; }
  get src() { return this._src; }
  set src(v) { this._src = v; this.naturalWidth = 40; this.naturalHeight = 60; if (this.onload) this.onload(); }
}

// Posé AVANT l'import des modules (même idiome que housePreloadRequests.test.js) ;
// le chargement compte ainsi dans l'import, pas dans un crochet à délai.
const saved = {};
for (const k of ["Image", "OffscreenCanvas", "document"]) saved[k] = globalThis[k];
globalThis.Image = FakeImage;
globalThis.OffscreenCanvas = FakeCanvas;
globalThis.document = { createElement: () => new FakeCanvas() };
const { CM } = await import("../layout.js");
const { WINTER } = await import("../seasonMode.js");
const H = await import("../pixelHouses.js");
afterAll(() => { for (const k of Object.keys(saved)) globalThis[k] = saved[k]; });

const draw = (variant, band, gx) => {
  CM.layout = { counts: { eraBand: band } };
  H.preloadHouseSprites(band);
  return H.pixelHouseSprite({ variant, gx, gy: 3, size: 1 }, 0, 0, 64, 32);
};

describe("neige d'hiver sur les habitations", () => {
  beforeEach(() => { snowCalls.length = 0; CM.season = WINTER; });

  it("un skin cosmique ne prend pas la calotte", () => {
    for (const band of [7, 8, 9]) {
      const g = draw("tower", band, 11 + band);
      expect(g && g.key, `bande ${band}`).toBe("tower-cosmic-" + band);
    }
    expect(snowCalls, "aucune passe de neige sur un skin cosmique").toEqual([]);
  });

  it("une maison ordinaire, elle, est enneigée (la garde mord)", () => {
    const g = draw("townhouse", 4, 5);
    expect(g && g.key).toBe("townhouse");
    expect(snowCalls.length).toBeGreaterThan(0);
  });
});
