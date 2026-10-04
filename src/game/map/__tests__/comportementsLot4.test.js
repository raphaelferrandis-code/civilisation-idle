import { describe, it, expect, vi, afterEach } from "vitest";

import { state } from "../../core/state.js";
import { CM, ROAD_E, ROAD_N, ROAD_S, ROAD_W } from "../layout.js";
import { updateCitizens, cityMapWalkRoadKey } from "../agents.js";
import { pickAgenda, paceFor, citizenTraits } from "../citizenDay.js";
import { updateCrisis } from "../quaysAndRiot.js";
import { isoPlazaCompositions } from "../iso/isoPlaza.js";
import { folkAt, FOLK } from "../iso/plazaFolk.js";
import { depthOf } from "../iso/projection.js";

// docs/PLAN-COMPORTEMENTS.md, LOT 4 — « la ville réagit ». Constats de l'audit du
// 2026-10-04 que ces gardes ferment :
//  · sous l'averse, la place restait pleine et personne ne s'abritait ;
//  · face à l'émeute, les passants continuaient leur chemin au milieu de la foule ;
//  · les émeutiers surgissaient de nulle part et disparaissaient d'un coup ;
//  · rien ne changeait avec la saison ni la météo dans l'emploi du temps.

const TILE = 20, DT = 0.05;
const MASK = ROAD_E | ROAD_W | ROAD_S | ROAD_N;

function net(cells, doors = []) {
  CM.TILE = TILE;
  CM.cam = { x: 0, y: 0, zoom: 1 }; CM.cw = 800; CM.ch = 600;
  CM.nightF = 0; CM.dayP = 0.3; CM.rainF = 0; CM.season = 1; CM.lodActive = false;
  CM.riotDraw = null; CM._riotC = null; CM.rioters = []; CM.riotFading = null;
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
    homeRoadCells: doors, workRoadCells: [], citizens: [],
  });
  CM.buildingEdgeList = doors;
  CM.buildingEdgeSet = new Set(doors.map((d) => cityMapWalkRoadKey(d.gx, d.gy)));
}
const line = (x0, x1, y) => { const o = []; for (let x = x0; x <= x1; x += 1) o.push([x, y]); return o; };
function cit(gx, gy, extra = {}) {
  return {
    gx, gy, x: (gx + 0.5) * TILE, y: (gy + 0.5) * TILE, tx: (gx + 0.5) * TILE, ty: (gy + 0.5) * TILE,
    pauseT: 0, speed: 20, phase: 0.11, dir: 0, charType: 0, skinVariant: 0, fade: 1,
    goal: null, social: false, home: null, work: null, thoughtType: null, thoughtTimer: 0, _grp: 0, _born: true,
    ...extra,
  };
}

afterEach(() => { vi.restoreAllMocks(); CM.rainF = 0; CM.season = 1; CM.riotDraw = null; CM.riotWindow = false; });

describe("lot 4 — l'emploi du temps suit le temps qu'il fait", () => {
  const share = (env, kind) => {
    const tr = { owl: false, slow: false, stagger: 0 };
    let n = 0;
    for (let i = 0; i < 1000; i += 1) if (pickAgenda(0.3, tr, (i + 0.5) / 1000, 0, env) === kind) n += 1;
    return n / 1000;
  };
  it("sous l'averse on rentre plus et on flâne moins sur la place", () => {
    const sec = { rain: 0, season: 1 }, averse = { rain: 0.8, season: 1 };
    expect(share(averse, "home")).toBeGreaterThan(share(sec, "home") + 0.1);
    expect(share(averse, "plaza")).toBeLessThan(share(sec, "plaza"));
  });
  it("l'hiver, une part de la journée se passe au logis", () => {
    expect(share({ rain: 0, season: 3 }, "home")).toBeGreaterThan(share({ rain: 0, season: 1 }, "home"));
  });
  it("on presse le pas sous la pluie, et plus encore pour fuir l'émeute", () => {
    const p = { phase: 0.4 }, tr = citizenTraits(p);
    const sec = paceFor(p, tr, 0.3, "work", { rain: 0, season: 1 });
    const pluie = paceFor(p, tr, 0.3, "work", { rain: 0.8, season: 1 });
    const fuite = paceFor(p, tr, 0.3, "flee", { rain: 0, season: 1 });
    expect(pluie).toBeGreaterThan(sec * 1.2);
    expect(fuite).toBeGreaterThan(sec * 1.3);
  });
});

describe("lot 4 — s'abriter", () => {
  it("devant une porte, sous l'averse, on s'abrite dos au mur — et on repart quand elle cesse", () => {
    // Couloir y=5 bordé de bâti des deux côtés : chaque case est un seuil. La façade
    // (facingBuilding) est la première voisine hors route — ici le sud.
    const cells = line(0, 14, 5);
    const doors = cells.map(([gx, gy]) => ({ gx, gy }));
    net(cells, doors);
    CM.rainF = 0.8;
    const ps = [];
    for (let i = 0; i < 12; i += 1) ps.push(cit(1 + i, 5, { phase: 0.05 + i * 0.07 }));
    CM.citizens = ps;
    let sheltered = null;
    for (let t = 0; t < 60 && !sheltered; t += DT) {
      updateCitizens(DT);
      sheltered = CM.citizens.find((p) => p._shelter) || null;
    }
    expect(sheltered).toBeTruthy();
    expect(sheltered.pauseT).toBeGreaterThan(8);      // une vraie halte, pas un pas suspendu
    expect(sheltered.dir).toBe(3);                     // dos au mur (sud), face à la rue
    const gx = sheltered.gx;
    for (let t = 0; t < 3; t += DT) updateCitizens(DT);
    expect(sheltered._shelter).toBe(true);
    expect(sheltered.gx).toBe(gx);                     // il ne bouge pas tant qu'il pleut
    CM.rainF = 0;
    updateCitizens(DT);
    expect(sheltered._shelter).toBe(false);
  });

  it("quand l'averse commence, ceux partis flâner AU SEC revoient leur programme", () => {
    // Vécu en jeu (2026-10-04) : 175 passants sur 330 marchaient encore vers une place
    // une minute après le début de l'averse — des trajets choisis avant la pluie.
    net(line(0, 40, 5));
    CM.plazaRoadCells = [{ gx: 38, gy: 5 }, { gx: 39, gy: 5 }];
    const ps = [];
    for (let i = 0; i < 80; i += 1) {
      ps.push(cit(2 + (i % 20), 5, { phase: (i * 0.173) % 1, goal: { gx: 38, gy: 5 }, goalKind: "plaza", social: true, _goalAt: -1 }));
    }
    CM.citizens = ps;
    CM._rainOn = false; CM.citT = 0;
    updateCitizens(DT);
    expect(ps.every((p) => p.goalKind === "plaza")).toBe(true);   // au sec, rien ne change
    CM.rainF = 0.9;
    // Le but est lâché aussitôt ; le nouveau se tire à la case suivante.
    for (let t = 0; t < 3; t += DT) updateCitizens(DT);
    // Les meneurs (un compagnon suit le sien, son but ne compte pas) qui visent encore la place.
    const leaders = ps.filter((p) => !p.lead);
    const still = leaders.filter((p) => p.goal && p.goalKind === "plaza").length;
    // Attendu ≈ 31 % (un quart s'obstine + quelques re-tirages vers la place) ; sans la
    // relecture, 100 %.
    expect(leaders.length).toBeGreaterThan(40);
    expect(still).toBeLessThan(leaders.length * 0.5);
    expect(still).toBeGreaterThan(0);                                // pas tous : un quart s'obstine
  });

  it("qui rentre chez lui ne s'abrite pas en route", () => {
    const cells = line(0, 14, 5);
    net(cells, cells.map(([gx, gy]) => ({ gx, gy })));
    CM.rainF = 0.8; CM.dayP = 0.7; CM.nightF = 0.9;   // soir : l'heure de rentrer
    const ps = [];
    for (let i = 0; i < 12; i += 1) ps.push(cit(1 + i, 5, { phase: 0.05 + i * 0.07, goalKind: "home" }));
    CM.citizens = ps;
    for (let t = 0; t < 20; t += DT) {
      updateCitizens(DT);
      expect(CM.citizens.some((p) => p._shelter)).toBe(false);
    }
  });
});

describe("lot 4 — face à l'émeute", () => {
  const riotAt = (gx, gy) => { CM.riotDraw = { pts: [{ x: (gx + 0.5) * TILE, y: (gy + 0.5) * TILE }], cx: (gx + 0.5) * TILE, cy: (gy + 0.5) * TILE }; };

  it("on s'en éloigne d'un bon pas (fuite) ou on s'arrête à distance pour regarder", () => {
    net(line(0, 40, 5));
    riotAt(10, 5);
    const ps = [];
    // Tous entre 3 et 5 cases de la foule : assez près pour réagir, assez loin pour regarder.
    const at = [5, 6, 7, 13, 14, 15];
    for (let i = 0; i < 40; i += 1) ps.push(cit(at[i % at.length], 5, { phase: (i * 0.137) % 1 }));
    CM.citizens = ps;
    updateCitizens(DT);
    const flee = ps.filter((p) => p.goalKind === "flee");
    const watch = ps.filter((p) => p._watch);
    expect(flee.length).toBeGreaterThan(8);
    expect(watch.length).toBeGreaterThan(3);
    // La fuite mène LOIN de la foule.
    for (const p of flee) expect(Math.abs(p.goal.gx - 10)).toBeGreaterThanOrEqual(9);
    // Qui regarde se tourne vers l'émeute.
    for (const p of watch) {
      const want = p.gx < 10 ? [0] : [1];   // CM_DIRS : 0 = est (+x), 1 = ouest (−x)
      expect(want).toContain(p.dir);
    }
    // Une seule décision par émeute : une frame plus tard, personne ne re-tire.
    const before = ps.map((p) => p._riotSeen);
    updateCitizens(DT);
    expect(ps.map((p) => p._riotSeen)).toEqual(before);
  });

  it("les émeutiers SORTENT des passants et leur rendent la place à la fin", () => {
    net(line(0, 30, 5));
    state.instability = 0.8;
    CM.riotWindow = true;
    const ps = [];
    for (let i = 0; i < 30; i += 1) ps.push(cit(i, 5, { phase: (i * 0.211) % 1 }));
    CM.citizens = ps;
    updateCrisis(DT, 1000);
    const recruited = CM.rioters.filter((r) => r._cit);
    expect(recruited.length).toBeGreaterThan(5);
    for (const r of recruited) {
      expect(r._cit._riot).toBe(r);
      expect(r.speed).toBeLessThan(18);          // un pas pressé, plus une glissade
    }
    // Le passant pris par la foule n'est plus dessiné ni simulé.
    updateCitizens(DT);
    for (const r of recruited) expect(r._cit._nightHidden).toBe(true);
    // Fin de la fenêtre : chacun redevient le passant qu'il était, là où il s'est arrêté.
    for (let t = 0; t < 2; t += DT) updateCrisis(DT, 1000 + t * 1000);
    const pos = recruited.map((r) => ({ c: r._cit, x: r.x, y: r.y }));
    CM.riotWindow = false;
    updateCrisis(DT, 4000);
    expect(CM.rioters.length).toBe(0);
    for (const { c, x, y } of pos) {
      expect(c._riot).toBe(null);
      expect(c.x).toBe(x); expect(c.y).toBe(y);
      expect(c.fade).toBeLessThan(1);            // il réapparaît en fondu
    }
    state.instability = 0;
  });

  it("sans passant à rendre, l'émeutier d'appoint s'efface en fondu au lieu de disparaître", () => {
    net(line(0, 30, 5));
    state.instability = 0.8;
    CM.riotWindow = true;
    CM.citizens = [];
    updateCrisis(DT, 1000);
    const n = CM.rioters.length;
    expect(n).toBeGreaterThan(0);
    CM.riotWindow = false;
    updateCrisis(DT, 2000);
    expect(CM.rioters.length).toBe(0);
    expect(CM.riotFading.length).toBe(n);
    updateCrisis(0.4, 2400);
    expect(CM.riotFading.every((f) => f._alpha > 0 && f._alpha < 1)).toBe(true);
    updateCrisis(0.5, 2900);
    expect(CM.riotFading.length).toBe(0);
    state.instability = 0;
  });
});

describe("lot 4 — la place se vide sous l'averse et la nuit", () => {
  function plazaLayout(n, kind, band = 3, gx0 = 10, gy0 = 10) {
    const roadMap = new Map();
    for (let iy = 0; iy < n; iy += 1) {
      for (let ix = 0; ix < n; ix += 1) roadMap.set((gx0 + ix) + "," + (gy0 + iy), { gx: gx0 + ix, gy: gy0 + iy, rank: "plaza" });
    }
    const road = (gx, gy) => roadMap.set(gx + "," + gy, { gx, gy, rank: "street" });
    for (let i = -1; i <= n; i += 1) { road(gx0 + i, gy0 - 1); road(gx0 + i, gy0 + n); road(gx0 - 1, gy0 + i); road(gx0 + n, gy0 + i); }
    return { roadMap, plan: { plazas: [{ gx: gx0 + n / 2, gy: gy0 + n / 2, kind }] }, counts: { eraBand: band } };
  }
  let stamp = 5000;
  const compose = () => {
    CM.TILE = TILE;
    CM.layoutRecomputeAt = (stamp += 1);
    return isoPlazaCompositions(plazaLayout(5, "marche"), 3)[0];
  };
  const present = (comp, env) => {
    let n = 0, k = 0;
    for (let s = 0; s < 3000; s += 7) { k += 1; for (const r of folkAt(comp.folk, s * 1000, TILE, depthOf, env)) n += r.alpha; }
    return n / k;
  };

  it("moins de flâneurs sous l'averse, et la nuit", () => {
    Object.assign(FOLK, { on: true, slot: 30, speed: 0.27, leaveP: 0.1, viaP: 0.4, density: 1 });
    const sec = present(compose(), { night: 0, rain: 0, season: 1 });
    const pluie = present(compose(), { night: 0, rain: 0.9, season: 1 });
    const nuit = present(compose(), { night: 1, rain: 0, season: 1 });
    expect(pluie).toBeLessThan(sec * 0.75);
    expect(nuit).toBeLessThan(sec * 0.8);
    expect(pluie).toBeGreaterThan(0);            // jamais déserte d'un coup
  });

  it("le temps qu'il fait est figé par créneau : une averse ne réécrit pas le passé", () => {
    const comp = compose();
    const t = 400 * 1000;
    const snap = () => folkAt(comp.folk, t, TILE, depthOf, null).map((r) => [r.wx, r.wy, r.alpha].join(","));
    const a = snap();
    const b = folkAt(comp.folk, t, TILE, depthOf, { night: 1, rain: 1, season: 3 }).map((r) => [r.wx, r.wy, r.alpha].join(","));
    expect(b).toEqual(a);
  });
});
