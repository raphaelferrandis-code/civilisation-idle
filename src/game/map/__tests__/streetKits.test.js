import { describe, it, expect } from "vitest";

import { streetKitFor, streetKitRasters, wildShrubRasters } from "../iso/streetKits.js";
import { medianPlan, medianUrbanCells } from "../iso/isoStreet.js";
import { AGE_CONFIG, ageConfigFor } from "../procedural/ageVisualConfig.js";

// LE MOBILIER DE RUE PAR ÈRE (iso/streetKits.js, 2026-10-02/03). Les images
// PixelLab des réverbères s'affichaient à un cinquième de leur pixel ; le kit
// dessine au grain de la ville. Ces gardes tiennent la toise et la pose.

// Boîte d'encre d'un raster : rangées/colonnes opaques.
function inkBox(S) {
  let x0 = S.w, x1 = -1, y0 = S.h, y1 = -1;
  for (let j = 0; j < S.h; j += 1) for (let i = 0; i < S.w; i += 1) {
    if (!S.data[(j * S.w + i) * 4 + 3]) continue;
    x0 = Math.min(x0, i); x1 = Math.max(x1, i); y0 = Math.min(y0, j); y1 = Math.max(y1, j);
  }
  return { x0, x1, y0, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

describe("streetKits — réverbère et plantations au grain de la ville", () => {
  const BANDS = [2, 3, 4, 5, 6, 7, 8, 9];
  // Tous les rasters d'une bande : le réverbère et chaque plantation (variantes et saisons).
  const all = (R) => [R.lamp, ...Object.values(R).filter((v) => Array.isArray(v) && v[0] && v[0].data).flat()];

  it("chaque ère à boulevards a son kit ; le camp et le hameau n'en ont pas", () => {
    for (const b of BANDS) expect(streetKitFor(b)).not.toBeNull();
    for (const b of [0, 1]) expect(streetKitFor(b)).toBeNull();
  });

  // Audit du 05/10, MORT-13 : le mobilier d'avant le kit (parterres, buissons et
  // réverbères PNG) est RETIRÉ. Sans kit, le terre-plein et les mâts ne se dessinent
  // plus du tout : toute bande qui trace des avenues (donc des terre-pleins, cf.
  // computeTerrePleinSegments) doit avoir un kit avec terre-plein ET réverbère.
  it("toute bande à avenues a un terre-plein et un réverbère de kit (rien d'autre ne les dessine)", () => {
    for (let b = 0; b < AGE_CONFIG.length; b += 1) {
      if (!ageConfigFor(b).roadRanks.avenue) continue;
      const K = streetKitFor(b);
      expect(K && K.median, `bande ${b} : terre-plein`).toBeTruthy();
      expect(K && typeof K.lamp, `bande ${b} : réverbère`).toBe("function");
    }
  });

  it("chaque réverbère fait environ deux habitants et demi (16 à 23 px d'encre au zoom 1)", () => {
    for (const b of BANDS) {
      const box = inkBox(streetKitRasters(b).lamp);
      expect(box.h).toBeGreaterThanOrEqual(16);
      expect(box.h).toBeLessThanOrEqual(23);
      expect(box.w).toBeLessThanOrEqual(13);
    }
  });

  it("chaque objet se POSE : rien sous la rangée du pied, le pied est encré (toutes saisons)", () => {
    for (const b of BANDS) {
      for (const S of all(streetKitRasters(b))) {
        expect(inkBox(S).y1).toBe(S.footRow);
      }
      expect(streetKitRasters(b).lamp.data[(streetKitRasters(b).lamp.footRow * streetKitRasters(b).lamp.w + streetKitRasters(b).lamp.ox) * 4 + 3]).toBe(255);
    }
    for (const S of wildShrubRasters()) expect(inkBox(S).y1).toBe(S.footRow);
  });

  it("pixel art franc : aucun pixel à demi transparent", () => {
    for (const b of BANDS) {
      for (const S of all(streetKitRasters(b))) {
        for (let k = 3; k < S.data.length; k += 4) expect([0, 255]).toContain(S.data[k]);
      }
    }
  });

  it("on ne noue pas de fil à un mât qui BRÛLE (Pierre, Marbre) ; aux autres, pas au-dessus de la tête", () => {
    for (const b of BANDS) {
      const R = streetKitRasters(b);
      const fire = b === 2 || b === 4;
      if (fire) expect(R.tieY).toBeNull();
      else {
        expect(R.tieY).toBeGreaterThan(4);
        expect(R.tieY).toBeLessThanOrEqual(Math.max(...R.heads.map((h) => h.y)));
      }
    }
  });

  it("le cyprès dépasse le réverbère, sans l'écraser (fuseau étroit)", () => {
    const R = streetKitRasters(4);
    const lamp = inkBox(R.lamp), tree = inkBox(R.tree[0]);
    expect(tree.h).toBeGreaterThan(lamp.h);
    expect(tree.w).toBeLessThanOrEqual(7);
  });
});

describe("medianPlan — le terre-plein suit la ville", () => {
  const T = 32;
  const kit = streetKitFor(4);
  // Boulevard horizontal : voies aux rangées 10 et 11, couture y = 10, x 2..13.
  const seg = { axis: "h", y: 10, x0: 2, x1: 13 };
  // Une seule maison, au nord de la voie, en x = 7 : elle borde les cases 6 à 8.
  const L = { tiles: [{ gx: 7, gy: 9, spanX: 1, spanY: 1, buildingId: "house" }] };

  it("hors de la ville, rien : seules les cases bordées par une façade sont « en ville »", () => {
    const u = medianUrbanCells(L, seg);
    expect(u.length).toBe(12);
    u.forEach((v, i) => expect(v).toBe(seg.x0 + i >= 6 && seg.x0 + i <= 8));
  });

  it("une maison isolée au bout du boulevard ne fait pas une ville (moins de 3 cases)", () => {
    const lone = { tiles: [{ gx: seg.x0 - 1, gy: 9, spanX: 1, spanY: 1, buildingId: "caravan" }] };
    expect(medianUrbanCells(lone, seg).every((v) => !v)).toBe(true);
  });

  it("une voie retombée en herbe n'est pas une rue, même bordée d'une façade (règle du trottoir)", () => {
    // Le sol de la voie est de l'herbe (courOf) : caravane au bord du boulevard en forêt.
    const cour = new Map();
    for (let x = seg.x0; x <= seg.x1; x += 1) { cour.set(x + ",10", "grass"); cour.set(x + ",11", "grass"); }
    const forest = { ...L, urbanSet: new Set(), _courField: cour };
    expect(medianUrbanCells(forest, seg).every((v) => !v)).toBe(true);
  });

  it("la suite du kit se répète au pas voulu, centrée, sans sortir de la couture", () => {
    const plan = medianPlan(L, seg, T, kit);
    const P = kit.median.step * T;
    plan.forEach((sl, i) => {
      expect(sl.kind).toBe(kit.median.pattern[i % kit.median.pattern.length]);
      expect(sl.wy).toBe((seg.y + 1) * T);
      if (i) expect(sl.wx - plan[i - 1].wx).toBeCloseTo(P, 6);
    });
    const left = plan[0].wx - seg.x0 * T, right = (seg.x1 + 1) * T - plan[plan.length - 1].wx;
    expect(Math.abs(left - right)).toBeLessThan(1e-6);
  });

  it("les objets hors de la ville sont marqués comme tels (ni plantation, ni mât)", () => {
    for (const sl of medianPlan(L, seg, T, kit)) {
      const gx = Math.floor(sl.wx / T);
      expect(sl.urban).toBe(gx >= 6 && gx <= 8);
    }
  });
});
