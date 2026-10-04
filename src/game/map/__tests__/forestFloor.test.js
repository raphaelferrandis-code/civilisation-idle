// LE SOUS-BOIS (docs/PLAN-VEGETATION.md, lot 3, iso/isoForestFloor.js).
// Il suit la forêt : sombre au cœur des fourrés, nul sur les routes et au ras de la
// vie (TREE_LIFE : là où aucun arbre ne pousse, aucune ombre de couronne), et il éteint
// les fleurs. Un plan minimal suffit : une route en croix au milieu d'une grande grille.
import { describe, it, expect } from "vitest";
import { TREE_LIFE } from "../layout.js";
import { forestDensity } from "../iso/isoWildForest.js";
import { FOREST_FLOOR, forestFloorAt, forestFlowerK } from "../iso/isoForestFloor.js";

function plan() {
  const roadSet = new Set();
  for (let i = 0; i < 120; i += 1) { roadSet.add(i + ",60"); roadSet.add("60," + i); }
  return { gridN: 120, roadSet, urbanSet: new Set(), tiles: [], river: null };
}

describe("sous-bois", () => {
  const L = plan();
  const at = forestFloorAt(L);

  it("nul sur la route et au ras de la vie, jamais hors de 0..1", () => {
    for (let i = 0; i < 120; i += 1) expect(at(i, 60)).toBe(0);
    for (let d = 0; d <= TREE_LIFE.clear; d += 1) expect(at(30, 60 + d)).toBe(0);
    for (let y = 0; y < 120; y += 3) for (let x = 0; x < 120; x += 3) {
      const f = at(x, y);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThanOrEqual(1);
    }
  });

  it("suit les fourrés : plein au cœur des denses, nul dans les trouées", () => {
    let plein = 0, vides = 0;
    for (let y = 0; y < 40; y += 1) for (let x = 0; x < 40; x += 1) {   // loin de la croix
      const d = forestDensity(x, y);
      if (d >= FOREST_FLOOR.from + FOREST_FLOOR.span) { expect(at(x, y)).toBe(1); plein += 1; }
      if (d <= FOREST_FLOOR.from) { expect(at(x, y)).toBe(0); vides += 1; }
    }
    expect(plein).toBeGreaterThan(0);
    expect(vides).toBeGreaterThan(0);
  });

  it("éteint les fleurs sous les couronnes, garde celles du pré", () => {
    const fk = forestFlowerK(L, null);
    const cut = FOREST_FLOOR.flowerCut;
    let eteintes = 0, gardees = 0;
    for (let y = 0; y < 40; y += 1) for (let x = 0; x < 40; x += 1) {
      const f = at(x, y);
      if (f >= 2 * cut) { expect(fk(x, y)).toBe(0); eteintes += 1; }
      if (f <= cut) { expect(fk(x, y)).toBe(1); gardees += 1; }
    }
    expect(eteintes).toBeGreaterThan(0);
    expect(gardees).toBeGreaterThan(0);
  });

  it("garde le multiplicateur du camp (herbe piétinée)", () => {
    const fk = forestFlowerK(L, () => 0.5);
    for (let y = 0; y < 20; y += 1) for (let x = 0; x < 20; x += 1) {
      if (at(x, y) <= FOREST_FLOOR.flowerCut) expect(fk(x, y)).toBe(0.5);
    }
  });
});
