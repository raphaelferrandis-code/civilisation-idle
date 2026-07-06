import { describe, it, expect } from "vitest";

import { createBuildingPlacer } from "../buildingGenerator.js";

// Scénario synthétique : grille N×N, une rue horizontale, des cellules
// constructibles partout ailleurs. On vérifie le filtre « lot » de PR2.
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
  // Beaucoup de demande : sans filtre, les maisons débordent loin de la rue ;
  // avec filtre, elles remplissent l'intérieur des blocs dans le rayon borné.
  placer.placeCategory("house", 200, new Set(), (t) => tiles.push(t));
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
