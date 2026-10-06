// LES GRANDES PLACES (audit 2026-10-05, BUG-63 ; choix (c) de Raph) — toutes les places
// des villes par îlots faisaient UN îlot (4×4) : le forum n'avait jamais ses trois arbres
// ni ses massifs sur les axes. Le forum prend quatre îlots (14 × 9, de part et d'autre du
// decumanus, à l'ouest du cardo), le square naît sur 2×2 îlots (9 × 9).
// LE TEST D'EMPREINTE : une partie EXISTANTE (fiche v3) agrandit son forum une fois, et
// rien d'autre ne bouge — ni une rue, ni un îlot, ni une autre place, ni un bâtiment hors
// du forum (sauf les maisons sous l'angle d'une halle chassée du forum, qui reste au cœur).
// Même méthode que ilotLayout.test.js : on fait grandir l'état GLOBAL.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ILOT_MODE, ILOT_MEMORY_V, CM, cmRoadName } from "../layout.js";
import { GRANDES_PLACES, planIlots } from "../ilotLayout.js";
import { state } from "../../core/state.js";
import { ROAD_MEMORY } from "../roadMemory.js";
import { isoPlazaCompositions, PLAZA_TUNE } from "../iso/isoPlaza.js";
import { growCity as grow } from "../../../test/city.js";

const RANK = { path: 0, secondary: 1, avenue: 2, main: 3, plaza: 4 };
const GF = ["-1:-1", "-1:0", "-3:-1", "-3:0"];
const forumOf = (L) => L.plan.plazas.find((p) => p.kind === "centrale");
// Le rectangle 14 × 9 du grand forum, depuis son descriptif (centre = x0 + 7, y0 + 4).
const rectOf = (F) => ({ x0: F.gx - 7, x1: F.gx + 6, y0: F.gy - 4, y1: F.gy + 4 });
const inRect = (R, x, y) => x >= R.x0 && x <= R.x1 && y >= R.y0 && y <= R.y1;

beforeEach(() => {
  ROAD_MEMORY.on = true; ILOT_MODE.on = true;
  state.cityRoads = null; state.cityCore = null; state.cityMapSlots = {}; state.cityArchetype = null; state.cityPersonality = null; state.riverWP = null;
  state.wonders = [];
});
afterEach(() => { GRANDES_PLACES.forum = true; GRANDES_PLACES.square = true; PLAZA_TUNE.grand = true; PLAZA_TUNE.rev += 1; });

describe("les grandes places des villes par îlots", () => {
  it("une partie existante agrandit son forum UNE fois, et rien d'autre ne bouge (empreinte)", () => {
    // La partie d'avant : forum d'un îlot, fiche v3.
    GRANDES_PLACES.forum = false; GRANDES_PLACES.square = false;
    grow(17, 40);
    const L0 = grow(21, 40);
    expect(L0.counts.eraBand).toBe(4);
    expect(forumOf(L0).size).toBe(4);
    state.cityCore.ilot.v = 3;
    const slots0 = JSON.parse(JSON.stringify(state.cityMapSlots));
    const mem0 = JSON.parse(JSON.stringify(state.cityCore.ilot));
    const roads0 = new Map([...L0.roadMap].map(([k, c]) => [k, c.rank]));
    // La mise à jour.
    GRANDES_PLACES.forum = true; GRANDES_PLACES.square = true;
    const L = grow(21, 40);
    const F = forumOf(L), R = rectOf(F);
    expect(F.size).toBe(9);
    for (let y = R.y0; y <= R.y1; y += 1) for (let x = R.x0; x <= R.x1; x += 1) expect(L.roadMap.get(x + "," + y)?.rank, `${x},${y}`).toBe("plaza");
    expect(state.cityCore.ilot.v).toBe(ILOT_MEMORY_V);
    for (const k of GF) expect(state.cityCore.ilot.plazas[k]).toBe("centrale");
    // Les rues : aucune perdue hors du forum, aucun rang abaissé.
    const lost = [], lower = [];
    for (const [k, r] of roads0) {
      const [x, y] = k.split(",").map(Number);
      if (inRect(R, x, y)) continue;
      const c = L.roadMap.get(k);
      if (!c) lost.push(k); else if (RANK[c.rank] < RANK[r]) lower.push(k);
    }
    expect(lost, "rues perdues").toEqual([]);
    expect(lower, "rangs abaissés").toEqual([]);
    // Les îlots ouverts restent ouverts ; les autres places et les halles hors du forum
    // ne bougent pas.
    const mem = state.cityCore.ilot;
    expect(mem0.blocks.filter((k) => !mem.blocks.includes(k))).toEqual([]);
    for (const [k, v] of Object.entries(mem0.plazas)) if (!GF.includes(k)) expect(mem.plazas[k], k).toBe(v);
    for (const [k, v] of Object.entries(mem0.halls)) if (!GF.includes(v)) expect(mem.halls[k], k).toBe(v);
    // Les bâtiments : aucun perdu ; un bâtiment déplacé tenait le forum, ou c'est une
    // maison sous l'emprise d'une halle chassée du forum.
    const hallFoot = new Set();
    for (const [k, v] of Object.entries(mem0.halls)) {
      if (!GF.includes(v)) continue;
      const t = L.tiles.find((q) => q.key && q.key.includes(":" + k + ":"));
      expect(t, "halle relogée " + k).toBeTruthy();
      const s = t.size || 1;
      for (let a = 0; a < s; a += 1) for (let b = 0; b < s; b += 1) hallFoot.add((t.gx + a) + "," + (t.gy + b));
      // … au cœur : à moins de 20 cases du forum (une ville neuve la poserait là aussi).
      expect(Math.hypot(t.gx - F.gx, t.gy - F.gy), "halle " + k).toBeLessThan(20);
    }
    const gone = [], stray = [];
    let moved = 0;
    for (const [k, v] of Object.entries(slots0)) {
      const a = state.cityMapSlots[k];
      if (!a) { gone.push(k); continue; }
      if (a.dx === v.dx && a.dy === v.dy) continue;
      moved += 1;
      const x = v.dx + L.cx, y = v.dy + L.cy;
      if (!inRect(R, x, y) && !(/:dec_/.test(k) && hallFoot.has(x + "," + y))) stray.push(k);
    }
    expect(gone).toEqual([]);
    expect(moved, "relogés").toBeGreaterThan(0);
    expect(stray, "déplacés hors du forum").toEqual([]);
    // Une seule fois : le calcul suivant ne bouge plus rien.
    const slots = JSON.stringify(state.cityMapSlots);
    const L2 = grow(21, 40);
    expect(forumOf(L2)).toEqual(F);
    expect(JSON.stringify(state.cityMapSlots)).toBe(slots);
  });

  // La fiche ne garde que la SORTE de chaque îlot : deux grands squares voisins se
  // relisent en carrés de 2×2 îlots « jardin ». En ordre de chaînes (« 10:3 » avant
  // « 9:3 »), deux squares accolés en i = 9..10 et 11..12 se recollaient de travers au
  // rechargement (un carré 10..11 et quatre squares d'un îlot, rues déplacées).
  it("deux grands squares accolés se relisent tels qu'ils sont nés", () => {
    const keys = [];
    for (const i of [9, 10, 11, 12]) for (const j of [3, 4]) keys.push(i + ":" + j);
    const il = planIlots({
      N: 161, cx: 80, cy: 80, core: { x: 80, y: 60 }, bx: 80,
      isWet: () => false, isBank: () => false, isReserved: () => false,
      demand: { lots: 10, halls: [], annexes: [] },
      memory: { blocks: keys, plazas: Object.fromEntries(keys.map((k) => [k, "jardin"])) },
    });
    const sq = il.plazas.filter((p) => p.kind === "jardin").map((p) => (p.blocks || []).slice().sort().join(" "));
    expect(sq.sort()).toEqual(["10:3 10:4 9:3 9:4", "11:3 11:4 12:3 12:4"]);
  });

  it("ville neuve : grand forum garni, grand square, et une place d'un îlot inchangée au pixel", () => {
    CM.TILE = 32; CM.cw = 800; CM.ch = 600; CM.cam = { x: 0, y: 0, zoom: 1 };
    const L = grow(21, 40);
    CM.layout = L; CM.layoutRecomputeAt = (CM.layoutRecomputeAt | 0) + 1;
    const F = forumOf(L), R = rectOf(F);
    expect(F.size).toBe(9);
    // Le decumanus de l'ouest débouche sur le forum ; le cardo le longe, intact.
    const bx = Math.round(L.river.bridge.x), oy = Math.round(L.plan.core.y);
    expect(R.x1).toBe(bx - 1);
    expect(L.roadMap.get((R.x0 - 1) + "," + oy)?.rank).not.toBe("plaza");
    expect(L.roadMap.get(bx + "," + oy)?.rank).toBe("main");
    const sq = L.plan.plazas.find((p) => p.kind === "jardin" && p.size === 9);
    expect(sq, "un grand square").toBeTruthy();
    for (let y = sq.gy - 4; y <= sq.gy + 4; y += 1) for (let x = sq.gx - 4; x <= sq.gx + 4; x += 1) expect(L.roadMap.get(x + "," + y)?.rank).toBe("plaza");
    // UN nom par place jusqu'à son bord (infobulle) : au seul centre le plus proche, le
    // coin d'une grande place prenait le nom d'une place voisine.
    for (const P of [F, sq]) {
      const names = new Set(), x0 = P.gx - (P.w >> 1), y0 = P.gy - (P.h >> 1);
      for (let y = y0; y < y0 + P.h; y += 1) for (let x = x0; x < x0 + P.w; x += 1) names.add(cmRoadName(x, y));
      expect([...names], P.kind).toHaveLength(1);
    }
    // Le dessin prévu du forum (KIND_KITS antique) : trois arbres, les massifs sur les axes.
    const comps = isoPlazaCompositions(L, L.counts.eraBand);
    const cf = comps.find((c) => c.kind === "centrale");
    expect([cf.w, cf.h]).toEqual([14, 9]);
    expect(cf.trees).toBe(3);
    expect(cf.props.filter((p) => p.field && p.prop === "flowerbed")).toHaveLength(4);
    expect(comps.find((c) => c.kind === "jardin" && c.w === 9).trees).toBe(2);
    // Le kit déployé (PLAZA_TUNE.grand) ne touche pas une place d'un îlot.
    const small = (cs) => JSON.stringify(cs.filter((c) => c.w === 4 && c.h === 4).map((c) => c.props.map((p) => [p.prop, p.variant, p.wx, p.wy])));
    const withGrand = small(comps);
    PLAZA_TUNE.grand = false; PLAZA_TUNE.rev += 1;
    const asIs = isoPlazaCompositions(L, L.counts.eraBand);
    expect(small(asIs)).toBe(withGrand);
    expect(asIs.find((c) => c.kind === "centrale").props.filter((p) => p.prop === "bench").length)
      .toBeLessThan(cf.props.filter((p) => p.prop === "bench").length);
  });
});
