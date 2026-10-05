// LE PRÉ (docs/PLAN-VEGETATION.md, lot 4) : herbe à la dose B, prés en zones, fleurs en
// colonies. Tout se mesure : sur les PNG livrés et sur les champs (fonctions pures).
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { PNG } from "pngjs";
import { FLOWER_COLONY, GRASS_DETAIL, GRASS_TILE_UNDER, flowerColonyK } from "../iso/isoGroundDetail.js";
import { LAWN, MEADOW, meadowAt, meadowPixel, townLawnAt } from "../iso/isoMeadow.js";
import { CM } from "../layout.js";

const DIR = new URL("../../../../public/pixelart/iso/", import.meta.url);
const read = (name) => PNG.sync.read(fs.readFileSync(new URL(name + ".png", DIR)));
const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
function meanLum(p, mask) {
  let s = 0, n = 0;
  for (let i = 0; i < p.width * p.height; i += 1) {
    if (p.data[i * 4 + 3] < 128) continue;
    if (mask && !mask(p.data[i * 4], p.data[i * 4 + 1], p.data[i * 4 + 2])) continue;
    s += lum(p.data[i * 4], p.data[i * 4 + 1], p.data[i * 4 + 2]); n += 1;
  }
  return s / n;
}

describe("le pré : la dose B (pré clair, forêt sombre)", () => {
  const pre = [1, 2, 3, 4].map((v) => meanLum(read("iso-grass-" + v))).reduce((a, b) => a + b, 0) / 4;

  it("les 4 tuiles d'herbe sont à la luminance visée (92), écarts gardés", () => {
    expect(pre).toBeGreaterThan(89);
    expect(pre).toBeLessThan(95);
    // Le patchwork voulu : les variantes ne sont PAS égalisées.
    const l = [1, 2, 3, 4].map((v) => meanLum(read("iso-grass-" + v)));
    expect(Math.max(...l) - Math.min(...l)).toBeGreaterThan(8);
  });

  it("le creux sous les brins suit la tuile (GRASS_TILE_UNDER)", () => {
    expect(Math.abs(lum(...GRASS_TILE_UNDER) - pre)).toBeLessThan(6);
  });

  it("couronne d'un feuillu adulte ÷ pré entre 0,85 et 1,0 (c'était 1,8)", () => {
    // Feuillage = même définition que la pose (installVegetation.mjs) : teinte 50-200°,
    // saturation HSV > 0,15.
    const leaf = (r, g, b) => {
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
      if (!d || mx < 16) return false;
      const h = ((mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60 + 360) % 360;
      return h >= 50 && h <= 200 && d / mx > 0.15;
    };
    for (const n of ["tree-1", "tree-2"]) {
      const k = meanLum(read(n), leaf) / pre;
      expect(k, n).toBeGreaterThan(0.85);
      expect(k, n).toBeLessThan(1.0);
    }
  });
});

describe("le pré : les zones", () => {
  const river = new Set();
  for (let y = 0; y < 200; y += 1) river.add("100," + y);
  const at = meadowAt({ gridN: 200, river: { present: true, cells: river } });

  it("l'herbe est grasse au bord de l'eau, sèche ou grasse ailleurs", () => {
    let pres = 0, n = 0, dry = 0, wet = 0, m = 0;
    for (let y = 0; y < 200; y += 1) {
      for (const x of [101, 102]) { if (at(x, y) < 0) pres += 1; n += 1; }
      for (let x = 0; x < 80; x += 1) { const s = at(x, y); if (s > 0.4) dry += 1; if (s < -0.4) wet += 1; m += 1; }
    }
    expect(pres / n).toBeGreaterThan(0.8);
    expect(dry / m).toBeGreaterThan(0.08);
    expect(wet / m).toBeGreaterThan(0.08);
  });

  it("les zones sont lisses : pas de marche d'une cellule à l'autre", () => {
    let worst = 0;
    for (let y = 0; y < 80; y += 1) for (let x = 0; x < 79; x += 1) worst = Math.max(worst, Math.abs(at(x + 1, y) - at(x, y)));
    expect(worst).toBeLessThan(0.4);
    expect(MEADOW.scale).toBeGreaterThanOrEqual(8);
  });

  it("l'ancien voile par losange est éteint (il montrait la grille au-delà de 8 %)", () => {
    expect(GRASS_DETAIL.meadow).toBe(0);
  });
});

describe("les fleurs en colonies", () => {
  it("même NOMBRE de fleurs qu'avant : le facteur de colonie vaut 1 en moyenne", () => {
    let s = 0, n = 0;
    for (let y = 0; y < 400; y += 1) for (let x = 0; x < 400; x += 1) { s += flowerColonyK(x, y); n += 1; }
    expect(s / n).toBeGreaterThan(0.9);
    expect(s / n).toBeLessThan(1.1);
  });

  it("au moins 70 % des fleurs tombent dans une colonie", () => {
    let inCol = 0, tot = 0;
    for (let y = 0; y < 400; y += 1) for (let x = 0; x < 400; x += 1) {
      const k = flowerColonyK(x, y);
      tot += k;
      if (k >= FLOWER_COLONY.norm * 0.5) inCol += k;
    }
    expect(inCol / tot).toBeGreaterThan(0.7);
  });
});

describe("la pelouse de ville (lot 5)", () => {
  // Un jardin de 5 × 5 cellules (L.townGreen) et une friche de quartier (cour 'grass').
  const green = new Set();
  for (let y = 10; y < 15; y += 1) for (let x = 10; x < 15; x += 1) green.add(x + "," + y);
  const cour = new Map([["30,30", "grass"], ["31,30", "urban"]]);
  const L = { gridN: 60, townGreen: green, river: null, counts: { eraBand: 2 } };
  const lawn = townLawnAt(L, cour);

  it("pas de pelouse au camp ni au village : leur herbe est un pré", () => {
    for (const band of [0, 1]) {
      const l = townLawnAt({ gridN: 60, townGreen: green, river: null, counts: { eraBand: band } }, cour);
      expect(l(12, 12)).toBe(0);
    }
    const camp = new Map([["30,30", "grass"]]); camp.camp = true;
    expect(townLawnAt({ gridN: 60, townGreen: null, river: null, counts: { eraBand: 2 } }, camp)(30, 30)).toBe(0);
  });

  it("jardins et friche sont de la pelouse ; le cœur du jardin est reconnu", () => {
    expect(lawn(12, 12)).toBe(2);          // ses 8 voisines sont du jardin
    expect(lawn(10, 12)).toBe(1);          // bord
    expect(lawn(30, 30)).toBe(1);          // friche d'une cellule
    expect(lawn(31, 30)).toBe(0);          // sol de ville
    expect(lawn(40, 40)).toBe(0);          // herbe sauvage
  });

  it("la pelouse prend le voile clair de la pelouse, pas celui des prés", () => {
    CM.season = 1;
    const px = meadowPixel(L, lawn);
    const d = new Uint8ClampedArray(4);
    expect(px(12, 12, d, 0)).toBe(true);
    expect([...d]).toEqual([...LAWN.col, Math.round(LAWN.alpha * 255)]);
    MEADOW.on = true;
  });
});
