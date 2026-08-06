import { describe, it, expect } from "vitest";

import { ROAD_E, ROAD_N, ROAD_S, ROAD_W } from "../layout.js";
import { computeStreetProps, STREET_PROPS } from "../iso/isoStreetProps.js";

// MOBILIER DE TROTTOIR — les gardes de POSE (isoStreetProps.computeStreetProps).
//
// La règle qui tient tout le lot : un objet de rue est SUR LE TROTTOIR, jamais
// sur la chaussée. Ce test ne la vérifie pas sur la formule (elle se testerait
// elle-même) mais sur la GÉOMÉTRIE RENDUE : pour chaque objet posé, on reconstruit
// la croix de chaussée de sa cellule à partir du masque et on vérifie que le pied
// de l'objet n'est dans AUCUN de ses quads — pavé central comme bras.

const T = 32;
const W = 0.25;                  // demi-chaussée du rang testé
const INNER = W + 0.03 + 0.03;   // bord intérieur de la bande (gorge + bordure)
const OUTER = W + 0.22;          // bord extérieur

const opts = (over = {}) => ({
  band: 4,
  innerOf: () => INNER,
  outerOf: () => OUTER,
  isSidewalk: () => true,
  lamps: [],
  solidSouth: null,
  ...over,
});

// Grille de rues : une cellule sur deux en damier de masques traversants, pour
// balayer les quatre configurations (traversant h, traversant v, carrefour, coude).
function cityOf(n = 14) {
  const roads = new Map();
  for (let gx = 4; gx < 4 + n; gx += 1) {
    for (let gy = 4; gy < 4 + n; gy += 1) {
      const onH = gy % 3 === 0, onV = gx % 3 === 0;
      if (!onH && !onV) continue;
      let mask = 0;
      if (onH) mask |= ROAD_E | ROAD_W;
      if (onV) mask |= ROAD_N | ROAD_S;
      roads.set(gx + "," + gy, { gx, gy, mask, rank: "secondary", roadSurface: "road" });
    }
  }
  return { roadMap: roads, tiles: [] };
}

// Le point (dx, dy), en fractions de cellule depuis son centre, tombe-t-il sur la
// CHAUSSÉE dessinée de cette cellule ? (pavé central + un bras par connexion)
function surLaChaussee(dx, dy, mask) {
  const ax = Math.abs(dx), ay = Math.abs(dy);
  if (ax <= W && ay <= W) return true;                             // pavé central
  if (ay <= W && dx > W && (mask & ROAD_E)) return true;
  if (ay <= W && dx < -W && (mask & ROAD_W)) return true;
  if (ax <= W && dy > W && (mask & ROAD_S)) return true;
  if (ax <= W && dy < -W && (mask & ROAD_N)) return true;
  return false;
}

const posesOf = (L, over) => computeStreetProps(L, T, opts(over));

describe("mobilier de trottoir — pose", () => {
  it("aucun objet ne tombe sur la chaussée, et aucun ne sort du trottoir", () => {
    const L = cityOf();
    const props = posesOf(L);
    expect(props.length).toBeGreaterThan(10);      // sinon le test ne prouve rien
    for (const p of props) {
      const gx = Math.floor(p.wx / T), gy = Math.floor(p.wy / T);
      const c = L.roadMap.get(gx + "," + gy);
      expect(c, `objet hors d'une cellule-route (${gx},${gy})`).toBeTruthy();
      const dx = p.wx / T - (gx + 0.5), dy = p.wy / T - (gy + 0.5);
      expect(surLaChaussee(dx, dy, c.mask), `objet sur la chaussée en ${gx},${gy}`).toBe(false);
      // Dans la bande : les deux écarts restent sous le bord extérieur du trottoir.
      expect(Math.max(Math.abs(dx), Math.abs(dy))).toBeLessThanOrEqual(OUTER + 1e-9);
      // Et jamais sur l'axe transverse de la cellule, où se tiennent le mât du
      // lampadaire et l'allée qui sort de la porte.
      expect(Math.min(Math.abs(dx), Math.abs(dy))).toBeGreaterThan(0.05);
    }
  });

  it("rien avant l'ère à trottoirs, rien sur les venelles ni les ponts", () => {
    expect(posesOf(cityOf(), { band: 1 })).toHaveLength(0);
    const alley = cityOf();
    for (const c of alley.roadMap.values()) c.rank = "path";
    expect(posesOf(alley)).toHaveLength(0);
    const bridge = cityOf();
    for (const c of bridge.roadMap.values()) c.roadSurface = "bridge";
    expect(posesOf(bridge)).toHaveLength(0);
    const champs = cityOf();
    expect(posesOf(champs, { isSidewalk: () => false })).toHaveLength(0);
  });

  it("pose déterministe : deux calculs de la même ville donnent les mêmes objets", () => {
    const a = posesOf(cityOf()), b = posesOf(cityOf());
    expect(a.map((p) => [p.prop, p.wx, p.wy, p.variant]))
      .toEqual(b.map((p) => [p.prop, p.wx, p.wy, p.variant]));
  });

  it("un mât planté du même côté libère la place", () => {
    const L = cityOf();
    const sans = posesOf(L);
    expect(sans.length).toBeGreaterThan(0);
    // Un mât au milieu de chaque cellule, des DEUX côtés : plus rien ne se pose.
    const lamps = [];
    for (const c of L.roadMap.values()) {
      lamps.push({ wx: (c.gx + 0.5) * T, wy: (c.gy + 0.05) * T });
      lamps.push({ wx: (c.gx + 0.5) * T, wy: (c.gy + 0.95) * T });
      lamps.push({ wx: (c.gx + 0.05) * T, wy: (c.gy + 0.5) * T });
      lamps.push({ wx: (c.gx + 0.95) * T, wy: (c.gy + 0.5) * T });
    }
    expect(posesOf(L, { lamps })).toHaveLength(0);
  });

  it("l'objet regarde la rue : la face est celle du côté opposé à son trottoir", () => {
    const L = { roadMap: new Map(), tiles: [] };
    // Une seule rue horizontale traversante, longue : toutes les poses y sont
    // forcément nord (face 's') ou sud (face 'n').
    for (let gx = 4; gx < 40; gx += 1) {
      L.roadMap.set(gx + ",9", { gx, gy: 9, mask: ROAD_E | ROAD_W, rank: "secondary", roadSurface: "road" });
    }
    const props = posesOf(L);
    expect(props.length).toBeGreaterThan(3);
    for (const p of props) {
      const dy = p.wy / T - 9.5;
      expect(p.variant).toBe(dy < 0 ? "s" : "n");
    }
  });

  it("le plafond dur borne le nombre d'objets", () => {
    const max = STREET_PROPS.max;
    try {
      STREET_PROPS.max = 5;
      expect(posesOf(cityOf(20)).length).toBeLessThanOrEqual(6);   // +1 : le compagnon de la dernière pose
    } finally {
      STREET_PROPS.max = max;
    }
  });
});
