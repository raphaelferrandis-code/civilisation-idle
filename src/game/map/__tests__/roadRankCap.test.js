// S1 — PLAFOND DES RANGS LARGES (docs/PLAN-RENDU-VILLE.md).
//
// `applyRoadWidenings` n'avait aucun plafond : `for (i < count) promote(runs[0])`,
// et `count` suit le nombre de routes achetées sans borne. Mesuré en jeu à HEAD,
// bande 3, en faisant varier `state.buildings.roads` :
//
//   routes achetées :      0        32       128
//   avenue + main :     13,6 %    20,0 %   46,2 %
//
// Un `main` fait 1,20 tuile avec ses trottoirs. À 46 % du réseau, deux artères
// parallèles distantes d'une cellule ne laissent plus un pixel de sol non minéral.
//
// Ce que le test verrouille : le plafond TIENT sur un grand réseau, il MORD (sans
// lui la part explose), et il n'étrangle PAS un hameau — une part n'a pas de sens
// sur une rue unique, et l'ancien test d'échelle (roadDesserte) doit continuer de
// promouvoir sa ligne de 12 cellules jusqu'à l'autoroute.
import { describe, it, expect, afterEach } from "vitest";
import { applyRoadWidenings, ROAD_RANKS } from "../layout.js";

const CAP0 = { ...ROAD_RANKS };
afterEach(() => { Object.assign(ROAD_RANKS, CAP0); });

// Grille de rues parallèles assez grande pour dépasser `capMinCells`, avec un
// usage décroissant pour que l'ordre de promotion soit déterministe.
// Lignes espacées de 3 : la règle anti-parallèle (parallelWideShare > 0,3) ne
// disqualifie donc personne d'entrée, c'est bien le PLAFOND qu'on mesure.
function makeGrid({ lines = 20, x0 = 4, x1 = 24, step = 3 } = {}) {
  const roads = [], roadKey = new Set(), roadMeta = new Map(), use = new Map();
  for (let i = 0; i < lines; i += 1) {
    const y = 6 + i * step;
    for (let x = x0; x <= x1; x += 1) {
      const k = x + "," + y;
      roads.push({ gx: x, gy: y });
      roadKey.add(k);
      roadMeta.set(k, { h: true, v: false, rank: "secondary" });
      use.set(k, 1000 - i * 10 - x);
    }
  }
  return { roads, roadKey, roadMeta, usage: { use, served: 200 } };
}

const wideShare = (L) => {
  let n = 0;
  for (const m of L.roadMeta.values()) if (m.rank === "avenue" || m.rank === "main") n += 1;
  return n / L.roadKey.size;
};

const run = (L, count) => applyRoadWidenings({
  roads: L.roads, roadKey: L.roadKey, roadMeta: L.roadMeta, usage: L.usage,
  riverSet: new Set(), count, cellFree: () => true,
});

describe("S1 — plafond des rangs larges", () => {
  it("le réseau de test dépasse bien capMinCells (sinon le plafond serait muet)", () => {
    const L = makeGrid();
    expect(L.roadKey.size).toBeGreaterThanOrEqual(ROAD_RANKS.capMinCells);
  });

  it("avec plafond : la part avenue+main reste sous wideCap, même en achetant sans fin", () => {
    const L = makeGrid();
    run(L, 500);                                   // bien plus que ce que la grille peut absorber
    expect(wideShare(L)).toBeLessThanOrEqual(ROAD_RANKS.wideCap + 0.02);
  });

  // ⚠ LE point du test. Sans ce contrôle négatif, un plafond qui ne serait jamais
  // atteint (parce qu'une AUTRE règle bloque tout) passerait pour efficace.
  it("mord : sans plafond, la même grille part au-delà du double", () => {
    const avec = makeGrid();
    run(avec, 500);
    const partAvec = wideShare(avec);

    ROAD_RANKS.wideCap = 1;                        // molette __roadRanks({wideCap:1})
    const sans = makeGrid();
    run(sans, 500);
    const partSans = wideShare(sans);

    expect(partSans).toBeGreaterThan(partAvec * 2);
    expect(partSans).toBeGreaterThan(0.5);
  });

  it("le plafond ferme l'échelle proprement : `next` finit à null, pas en boucle", () => {
    const L = makeGrid();
    const r = run(L, 500);
    expect(r.applied).toBeLessThan(500);           // il s'est arrêté de lui-même
    expect(r.next).toBeNull();
  });

  it("un hameau est EXEMPTÉ : sous capMinCells, une rue unique monte jusqu'à l'autoroute", () => {
    const roads = [], roadKey = new Set(), roadMeta = new Map(), use = new Map();
    for (let x = 4; x <= 15; x += 1) {
      const k = x + ",10";
      roads.push({ gx: x, gy: 10 });
      roadKey.add(k);
      roadMeta.set(k, { h: true, v: false, rank: "secondary" });
      use.set(k, 100 - x);
    }
    const L = { roads, roadKey, roadMeta, usage: { use, served: 20 } };
    expect(L.roadKey.size).toBeLessThan(ROAD_RANKS.capMinCells);
    const r = run(L, 3);
    expect(r.applied).toBe(3);                     // rue → avenue → boulevard → autoroute
    for (let x = 4; x <= 15; x += 1) expect(L.roadMeta.get(x + ",10").rank).toBe("main");
    expect(wideShare(L)).toBeGreaterThan(0.9);     // 100 % large, et c'est VOULU ici
  });

  it("le plafond se règle, et à 0 aucune promotion ne passe", () => {
    ROAD_RANKS.wideCap = 0;
    const L = makeGrid();
    const r = run(L, 50);
    expect(r.applied).toBe(0);
    expect(wideShare(L)).toBe(0);
  });
});
