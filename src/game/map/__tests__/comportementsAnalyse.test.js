import { describe, it, expect, vi, afterEach } from "vitest";

import { CM, ROAD_E, ROAD_N, ROAD_S, ROAD_W } from "../layout.js";
import { updateCitizens, cityMapWalkRoadKey } from "../agents.js";
import { citizenTraits } from "../citizenDay.js";
import { seededRng } from "../../core/utils.js";

// docs/PLAN-COMPORTEMENTS.md §7 — PASSE D'ANALYSE du 2026-10-04 : ce que la vérification
// des constats de l'audit, en jeu, a encore trouvé après les six lots.
//  · le soir, les buts de la journée survivaient à la nuit (372 passants sur 943 en
//    route vers une place 36 s après la tombée de la nuit, 40 traversant le fleuve).

const TILE = 20, DT = 0.05;
const MASK = ROAD_E | ROAD_W | ROAD_S | ROAD_N;
// updateCitizens tire au sort (Math.random) : le banc tire avec une GRAINE, sinon il
// échouait un lancement sur deux. Graine 30 : la première dont tous les comptes tombent
// sur la médiane de 2 000 graines (56 en route à +3 s ; 11 à +53 s, dont 8 sorties du
// jour gardées ; 45 qui rentrent). Les seuils tiennent pour 1 995 graines sur 2 000 : un
// changement d'agents.js qui décale les tirages ne doit pas les faire tomber.
const SEED = 30;

afterEach(() => { vi.restoreAllMocks(); });

describe("passe d'analyse — le soir, on rentre", () => {
  it("à la tombée de la nuit, ceux partis flâner rentrent, étalés dans le temps", () => {
    vi.spyOn(Math, "random").mockImplementation(seededRng(SEED));
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
    const dayGoal = ps.map((p) => p.goal);                          // la sortie du JOUR de chacun
    CM.citizens = ps;
    CM.citT = 0; CM._duskOn = false;
    for (let t = 0; t < 1; t += DT) updateCitizens(DT);
    expect(ps.every((p) => p.goalKind === "plaza")).toBe(true);   // le jour, rien ne change
    CM.dayP = 0.6; CM.nightF = 0.5;                                 // le soir tombe
    const plazaAt = (sec) => { for (let t = 0; t < sec; t += DT) updateCitizens(DT); return ps.filter((p) => !p.lead && p.goal && p.goalKind === "plaza"); };
    const early = plazaAt(3).length;
    const late = plazaAt(50);
    const owl = (p) => citizenTraits(p).owl;                        // 16 couche-tard sur 60
    expect(early).toBeGreaterThan(30);                             // pas tous d'un coup
    // 50 s après, qui va encore à la place est un couche-tard : un sur deux garde sa
    // sortie, et la nuit pickAgenda renvoie sur la place 40 % de ceux qui l'ont lâchée.
    // (Les compter tous sous un seuil de 12 échouait une graine sur deux : 11,3 ± 1,8.)
    expect(late.every(owl)).toBe(true);
    // Sorties du jour encore suivies : un sur deux, 8 ± 2 sur 2 000 graines (14 dans 5 cas,
    // jamais plus) ; 16 s'ils la gardaient tous.
    expect(ps.filter((p, i) => p.goal === dayGoal[i]).length).toBeLessThan(14);
    expect(ps.filter((p) => p.goalKind === "home").length).toBeGreaterThan(30);
  });
});
