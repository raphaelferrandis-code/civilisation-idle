"use strict";
// ── LA NAVETTE DES PLAISIRS — le bateau-lanterne, à chaque âge ──────────────────
// (docs/PLAN-BATEAUX.md §8 ; Raph, 2026-10-03 : « tu fais une navette qui amène à
// la maison des plaisirs ? » → son propre ponton en ville, un bateau-lanterne à la
// marque de la Maison, des habitants qui y vont et une hôtesse, surtout la nuit.)
//
// L'ADN DE LA MAISON (docs/PLAN-MAISON-DES-PLAISIRS.md) porté sur l'eau : des
// LANTERNES ROUGES en guirlande de la proue au dais, un DAIS À FRANGE EN PÉTALES sur
// les passagers, des dorures. Chaque âge change la matière, pas la silhouette :
//   0-1 Feu       radeau-pirogue de bois sombre, dais de peau teinte, des TORCHES
//                 (ni papier ni lampion à l'âge du feu, comme sur la Maison)
//   2   Pierre    barque peinte au rouge, dais rouge à pétales d'or
//   3   Couronne  barque bleu nuit filetée d'or, dais rouge
//   4   Marbre    la thalamège : coque de marbre au liseré d'or, dais pourpre
//   5   Fonte     la vedette Belle Époque : acajou et blanc, tente rayée rouge et blanc
//   6   Néon      vedette laquée noire, filet magenta, dais rouge
//   7-9 cosmiques nacre, dais de lumière rose, des ORBES ; le Démiurge lévite
//
// À bord : l'HÔTESSE de la Maison debout à la proue (une fille de la troupe de l'âge,
// plaisirsCast) et 2 à 4 passagers assis sous le dais — à l'aller. Au retour, au
// plus un ; amarrée à la Maison, ils sont montés. Pas de batelier (choix de Raph).
// La nuit, chaque lanterne publie une ancre `lamp*` : la passe de nuit l'allume.

import { surf, boxRamp, tube, ellipsoid, rampRGB, asPart, inFrame, PART, crewSlot } from './boatBake.js';
import { glow, hullShape, drawHull, person, crewPal, chance } from './boatParts.js';
import { pennant } from './boatFamilies.js';
import { HOVER } from './boatKitsCosmic.js';

const GOLD = ['#f6dc7a', '#e3bb4f', '#c49738', '#9a7228', '#6f511b'];
const RED = ['#e0503e', '#c23b2e', '#9c2c23', '#741f19', '#521510'];
const LANTERN = ['#ff6a4c', '#f04a35', '#cf3328', '#a8241d'];   // papier rouge, éclairé de l'intérieur
const BENCH = ['#c43b40', '#a42f35', '#83252a', '#611b1f'];      // coussins

const WOOD = ['#a8774a', '#8c6039', '#704b2c', '#553720', '#3c2616', '#25170d'];
const WOOD_IN = ['#8c6039', '#704b2c', '#553720', '#3c2616', '#25170d'];
const DECK = ['#d6b07c', '#bd955f', '#a07a48', '#7f5f37', '#5e4527'];

// Matières par âge. hull/hullIn/rail/deck : la coque (drawHull) ; band : liseré ;
// canopy/petal : le dais et ses pétales ; post : les montants ; light : torche,
// lanterne de papier ou orbe ; glowRail : filet émissif (néon, nacre).
function style(band) {
  if (band <= 1) return {
    key: 'feu', hull: ['#7d5232', '#663f24', '#4f2f1a', '#3a2112', '#28160b', '#190d06'], hullIn: WOOD_IN, rail: WOOD, deck: DECK, plank: 1.3,
    canopy: ['#b4583a', '#96452c', '#773420', '#572515'], petal: ['#e2b36a', '#c6954e', '#a67739', '#7f5828'], post: WOOD, light: 'torch',
  };
  if (band === 2) return {
    key: 'pierre', hull: RED, hullIn: WOOD_IN, rail: GOLD, deck: DECK, plank: 1.4, band: [0.2, 0.75], bandRamp: GOLD,
    canopy: RED, petal: GOLD, post: WOOD, light: 'paper',
  };
  if (band === 3) return {
    key: 'couronne', hull: ['#3a4f86', '#2e406e', '#233256', '#19243f', '#10182b', '#090e1a'], hullIn: WOOD_IN, rail: GOLD, deck: DECK, plank: 1.4,
    band: [0.2, 0.75], bandRamp: GOLD, canopy: RED, petal: GOLD, post: GOLD, light: 'paper',
  };
  if (band === 4) return {
    key: 'marbre', hull: ['#f6f3ec', '#e5e0d5', '#cdc6b8', '#afa797', '#8a8273', '#6a6356'], hullIn: ['#cdc6b8', '#afa797', '#8a8273', '#6a6356', '#4c463c'],
    rail: GOLD, deck: ['#e5e0d5', '#cdc6b8', '#afa797', '#8a8273', '#6a6356'], plank: 0, smoothDeck: true, band: [0.2, 0.8], bandRamp: GOLD,
    canopy: ['#9a3a7a', '#7e2c63', '#62204d', '#461637'], petal: GOLD, post: GOLD, light: 'paper',
  };
  if (band === 5) return {
    key: 'fonte', hull: ['#f4f1e8', '#dfdacd', '#c4beb0', '#a49e90', '#827c70', '#625d53'], hullIn: WOOD_IN, rail: ['#c99560', '#ab7c4c', '#8c6239', '#6c4a2a'],
    deck: ['#c99560', '#ab7c4c', '#8c6239', '#6c4a2a', '#4e341c'], plank: 0, band: [1.1, 1.8], bandRamp: ['#a8462c', '#8c3822', '#6e2b19', '#511f12'],
    boot: [0, 0.6], bootRamp: ['#3a2a22', '#2b1f19', '#1d1511'],
    canopy: ['#f4f1e8', '#dfdacd', '#c4beb0', '#a49e90'], stripe: RED, petal: RED, post: ['#e8c46a', '#c9a04a', '#a37e35', '#7b5e25'], light: 'paper',
  };
  if (band === 6) return {
    key: 'neon', hull: ['#3b3a44', '#2c2b33', '#201f26', '#16151b', '#0e0d12', '#08080b'], hullIn: ['#2c2b33', '#201f26', '#16151b', '#0e0d12', '#08080b'],
    rail: ['#e8e6ee', '#cfccd8', '#aeaabb', '#8a8699'], deck: ['#8a8699', '#726e82', '#5a566a', '#433f52', '#2e2b3a'], plank: 0, smoothDeck: true,
    glowRail: '#ff4fa3', canopy: RED, petal: ['#ff7cc0', '#f05aa8', '#c8418a', '#9c2f6b'], petalGlow: '#ff4fa3', post: ['#e8e6ee', '#cfccd8', '#aeaabb', '#8a8699'], light: 'paper',
  };
  const GL = { 7: '#5af0b4', 8: '#ffcd78', 9: '#aa8cff' }[band] || '#ffcd78';
  return {
    key: band === 7 ? 'jade' : band === 8 ? 'astral' : 'cristal',
    hull: ['#f7f5fa', '#e7e4f0', '#d1cde2', '#b7b3cf', '#9894b3', '#7a7795'], hullIn: ['#d1cde2', '#b7b3cf', '#9894b3', '#7a7795', '#5c5a77'],
    rail: ['#f7f5fa', '#e7e4f0', '#d1cde2', '#b7b3cf'], deck: ['#e7e4f0', '#d1cde2', '#b7b3cf', '#9894b3', '#7a7795'], plank: 0, smoothDeck: true,
    glowRail: GL, canopy: ['#ffd9e4', '#f7bfd0', '#e9a2b8', '#d4869f'], petal: ['#ffb3c8', '#ff93b0', '#f07595', '#d45a7a'], petalGlow: '#ff8fb0',
    post: ['#f7f5fa', '#e7e4f0', '#d1cde2', '#b7b3cf'], postGlow: GL, light: 'orb', hover: band >= 9, glow: GL,
  };
}

// Les dimensions du bateau (px d'art) et la place de chaque lanterne : partagées par
// la construction et par les ancres de nuit (une seule source).
const L = 40, B = 13;
const L2 = L / 2;
const HULL = { L, B, D: 3.4, sb: 1.4, ss: 0.9, pb: 1.8, ps: 2.6, ts: 0.55, flare: 0.15, th: 0.8, deck: 0.6 };
const DAIS = { a0: -13, a1: 5, cw: B / 2 - 1.3, top: 10.5 };   // le dais, au-dessus du pont
function geometry(hd) {
  const T = hd + DAIS.top;
  const stem = [L2 - 1.2, 0, hd + 8.2];                // tête de l'étrave
  const staff = [-L2 + 1.6, 0, hd + 7.4];              // mât de pavillon, à la poupe
  const cornersF = [[DAIS.a1, -DAIS.cw, T], [DAIS.a1, DAIS.cw, T]];
  const cornersA = [[DAIS.a0, -DAIS.cw, T], [DAIS.a0, DAIS.cw, T]];
  // Guirlandes : de l'étrave aux coins avant du dais, des coins arrière au pavillon.
  const garlands = [...cornersF.map((c) => [stem, c]), ...cornersA.map((c) => [c, staff])];
  const sag = (p, q, f) => [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f, p[2] + (q[2] - p[2]) * f - 1.8 * Math.sin(Math.PI * f)];
  const lamps = [[stem[0] + 1.3, 0, stem[2] - 1.7]];   // la lanterne de proue, pendue en avant
  garlands.forEach(([p, q], i) => {
    for (const f of i < 2 ? [0.35, 0.7] : [0.5]) { const m = sag(p, q, f); lamps.push([m[0], m[1], m[2] - 1.3]); }
  });
  return { T, stem, staff, garlands, sag, lamps };
}

function lanternAt(S, P, kind, St) {
  const [a, c, h] = P;
  if (kind === 'torch') {
    // Torche : un brandon et sa flamme (émissive) — l'âge du feu n'a pas de papier.
    asPart(S, PART.mast, () => tube(S, [[a, c, h - 2.4], [a, c, h + 0.2]], 0.3, (nw) => rampRGB(WOOD, nw, 1)));
    asPart(S, 10, () => {
      ellipsoid(S, a, c, h + 1.1, 0.75, 0.75, 1.2, glow('#ffb347'));
      ellipsoid(S, a, c, h + 0.9, 0.4, 0.4, 0.6, glow('#fff0a0'));
    });
    return;
  }
  if (kind === 'orb') {
    asPart(S, 10, () => ellipsoid(S, a, c, h, 0.85, 0.85, 0.85, glow(St.petalGlow || '#ff8fb0')));
    return;
  }
  // Lanterne de papier : la panse rouge éclairée, deux bagues d'or.
  asPart(S, 10, () => {
    ellipsoid(S, a, c, h, 0.95, 0.95, 1.15, (nw) => rampRGB(LANTERN, nw));
    boxRamp(S, a - 0.45, a + 0.45, c - 0.45, c + 0.45, h + 1.0, h + 1.4, GOLD);
    boxRamp(S, a - 0.45, a + 0.45, c - 0.45, c + 0.45, h - 1.4, h - 1.0, GOLD);
  });
}

// Le DAIS : quatre montants, un toit bombé, une frange de PÉTALES qui pend tout
// autour (un pétale tous les 3 px, deux couleurs en alternance).
function dais(S, hd, St) {
  const { a0, a1, cw } = DAIS;
  const T = hd + DAIS.top;
  const postCol = St.postGlow ? glow(St.postGlow) : (nw) => rampRGB(St.post, nw);
  asPart(S, PART.mast, () => {
    for (const a of [a0 + 0.5, a1 - 0.5]) for (const c of [-cw + 0.4, cw - 0.4]) tube(S, [[a, c, hd], [a, c, T]], 0.38, postCol);
  });
  asPart(S, 9, () => {
    // Toit bombé (rayé pour la tente Belle Époque).
    surf(S, (u, t) => [a0 + u * (a1 - a0), t * cw, T + 1.3 * (1 - t * t)], 0, 1, -1, 1, (u, t, nw) => {
      if (St.stripe && Math.floor((t + 1) * 3.5) % 2) return rampRGB(St.stripe, nw);
      return rampRGB(St.canopy, nw, Math.abs(t) > 0.88 ? 1 : 0);
    });
    // La frange en pétales, sur les quatre bords.
    const pg = St.petalGlow ? glow(St.petalGlow) : null;
    const petalCol = (k, nw) => (pg && k % 2 ? pg() : rampRGB(k % 2 ? St.petal : St.canopy, nw));
    const hem = (p0, p1, len) => {
      surf(S, (s, v) => {
        const f = ((s * len) % 3) / 3;
        const drop = 0.7 + 1.5 * Math.sin(Math.PI * f);
        return [p0[0] + (p1[0] - p0[0]) * s, p0[1] + (p1[1] - p0[1]) * s, T - v * drop];
      }, 0, 1, 0, 1, (s, v, nw) => petalCol(Math.floor((s * len) / 3), nw));
    };
    hem([a0, -cw, 0], [a1, -cw, 0], a1 - a0);
    hem([a0, cw, 0], [a1, cw, 0], a1 - a0);
    hem([a0, -cw, 0], [a0, cw, 0], 2 * cw);
    hem([a1, -cw, 0], [a1, cw, 0], 2 * cw);
  });
}

// Combien de places assises sous le dais, à l'aller : ceux qui attendaient au ponton
// n'y sont jamais plus nombreux (boatScenes).
export const shuttleSeats = (seed) => 2 + ((seed >>> 0) % 3);

function makeLanternBoat(band) {
  const St = style(band);
  const id = 'plaisirs-' + St.key;
  const lift = (S, fn) => (St.hover ? inFrame(S, 0, 0, HOVER, 0, fn) : fn());
  const hd0 = hullShape(HULL).deckH(0);                 // pont au milieu (les ancres)
  return {
    id, role: 'shuttle', hover: !!St.hover, glow: St.glow || null, len: L, beam: B, speed: [0.85, 1.0],
    bounds: [-L2 - 4, L2 + 4, -B / 2 - 6, B / 2 + 6, -1, 24 + (St.hover ? HOVER : 0)], ink: '#1d1611',
    variant(seed) {
      return {
        hull: St.hull, hullIn: St.hullIn, rail: St.rail, deck: St.deck, smoothDeck: !!St.smoothDeck,
        band: St.band || null, bandRamp: St.bandRamp || null, boot: St.boot || null, bootRamp: St.bootRamp || null,
        glowRail: St.glowRail || null, seed,
      };
    },
    // Les lanternes, allumées par la passe de nuit (ancres `lamp*`).
    anchors() {
      const g = geometry(hd0), up = St.hover ? HOVER : 0;
      const out = { stern: [-L2 + 1, 0, hd0 + up + 4] };
      g.lamps.forEach((p, i) => { out['lamp' + i] = [p[0], p[1], p[2] + up]; });
      return out;
    },
    build(S, ctx) {
      const V = ctx.variant || this.variant(1);
      lift(S, () => {
        const sh = drawHull(S, { ...HULL, plank: St.plank || 0, bottom: !!St.hover }, V);
        const hd = sh.deckH(0);
        const g = geometry(hd);
        // Bancs à coussins le long des bords, sous le dais.
        asPart(S, 6, () => {
          for (const side of [-1, 1]) {
            const c0 = side * (DAIS.cw - 2.4), c1 = side * (DAIS.cw - 0.6);
            boxRamp(S, DAIS.a0 + 1.2, DAIS.a1 - 1.2, Math.min(c0, c1), Math.max(c0, c1), hd, hd + 1.6, BENCH);
          }
        });
        dais(S, hd, St);
        // Étrave dorée et son fleuron ; mât de pavillon à la poupe.
        asPart(S, PART.mast, () => {
          tube(S, [[L2 - 2.4, 0, hd], [g.stem[0], 0, g.stem[2]]], 0.42, St.postGlow ? glow(St.postGlow) : (nw) => rampRGB(St.band ? GOLD : St.post, nw));
          tube(S, [[g.staff[0], 0, hd], [g.staff[0], 0, g.staff[2] + 1]], 0.3, (nw) => rampRGB(St.post, nw));
        });
        asPart(S, 10, () => ellipsoid(S, g.stem[0], 0, g.stem[2] + 0.6, 0.8, 0.8, 0.8, St.postGlow ? glow(St.postGlow) : (nw) => rampRGB(GOLD, nw)));
        pennant(S, g.staff[0], 0, g.staff[2] + 0.8, 4.5, RED, V.seed % 5);
        // Les guirlandes (fil sombre, sans contour) et leurs lanternes.
        asPart(S, PART.rope, () => {
          for (const [p, q] of g.garlands) {
            const pts = [];
            for (let k = 0; k <= 10; k += 1) pts.push(g.sag(p, q, k / 10));
            tube(S, pts, 0.16, (nw) => rampRGB(['#3a2a22', '#2b1f19', '#1d1511'], nw));
          }
        });
        for (const P of g.lamps) lanternAt(S, P, St.light, St);
        // À BORD. L'hôtesse à la proue ; les passagers assis sous le dais, à l'aller
        // (et à quai en ville, le temps d'embarquer). Au retour, au plus un ; à la
        // Maison, tous sont montés.
        crewSlot(S, L2 - 6.5, 0, hd, 0, { pose: 'stand', sink: 0, id: (V.seed * 7 + 3) | 0, role: 'hostess' });
        const st = ctx.state;
        const n = st === 'unload' ? 0 : st === 'return' ? (chance(V.seed, 61, 0.45) ? 1 : 0) : shuttleSeats(V.seed);
        const seats = [[-10, 1], [-6, -1], [-2, 1], [2, -1]];
        for (let i = 0; i < n; i += 1) {
          const [a, s] = seats[i];
          person(S, a, s * (DAIS.cw - 1.5), hd + 1.6, -s * Math.PI / 2, crewPal(V.seed, 50 + i * 7), ctx.state === 'salute' && i === 0 ? 'wave' : 'sit');
        }
      });
    },
  };
}

// L'EMBARCADÈRE DE LA MAISON, où la navette accoste : le pied de l'escalier (ou du
// ponton de planches) qui descend à l'eau, FACE AU SUD (+y), en px d'art depuis le
// centre du lieu, par âge. MESURÉ sur la cuisson de la Maison (plaisirsBake : dernier
// point du bâti au sud de x = 0, au ras de l'eau) — `boatNavette.test.js` le remesure
// et crie si la Maison change d'escalier.
export const MAISON_LANDING_PX = { 0: 56, 1: 84, 2: 75, 3: 81, 4: 93, 5: 84, 6: 90, 7: 115, 8: 115, 9: 115 };

// Un modèle par âge (les deux âges du feu partagent le leur).
const BOATS = [0, 2, 3, 4, 5, 6, 7, 8, 9].map(makeLanternBoat);
export const PLAISIRS_MODELS = Object.fromEntries(BOATS.map((M) => [M.id, M]));
export function shuttleModelFor(band) {
  const b = Math.max(0, Math.min(9, band | 0));
  return 'plaisirs-' + style(b).key;
}
