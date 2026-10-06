// LA GRILLE DU SQUARE NE S'ENJAMBE PAS (audit 2026-10-05, BUG-62 ; choix (b) de Raph).
// Maintenant que la grille se pose (une porte au milieu de chaque côté, la grille
// partout ailleurs), les passants de la ville entrent et sortent par ses portes :
// fenceWalkBlock rend les pas interdits, roadStepAllowed les refuse.
import { describe, it, expect, beforeEach } from "vitest";
import { CM, ROAD_E, ROAD_N, ROAD_S, ROAD_W } from "../layout.js";
import { roadStepAllowed, cityMapWalkRoadKey } from "../agents.js";
import { fenceWalkBlock } from "../iso/isoFence.js";
import { FENCE } from "../fenceEdges.js";

const MASK = ROAD_E | ROAD_W | ROAD_S | ROAD_N;
// Un square 4×4 (3..6) ceint d'une rue (2..7), comme un îlot-place.
function square(kind = "jardin") {
  const roadMap = new Map();
  for (let y = 2; y <= 7; y += 1) for (let x = 2; x <= 7; x += 1) {
    const inner = x >= 3 && x <= 6 && y >= 3 && y <= 6;
    roadMap.set(x + "," + y, { gx: x, gy: y, mask: MASK, rank: inner ? "plaza" : "secondary", roadSurface: "road" });
  }
  const L = { counts: { eraBand: 3 }, roadMap, plan: { plazas: [{ gx: 5, gy: 5, size: 4, kind }] } };
  CM.layout = L;
  CM.layoutRecomputeAt = (CM.layoutRecomputeAt | 0) + 1;
  CM.walkRoadSet = new Set([...roadMap.values()].map((r) => cityMapWalkRoadKey(r.gx, r.gy)));
  CM.wonderWalkSet = null; CM.hearthWalkSet = null;
  return L;
}
const S = 2, N = 3, E = 0, W = 1;   // ordre de CM_DIRS

beforeEach(() => { CM.fenceWalkBlock = null; });

describe("la grille du square et les passants", () => {
  it("on entre par les portes, jamais à travers la grille", () => {
    const L = square();
    CM.fenceWalkBlock = fenceWalkBlock(L, 3);
    // Par le milieu du côté nord (porte) : oui. Par l'angle (grille) : non, dans les deux sens.
    expect(roadStepAllowed(4, 2, S)).toBe(true);
    expect(roadStepAllowed(5, 2, S)).toBe(true);
    expect(roadStepAllowed(3, 2, S)).toBe(false);
    expect(roadStepAllowed(3, 3, N)).toBe(false);
    expect(roadStepAllowed(7, 6, W)).toBe(false);
    expect(roadStepAllowed(6, 5, E)).toBe(true);
    // Dans le square, on circule librement.
    expect(roadStepAllowed(3, 3, E)).toBe(true);
    // 16 arêtes de pourtour, 8 portes : 8 arêtes de grille, deux sens chacune.
    expect(CM.fenceWalkBlock.size).toBe(16);
  });

  it("une place ouverte (forum, marché, parvis) ou une grille éteinte ne bloque rien", () => {
    expect(fenceWalkBlock(square("marche"), 3).size).toBe(0);
    const L = square();
    const was = FENCE.gateMid;
    FENCE.gateMid = false;
    try { expect(fenceWalkBlock(L, 3).size).toBe(0); } finally { FENCE.gateMid = was; }
  });
});
