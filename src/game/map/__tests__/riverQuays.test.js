// LES RUES DE QUAI TIENNENT LEUR CASE (Raph 2026-10-04 : « corrige les rues du
// fleuve »). Le lit s'étire avec la grille, qui grandit avec les achats : une case de
// quai posée sur le seuil eau/berge basculait en berge, et l'élagage retirait sa rue
// (une rue sur la berge n'est marchable qu'au pied d'un pont). Une case portée par une
// rue mémorisée reste désormais terre ferme — sauf au pied d'un pont.
import { describe, it, expect, beforeEach } from "vitest";
import { state } from "../../core/state.js";
import { growCity as grow } from "../../../test/city.js";
const rel = (L) => new Set(L.roads.map((r) => (r.gx - L.cx) + "," + (r.gy - L.cy)));
const bridgeRoads = (L) => L.roads.filter((r) => r.roadSurface === "bridge");

beforeEach(() => {
  state.cityRoads = null; state.cityCore = null; state.cityMapSlots = {}; state.cityArchetype = null; state.cityPersonality = null; state.riverWP = null;
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
      // Les pieds de pont restent des culées : les ponts ne disparaissent pas. Chaque
      // case de tablier reste une rue — tablier, ou culée quand le lit qui s'étire la
      // rend à la berge (le compte de cases de tablier peut donc perdre une case au
      // bord de l'eau, cf. la grille plus compacte des villes neuves, audit 2026-10-05,
      // MORT-4) — et aucune colonne de pont ne se perd.
      for (const r of bridgeRoads(L1)) {
        const k = (r.gx - L1.cx) + "," + (r.gy - L1.cy);
        expect(r2.has(k), `case de pont ${k} perdue`).toBe(true);
      }
      const cols = (L) => new Set(bridgeRoads(L).map((r) => r.gx - L.cx));
      expect(cols(L2).size).toBeGreaterThanOrEqual(cols(L1).size);
    });
  }
});
