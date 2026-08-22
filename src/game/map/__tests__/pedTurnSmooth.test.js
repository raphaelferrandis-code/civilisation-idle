import { describe, it, expect } from "vitest";

import { CM, ROAD_E, ROAD_N, ROAD_S, ROAD_W } from "../layout.js";
import { updateCitizens, cityMapWalkRoadKey } from "../agents.js";

// Lissage du décalage-trottoir AU VIRAGE. L'ancien lissage TEMPOREL (dt·6)
// encaissait tout le déport latéral quasi sur place : au carrefour, le bord
// change d'axe (±edge en X ↔ ±edge en Y) et le piéton « dashait » en travers
// de la route (retour Raph). Le lissage est désormais PAR DISTANCE PARCOURUE
// (~__pedTurn tuiles de marche) : on pilote le vrai updateCitizens sur un
// corridor en L et on vérifie que le POINT RENDU (x+lox, y+loy) n'avance
// jamais plus vite qu'un multiple serré de l'avancée monde réelle — un dash
// à l'ancienne le déplaçait ~10× plus vite au pic.

const TILE = 20;
const SPEED = 10;
const DT = 0.016;

function setupL() {
  CM.TILE = TILE;
  CM.cam = { x: 0, y: 0, zoom: 1 };
  CM.cw = 800; CM.ch = 600; CM.nightF = 0;
  const roadMap = new Map();
  const walkRoadSet = new Set();
  const walkRoadList = [];
  // Masque COMPLET partout (même geste que bridgePedEdge.test) : seule la
  // topologie de walkRoadSet compte pour la marche.
  const mask = ROAD_E | ROAD_W | ROAD_S | ROAD_N;
  const add = (gx, gy) => {
    walkRoadSet.add(cityMapWalkRoadKey(gx, gy));
    walkRoadList.push({ gx, gy });
    roadMap.set(gx + "," + gy, { gx, gy, mask, roadSurface: "road" });
  };
  // Branche verticale x=5 (y 8..14) + branche horizontale y=8 (x 5..14).
  for (let gy = 8; gy <= 14; gy += 1) add(5, gy);
  for (let gx = 6; gx <= 14; gx += 1) add(gx, 8);
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

// Fait marcher UN piéton du bas du L jusqu'après le coin ; renvoie le pire
// rapport (déplacement RENDU par frame) / (avancée MONDE par frame) et si le
// virage a eu lieu. checkStill : à l'arrêt, le rendu doit être immobile.
function runTurn(checkStill) {
  const p = {
    gx: 5, gy: 14,
    x: 5.5 * TILE, y: 14.5 * TILE,
    tx: 5.5 * TILE, ty: 14.5 * TILE,
    pauseT: 0, speed: SPEED, phase: 0.1, dir: 3, charType: 0, skinVariant: 0, fade: 1,
    goal: { gx: 14, gy: 8 }, social: false,
    thoughtType: null, thoughtTimer: 0,
  };
  CM.citizens = [p];
  let turned = false;
  let prevDir = p.dir;
  let prev = null;
  let maxRatio = 0;
  for (let step = 0; step < 8000; step += 1) {
    const before = { x: p.x, y: p.y };
    updateCitizens(DT);
    const moved = Math.hypot(p.x - before.x, p.y - before.y);
    const rx = p.x + (p.lox || 0), ry = p.y + (p.loy || 0);
    if (prev !== null && moved > 1e-9) {
      const ratio = Math.hypot(rx - prev.x, ry - prev.y) / moved;
      if (ratio > maxRatio) maxRatio = ratio;
    } else if (prev !== null && checkStill) {
      // À l'arrêt (pause, choix de cellule) : le point rendu ne bouge PLUS
      // du tout — l'ancien lissage temporel glissait latéralement sur place.
      expect(Math.hypot(rx - prev.x, ry - prev.y)).toBeLessThanOrEqual(1e-9);
    }
    prev = { x: rx, y: ry };
    if (p.dir !== prevDir && (p.dir <= 1) !== (prevDir <= 1)) turned = true;
    prevDir = p.dir;
    if (turned && p.gx >= 7 && p.gy === 8) break;   // le virage est passé et absorbé
  }
  return { turned, maxRatio };
}

describe("virage piéton : le rendu ne dashe pas", () => {
  it("au coin du L, le point rendu avance au plus ~2.5× l'avancée monde", () => {
    setupL();
    const r = runTurn(true);
    expect(r.turned, "le piéton doit avoir tourné au coin du L").toBe(true);
    // Marge : latéral (≤1 quand la transition sature) + longitudinal (1) < 2.5.
    expect(r.maxRatio).toBeLessThan(2.5);
    expect(r.maxRatio).toBeGreaterThan(0);
  });

  it("contrôle négatif : une convergence quasi instantanée re-crée le dash", () => {
    setupL();
    globalThis.window = globalThis.window || {};
    const prevTurn = globalThis.window.__pedTurn;
    globalThis.window.__pedTurn = 0.02;   // ≈ l'ancien lissage temporel : tout le déport sur ~0.4 px
    try {
      const r = runTurn(false);
      expect(r.turned).toBe(true);
      expect(r.maxRatio, "molette écrasée = dash attendu (le critère discrimine)").toBeGreaterThan(2.5);
    } finally {
      if (prevTurn === undefined) delete globalThis.window.__pedTurn;
      else globalThis.window.__pedTurn = prevTurn;
    }
  });
});
