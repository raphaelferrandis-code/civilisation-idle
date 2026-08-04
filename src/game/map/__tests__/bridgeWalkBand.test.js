import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { CM, ROAD_E, ROAD_N, ROAD_S, ROAD_W } from "../layout.js";
import { updateCitizens, cityMapWalkRoadKey } from "../agents.js";
import { bridgeWalkBand, bridgeTune } from "../iso/isoBridge.js";

// ZONE DE PASSAGE du tablier (chantier 2026-08-04, retour Raph « ils sont tous
// sur les barrières du bas, il faut que ce soit une zone de passage pas juste
// une ligne »). Deux invariants, tous deux tenus par bridgeWalkBand :
//   · la ligne de marche vit dans la bande du tablier — plus d'offset ±0,09
//     tuile autour de l'axe de voie, qui plaquait tout le monde au même endroit ;
//   · deux habitants de MÊME cap et de phases différentes ne marchent PAS sur
//     la même ligne (étalement personnel stable) — c'est ce qui fait la foule.
// En Node, aucun PNG n'est décodé : bridgeWalkBand rend son repli (axe + demi-
// emprise). C'est volontaire — le repli doit lui aussi produire une BANDE, et
// c'est la seule branche testable sans canvas. Le centrage sur le platelage
// dessiné (pedC/pedHalf) se calibre à la capture, cf. isoBridge.js.

const TILE = 20;
const COL = 5;
const BRIDGE_YS = [5, 6, 7];

function setupBridge() {
  CM.TILE = TILE;
  CM.cam = { x: 0, y: 0, zoom: 1 };
  CM.cw = 800; CM.ch = 600; CM.nightF = 0;
  CM.iso = true;
  const roadMap = new Map();
  const walkRoadSet = new Set();
  const walkRoadList = [];
  const mask = ROAD_E | ROAD_W | ROAD_S | ROAD_N;
  for (let gy = 0; gy <= 12; gy += 1) {
    walkRoadSet.add(cityMapWalkRoadKey(COL, gy));
    walkRoadList.push({ gx: COL, gy });
    roadMap.set(COL + "," + gy, {
      gx: COL, gy, mask,
      roadSurface: BRIDGE_YS.includes(gy) ? "bridge" : "road",
    });
  }
  CM.layout = { counts: { eraBand: 1, eraIndex: 5 }, roadMap, river: { present: false } };
  CM.layoutRecomputeAt = (CM.layoutRecomputeAt || 0) + 1;
  CM.bridgeSpans = [{
    vertical: true, gx0: COL, gx1: COL, gy0: BRIDGE_YS[0], gy1: BRIDGE_YS[BRIDGE_YS.length - 1],
    cells: BRIDGE_YS.map((gy) => ({ gx: COL, gy })),
    exits: [{ gx: COL, gy: BRIDGE_YS[0] - 1 }, { gx: COL, gy: BRIDGE_YS[BRIDGE_YS.length - 1] + 1 }],
  }];
  CM.walkRoadSet = walkRoadSet;
  CM.walkRoadList = walkRoadList;
  CM.wonderWalkSet = null;
  CM.wonderGatherCells = null;
  CM.plazaRoadCells = null;
  CM.bankRoads = null;
  CM.globalBubbleCooldown = 999;
  CM.vehicles = [];
}

// Un pas de marche depuis (COL, gyStart), cap nord ou sud selon le but.
function stepFrom(gyStart, goalGy, phase) {
  const p = {
    gx: COL, gy: gyStart,
    x: (COL + 0.5) * TILE, y: (gyStart + 0.5) * TILE,
    tx: (COL + 0.5) * TILE, ty: (gyStart + 0.5) * TILE,
    pauseT: 0, speed: 10, phase, dir: goalGy < gyStart ? 3 : 2,
    charType: 0, skinVariant: 0, fade: 1,
    goal: { gx: COL, gy: goalGy }, social: false,
    thoughtType: null, thoughtTimer: 0,
  };
  CM.citizens = [p];
  updateCitizens(0.016);
  return p;
}

afterEach(() => { CM.layout = null; CM.bridgeSpans = null; CM.iso = false; });
beforeEach(setupBridge);

describe("zone de passage du tablier", () => {
  it("bridgeWalkBand publie une BANDE sur les cellules-pont, rien ailleurs", () => {
    const band = bridgeWalkBand((COL + 0.5) * TILE, (BRIDGE_YS[1] + 0.5) * TILE);
    expect(band).toBeTruthy();
    expect(band.vertical).toBe(true);
    // Repli : axe de voie, demi-emprise moins le demi-corps.
    expect(band.axis).toBeCloseTo((COL + 0.5) * TILE, 6);
    expect(band.half).toBeGreaterThan(0);
    expect(band.half).toBeLessThan(TILE * bridgeTune.deckHalf);
    // Loin du pont (12 tuiles au sud) : plus de bande.
    expect(bridgeWalkBand((COL + 0.5) * TILE, 40 * TILE)).toBe(null);
  });

  it("l'offset reste DANS la bande, et l'axe transverse est le bon", () => {
    const band = bridgeWalkBand((COL + 0.5) * TILE, (BRIDGE_YS[1] + 0.5) * TILE);
    for (let i = 0; i < 24; i += 1) {
      const p = stepFrom(BRIDGE_YS[1], i % 2 ? 0 : 12, i / 24);
      if (!BRIDGE_YS.includes(p.gy)) continue;
      const t = (p.gx + 0.5) * TILE + (p.tox || 0);
      expect(Math.abs(t - band.axis), `habitant ${i} hors bande`).toBeLessThanOrEqual(band.half + 1e-9);
      expect(p.toy, "span vertical : l'offset est transverse (tox), jamais longitudinal").toBe(0);
    }
  });

  it("deux phases différentes = deux lignes différentes (plus de file au cordeau)", () => {
    const vus = new Set();
    for (let i = 0; i < 16; i += 1) {
      const p = stepFrom(BRIDGE_YS[1], 0, i / 16);
      if (BRIDGE_YS.includes(p.gy)) vus.add(Math.round((p.tox || 0) * 100));
    }
    // L'ancien code rendait UNE seule valeur (±0,09 tuile) pour tout le monde.
    expect(vus.size).toBeGreaterThan(6);
  });

  it("les deux sens se séparent : cap nord en moyenne à l'aval du cap sud", () => {
    const moy = (goalGy) => {
      let s = 0, n = 0;
      for (let i = 0; i < 20; i += 1) {
        const p = stepFrom(BRIDGE_YS[1], goalGy, i / 20);
        if (!BRIDGE_YS.includes(p.gy)) continue;
        s += p.tox || 0; n += 1;
      }
      return s / n;
    };
    expect(moy(0)).toBeGreaterThan(moy(12));
  });

  it("__bridgePedEdge force encore l'ancienne ligne (repli d'A/B)", () => {
    globalThis.window = globalThis.window || {};
    const prev = globalThis.window.__bridgePedEdge;
    globalThis.window.__bridgePedEdge = 0;
    try {
      const p = stepFrom(BRIDGE_YS[1], 0, 0.3);
      expect(p.tox).toBe(0);
    } finally {
      if (prev === undefined) delete globalThis.window.__bridgePedEdge;
      else globalThis.window.__bridgePedEdge = prev;
    }
  });
});
