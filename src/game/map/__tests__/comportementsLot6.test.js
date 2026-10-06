import { describe, it, expect, vi, afterEach } from "vitest";

import { CM, ROAD_E, ROAD_N, ROAD_S, ROAD_W } from "../layout.js";
import { updateCitizens, cityMapWalkRoadKey, AVOID } from "../agents.js";
import { figuresBeginFrame, noteFig, figNear, figAhead, figFree, FIG } from "../figures.js";

// docs/PLAN-COMPORTEMENTS.md, LOT 6 — « un seul peuple ». Constats de l'audit que ces
// gardes ferment : les peuples de la carte s'ignoraient (on se traversait d'un peuple à
// l'autre, et même entre passants) ; le registre du lot 1 parcourait toute la liste à
// chaque question.

const TILE = 32, DT = 0.05;
const MASK = ROAD_E | ROAD_W | ROAD_S | ROAD_N;

describe("lot 6 — le registre rangé par cases", () => {
  it("figNear rend la même réponse que le parcours complet", () => {
    figuresBeginFrame();
    const pts = [];
    let s = 7;
    const rnd = () => { s = (s * 1103515245 + 12345) >>> 0; return s / 4294967296; };
    for (let i = 0; i < 600; i += 1) {
      const x = rnd() * 2000 - 300, y = rnd() * 2000 - 300, f = rnd() < 0.5 ? FIG.MOVING | FIG.STREET : FIG.PLAZA;
      pts.push([x, y, f]); noteFig(x, y, f);
    }
    figuresBeginFrame();
    for (let k = 0; k < 300; k += 1) {
      const x = rnd() * 2000 - 300, y = rnd() * 2000 - 300, r = 5 + rnd() * 90, mov = rnd() < 0.5;
      const brute = pts.some(([px, py, f]) => (!mov || (f & FIG.MOVING)) && (px - x) ** 2 + (py - y) ** 2 < r * r);
      expect(figNear(x, y, r, mov)).toBe(brute);
    }
  });

  it("figAhead voit devant, pas derrière, et dit de quel côté ; figFree", () => {
    figuresBeginFrame();
    noteFig(110, 103, FIG.MOVING);            // devant, un peu à droite (y+ quand on va vers x+)
    noteFig(80, 100, FIG.MOVING);             // derrière
    figuresBeginFrame();
    expect(figAhead(100, 100, 1, 0, 20, 6)).toBe(1);
    expect(figAhead(100, 100, -1, 0, 30, 6)).toBe(1);   // vers l'ouest, (80,100) est pile devant
    expect(figAhead(100, 100, 0, 1, 20, 6)).toBe(0);
    expect(figFree(300, 300, 20)).toBe(true);
    expect(figFree(108, 100, 5)).toBe(false);
  });
});

describe("lot 6 — on s'évite", () => {
  afterEach(() => { vi.restoreAllMocks(); AVOID.on = true; });
  function run(avoid) {
    CM.TILE = TILE; CM.cam = { x: 0, y: 0, zoom: 1 }; CM.cw = 800; CM.ch = 600;
    CM.nightF = 0; CM.dayP = 0.3; CM.rainF = 0; CM.lodActive = false; CM.riotDraw = null;
    CM.layoutRecomputeAt = (CM.layoutRecomputeAt || 0) + 1;
    const roadMap = new Map(), walkRoadSet = new Set(), walkRoadList = [];
    for (let gx = 0; gx <= 20; gx += 1) {
      walkRoadSet.add(cityMapWalkRoadKey(gx, 5)); walkRoadList.push({ gx, gy: 5 });
      roadMap.set(gx + ",5", { gx, gy: 5, mask: MASK, roadSurface: "road" });
    }
    CM.layout = { counts: { eraBand: 4, eraIndex: 9 }, roadMap };
    Object.assign(CM, { walkRoadSet, walkRoadList, roadSet: new Set(walkRoadList.map((c) => c.gx + ",5")), wonderWalkSet: null, plazaRoadCells: null,
      vehicles: [], homeRoadCells: [], workRoadCells: [], buildingEdgeList: [], buildingEdgeSet: new Set(), globalBubbleCooldown: 999 });
    const mk = (gx, goal, ph, speed) => ({ gx, gy: 5, x: (gx + 0.5) * TILE, y: 5.5 * TILE, tx: (gx + 0.5) * TILE, ty: 5.5 * TILE,
      pauseT: 0, speed, phase: ph, dir: -1, charType: 0, fade: 1, goal: { gx: goal, gy: 5 }, goalKind: "work", social: false, _grp: 0, _born: true,
      _side: 1, _sideAxis: "x" });
    // Un passant pressé en RATTRAPE un lent sur le même bord (même sens de marche).
    // Tirages figés (pas de causette, pas de halte de vitrine) : on mesure le dépassement.
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const a = mk(2, 19, 0.21, 34), b = mk(5, 19, 0.21, 8);
    CM.citizens = [a, b];
    AVOID.on = avoid;
    let gap = Infinity, passed = false;
    for (let t = 0; t < 30; t += DT) {
      figuresBeginFrame();
      for (const p of CM.citizens) noteFig(p.x + (p.lox || 0), p.y + (p.loy || 0), FIG.STREET | FIG.MOVING);
      updateCitizens(DT);
      const ax = a.x + a.lox, bx = b.x + b.lox;
      // Au moment où l'un passe l'autre, l'écart EN TRAVERS de la rue.
      if (Math.abs(ax - bx) < 4) gap = Math.min(gap, Math.abs(a.y + a.loy - b.y - b.loy));
      if (ax > bx + 8) passed = true;
    }
    return { gap, passed };
  }
  it("qui en rattrape un autre sur le même bord le double en s'écartant", () => {
    const sans = run(false), avec = run(true);
    expect(sans.passed).toBe(true);
    expect(avec.passed).toBe(true);
    expect(sans.gap).toBeLessThan(1.5);                 // avant : il lui passait au travers
    expect(avec.gap).toBeGreaterThan(TILE * 0.1);
  });

  // « Les habitants marchent en faisant des petits tremblements » (Raph, 2026-10-06).
  // Quelqu'un posé un peu à droite de sa file (0,1 case, dans le couloir de ± 0,24) : le
  // couloir se mesurait depuis la position DÉJÀ écartée, le pas de côté (0,22) le sortait
  // du couloir, on revenait, on le revoyait — un aller-retour en travers toutes les une à
  // deux images (en jeu au Campement : jusqu'à 91 inversions sur 150 images). On s'écarte
  // UNE fois, on le double, on reprend son bord.
  it("s'écarte d'un obstacle sans trembler", () => {
    CM.TILE = TILE; CM.cam = { x: 0, y: 0, zoom: 1 }; CM.cw = 800; CM.ch = 600;
    CM.nightF = 0; CM.dayP = 0.3; CM.rainF = 0; CM.lodActive = false; CM.riotDraw = null;
    CM.layoutRecomputeAt = (CM.layoutRecomputeAt || 0) + 1;
    const roadMap = new Map(), walkRoadSet = new Set(), walkRoadList = [];
    for (let gx = 0; gx <= 20; gx += 1) {
      walkRoadSet.add(cityMapWalkRoadKey(gx, 5)); walkRoadList.push({ gx, gy: 5 });
      roadMap.set(gx + ",5", { gx, gy: 5, mask: MASK, roadSurface: "road" });
    }
    CM.layout = { counts: { eraBand: 4, eraIndex: 9 }, roadMap };
    Object.assign(CM, { walkRoadSet, walkRoadList, roadSet: new Set(walkRoadList.map((c) => c.gx + ",5")), wonderWalkSet: null, plazaRoadCells: null,
      vehicles: [], homeRoadCells: [], workRoadCells: [], buildingEdgeList: [], buildingEdgeSet: new Set(), globalBubbleCooldown: 999 });
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const a = { gx: 4, gy: 5, x: 4.5 * TILE, y: 5.5 * TILE, tx: 4.5 * TILE, ty: 5.5 * TILE, pauseT: 0, speed: 16, phase: 0.21, dir: -1,
      charType: 0, fade: 1, goal: { gx: 19, gy: 5 }, goalKind: "work", social: false, _grp: 0, _born: true, _side: 1, _sideAxis: "x" };
    CM.citizens = [a];
    let ox = null, oy = 0, flips = 0, lastD = 0, prevY = null, passed = false, dodged = 0;
    for (let t = 0; t < 30 && !passed; t += DT) {
      figuresBeginFrame();
      noteFig(a.x + (a.lox || 0), a.y + (a.loy || 0), FIG.STREET | FIG.MOVING);
      if (ox == null && a.lox !== undefined && a.x > 4.8 * TILE) { ox = a.x + a.lox + TILE * 1.5; oy = a.y + a.loy + TILE * 0.1; }
      if (ox != null) noteFig(ox, oy, FIG.STREET);   // l'obstacle, immobile
      updateCitizens(DT);
      const y = a.y + a.loy;
      if (ox != null && prevY != null) {
        const d = y - prevY;
        if (Math.abs(d) > 0.02) { if (lastD && Math.sign(d) !== Math.sign(lastD)) flips += 1; lastD = d; }
        dodged = Math.max(dodged, oy - y);
      }
      prevY = y;
      if (ox != null && a.x + a.lox > ox + TILE * 0.6) passed = true;
    }
    expect(passed).toBe(true);
    expect(dodged).toBeGreaterThan(TILE * 0.25);       // il s'est bien écarté (0,1 + ~0,2)
    expect(flips).toBeLessThanOrEqual(1);              // s'écarter, revenir : pas de va-et-vient
  });
});
