import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { CM } from "../layout.js";
import { bridgeGeoms, layoutSpans, wetOnLine, bridgeBlocks } from "../iso/isoBridge.js";
import { bakeBridge, projLT, alphaAt } from "../iso/bridgeBake.js";
import { tradeStage, tradeSizeMul } from "../iso/isoFleet.js";

// LE PONT REFAIT À ZÉRO (2026-10-01, docs/PLAN-PONTS.md). Décisions de Raph que ces
// gardes tiennent :
//   · tablier plat, aussi large que la route ;
//   · piles permises, mais une PASSE libre au milieu, au moins la plus grosse coque
//     de l'ère ;
//   · un « bâtiment remarquable » : des portes aux deux bouts (bande 4, le pilote) ;
//   · le fleuve se voit à travers les arches (la face est ajourée), et le reflet
//     part de la ligne d'eau (sa source a les jours bouchés).

describe("répartition des arches", () => {
  it("la passe est au milieu, assez large, et c'est la plus grande arche", () => {
    const { open, piers } = layoutSpans(0, 200, 100, 56, 43, 10);
    const centre = open.find(([a, b]) => a <= 100 && b >= 100);
    expect(centre, "une arche au droit du milieu du fleuve").toBeTruthy();
    const wc = centre[1] - centre[0];
    expect(wc).toBeGreaterThanOrEqual(56);
    for (const [a, b] of open) expect(b - a).toBeLessThanOrEqual(wc + 1e-9);
    // Arches + piles pavent exactement l'eau de la face, sans chevauchement.
    const sum = open.reduce((s, [a, b]) => s + (b - a), 0) + piers.length * 10;
    expect(sum).toBeCloseTo(200, 6);
    expect(piers.length).toBe(open.length - 1);
    for (const [a, b] of open) expect(b - a).toBeGreaterThan(43 * 0.45);
  });

  it("un fleuve étroit se franchit d'une seule arche", () => {
    const { open, piers } = layoutSpans(0, 70, 35, 56, 43, 10);
    expect(open).toEqual([[0, 70]]);
    expect(piers).toEqual([]);
  });
});

describe("ligne d'eau", () => {
  it("wetOnLine rend les deux berges qui encadrent le milieu", () => {
    const edges = {
      left: [{ x: 0, y: 10 }, { x: 100, y: 10 }],
      right: [{ x: 0, y: 50 }, { x: 100, y: 50 }],
    };
    expect(wetOnLine(true, 40, edges, 30)).toEqual([10, 50]);
    expect(wetOnLine(true, 140, edges, 30)).toBe(null);
  });
});

// Un fleuve droit est-ouest de 6 tuiles (y ∈ [7, 13]), un pont de 2 voies en x = 5–6.
const T = 32;
function setup(band, ei) {
  CM.TILE = T;
  CM.cam = { x: 0, y: 0, zoom: 1 };
  CM.cw = 800; CM.ch = 600;
  const samples = [];
  for (let x = -5; x <= 20; x += 1) samples.push({ x, y: 10, hw: 3 });
  const cells = [];
  for (let gy = 7; gy <= 12; gy += 1) for (const gx of [5, 6]) cells.push({ gx, gy, rank: "main" });
  CM.layout = { counts: { eraBand: band, eraIndex: ei }, river: { present: true, samples } };
  CM.layoutRecomputeAt = (CM.layoutRecomputeAt || 0) + 1;
  CM.bridgeSpans = [{ vertical: true, gx0: 5, gx1: 6, gy0: 7, gy1: 12, cells, exits: [] }];
}
afterEach(() => { CM.layout = null; CM.bridgeSpans = null; });

describe("le modèle d'une travée (bande 4, le pilote)", () => {
  beforeEach(() => setup(4, 22));

  it("la face couvre l'eau du bord aval, les piles sont dans l'eau", () => {
    const m = bridgeGeoms()[0];
    expect(m.fA).toBeCloseTo(7 * T, 0);
    expect(m.fB).toBeCloseTo(13 * T, 0);
    for (const p of m.piers) {
      expect(p.l).toBeGreaterThan(m.fA);
      expect(p.l).toBeLessThan(m.fB);
    }
  });

  it("aussi large que la route : le tablier couvre les deux voies", () => {
    const m = bridgeGeoms()[0];
    expect(m.tDn - m.tUp).toBe(2 * T);
    expect(m.walk.half).toBeGreaterThan(T * 0.5);
    expect(m.walk.half).toBeLessThan(T);
  });

  it("un bâtiment remarquable : une porte à chaque bout, sur la terre ferme", () => {
    const m = bridgeGeoms()[0];
    expect(m.gates.length).toBe(2);
    expect(m.gates[0].l1).toBeLessThanOrEqual(m.fA);
    expect(m.gates[1].l0).toBeGreaterThanOrEqual(m.fB);
    // L'emprise extérieure inclut les piles des portes.
    const g = m.gates[0];
    expect(bridgeBlocks(g.tA + 2, (g.l0 + g.l1) / 2)).toBe(true);
  });

  it("la face est AJOURÉE sous les arches, le reflet a les jours bouchés", () => {
    const m = bridgeGeoms()[0];
    const B = bakeBridge(m, m.K, null);
    const a = m.arches.reduce((w, x) => (x.l1 - x.l0 > w.l1 - w.l0 ? x : w));
    const p = projLT(true, (a.l0 + a.l1) / 2, m.tDn, -m.hq / 2);
    const i = Math.floor(p.X - B.ox), j = Math.floor(p.Y - B.oy);
    expect(alphaAt(B.front, i, j), "on voit l'eau à travers l'arche").toBe(0);
    expect(alphaAt(B.refl, i, j), "la source du reflet est pleine").toBe(255);
    const d = projLT(true, (m.dA + m.dB) / 2, m.c, 0);
    expect(alphaAt(B.deck, Math.floor(d.X - B.ox), Math.floor(d.Y - B.oy))).toBe(255);
  });
});

describe("les dix ères ont chacune leur pont remarquable", () => {
  const ERAS = [[0, 2], [1, 6], [2, 12], [3, 17], [4, 22], [5, 26], [6, 31], [7, 40], [8, 80], [9, 160]];
  it("chaque ère se construit, se cuit, et a une ENTRÉE (porte ou monuments)", () => {
    for (const [band, ei] of ERAS) {
      setup(band, ei);
      const m = bridgeGeoms()[0];
      const B = bakeBridge(m, m.K, null);
      let opaque = 0;
      for (let i = 3; i < B.front.data.length; i += 4) if (B.front.data[i]) opaque += 1;
      expect(opaque, `bande ${band} : face peinte`).toBeGreaterThan(100);
      const entree = m.gates.length === 2 || m.monuments.length === 4;
      expect(entree, `bande ${band} : entrée remarquable`).toBe(true);
      expect(B.gates.length + B.monuments.length, `bande ${band}`).toBe(m.gates.length + m.monuments.length);
    }
  });
  it("le néon tient ses haubans sur deux mâts, les cosmiques leurs câbles sur deux tours", () => {
    setup(6, 31);
    expect(bridgeGeoms()[0].masts.length).toBe(2);
    for (const [band, ei] of [[7, 40], [8, 80], [9, 160]]) {
      setup(band, ei);
      const m = bridgeGeoms()[0];
      expect(m.towers.length, `bande ${band}`).toBe(2);
      expect(m.piers.length, `bande ${band} : suspendu, rien dans l'eau`).toBe(0);
    }
  });
});

describe("la passe suit la plus grosse coque de l'ère", () => {
  it("à toutes les bandes", () => {
    for (const [band, ei] of [[0, 2], [2, 12], [4, 22], [5, 26], [6, 31], [9, 40]]) {
      setup(band, ei);
      const m = bridgeGeoms()[0];
      const hull = 0.7 * tradeSizeMul(tradeStage(band, ei), band) * T;
      expect(m.passW, `bande ${band}`).toBeGreaterThan(hull);
      const centre = m.arches.find((x) => x.l0 <= (m.fA + m.fB) / 2 && x.l1 >= (m.fA + m.fB) / 2);
      if (m.piers.length) expect(centre.l1 - centre.l0, `bande ${band}`).toBeGreaterThanOrEqual(hull);
    }
  });
});

// Audit 2026-10-05, BUG-66 : le modèle était indexé sur l'HORODATAGE du layout, qui
// se recalcule toutes les 1,5 s en pleine croissance. Chaque recalcul refaisait les
// habitués (objets neufs) : la fiche d'un accoudé suivi, désigné par identité
// d'objet, se perdait — et le pont recuisait pour rien.
describe("le modèle suit la géométrie du pont, pas l'horodatage du layout", () => {
  it("un recalcul qui ne change ni les travées ni le fleuve garde les mêmes habitués", () => {
    setup(4, 22);
    const m0 = bridgeGeoms()[0];
    expect(m0.idlers.length).toBeGreaterThan(0);
    // Nouveau layout : objets neufs (travées, cellules, samples), mêmes valeurs.
    setup(4, 22);
    const m1 = bridgeGeoms()[0];
    expect(m1).toBe(m0);
    expect(m1.idlers[0]).toBe(m0.idlers[0]);
    expect(m1.key).toBe(m0.key);                    // la cuisson (clé m.key) est gardée
    expect(m1.sp).toBe(CM.bridgeSpans[0]);          // rebranché sur la travée du layout courant
  });

  it("une travée qui change, ou une autre ère, refait le modèle", () => {
    setup(4, 22);
    const m0 = bridgeGeoms()[0];
    setup(4, 22);
    CM.bridgeSpans[0].gy1 = 13;
    expect(bridgeGeoms()[0]).not.toBe(m0);
    setup(4, 23);
    const m2 = bridgeGeoms()[0];
    expect(m2).not.toBe(m0);
    setup(4, 23);
    CM.layout.river.samples[3].hw = 3.5;           // le fleuve bouge : la face aussi
    expect(bridgeGeoms()[0]).not.toBe(m2);
  });
});
