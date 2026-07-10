import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { CM } from "../../layout.js";
import {
  worldToScreen, screenToWorld, panDeltaToScreen, depthOf, tileDiamond,
  visibleCellBounds, ISO_X, ISO_Y,
} from "../projection.js";

// La projection est LE pivot du chantier iso : legacy = identité translatée au
// bit près (flag off ⇒ zéro régression), iso = losange 2:1 inversible.

beforeEach(() => {
  CM.TILE = 32;
  CM.cw = 800; CM.ch = 600;
  CM.cam = { x: 1000, y: 2000, zoom: 1.5 };
  CM.iso = false;
});
afterEach(() => { CM.iso = false; });

describe("projection — mode legacy (CM.iso off)", () => {
  it("réplique exactement l'ancien mapping écran", () => {
    const p = worldToScreen(1100, 2050);
    expect(p.x).toBe((1100 - 1000) * 1.5 + 400);
    expect(p.y).toBe((2050 - 2000) * 1.5 + 300);
  });

  it("aller-retour exact", () => {
    const w = screenToWorld(123, 456);
    const p = worldToScreen(w.x, w.y);
    expect(p.x).toBeCloseTo(123, 6);
    expect(p.y).toBeCloseTo(456, 6);
  });

  it("depthOf = wy (tri du peintre actuel)", () => {
    expect(depthOf(50, 70)).toBe(70);
  });
});

describe("projection — mode iso (losange 2:1)", () => {
  beforeEach(() => { CM.iso = true; });

  it("une tuile devient un losange 2·TILE × TILE (64×32 à zoom 1)", () => {
    CM.cam = { x: 0, y: 0, zoom: 1 };
    const d = tileDiamond(0, 0);
    expect(d.e.x - d.w.x).toBeCloseTo(2 * 32 * ISO_X);   // largeur 64
    expect(d.s.y - d.n.y).toBeCloseTo(32 * 2 * ISO_Y);   // hauteur 32
    // Sommets alignés : N et S partagent le même x (axe vertical du losange).
    expect(d.n.x).toBeCloseTo(d.s.x);
    expect(d.w.y).toBeCloseTo(d.e.y);
  });

  it("aller-retour exact (inversible)", () => {
    for (const [sx, sy] of [[0, 0], [400, 300], [123.7, 41.2], [800, 600]]) {
      const w = screenToWorld(sx, sy);
      const p = worldToScreen(w.x, w.y);
      expect(p.x).toBeCloseTo(sx, 6);
      expect(p.y).toBeCloseTo(sy, 6);
    }
  });

  it("axes monde → diagonales écran (+x = bas-droite, +y = bas-gauche)", () => {
    const o = worldToScreen(1000, 2000);            // point caméra = centre écran
    const px = worldToScreen(1032, 2000);           // +x monde
    const py = worldToScreen(1000, 2032);           // +y monde
    expect(px.x).toBeGreaterThan(o.x); expect(px.y).toBeGreaterThan(o.y);
    expect(py.x).toBeLessThan(o.x); expect(py.y).toBeGreaterThan(o.y);
  });

  it("pan caméra = pure translation écran (les bakes restent valides)", () => {
    const a = worldToScreen(1234, 2345);
    const d = panDeltaToScreen(10, -6);
    CM.cam = { ...CM.cam, x: CM.cam.x + 10, y: CM.cam.y - 6 };
    const b = worldToScreen(1234, 2345);
    expect(a.x - b.x).toBeCloseTo(d.x, 6);
    expect(a.y - b.y).toBeCloseTo(d.y, 6);
  });

  it("depthOf = wx + wy (diagonales du peintre iso)", () => {
    expect(depthOf(50, 70)).toBe(120);
    // Une cellule plus « sud-est » est plus profonde (dessinée après).
    expect(depthOf(51, 70)).toBeGreaterThan(depthOf(50, 70));
    expect(depthOf(50, 71)).toBeGreaterThan(depthOf(50, 70));
  });

  it("visibleCellBounds couvre le viewport (chaque coin écran retombe dans les bornes)", () => {
    const b = visibleCellBounds(0);
    for (const [sx, sy] of [[0, 0], [800, 0], [0, 600], [800, 600]]) {
      const w = screenToWorld(sx, sy);
      const gx = Math.floor(w.x / 32), gy = Math.floor(w.y / 32);
      expect(gx).toBeGreaterThanOrEqual(b.gx0);
      expect(gx).toBeLessThanOrEqual(b.gx1);
      expect(gy).toBeGreaterThanOrEqual(b.gy0);
      expect(gy).toBeLessThanOrEqual(b.gy1);
    }
  });
});
