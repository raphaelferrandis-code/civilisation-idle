// LES RUES DE QUAI TIENNENT LEUR CASE (Raph 2026-10-04 : « corrige les rues du
// fleuve »). Le lit s'étire avec la grille, qui grandit avec les achats : une case de
// quai posée sur le seuil eau/berge basculait en berge, et l'élagage retirait sa rue
// (une rue sur la berge n'est marchable qu'au pied d'un pont). Une case portée par une
// rue mémorisée reste désormais terre ferme — sauf au pied d'un pont.
import { describe, it, expect, beforeEach } from "vitest";
import { computeCityLayout, ILOT_MODE } from "../layout.js";
import { state } from "../../core/state.js";
import { D } from "../../core/num.js";
import { eras } from "../../data/world.js";
import { ROAD_MEMORY } from "../roadMemory.js";

const KEYS = Object.keys(state.buildings).filter((k) => k !== "roads");
function grow(i, level = 30) {
  const pop = D(eras[i].at);
  Object.assign(state, {
    cycles: 1, mapSeed: 0x2b1c07, population: pop,
    knowledge: pop.mul(0.05), infrastructure: pop.mul(0.1), instability: 0, timeWear: 0,
  });
  KEYS.forEach((k) => { state.buildings[k] = level; });
  state.buildings.roads = 20;
  return computeCityLayout(state);
}
const rel = (L) => new Set(L.roads.map((r) => (r.gx - L.cx) + "," + (r.gy - L.cy)));
const bridges = (L) => L.roads.filter((r) => r.roadSurface === "bridge").length;

beforeEach(() => {
  ROAD_MEMORY.on = true; ILOT_MODE.on = true;
  state.cityRoads = null; state.cityCore = null; state.cityMapSlots = {}; state.cityArchetype = null; state.riverWP = null;
});

describe("rues de quai et fleuve qui s'étire", () => {
  for (const era of [17, 21, 27]) {
    it(`ère ${era} → ${era + 1} : la grille grandit, aucune rue ne se perd au bord de l'eau`, () => {
      grow(era);
      const L1 = grow(era);
      const L2 = grow(era + 1, 34);
      const r2 = rel(L2);
      let auBord = 0;
      for (const k of rel(L1)) {
        if (r2.has(k)) continue;
        const ci = k.indexOf(","), x = +k.slice(0, ci) + L2.cx, y = +k.slice(ci + 1) + L2.cy;
        if (L2.river.isBank(x, y) || L2.river.isWater(x, y)) auBord += 1;
      }
      expect(auBord, "rues de quai perdues").toBe(0);
      // Les pieds de pont restent des culées : les ponts ne disparaissent pas.
      expect(bridges(L2)).toBeGreaterThanOrEqual(bridges(L1));
    }, 180000);
  }
});
