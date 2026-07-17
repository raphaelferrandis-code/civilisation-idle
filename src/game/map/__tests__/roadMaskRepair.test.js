import { describe, it, expect } from "vitest";

import { cmBuildRoadGraph } from "../layout.js";
import { generateRoadsGraph } from "../procedural/roadGraph.js";

// « Routes solitaires » (retour Raph 2026-07-16) : le réseau était connexe par
// CELLULES (stitchComponents) mais pas toujours par AXES MUTUELS (shouldConnect
// → mask) — ce que dessinent les rubans et qu'empruntent les agents. Scan avant
// correctif : 44 % des générations synthétiques avaient ≥1 fragment par masques
// (couture du stitcher, fins de lignes contre une perpendiculaire, atterrissages
// de pont). Ce test verrouille l'invariant réparé par repairMaskSeams
// (cmBuildRoadGraph) : le graphe FINAL forme UNE seule composante par masques.

const ARCHETYPES = ["scattered", "crossroads", "linear", "radial", "districts", "capital", "megalopolis"];

function diskLimit(core, R) {
  return (x, y, m = 0) => Math.hypot(x - core.x, y - core.y) <= R + m;
}

// Harnais jumeau de roadGraph.test.js, avec un GRAIN par seed (les ancres
// tournent) pour balayer des géométries variées.
function makeInputs(archetype, eraBand, seed, { R = 22, withRiver = false } = {}) {
  const N = 64;
  const core = { x: 32, y: 26 };
  const anchors = [];
  for (let band = 0; band <= eraBand; band += 1) {
    const n = band === 0 ? 1 : band <= 2 ? 2 : 3;
    for (let i = 0; i < n; i += 1) {
      const ang = (anchors.length * 1.7 + seed * 0.61) % (Math.PI * 2);
      const dist = R * (0.4 + 0.12 * (anchors.length % 4));
      anchors.push({
        label: `${band}-${i}`, band,
        gx: Math.round(core.x + Math.cos(ang) * dist),
        gy: Math.round(core.y + Math.sin(ang) * dist),
        r: 3.5, strength: 1,
      });
    }
  }
  const riverSet = new Set();
  if (withRiver) for (let x = 0; x < N; x += 1) for (let y = 40; y <= 42; y += 1) riverSet.add(x + "," + y);
  return {
    plan: { archetype, core, reachBase: R, anchors, plazas: [], chaos: 0, order: 1 },
    seed,
    counts: { eraBand, infraRings: Math.min(4, eraBand), urbanTier: eraBand * 2 },
    ageCfg: { roadRanks: { main: eraBand >= 1, avenue: eraBand >= 2, secondary: true, path: true } },
    N, riverSet, bankSet: new Set(), riverBridgeX: core.x + 4,
    organicLimit: diskLimit(core, R),
  };
}

// Composantes du graphe FINAL par arcs de MASQUES (la connexité que voit le
// joueur : bras des rubans + pas des agents).
function maskComponents(roadMap) {
  const seen = new Set();
  const comps = [];
  for (const k0 of roadMap.keys()) {
    if (seen.has(k0)) continue;
    const comp = [];
    const stack = [k0];
    seen.add(k0);
    while (stack.length) {
      const k = stack.pop();
      const r = roadMap.get(k);
      comp.push(k);
      // mask bits : N=1, E=2, S=4, W=8 (cf. layout.js ROAD_N/E/S/W)
      for (const [bit, dx, dy] of [[1, 0, -1], [2, 1, 0], [4, 0, 1], [8, -1, 0]]) {
        if (!(r.mask & bit)) continue;
        const nk = (r.gx + dx) + "," + (r.gy + dy);
        if (roadMap.has(nk) && !seen.has(nk)) { seen.add(nk); stack.push(nk); }
      }
    }
    comps.push(comp);
  }
  return comps.sort((a, b) => b.length - a.length);
}

describe("cmBuildRoadGraph — réparation des coutures de masques", () => {
  it("le graphe final = UNE composante par masques (terre), toutes recettes", () => {
    for (const A of ARCHETYPES) {
      for (const band of [1, 3, 5]) {
        for (let seed = 1; seed <= 5; seed += 1) {
          const inp = makeInputs(A, band, seed);
          const out = generateRoadsGraph(inp);
          const g = cmBuildRoadGraph(
            out.roads.map((r) => ({ ...r })), out.roadKey, out.roadMeta,
            null, inp.plan.core.x, inp.plan.core.y,
          );
          const comps = maskComponents(g.roadMap);
          expect(g.roadMap.size, `${A}/b${band}/s${seed}: réseau non vide`).toBeGreaterThan(0);
          expect(comps.length, `${A}/b${band}/s${seed}: fragments par masques`).toBe(1);
        }
      }
    }
  });

  it("avec fleuve : une seule composante par masques après validation des ponts", () => {
    for (const A of ARCHETYPES) {
      for (let seed = 1; seed <= 5; seed += 1) {
        const inp = makeInputs(A, 3, seed, { withRiver: true });
        const out = generateRoadsGraph(inp);
        const river = {
          isWater: (gx, gy) => inp.riverSet.has(gx + "," + gy),
          cells: inp.riverSet,
          banks: new Set(),
          bridge: { x: inp.riverBridgeX },
        };
        const g = cmBuildRoadGraph(
          out.roads.map((r) => ({ ...r })), out.roadKey, out.roadMeta,
          river, inp.plan.core.x, inp.plan.core.y, 2,
        );
        const comps = maskComponents(g.roadMap);
        expect(comps.length, `${A}/s${seed}: fragments par masques (fleuve)`).toBe(1);
      }
    }
  });

  it("les tampons de réparation restent hors de l'eau (sémantique de pont droit)", () => {
    for (let seed = 1; seed <= 5; seed += 1) {
      const inp = makeInputs("crossroads", 3, seed, { withRiver: true });
      const out = generateRoadsGraph(inp);
      const river = {
        isWater: (gx, gy) => inp.riverSet.has(gx + "," + gy),
        cells: inp.riverSet, banks: new Set(), bridge: { x: inp.riverBridgeX },
      };
      const g = cmBuildRoadGraph(
        out.roads.map((r) => ({ ...r })), out.roadKey, out.roadMeta,
        river, inp.plan.core.x, inp.plan.core.y, 2,
      );
      for (const r of g.roads) {
        if (r.roadSurface !== "bridge") continue;
        // Une travée ne porte jamais de bras E/O nés d'un tampon : v pur.
        const inner = g.roadMap.get(r.gx + "," + (r.gy - 1)) && g.roadMap.get(r.gx + "," + (r.gy + 1));
        if (inner && river.isWater(r.gx, r.gy - 1) && river.isWater(r.gx, r.gy + 1)) {
          expect(r.mask & (2 | 8), `travée ${r.gx},${r.gy} : bras latéral sur l'eau`).toBe(0);
        }
      }
    }
  });
});
