// LA LUEUR DES BRASEROS DE PARVIS (audit 05/10, BUG-61).
//
// brazierGlow lisait `bb.x` / `bb.y` — la forme de l'encre d'isoProps, d'où ses
// lignes venaient — alors que l'encre des places (inkBox d'isoPlaza) rend
// { x0, y0, w, h }. La lueur partait en NaN : drawImage(NaN) ne dessine rien, et
// les quatre braseros de chaque parvis brûlaient sans éclairer, de jour comme de
// nuit. La garde : ce que reçoit queueFlameGlow est FINI, et tombe là où il faut
// (au cœur du feu, 18 % sous le haut de l'encre), calculé EN DUR ici.
import { describe, it, expect, vi, beforeEach } from "vitest";

const calls = [];
vi.mock("../../flameGlow.js", async (importOriginal) => ({
  ...(await importOriginal()),
  queueFlameGlow: (...a) => { calls.push(a); },
}));

const { CM } = await import("../../layout.js");
const { brazierGlow, inkBox } = await import("../isoPlaza.js");

describe("lueur des braseros de place", () => {
  beforeEach(() => {
    calls.length = 0;
    CM.TILE = 32;
    CM.cam = { ...(CM.cam || {}), x: 0, y: 0, zoom: 1 };
  });

  it("l'encre des places rend x0/y0 (et pas x/y)", () => {
    // Sans DOM, inkBox retombe sur le canvas entier : la FORME suffit ici.
    const bb = inkBox({ naturalWidth: 20, naturalHeight: 30 });
    expect(bb).toMatchObject({ x0: 0, y0: 0, w: 20, h: 30 });
  });

  it("la lueur tombe au cœur du feu, en coordonnées finies", () => {
    const im = { naturalWidth: 40, naturalHeight: 50 };
    const bb = { x0: 8, y0: 10, w: 20, h: 30 };          // encre décalée dans le canvas
    const g = { dx: 100, dy: 200, dw: 80, dh: 100 };     // canvas posé à l'écran ×2
    brazierGlow({ wx: 64, wy: 96 }, "antique", bb, im, g, 1234);
    expect(calls).toHaveLength(1);
    const [x, y, r] = calls[0];
    expect(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(r)).toBe(true);
    // x = 100 + (8 + 10) / 40 × 80 = 136 ; y = 200 + (10 + 5,4) / 50 × 100 = 230,8
    expect(x).toBeCloseTo(136, 6);
    expect(y).toBeCloseTo(230.8, 6);
  });

  it("avec l'encre telle qu'inkBox la rend, la lueur reste finie", () => {
    const im = { naturalWidth: 20, naturalHeight: 30 };
    brazierGlow({ wx: 3, wy: 7 }, "cosmic", inkBox(im), im, { dx: 5, dy: 6, dw: 40, dh: 60 }, 0);
    expect(calls).toHaveLength(1);
    expect(calls[0].slice(0, 3).every(Number.isFinite)).toBe(true);
  });
});
