import { describe, it, expect } from "vitest";

import { cmBuildRoadGraph } from "../layout.js";
import { generateRoadsGraph } from "../procedural/roadGraph.js";
import { makeRoadInputs } from "../../../test/roads.js";

// « Routes solitaires » (retour Raph 2026-07-16) : le réseau était connexe par
// CELLULES (stitchComponents) mais pas toujours par AXES MUTUELS (shouldConnect
// → mask) — ce que dessinent les rubans et qu'empruntent les agents. Scan avant
// correctif : 44 % des générations synthétiques avaient ≥1 fragment par masques
// (couture du stitcher, fins de lignes contre une perpendiculaire, atterrissages
// de pont). Ce test verrouille l'invariant réparé par repairMaskSeams
// (cmBuildRoadGraph) : le graphe FINAL forme UNE seule composante par masques.

// La seule recette du générateur (audit 2026-10-05, MORT-4 : les recettes
// géométriques sont parties avec l'ancien placement).
const ARCHETYPES = ["scattered"];

// Harnais partagé avec roadGraph.test.js, avec un GRAIN par seed (les ancres
// tournent) pour balayer des géométries variées.
const makeInputs = makeRoadInputs;

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

// 105 générations complètes : le délai par défaut de vitest (5 s) était frôlé sous
// contention de suite. Garde d'invariant, pas de performance : le délai global de
// vite.config.js (relevé pour la CI) suffit (audit 2026-10-05, TEST-14).

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
      const inp = makeInputs("scattered", 3, seed, { withRiver: true });
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
