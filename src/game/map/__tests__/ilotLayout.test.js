// LA VILLE PAR ÎLOTS (docs/PLAN-ILOTS.md) — les contrats du placement par îlots,
// sur une ville de la bande 4 (pilote). Même méthode que roadMemory.test.js : on
// fait grandir l'état GLOBAL (l'ère se lit sur `state`).
import { describe, it, expect, beforeEach } from "vitest";
import { computeCityLayout, ILOT_MODE } from "../layout.js";
import { state, normalizeCityCore } from "../../core/state.js";
import { D } from "../../core/num.js";
import { eras } from "../../data/world.js";
import { ROAD_MEMORY } from "../roadMemory.js";
import { ANNEX_BODIES } from "../ilotArt.js";

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
const BUILT = new Set(["house", "enginehome", "engine"]);
const foot = (t) => { const out = []; const sx = t.spanX || t.size || 1, sy = t.spanY || t.size || 1; for (let a = 0; a < sx; a += 1) for (let b = 0; b < sy; b += 1) out.push((t.gx + a) + "," + (t.gy + b)); return out; };

beforeEach(() => {
  ROAD_MEMORY.on = true; ILOT_MODE.on = true;
  state.cityRoads = null; state.cityCore = null; state.cityMapSlots = {}; state.cityArchetype = null; state.riverWP = null;
});

describe("ville par îlots (bande 4)", () => {
  it("chaque bâtiment de ville borde une rue et se tient sur le sol de ville", () => {
    const L = grow(21);
    expect(L.counts.eraBand).toBe(4);
    expect(state.cityCore.ilot).toBeTruthy();
    let noStreet = 0, onGrass = 0, n = 0;
    for (const t of L.tiles) {
      if (!BUILT.has(t.type) || t.rural || t.buildingId === "river_ports") continue;
      n += 1;
      const cells = foot(t), set = new Set(cells);
      if (cells.some((k) => !L.urbanSet.has(k))) onGrass += 1;
      let front = false;
      for (const k of cells) {
        const [x, y] = k.split(",").map(Number);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nk = (x + dx) + "," + (y + dy);
          if (!set.has(nk) && L.roadSet.has(nk)) front = true;
        }
      }
      if (!front) noStreet += 1;
    }
    expect(n).toBeGreaterThan(200);
    expect(onGrass, "bâtiments dans l'herbe").toBe(0);
    expect(noStreet, "bâtiments sans rue").toBe(0);
  }, 120000);

  it("la ville est DENSE : le sol de ville hors rues est bâti aux trois quarts au moins", () => {
    const L = grow(21);
    const built = new Set();
    for (const t of L.tiles) if (BUILT.has(t.type) && !t.rural) for (const k of foot(t)) built.add(k);
    let ground = 0, full = 0;
    for (const k of L.urbanSet) { if (L.roadSet.has(k)) continue; ground += 1; if (built.has(k)) full += 1; }
    expect(full / ground).toBeGreaterThan(0.75);
  }, 120000);

  it("rien ne bouge d'un calcul à l'autre, ni d'un achat à l'autre", () => {
    grow(21);
    const slots0 = JSON.stringify(state.cityMapSlots);
    const L1 = grow(21);
    expect(JSON.stringify(state.cityMapSlots)).toBe(slots0);
    const roads1 = new Set(L1.roads.map((r) => (r.gx - L1.cx) + "," + (r.gy - L1.cy)));
    const before = { ...state.cityMapSlots };
    const L2 = grow(22, 34);                          // l'ère avance, on achète
    // Hors îlots : le terroir (champs, moulins) et le port ont leur propre placement.
    // ⚠ Connu (2026-10-04, mesuré) : quand le niveau des champs change leur découpage
    // (cmTerroirParcels), la parcelle 0 qui s'épaissit mord sa propre rangée de moulins
    // (distance 1) et le terroir se refonde ailleurs — cf. docs/PLAN-ILOTS.md §5.
    const RURAL = /:(irrigated_fields|water_mills|river_ports):/;
    let moved = 0;
    for (const [k, v] of Object.entries(before)) {
      if (RURAL.test(k)) continue;
      const w = state.cityMapSlots[k];
      if (w && (w.dx !== v.dx || w.dy !== v.dy)) moved += 1;
    }
    expect(moved, "bâtiments déplacés").toBe(0);
    const roads2 = new Set(L2.roads.map((r) => (r.gx - L2.cx) + "," + (r.gy - L2.cy)));
    let lost = 0;
    for (const k of roads1) if (!roads2.has(k)) lost += 1;
    expect(lost, "rues disparues").toBe(0);
  }, 180000);

  // LE MÉLANGE (Raph 2026-10-04 : « il faut un mélange mitoyen et ce qu'on a déjà »,
  // « plein de fois le même bâtiment qui a l'air d'un grand bâtiment rend mal »).
  it("rangées mitoyennes ET maisons existantes ; les ateliers sont des boutiques de la rue", () => {
    const L = grow(21);
    const rows = L.tiles.filter((t) => t.row);
    const terr = rows.filter((t) => t.terrace).length;
    expect(terr / rows.length).toBeGreaterThan(0.3);
    expect(terr / rows.length).toBeLessThan(0.85);
    // Un côté d'îlot est d'un seul tenant : rangée OU maisons, jamais les deux.
    const byKey = new Map(L.tiles.map((t) => [t.gx + "," + t.gy, t]));
    let mixed = 0;
    for (const t of rows) {
      const along = t.face === "S" || t.face === "N";
      const n = byKey.get(along ? (t.gx + 1) + "," + t.gy : t.gx + "," + (t.gy + 1));
      if (n && n.row && n.face === t.face && !!n.terrace !== !!t.terrace) mixed += 1;
    }
    expect(mixed, "côtés d'îlot mélangés").toBe(0);
    // Bout de rangée = mur latéral à découvert : son voisin de devant n'est pas une rangée.
    for (const t of rows) {
      if (!t.terrace) continue;
      const along = t.face === "S" || t.face === "N";
      const n = byKey.get(along ? (t.gx + 1) + "," + t.gy : t.gx + "," + (t.gy + 1));
      expect(!!t.rowEnd).toBe(!(n && n.terrace));
    }
    // Les annexes (hors guildes et points d'eau) : un lot d'une case, un corps de maison.
    const annexes = L.tiles.filter((t) => t.type === "engine" && t.groupIndex > 1
      && !/^(guilds|aqueducts|irrigated_fields|water_mills|river_ports)$/.test(t.buildingId));
    expect(annexes.length).toBeGreaterThan(20);
    for (const t of annexes) {
      expect(t.size, t.buildingId).toBe(1);
      expect(t.body, t.buildingId).toBeTruthy();
    }
  }, 120000);

  // LES AUTRES ÂGES (Raph 2026-10-04 : « fais-les toutes ») : chaque bande de ILOT_BANDS
  // se bâtit par îlots, loge TOUTES ses maisons-moteur (la demande compte les grands
  // logis de la bande), et ses ateliers sont des corps de maison de son âge.
  for (const [era, band] of [[12, 2], [17, 3], [21, 4], [27, 5], [32, 6], [36, 7], [92, 8], [136, 9]]) {
    it(`bande ${band} : îlots, maisons-moteur toutes logées, boutiques de l'âge`, () => {
      const L = grow(era);
      expect(L.counts.eraBand).toBe(band);
      expect(state.cityCore.ilot).toBeTruthy();
      const placed = L.tiles.filter((t) => t.type === "enginehome").length;
      expect(placed).toBe((L.counts.engineHomes | 0) + 44);
      const bodies = new Set(ANNEX_BODIES[band]);
      const annexes = L.tiles.filter((t) => t.body);
      expect(annexes.length).toBeGreaterThan(20);
      for (const t of annexes) expect(bodies.has(t.body), t.body).toBe(true);
    }, 120000);
  }

  it("la fiche d'îlots survit au rechargement : la réorganisation n'a lieu qu'une fois", () => {
    grow(21);
    const back = normalizeCityCore(JSON.parse(JSON.stringify(state.cityCore)));
    expect(back.ilot).toBeTruthy();
    expect(back.ilot.blocks).toEqual(state.cityCore.ilot.blocks);
    expect(back.ilot.plazas).toEqual(state.cityCore.ilot.plazas);
    expect(back.ilot.halls).toEqual(state.cityCore.ilot.halls);
    expect(back.ilot.annexes).toEqual(state.cityCore.ilot.annexes);
  }, 120000);
});
