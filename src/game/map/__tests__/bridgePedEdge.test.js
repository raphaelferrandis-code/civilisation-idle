import { describe, it, expect } from "vitest";

import { CM, ROAD_E, ROAD_N, ROAD_S, ROAD_W } from "../layout.js";
import { updateCitizens, cityMapWalkRoadKey } from "../agents.js";

// Décalage-trottoir sur les PONTS. Le trottoir piéton (0.42 tuile) déborde du tablier :
// sur une cellule-pont, l'habitant marchait DANS L'EAU. Le fix resserre l'offset vers
// l'axe du tablier (0.16 tuile par défaut, molette __bridgePedEdge) sur les cellules
// roadSurface === "bridge" ET leurs cellules d'atterrissage (le lissage lox/loy converge
// ainsi avant d'engager la travée). On pilote le vrai updateCitizens sur un corridor
// vertical x=5 (y 0..12) dont les cellules y=5..7 sont un pont : après chaque pas, la
// cible d'offset p.tox doit être resserrée sur le pont/atterrissages, pleine ailleurs.

const TILE = 20;
const COL = 5;
const BRIDGE_YS = new Set([5, 6, 7]);          // cellules-pont
const NEAR_YS = new Set([4, 5, 6, 7, 8]);      // pont + atterrissages (± 1 cellule)
const FULL_EDGE = TILE * 0.42;                 // trottoir normal
const BRIDGE_EDGE = TILE * 0.16;               // resserré sur le tablier

function setupCorridor() {
  CM.TILE = TILE;
  CM.cam = { x: 0, y: 0, zoom: 1 };
  CM.cw = 800; CM.ch = 600; CM.nightF = 0;
  CM.iso = false;
  const roadMap = new Map();
  const walkRoadSet = new Set();
  const walkRoadList = [];
  const mask = ROAD_E | ROAD_W | ROAD_S | ROAD_N;
  for (let gy = 0; gy <= 12; gy += 1) {
    walkRoadSet.add(cityMapWalkRoadKey(COL, gy));
    walkRoadList.push({ gx: COL, gy });
    roadMap.set(COL + "," + gy, {
      gx: COL, gy, mask,
      roadSurface: BRIDGE_YS.has(gy) ? "bridge" : "road",
    });
  }
  CM.layout = { counts: { eraBand: 2, eraIndex: 5 }, roadMap };
  CM.walkRoadSet = walkRoadSet;
  CM.walkRoadList = walkRoadList;
  CM.wonderWalkSet = null;
  CM.wonderGatherCells = null;
  CM.plazaRoadCells = null;
  CM.bankRoads = null;
  CM.globalBubbleCooldown = 999;
  CM.vehicles = [];
}

// Un pas de marche : habitant posé au centre de (COL, gyStart), cap nord, but au bout du
// corridor → updateCitizens appelle citizenChooseNext (dist < 2.4) qui avance d'une cellule
// et recalcule la cible d'offset. Renvoie la cellule ATTEINTE et son |tox| cible.
function stepFrom(gyStart) {
  const p = {
    gx: COL, gy: gyStart,
    x: (COL + 0.5) * TILE, y: (gyStart + 0.5) * TILE,
    tx: (COL + 0.5) * TILE, ty: (gyStart + 0.5) * TILE,
    pauseT: 0, speed: 10, phase: 0.1, dir: 3, charType: 0, skinVariant: 0, fade: 1,
    goal: { gx: COL, gy: 0 }, social: false,
    thoughtType: null, thoughtTimer: 0,
  };
  CM.citizens = [p];
  updateCitizens(0.016);
  return { gy: p.gy, tox: Math.abs(p.tox || 0), toy: Math.abs(p.toy || 0) };
}

describe("décalage-trottoir piéton sur les ponts", () => {
  it("corridor vertical : l'offset est latéral (tox), pas longitudinal", () => {
    setupCorridor();
    for (let gy = 2; gy <= 11; gy += 1) {
      const r = stepFrom(gy);
      expect(r.toy).toBe(0);
    }
  });

  it("cellule-pont et atterrissages → offset resserré sur le tablier (≤ 0.16 tuile)", () => {
    setupCorridor();
    // citizenChooseNext a un peu d'aléa (re-tirage de but 5 %) : on échantillonne
    // plusieurs pas et on classe par cellule ATTEINTE — l'assertion tient quel que
    // soit le sens de marche (|tox| = edge dans les deux sens).
    for (let rep = 0; rep < 8; rep += 1) {
      for (let gy = 2; gy <= 11; gy += 1) {
        const r = stepFrom(gy);
        if (NEAR_YS.has(r.gy)) {
          expect(r.tox, `cellule ${r.gy} (pont/atterrissage)`).toBeLessThanOrEqual(BRIDGE_EDGE + 1e-9);
        } else {
          expect(r.tox, `cellule ${r.gy} (rue normale)`).toBeCloseTo(FULL_EDGE, 6);
        }
      }
    }
  });

  it("molette __bridgePedEdge : 0 = pile sur l'axe du pont", () => {
    setupCorridor();
    globalThis.window = globalThis.window || {};
    const prev = globalThis.window.__bridgePedEdge;
    globalThis.window.__bridgePedEdge = 0;
    try {
      // Pas depuis la cellule 7 (pont) : quel que soit le voisin atteint (6 ou 8,
      // pont ou atterrissage), l'offset doit être nul.
      const r = stepFrom(7);
      expect(NEAR_YS.has(r.gy)).toBe(true);
      expect(r.tox).toBe(0);
    } finally {
      if (prev === undefined) delete globalThis.window.__bridgePedEdge;
      else globalThis.window.__bridgePedEdge = prev;
    }
  });
});
