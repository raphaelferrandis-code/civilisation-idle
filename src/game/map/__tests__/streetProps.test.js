import { describe, it, expect } from "vitest";

import { ROAD_E, ROAD_N, ROAD_S, ROAD_W } from "../layout.js";
import { computeStreetProps, STREET_PROPS } from "../iso/isoStreetProps.js";
import { propFootprint } from "../iso/isoPlaza.js";

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

// ── ENCOMBREMENT, ÉCRIT EN DUR ──────────────────────────────────────────────
// Largeur ÉCRAN de chaque objet du kit, en tuiles, au réglage par défaut. Ces
// nombres sont RECOPIÉS, pas recalculés : le test du chevauchement doit juger
// avec une règle à lui, sinon il compare le filet à lui-même — et un filet qui
// s'auto-mesure passe même quand la constante qu'il applique est absurde (c'est
// exactement ce qui s'est produit : `dAlong` valait 0,17 pour un banc de 0,476).
// La garde `l'encombrement du kit n'a pas bougé` les rattache au modèle réel :
// changer PROP_ASPECT ou la taille des habitants la fait tomber, pas dériver.
const LARGEUR = { bench: 0.476, planter: 0.32725, bin: 0.16575 };
const HW = (prop) => LARGEUR[prop] * 0.5;
// Empreinte écran d'un objet posé, avec la règle du test.
const footOf = (p) => {
  const gx = p.wx / T, gy = p.wy / T;
  const hw = HW(p.prop);
  return { sx: gx - gy, sy: (gx + gy) * 0.5, hw, hh: hw * 0.4 };
};
const seChevauchent = (a, b) => Math.abs(a.sx - b.sx) < a.hw + b.hw
  && Math.abs(a.sy - b.sy) < a.hh + b.hh;

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

  it("l'encombrement du kit n'a pas bougé (sinon LARGEUR ment)", () => {
    // Le seul point où le test regarde le modèle. Il ne s'en sert pas pour
    // juger : il vérifie que les nombres écrits plus haut décrivent encore le
    // vrai kit. Une retouche d'aspect ou de taille d'habitant tombe ICI, en
    // clair, au lieu de rendre la garde du chevauchement muette.
    const p = { bench: 0.7, planter: 0.55, bin: 0.52 };
    for (const [prop, mul] of Object.entries(p)) {
      const hw = propFootprint(0, 0, prop, 0.425 * mul).hw;
      expect(hw * 2, prop).toBeCloseTo(LARGEUR[prop], 5);
    }
  });

  it("aucun objet de trottoir n'en chevauche un autre", () => {
    // Retour Raph 2026-08-07 : « il faut faire en sorte que les éléments ne se
    // chevauchent pas sur le trottoir également ». MESURÉ avant correctif sur
    // cette ville-là : 100 objets sur 201 se chevauchaient, dont 45 paires DANS
    // LA MÊME cellule (le compagnon, posé à 0,17 tuile d'un banc large de
    // 0,476). Le plancher de poses est là pour qu'un filet trop zélé — qui
    // viderait les rues — ne fasse pas passer ce test pour la bonne raison.
    const props = posesOf(cityOf(24));
    expect(props.length, "trottoirs vidés : le test ne prouverait rien").toBeGreaterThan(150);
    const fs = props.map(footOf);
    const fautes = [];
    for (let i = 0; i < fs.length; i += 1) {
      for (let j = i + 1; j < fs.length; j += 1) {
        if (seChevauchent(fs[i], fs[j])) {
          fautes.push(`${props[i].prop}@${props[i].wx},${props[i].wy} × ${props[j].prop}@${props[j].wx},${props[j].wy}`);
        }
      }
    }
    expect(fautes.slice(0, 5)).toEqual([]);
  });

  it("un mât de la cellule VOISINE écarte le mobilier (ce que lampClear ne voit pas)", () => {
    // `lampClear` ne regarde que les mâts de LA cellule et de SON côté ; un mât
    // planté juste de l'autre côté du bord commun tombe pourtant à portée d'un
    // banc posé près de ce bord. Il entre donc dans le filet comme les autres.
    const L = cityOf(24);
    const lamps = [];
    for (let gx = 4; gx < 28; gx += 4) {
      for (let gy = 6; gy < 28; gy += 3) lamps.push({ wx: (gx + 0.5) * T, wy: (gy + 0.14) * T });
    }
    const props = posesOf(L, { lamps });
    expect(props.length).toBeGreaterThan(150);
    const mats = lamps.map((l) => {
      const gx = l.wx / T, gy = l.wy / T;
      return { sx: gx - gy, sy: (gx + gy) * 0.5, hw: 0.2, hh: 0.08 };
    });
    for (const p of props) {
      const f = footOf(p);
      const dessus = mats.find((m) => seChevauchent(f, m));
      expect(dessus, `${p.prop} sur un mât en ${p.wx},${p.wy}`).toBeUndefined();
    }
  });

  it("le compagnon s'écarte de la LARGEUR des deux objets, pas d'une constante", () => {
    // Ce qui a produit le défaut : un `dAlong` de 0,17 tuile, écrit sans jamais
    // le rapporter à l'encombrement de ce qu'il sépare. La règle est maintenant
    // que deux objets d'une MÊME cellule sont distants d'au moins la somme de
    // leurs demi-largeurs — donc jamais moins de 0,17 pour deux corbeilles, et
    // au moins 0,476 pour deux bancs. On vérifie sur les paires réelles.
    const props = posesOf(cityOf(24));
    const parCellule = new Map();
    for (const p of props) {
      const k = Math.floor(p.wx / T) + ":" + Math.floor(p.wy / T);
      if (!parCellule.has(k)) parCellule.set(k, []);
      parCellule.get(k).push(p);
    }
    let paires = 0;
    for (const groupe of parCellule.values()) {
      for (let i = 0; i < groupe.length; i += 1) {
        for (let j = i + 1; j < groupe.length; j += 1) {
          const a = groupe[i], b = groupe[j];
          const d = Math.hypot(a.wx - b.wx, a.wy - b.wy) / T;
          expect(d, `${a.prop} et ${b.prop} trop près dans leur cellule`)
            .toBeGreaterThanOrEqual(HW(a.prop) + HW(b.prop) - 1e-9);
          paires += 1;
        }
      }
    }
    expect(paires, "aucune paire posée : la règle du compagnon est morte").toBeGreaterThan(20);
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
