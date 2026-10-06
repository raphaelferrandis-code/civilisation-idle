// LES PETITS OUTILS DE PIXEL PARTAGÉS RENDENT CE QUE RENDAIENT LES COPIES (audit du
// 05/10, STRUCT-9). Chaque copie remplacée par un import est gelée ici telle qu'elle
// était écrite, et comparée à l'outil partagé : modulo réel (wonderBake, wonderIsle,
// wonderPlace, plaisirsBake, waterRipples, isoWildBackdrop, blockCity), mélange rvb
// (isoBoxBake, roue, roulette), mélange hex et conversion hex des tables des Plaisirs
// (jetons, courses, roue, roulette), trame de Bayer (lumière de la salle).
import { describe, it, expect } from "vitest";
import { fm, mixRgb, mkCanvas, rasterCanvas } from "../pixelUtil.js";
import { hex, mix, bayer } from "../iso/plaisirsHDKit.js";
import { mix as boxMix } from "../iso/isoBoxBake.js";

// ── Copies d'origine, gelées ────────────────────────────────────────────────
const fmCopy = (a, n) => ((a % n) + n) % n;
const mixRgbBox = (a, b, t) => [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)];
const mixRgbRoue = (a, b, t) => [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t));
const hexRoue = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
function hexChips(c) {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mixChips(a, b, t) {
  const A = hexChips(a), B = hexChips(b);
  const m = A.map((v, i) => Math.round(v + (B[i] - v) * t));
  return `#${m.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
function mixCourses(a, b, t) {
  const A = hexChips(a), B = hexChips(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayerCopy = (x, y) => BAYER[(y & 3) * 4 + (x & 3)] / 16;

// Couleurs déterministes, toutes les composantes 0..255 couvertes.
const COLS = [];
for (let i = 0; i < 400; i += 1) {
  const n = Math.imul(i + 1, 2654435761) >>> 8;
  COLS.push('#' + (n & 0xffffff).toString(16).padStart(6, '0'));
}
COLS.push('#000000', '#ffffff', '#0a0b1c', '#ff6fb5');
const TS = [0, 0.1, 0.25, 0.35, 0.5, 0.55, 0.7, 0.9, 1, -0.2, 1.3];

describe("STRUCT-9 — les outils partagés sont les copies, à l'identique", () => {
  it("fm : le modulo réel, négatifs et fractions compris", () => {
    for (const a of [-7.5, -3, -1, -0.25, 0, 0.25, 1, 2.75, 3, 11, 1e6 + 0.5, -1e6 - 0.5]) {
      for (const n of [1, 2, 3, 6, 9, 12, 18, 0.5, 2.5]) expect(Object.is(fm(a, n), fmCopy(a, n))).toBe(true);
    }
  });
  it("mixRgb : le mélange rvb des boîtes cuites, de la roue et de la roulette", () => {
    expect(boxMix).toBe(mixRgb);
    for (let i = 0; i + 1 < COLS.length; i += 1) {
      const a = hexChips(COLS[i]), b = hexChips(COLS[i + 1]);
      for (const t of TS) {
        expect(mixRgb(a, b, t)).toEqual(mixRgbBox(a, b, t));
        expect(mixRgb(a, b, t)).toEqual(mixRgbRoue(a, b, t));
      }
    }
  });
  it("hex et mix des Plaisirs : ceux que recopiaient jetons, courses, roue et roulette", () => {
    for (const c of COLS) {
      expect(hex(c)).toEqual(hexChips(c));
      expect(hex(c)).toEqual(hexRoue(c));
    }
    for (let i = 0; i + 1 < COLS.length; i += 1) {
      for (const t of TS) {
        expect(mix(COLS[i], COLS[i + 1], t)).toBe(mixChips(COLS[i], COLS[i + 1], t));
        expect(mix(COLS[i], COLS[i + 1], t)).toBe(mixCourses(COLS[i], COLS[i + 1], t));
      }
    }
  });
  it("bayer : la trame de la lumière de la salle", () => {
    for (let y = -5; y < 9; y += 1) for (let x = -5; x < 9; x += 1) expect(bayer(x, y)).toBe(bayerCopy(x, y));
  });
  it("mkCanvas et rasterCanvas : la fabrique de canvas (OffscreenCanvas d'abord) et le raster → canvas du DOM", () => {
    const made = [];
    const prevO = globalThis.OffscreenCanvas, prevD = globalThis.document, prevI = globalThis.ImageData;
    try {
      globalThis.OffscreenCanvas = class { constructor(w, h) { this.w = w; this.h = h; made.push(this); } };
      expect(mkCanvas(3, 4)).toMatchObject({ w: 3, h: 4 });
      delete globalThis.OffscreenCanvas;
      const puts = [];
      globalThis.document = { createElement: () => ({ getContext: () => ({ putImageData: (d, x, y) => puts.push([d, x, y]) }) }) };
      globalThis.ImageData = class { constructor(data, w, h) { this.data = data; this.width = w; this.height = h; } };
      const c = mkCanvas(5, 6);
      expect([c.width, c.height]).toEqual([5, 6]);
      const R = { w: 2, h: 1, data: new Uint8ClampedArray(8) };
      const cv = rasterCanvas(R);
      expect([cv.width, cv.height]).toEqual([2, 1]);
      expect(puts).toHaveLength(1);
      expect(puts[0][0]).toMatchObject({ data: R.data, width: 2, height: 1 });
      expect(made).toHaveLength(1);
    } finally {
      if (prevO === undefined) delete globalThis.OffscreenCanvas; else globalThis.OffscreenCanvas = prevO;
      if (prevD === undefined) delete globalThis.document; else globalThis.document = prevD;
      if (prevI === undefined) delete globalThis.ImageData; else globalThis.ImageData = prevI;
    }
  });
});
