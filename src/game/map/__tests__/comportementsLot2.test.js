import { describe, it, expect, vi, afterEach } from "vitest";

import { CM, ROAD_E, ROAD_N, ROAD_S, ROAD_W } from "../layout.js";
import { updateCitizens, cityMapWalkRoadKey, citizenWorkNear } from "../agents.js";
import { walkPath, walkNearest, walkComponent } from "../citizenRoute.js";
import { pickAgenda, homeTime, dawnFor } from "../citizenDay.js";

// docs/PLAN-COMPORTEMENTS.md, LOT 2 — « des trajets qui ont un sens ». Constats de
// l'audit du 2026-10-04 que ces gardes ferment :
//  · pas de chemin : un pas glouton et 5 % de chances par case de changer de but ;
//  · on n'entrait jamais nulle part, le travail était tiré n'importe où ;
//  · la nuit, un tiers « dormait » devant n'importe quelle porte, les autres erraient ;
//  · on changeait de trottoir à chaque virage ;
//  · personne ne se saluait.

const TILE = 20, DT = 0.05;
const MASK = ROAD_E | ROAD_W | ROAD_S | ROAD_N;

function net(cells, doors = [], works = []) {
  CM.TILE = TILE;
  CM.cam = { x: 0, y: 0, zoom: 1 }; CM.cw = 800; CM.ch = 600;
  CM.nightF = 0; CM.dayP = 0.3; CM.rainF = 0; CM.lodActive = false;
  CM.layoutRecomputeAt = (CM.layoutRecomputeAt || 0) + 1;
  const roadMap = new Map(), walkRoadSet = new Set(), walkRoadList = [], roadSet = new Set();
  for (const [gx, gy] of cells) {
    walkRoadSet.add(cityMapWalkRoadKey(gx, gy));
    walkRoadList.push({ gx, gy });
    roadMap.set(gx + "," + gy, { gx, gy, mask: MASK, roadSurface: "road" });
    roadSet.add(gx + "," + gy);
  }
  CM.layout = { counts: { eraBand: 4, eraIndex: 9 }, roadMap };
  Object.assign(CM, {
    walkRoadSet, walkRoadList, roadSet, wonderWalkSet: null, hearthWalkSet: null, wonderGatherCells: null,
    plazaRoadCells: null, bankRoads: null, plazaWalkOffset: null, globalBubbleCooldown: 999, vehicles: [],
    homeRoadCells: doors, workRoadCells: works, citizens: [],
  });
  const all = [...doors, ...works];
  CM.buildingEdgeList = all;
  CM.buildingEdgeSet = new Set(all.map((d) => cityMapWalkRoadKey(d.gx, d.gy)));
}
const line = (x0, x1, y) => { const o = []; for (let x = x0; x <= x1; x += 1) o.push([x, y]); return o; };
const col = (x, y0, y1) => { const o = []; for (let y = y0; y <= y1; y += 1) o.push([x, y]); return o; };
function nb(gx, gy, push) {
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    if (CM.walkRoadSet.has(cityMapWalkRoadKey(gx + dx, gy + dy))) push(gx + dx, gy + dy, 1);
  }
}
function cit(gx, gy, extra = {}) {
  return {
    gx, gy, x: (gx + 0.5) * TILE, y: (gy + 0.5) * TILE, tx: (gx + 0.5) * TILE, ty: (gy + 0.5) * TILE,
    pauseT: 0, speed: 20, phase: 0.11, dir: 0, charType: 0, skinVariant: 0, fade: 1,
    goal: null, social: false, home: null, work: null, thoughtType: null, thoughtTimer: 0, _grp: 0, _born: true,
    ...extra,
  };
}
const run = (sec, each) => { for (let t = 0; t < sec; t += DT) { updateCitizens(DT); if (each && each(t) === true) return t; } return null; };

afterEach(() => { vi.restoreAllMocks(); });

describe("lot 2 — le chemin", () => {
  it("A* rend le plus court chemin, contourne l'impasse, et sépare les îlots", () => {
    // Un U : la route directe (3,0)→(3,4) n'existe pas, il faut faire le tour.
    net([...line(0, 6, 0), ...col(0, 0, 4), ...col(6, 0, 4), ...line(0, 3, 4), [10, 10]]);
    const path = walkPath(3, 4, 6, 4, nb, CM.layoutRecomputeAt);
    // (3,4)→(0,4)→(0,0)→(6,0)→(6,4) : 3 + 4 + 6 + 4 = 17 pas.
    expect(path.length).toBe(17);
    expect(path[path.length - 1]).toBe(cityMapWalkRoadKey(6, 4));
    expect(walkPath(3, 4, 10, 10, nb, CM.layoutRecomputeAt)).toBe(null);
    const a = walkComponent(3, 4, CM.walkRoadList, nb, CM.layoutRecomputeAt);
    const b = walkComponent(10, 10, CM.walkRoadList, nb, CM.layoutRecomputeAt);
    expect(a).not.toBe(b);
  });

  it("le parvis d'une merveille posée sur un ÎLOT n'est jamais visé (pas de chemin)", () => {
    // Vécu en jeu : 270 passants marchaient vers une merveille sans chemin possible.
    net(line(0, 10, 2));
    const W = new Set([cityMapWalkRoadKey(20, 20), cityMapWalkRoadKey(21, 20)]);
    for (const k of W) CM.walkRoadSet.add(k);
    CM.wonderWalkSet = W;
    CM.wonderGatherCells = [{ gx: 20, gy: 20, face: 0 }, { gx: 21, gy: 20, face: 1 }];
    CM.wonderPull = 1;
    const p = cit(3, 2);
    CM.citizens.push(p);
    let wonder = 0, picks = 0;
    for (let i = 0; i < 300; i += 1) {
      p.goal = null; p._path = null; p.pauseT = 0; p.x = p.tx; p.y = p.ty;
      updateCitizens(DT);
      if (p.goal) { picks += 1; if (p.goal.gx >= 20) wonder += 1; }
    }
    expect(picks).toBeGreaterThan(100);
    expect(wonder).toBe(0);
  });

  it("la porte la plus proche se mesure EN MARCHANT, pas à vol d'oiseau", () => {
    net([...line(0, 6, 0), ...col(0, 0, 4), ...col(6, 0, 4), ...line(0, 3, 4)]);
    // (6,4) est à 3 cases à vol d'oiseau de (3,4) mais à 17 pas ; (0,2) est à 5 pas.
    const doors = new Set([cityMapWalkRoadKey(6, 4), cityMapWalkRoadKey(0, 2)]);
    const hit = walkNearest(3, 4, (k) => doors.has(k), nb, 80);
    expect(hit.key).toBe(cityMapWalkRoadKey(0, 2));
  });

  it("un passant qui va au travail y va par le plus court, sans détour au hasard", () => {
    const WORK = { gx: 6, gy: 4 };
    net([...line(0, 6, 0), ...col(0, 0, 4), ...col(6, 0, 4), ...line(0, 3, 4)], [], [WORK]);
    const p = cit(3, 4, { work: WORK, goal: WORK, goalKind: "work" });
    CM.citizens.push(p);
    const cells = new Set();
    const t = run(120, () => { cells.add(p.gx + "," + p.gy); return p.gx === 6 && p.gy === 4; });
    expect(t).not.toBe(null);
    expect(cells.size).toBe(17);           // les 17 pas du chemin, pas une case de plus
  });
});

describe("lot 2 — la journée", () => {
  it("au travail, on ENTRE par la porte, puis on ressort plus tard", () => {
    const WORK = { gx: 5, gy: 2 };
    net(line(0, 8, 2), [], [WORK]);
    const p = cit(1, 2, { work: WORK, goal: WORK, goalKind: "work" });
    CM.citizens.push(p);
    let hiddenAt = null, backAt = null;
    run(120, (t) => {
      if (hiddenAt == null && p._nightHidden) hiddenAt = t;
      if (hiddenAt != null && !p._nightHidden && p._vanish === undefined) { backAt = t; return true; }
      return false;
    });
    expect(hiddenAt).not.toBe(null);
    expect(p.gx === WORK.gx && p.gy === WORK.gy || backAt != null).toBe(true);
    expect(backAt - hiddenAt).toBeGreaterThan(10);    // il a travaillé un moment
  });

  it("le soir on rentre CHEZ SOI et on y reste jusqu'à l'aube (sauf les couche-tard)", () => {
    const HOME = { gx: 7, gy: 2 };
    net(line(0, 8, 2), [HOME], []);
    CM.dayP = 0.7; CM.nightF = 1;
    // phase 0.03 : pas un couche-tard (cf. citizenTraits).
    const p = cit(1, 2, { home: HOME, phase: 0.03 });
    CM.citizens.push(p);
    run(80);
    expect(p.gx).toBe(HOME.gx);
    expect(p._nightHidden).toBe(true);
    run(30);
    expect(p._nightHidden).toBe(true);     // toujours dedans au cœur de la nuit
    CM.dayP = 0.2; CM.nightF = 0;          // le jour est là
    run(10);
    expect(p._nightHidden).toBe(false);
  });

  it("l'emploi du temps : rentrer le soir, travailler le matin, la place à midi", () => {
    const tr = { owl: false, slow: false, stagger: 0.5 };
    const count = (dp, kind) => { let n = 0; for (let i = 0; i < 400; i += 1) if (pickAgenda(dp, tr, i / 400) === kind) n += 1; return n; };
    expect(count(0.7, "home")).toBe(400);
    expect(count(0.05, "work")).toBeGreaterThan(count(0.05, "plaza") * 4);
    expect(count(0.3, "plaza")).toBeGreaterThan(count(0.3, "work"));
    expect(homeTime(0.6)).toBe(true);
    expect(dawnFor(0.95, 0.2)).toBe(true);
    expect(dawnFor(0.8, 0.2)).toBe(false);
  });

  it("le travail est tiré PRÈS de la maison", () => {
    const works = [];
    for (let i = 0; i < 40; i += 1) works.push({ gx: (i * 7) % 90, gy: (i * 13) % 90 });
    net(line(0, 1, 0), [], works);
    const home = { gx: 45, gy: 45 };
    for (let s = 0; s < 50; s += 1) {
      const w = citizenWorkNear(home, s * 2654435761);
      const near = works.some((c) => Math.abs(c.gx - 45) + Math.abs(c.gy - 45) <= 18);
      if (near) expect(Math.abs(w.gx - 45) + Math.abs(w.gy - 45)).toBeLessThanOrEqual(18);
    }
  });
});

describe("lot 2 — la rue", () => {
  it("on garde son trottoir tout le long d'une rue", () => {
    net(line(0, 20, 3), [], []);
    const p = cit(1, 3, { goal: { gx: 19, gy: 3 }, goalKind: "wander" });
    CM.citizens.push(p);
    CM.isoPedEdge = 0.3; CM.isoPedEdgeLow = 0.3;
    const signs = new Set();
    run(60, () => { if (p.toy) signs.add(Math.sign(p.toy)); return p.gx >= 19; });
    expect(signs.size).toBe(1);
    CM.isoPedEdge = null; CM.isoPedEdgeLow = null;
  });

  it("deux passants qui se croisent s'arrêtent parfois pour causer, face à face", () => {
    net(line(0, 12, 3), [], []);
    const a = cit(2, 3, { goal: { gx: 11, gy: 3 }, goalKind: "wander", phase: 0.2 });
    const b = cit(10, 3, { goal: { gx: 1, gy: 3 }, goalKind: "wander", phase: 0.6 });
    a._side = 1; a._sideAxis = 1; b._side = 1; b._sideAxis = 1;    // même trottoir
    CM.citizens.push(a, b);
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    const t = run(40, () => a._chatWith === b);
    expect(t).not.toBe(null);
    expect(b._chatWith).toBe(a);
    expect(a.pauseT).toBeGreaterThan(0);
    expect(a.dir).not.toBe(b.dir);
  });
});
