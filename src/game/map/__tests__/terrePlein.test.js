import { describe, it, expect } from "vitest";

import { ROAD_N, ROAD_E, ROAD_S, ROAD_W, computeTerrePleinSegments } from "../layout.js";

// Terre-plein des boulevards : deux voies EXACTEMENT collées (2 de large) → un
// segment sur la couture, en runs continus (≥3), interrompu aux intersections
// (le couloir y devient « plus large que 2 »), jamais sur pont ni place.

const V = ROAD_N | ROAD_S;
const H = ROAD_E | ROAD_W;

function makeRoadMap(cells) {
  const roadMap = new Map();
  for (const c of cells) {
    roadMap.set(c.gx + "," + c.gy, {
      gx: c.gx, gy: c.gy, mask: c.mask,
      rank: c.rank || "secondary",
      roadSurface: c.surface || "road",
    });
  }
  return roadMap;
}

function lanes(gxs, gys, extra = {}) {
  const out = [];
  for (const gx of gxs) for (const gy of gys) out.push({ gx, gy, mask: V, ...extra });
  return out;
}

describe("computeTerrePleinSegments — couture des voies collées", () => {
  it("deux colonnes collées (run ≥3) → un segment vertical sur la couture", () => {
    const rm = makeRoadMap(lanes([5, 6], [2, 3, 4, 5, 6, 7, 8]));
    const segs = computeTerrePleinSegments(rm, 20);
    expect(segs).toEqual([{ axis: "v", x: 5, y0: 2, y1: 8 }]);
  });

  it("trois colonnes collées (couloir large) → aucun terre-plein", () => {
    const rm = makeRoadMap(lanes([5, 6, 7], [2, 3, 4, 5, 6]));
    expect(computeTerrePleinSegments(rm, 20)).toEqual([]);
  });

  it("run trop court (<3) → rien (pas de miettes)", () => {
    const rm = makeRoadMap(lanes([5, 6], [2, 3]));
    expect(computeTerrePleinSegments(rm, 20)).toEqual([]);
  });

  it("une intersection coupe le ruban en deux runs propres", () => {
    // Boulevard vertical x=5|6 (y 2..8) traversé par une rue horizontale en y=5.
    const cells = lanes([5, 6], [2, 3, 4, 5, 6, 7, 8]);
    for (const gx of [3, 4, 7, 8]) cells.push({ gx, gy: 5, mask: H });
    const segs = computeTerrePleinSegments(makeRoadMap(cells), 20);
    expect(segs).toEqual([
      { axis: "v", x: 5, y0: 2, y1: 4 },
      { axis: "v", x: 5, y0: 6, y1: 8 },
    ]);
  });

  it("deux rangées collées → segment horizontal ; ponts et places exclus", () => {
    const rows = [];
    for (const gx of [2, 3, 4, 5, 6]) for (const gy of [5, 6]) rows.push({ gx, gy, mask: H });
    const segs = computeTerrePleinSegments(makeRoadMap(rows), 20);
    expect(segs).toEqual([{ axis: "h", y: 5, x0: 2, x1: 6 }]);

    // Les mêmes rangées en PONT (ou en place) ne produisent rien.
    const bridge = rows.map((c) => ({ ...c, surface: "bridge" }));
    expect(computeTerrePleinSegments(makeRoadMap(bridge), 20)).toEqual([]);
    const plaza = rows.map((c) => ({ ...c, rank: "plaza" }));
    expect(computeTerrePleinSegments(makeRoadMap(plaza), 20)).toEqual([]);
  });
});
