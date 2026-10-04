import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { CM, ROAD_E, ROAD_N, ROAD_S, ROAD_W } from "../layout.js";
import { updateCitizens, cityMapWalkRoadKey } from "../agents.js";
import { citizenTraits } from "../citizenDay.js";

// docs/PLAN-COMPORTEMENTS.md §7 — PASSE D'ANALYSE du 2026-10-04 : ce que la vérification
// des constats de l'audit, en jeu, a encore trouvé après les six lots.
//  · le soir, les buts de la journée survivaient à la nuit (372 passants sur 943 en
//    route vers une place 36 s après la tombée de la nuit, 40 traversant le fleuve).

const TILE = 20, DT = 0.05;
// Les passants tirent au hasard (Math.random) : GRAINE FIXE, sinon le compte des
// couche-tard oscille d'un tirage à l'autre (il dépassait le seuil environ une fois sur cinq).
let seed = 1;
beforeEach(() => { seed = 1; vi.spyOn(Math, "random").mockImplementation(() => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }); });
afterEach(() => { vi.restoreAllMocks(); });
const MASK = ROAD_E | ROAD_W | ROAD_S | ROAD_N;

describe("passe d'analyse — le soir, on rentre", () => {
  it("à la tombée de la nuit, ceux partis flâner rentrent, étalés dans le temps", () => {
    CM.TILE = TILE; CM.cam = { x: 0, y: 0, zoom: 1 }; CM.cw = 800; CM.ch = 600;
    CM.nightF = 0; CM.dayP = 0.3; CM.rainF = 0; CM.lodActive = false; CM.riotDraw = null;
    CM.layoutRecomputeAt = (CM.layoutRecomputeAt || 0) + 1;
    const roadMap = new Map(), walkRoadSet = new Set(), walkRoadList = [];
    for (let gx = 0; gx <= 60; gx += 1) {
      walkRoadSet.add(cityMapWalkRoadKey(gx, 5)); walkRoadList.push({ gx, gy: 5 });
      roadMap.set(gx + ",5", { gx, gy: 5, mask: MASK, roadSurface: "road" });
    }
    CM.layout = { counts: { eraBand: 4, eraIndex: 9 }, roadMap };
    const homes = [{ gx: 1, gy: 5 }, { gx: 2, gy: 5 }];
    Object.assign(CM, { walkRoadSet, walkRoadList, roadSet: new Set(walkRoadList.map((c) => c.gx + ",5")), wonderWalkSet: null,
      plazaRoadCells: [{ gx: 59, gy: 5 }], vehicles: [], homeRoadCells: homes, workRoadCells: [], buildingEdgeList: homes,
      buildingEdgeSet: new Set(homes.map((h) => cityMapWalkRoadKey(h.gx, h.gy))), globalBubbleCooldown: 999 });
    const ps = [];
    for (let i = 0; i < 60; i += 1) {
      const gx = 4 + (i % 30);
      ps.push({ gx, gy: 5, x: (gx + 0.5) * TILE, y: 5.5 * TILE, tx: (gx + 0.5) * TILE, ty: 5.5 * TILE, pauseT: 0, speed: 6,
        phase: (i * 0.0731) % 1, dir: 0, charType: 0, fade: 1, goal: { gx: 59, gy: 5 }, goalKind: "plaza", social: true,
        home: homes[i % 2], _goalAt: -1, _grp: 0, _born: true });
    }
    CM.citizens = ps;
    CM.citT = 0; CM._duskOn = false;
    for (let t = 0; t < 1; t += DT) updateCitizens(DT);
    expect(ps.every((p) => p.goalKind === "plaza")).toBe(true);   // le jour, rien ne change
    CM.dayP = 0.6; CM.nightF = 0.5;                                 // le soir tombe
    const plazaAt = (sec) => { for (let t = 0; t < sec; t += DT) updateCitizens(DT); return ps.filter((p) => !p.lead && p.goal && p.goalKind === "plaza").length; };
    const early = plazaAt(3);
    const late = plazaAt(50);
    expect(early).toBeGreaterThan(30);                             // pas tous d'un coup
    // Ne restent dehors que des COUCHE-TARD (un sur quatre) : ceux qui gardent leur sortie
    // et ceux qui en reprennent une — jamais un passant ordinaire.
    const owls = ps.filter((p) => citizenTraits(p).owl);
    expect(late).toBeLessThanOrEqual(owls.length);
    expect(ps.filter((p) => !p.lead && p.goalKind === "plaza" && !citizenTraits(p).owl)).toHaveLength(0);
    expect(ps.filter((p) => p.goalKind === "home").length).toBeGreaterThan(30);
  });
});
