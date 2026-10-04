import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { PNG } from "pngjs";
import { ROW_VARIANTS, rowVariantCount, rowVariantIndex, recolorData } from "../rowVariants.js";
import { ROWS } from "../ilotArt.js";

// LES RANGÉES ALTERNENT (Raph 2026-10-04 : « vas-y pour alterner des dessins de même
// hauteur ») : même dessin, matière différente — jamais deux voisines pareilles.
describe("variantes des rangées", () => {
  it("chaque modèle de rangée d'un âge a ses variantes", () => {
    const models = new Set();
    for (const R of Object.values(ROWS)) for (const m of Object.keys(R.models)) models.add(m);
    for (const m of models) expect(rowVariantCount(m), m).toBeGreaterThan(2);
  });

  it("deux maisons voisines d'une rangée n'ont jamais le même dessin", () => {
    for (const m of Object.keys(ROW_VARIANTS)) {
      for (const side of [1, 77, 123456789, 0xdeadbeef]) {
        for (let i = -20; i < 40; i += 1) {
          expect(rowVariantIndex(m, side, i), `${m} ${side} ${i}`).not.toBe(rowVariantIndex(m, side, i + 1));
        }
      }
    }
  });

  it("une variante ne déplace aucun pixel et ne touche que la matière visée", () => {
    for (const m of Object.keys(ROW_VARIANTS)) {
      const p = PNG.sync.read(readFileSync(new URL(`../../../../public/pixelart/houses/row-${m}-fl.png`, import.meta.url)));
      for (const rules of ROW_VARIANTS[m]) {
        const d = Buffer.from(p.data);
        recolorData(d, rules);
        let changed = 0, opaque = 0;
        for (let i = 0; i < d.length; i += 4) {
          expect(d[i + 3]).toBe(p.data[i + 3]);                       // alpha intact
          if (p.data[i + 3] < 8) continue;
          opaque += 1;
          if (d[i] !== p.data[i] || d[i + 1] !== p.data[i + 1] || d[i + 2] !== p.data[i + 2]) changed += 1;
        }
        expect(changed, `${m} : la variante change quelque chose`).toBeGreaterThan(0);
        expect(changed / opaque, `${m} : la variante ne repeint pas tout`).toBeLessThan(0.7);
      }
    }
  });
});
