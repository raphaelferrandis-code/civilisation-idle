"use strict";
// RECALCUL DE LA VILLE PLUS RAPIDE, VILLE IDENTIQUE (PERF-7, audit du 2026-10-05).
// Les optimisations du plan changent le CHEMIN, jamais la ville. La preuve globale
// est l'empreinte complète du layout (tuiles, rues, arbres, sol, mémoire) avant/après
// sur 26 états, saves réelles comprises : zéro écart (banc du compte rendu). Ce fichier
// garde les trois points où l'équivalence repose sur un argument qu'on pourrait
// casser sans le voir :
//   - la sortie anticipée d'organicLimit suppose que plan.reachMax BORNE reachFor ;
//   - computeRoadUsage (remontée en O(R)) doit rendre les mêmes comptes, dans le même
//     ordre, que la remontée par bâtiment d'avant (recopiée ici comme référence) ;
//   - computeTerrePleinSegments (grille typée) doit rendre les segments d'avant.
import { describe, it, expect } from "vitest";
import { computeCityLayout, computeRoadUsage, computeTerrePleinSegments } from "../layout.js";
import { generateCityPlan } from "../procedural/cityPlan.js";
import { state } from "../../core/state.js";
import { D } from "../../core/num.js";
import { eras } from "../../data/world.js";

const KEYS = Object.keys(state.buildings);
function city(e, l) {
  const pop = D(eras[e].at).mul(3);
  Object.assign(state, { cycles: 1, mapSeed: 0x51a7c0de, population: pop, knowledge: pop.mul(0.05), infrastructure: pop.mul(0.1), instability: 0, timeWear: 0 });
  KEYS.forEach((k) => { state.buildings[k] = k === "roads" ? 30 : l; });
  state.cityRoads = null; state.cityCore = null; state.cityMapSlots = {}; state.cityArchetype = null; state.cityPersonality = null; state.riverWP = null;
  return computeCityLayout(state);
}

// Référence : la remontée d'avant, un bâtiment à la fois.
function usageRef({ roadKey, tiles, coreX, coreY }) {
  const use = new Map();
  if (!roadKey || roadKey.size === 0) return { use, served: 0 };
  const O4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  let root = null, rootD = Infinity;
  for (const k of roadKey) {
    const [x, y] = k.split(",").map(Number);
    const d = (x - coreX) ** 2 + (y - coreY) ** 2;
    if (d < rootD) { rootD = d; root = k; }
  }
  const parent = new Map([[root, null]]), q = [root];
  for (let h = 0; h < q.length; h += 1) {
    const [x, y] = q[h].split(",").map(Number);
    for (const [dx, dy] of O4) { const nk = (x + dx) + "," + (y + dy); if (roadKey.has(nk) && !parent.has(nk)) { parent.set(nk, q[h]); q.push(nk); } }
  }
  let served = 0;
  for (const t of tiles) {
    const sx = t.spanX || t.size || 1, sy = t.spanY || t.size || 1;
    let door = null;
    for (let ax = 0; ax < sx && !door; ax += 1) for (let ay = 0; ay < sy && !door; ay += 1) {
      for (const [dx, dy] of O4) { const nk = (t.gx + ax + dx) + "," + (t.gy + ay + dy); if (parent.has(nk)) { door = nk; break; } }
    }
    if (!door) continue;
    served += 1;
    for (let cur = door; cur; cur = parent.get(cur)) use.set(cur, (use.get(cur) || 0) + 1);
  }
  return { use, served };
}

// Référence : les deux balayages d'avant, une clé texte par case.
function terrePleinRef(roadMap, N) {
  const get = (x, y) => roadMap.get(x + "," + y);
  const lane = (c) => !!c && c.roadSurface !== "bridge" && c.rank !== "plaza";
  const blvd = (c) => lane(c) && c.rank === "main";
  const segs = [];
  for (let x = 0; x < N - 1; x += 1) {
    let y0 = -1;
    for (let y = 0; y <= N; y += 1) {
      const ok = y < N && blvd(get(x, y)) && blvd(get(x + 1, y)) && !lane(get(x - 1, y)) && !lane(get(x + 2, y));
      if (ok && y0 < 0) y0 = y; else if (!ok && y0 >= 0) { if (y - y0 >= 3) segs.push({ axis: "v", x, y0, y1: y - 1 }); y0 = -1; }
    }
  }
  for (let y = 0; y < N - 1; y += 1) {
    let x0 = -1;
    for (let x = 0; x <= N; x += 1) {
      const ok = x < N && blvd(get(x, y)) && blvd(get(x, y + 1)) && !lane(get(x, y - 1)) && !lane(get(x, y + 2));
      if (ok && x0 < 0) x0 = x; else if (!ok && x0 >= 0) { if (x - x0 >= 3) segs.push({ axis: "h", y, x0, x1: x - 1 }); x0 = -1; }
    }
  }
  // Dédoublonnage : inchangé, recopié pour comparer la sortie entière.
  const segLen = (s) => (s.axis === "v" ? s.y1 - s.y0 : s.x1 - s.x0);
  const kept = [], dead = new Set();
  for (const { s, i } of segs.map((s, i) => ({ s, i })).sort((a, b) => segLen(b.s) - segLen(a.s) || a.i - b.i)) {
    let cur = s;
    for (const k of kept) {
      if (k.axis !== cur.axis || Math.abs(cur.axis === "v" ? cur.x - k.x : cur.y - k.y) !== 1) continue;
      const a0 = cur.axis === "v" ? cur.y0 : cur.x0, a1 = cur.axis === "v" ? cur.y1 : cur.x1;
      const lo = Math.max(a0, (k.axis === "v" ? k.y0 : k.x0) - 1), hi = Math.min(a1, (k.axis === "v" ? k.y1 : k.x1) + 1);
      if (lo > hi) continue;
      const nBefore = lo - a0, nAfter = a1 - hi;
      if (nBefore >= 3 && nBefore >= nAfter) { if (cur.axis === "v") cur.y1 = lo - 1; else cur.x1 = lo - 1; }
      else if (nAfter >= 3) { if (cur.axis === "v") cur.y0 = hi + 1; else cur.x0 = hi + 1; }
      else { cur = null; break; }
    }
    if (cur) kept.push(cur); else dead.add(i);
  }
  return segs.filter((s, i) => !dead.has(i));
}

describe("recalcul de la ville : mêmes résultats par un chemin plus court", () => {
  it("plan.reachMax borne reachFor à tous les angles, pour tous les archétypes", () => {
    const counts = { eraBand: 4, eraFrac: 0.5, engineQuarters: 0 };
    const personality = { chaos: 0.3, orderDelta: 0, plazaBias: 1, anchorBias: {} };
    let worst = 0, tight = 0;                       // plus grand rapport reachFor / reachMax
    for (let seed = 1; seed <= 60; seed += 1) {
      for (const forcedArchetype of [null, "linear", "scattered", "capital", "radial", "megalopolis"]) {
        const plan = generateCityPlan({ seed: seed * 7919, counts, personality, ageCfg: { order: 0.5, plazaSize: 0, archetypes: ["grid"] }, N: 120, cx: 60, cy: 60, forcedArchetype, forceAnyArchetype: true });
        const max = plan.reachMax(17.3);
        for (let a = 0; a < 720; a += 1) worst = Math.max(worst, plan.reachFor(17.3, (a / 720) * Math.PI * 2 - Math.PI) / max);
        tight += 1;
      }
    }
    expect(tight).toBe(360);
    expect(worst).toBeLessThanOrEqual(1 + 1e-12);
    expect(worst).toBeGreaterThan(0.9);             // la borne n'est pas lâche au point d'être inutile
  });

  it("computeRoadUsage rend les comptes d'avant, dans le même ordre", () => {
    const L = city(17, 30);
    const roadKey = new Set(L.roadSet);
    const args = { roadKey, tiles: L.tiles, coreX: Math.round(L.plan.core.x), coreY: Math.round(L.plan.core.y) };
    const ref = usageRef(args), got = computeRoadUsage(args);
    expect(ref.served).toBeGreaterThan(100);
    expect(got.served).toBe(ref.served);
    expect([...got.use]).toEqual([...ref.use]);
  });

  it("computeTerrePleinSegments rend les segments d'avant sur une vraie ville", () => {
    const L = city(27, 120);
    const ref = terrePleinRef(L.roadMap, L.gridN);
    expect(ref.length).toBeGreaterThan(0);
    expect(computeTerrePleinSegments(L.roadMap, L.gridN)).toEqual(ref);
  });
});
