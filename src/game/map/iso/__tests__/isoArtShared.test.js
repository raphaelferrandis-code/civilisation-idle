// UNE PNG, UNE ENTRÉE, UNE ENCRE (audit du 05/10, STRUCT-4). Le registre des places
// (isoPlaza.art) recopiait celui de l'art iso : le même brasero était chargé et mesuré
// deux fois, sous deux clés. Et l'encre existait en deux versions — { x, y } pour les
// objets des ponts et des merveilles (isoProps), { x0, y0 } pour les places — : une
// ligne recopiée de l'une à l'autre a éteint la lueur de tous les braseros de parvis
// (BUG-61). Ici : une seule entrée par PNG, une seule encre, et le pied de l'encre d'un
// objet posé tombe bien sur son point.
// Fichier à part : le cache d'art est un cache de MODULE, il doit naître avec ce faux
// `Image` (cf. plazaArtRev.test.js).
import { it, expect, beforeAll, afterAll } from "vitest";
import { CM } from "../../layout.js";
import { SUN_SHADOW } from "../isoSunShadow.js";

const requested = [];
class FakeImage {
  constructor() { this.onload = null; this.onerror = null; this.naturalWidth = 0; this.naturalHeight = 0; this._src = ""; }
  get src() { return this._src; }
  set src(v) { this._src = v; requested.push(this); }
}

let plaza, props, art, prevImage;
beforeAll(async () => {
  prevImage = globalThis.Image;
  globalThis.Image = FakeImage;
  art = await import("../isoArt.js");
  plaza = await import("../isoPlaza.js");
  props = await import("../isoProps.js");
});
afterAll(() => { globalThis.Image = prevImage; });

it("le brasero d'un pont et celui d'un parvis lisent la même entrée", () => {
  expect(plaza.plazaPropImage("brazier", "antique")).toBe(null);
  expect(props.propArt({ prop: "brazier", era: "antique" })).toBe(null);
  const asked = requested.filter((im) => im.src === "/pixelart/iso/plaza/brazier-antique.png");
  expect(asked).toHaveLength(1);
  asked[0].naturalWidth = 20; asked[0].naturalHeight = 30;
  asked[0].onload();
  const im = plaza.plazaPropImage("brazier", "antique");
  expect(im).toBe(asked[0]);
  expect(props.propArt({ prop: "brazier", era: "antique" })).toBe(im);
});

it("une variante absente : le verdict d'échec est tenu par l'entrée partagée", () => {
  expect(plaza.plazaPropImage("bench", "medieval", "n")).toBe(null);
  const v = requested.find((im) => im.src === "/pixelart/iso/plaza/bench-n-medieval.png");
  expect(v).toBeTruthy();
  v.onerror();
  expect(art.isoArt("plaza/bench-n-medieval").failed).toBe(true);
  plaza.plazaPropImage("bench", "medieval", "n");
  expect(requested.some((im) => im.src === "/pixelart/iso/plaza/bench-medieval.png")).toBe(true);
});

it("une seule encre, au format { x0, y0, w, h }", () => {
  expect(plaza.inkBox).toBe(art.inkBox);
  expect("inkBox" in props).toBe(false);
  // Sans DOM, la mesure échoue : repli sur le canvas entier (même règle qu'un canvas souillé).
  expect(art.inkBox({ naturalWidth: 20, naturalHeight: 30 })).toEqual({ x0: 0, y0: 0, w: 20, h: 30 });
  expect(art.inkBox({ width: 8, height: 6 })).toEqual({ x0: 0, y0: 0, w: 8, h: 6 });
  expect(art.inkBox({ naturalWidth: 0, naturalHeight: 0 })).toBe(null);
});

it("un objet posé (statue de pont) : le pied de l'encre tombe sur son point, sans NaN", () => {
  CM.TILE = 32; CM.cam = { x: 0, y: 0, zoom: 1 }; CM.nightF = 0;
  const prevOn = SUN_SHADOW.on;
  SUN_SHADOW.on = false;
  try {
    props.propArt({ prop: "statue", era: "antique" });
    const im = requested.find((x) => x.src === "/pixelart/iso/plaza/statue-antique.png");
    im.naturalWidth = 20; im.naturalHeight = 28;
    im.onload();
    const calls = [];
    const ctx = { drawImage: (...a) => calls.push(a) };
    props.drawSpriteProp(ctx, { prop: "statue", era: "antique" }, { x: 100, y: 200 }, 1);
    expect(calls).toHaveLength(1);
    const [img, dx, dy, dw, dh] = calls[0];
    expect(img).toBe(im);
    for (const v of [dx, dy, dw, dh]) expect(Number.isFinite(v)).toBe(true);
    // Encre = canvas entier (sans DOM) : 14 px d'encre voulus pour 28 → s = 0,5.
    expect(dh).toBeCloseTo(14);
    expect(dx).toBe(Math.round(100 - 10 * 0.5));          // centre de l'encre sur x
    expect(dy).toBe(Math.round(200 - 28 * 0.5 + 0.25));   // bas de l'encre sur y
  } finally {
    SUN_SHADOW.on = prevOn;
  }
});
