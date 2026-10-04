import { describe, it, expect } from "vitest";

import { CM, ROAD_E, ROAD_N, ROAD_S, ROAD_W } from "../layout.js";
import { updateCitizens, cityMapWalkRoadKey } from "../agents.js";
import { figuresBeginFrame, noteFig, figNear, FIG } from "../figures.js";
import { isoPlazaCompositions, plazaBases, plazaWalkAnchors } from "../iso/isoPlaza.js";

// docs/PLAN-COMPORTEMENTS.md, LOT 1 — « réparer ce qui se voit ». Chaque garde
// correspond à un constat de l'audit du 2026-10-04 :
//  · la bulle de pensée tombait sur un passant HORS ÉCRAN (ou endormi) ;
//  · le compagnon était lâché quand son meneur rentrait, et le rattrapait à l'aube
//    en ligne droite à travers les maisons ;
//  · un partant dont la porte était inatteignable restait dehors pour toujours ;
//  · les passants des rues traversaient le mobilier des places ;
//  · les oiseaux ne fuyaient que les passants des rues (registre des figures).

const TILE = 20, SPEED = 10, DT = 0.05;
const DOOR = { gx: 12, gy: 5 };

function corridor(cells, doors) {
  CM.TILE = TILE;
  CM.cw = 800; CM.ch = 600; CM.nightF = 0; CM.rainF = 0; CM.lodActive = false;
  const roadMap = new Map(), walkRoadSet = new Set(), walkRoadList = [];
  const mask = ROAD_E | ROAD_W | ROAD_S | ROAD_N;
  for (const [gx, gy] of cells) {
    walkRoadSet.add(cityMapWalkRoadKey(gx, gy));
    walkRoadList.push({ gx, gy });
    roadMap.set(gx + "," + gy, { gx, gy, mask, roadSurface: "road" });
  }
  CM.layout = { counts: { eraBand: 2, eraIndex: 5 }, roadMap };
  CM.walkRoadSet = walkRoadSet; CM.walkRoadList = walkRoadList;
  CM.wonderWalkSet = null; CM.wonderGatherCells = null; CM.plazaRoadCells = null; CM.bankRoads = null;
  CM.plazaWalkOffset = null;
  CM.globalBubbleCooldown = 999;
  CM.vehicles = []; CM.citizens = [];
  CM.homeRoadCells = doors; CM.workRoadCells = [];
  CM.buildingEdgeList = doors;
  CM.buildingEdgeSet = new Set(doors.map((d) => cityMapWalkRoadKey(d.gx, d.gy)));
}
const row = (x0, x1, y) => { const out = []; for (let x = x0; x <= x1; x += 1) out.push([x, y]); return out; };
function citizen(gx, gy, extra = {}) {
  return {
    gx, gy, x: (gx + 0.5) * TILE, y: (gy + 0.5) * TILE, tx: (gx + 0.5) * TILE, ty: (gy + 0.5) * TILE,
    pauseT: 0, speed: SPEED, phase: 0.11, dir: 0, charType: 0, skinVariant: 0, fade: 1,
    goal: null, social: false, home: null, work: null, thoughtType: null, thoughtTimer: 0, _grp: 0,
    ...extra,
  };
}
const run = (sec) => { for (let t = 0; t < sec; t += DT) updateCitizens(DT); };

describe("lot 1 — réparer ce qui se voit", () => {
  it("le registre des figures se lit à la frame suivante, et ne compte que ceux qui marchent", () => {
    figuresBeginFrame();
    noteFig(100, 100, FIG.QUAY | FIG.MOVING);
    noteFig(300, 300, FIG.PLAZA);                  // arrêté
    expect(figNear(100, 100, 10)).toBe(false);     // frame en cours : pas encore lue
    figuresBeginFrame();
    expect(figNear(104, 102, 10)).toBe(true);
    expect(figNear(300, 300, 10)).toBe(false);     // arrêté : ne dérange personne
    expect(figNear(300, 300, 10, false)).toBe(true);
  });

  it("la bulle de pensée va à un passant À L'ÉCRAN, jamais à un passant hors champ", () => {
    // Deux rues : l'une sous la caméra, l'autre à 8 000 px de là.
    corridor([...row(2, 12, 5), ...row(400, 410, 5)], [DOOR]);
    CM.cam = { x: 7 * TILE, y: 5.5 * TILE, zoom: 1 };
    for (let i = 0; i < 12; i += 1) CM.citizens.push(citizen(401 + (i % 8), 5, { phase: 0.1 + i * 0.07, pauseT: 99 }));
    const seen = citizen(6, 5, { phase: 0.5, pauseT: 99 });
    CM.citizens.push(seen);
    for (let k = 0; k < 20; k += 1) {
      for (const c of CM.citizens) { c.thoughtType = null; c.thoughtTimer = 0; }
      CM.globalBubbleCooldown = 0;
      updateCitizens(0.001);
      const who = CM.citizens.filter((c) => c.thoughtType);
      expect(who).toEqual([seen]);
    }
    // Personne à l'écran : aucune bulle, on réessaie bientôt.
    CM.citizens = CM.citizens.filter((c) => c !== seen);
    for (const c of CM.citizens) { c.thoughtType = null; c.thoughtTimer = 0; }
    CM.globalBubbleCooldown = 0;
    updateCitizens(0.001);
    expect(CM.citizens.some((c) => c.thoughtType)).toBe(false);
    expect(CM.globalBubbleCooldown).toBeLessThanOrEqual(5);
  });

  it("le compagnon rentre AVEC son meneur : même porte, même fondu, et ils sont rentrés ensemble", () => {
    corridor(row(2, 12, 5), [DOOR]);
    CM.cam = { x: 7 * TILE, y: 5.5 * TILE, zoom: 1 };
    const L = citizen(9, 5, { leaving: true, phase: 0.31, _nf: 1 });
    const f = citizen(9, 5, { phase: 0.47 });
    f.lead = L; f._grp = 1; L._f1 = f;
    CM.citizens.push(L, f);
    let fadedTogether = 0, leaderGoneFirst = false;
    for (let t = 0; t < 30 && CM.citizens.length; t += DT) {
      updateCitizens(DT);
      if (CM.citizens.includes(f) && !CM.citizens.includes(L)) leaderGoneFirst = true;
      if (L._vanish !== undefined && f._vanish === L._vanish) fadedTogether += 1;
    }
    expect(CM.citizens).toEqual([]);              // rentrés tous les deux
    expect(fadedTogether).toBeGreaterThan(0);     // le même fondu
    expect(leaderGoneFirst).toBe(false);          // pas d'orphelin resté dehors
    expect(atCell(f, DOOR)).toBe(true);           // la même porte
  });

  it("un partant dont la porte est hors d'atteinte finit par rentrer (délai de grâce)", () => {
    // La seule porte est sur une île de route sans lien avec le couloir.
    const far = { gx: 40, gy: 40 };
    corridor([...row(2, 12, 5), [40, 40]], [far]);
    CM.cam = { x: 7 * TILE, y: 5.5 * TILE, zoom: 1 };
    const p = citizen(3, 5, { leaving: true });
    CM.citizens.push(p);
    run(70);
    expect(CM.citizens).toContain(p);              // il a d'abord cherché sa porte
    run(30);
    expect(CM.citizens).not.toContain(p);          // puis il est rentré où il était
  });

  it("le point de passage d'une case de place n'est jamais dans la base d'un meuble", () => {
    const n = 5, gx0 = 10, gy0 = 10;
    for (const kind of ["marche", "centrale", "jardin", "parvis"]) {
      const roadMap = new Map();
      for (let iy = 0; iy < n; iy += 1) for (let ix = 0; ix < n; ix += 1) roadMap.set((gx0 + ix) + "," + (gy0 + iy), { gx: gx0 + ix, gy: gy0 + iy, rank: "plaza" });
      const L = { roadMap, plan: { plazas: [{ gx: gx0 + n / 2, gy: gy0 + n / 2, kind }] }, counts: { eraBand: 4 } };
      CM.TILE = 32;
      CM.layoutRecomputeAt = 77000 + kind.length;
      const comp = isoPlazaCompositions(L, 4)[0];
      const a = plazaWalkAnchors(L, 4);
      const bases = plazaBases(comp.props, comp.lamps, 32);
      const inside = (x, y) => bases.some((b) => Math.abs(x - b.cx) < b.ex && Math.abs(y - b.cy) < b.ey);
      let open = 0;
      for (const c of comp.cells) {
        const k = c.gx * 10000 + c.gy;
        if (a.blocked.has(k)) continue;
        open += 1;
        const o = a.offset.get(k) || [0, 0];
        expect(inside(c.gx + 0.5 + o[0], c.gy + 0.5 + o[1])).toBe(false);
      }
      expect(open).toBeGreaterThan(comp.cells.length * 0.6);   // la place reste traversable
    }
  });
});

function atCell(p, c) { return p.gx === c.gx && p.gy === c.gy; }
