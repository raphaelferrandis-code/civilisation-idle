import { describe, it, expect } from "vitest";

import { CM } from "../layout.js";
import { vehicleLaneOffset } from "../agents.js";

// Ce fichier s'appelait `roadDivided.test.js` et couvrait surtout `cityMapDrawRoad`
// et `cityMapDrawRoadMarkings`, partis avec le rendu top-down (étape 5 du plan de
// suppression du legacy, 2026-08-23). Ce qui reste ne teste PAS renderWorld : c'est
// `vehicleLaneOffset` (agents.js), fonction du chemin ISO — d'où le renommage.
// C'est la seule couverture exécutable du placement des files de véhicules.

describe("vehicleLaneOffset — boulevard 2 cellules : file au bord extérieur", () => {
  const v = (gx, gy, dir, extra = {}) => ({ gx, gy, dir, parkT: 0, ...extra });
  // Boulevard HORIZONTAL de 2 cellules : rangées gy=5 ET gy=6 en "main".
  function boulevardH() {
    CM.frameEraIndex = 14;
    const m = new Map();
    for (let x = 3; x <= 7; x += 1) { m.set(x + ",5", { rank: "main" }); m.set(x + ",6", { rank: "main" }); }
    CM.layout = { roadMap: m };
  }

  // La chaussée iso est centrée sur la cellule, le terre-plein sépare déjà les
  // sens : sur un boulevard de 2 cellules, chacune EST une voie.
  // ⚠ Plus d'échafaudage `CM.iso` ici : le mode par défaut est le seul mode de la
  // carte, et l'étape 7 supprimera le drapeau — inutile d'ajouter un pilote de
  // plus à l'inventaire (§0.2 du plan, qui a déjà dérivé de 6 à 9 fichiers).
  it("chaque cellule du boulevard EST une voie → carrosserie CENTRÉE dedans", () => {
    boulevardH();
    expect(vehicleLaneOffset(v(5, 5, 0), 32)).toEqual({ x: 0, y: 0 });
    expect(vehicleLaneOffset(v(5, 6, 0), 32)).toEqual({ x: 0, y: 0 });
  });

  it("avenue / rue : conduite à DROITE généralisée (les deux sens se séparent)", () => {
    CM.frameEraIndex = 14;
    for (const rank of ["avenue", "secondary"]) {
      CM.layout = { roadMap: new Map([["5,5", { rank }]]) };
      const east = vehicleLaneOffset(v(5, 5, 0), 32);   // est → file SUD
      const west = vehicleLaneOffset(v(5, 5, 1), 32);   // ouest → file NORD
      const south = vehicleLaneOffset(v(5, 5, 2), 32);  // sud → file OUEST
      const north = vehicleLaneOffset(v(5, 5, 3), 32);  // nord → file EST
      expect(east.y).toBeGreaterThan(0);
      expect(west.y).toBeLessThan(0);
      expect(east.y).toBeCloseTo(-west.y);              // sens opposés symétriques
      expect(east.x).toBe(0);
      expect(south.x).toBeLessThan(0);
      expect(north.x).toBeGreaterThan(0);
      expect(south.y).toBe(0);
    }
  });

  it("esplanade (plaza) : aucun décalage (défensif — piétonne)", () => {
    CM.frameEraIndex = 14;
    CM.layout = { roadMap: new Map([["5,5", { rank: "plaza" }]]) };
    expect(vehicleLaneOffset(v(5, 5, 0), 32)).toEqual({ x: 0, y: 0 });
  });

  it("main SANS voisin (1 cellule) ou stationnement : centré", () => {
    CM.frameEraIndex = 14;
    CM.layout = { roadMap: new Map([["5,5", { rank: "main" }]]) };  // pas de 2e voie
    expect(vehicleLaneOffset(v(5, 5, 0), 32)).toEqual({ x: 0, y: 0 });
    boulevardH();
    expect(vehicleLaneOffset(v(5, 5, 0, { parkT: 1 }), 32)).toEqual({ x: 0, y: 0 }); // garé
  });
});
