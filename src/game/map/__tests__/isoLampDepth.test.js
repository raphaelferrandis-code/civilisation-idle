import { describe, it, expect } from "vitest";

import { cmHash, ROAD_E, ROAD_N, ROAD_S, ROAD_W } from "../layout.js";
import { computeIsoLamps } from "../iso/isoRenderer.js";

// PROFONDEUR PEINTRE des lampadaires iso (computeIsoLamps). Le tri de drawIsoLive
// classe les socles au coin SUD de leur empreinte (max wx+wy) : un mât côté 0.14
// (bord nord/ouest de chaussée) longe la façade sud/est du bâtiment MITOYEN avec un
// pied de profondeur wx+wy plus PETITE → il était dessiné AVANT, donc AVALÉ par le
// bâtiment qu'il devance (~1 mât sur 3 en ville). Sa clé doit être REMONTÉE juste
// devant le coin sud de ce bâtiment ; côté 0.86 (bâtiment au sud/est du mât),
// l'ordre naturel du pied est déjà correct et ne doit PAS bouger.

const T = 32;
const H = ROAD_E | ROAD_W;   // route traversante horizontale
const V = ROAD_N | ROAD_S;   // route traversante verticale

// Cellule-route porteuse de mât : traversante + (gx+gy)%3==0 (espacement isoLamps).
const road = (gx, gy, mask) => ({ gx, gy, mask, roadSurface: "road", rank: "street" });
const layoutOf = (roads, tiles = []) => ({ roadMap: new Map(roads.map((c) => [c.gx + ":" + c.gy, c])), tiles });

// side est hashé par RUE (gy pour une horizontale, gx pour une verticale) : cherche
// une RUE dont les mâts tombent du côté voulu — near=true = bord nord/ouest (side<0.5,
// remontée de profondeur), near=false = sud/est (ordre naturel). La valeur exacte du
// side (CURB, réglable) est laissée ouverte : les tests la LISENT sur le mât produit.
function findCell(near, axis = "x") {
  for (let k = 0; k < 300; k += 1) {
    const row = 12 + k; // identifiant de rue : gy (horizontale) ou gx (verticale)
    const isNear = (cmHash(axis === "x" ? "lmp:h:" + row : "lmp:v:" + row) & 1) === 0;
    if (isNear !== near) continue;
    let along = 12;
    while (((along + row) % 3) !== 0) along += 1;
    return axis === "x" ? { gx: along, gy: row } : { gx: row, gy: along };
  }
  throw new Error("aucune rue au side voulu (hash trop uniforme ?)");
}

const lampAt = (lamps, gx, gy) => lamps.find((l) => l.gx === gx && l.gy === gy);

describe("computeIsoLamps — profondeur des mâts face aux bâtiments", () => {
  it("mât côté nord sur route horizontale : remonté juste DEVANT le bâtiment mitoyen nord", () => {
    const { gx, gy } = findCell(true, "x");
    const b = { gx, gy: gy - 1, spanX: 1, spanY: 1, buildingId: "house" };
    const lamps = computeIsoLamps(layoutOf([road(gx, gy, H)], [b]), T);
    const lp = lampAt(lamps, gx, gy);
    const southCorner = ((b.gx + 1) + (b.gy + 1)) * T;
    expect(lp.d).toBeGreaterThan(southCorner);        // passe devant le socle…
    expect(lp.d - southCorner).toBeLessThanOrEqual(1); // …d'un cheveu seulement
  });

  it("mât côté nord : l'empreinte 3×3 compte en ENTIER (coin sud de l'empreinte, pas de la cellule)", () => {
    const { gx, gy } = findCell(true, "x");
    // Façade sud d'un 3×3 dont la cellule mitoyenne du mât est le coin OUEST (le pire cas).
    const b = { gx, gy: gy - 3, spanX: 3, spanY: 3, buildingId: "ministries" };
    const lamps = computeIsoLamps(layoutOf([road(gx, gy, H)], [b]), T);
    const lp = lampAt(lamps, gx, gy);
    expect(lp.d).toBeGreaterThan(((b.gx + 3) + (b.gy + 3)) * T);
  });

  it("mât côté ouest sur route verticale : remonté devant la façade EST du bâtiment ouest", () => {
    const { gx, gy } = findCell(true, "y");
    const b = { gx: gx - 1, gy, spanX: 1, spanY: 1, buildingId: "house" };
    const lamps = computeIsoLamps(layoutOf([road(gx, gy, V)], [b]), T);
    const lp = lampAt(lamps, gx, gy);
    expect(lp.d).toBeGreaterThan(((b.gx + 1) + (b.gy + 1)) * T);
  });

  it("mât côté sud (bâtiment au SUD du mât) : clé du pied inchangée — il reste derrière", () => {
    const { gx, gy } = findCell(false, "x");
    const b = { gx, gy: gy + 1, spanX: 1, spanY: 1, buildingId: "house" };
    const lamps = computeIsoLamps(layoutOf([road(gx, gy, H)], [b]), T);
    const lp = lampAt(lamps, gx, gy);
    expect(lp.d).toBe(lp.wx + lp.wy);
    expect(lp.d).toBeLessThan(((b.gx + 1) + (b.gy + 1)) * T);
  });

  it("empreinte À PLAT (champ) au nord : pas de remontée (le sol ne peut pas avaler un mât)", () => {
    const { gx, gy } = findCell(true, "x");
    const b = { gx, gy: gy - 1, spanX: 1, spanY: 1, buildingId: "field-wheat" };
    const lp = lampAt(computeIsoLamps(layoutOf([road(gx, gy, H)], [b]), T), gx, gy);
    expect(lp.d).toBeCloseTo(lp.wx + lp.wy, 6);   // = pied brut : aucune remontée
  });

  it("aucun voisin bâti : clé = pied wx+wy (comportement d'origine)", () => {
    const { gx, gy } = findCell(true, "x");
    const lp = lampAt(computeIsoLamps(layoutOf([road(gx, gy, H)]), T), gx, gy);
    expect(lp.d).toBeCloseTo(lp.wx + lp.wy, 6);
  });

  it("continuité : tous les mâts d'une même rue sont du MÊME côté de chaussée", () => {
    const roadsH = [], roadsV = [];
    for (let k = 12; k < 42; k += 1) { roadsH.push(road(k, 12, H)); roadsV.push(road(51, k + 50, V)); }
    const lamps = computeIsoLamps(layoutOf([...roadsH, ...roadsV]), T);
    const sidesH = new Set(lamps.filter((l) => l.gy === 12).map((l) => l.wy / T - l.gy));
    const sidesV = new Set(lamps.filter((l) => l.gx === 51).map((l) => l.wx / T - l.gx));
    expect(sidesH.size).toBe(1); // une seule valeur de side sur toute la rue horizontale
    expect(sidesV.size).toBe(1); // idem sur la verticale
    expect(lamps.filter((l) => l.gy === 12).length).toBeGreaterThan(5);
  });

  it("carrefour et cellule hors espacement : toujours aucun mât", () => {
    const { gx, gy } = findCell(true, "x");
    const lamps = computeIsoLamps(layoutOf([
      road(gx, gy, H | V),               // carrefour complet (2 axes traversants) → pas de mât
      road(gx + 1, gy, H),               // (gx+1+gy)%3 != 0 → pas de mât
    ]), T);
    expect(lamps).toHaveLength(0);
  });
});
