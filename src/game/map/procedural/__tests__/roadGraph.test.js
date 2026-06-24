import { describe, it, expect } from "vitest";

import { generateRoadsGraph, trimDemandlessRoads } from "../roadGraph.js";

const ARCHETYPES = ["scattered", "crossroads", "linear", "radial", "districts", "capital", "megalopolis"];

// organicLimit synthétique : un disque de rayon R autour du cœur. Suffit pour
// éprouver le builder en isolation (connexité, déterminisme, monotonie, étendue).
function diskLimit(core, R) {
  return (x, y, m = 0) => Math.hypot(x - core.x, y - core.y) <= R + m;
}

// Construit un jeu d'entrées déterministe pour un archétype et une bande d'ère.
// Les ancres sont CUMULATIVES (band 0..eraBand) comme dans cityPlan.buildAnchors,
// pour pouvoir tester la croissance monotone.
function makeInputs(archetype, eraBand, { R = 22, withRiver = false } = {}) {
  const N = 64;
  const core = { x: 32, y: 26 };
  const anchors = [];
  for (let band = 0; band <= eraBand; band += 1) {
    const n = band === 0 ? 1 : band <= 2 ? 2 : 3;
    for (let i = 0; i < n; i += 1) {
      const ang = (anchors.length * 1.7) % (Math.PI * 2);
      const dist = R * (0.4 + 0.12 * (anchors.length % 4));
      anchors.push({
        label: `${band}-${i}`, band,
        gx: Math.round(core.x + Math.cos(ang) * dist),
        gy: Math.round(core.y + Math.sin(ang) * dist),
        r: 3.5, strength: 1
      });
    }
  }
  const riverSet = new Set();
  if (withRiver) {
    // Bande d'eau horizontale au sud du cœur, dans la portée du disque.
    for (let x = 0; x < N; x += 1) for (let y = 40; y <= 42; y += 1) riverSet.add(x + "," + y);
  }
  return {
    plan: { archetype, core, reachBase: R, anchors, plazas: [], chaos: 0, order: 1 },
    seed: 0xC0FFEE,
    counts: { eraBand, infraRings: Math.min(4, eraBand), urbanTier: eraBand * 2 },
    ageCfg: { roadRanks: { main: eraBand >= 1, avenue: eraBand >= 2, secondary: true, path: true } },
    N,
    riverSet,
    bankSet: new Set(),
    riverBridgeX: core.x + 4,
    organicLimit: diskLimit(core, R)
  };
}

// Composantes orthogonalement connexes d'un ensemble de clés "gx,gy".
function components(roadKey) {
  const seen = new Set();
  const comps = [];
  for (const k of roadKey) {
    if (seen.has(k)) continue;
    const comp = new Set([k]);
    const stack = [k];
    seen.add(k);
    while (stack.length) {
      const cur = stack.pop();
      const c = cur.indexOf(",");
      const gx = +cur.slice(0, c), gy = +cur.slice(c + 1);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nk = (gx + dx) + "," + (gy + dy);
        if (roadKey.has(nk) && !seen.has(nk)) { seen.add(nk); comp.add(nk); stack.push(nk); }
      }
    }
    comps.push(comp);
  }
  return comps.sort((a, b) => b.size - a.size);
}

describe("roadGraph — réseau connexe par construction", () => {
  it("1. connexité : un seul réseau (sans fleuve), contenant le cœur", () => {
    for (const A of ARCHETYPES) {
      const out = generateRoadsGraph(makeInputs(A, 4));
      const comps = components(out.roadKey);
      expect(out.roadKey.size, `${A}: réseau non vide`).toBeGreaterThan(0);
      expect(comps.length, `${A}: une seule composante`).toBe(1);
      expect(comps[0].has("32,26"), `${A}: le cœur est sur le réseau`).toBe(true);
    }
  });

  it("2. pas de cellule flottante : chaque cellule a un voisin route", () => {
    for (const A of ARCHETYPES) {
      const out = generateRoadsGraph(makeInputs(A, 3));
      for (const k of out.roadKey) {
        const c = k.indexOf(",");
        const gx = +k.slice(0, c), gy = +k.slice(c + 1);
        const hasNeighbour = [[1, 0], [-1, 0], [0, 1], [0, -1]]
          .some(([dx, dy]) => out.roadKey.has((gx + dx) + "," + (gy + dy)));
        expect(hasNeighbour, `${A}: ${k} isolée`).toBe(true);
      }
    }
  });

  it("3. déterminisme : mêmes entrées → mêmes cellules", () => {
    for (const A of ARCHETYPES) {
      const a = generateRoadsGraph(makeInputs(A, 3));
      const b = generateRoadsGraph(makeInputs(A, 3));
      expect([...a.roadKey].sort(), A).toEqual([...b.roadKey].sort());
    }
  });

  it("4. monotonie : le réseau d'une bande ⊆ celui de la bande suivante", () => {
    for (const A of ARCHETYPES) {
      const small = generateRoadsGraph(makeInputs(A, 2));
      const big = generateRoadsGraph(makeInputs(A, 3));
      for (const k of small.roadKey) {
        expect(big.roadKey.has(k), `${A}: ${k} perdue en grandissant`).toBe(true);
      }
    }
  });

  it("5. eau : aucune cellule sur l'eau hors colonne de pont", () => {
    for (const A of ARCHETYPES) {
      const inp = makeInputs(A, 3, { withRiver: true });
      const out = generateRoadsGraph(inp);
      for (const k of out.roadKey) {
        if (!inp.riverSet.has(k)) continue;
        const x = +k.slice(0, k.indexOf(","));
        expect(out.bridgeCols.has(x), `${A}: route sur l'eau hors pont en ${k}`).toBe(true);
      }
    }
  });

  it("6. étendue : aucune route loin au-delà de la silhouette", () => {
    const R = 22;
    for (const A of ARCHETYPES) {
      const out = generateRoadsGraph(makeInputs(A, 4, { R }));
      for (const k of out.roadKey) {
        const c = k.indexOf(",");
        const d = Math.hypot(+k.slice(0, c) - 32, +k.slice(c + 1) - 26);
        expect(d, `${A}: ${k} hors silhouette (${d.toFixed(1)} > ${R + 6})`).toBeLessThanOrEqual(R + 6);
      }
    }
  });
});

// Graphe minimal à partir d'une liste de clés (toutes h+v, rang "path" sauf plazas).
function mkGraph(keys, plazas = []) {
  const roadKey = new Set(keys);
  const roadMeta = new Map();
  for (const k of keys) roadMeta.set(k, { h: true, v: true, rank: plazas.includes(k) ? "plaza" : "path" });
  const roads = keys.map((k) => { const c = k.indexOf(","); return { gx: +k.slice(0, c), gy: +k.slice(c + 1) }; });
  return { roads, roadKey, roadMeta };
}

describe("trimDemandlessRoads — émondage à la demande (PR3)", () => {
  it("émonde une antenne morte jusqu'à la desserte d'un bâtiment", () => {
    const keys = [];
    for (let y = 2; y <= 8; y += 1) keys.push("5," + y);     // épine verticale x=5
    const g = mkGraph(keys);
    trimDemandlessRoads({ ...g, demand: new Set(["6,7"]) }); // bâtiment en (6,7)
    expect(g.roadKey.has("5,2")).toBe(false);                // bout mort émondé
    expect(g.roadKey.has("5,5")).toBe(false);
    expect(g.roadKey.has("5,6")).toBe(false);                // ne borde le bâtiment qu'en DIAGONALE → émondé (plus de stub à 1 cellule)
    expect(g.roadKey.has("5,7")).toBe(true);                 // borde le bâtiment en ORTHOGONAL → conservé
    expect(g.roads.every((r) => g.roadKey.has(r.gx + "," + r.gy))).toBe(true); // roads compacté
  });

  it("ne touche pas un réseau entièrement desservi", () => {
    const keys = [];
    for (let x = 2; x <= 8; x += 1) keys.push(x + ",5");
    const g = mkGraph(keys);
    const demand = new Set(keys.map((k) => { const c = k.indexOf(","); return k.slice(0, c) + "," + (+k.slice(c + 1) - 1); }));
    const before = g.roadKey.size;
    trimDemandlessRoads({ ...g, demand });
    expect(g.roadKey.size).toBe(before);
  });

  it("n'isole jamais le réseau (retire seulement des feuilles)", () => {
    const keys = [];
    for (let y = 2; y <= 8; y += 1) keys.push("5," + y);
    const g = mkGraph(keys);
    trimDemandlessRoads({ ...g, demand: new Set(["6,7"]) });
    // Ce qui reste est connexe (les feuilles ne déconnectent jamais).
    const comps = components(g.roadKey);
    expect(comps.length).toBeLessThanOrEqual(1);
  });

  it("préserve une esplanade même sans bâtiment", () => {
    const withPlaza = mkGraph(["5,5", "5,6"], ["5,5"]);
    trimDemandlessRoads({ ...withPlaza, demand: new Set(["5,7"]) }); // (5,6) desservi
    expect(withPlaza.roadKey.has("5,5")).toBe(true);                  // plaza gardée

    const noPlaza = mkGraph(["5,5", "5,6"]);
    trimDemandlessRoads({ ...noPlaza, demand: new Set(["5,7"]) });
    expect(noPlaza.roadKey.has("5,5")).toBe(false);                   // sinon émondée
  });
});
