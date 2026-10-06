// LE MÊME FEU PARTOUT (décision de Raph, audit du 05/10, STRUCT-4). Les braseros des
// ponts et des merveilles, et les flammes procédurales (torches, vasques, tour-porte),
// éclairaient par un dégradé de NUIT SEULE (isoProps.glowAt) quand ceux des places
// passaient par la recette de tous les feux (flameGlow.queueFlameGlow : plancher de
// jour, nappe la nuit, poids). Le même brasero n'éclairait pas pareil sur un pont et
// sur un parvis. Ici : en plein jour, brasero et flamme déposent une lueur discrète,
// dans la teinte des feux et au poids FIRE_GLOW_MUL (1,0) ; le réverbère, qui n'est
// pas un feu, reste sur glowAt (rien de jour).
// Fichier à part : le cache d'art est un cache de MODULE, il doit naître avec ce faux
// `Image` (cf. isoArtShared.test.js).
import { it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { CM } from "../../layout.js";
import { SUN_SHADOW } from "../isoSunShadow.js";
import { FLAME_COL, FLAME_GLOW, flameFlicker, paintFlameGlows, pendingFlameGlows } from "../../flameGlow.js";

const requested = [];
class FakeImage {
  constructor() { this.onload = null; this.onerror = null; this.naturalWidth = 0; this.naturalHeight = 0; this._src = ""; }
  get src() { return this._src; }
  set src(v) { this._src = v; requested.push(this); }
}

// Contexte qui retient les lueurs posées en additif (repli par dégradé sous Node :
// pas de canvas hors écran, donc le premier arrêt de couleur porte teinte et alpha).
function lightSink() {
  const ctx = { globalAlpha: 1, globalCompositeOperation: "source-over", imageSmoothingEnabled: true, glows: [] };
  ctx.drawImage = () => {};
  ctx.createRadialGradient = (x, y, _r0, _x1, _y1, r) => ({
    addColorStop: (stop, col) => { if (stop === 0) ctx._g = { x, y, r, col }; },
  });
  ctx.fillRect = () => { if (ctx.globalCompositeOperation === "lighter" && ctx._g) { ctx.glows.push(ctx._g); ctx._g = null; } };
  return ctx;
}
const rgbOf = (col) => /rgba\((\d+,\d+,\d+),/.exec(col)[1];
const alphaOf = (col) => +/,([0-9.]+)\)$/.exec(col)[1];

let props, prevImage, prevShadow;
beforeAll(async () => {
  prevImage = globalThis.Image;
  globalThis.Image = FakeImage;
  props = await import("../isoProps.js");
  prevShadow = SUN_SHADOW.on;
  SUN_SHADOW.on = false;
  CM.TILE = 32; CM.cam = { x: 0, y: 0, zoom: 1 };
});
afterAll(() => { globalThis.Image = prevImage; SUN_SHADOW.on = prevShadow; });
afterEach(() => { paintFlameGlows(null); CM.nightF = 0; });

function loadBrazier(era) {
  props.propArt({ prop: "brazier", era });
  const im = requested.find((x) => x.src === `/pixelart/iso/plaza/brazier-${era}.png`);
  im.naturalWidth = 20; im.naturalHeight = 40;
  im.onload();
  return im;
}

it("un brasero de pont éclaire comme un brasero de parvis, même en plein jour", () => {
  loadBrazier("antique");
  CM.nightF = 0;
  const now = 1234;
  props.drawSpriteProp({ drawImage: () => {} }, { prop: "brazier", era: "antique", l: 10, t: 2 }, { x: 100, y: 200 }, 1, now);
  expect(pendingFlameGlows()).toBe(1);                 // de jour : le cœur, sans nappe
  const sink = lightSink();
  paintFlameGlows(sink);
  expect(sink.glows).toHaveLength(1);
  const g = sink.glows[0];
  expect(rgbOf(g.col)).toBe(FLAME_COL);
  // Poids 1,0 (décision de Raph du 2026-10-06 : à 0,6, celui des braseros de parvis,
  // ces feux éclairaient la nuit deux fois moins qu'avant), scintillement de SA phase.
  const want = FLAME_GLOW.day * FLAME_GLOW.gain * props.FIRE_GLOW_MUL * flameFlicker(now, 10 * 0.41 + 2 * 0.23);
  expect(alphaOf(g.col)).toBeCloseTo(want, 3);
  expect(props.FIRE_GLOW_MUL).toBe(1.0);
  // Point chaud à 18 % sous le haut de l'encre, rayon 0,55 tuile (comme le parvis).
  expect(g.r).toBeCloseTo(Math.max(6, 32 * 0.55) * FLAME_GLOW.r);
  for (const v of [g.x, g.y]) expect(Number.isFinite(v)).toBe(true);
});

it("la nuit, le brasero pose aussi sa nappe ; l'orbe cosmique éclaire or pâle", () => {
  loadBrazier("cosmic");
  CM.nightF = 1;
  props.drawSpriteProp({ drawImage: () => {} }, { prop: "brazier", era: "cosmic", x: 3, y: 4 }, { x: 50, y: 60 }, 1, 0);
  expect(pendingFlameGlows()).toBe(2);
  const sink = lightSink();
  paintFlameGlows(sink);
  expect(sink.glows.map((g) => rgbOf(g.col))).toEqual(["255,214,140", "255,214,140"]);
});

it("une flamme procédurale (torche, vasque) : la lueur des feux, de jour comme de nuit", () => {
  const ctx = { fillStyle: "", fillRect: () => {} };
  CM.nightF = 0;
  props.drawFlame(ctx, 40, 80, 1, 500, 1, 0.5);
  expect(pendingFlameGlows()).toBe(1);
  const sink = lightSink();
  paintFlameGlows(sink);
  expect(rgbOf(sink.glows[0].col)).toBe(FLAME_COL);
  const want = FLAME_GLOW.day * FLAME_GLOW.gain * props.FIRE_GLOW_MUL * flameFlicker(500, 0.5 * 2.1);
  expect(alphaOf(sink.glows[0].col)).toBeCloseTo(want, 3);
});

it("le réverbère n'est pas un feu : il reste sur glowAt (rien de jour, rien dans la file)", () => {
  CM.nightF = 0;
  CM.layout = { counts: { eraBand: 5 } };
  try {
    props.drawSpriteProp({ drawImage: () => {} }, { prop: "gaslamp", era: "industrial" }, { x: 10, y: 10 }, 1, 0);
    expect(pendingFlameGlows()).toBe(0);
  } finally {
    CM.layout = null;
  }
});
