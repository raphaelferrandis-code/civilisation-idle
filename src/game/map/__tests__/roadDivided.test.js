import { describe, it, expect } from "vitest";

import { CM, ROAD_N, ROAD_E, ROAD_S, ROAD_W } from "../layout.js";
import { cityMapDrawRoad, cityMapDrawRoadMarkings } from "../renderWorld.js";
import { vehicleLaneOffset } from "../agents.js";

// Palier 1 — marquages des grands axes peints en CONTINU par segments.
//   cityMapDrawRoad ne pose plus AUCUN marquage de grand axe (corps seul) ; tout
//   passe par cityMapDrawRoadMarkings, qui extrait les segments droits (cache par
//   layout), peint terre-plein + bandes pointillées en une polyligne, et brise aux
//   vrais croisements de grands axes. On pilote ces fonctions avec un faux ctx et
//   on vérifie le gating + la mise en segments (logique, pas de pixels).

function makeCtx() {
  const ctx = {
    fillStyle: "#000", strokeStyle: "#000", lineWidth: 1, lineCap: "butt",
    lineJoin: "miter", globalAlpha: 1, globalCompositeOperation: "source-over",
    _fills: 0, _dashed: false,
  };
  for (const m of [
    "beginPath", "moveTo", "lineTo", "arc", "ellipse", "closePath", "fill",
    "stroke", "save", "restore", "translate", "rotate", "scale", "rect",
  ]) ctx[m] = () => {};
  ctx.fillRect = () => { ctx._fills += 1; };               // terre-plein central
  ctx.setLineDash = (a) => { if (a && a.length) ctx._dashed = true; }; // bandes pointillées
  return ctx;
}

const STRAIGHT_H = ROAD_E | ROAD_W;

// Construit un faux layout à partir d'une liste de cellules de route.
let recomputeSeq = 1;
function setupLayout(cells, { ei = 14, lod = false, ruined = false, collapse = false } = {}) {
  const ctx = makeCtx();
  const roadMap = new Map();
  const roadSet = new Set();
  for (const c of cells) {
    const key = c.gx + "," + c.gy;
    roadMap.set(key, { gx: c.gx, gy: c.gy, mask: c.mask, rank: c.rank, roadSurface: c.surface || "road" });
    roadSet.add(key);
  }
  CM.TILE = 32;
  CM.cam = { x: 0, y: 0, zoom: 1 };
  CM.cw = 1600; CM.ch = 1600;
  CM.lodActive = lod;
  CM.frameRuined = ruined;
  CM.collapseAt = collapse ? 1 : 0;
  CM.frameEraIndex = ei;
  CM.debugRoads = false;
  CM.ctx = ctx;
  CM.roadRuns = null;
  CM.layoutRecomputeAt = recomputeSeq++;     // force une reconstruction du cache
  CM.layout = { cx: 100, cy: 100, roadMap, roadSet, river: { isWater: () => false } };
  return ctx;
}

describe("cityMapDrawRoad — corps seul sur les grands axes (Palier 1)", () => {
  it("un boulevard ne peint plus de marquage par cellule (délégué à la passe continue)", () => {
    const ctx = setupLayout([{ gx: 5, gy: 5, mask: STRAIGHT_H, rank: "main" }], { ei: 14 });
    let threw = false;
    try { cityMapDrawRoad({ gx: 5, gy: 5, rank: "main", roadSurface: "road", roadType: "straight", _seed: 0 }); }
    catch { threw = true; }
    expect(threw).toBe(false);
    expect(ctx._fills).toBe(0);     // pas de terre-plein par cellule
    expect(ctx._dashed).toBe(false); // pas de pointillé par cellule
  });
});

describe("cityMapDrawRoadMarkings — segments continus", () => {
  // Un boulevard horizontal de 5 cellules, sans croisement de grand axe.
  const boulevard = [
    { gx: 3, gy: 5, mask: ROAD_E, rank: "main" },
    { gx: 4, gy: 5, mask: ROAD_E | ROAD_W, rank: "main" },
    { gx: 5, gy: 5, mask: ROAD_E | ROAD_W, rank: "main" },
    { gx: 6, gy: 5, mask: ROAD_E | ROAD_W, rank: "main" },
    { gx: 7, gy: 5, mask: ROAD_W, rank: "main" },
  ];

  it("ère moderne : UN segment, terre-plein + bandes pointillées continues", () => {
    const ctx = setupLayout(boulevard, { ei: 14 });
    cityMapDrawRoadMarkings();
    expect(CM.roadRuns.hRuns).toHaveLength(1);
    expect(CM.roadRuns.hRuns[0]).toMatchObject({ x0: 3, x1: 7, gy: 5, rank: "main" });
    expect(ctx._fills).toBe(1);     // UN terre-plein pour tout le segment (≠ par cellule)
    expect(ctx._dashed).toBe(true);
  });

  it("ère classique (8) : terre-plein pavé, pas encore de peinture", () => {
    const ctx = setupLayout(boulevard, { ei: 8 });
    cityMapDrawRoadMarkings();
    expect(ctx._fills).toBe(1);
    expect(ctx._dashed).toBe(false);
  });

  it("ère ancienne (4) : aucune chaussée moderne", () => {
    const ctx = setupLayout(boulevard, { ei: 4 });
    cityMapDrawRoadMarkings();
    expect(ctx._fills).toBe(0);
    expect(ctx._dashed).toBe(false);
  });

  it("LOD / ruine / effondrement : passe ignorée", () => {
    for (const opt of [{ lod: true }, { ruined: true }, { collapse: true }]) {
      const ctx = setupLayout(boulevard, { ei: 14, ...opt });
      cityMapDrawRoadMarkings();
      expect(ctx._fills).toBe(0);
      expect(ctx._dashed).toBe(false);
    }
  });

  it("avenue : bandes peintes, sans terre-plein", () => {
    const ctx = setupLayout(boulevard.map((c) => ({ ...c, rank: "avenue" })), { ei: 14 });
    cityMapDrawRoadMarkings();
    expect(ctx._fills).toBe(0);     // chaussée non séparée
    expect(ctx._dashed).toBe(true);
  });
});

describe("vehicleLaneOffset — double sens de circulation", () => {
  // Pose un grand axe sous le véhicule et règle l'ère.
  function withRoad(rank, ei) {
    CM.frameEraIndex = ei;
    CM.layout = { roadMap: new Map([["5,5", { rank }]]) };
  }
  const v = (dir, extra = {}) => ({ gx: 5, gy: 5, dir, parkT: 0, ...extra });

  it("boulevard : les deux sens vont de part et d'autre de l'axe (signes opposés)", () => {
    withRoad("main", 14);
    const north = vehicleLaneOffset(v(3), 32);  // nord → est
    const south = vehicleLaneOffset(v(2), 32);  // sud  → ouest
    expect(north.x).toBeGreaterThan(0);
    expect(south.x).toBeLessThan(0);
    expect(north.x).toBeCloseTo(-south.x);       // symétriques autour du terre-plein
    expect(north.y).toBe(0);

    const east = vehicleLaneOffset(v(0), 32);    // est → sud
    const west = vehicleLaneOffset(v(1), 32);    // ouest → nord
    expect(east.y).toBeGreaterThan(0);
    expect(west.y).toBeLessThan(0);
    expect(east.x).toBe(0);
  });

  it("avenue décale aussi (moins large) ; sentier/rue restent centrés", () => {
    withRoad("avenue", 14);
    expect(Math.abs(vehicleLaneOffset(v(3), 32).x)).toBeGreaterThan(0);
    withRoad("secondary", 14);
    expect(vehicleLaneOffset(v(3), 32)).toEqual({ x: 0, y: 0 });
    withRoad("path", 14);
    expect(vehicleLaneOffset(v(3), 32)).toEqual({ x: 0, y: 0 });
  });

  it("aucun décalage avant l'ère 7 (routes non divisées) ni en stationnement", () => {
    withRoad("main", 4);
    expect(vehicleLaneOffset(v(3), 32)).toEqual({ x: 0, y: 0 });
    withRoad("main", 14);
    expect(vehicleLaneOffset(v(3, { parkT: 1 }), 32)).toEqual({ x: 0, y: 0 });
  });
});

describe("cityMapDrawRoadMarkings — nœuds & coupures", () => {
  it("brise les segments à un croisement de deux grands axes et le recense", () => {
    const cells = [
      // boulevard horizontal
      { gx: 3, gy: 5, mask: ROAD_E, rank: "main" },
      { gx: 4, gy: 5, mask: ROAD_E | ROAD_W, rank: "main" },
      { gx: 5, gy: 5, mask: ROAD_N | ROAD_E | ROAD_S | ROAD_W, rank: "main" },
      { gx: 6, gy: 5, mask: ROAD_E | ROAD_W, rank: "main" },
      { gx: 7, gy: 5, mask: ROAD_W, rank: "main" },
      // boulevard vertical croisant en (5,5)
      { gx: 5, gy: 3, mask: ROAD_S, rank: "main" },
      { gx: 5, gy: 4, mask: ROAD_N | ROAD_S, rank: "main" },
      { gx: 5, gy: 6, mask: ROAD_N | ROAD_S, rank: "main" },
      { gx: 5, gy: 7, mask: ROAD_N, rank: "main" },
    ];
    setupLayout(cells, { ei: 14 });
    cityMapDrawRoadMarkings();
    expect(CM.roadRuns.junctions).toHaveLength(1);
    expect(CM.roadRuns.junctions[0]).toMatchObject({ gx: 5, gy: 5 });
    // Les 4 bras mènent à un grand axe → mobilier de carrefour sur les 4 approches.
    expect(CM.roadRuns.junctions[0].armsBig).toBe(ROAD_N | ROAD_E | ROAD_S | ROAD_W);
    // Le H run est coupé en (5,5) → deux segments [3,4] et [6,7], pas un seul [3,7].
    const spans = CM.roadRuns.hRuns.map((r) => [r.x0, r.x1]).sort();
    expect(spans).toEqual([[3, 4], [6, 7]]);
  });

  it("une simple rue transversale (secondary) NE coupe PAS le boulevard", () => {
    const cells = [
      { gx: 3, gy: 5, mask: ROAD_E, rank: "main" },
      { gx: 4, gy: 5, mask: ROAD_E | ROAD_W, rank: "main" },
      { gx: 5, gy: 5, mask: ROAD_N | ROAD_E | ROAD_S | ROAD_W, rank: "main" },
      { gx: 6, gy: 5, mask: ROAD_E | ROAD_W, rank: "main" },
      { gx: 7, gy: 5, mask: ROAD_W, rank: "main" },
      // rue secondaire qui se greffe en (5,5)
      { gx: 5, gy: 4, mask: ROAD_S, rank: "secondary" },
      { gx: 5, gy: 3, mask: ROAD_N | ROAD_S, rank: "secondary" },
    ];
    setupLayout(cells, { ei: 14 });
    cityMapDrawRoadMarkings();
    expect(CM.roadRuns.junctions).toHaveLength(0);               // pas un nœud de grands axes
    expect(CM.roadRuns.hRuns).toHaveLength(1);
    expect(CM.roadRuns.hRuns[0]).toMatchObject({ x0: 3, x1: 7 }); // boulevard continu
  });
});

describe("cityMapDrawRoadMarkings — passages piétons de quartier", () => {
  const ALL = ROAD_N | ROAD_E | ROAD_S | ROAD_W;
  const pc = (m) => ((m & ROAD_N) ? 1 : 0) + ((m & ROAD_E) ? 1 : 0) + ((m & ROAD_S) ? 1 : 0) + ((m & ROAD_W) ? 1 : 0);

  it("un sous-ensemble des croisements de rues secondaires reçoit un passage piéton", () => {
    const cells = [];
    for (let i = 0; i < 24; i += 1) {                 // 24 carrefours en + bien séparés
      const gx = 10 + (i % 6) * 6, gy = 10 + Math.floor(i / 6) * 6;
      cells.push({ gx, gy, mask: ALL, rank: "secondary" });
      cells.push({ gx, gy: gy - 1, mask: ROAD_S, rank: "secondary" });
      cells.push({ gx, gy: gy + 1, mask: ROAD_N, rank: "secondary" });
      cells.push({ gx: gx - 1, gy, mask: ROAD_E, rank: "secondary" });
      cells.push({ gx: gx + 1, gy, mask: ROAD_W, rank: "secondary" });
    }
    setupLayout(cells, { ei: 14 });
    cityMapDrawRoadMarkings();
    const mj = CM.roadRuns.minorJunctions;
    expect(mj.length).toBeGreaterThan(0);            // quand même quelques-uns
    expect(mj.length).toBeLessThan(24);              // mais pas tous
    for (const j of mj) {
      expect(j.gx % 6).toBe(4);                      // uniquement les centres (pas les bras)
      expect(pc(j.mask)).toBeGreaterThanOrEqual(2);  // bras secondaires retenus
    }
  });

  it("un + de rues bordé de boulevards n'est PAS un petit carrefour", () => {
    const cells = [
      { gx: 50, gy: 50, mask: ALL, rank: "secondary" },
      { gx: 50, gy: 49, mask: ROAD_S, rank: "main" },
      { gx: 50, gy: 51, mask: ROAD_N, rank: "main" },
      { gx: 49, gy: 50, mask: ROAD_E, rank: "main" },
      { gx: 51, gy: 50, mask: ROAD_W, rank: "main" },
    ];
    setupLayout(cells, { ei: 14 });
    cityMapDrawRoadMarkings();
    // Aucun bras secondaire → armsMinor vide → jamais recensé (déterministe).
    expect(CM.roadRuns.minorJunctions.filter((j) => j.gx === 50 && j.gy === 50)).toHaveLength(0);
  });

  it("avant l'ère peinte (< 11), pas de passage piéton de quartier dessiné", () => {
    const cells = [
      { gx: 5, gy: 5, mask: ROAD_N | ROAD_E | ROAD_S | ROAD_W, rank: "secondary" },
      { gx: 5, gy: 4, mask: ROAD_S, rank: "secondary" },
      { gx: 5, gy: 6, mask: ROAD_N, rank: "secondary" },
      { gx: 4, gy: 5, mask: ROAD_E, rank: "secondary" },
      { gx: 6, gy: 5, mask: ROAD_W, rank: "secondary" },
    ];
    const ctx = setupLayout(cells, { ei: 8 });       // < 11 : non peint
    cityMapDrawRoadMarkings();
    expect(ctx._dashed).toBe(false);
    // La détection peut recenser, mais rien n'est peint avant l'ère 11.
  });
});
