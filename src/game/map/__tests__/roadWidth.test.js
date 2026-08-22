"use strict";
// Verrouille la SOURCE UNIQUE des largeurs de chaussée (layout.roadWidthFor).
// Avant la factorisation, la même table était copiée 3 fois (getRoadVisualStyle,
// roadBodyWidth, vehicleLaneOffset) et devait être maintenue à la main « en
// lockstep ». Ce test fige les valeurs par rang/ère pour que toute dérive future
// soit détectée.
// ⚠ Deux de ces trois copies sont parties avec le rendu top-down le 2026-08-23 :
// `getRoadVisualStyle` et `roadBodyWidth` n'existent plus. `roadWidthFor` ne survit
// donc plus que par `vehicleLaneOffset` (agents.js) — ce test devient un garde-fou
// de valeurs plus qu'un garde-fou de duplication, mais les valeurs comptent toujours.

import { describe, it, expect } from "vitest";
import { roadWidthFor } from "../layout.js";

describe("roadWidthFor — largeur de chaussée par rang/ère", () => {
  it("renvoie les valeurs golden par rang aux 3 paliers d'ère", () => {
    // [eraIndex, path, secondary, avenue, main]
    const golden = [
      [0, 0.13, 0.24, 0.38, 0.5],   // pré-moderne (< 7)
      [7, 0.16, 0.28, 0.48, 0.66],  // moderne (>= 7)
      [12, 0.16, 0.32, 0.58, 0.84], // contemporain (>= 12)
    ];
    for (const [ei, path, secondary, avenue, main] of golden) {
      expect(roadWidthFor("path", ei), `path@${ei}`).toBe(path);
      expect(roadWidthFor("secondary", ei), `secondary@${ei}`).toBe(secondary);
      expect(roadWidthFor("avenue", ei), `avenue@${ei}`).toBe(avenue);
      expect(roadWidthFor("main", ei), `main@${ei}`).toBe(main);
    }
  });

  it("traite un rang inconnu comme une avenue (branche par défaut)", () => {
    expect(roadWidthFor("inconnu", 12)).toBe(roadWidthFor("avenue", 12));
  });

  it("est monotone croissante avec l'ère pour un rang donné", () => {
    for (const rank of ["path", "secondary", "avenue", "main"]) {
      expect(roadWidthFor(rank, 0)).toBeLessThanOrEqual(roadWidthFor(rank, 7));
      expect(roadWidthFor(rank, 7)).toBeLessThanOrEqual(roadWidthFor(rank, 12));
    }
  });
});
