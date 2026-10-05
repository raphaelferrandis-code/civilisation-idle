// LA VILLE PAR ÎLOTS (docs/PLAN-ILOTS.md) — les contrats du placement par îlots,
// sur une ville de la bande 4 (pilote). Même méthode que roadMemory.test.js : on
// fait grandir l'état GLOBAL (l'ère se lit sur `state`).
import { describe, it, expect, beforeEach } from "vitest";
import { ILOT_MODE, ILOT_MEMORY_V, ENGINE_HOME_LOOKAHEAD } from "../layout.js";
import { state, normalizeCityCore } from "../../core/state.js";
import { ROAD_MEMORY, decodeRoadMemory } from "../roadMemory.js";
import { ANNEX_BODIES } from "../ilotArt.js";
import { gridOf, ILOT_DEFAULTS } from "../procedural/blockCity.js";
import { growCity as grow } from "../../../test/city.js";

const BUILT = new Set(["house", "enginehome", "engine"]);
const foot = (t) => { const out = []; const sx = t.spanX || t.size || 1, sy = t.spanY || t.size || 1; for (let a = 0; a < sx; a += 1) for (let b = 0; b < sy; b += 1) out.push((t.gx + a) + "," + (t.gy + b)); return out; };
// Rues MÉMORISÉES tombées dans l'intérieur d'un îlot ouvert (hors places, hors 2e voie
// du cardo) — même grille que ilotLayout.js (îlots longs le long des axes).
const odd = (n) => ((n % 2) + 2) % 2 === 1;
const ilotMerge = (i, j) => {
  const onDecu = j === -1 || j === 0, onCardo = i === -1 || i === 0;
  if (onDecu && !onCardo && odd(i)) return "x";
  if (onCardo && !onDecu && odd(j)) return "y";
  return null;
};
function memRoadsInIlots(L) {
  const mem = state.cityCore.ilot, bx = Math.round(L.river.bridge.x);
  const grid = gridOf({ ox: bx, oy: Math.round(L.plan.core.y), pitch: ILOT_DEFAULTS.pitch, merge: ilotMerge });
  const roads = decodeRoadMemory(state.cityRoads, state.mapSeed, L.cx, L.cy) || new Map();
  let n = 0;
  for (const k of mem.blocks) {
    if (mem.plazas && mem.plazas[k]) continue;
    const [i, j] = k.split(":").map(Number);
    const it = grid.interior(i, j);
    for (let y = it.y0; y <= it.y1; y += 1) for (let x = it.x0; x <= it.x1; x += 1) if (x !== bx + 1 && roads.has(x + "," + y)) n += 1;
  }
  return n;
}

beforeEach(() => {
  ROAD_MEMORY.on = true; ILOT_MODE.on = true;
  state.cityRoads = null; state.cityCore = null; state.cityMapSlots = {}; state.cityArchetype = null; state.cityPersonality = null; state.riverWP = null;
});

describe("ville par îlots (bande 4)", () => {
  // Les comptes de maisons-moteur ci-dessous lisent la constante au lieu de recopier
  // 44 (audit 2026-10-05, TEST-12). Le 44 codé en dur était aussi, sans le dire, le
  // fil-piège de la décision de Raph : ne JAMAIS réduire ENGINE_HOME_LOOKAHEAD. Le
  // plan ne se recalcule qu'aux ères et aux paliers de moteurs : ce sont ces
  // maisons-moteur posées d'avance qui tiennent « 1 achat = 1 bâtiment » entre deux
  // recalculs. Ce plancher est désormais gardé en clair.
  it("ENGINE_HOME_LOOKAHEAD n'est jamais réduit sous 44 (décision de Raph)", () => {
    expect(ENGINE_HOME_LOOKAHEAD).toBeGreaterThanOrEqual(44);
  });

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
  });

  it("la ville est DENSE : le sol de ville hors rues est bâti aux trois quarts au moins", () => {
    const L = grow(21);
    const built = new Set();
    for (const t of L.tiles) if (BUILT.has(t.type) && !t.rural) for (const k of foot(t)) built.add(k);
    let ground = 0, full = 0;
    for (const k of L.urbanSet) { if (L.roadSet.has(k)) continue; ground += 1; if (built.has(k)) full += 1; }
    expect(full / ground).toBeGreaterThan(0.75);
  });

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
    // La grille grandit entre les deux (N 164 → 170) : le fleuve, FIGÉ en cases depuis le
    // 2026-10-04, ne bouge plus — une rue de quai ne bascule plus en berge.
    let lost = 0;
    for (const k of roads1) if (!roads2.has(k)) lost += 1;
    expect(lost, "rues disparues").toBe(0);
  });

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
    // Un côté, UN modèle (Raph 2026-10-04 : « les toits et bâtiments ne se suivent pas ») :
    // deux unités voisines d'une même rangée tirent le même modèle.
    let split = 0;
    for (const t of rows) {
      if (!t.terrace) continue;
      const along = t.face === "S" || t.face === "N";
      const n = byKey.get(along ? (t.gx + 1) + "," + t.gy : t.gx + "," + (t.gy + 1));
      if (n && n.terrace && n.face === t.face && n.rowSide !== t.rowSide) split += 1;
    }
    expect(split, "rangées à deux modèles").toBe(0);
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
  });

  // LES AUTRES ÂGES (Raph 2026-10-04 : « fais-les toutes ») : chaque bande de ILOT_BANDS
  // se bâtit par îlots, loge TOUTES ses maisons-moteur (la demande compte les grands
  // logis de la bande), et ses ateliers sont des corps de maison de son âge.
  for (const [era, band] of [[12, 2], [17, 3], [21, 4], [27, 5], [32, 6], [36, 7], [92, 8], [136, 9]]) {
    it(`bande ${band} : îlots, maisons-moteur toutes logées, boutiques de l'âge`, () => {
      const L = grow(era);
      expect(L.counts.eraBand).toBe(band);
      expect(state.cityCore.ilot).toBeTruthy();
      const placed = L.tiles.filter((t) => t.type === "enginehome").length;
      expect(placed).toBe((L.counts.engineHomes | 0) + ENGINE_HOME_LOOKAHEAD);
      const bodies = new Set(ANNEX_BODIES[band]);
      const annexes = L.tiles.filter((t) => t.body);
      expect(annexes.length).toBeGreaterThan(20);
      for (const t of annexes) expect(bodies.has(t.body), t.body).toBe(true);
    });
  }

  // LES ÎLOTS RESPIRENT (Raph 2026-10-04 : « ça ne respire pas beaucoup, tous les îlots
  // sont complets » ; dose « forte » choisie sur planche).
  it("des lots de bord restent en jardin — jamais bâtis, et toutes les maisons logées", () => {
    const L = grow(21);
    const air = new Set((L.ilotAir || []).map((q) => q.gx + "," + q.gy));
    const lotsBord = L.tiles.filter((t) => t.row).length;
    expect(air.size / (air.size + lotsBord)).toBeGreaterThan(0.12);
    expect(air.size / (air.size + lotsBord)).toBeLessThan(0.35);
    let surJardin = 0;
    for (const t of L.tiles) for (const k of foot(t)) if (air.has(k)) surJardin += 1;
    expect(surJardin, "bâtiments sur un lot-jardin").toBe(0);
    for (const k of air) expect(L.urbanSet.has(k), "un jardin est de l'herbe").toBe(false);
    expect(L.tiles.filter((t) => t.type === "enginehome").length).toBe((L.counts.engineHomes | 0) + ENGINE_HOME_LOOKAHEAD);
  });

  it("une fiche d'îlots v1 (îlots pleins) se replace UNE fois : les maisons seulement", () => {
    grow(21);
    state.cityCore.ilot.v = 1;                          // une partie d'avant la respiration
    const RURAL = /:(irrigated_fields|water_mills|river_ports):/;
    const engines0 = Object.entries(state.cityMapSlots).filter(([k]) => !k.includes(":dec_") && !RURAL.test(k));
    const L = grow(21);
    expect(state.cityCore.ilot.v).toBe(ILOT_MEMORY_V);
    expect((L.ilotAir || []).length).toBeGreaterThan(20);
    let moved = 0;
    for (const [k, v] of engines0) { const w = state.cityMapSlots[k]; if (w && (w.dx !== v.dx || w.dy !== v.dy)) moved += 1; }
    expect(moved, "ateliers et halles déplacés").toBe(0);
    const slots = JSON.stringify(state.cityMapSlots);
    grow(21);
    expect(JSON.stringify(state.cityMapSlots), "puis plus rien ne bouge").toBe(slots);
  });

  // LA RÉORGANISATION EFFACE LE HAMEAU (audit 2026-10-05, BUG-13) : la mémoire des rues,
  // décodée avant la réorganisation, réinjectait les sentiers du hameau dans le tracé —
  // 302 cases de rue en plein îlot, 49 maisons-moteur posées sur 101 en bande 2.
  it("passage en îlots (bande 1 → 2) : aucune rue du hameau dans les îlots, maisons-moteur toutes logées", () => {
    grow(8, 10);
    expect(state.cityCore.ilot, "le hameau n'est pas encore en îlots").toBeFalsy();
    const L = grow(10, 12);
    expect(L.counts.eraBand).toBe(2);
    expect(memRoadsInIlots(L), "rues mémorisées dans les îlots").toBe(0);
    expect(L.tiles.filter((t) => t.type === "enginehome").length).toBe((L.counts.engineHomes | 0) + ENGINE_HOME_LOOKAHEAD);
  });

  it("une fiche v2 qui a gardé les sentiers du hameau se répare UNE fois : rues effacées, aucun bâtiment ne bouge", () => {
    grow(8, 10);
    const hameau = state.cityRoads.cells.slice();
    grow(10, 12);
    const slots0 = JSON.stringify(state.cityMapSlots);
    // Une partie passée en îlots avec le défaut : sentiers du hameau en mémoire, fiche v2.
    state.cityRoads.cells = state.cityRoads.cells.concat(hameau);
    state.cityCore.ilot.v = 2;
    const L = grow(10, 12);
    expect(state.cityCore.ilot.v).toBe(ILOT_MEMORY_V);
    expect(memRoadsInIlots(L), "rues mémorisées dans les îlots").toBe(0);
    expect(JSON.stringify(state.cityMapSlots), "bâtiments déplacés").toBe(slots0);
    expect(L.tiles.filter((t) => t.type === "enginehome").length).toBe((L.counts.engineHomes | 0) + ENGINE_HOME_LOOKAHEAD);
    const roads = JSON.stringify(state.cityRoads.cells);
    grow(10, 12);
    expect(JSON.stringify(state.cityRoads.cells), "puis les rues ne bougent plus").toBe(roads);
  });

  it("une fiche v2 saine passe en v3 sans que rien ne bouge, rues comprises", () => {
    grow(8, 10);
    grow(10, 12);
    grow(10, 12);
    const roads0 = JSON.stringify(state.cityRoads.cells), slots0 = JSON.stringify(state.cityMapSlots);
    state.cityCore.ilot.v = 2;
    grow(10, 12);
    expect(state.cityCore.ilot.v).toBe(ILOT_MEMORY_V);
    expect(JSON.stringify(state.cityRoads.cells), "rues retracées").toBe(roads0);
    expect(JSON.stringify(state.cityMapSlots), "bâtiments déplacés").toBe(slots0);
  });

  it("la fiche d'îlots survit au rechargement : la réorganisation n'a lieu qu'une fois", () => {
    grow(21);
    const back = normalizeCityCore(JSON.parse(JSON.stringify(state.cityCore)));
    expect(back.ilot).toBeTruthy();
    expect(back.ilot.v, "la version de la fiche survit (sinon replacement à chaque chargement)").toBe(ILOT_MEMORY_V);
    expect(back.ilot.blocks).toEqual(state.cityCore.ilot.blocks);
    expect(back.ilot.plazas).toEqual(state.cityCore.ilot.plazas);
    expect(back.ilot.halls).toEqual(state.cityCore.ilot.halls);
    expect(back.ilot.annexes).toEqual(state.cityCore.ilot.annexes);
  });
});
