// Masque losange de la face des tuiles de sol iso (isoTileFace / blitIsoTileKey).
// Régression 2026-07-22 (« on voit encore les bordures de sol ») : les tuiles
// PixelLab sont des DALLES EN VOLUME. Leurs faces latérales pendent sous les
// arêtes SO et SE, donc À L'INTÉRIEUR du rectangle de face (bb.w × bb.w/2) —
// le recadrage rectangulaire ne pouvait pas les enlever, et elles se reposaient
// sur chaque cellule voisine → quadrillage sur tout le sol.
import { describe, it, expect } from "vitest";
import { isoFaceKeeps } from "../iso/isoRenderer.js";

const FW = 64, FH = 32;   // géométrie réelle de ground-flagstone / iso-grass

describe("masque losange de la face de sol iso", () => {
  it("garde le centre et les milieux d'arête", () => {
    expect(isoFaceKeeps(32, 16, FW, FH)).toBe(true);   // centre
    expect(isoFaceKeeps(32, 0, FW, FH)).toBe(true);    // pointe nord
    expect(isoFaceKeeps(32, FH - 1, FW, FH)).toBe(true); // pointe sud
    expect(isoFaceKeeps(0, 16, FW, FH)).toBe(true);    // pointe ouest
    expect(isoFaceKeeps(FW - 1, 16, FW, FH)).toBe(true); // pointe est
  });

  it("coupe les 4 coins du rectangle — c'est là que vivent les faces latérales", () => {
    // Coins BAS : l'épaisseur de la dalle (liseré clair au SO, sombre au SE).
    expect(isoFaceKeeps(2, FH - 2, FW, FH)).toBe(false);
    expect(isoFaceKeeps(FW - 3, FH - 2, FW, FH)).toBe(false);
    // Coins HAUT : hors losange aussi (vide transparent de la tuile).
    expect(isoFaceKeeps(2, 1, FW, FH)).toBe(false);
    expect(isoFaceKeeps(FW - 3, 1, FW, FH)).toBe(false);
  });

  it("garde ~la moitié du rectangle (aire d'un losange) et reste symétrique", () => {
    let kept = 0;
    for (let y = 0; y < FH; y += 1) {
      for (let x = 0; x < FW; x += 1) {
        if (isoFaceKeeps(x, y, FW, FH)) kept += 1;
        // symétrie gauche/droite : deux cellules voisines miroir raccordent pareil
        expect(isoFaceKeeps(x, y, FW, FH)).toBe(isoFaceKeeps(FW - 1 - x, y, FW, FH));
      }
    }
    const ratio = kept / (FW * FH);
    expect(ratio).toBeGreaterThan(0.5);    // tolérance de recouvrement incluse
    expect(ratio).toBeLessThan(0.58);      // mais on ne réintroduit pas les tranches
  });

  it("la tolérance de recouvrement reste sous la hauteur des faces latérales", () => {
    // Les tranches font ~6 à 8 px de haut ; à 2 px sous l'arête SO on doit couper,
    // sinon le liseré de la dalle revient sur la cellule voisine.
    expect(isoFaceKeeps(8, FH - 3, FW, FH)).toBe(false);
    expect(isoFaceKeeps(FW - 9, FH - 3, FW, FH)).toBe(false);
  });
});
