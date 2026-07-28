import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { CM, CM_WONDERS, cmWonderExtent, cmWonderHeightTiles } from "../../layout.js";
import {
  worldToScreen, screenToWorld, panDeltaToScreen, depthOf, tileDiamond,
  visibleCellBounds, wonderAnchor, wonderFootWorld, ISO_X, ISO_Y,
} from "../projection.js";

// La projection est LE pivot du chantier iso : legacy = identité translatée au
// bit près (flag off ⇒ zéro régression), iso = losange 2:1 inversible.

beforeEach(() => {
  CM.TILE = 32;
  CM.cw = 800; CM.ch = 600;
  CM.cam = { x: 1000, y: 2000, zoom: 1.5 };
  CM.iso = false;
});
afterEach(() => { CM.iso = false; CM.layout = null; });

// Slot de merveille ÉPINGLÉ : cmWonderSlot rend tel quel un slot mémorisé dont
// la signature (gridN, cx, cy) correspond — la géométrie du plan ne joue donc
// aucun rôle dans ce qui suit.
const WSLOT = { gridN: 40, cx: 20, cy: 20 };
function pinWonderSlot(gx, gy) {
  CM.layout = { wonderSlots: [{ gx, gy, ...WSLOT }] };
}
// L'ancienne projection PLANAIRE, écrite à la main dans cityMapHitTest.
function legacyPlanarAnchor(gx, gy) {
  return {
    x: (gx * CM.TILE + CM.TILE / 2 - CM.cam.x) * CM.cam.zoom + CM.cw / 2,
    y: (gy * CM.TILE + CM.TILE - CM.cam.y) * CM.cam.zoom + CM.ch / 2,
  };
}

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

  it("wonderAnchor reproduit l'ancienne projection planaire au bit près", () => {
    pinWonderSlot(26, 14);
    const a = wonderAnchor(0, WSLOT.gridN, WSLOT.cx, WSLOT.cy);
    const legacy = legacyPlanarAnchor(26, 14);
    expect(a.x).toBe(legacy.x);
    expect(a.y).toBe(legacy.y);
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

  it("wonderAnchor N'EST PAS la projection planaire (le hit-test visait à côté)", () => {
    // Le survol des merveilles gardait une projection planaire écrite à la main
    // alors que le rendu passait par worldToScreen : en iso les deux divergent,
    // donc la zone survolable ne tombait plus sur le monument dessiné. Ce test
    // échoue si quelqu'un re-projette à la main (règle d'or du chantier iso).
    pinWonderSlot(26, 14);
    const a = wonderAnchor(0, WSLOT.gridN, WSLOT.cx, WSLOT.cy);
    const legacy = legacyPlanarAnchor(26, 14);
    expect(Math.hypot(a.x - legacy.x, a.y - legacy.y)).toBeGreaterThan(CM.TILE);
  });

  it("wonderAnchor descend d'une DEMI-HAUTEUR de sprite (boîte centrée sur le parvis)", () => {
    // Un sprite front-view est un panneau DEBOUT : posé au centre de son parvis,
    // sa masse monte tout entière au nord et le monument occupe la moitié de sa
    // place, l'autre vide devant lui. On descend la base d'une demi-hauteur pour
    // que la BOÎTE du sprite soit à cheval sur le centre.
    pinWonderSlot(26, 14);
    const k = cmWonderHeightTiles(CM_WONDERS[0].id, 1) / 2;
    const a = wonderAnchor(0, WSLOT.gridN, WSLOT.cx, WSLOT.cy);
    const expected = worldToScreen((26 + 0.5 + k) * 32, (14 + 0.5 + k) * 32);
    expect(a.x).toBeCloseTo(expected.x, 9);
    expect(a.y).toBeCloseTo(expected.y, 9);
    // Sur l'axe VERTICAL de son losange : le décalage s'annule en (u−v), donc
    // plus de biais vers la gauche que portait le centre-bas de la tuile.
    expect(a.x).toBeCloseTo(worldToScreen((26 + 0.5) * 32, (14 + 0.5) * 32).x, 9);
    // …et la descente vaut bien une demi-hauteur de sprite en px écran.
    const c = worldToScreen((26 + 0.5) * 32, (14 + 0.5) * 32);
    expect(a.y - c.y).toBeCloseTo(k * 32 * CM.cam.zoom, 6);
  });

  it("la base ne sort jamais du parvis (garde-fou sur k)", () => {
    // Un sprite très haut sur une petite emprise poserait le monument hors de sa
    // place. k est borné à R−½ ; le test épingle la borne, pas un rang précis.
    pinWonderSlot(26, 14);
    for (let idx = 0; idx < CM_WONDERS.length; idx += 1) {
      const w = CM_WONDERS[idx];
      if (w.id === "era_mega") continue;
      CM.layout = { wonderSlots: Array.from({ length: idx + 1 }, () => ({ gx: 26, gy: 14, ...WSLOT })), wonderTiers: { [w.id]: 5 } };
      const f = wonderFootWorld(idx, WSLOT.gridN, WSLOT.cx, WSLOT.cy);
      const k = f.x / 32 - 26 - 0.5;
      expect(k, w.id).toBeLessThanOrEqual(cmWonderExtent(w.id, 5).halfW);
      expect(k, w.id).toBeGreaterThan(0);
    }
  });

  it("era_mega garde l'ancre centre-bas (plantée dans le fleuve, pas de socle au sol)", () => {
    // La glisser vers le sud la ferait dériver le long de l'eau et vers la
    // travée du pont, pour corriger un cadrage qui ne se pose pas : l'Aiguille
    // n'a ni parvis ni emprise autour d'elle (cf. wonderGround).
    const mi = CM_WONDERS.findIndex((w) => w.id === "era_mega");
    CM.layout = { wonderSlots: Array.from({ length: mi + 1 }, () => ({ gx: 26, gy: 14, ...WSLOT })) };
    const a = wonderAnchor(mi, WSLOT.gridN, WSLOT.cx, WSLOT.cy);
    const expected = worldToScreen(26 * 32 + 16, 14 * 32 + 32);
    expect(a.x).toBeCloseTo(expected.x, 9);
    expect(a.y).toBeCloseTo(expected.y, 9);
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
