import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { CM, ROAD_E, ROAD_N, ROAD_S, ROAD_W } from "../layout.js";
import { bridgeGeoms, buryClip, bridgeTune } from "../iso/isoBridge.js";

// ENTERREMENT du pont sprité posé au niveau du sol (2026-08-22, retour Raph
// « je veux un pont plat, qui rejoigne les deux bords du fleuve »).
// Le dessin de la pierre porte un caisson + des arches SOUS son tablier : au-
// dessus de l'eau c'est le pont, sur la berge c'est enterré — sinon l'ouvrage se
// pose sur la rive comme une dalle, avec une MARCHE à chaque bout. Deux pièces :
//   · bridgeGeoms publie, par span, les tronçons SECS du bord aval (dryRuns) et
//     la position transverse de ce bord (tDn) ;
//   · buryClip ôte du rect de blit tout ce qui est sous le tablier sur ces
//     tronçons, en escalier 2:1 calé sur les pixels du sprite.
// En Node aucun PNG n'est décodé, mais la géométrie ne dépend que des SPECS :
// c'est la seule branche testable sans canvas, et c'est elle qui décide.

const TILE = 20;
const COL = 5;
const BRIDGE_YS = [5, 6, 7];

function setupBridge(eraBand) {
  CM.TILE = TILE;
  CM.cam = { x: 0, y: 0, zoom: 1 };
  CM.cw = 800; CM.ch = 600; CM.nightF = 0;
  CM.iso = true;
  const roadMap = new Map();
  const mask = ROAD_E | ROAD_W | ROAD_S | ROAD_N;
  for (let gy = 0; gy <= 12; gy += 1) {
    roadMap.set(COL + "," + gy, { gx: COL, gy, mask, roadSurface: BRIDGE_YS.includes(gy) ? "bridge" : "road" });
  }
  CM.layout = { counts: { eraBand, eraIndex: eraBand * 5 }, roadMap, river: { present: false } };
  CM.layoutRecomputeAt = (CM.layoutRecomputeAt || 0) + 1;
  CM.bridgeSpans = [{
    vertical: true, gx0: COL, gx1: COL, gy0: BRIDGE_YS[0], gy1: BRIDGE_YS[BRIDGE_YS.length - 1],
    cells: BRIDGE_YS.map((gy) => ({ gx: COL, gy })),
    exits: [{ gx: COL, gy: BRIDGE_YS[0] - 1 }, { gx: COL, gy: BRIDGE_YS[BRIDGE_YS.length - 1] + 1 }],
  }];
}

afterEach(() => { CM.layout = null; CM.bridgeSpans = null; CM.iso = false; });

describe("enterrement du pont de pierre sur la berge", () => {
  beforeEach(() => setupBridge(2));   // bande 2 = pierre (spriteKey + bury)

  it("publie un tronçon sec à CHAQUE tête de pont, et rien au milieu", () => {
    expect(bridgeTune.sprite).toBe(true);
    const g = bridgeGeoms()[0];
    expect(g.dryRuns).toHaveLength(2);
    const [ra, rb] = g.dryRuns;
    // Tête a : du débord d'about (avant a) jusqu'à la première eau.
    expect(ra[0]).toBeLessThan(g.a);
    expect(ra[1]).toBeGreaterThanOrEqual(g.a);
    expect(ra[1]).toBeLessThanOrEqual(g.wetA + TILE / 8 + 1e-9);
    // Tête b : de la dernière eau jusqu'au débord d'about (après b).
    expect(rb[0]).toBeGreaterThanOrEqual(g.wetB - TILE / 8 - 1e-9);
    expect(rb[0]).toBeLessThanOrEqual(g.b);
    expect(rb[1]).toBeGreaterThan(g.b);
    // Le milieu (mouillé) n'est PAS sec.
    const mid = (g.a + g.b) / 2;
    expect(ra[1]).toBeLessThan(mid);
    expect(rb[0]).toBeGreaterThan(mid);
  });

  it("mesure au BORD AVAL dessiné, pas à l'axe de voie", () => {
    const g = bridgeGeoms()[0];
    // bury > 0 : le bord aval est en aval de l'axe (t croissant).
    expect(g.tDn).toBeGreaterThan(g.c);
  });

  it("buryClip ôte un escalier 2:1 sous le tablier, par la règle evenodd", () => {
    const g = bridgeGeoms()[0];
    const spec = { footHi: [378, 23], footLo: [8, 208], sgn: -1, bury: 25 };
    const calls = [];
    const ctx = {
      save: () => calls.push(["save"]), restore: () => calls.push(["restore"]),
      beginPath: () => calls.push(["beginPath"]), closePath: () => calls.push(["closePath"]),
      rect: (...a) => calls.push(["rect", ...a]),
      moveTo: (x, y) => calls.push(["moveTo", x, y]), lineTo: (x, y) => calls.push(["lineTo", x, y]),
      clip: (rule) => calls.push(["clip", rule]),
    };
    const s = 1, dy = 0, h = 600, ex = 400, ax = 378;
    const on = buryClip(ctx, g, spec, s, 0, 800, dy, h, ex, ax);
    expect(on).toBe(true);
    expect(calls.find((c) => c[0] === "clip")).toEqual(["clip", "evenodd"]);
    expect(calls.find((c) => c[0] === "rect")).toEqual(["rect", 0, 0, 800, 600]);
    // Deux polygones (un par tronçon sec), fermés.
    expect(calls.filter((c) => c[0] === "closePath")).toHaveLength(2);
    // Le bord haut de chaque polygone (hors fond yBot) est un ESCALIER : pour
    // l'axe ne (x source décroît quand l croît), le tablier monte vers la
    // droite de l'écran → y non croissant, marches de 1 px source (= 1·s).
    const yBot = dy + h + 2;
    let poly = [];
    const polys = [];
    for (const c of calls) {
      if (c[0] === "moveTo") poly = [];
      if (c[0] === "moveTo" || c[0] === "lineTo") poly.push([c[1], c[2]]);
      if (c[0] === "closePath") polys.push(poly);
    }
    for (const p of polys) {
      const top = p.filter(([, y]) => y !== yBot);
      expect(top.length).toBeGreaterThan(2);
      for (let i = 1; i < top.length; i += 1) {
        expect(top[i][0]).toBeGreaterThanOrEqual(top[i - 1][0]);       // x croissant
        const d = top[i][1] - top[i - 1][1];
        expect(d === 0 || d === -s, `marche ${d}`).toBe(true);           // 0 ou une marche vers le haut
      }
      // Toute la découpe est SOUS la ligne d'axe du sprite : jamais au-dessus
      // du tablier (sinon on couperait le platelage lui-même).
      for (const [x, y] of top) {
        const sx = ax + (x - ex) / s;
        const ySol = spec.footHi[1] + spec.sgn * (sx - spec.footHi[0]) * 0.5;   // ligne d'axe SIGNÉE
        expect(y).toBeGreaterThanOrEqual(dy + (ySol + spec.bury - 1.01) * s);
        expect(y).toBeLessThanOrEqual(dy + (ySol + spec.bury + 1.01) * s);
      }
    }
  });

  it("sans tronçon sec (ou sans bury) : aucun clip, le sprite passe entier", () => {
    const g = bridgeGeoms()[0];
    const calls = [];
    const ctx = {
      save: () => calls.push("save"), restore: () => calls.push("restore"), beginPath() {}, closePath() {},
      rect() {}, moveTo() {}, lineTo() {}, clip: () => calls.push("clip"),
    };
    expect(buryClip(ctx, { ...g, dryRuns: [] }, { footHi: [378, 23], bury: 25 }, 1, 0, 800, 0, 600, 400, 378)).toBe(false);
    expect(buryClip(ctx, g, { footHi: [378, 23] }, 1, 0, 800, 0, 600, 400, 378)).toBe(false);
    // Une pièce ENTIÈREMENT hors des tronçons secs : save/restore équilibrés, pas de clip.
    expect(buryClip(ctx, g, { footHi: [378, 23], bury: 25 }, 1, -900, -800, 0, 600, -850, 378)).toBe(false);
    expect(calls.filter((c) => c === "clip")).toHaveLength(0);
    expect(calls.filter((c) => c === "save").length).toBe(calls.filter((c) => c === "restore").length);
  });
});

describe("le bois (dos d'âne, marches dessinées) n'est PAS enterré", () => {
  beforeEach(() => setupBridge(0));
  it("aucun tronçon sec publié pour un sprite sans bury", () => {
    const g = bridgeGeoms()[0];
    expect(g.dryRuns).toEqual([]);
  });
});
