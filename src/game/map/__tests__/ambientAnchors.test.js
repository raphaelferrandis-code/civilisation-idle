// ANCRES DES PARTICULES D'AMBIANCE (audit du 05/10, PERF-47). L'essence de chaque
// arbre (treeVariantOf, deux hachages pour un arbre jamais peint) était calculée
// pour TOUS les arbres de la ville avant le test de bornes, à chaque cellule
// franchie pendant un pan — pour 260 ancres au plus. On compte les essences
// calculées (lecture de `_tv`, la première chose que lit treeVariantOf) : pas de
// chronomètre.
import { describe, it, expect } from "vitest";
import { CM } from "../layout.js";
import { isoVegAnchors } from "../iso/isoAmbient.js";

describe("ancres de végétation", () => {
  it("ne calcule l'essence que des arbres gardés, et garde les mêmes qu'avant", () => {
    let reads = 0;
    const trees = [];
    for (let gy = 0; gy < 80; gy += 1) {
      for (let gx = 0; gx < 80; gx += 1) {
        const tr = { gx, gy, r: 0.7 };
        Object.defineProperty(tr, "_tv", { get() { reads += 1; return 1; } });
        trees.push(tr);
      }
    }
    CM.TILE = 32; CM.layoutRecomputeAt = 9191;
    const L = { trees, gridN: 80, mapSeed: 3, counts: { eraBand: 2 } };
    const b = { gx0: 30, gy0: 30, gx1: 50, gy1: 50 };       // 441 arbres dans la vue
    const list = isoVegAnchors(L, b);
    // Les 260 premiers arbres de la vue, dans l'ordre du plan — comme avant.
    const want = trees.filter((t) => t.gx >= 30 && t.gx <= 50 && t.gy >= 30 && t.gy <= 50).slice(0, 260);
    expect(list.length).toBe(260);
    expect(list.map((a) => [a.wx, a.wy])).toEqual(want.map((t) => [(t.gx + 0.5) * 32, (t.gy + 0.9) * 32]));
    // Avant : 6 400 essences calculées (toute la ville) ; ici, les seules ancres gardées.
    expect(reads).toBe(260);
  });
});
