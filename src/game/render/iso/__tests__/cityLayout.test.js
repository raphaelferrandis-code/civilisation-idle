import { describe, it, expect } from "vitest";

import { spiralCells, computeCityPlacements } from "../cityLayout.js";

describe("cityLayout — spirale de cases", () => {
  it("commence au centre et couvre toute la grille", () => {
    const cells = spiralCells(3);
    expect(cells).toHaveLength(9);
    expect(cells[0]).toEqual({ col: 1, row: 1 }); // centre d'abord
  });

  it("ordonne par anneaux croissants depuis le centre", () => {
    const c = 10; // centre d'une grille 20×20
    const cells = spiralCells(20);
    const ring = (p) => Math.max(Math.abs(p.col - c), Math.abs(p.row - c));
    for (let i = 1; i < cells.length; i += 1) {
      expect(ring(cells[i])).toBeGreaterThanOrEqual(ring(cells[i - 1]));
    }
  });
});

describe("cityLayout — placement des bâtiments", () => {
  const model = (over) => ({
    buildings: [
      { id: "foragers", kind: "food", count: 3 },
      { id: "markets", kind: "market", count: 1 },
      ...(over || [])
    ]
  });

  it("pose une tuile par unité (bornée par perTypeCap)", () => {
    const p = computeCityPlacements(model());
    expect(p.filter((t) => t.id === "foragers")).toHaveLength(3);
    expect(p.filter((t) => t.id === "markets")).toHaveLength(1);
  });

  it("borne le nombre de tuiles par type", () => {
    const p = computeCityPlacements({ buildings: [{ id: "foragers", kind: "food", count: 999 }] }, { perTypeCap: 8 });
    expect(p).toHaveLength(8);
  });

  it("est trié en ordre peintre (col+row non décroissant)", () => {
    const p = computeCityPlacements(model());
    for (let i = 1; i < p.length; i += 1) {
      expect(p[i].col + p[i].row).toBeGreaterThanOrEqual(p[i - 1].col + p[i - 1].row);
    }
  });

  it("est STABLE : acheter un type ne déplace pas les cases d'un autre", () => {
    const few = computeCityPlacements(model());
    const many = computeCityPlacements({
      buildings: [
        { id: "foragers", kind: "food", count: 3 },
        { id: "markets", kind: "market", count: 5 } // markets : 1 → 5
      ]
    });
    const foragersFew = few.filter((t) => t.id === "foragers");
    const foragersMany = many.filter((t) => t.id === "foragers");
    expect(foragersMany).toEqual(foragersFew);
  });

  it("place toutes les cases dans la grille", () => {
    const p = computeCityPlacements(model(), { gridN: 20 });
    for (const t of p) {
      expect(t.col).toBeGreaterThanOrEqual(0);
      expect(t.col).toBeLessThan(20);
      expect(t.row).toBeGreaterThanOrEqual(0);
      expect(t.row).toBeLessThan(20);
    }
  });
});
