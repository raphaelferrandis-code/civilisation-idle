// Masque losange de la face de sol (isoFaceKeeps).
// Le SOUS-PAVAGE (groundTileTune.rep / isoSubTileRect / isoFaceInset) que ce
// fichier gardait a été retiré le 2026-10-06 (audit MORT-14) : depuis la
// regénération des tuiles du 2026-07-28, toutes les tuiles en service sont plates
// (64×32) ou à débord (herbe), et le court-circuitaient. Reste la géométrie qui,
// elle, sert toujours : le masque qui découpe la face au losange de cellule.
import { describe, it, expect } from "vitest";
import { isoFaceKeeps, groundTileTune } from "../iso/isoGroundTiles.js";

const FW = 64, FH = 32;   // géométrie réelle de ground-cobble / iso-grass / iso-plaza

// Losange inscrit dans un rectangle, en coordonnées CONTINUES (0 = sur l'arête).
// Négatif = dedans, positif = dehors.
const dist = (px, py, r) =>
  Math.abs(px - (r.x + r.w / 2)) / (r.w / 2) + Math.abs(py - (r.y + r.h / 2)) / (r.h / 2) - 1;

describe("masque losange de la face de sol iso", () => {
  it("à tolérance nulle, c'est exactement le losange de cellule", () => {
    const cell = { x: 0, y: 0, w: FW, h: FH };
    for (let y = 0; y < FH; y += 1) {
      for (let x = 0; x < FW; x += 1) {
        expect(isoFaceKeeps(x, y, FW, FH, 0)).toBe(dist(x + 0.5, y + 0.5, cell) <= 0);
      }
    }
  });

  it("le sous-pavage est retiré : la molette ne garde que le blit exact", () => {
    expect(Object.keys(groundTileTune)).toEqual(["exact"]);
  });
});
