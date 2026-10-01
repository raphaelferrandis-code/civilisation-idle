// LA PLAGE DU PORT EST UNE BANDE — et le port, un appontement.
//
// Retour Raph (2026-10-01, capture du port médiéval) : « améliorer le port et son
// ponton, ainsi que la plage, pour avoir une vraie plage et pas des morceaux d'herbe
// dedans ». L'ancienne grève (la couronne de cases qui touche l'eau, dans un cercle de
// 7 tuiles) laissait de l'herbe de trois façons ; ces tests gardent ce qui les ferme :
//   • les cases d'EAU de la bande sont du sable (le riverSet déborde le ruban peint) ;
//   • la profondeur est MÉTRIQUE, perpendiculaire au fleuve, et pleine sur la coupure ;
//   • une RAMPE l'amincit sous la pointe du quai, au lieu d'un arc de cercle ;
//   • la coupure du port est élargie de SON côté seulement (portGap) ;
//   • les exclusions restent la règle (route, bâti sauf le port).
// Et pour le ponton : rien sous l'eau (le reflet en dépend) et le rayon de vue touche
// bien le dessus, le flanc sud et le flanc est là où il faut.
import { describe, it, expect, beforeEach } from "vitest";

import { ensureQuayGate, quayWallTune } from "../quaysAndRiot.js";
import { beachZone, isBeachBankCell } from "../iso/isoBeachCells.js";
import { BEACH } from "../iso/isoGroundTiles.js";
import { pierPlan, castRay } from "../iso/isoPier.js";
import { CM } from "../layout.js";

// Un fleuve droit ouest → est, centre y = 30, demi-largeur 3 : le bord d'eau peint de la
// rive nord est en y = 27. Samples espacés d'1,5 cellule comme le layout.
const samples = () => Array.from({ length: 40 }, (_, i) => ({ x: i * 1.5, y: 30, hw: 3 }));
// Le port sur la rive NORD, emprise 4 × 5 qui mord l'eau (comme le layout le pose).
const PORT = { buildingId: "river_ports", type: "engine", gx: 30, gy: 25, spanX: 4, spanY: 5 };

describe("la grève du port", () => {
  let saved;
  beforeEach(() => {
    saved = { layout: CM.layout, at: CM.layoutRecomputeAt, gate: CM.quayGate, tune: { ...quayWallTune } };
    quayWallTune.full = true;
    quayWallTune.portGap = 2.5;
    CM.layout = { river: { present: true, samples: samples() }, roadSet: new Set(), tiles: [PORT] };
    CM.layoutRecomputeAt = "test-greve-" + Math.random();
    CM.quayGate = null;
    ensureQuayGate();
    return () => {
      CM.layout = saved.layout; CM.layoutRecomputeAt = saved.at; CM.quayGate = saved.gate;
      Object.assign(quayWallTune, saved.tune);
    };
  });

  it("couvre toute la profondeur, de l'eau jusqu'à BEACH.depth au-delà du bord", () => {
    const z = beachZone(CM.layout);
    // Au droit du port : bord en y = 27 ; centres 26,5 (0,5) et 25,5 (1,5) dedans,
    // 24,5 (2,5 > 2,2) dehors.
    expect(z.has("32,26")).toBe(true);
    expect(z.has("32,25")).toBe(true);
    expect(z.has("32,24")).toBe(false);
    // Les cases d'EAU de la bande en sont aussi : ce que le ruban n'en couvre pas est du sable.
    expect(z.has("32,27")).toBe(true);
    expect(z.has("32,28")).toBe(true);
    expect(BEACH.depth).toBeGreaterThan(1.5);
  });

  it("s'étend de portGap tuiles de part et d'autre, du côté du port seulement", () => {
    const g = CM.quayGate;
    const at = (x) => Math.round(x / 1.5);
    // Rive nord = « minus » (normale (−ty, tx) = (0, 1) : plus = sud).
    expect(g.drawMinus[at(27)]).toBe(0);                // 2,5 tuiles avant l'emprise
    expect(g.drawMinus[at(36)]).toBe(0);                // 2,5 tuiles après
    expect(g.drawPlus[at(27)]).toBe(1);                 // en face, le quai court toujours
    expect(g.drawPlus[at(31.5)]).toBe(0);               // sauf sur l'emprise même (d'avant)
    const z = beachZone(CM.layout);
    expect(z.has("27,26")).toBe(true);                  // la plage suit la coupure élargie
  });

  it("s'amincit en rampe sous la pointe du quai, puis s'arrête", () => {
    const z = beachZone(CM.layout);
    // Dernier sample coupé en x = 36 ; rampe sur 3 samples (37,5 / 39 / 40,5).
    expect(z.has("39,26")).toBe(true);                  // près de l'eau : encore du sable
    expect(z.has("39,25")).toBe(false);                 // plus profond : la rampe s'est retirée
    for (const k of z) expect(+k.split(",")[0]).toBeLessThan(43);   // et rien au-delà
  });

  it("garde ses exclusions : route oui, bâti non, sauf le port", () => {
    expect(isBeachBankCell(CM.layout, 32, 25)).toBe(true);        // emprise du port : du sable
    CM.layout.roadSet.add("33,25");
    expect(isBeachBankCell(CM.layout, 33, 25)).toBe(false);       // une rampe reste une rampe
  });
});

describe("le ponton au pixel", () => {
  it("n'a rien sous l'eau, et sa tête est au large du bord", () => {
    for (const stage of [0, 1, 2, 3]) {
      const p = pierPlan(stage, 3.5, stage === 3 ? 7 : 2);
      expect(p.reach).toBeGreaterThan(1);
      for (const b of p.boxes) expect(b.z0).toBeGreaterThanOrEqual(0);   // le miroir retourne z ≥ 0
      if (p.head) expect(p.head.a0).toBeGreaterThan(0);
    }
    // Pas de grue au campement (rondins) : le ponton y reste un platelage.
    expect(pierPlan(0, 3.5, 1).boxes.some((b) => b.part === "crane")).toBe(false);
  });

  it("le rayon de vue lit dessus, flanc sud et flanc est", () => {
    // Une boîte de 32 × 32 px au sol, haute de 8 : x ∈ [0, 32], y ∈ [0, 32], z ∈ [0, 8].
    const B = [{ part: "deck", X0: 0, X1: 32, Y0: 0, Y1: 32, Z0: 0, Z1: 8 }];
    // Centre du dessus : monde (16, 16, 8) → art (0, 16 − 8).
    expect(castRay(B, 0.5, 8.5, false).face).toBe(2);
    // Sous le coin sud (monde (0, 32)) : art x = −32 ; juste sous l'arête haute → flanc sud.
    expect(castRay(B, -30.5, 8 + 3.5, false).face).toBe(1);
    // Sous le coin est (monde (32, 0)) : art x = +32 → flanc est.
    expect(castRay(B, 30.5, 8 + 3.5, false).face).toBe(0);
    // Loin de tout : rien.
    expect(castRay(B, 200, 200, false)).toBe(null);
    // Le miroir voit la boîte SOUS la ligne d'eau, jamais au-dessus. Sous le coin sud,
    // 4 px sous l'eau (monde (0, 32, −4) → art (−32, 20)) : la vraie boîte n'y est pas,
    // son reflet si — par son flanc sud. Au-dessus du dessus : ni l'une ni l'autre.
    expect(castRay(B, -30.5, 20.5, false)).toBe(null);
    expect(castRay(B, -30.5, 20.5, true).face).toBe(1);
    expect(castRay(B, 0.5, -10.5, false)).toBe(null);
    expect(castRay(B, 0.5, -10.5, true)).toBe(null);
  });
});
