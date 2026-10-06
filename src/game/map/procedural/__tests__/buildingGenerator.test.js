import { describe, it, expect } from "vitest";

import { createBuildingPlacer, placeCategorySlotted } from "../buildingGenerator.js";

// Scénario synthétique : grille N×N, une rue horizontale, des cellules
// constructibles partout ailleurs. On vérifie le filtre « lot » de PR2.
// (Audit du 2026-10-05, MORT-4 : le placement positionnel `placeCategory` est parti ;
// la pose passe par placeCategorySlotted, le filtre par le `cellFree` de l'appelant —
// le même que decCellFree dans layout.js.)
function scenario({ requireRoad }) {
  const N = 20;
  const core = { x: 10, y: 10 };
  const roadKey = new Set();
  for (let x = 2; x <= 17; x += 1) roadKey.add(x + ",10"); // grand-rue E-O en y=10
  const cells = [];
  for (let gx = 0; gx < N; gx += 1) for (let gy = 0; gy < N; gy += 1) {
    if (roadKey.has(gx + "," + gy)) continue;
    cells.push({ gx, gy, d2: (gx - core.x) ** 2 + (gy - core.y) ** 2 });
  }
  const plan = {
    core, order: 1, chaos: 0,
    anchors: [{ label: "habitat-0-0", kind: "habitat", gx: 10, gy: 8, r: 4, band: 0, strength: 1.2 }],
    plazas: []
  };
  const placer = createBuildingPlacer({
    cells, plan, roadKey,
    counts: { eraBand: 2 },
    personality: { variantBias: null, buildingBias: {} },
    seed: 4242, nearSet: new Set(), N, requireRoad
  });
  const tiles = [];
  const used = new Set();
  const cellFree = (gx, gy, sx = 1, sy = sx) => {
    if (gx < 0 || gy < 0 || gx + sx > N || gy + sy > N) return false;
    for (let ax = 0; ax < sx; ax += 1) for (let ay = 0; ay < sy; ay += 1) {
      const k = (gx + ax) + "," + (gy + ay);
      if (used.has(k) || roadKey.has(k)) return false;
    }
    return !placer.requireRoad || placer.nearRoad(gx, gy);
  };
  // Beaucoup de demande : sans filtre, les maisons débordent loin de la rue ;
  // avec filtre, elles remplissent l'intérieur des blocs dans le rayon borné.
  placeCategorySlotted("house", 200, {
    ordered: placer.orderedList("house"), store: {}, live: new Set(),
    cx: core.x, cy: core.y, N, cycle: 0, eraBand: 2, cellFree,
    chooseVariant: placer.chooseVariant, quarterKindAt: placer.quarterKindAt, quarterIdAt: placer.quarterIdAt,
    smallVariant: placer.smallVariant,
    pushTile: (t) => {
      tiles.push(t);
      for (let ax = 0; ax < (t.spanX || 1); ax += 1) for (let ay = 0; ay < (t.spanY || 1); ay += 1) used.add((t.gx + ax) + "," + (t.gy + ay));
    },
    clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)),
  });
  return { tiles, roadKey };
}

// Une route à distance Chebyshev <= R (doit rester aligné sur HOUSE_ROAD_RADIUS
// du générateur : les maisons remplissent l'intérieur des blocs mais restent
// bornées à R cellules d'une voie — pas d'orphelin au milieu de nulle part).
const ROAD_RADIUS = 4;
function nearRoad(roadKey, gx, gy, R = ROAD_RADIUS) {
  for (let dx = -R; dx <= R; dx += 1) for (let dy = -R; dy <= R; dy += 1) {
    if (dx === 0 && dy === 0) continue;
    if (roadKey.has((gx + dx) + "," + (gy + dy))) return true;
  }
  return false;
}

// Scénario à bande paramétrée (ex-harnais de la Tour-monde, RETIRÉE 2026-08-03
// — Raph : « le rendu n'est pas pertinent »). Sert aux contrats cosmiques :
// îlots uniformes (BLOCK_Q) et absence de variant fantôme.
function scenarioBand(eraBand, seed = 4242) {
  const N = 40;
  const core = { x: 20, y: 20 };
  const roadKey = new Set();
  for (let x = 2; x <= 37; x += 1) roadKey.add(x + ",20");
  const cells = [];
  for (let gx = 0; gx < N; gx += 1) for (let gy = 0; gy < N; gy += 1) {
    if (roadKey.has(gx + "," + gy)) continue;
    cells.push({ gx, gy, d2: (gx - core.x) ** 2 + (gy - core.y) ** 2 });
  }
  const plan = { core, order: 1, chaos: 0, anchors: [], plazas: [] };
  const placer = createBuildingPlacer({
    cells, plan, roadKey,
    counts: { eraBand },
    personality: { variantBias: null, buildingBias: {} },
    seed, nearSet: new Set(), N, requireRoad: false
  });
  // Le TIRAGE seul (chooseVariant, celui de la pose), cellule par cellule dans l'ordre
  // de pose — ce que faisait l'ancien placement positionnel, sans filtre de rue.
  return placer.orderedList("house").slice(0, 400)
    .map((cell, i) => ({ gx: cell.gx, gy: cell.gy, variant: placer.chooseVariant("house", i, cell) }));
}

describe("buildingGenerator — tirage cosmique", () => {
  it("la Tour-monde retirée ne réapparaît jamais", () => {
    for (const band of [0, 6, 7, 8, 9]) {
      expect(scenarioBand(band).filter((t) => t.variant === "supertower")).toHaveLength(0);
    }
  });

  it("îlots uniformes aux bandes 7+ : un pâté de 3×3 porte UN seul variant", () => {
    const tiles = scenarioBand(8);
    const byBlock = new Map();
    for (const t of tiles) {
      const k = Math.floor(t.gx / 3) + ":" + Math.floor(t.gy / 3);
      if (!byBlock.has(k)) byBlock.set(k, new Set());
      byBlock.get(k).add(t.variant);
    }
    for (const [k, set] of byBlock) expect(set.size, `pâté ${k}`).toBe(1);
  });

  it("avant la bande 7 : tirage historique, les pâtés restent mélangés", () => {
    const tiles = scenarioBand(5);
    const byBlock = new Map();
    for (const t of tiles) {
      const k = Math.floor(t.gx / 3) + ":" + Math.floor(t.gy / 3);
      if (!byBlock.has(k)) byBlock.set(k, new Set());
      byBlock.get(k).add(t.variant);
    }
    const mixed = [...byBlock.values()].filter((s) => s.size > 1).length;
    expect(mixed).toBeGreaterThan(0);
  });
});

describe("buildingGenerator — placement par lots (PR2)", () => {
  it("requireRoad : tout bâtiment posé reste proche d'une rue (rayon borné)", () => {
    const { tiles, roadKey } = scenario({ requireRoad: true });
    expect(tiles.length).toBeGreaterThan(0);
    for (const t of tiles) {
      expect(nearRoad(roadKey, t.gx, t.gy), `${t.gx},${t.gy} trop loin de toute rue`).toBe(true);
    }
  });

  it("sans requireRoad : des bâtiments atterrissent loin de toute rue (état v1)", () => {
    const { tiles, roadKey } = scenario({ requireRoad: false });
    const orphans = tiles.filter((t) => !nearRoad(roadKey, t.gx, t.gy));
    // Le filtre change réellement quelque chose : sans lui, des orphelins au-delà du rayon.
    expect(orphans.length).toBeGreaterThan(0);
  });
});
