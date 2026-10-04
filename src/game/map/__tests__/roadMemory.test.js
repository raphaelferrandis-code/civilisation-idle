// LA MÉMOIRE DU RÉSEAU (docs/PLAN-ROUTES.md, lots L1-L2).
//
// Avant ces lots, une ville qui grandissait d'une ère perdait 40 à 60 % de ses
// rues — redessinées ailleurs — et la moitié de ses bâtiments déménageaient.
// Ces tests font grandir UNE ville comme dans une vraie partie (même état d'une
// étape à l'autre) et vérifient les règles : une rue posée ne disparaît plus,
// un bâtiment posé ne bouge plus, le cœur ne glisse plus.
//
// ⚠ L'ère vient de l'état GLOBAL (`currentEraIndex` lit `state`, pas l'état
// passé au layout) : on fait donc grandir `state` lui-même.
import { describe, it, expect, beforeEach } from "vitest";
import { computeCityLayout } from "../layout.js";
import { state, normalizeCityCore } from "../../core/state.js";
import { D } from "../../core/num.js";
import { eras } from "../../data/world.js";
import { decodeRoadMemory, encodeRoadMemory, normalizeRoadMemory, ROAD_MEMORY } from "../roadMemory.js";

const KEYS = Object.keys(state.buildings).filter((k) => k !== "roads");

function grow(i, f = 1) {
  const pop = D(eras[i].at).mul(f);
  Object.assign(state, {
    cycles: 1, mapSeed: 0x51a7c0de, population: pop,
    knowledge: pop.mul(0.05), infrastructure: pop.mul(0.1), instability: 0, timeWear: 0,
  });
  const t = i + (f > 1 ? 0.5 : 0);
  KEYS.forEach((k, j) => { state.buildings[k] = Math.max(0, Math.min(40, Math.round((t - j * 1.1) * 1.6))); });
  state.buildings.roads = Math.round(t * 2);
  return computeCityLayout(state);
}
// Repère des slots : le centre de grille (la grille grandit autour de lui).
const roadSet = (L) => new Set(L.roads.map((r) => (r.gx - L.cx) + "," + (r.gy - L.cy)));
const decorSlots = () => Object.fromEntries(Object.entries(state.cityMapSlots)
  .filter(([k]) => k.includes(":dec_")).map(([k, v]) => [k, v.dx + "," + v.dy]));

beforeEach(() => {
  ROAD_MEMORY.on = true;
  state.cityRoads = null; state.cityCore = null; state.cityMapSlots = {}; state.cityArchetype = null; state.riverWP = null;
});

describe("mémoire du réseau — une ville qui se souvient", () => {
  it("campement → bourg : aucune rue ne disparaît, aucun bâtiment ne déménage", () => {
    let prevRoads = null, prevSlots = null, lostRoads = 0, moved = 0, core = null;
    for (let i = 0; i <= 14; i += 2) {
      for (const f of [1, 4]) {
        const L = grow(i, f);
        expect(L.counts.eraBand).toBeLessThanOrEqual(ROAD_MEMORY.lastBand);
        const cr = [Math.round(L.plan.core.x) - L.cx, Math.round(L.plan.core.y) - L.cy].join(",");
        if (core) expect(cr, `le cœur a glissé à l'ère ${i}`).toBe(core);
        core = cr;
        const roads = roadSet(L);
        // Exception de R1 : le fleuve dérive d'une case quand la grille grandit
        // (ses échantillons s'étirent avec N) — une rue de rive recouverte par la
        // berge s'efface. Toute AUTRE disparition est une faute.
        // …et la DEMI-DOUZAINE de cases au-delà, quand la berge a coupé le sentier :
        // le bout resté isolé du réseau est retiré par l'élagage de connexité.
        const wet = (k) => {
          const [dx, dy] = k.split(",").map(Number);
          for (let ex = -3; ex <= 3; ex += 1) for (let ey = -3; ey <= 3; ey += 1) {
            const ak = (L.cx + dx + ex) + "," + (L.cy + dy + ey);
            if (L.river.cells.has(ak) || L.river.banks.has(ak)) return true;
          }
          return false;
        };
        if (prevRoads) for (const k of prevRoads) if (!roads.has(k) && !wet(k)) lostRoads += 1;
        const slots = decorSlots();
        if (prevSlots) for (const [k, p] of Object.entries(prevSlots)) if (slots[k] && slots[k] !== p) moved += 1;
        prevRoads = roads; prevSlots = slots;
      }
    }
    expect(lostRoads, "rues disparues").toBe(0);
    // Mesuré 0 à 6 par étape (ateliers qui grossissent) contre 80 à 250 avant.
    expect(moved, "maisons déplacées").toBeLessThanOrEqual(8);
  }, 120000);

  it("stable dès le 2e calcul : rien ne bouge, rien ne disparaît", () => {
    grow(6);
    const a = computeCityLayout(state);
    const b = computeCityLayout(state);
    expect([...roadSet(b)].sort()).toEqual([...roadSet(a)].sort());
    expect(b.tiles.map((t) => t.key).sort()).toEqual(a.tiles.map((t) => t.key).sort());
  }, 60000);

  it("un chantier de voirie payé ne sert qu'une fois", () => {
    grow(8);
    const before = computeCityLayout(state);
    const used0 = state.cityRoads.works;
    expect(used0).toBeLessThanOrEqual(state.buildings.roads);
    // Recalculs sans achat : ni raccord ni élargissement de plus.
    const again = computeCityLayout(state);
    expect(state.cityRoads.works).toBe(used0);
    expect(again.roadCover.engineConnected).toBe(before.roadCover.engineConnected);
    expect(again.roadWorksInfo.widened).toBe(before.roadWorksInfo.widened);
  }, 60000);

  it("une nouvelle ville (autre graine) repart de zéro", () => {
    grow(6);
    expect(state.cityRoads).toBeTruthy();
    const mem = state.cityRoads;
    expect(decodeRoadMemory(mem, 0x51a7c0de, 0, 0)).toBeTruthy();
    expect(decodeRoadMemory(mem, 0x1234, 0, 0)).toBeNull();
  }, 60000);

  it("les cités aussi : de la cité à l'âge cosmique, aucune rue ne disparaît", () => {
    // Lot L5 (« fais toutes les ères ») : le plan de chaque ère ne pousse que sur
    // le terrain neuf, la vieille ville garde ses rues. Pas de 2 à 3 ères pour
    // tenir le temps de test ; la percée du boulevard (bande 5) et le passage
    // aux tours cosmiques (bande 7) sont dedans.
    let prev = null, lost = 0, moved = 0, prevSlots = null, prevIlot = false;
    for (const i of [12, 15, 18, 21, 24, 26, 29, 32, 35, 37]) {
      const L = grow(i);
      // LA RÉORGANISATION UNIQUE (docs/PLAN-ILOTS.md, décision de Raph 2026-10-04) :
      // le calcul qui fait passer la ville aux îlots la retrace, une fois — ses
      // pertes et déménagements ne comptent pas. Avant comme après, la règle tient.
      const ilotNow = !!(state.cityCore && state.cityCore.ilot);
      if (ilotNow && !prevIlot) { prev = null; prevSlots = null; }
      prevIlot = ilotNow;
      const roads = roadSet(L);
      const wg = L.wonderGround || new Set();
      const wet = (k) => {
        const [dx, dy] = k.split(",").map(Number);
        for (let ex = -3; ex <= 3; ex += 1) for (let ey = -3; ey <= 3; ey += 1) {
          const ak = (L.cx + dx + ex) + "," + (L.cy + dy + ey);
          if (L.river.cells.has(ak) || L.river.banks.has(ak)) return true;
        }
        return wg.has((L.cx + dx) + "," + (L.cy + dy));
      };
      if (prev) for (const k of prev) if (!roads.has(k) && !wet(k)) lost += 1;
      const slots = decorSlots();
      if (prevSlots) for (const [k, p2] of Object.entries(prevSlots)) if (slots[k] && slots[k] !== p2) moved += 1;
      prev = roads; prevSlots = slots;
    }
    expect(lost, "rues disparues").toBe(0);
    // Deux délogements voulus, chacun UNE fois : la percée du boulevard à la bande 5
    // (mesuré : 54 maisons) et le dégagement sous l'autoroute à la bande 6 (41 —
    // une case de pelouse de chaque côté de l'artère, docs/PLAN-ETAGES.md) ; mesuré
    // pas à pas, plus rien ne bouge après (1 puis 0). Le reste en déplace une poignée.
    expect(moved, "maisons déplacées").toBeLessThanOrEqual(130);
  }, 300000);

  it("un seul pont, et l'artère le prolonge sur les deux rives", () => {
    const L = grow(26);
    const ax = L.cx + state.cityCore.bx;
    const bridgeCols = new Set();
    for (const r of L.roadMap.values()) if (r.roadSurface === "bridge") bridgeCols.add(r.gx);
    expect([...bridgeCols].every((x) => x === ax || x === ax + 1), "traversée hors du pont historique").toBe(true);
    // De part et d'autre du fleuve, la colonne de l'artère est une rue.
    let north = 0, south = 0;
    for (const r of L.roadMap.values()) {
      if (r.gx !== ax || r.roadSurface === "bridge") continue;
      if (r.gy < L.river.riverYAt(ax)) north += 1; else south += 1;
    }
    expect(north).toBeGreaterThan(3);
    expect(south).toBeGreaterThan(3);
  }, 120000);
});

describe("mémoire du réseau — format", () => {
  it("aller-retour exact, bandes de naissance et de pavage comprises", () => {
    const cells = [
      { gx: 10, gy: 12, rank: "path", h: true, v: false, born: 0, pave: 0 },
      { gx: 11, gy: 12, rank: "secondary", h: true, v: true, born: 1, pave: 2 },
      { gx: 11, gy: 13, rank: "plaza", h: true, v: true, born: 2, pave: 2 },
    ];
    const mem = encodeRoadMemory(cells, 77, 8, 8, { works: 3, widened: 1 });
    const back = decodeRoadMemory(normalizeRoadMemory(JSON.parse(JSON.stringify(mem))), 77, 8, 8);
    expect(back.get("11,12")).toEqual({ rank: "secondary", h: true, v: true, born: 1, pave: 2 });
    expect(back.get("11,13").rank).toBe("plaza");
    expect(back.size).toBe(3);
    expect(normalizeRoadMemory(mem).works).toBe(3);
  });

  it("la fiche de la ville survit au rechargement (place, quartiers, ensembles, grille)", () => {
    const raw = { seed: 9, dx: 1.5, dy: -2, bx: 1, wonders: { pop1m: [7, 16] }, central: [-2, -1],
      quarters: { "1:0": { dx: -9, dy: -8, kind: "marchand", site: 1 } }, districts: { 0: [12, 4] }, maxN: 96 };
    const back = normalizeCityCore(JSON.parse(JSON.stringify(raw)));
    expect(back.central).toEqual([-2, -1]);
    expect(back.quarters["1:0"]).toEqual({ dx: -9, dy: -8, kind: "marchand", site: 1 });
    expect(back.districts["0"]).toEqual([12, 4]);
    expect(back.maxN).toBe(96);
    expect(back.wonders.pop1m).toEqual([7, 16]);
  });

  it("une sauvegarde abîmée retombe à null", () => {
    expect(normalizeRoadMemory({ seed: 1, cells: [1, 2, "x"] })).toBeNull();
    expect(normalizeRoadMemory({ seed: "a", cells: [] })).toBeNull();
    expect(normalizeRoadMemory([])).toBeNull();
  });
});
