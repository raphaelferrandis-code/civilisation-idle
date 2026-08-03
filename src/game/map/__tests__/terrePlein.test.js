import { describe, it, expect } from "vitest";

import { ROAD_N, ROAD_E, ROAD_S, ROAD_W, computeTerrePleinSegments } from "../layout.js";

// Terre-plein des boulevards : deux voies de rang MAIN exactement collées
// (2 de large — le seul rang tracé en double par runLineWide) → un segment sur
// la couture, en runs continus (≥3), interrompu aux intersections (le couloir
// y devient « plus large que 2 »), jamais sur pont ni place, et JAMAIS sur deux
// dessertes collées par accident (le refuge est le mobilier des grands axes).

const V = ROAD_N | ROAD_S;
const H = ROAD_E | ROAD_W;

function makeRoadMap(cells) {
  const roadMap = new Map();
  for (const c of cells) {
    roadMap.set(c.gx + "," + c.gy, {
      gx: c.gx, gy: c.gy, mask: c.mask,
      rank: c.rank || "main",           // les fixtures sont des boulevards sauf mention
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

  it("deux dessertes SECONDARY collées par accident → rien (réservé au rang main)", () => {
    const rm = makeRoadMap(lanes([5, 6], [2, 3, 4, 5, 6, 7, 8], { rank: "secondary" }));
    expect(computeTerrePleinSegments(rm, 20)).toEqual([]);
    // Une seule des deux voies en main ne suffit pas non plus.
    const mixed = [...lanes([5], [2, 3, 4, 5, 6], { rank: "main" }), ...lanes([6], [2, 3, 4, 5, 6], { rank: "secondary" })];
    expect(computeTerrePleinSegments(makeRoadMap(mixed), 20)).toEqual([]);
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

  it("couloir qui se décale d'une colonne → priorité au long, le voisin est tronqué", () => {
    // Boulevard 5|6 (y 2..8) qui se décale en 6|7 (y 9..12) : deux coutures
    // ADJACENTES aboutées en diagonale — à l'écran leurs caps se chevauchaient
    // (« pourquoi deux qui se superposent plutôt qu'un long ? »). Le plus long
    // garde sa place ; le court est tronqué d'une cellule de respiration.
    const cells = [...lanes([5, 6], [2, 3, 4, 5, 6, 7, 8]), ...lanes([6, 7], [9, 10, 11, 12])];
    const segs = computeTerrePleinSegments(makeRoadMap(cells), 20);
    expect(segs).toEqual([
      { axis: "v", x: 5, y0: 2, y1: 8 },
      { axis: "v", x: 6, y0: 10, y1: 12 },
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
