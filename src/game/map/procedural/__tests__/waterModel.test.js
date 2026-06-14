import { describe, it, expect } from "vitest";

import { createWaterModel, WATER, BANK, NEAR, DRY } from "../waterModel.js";

// Fixture minuscule : une cellule d'eau en (5,5), sa berge en (5,6),
// une cellule « proche » sèche en (5,8), tout le reste = sec.
function fixture() {
  return createWaterModel({
    cells: new Set(["5,5"]),
    banks: new Set(["5,6"]),
    near: new Set(["5,8"]),
    samples: [{ x: 5, y: 5, hw: 1.5 }],
    bridge: { x: 5, y: 5 },
    riverYAt: () => 5
  });
}

describe("waterModel — prédicats de relation à l'eau", () => {
  it("classe chaque cellule selon sa relation à l'eau", () => {
    const w = fixture();
    expect(w.isWater(5, 5)).toBe(true);
    expect(w.isBank(5, 6)).toBe(true);
    expect(w.isNear(5, 8)).toBe(true);
    expect(w.isDry(5, 5)).toBe(false); // l'eau n'est pas sèche
    expect(w.isDry(5, 6)).toBe(false); // la berge non plus
    expect(w.isDry(5, 8)).toBe(true);  // « proche » reste du sol sec
    expect(w.isDry(0, 0)).toBe(true);
  });

  it("relationAt renvoie la relation la plus humide applicable", () => {
    const w = fixture();
    expect(w.relationAt(5, 5)).toBe(WATER);
    expect(w.relationAt(5, 6)).toBe(BANK);
    expect(w.relationAt(5, 8)).toBe(NEAR);
    expect(w.relationAt(9, 9)).toBe(DRY);
  });

  it("footprintRelation : la cellule la plus humide de l'emprise l'emporte", () => {
    const w = fixture();
    // Emprise 2×2 ancrée en (4,4) → couvre l'eau (5,5) : « sur l'eau ».
    expect(w.footprintRelation(4, 4, 2, 2)).toBe(WATER);
    // Emprise 1×2 en (5,6) → berge mais pas d'eau.
    expect(w.footprintRelation(5, 6, 1, 2)).toBe(BANK);
    // Emprise 1×1 sur la cellule « proche ».
    expect(w.footprintRelation(5, 8, 1)).toBe(NEAR);
    // Emprise loin de tout.
    expect(w.footprintRelation(0, 0, 2)).toBe(DRY);
  });

  it("conserve le contrat river historique (rétro-compatibilité)", () => {
    const w = fixture();
    expect(w.present).toBe(true);
    expect(w.cells.has("5,5")).toBe(true);   // ancien river.cells
    expect(w.banks.has("5,6")).toBe(true);   // ancien river.banks
    expect(Array.isArray(w.samples)).toBe(true);
    expect(w.bridge).toEqual({ x: 5, y: 5 });
    expect(w.riverYAt(5)).toBe(5);
  });

  it("dégrade proprement sans données (sets vides)", () => {
    const w = createWaterModel();
    expect(w.isWater(0, 0)).toBe(false);
    expect(w.isDry(0, 0)).toBe(true);
    expect(w.relationAt(0, 0)).toBe(DRY);
    expect(w.footprintRelation(0, 0, 3)).toBe(DRY);
    expect(w.riverYAt(0)).toBe(-999);
    expect(w.samples).toEqual([]);
  });
});
