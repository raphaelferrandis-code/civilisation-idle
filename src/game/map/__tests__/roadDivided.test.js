import { describe, it, expect } from "vitest";

import { CM, ROAD_N, ROAD_E, ROAD_S, ROAD_W, computeMedianSegments } from "../layout.js";
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
  // Terre-plein = entité de layout (calculée comme en prod) → la passe continue le lit.
  CM.layout = { cx: 100, cy: 100, roadMap, roadSet, median: computeMedianSegments(roadMap), river: { isWater: () => false } };
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

  it("deux routes parallèles adjacentes → comble le sol + terre-plein entre elles (fusion, dès ère basse)", () => {
    // Deux routes VERTICALES côte à côte (gx 5 et 6). Sans marquage d'ère (ei 4) : c'est
    // bien la FUSION (corps qui comble le sol + terre-plein sur la couture) qui peint.
    const ctx = setupLayout([
      { gx: 5, gy: 5, mask: ROAD_N | ROAD_S, rank: "secondary" },
      { gx: 6, gy: 5, mask: ROAD_N | ROAD_S, rank: "secondary" },
    ], { ei: 4 });
    cityMapDrawRoad({ gx: 5, gy: 5, rank: "secondary", roadSurface: "road", _seed: 0 });
    expect(ctx._fills).toBeGreaterThan(0);   // sol comblé + terre-plein glissé entre les 2 voies

    // Une route SEULE (pas de voisine parallèle) ne déclenche pas la fusion.
    const ctx2 = setupLayout([{ gx: 5, gy: 5, mask: ROAD_N | ROAD_S, rank: "secondary" }], { ei: 4 });
    cityMapDrawRoad({ gx: 5, gy: 5, rank: "secondary", roadSurface: "road", _seed: 0 });
    expect(ctx2._fills).toBe(0);
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

  it("ère moderne : UN segment, bandes pointillées continues (terre-plein = pixel)", () => {
    const ctx = setupLayout(boulevard, { ei: 14 });
    cityMapDrawRoadMarkings();
    expect(CM.roadRuns.hRuns).toHaveLength(1);
    expect(CM.roadRuns.hRuns[0]).toMatchObject({ x0: 3, x1: 7, gy: 5, rank: "main" });
    expect(ctx._fills).toBe(0);     // plus d'aplat procédural : le refuge est rendu en pixel
    expect(ctx._dashed).toBe(true);
  });

  it("ère classique (8) : bandes pas encore peintes, aucun aplat procédural", () => {
    const ctx = setupLayout(boulevard, { ei: 8 });
    cityMapDrawRoadMarkings();
    expect(ctx._fills).toBe(0);     // terre-plein procédural supprimé (→ pixel)
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

  it("avenue : bandes peintes, terre-plein en pixel (plus d'aplat procédural)", () => {
    const ctx = setupLayout(boulevard.map((c) => ({ ...c, rank: "avenue" })), { ei: 14 });
    cityMapDrawRoadMarkings();
    expect(ctx._fills).toBe(0);     // aplat procédural supprimé — refuge planté = pixel
    expect(ctx._dashed).toBe(true);
  });
});

describe("vehicleLaneOffset — boulevard 2 cellules : file au bord extérieur", () => {
  const v = (gx, gy, dir, extra = {}) => ({ gx, gy, dir, parkT: 0, ...extra });
  // Boulevard HORIZONTAL de 2 cellules : rangées gy=5 ET gy=6 en "main".
  function boulevardH() {
    CM.frameEraIndex = 14;
    const m = new Map();
    for (let x = 3; x <= 7; x += 1) { m.set(x + ",5", { rank: "main" }); m.set(x + ",6", { rank: "main" }); }
    CM.layout = { roadMap: m };
  }

  it("les deux files se collent au BORD EXTÉRIEUR (opposées, loin de la couture)", () => {
    boulevardH();
    const top = vehicleLaneOffset(v(5, 5, 0), 32);  // voie du haut (voisin main en bas) → file en HAUT
    const bot = vehicleLaneOffset(v(5, 6, 0), 32);  // voie du bas (voisin main en haut) → file en BAS
    expect(top.y).toBeLessThan(0);
    expect(bot.y).toBeGreaterThan(0);
    expect(top.x).toBe(0);
    expect(top.y).toBeCloseTo(-bot.y);               // symétriques autour de la couture
  });

  it("avenue / rue / sentier : centrés (seul le boulevard main 2-cell décale)", () => {
    CM.frameEraIndex = 14;
    CM.layout = { roadMap: new Map([["5,5", { rank: "avenue" }]]) };
    expect(vehicleLaneOffset(v(5, 5, 0), 32)).toEqual({ x: 0, y: 0 });
    CM.layout = { roadMap: new Map([["5,5", { rank: "secondary" }]]) };
    expect(vehicleLaneOffset(v(5, 5, 0), 32)).toEqual({ x: 0, y: 0 });
  });

  it("main SANS voisin (1 cellule) ou stationnement : centré", () => {
    CM.frameEraIndex = 14;
    CM.layout = { roadMap: new Map([["5,5", { rank: "main" }]]) };  // pas de 2e voie
    expect(vehicleLaneOffset(v(5, 5, 0), 32)).toEqual({ x: 0, y: 0 });
    boulevardH();
    expect(vehicleLaneOffset(v(5, 5, 0, { parkT: 1 }), 32)).toEqual({ x: 0, y: 0 }); // garé
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
