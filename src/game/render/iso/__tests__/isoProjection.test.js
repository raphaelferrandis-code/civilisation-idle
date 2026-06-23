import { describe, it, expect } from "vitest";

import { TILE_W, TILE_H, gridToScreen, screenToGrid } from "../isoProjection.js";

describe("isoProjection — grille ↔ écran", () => {
  it("place l'origine (0,0) au centre local (0,0)", () => {
    expect(gridToScreen(0, 0)).toEqual({ x: 0, y: 0 });
  });

  it("respecte la géométrie iso 2:1 sur les axes", () => {
    // +1 colonne : à droite et en bas d'un demi-tuile.
    expect(gridToScreen(1, 0)).toEqual({ x: TILE_W / 2, y: TILE_H / 2 });
    // +1 ligne : à gauche et en bas d'un demi-tuile.
    expect(gridToScreen(0, 1)).toEqual({ x: -TILE_W / 2, y: TILE_H / 2 });
    // diagonale (1,1) : pile sous l'origine.
    expect(gridToScreen(1, 1)).toEqual({ x: 0, y: TILE_H });
  });

  it("screenToGrid est l'inverse exact de gridToScreen", () => {
    for (const [c, r] of [[0, 0], [3, 7], [12, 5], [15, 15], [9, 0]]) {
      const s = gridToScreen(c, r);
      const g = screenToGrid(s.x, s.y);
      expect(g.col).toBeCloseTo(c, 10);
      expect(g.row).toBeCloseTo(r, 10);
    }
  });
});
