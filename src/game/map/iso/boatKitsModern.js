"use strict";
// ── LES BATEAUX DE LA FONTE ET DU NÉON (docs/PLAN-BATEAUX.md §4) ───────────────
//
//   5 · Fonte  vapeur à aubes, cargo à vapeur ; péniche halée par un cheval ;
//              barque peinte ; chaloupe à vapeur (le passeur) ; SERVICE : remorqueur
//              et drague à godets
//   6 · Néon   porte-conteneurs fluvial, pétrolier ; convoi poussé ; bateau à
//              moteur ; navette vitrée (le passeur) ; SERVICE : police, pompiers
//
// Les cheminées publient une ancre `smoke` (fumée animée au rendu), la police une
// ancre `beacon` (gyrophare), les pompiers deux lances `jetL` / `jetR`.

import { surf, box, boxRamp, tube, rope, rampRGB, asPart, noReflect, PART, h32 } from './boatBake.js';
import {
  pick, chance, glow, drawHull, person, crewPal, cargo, funnel, cabin, railing, container,
} from './boatParts.js';
import { makeBarge, makeRowboat, makeLanding, pennant } from './boatFamilies.js';

// ── Garde-robes ───────────────────────────────────────────────────────────────
const SKIN = [['#f0c29a', '#d9a47c', '#b98460', '#8f6246'], ['#d9a070', '#bf8458', '#9c6744', '#734a30'], ['#a8714a', '#8c5a38', '#6e442a', '#4f2f1d'], ['#7a4f33', '#643f28', '#4e301e', '#382115']];
const HAIR = [['#4a3424', '#36261a', '#251a12'], ['#2a2420', '#1d1916', '#13100e'], ['#8a6a44', '#6c5134', '#4e3a25'], ['#c9c2b8', '#a9a196', '#87807a']];
// Bleus de travail, vestons, casquettes plates (XIXe).
const CREW_IRON = {
  skin: SKIN, hair: HAIR, legs: ['#3e3a36', '#2f2c29', '#22201e', '#171614'],
  cloth: [
    ['#4c6288', '#3d506f', '#2f3e57', '#222d40'],
    ['#7a6450', '#62503f', '#4b3d30', '#352b22'],
    ['#e8e2d4', '#d0c8b6', '#b2a993', '#8e8571'],
    ['#5e6b50', '#4b5640', '#394231', '#282f23'],
  ],
  hat: [['#3c3a38', '#2c2b29', '#1e1d1c'], ['#5a4a3a', '#46392d', '#332a21']],
  hatP: 0.65,
};
// Gilets haute visibilité, marine, blanc ; casques de chantier.
const CREW_NEON = {
  skin: SKIN, hair: HAIR, legs: ['#2f3540', '#242932', '#1a1e25', '#111419'],
  cloth: [
    ['#f08a2a', '#d0721f', '#a85a17', '#7e4310'],
    ['#e8e24a', '#c9c339', '#a29d2b', '#78741f'],
    ['#2f4466', '#253652', '#1b283e', '#121b2b'],
    ['#eef0f2', '#d6dade', '#b6bcc2', '#8f969e'],
  ],
  hat: [['#f4f4f2', '#d8d8d4', '#b4b4ae'], ['#f08a2a', '#cc6f1c', '#9e5313'], ['#e8d84a', '#c6b838', '#9a8f29']],
  hatP: 0.5,
};

// ── Matières ──────────────────────────────────────────────────────────────────
const BLACK = ['#58585d', '#44444a', '#343438', '#26262a', '#1a1a1d', '#101012'];
const GREEN = ['#56765d', '#45604b', '#354a3a', '#27362a', '#1b251d', '#111711'];
const WHITE = ['#f4f1e8', '#dfdacd', '#c4beb0', '#a49e90', '#827c70'];
const RED = ['#cc4a3c', '#ab3a2f', '#892c24', '#661f19', '#46140f'];
const YELLOW = ['#ecc44c', '#cfa436', '#a98128', '#7e5e1b'];
const DECKW = ['#dcc192', '#c3a678', '#a5885d', '#826b46', '#604f33'];
const IRON = ['#6f8079', '#55645e', '#3e4a45', '#2a332f', '#1b211e'];
const RUST = ['#b4703f', '#975631', '#784225', '#58301a', '#3b2011'];
const COAL = ['#4a4643', '#383533', '#292725', '#1c1b1a'];
const CANVAS = ['#efe5ca', '#d8cbab', '#baab88', '#978965'];
const GLASS_OLD = ['#8aa6b4', '#6c8898', '#516b7a', '#3a4f5b'];
const FONTE = {
  hull: BLACK, hullIn: ['#4a4a4f', '#38383c', '#2a2a2e', '#1e1e21', '#141416'], rail: ['#e2dccb', '#c8c1ae', '#a8a08a', '#847c67'],
  deck: DECKW, wood: ['#9a7046', '#7b5636', '#5c3f27', '#3f2a1a'], woodIn: ['#7b5636', '#5c3f27', '#3f2a1a', '#28190e'],
  net: ['#a99c7c', '#8d8163', '#71674d', '#554d39'], iron: IRON,
  terra: ['#c98a5e', '#ad6f47', '#8e5636', '#6c3f27', '#4d2b1a'], ochre: YELLOW,
  sack: ['#e6d8b4', '#cebf97', '#b09f76', '#8e7e58', '#6b5e40'],
  barrel: ['#c49a62', '#a67d4a', '#866137', '#644628', '#46301b'], hoop: ['#4e4a46', '#3c3835', '#2b2826'],
  crate: ['#d2b07a', '#b8955f', '#997848', '#775b34'], bark: ['#a8693f', '#8b5430', '#6f4125', '#53301b'],
  wool: ['#efe6d2', '#d9cdb2', '#bcae8f', '#998b6c'], woolTie: ['#5e452c', '#433120', '#2e2116'],
  coal: COAL, hatch: ['#8c8a80', '#727067', '#5a5850', '#43423c'], glass: GLASS_OLD,
  paintCabin: WHITE, roof: GREEN, stone: ['#d6cdb8', '#c0b59c', '#a69a80', '#8b7f66'],
  landDeck: DECKW, landSide: IRON, landPost: IRON, landRail: IRON,
};
const NAVY = ['#4c5e7a', '#3c4b63', '#2d394e', '#20293a', '#151c28', '#0d1119'];
const STEEL = ['#8c9a95', '#75837e', '#5e6b67', '#48534f', '#343c39'];
const CYAN_GLASS = ['#a6dcf0', '#7cbcdb', '#5698bb', '#3a7598'];
const NEON = {
  hull: NAVY, hullIn: ['#3c4b63', '#2d394e', '#20293a', '#151c28', '#0d1119'], rail: ['#eef0f2', '#d0d5da', '#adb3ba', '#878e96'],
  deck: STEEL, wood: STEEL, woodIn: ['#5e6b67', '#48534f', '#343c39', '#232826'],
  net: ['#9aa4a8', '#7f888c', '#656d70', '#4c5255'], iron: STEEL, glass: CYAN_GLASS,
  terra: RED, ochre: YELLOW, sack: ['#e6e0d0', '#cec6b2', '#b0a790', '#8e856e'],
  barrel: ['#4f86b8', '#3f6d98', '#305477', '#223c57'], hoop: ['#2c3440', '#20262f', '#151a20'],
  crate: ['#c9a36c', '#ae8a55', '#8e6f42', '#6c5331'], coal: COAL, bark: ['#a8693f', '#8b5430', '#6f4125', '#53301b'],
  sand: ['#e3c88e', '#cbae73', '#ad905a', '#8a7144'],
  landDeck: STEEL, landSide: NAVY, landPost: ['#eef0f2', '#cdd2d7', '#a7adb4'], landRail: ['#eef0f2', '#cdd2d7', '#a7adb4'],
};
const BOXES = [
  RED, ['#4474b6', '#375f96', '#2a4a76', '#1e3556'], ['#55a062', '#44844f', '#34663d', '#24472b'],
  ['#e88e3c', '#c7742d', '#a05b21', '#784216'], ['#b0b4b9', '#93979c', '#76797e', '#5a5c60'],
  ['#3fa8a4', '#328a86', '#256b68', '#194b49'], YELLOW,
];

// ── BANDE 5 · FONTE ───────────────────────────────────────────────────────────

// LE VAPEUR À AUBES — coque noire ou verte, roues à aubes sous leurs tambours
// blancs, rouf vitré, pont-promenade bâché, haute cheminée cerclée de rouge. Les
// aubes tournent ; la cheminée fume (ancre `smoke`).
const VAPEUR = {
  id: 'vapeur', role: 'trade', lights: true, len: 64, beam: 14, speed: [1.0, 1.3],
  anim: { frames: 4, period: 0.9, still: ['dock'] },
  bounds: [-36, 38, -16, 16, -6, 42], ink: '#1d1611',
  variant(seed) {
    return {
      hull: chance(seed, 1, 0.4) ? GREEN : BLACK, hullIn: FONTE.hullIn, rail: FONTE.rail, deck: DECKW,
      boot: [0, 0.9], bootRamp: RED, band: [0.3, 1.2], bandRamp: WHITE,
      ring: pick([RED, YELLOW, WHITE], seed, 3), awning: chance(seed, 4, 0.5), seed,
    };
  },
  anchors() { return { masthead: [12, 0, 4.4 + 15.5], port: [12, -0.8, 4.4 + 14.6], stbd: [12, 0.8, 4.4 + 14.6], smoke: [-2, 0, 4.4 + 23], stern: [-31, 0, 8] }; },
  build(S, ctx) {
    const V = ctx.variant || this.variant(1);
    const H = { L: 64, B: 14, D: 4.4, sb: 1.6, ss: 1.2, pb: 1.6, ps: 2.2, flare: 0.1, th: 0.9, plank: 0, deck: 0.8 };
    const sh = drawHull(S, H, V);
    const L2 = sh.L2;
    const hd = sh.deckH(0);
    // Rouf vitré sur presque toute la longueur, pont-promenade au-dessus.
    cabin(S, -24, 14, -5.4, 5.4, hd, hd + 4.4, { wall: WHITE, roof: DECKW, win: GLASS_OLD, winEvery: 2.6, winH: [0.35, 0.72] });
    for (const side of [-1, 1]) railing(S, -24, 14, side * 5.2, hd + 4.4, 2.4, IRON, 2.6);
    if (V.awning) {
      asPart(S, 11, () => surf(S, (u, s) => [-22 + u * 18, s * 5.6, hd + 8.8 + 0.6 * Math.cos(s * 1.5)], 0, 1, -1, 1,
        (u, s, nw) => rampRGB(CANVAS, nw, (Math.floor((s + 1) * 5) % 2) ? 1 : 0)));
      asPart(S, PART.yard, () => { for (const a of [-22, -13, -4]) for (const c of [-5.2, 5.2]) tube(S, [[a, c, hd + 4.4], [a, c, hd + 8.8]], 0.3, (nw) => rampRGB(IRON, nw)); });
    }
    // Timonerie à l'avant du pont-promenade.
    cabin(S, 9, 14, -2.6, 2.6, hd + 4.4, hd + 8, { wall: WHITE, roof: RED, win: GLASS_OLD, winEvery: 1.7, winH: [0.4, 0.8] });
    asPart(S, PART.mast, () => tube(S, [[12, 0, hd + 8], [12, 0, hd + 15.5]], 0.35, (nw) => rampRGB(IRON, nw)));
    // Cheminée.
    funnel(S, -2, 0, hd + 4.4, 18.5, 1.6, BLACK, V.ring, COAL);
    // TAMBOURS DES ROUES : demi-cylindres blancs de part et d'autre, aubes dessous.
    const k = ctx.k || 0;
    for (const side of [-1, 1]) {
      const c0 = side * (sh.w(-0.06, H.D) + 0.2), c1 = c0 + side * 3.2;
      asPart(S, 11, () => {
        surf(S, (u, v) => [-2 + 6 * Math.cos(u), c0 + (c1 - c0) * v, 3.2 + 6 * Math.sin(u)], 0, Math.PI, 0, 1, (u, v, nw) => rampRGB(WHITE, nw, Math.abs(u - Math.PI / 2) < 0.18 ? 1 : 0));
        surf(S, (u, r) => [-2 + 6 * r * Math.cos(u), c1, 3.2 + 6 * r * Math.sin(u)], 0, Math.PI, 0, 1, (u, r, nw) => rampRGB(r > 0.86 ? RED : WHITE, nw, r < 0.3 ? 1 : 0));
      });
      asPart(S, PART.oar, () => {
        for (let i = 0; i < 8; i += 1) {
          const an = Math.PI + (i / 8) * Math.PI * 2 + k * 0.25;
          const x = -2 + 5.6 * Math.cos(an), z = 3.2 + 5.6 * Math.sin(an);
          if (z > 3.2 || z < -0.2) continue;
          box(S, x - 0.5, x + 0.5, Math.min(c0, c1), Math.max(c0, c1), Math.max(0, z - 0.9), z + 0.9, (f, u, v, nw) => rampRGB(RED, nw, 1));
        }
      });
    }
    pennant(S, -L2 + 2, 0, hd + 9, 5, RED, V.seed % 5);
    asPart(S, PART.mast, () => tube(S, [[-L2 + 2, 0, hd], [-L2 + 2, 0, hd + 9.5]], 0.3, (nw) => rampRGB(IRON, nw)));
    // Passagers au pont-promenade.
    const n = 1 + (V.seed % 3);
    for (let i = 0; i < n; i += 1) person(S, -18 + i * 6, (i % 2 ? -2.6 : 2.4), hd + 4.4, (V.seed + i) % 2 ? Math.PI / 2 : -Math.PI / 2, crewPal(CREW_IRON, V.seed, 40 + i * 5), i === 0 && ctx.state === 'salute' ? 'wave' : 'stand', 1);
  },
};

// LE CARGO À VAPEUR — étrave droite, cale à l'avant sous ses panneaux, mât de
// charge et son mât de flèche, passerelle et cheminée à l'arrière.
const CARGO_VAPEUR = {
  id: 'cargo-vapeur', role: 'trade', lights: true, len: 62, beam: 15, speed: [0.95, 1.25],
  bounds: [-36, 38, -18, 18, -1, 44], ink: '#1d1611',
  variant(seed) {
    return {
      hull: chance(seed, 1, 0.3) ? GREEN : BLACK, hullIn: FONTE.hullIn, rail: FONTE.rail, deck: DECKW,
      boot: [0, 1], bootRamp: RED, band: [0.25, 0.85], bandRamp: WHITE,
      ring: pick([RED, YELLOW, WHITE], seed, 3), cargo: pick(['crates', 'barrels', 'sacks', 'timber'], seed, 4), seed,
    };
  },
  anchors() { return { masthead: [14, 0, 5 + 26], port: [-14, -0.8, 5 + 9.5], stbd: [-14, 0.8, 5 + 9.5], smoke: [-20, 0, 5 + 20], stern: [-29, 0, 10] }; },
  build(S, ctx) {
    const V = ctx.variant || this.variant(1);
    const H = { L: 62, B: 15, D: 5, sb: 2.4, ss: 1.6, pb: 1.5, ps: 2.6, flare: 0.08, th: 0.9, plank: 0, deck: 1 };
    const sh = drawHull(S, H, V);
    const L2 = sh.L2;
    const hd = (a) => sh.deckH(a / L2);
    asPart(S, 10, () => tube(S, [[L2 - 1.5, 0, 0.3], [L2 + 1.2, 0, sh.g(1) + 0.6]], 0.8, (nw) => rampRGB(V.hull, nw)));
    // Cale avant : panneaux, et la cargaison qui attend dessus.
    asPart(S, 6, () => boxRamp(S, -4, 22, -4.6, 4.6, hd(8), hd(8) + 1.2, FONTE.hatch));
    cargo(S, V.cargo, -2, 20, -4.6, 4.6, () => hd(8) + 1.2, V.seed, FONTE);
    // Mât de charge et sa flèche.
    asPart(S, PART.mast, () => tube(S, [[14, 0, hd(14)], [14, 0, hd(14) + 26]], (t) => 0.7 - 0.25 * t, (nw) => rampRGB(IRON, nw)));
    asPart(S, PART.yard, () => tube(S, [[14, 0, hd(14) + 3], [2, 1, hd(14) + 13]], 0.38, (nw) => rampRGB(IRON, nw)));
    noReflect(S, () => {
      rope(S, [14, 0, hd(14) + 25], [2, 1, hd(14) + 13], '#3a3a3a');
      rope(S, [2, 1, hd(14) + 13], [4, 1, hd(14) + 6], '#3a3a3a');
      rope(S, [14, 0, hd(14) + 25], [L2, 0, sh.g(1) + 0.5], '#3a3a3a');
    });
    // Château arrière : passerelle, cheminée.
    cabin(S, -24, -9, -5.2, 5.2, hd(-16), hd(-16) + 4.2, { wall: WHITE, roof: DECKW, win: GLASS_OLD, winEvery: 2.4 });
    cabin(S, -16, -11, -3, 3, hd(-16) + 4.2, hd(-16) + 8, { wall: WHITE, roof: RED, win: GLASS_OLD, winEvery: 1.6, winH: [0.4, 0.8] });
    funnel(S, -20, 0, hd(-20) + 4.2, 13, 1.5, BLACK, V.ring, COAL);
    for (const side of [-1, 1]) railing(S, -L2 + 3, -24, side * (sh.w(-0.85, H.D) - 0.5), hd(-28), 2.2, IRON, 2.4);
    pennant(S, -L2 + 2, 0, hd(-L2 + 2) + 8, 5, pick([RED, WHITE, YELLOW], V.seed, 9), V.seed % 5);
    asPart(S, PART.mast, () => tube(S, [[-L2 + 2, 0, hd(-L2 + 2)], [-L2 + 2, 0, hd(-L2 + 2) + 8.5]], 0.3, (nw) => rampRGB(IRON, nw)));
    person(S, -13.5, 0, hd(-16) + 4.2, 0, crewPal(CREW_IRON, V.seed, 10), 'steer');
    person(S, 8, -3, hd(8) + 1.2, Math.PI / 2, crewPal(CREW_IRON, V.seed, 20), ctx.state === 'dock' ? 'haul' : (ctx.state === 'salute' ? 'wave' : 'stand'), ctx.k || 1);
  },
};

const PENICHE = makeBarge({ id: 'peniche', L: 66, B: 15, tow: 'horse', hut: 'cabin', hatches: true, plank: 0, speed: [0.6, 0.8], paint: [GREEN, RED, WHITE] }, FONTE, CREW_IRON);
const BARQUE_PEINTE = makeRowboat({ id: 'barque-peinte', L: 24, B: 9, paint: [RED, ['#4c74b0', '#3b5e94', '#2c4874', '#1f3354'], GREEN, YELLOW] },
  { ...FONTE, hull: ['#efe9da', '#d9d1bf', '#bdb39c', '#9d927b', '#7c725d', '#5a5242'], hullIn: ['#c9bfa6', '#ada28a', '#8f846d', '#706651', '#524a3a'], rail: ['#9a7046', '#7b5636', '#5c3f27', '#3f2a1a'], deck: DECKW }, CREW_IRON);

// LA CHALOUPE À VAPEUR — le passeur de la Fonte : coque vernie, tendelet rayé sur
// ses montants, petite cheminée de laiton, les voyageurs assis dessous.
const CHALOUPE = {
  id: 'chaloupe', role: 'ferry', len: 32, beam: 11, speed: [0.45, 0.6],
  bounds: [-20, 20, -14, 14, -1, 22], ink: '#1d1611',
  variant(seed) { return { hull: ['#b5814e', '#97683c', '#78512d', '#5a3c20', '#3d2814', '#26190c'], hullIn: FONTE.woodIn, rail: ['#e6c48c', '#caa870', '#a98a56', '#856b40'], deck: DECKW, band: [0.25, 1], bandRamp: WHITE, seed, stripe: pick([RED, GREEN, ['#4c74b0', '#3b5e94', '#2c4874', '#1f3354']], seed, 3) }; },
  anchors() { return { smoke: [-8, 0, 3.6 + 12.5], stern: [-15, 0, 5] }; },
  build(S, ctx) {
    const V = ctx.variant || this.variant(1);
    const H = { L: 32, B: 11, D: 3.6, sb: 1.4, ss: 1, pb: 1.6, ps: 2.2, flare: 0.15, th: 0.8, plank: 0, open: true, floor: 1.2 };
    const sh = drawHull(S, H, V);
    const L2 = sh.L2;
    asPart(S, 11, () => {
      for (const side of [-1, 1]) boxRamp(S, -6, 10, side * 3.4 - 0.9, side * 3.4 + 0.9, 1.2, 2.6, DECKW);   // banquettes
      surf(S, (u, s) => [-6 + u * 17, s * 4.6, 9.8 + 0.5 * Math.cos(s * 1.5)], 0, 1, -1, 1, (u, s, nw) => rampRGB((Math.floor((s + 1) * 4) % 2) ? V.stripe : CANVAS, nw));
    });
    asPart(S, PART.yard, () => { for (const a of [-6, 2.5, 11]) for (const c of [-4.4, 4.4]) tube(S, [[a, c, 1.2], [a, c, 9.8]], 0.28, (nw) => rampRGB(FONTE.rail, nw)); });
    funnel(S, -8, 0, 1.2, 11.5, 1.1, ['#e6c46a', '#c9a24a', '#a07c34', '#785c25'], null, COAL);
    const n = 2 + (V.seed % 4);
    for (let i = 0; i < n; i += 1) person(S, -4 + i * 3.4, (i % 2 ? -3.4 : 3.4), 2.6, i % 2 ? Math.PI / 2 : -Math.PI / 2, crewPal(CREW_IRON, V.seed, 50 + i * 7), i === 0 && ctx.state === 'salute' ? 'wave' : 'sit', 1);
    person(S, -L2 + 3, 0, H.floor, 0, crewPal(CREW_IRON, V.seed, 10), 'steer');
  },
};

// LE REMORQUEUR — trapu, haut sur l'eau : coque noire au liseré rouge, timonerie
// blanche, grosse cheminée, bourrelets de défense à l'étrave. Il patrouille.
const REMORQUEUR = {
  id: 'remorqueur', role: 'service', service: 'patrol', lights: true, len: 34, beam: 12, speed: [0.9, 1.15],
  bounds: [-20, 22, -14, 14, -1, 32], ink: '#1d1611',
  variant(seed) { return { hull: BLACK, hullIn: FONTE.hullIn, rail: FONTE.rail, deck: DECKW, boot: [0, 0.9], bootRamp: RED, band: [0.2, 0.9], bandRamp: pick([RED, WHITE, YELLOW], seed, 2), ring: pick([RED, YELLOW], seed, 3), seed }; },
  anchors() { return { masthead: [3, 0, 5 + 16], port: [3, -0.7, 5 + 9.8], stbd: [3, 0.7, 5 + 9.8], smoke: [-4, 0, 5 + 18], stern: [-15, 0, 7] }; },
  build(S, ctx) {
    const V = ctx.variant || this.variant(1);
    const H = { L: 34, B: 12, D: 5, sb: 2.2, ss: 1, pb: 1.5, ps: 2.6, flare: 0.12, th: 0.9, plank: 0, deck: 1 };
    const sh = drawHull(S, H, V);
    const L2 = sh.L2;
    const hd = sh.deckH(0);
    cabin(S, -2, 6, -3.6, 3.6, hd, hd + 4.4, { wall: WHITE, roof: WHITE, win: GLASS_OLD, winEvery: 2, winH: [0.45, 0.8] });
    cabin(S, 0.5, 5.5, -2.6, 2.6, hd + 4.4, hd + 8, { wall: WHITE, roof: RED, win: GLASS_OLD, winEvery: 1.6, winH: [0.4, 0.82] });
    funnel(S, -4, 0, hd, 17, 1.6, BLACK, V.ring, COAL);
    asPart(S, PART.mast, () => tube(S, [[3, 0, hd + 8], [3, 0, hd + 16]], 0.32, (nw) => rampRGB(IRON, nw)));
    // Bitte de remorquage et défenses d'étrave.
    asPart(S, 6, () => {
      boxRamp(S, -L2 + 4, -L2 + 6, -1, 1, hd, hd + 2.2, IRON);
      surf(S, (u, v) => [L2 - 0.6 + 1.2 * Math.cos(u), 1.1 * Math.sin(u) * 3, 1.5 + v * 2.5], -Math.PI / 2, Math.PI / 2, 0, 1, (u, v, nw) => rampRGB(COAL, nw));
    });
    person(S, 3, 0, hd + 4.4, 0, crewPal(CREW_IRON, V.seed, 10), 'steer');
    if (ctx.state === 'salute' || chance(V.seed, 20, 0.5)) person(S, -L2 + 8, 2, hd, Math.PI, crewPal(CREW_IRON, V.seed, 20), ctx.state === 'salute' ? 'wave' : 'stand', 1);
  },
};

// LA DRAGUE À GODETS — un ponton de tôle rouillée, une ÉLINDE en treillis plongée
// dans l'eau à l'avant où tourne la chaîne de godets, une cheminée, un abri. Elle
// travaille à poste fixe.
const DRAGUE = {
  id: 'drague', role: 'service', service: 'work', len: 46, beam: 17, speed: [0.5, 0.6],
  anim: { frames: 6, period: 2.4 },
  bounds: [-28, 34, -16, 16, -6, 34], ink: '#1d1611',
  variant(seed) { return { hull: RUST, hullIn: ['#975631', '#784225', '#58301a', '#3b2011', '#241309'], rail: IRON, deck: ['#8f8a7c', '#77736a', '#5f5b53', '#48453e', '#33312d'], smoothDeck: true, seed }; },
  anchors() { return { smoke: [-12, 0, 4.5 + 16], stern: [-22, 0, 7] }; },
  build(S, ctx) {
    const V = ctx.variant || this.variant(1);
    const H = { L: 46, B: 17, D: 4.5, sb: 0.6, ss: 0.6, pb: 5, ps: 5, tb: 0.85, ts: 0.85, flare: 0.04, th: 0.9, plank: 0, deck: 0.6 };
    const sh = drawHull(S, H, V);
    const hd = sh.deckH(0);
    // Le portique et l'élinde : deux poutres en treillis, du portique vers l'eau.
    const top = [10, 0, hd + 15], bot = [30, 0, -3];
    asPart(S, PART.mast, () => {
      for (const c of [-1.8, 1.8]) {
        tube(S, [[top[0], c, top[2]], [bot[0], c, bot[2]]], 0.55, (nw) => rampRGB(RUST, nw));
        tube(S, [[4, c, hd], [10, c, hd + 15]], 0.45, (nw) => rampRGB(IRON, nw));
        tube(S, [[16, c, hd], [10, c, hd + 15]], 0.45, (nw) => rampRGB(IRON, nw));
      }
    });
    // La chaîne de godets qui monte le long de l'élinde.
    const k = ctx.k || 0;
    asPart(S, 6, () => {
      for (let i = 0; i < 9; i += 1) {
        const f = ((i + k / (Math.PI * 2)) % 9) / 9;
        const x = bot[0] + (top[0] - bot[0]) * f, z = bot[2] + (top[2] - bot[2]) * f + 1;
        if (z < -0.2) continue;
        box(S, x - 0.9, x + 0.9, -1.2, 1.2, z, z + 1.4, (fc, u, v, nw) => rampRGB(fc === 'top' ? ['#6f5a40', '#5a4834', '#463828'] : RUST, nw));
      }
    });
    cabin(S, -18, -4, -6, 6, hd, hd + 5, { wall: ['#cfc8b6', '#b8b19e', '#9b9481', '#7c7664'], roof: RUST, win: GLASS_OLD, winEvery: 2.6 });
    funnel(S, -12, 0, hd + 5, 11, 1.4, BLACK, null, COAL);
    // Le déblai : un tas de vase dans la marie-salope amarrée à couple.
    asPart(S, 6, () => surf(S, (u, v) => [8 + 6 * v * Math.cos(u), -9.5 + 2.2 * v * Math.sin(u), 2.5 + 2.2 * (1 - v * v)], 0, Math.PI * 2, 0, 1, (u, v, nw) => rampRGB(['#7d6e58', '#685b48', '#524738', '#3d3529'], nw)));
    person(S, -6, 3, hd, Math.PI / 2, crewPal(CREW_IRON, V.seed, 10), 'haul', k);
  },
};

const PONTON_FER = makeLanding({ id: 'ponton-fer', kind: 'iron' }, FONTE);

// ── BANDE 6 · NÉON ────────────────────────────────────────────────────────────

// Superstructure moderne : blocs blancs étagés, bandeaux de verre.
function bridgeBlock(S, a0, a1, cw, h0, levels, wall, glass) {
  let h = h0;
  for (let i = 0; i < levels; i += 1) {
    const sh = i === levels - 1 ? 0.6 : 0;
    cabin(S, a0 + i * 0.6, a1 - i * 0.3, -cw - sh, cw + sh, h, h + 3, { wall, roof: wall, win: glass, winEvery: 1.8, winH: [0.35, 0.78] });
    h += 3;
  }
  return h;
}

// LE PORTE-CONTENEURS FLUVIAL — coque marine au liseré rouge, boîtes multicolores
// empilées en baies sur toute la longueur, château blanc à l'arrière et son mât de
// radar.
// (Fabrique : le porte-conteneurs du FLEUVE est écrêté à 2,4 tuiles pour passer sous
// le pont ; celui qui reste À QUAI au terminal de commerce n'a pas cette contrainte et
// se dessine à sa taille, 2,9 tuiles et quatre files — plutôt qu'un agrandissement
// ×1,3 qui aurait cassé la grille de pixels.)
function makeContainerShip(id, L, B, rows) {
  const L2 = L / 2, A0 = -L2 + 14, A1 = L2 - 9, aB = -L2 + 2;
  const step = (B - 3.2) / rows;
  return {
    id, role: 'trade', lights: true, len: L, beam: B, speed: [1.1, 1.4],
    bounds: [-L2 - 4, L2 + 6, -B / 2 - 12, B / 2 + 12, -1, 38], ink: '#1d1611',
    variant(seed) { return { hull: pick([NAVY, NAVY, ['#5b6e66', '#4a5a53', '#3a4741', '#2b3530', '#1d2420', '#121714'], RED], seed, 1), hullIn: NEON.hullIn, rail: NEON.rail, deck: STEEL, boot: [0, 1], bootRamp: RED, band: [0.25, 0.75], bandRamp: WHITE, seed }; },
    anchors() { return { masthead: [aB + 7, 0, 4.6 + 22], port: [aB + 7, -0.8, 4.6 + 16], stbd: [aB + 7, 0.8, 4.6 + 16], stern: [-L2 + 2, 0, 10] }; },
    build(S, ctx) {
      const V = ctx.variant || this.variant(1);
      const H = { L, B, D: 4.6, sb: 1.6, ss: 0.6, pb: 1.7, ps: 4, ts: 0.6, flare: 0.05, th: 0.8, plank: 0, deck: 0.8 };
      const sh = drawHull(S, H, V);
      const hd = sh.deckH(0);
      // Baies de conteneurs : une à trois boîtes de haut par file.
      // (Couleur HACHÉE par boîte : une somme linéaire bay·7 retombait sur la même
      // couleur modulo 7 — toute une file d'une seule teinte.)
      asPart(S, 6, () => {
        let bay = 0;
        for (let a = A0; a < A1; a += 6.6, bay += 1) {
          for (let r = 0; r < rows; r += 1) {
            const c = -B / 2 + 1.6 + step * (r + 0.5);
            const n = 1 + (h32(V.seed, bay * 3 + r + 7, 41) % 3);
            for (let z = 0; z < n; z += 1) {
              const ramp = BOXES[h32(V.seed, bay * 11 + r * 5 + z, 43) % BOXES.length];
              container(S, a, a + 6, c - step / 2 + 0.2, c + step / 2 - 0.2, hd + z * 3.1, hd + z * 3.1 + 3, ramp);
            }
          }
        }
      });
      const top = bridgeBlock(S, aB, aB + 9, Math.min(6.2, B / 2 - 1.8), hd, 4, WHITE, CYAN_GLASS);
      asPart(S, PART.mast, () => {
        tube(S, [[aB + 5, 0, top], [aB + 5, 0, top + 6]], 0.35, (nw) => rampRGB(STEEL, nw));
        tube(S, [[aB + 5, -2.2, top + 4.6], [aB + 5, 2.2, top + 4.6]], 0.3, (nw) => rampRGB(STEEL, nw));
      });
      person(S, aB + 8, Math.min(5.6, B / 2 - 2.4), hd + 9, Math.PI / 2, crewPal(CREW_NEON, V.seed, 10), ctx.state === 'salute' ? 'wave' : 'stand', 1);
    },
  };
}
const PORTE_CONTENEURS = makeContainerShip('porte-conteneurs', 76, 16, 3);
const PORTE_CONTENEURS_QUAI = makeContainerShip('porte-conteneurs-quai', 94, 20, 4);

// LE PÉTROLIER — pont vert parcouru de tuyauteries, collecteur au milieu, château
// arrière blanc, cheminée basse à la bague de compagnie.
const PETROLIER = {
  id: 'petrolier', role: 'trade', lights: true, len: 72, beam: 15, speed: [1.0, 1.3],
  bounds: [-40, 42, -18, 18, -1, 36], ink: '#1d1611',
  variant(seed) { return { hull: pick([RED, NAVY, BLACK], seed, 1), hullIn: NEON.hullIn, rail: NEON.rail, deck: ['#6f9a7a', '#5c8267', '#4a6a54', '#385141', '#273a2e'], smoothDeck: true, boot: [0, 0.9], bootRamp: ['#2a2a2e', '#202024', '#18181b', '#101012'], band: [0.25, 0.7], bandRamp: WHITE, ring: pick([YELLOW, RED, ['#3fa8a4', '#328a86', '#256b68', '#194b49']], seed, 3), seed }; },
  anchors() { return { masthead: [-28, 0, 4.4 + 20], port: [-28, -0.8, 4.4 + 13], stbd: [-28, 0.8, 4.4 + 13], smoke: [-33, 0, 4.4 + 16], stern: [-34, 0, 10] }; },
  build(S, ctx) {
    const V = ctx.variant || this.variant(1);
    const H = { L: 72, B: 15, D: 4.4, sb: 1.4, ss: 0.6, pb: 1.7, ps: 4, ts: 0.6, flare: 0.05, th: 0.8, plank: 0, deck: 0.6 };
    const sh = drawHull(S, H, V);
    const L2 = sh.L2;
    const hd = sh.deckH(0);
    asPart(S, PART.yard, () => {
      for (const c of [-1.6, 0, 1.6]) tube(S, [[-24, c, hd + 0.8], [L2 - 6, c, hd + 0.8]], 0.38, (nw) => rampRGB(['#d8d2b8', '#bcb59a', '#9b957c'], nw));
      tube(S, [[-24, 0, hd + 2.4], [L2 - 8, 0, hd + 2.4]], 0.3, (nw) => rampRGB(STEEL, nw));
    });
    asPart(S, 6, () => {
      boxRamp(S, 2, 6, -4.5, 4.5, hd, hd + 2.2, STEEL);
      for (const a of [-14, 16, 26]) surf(S, (u, v) => [a + 2.2 * v * Math.cos(u), 2.2 * v * Math.sin(u), hd + 1.4 * Math.sqrt(1 - v * v)], 0, Math.PI * 2, 0, 1, (u, v, nw) => rampRGB(WHITE, nw));
    });
    const top = bridgeBlock(S, -34, -25, 6, hd, 3, WHITE, CYAN_GLASS);
    funnel(S, -33, 0, top, 4.5, 1.6, WHITE, V.ring, ['#2a2a2e', '#1f1f22', '#141416']);
    asPart(S, PART.mast, () => tube(S, [[-28, 0, top], [-28, 0, top + 7]], 0.32, (nw) => rampRGB(STEEL, nw)));
    person(S, 4, 5.5, hd, Math.PI / 2, crewPal(CREW_NEON, V.seed, 20), ctx.state === 'salute' ? 'wave' : 'stand', 1);
  },
};

// LE CONVOI POUSSÉ — une barge de vrac (sable, charbon, conteneurs) et le pousseur
// collé à sa poupe, timonerie haute perchée pour voir par-dessus la cargaison.
const POUSSEUR = {
  id: 'pousseur', role: 'barge', lights: true, len: 76, beam: 15, speed: [0.75, 0.95],
  bounds: [-42, 42, -18, 18, -1, 30], ink: '#1d1611',
  variant(seed) { return { hull: pick([NAVY, BLACK, ['#7a5a3c', '#62482f', '#4b3723', '#352618', '#22180e']], seed, 1), hullIn: NEON.hullIn, rail: NEON.rail, deck: STEEL, smoothDeck: true, boot: [0, 0.8], bootRamp: RED, load: pick(['sand', 'coal', 'boxes', 'sand'], seed, 4), seed }; },
  anchors() { return { masthead: [-30, 0, 4 + 22], port: [-30, -0.8, 4 + 18], stbd: [-30, 0.8, 4 + 18], stern: [-38, 0, 8] }; },
  build(S, ctx) {
    const V = ctx.variant || this.variant(1);
    // La barge (de l'avant au milieu) …
    const HB = { L: 54, B: 15, D: 3.6, sb: 0.6, ss: 0.4, pb: 5, ps: 6, tb: 0.8, ts: 0.95, flare: 0.03, th: 0.8, plank: 0, open: true, floor: 1.2 };
    drawHull(S, HB, V);
    asPart(S, 6, () => {
      if (V.load === 'boxes') {
        for (let a = -20; a < 22; a += 6.6) for (const r of [-1, 1]) container(S, a, a + 6.2, r * 3.4 - 2.9, r * 3.4 + 2.9, 1.2, 4.2, BOXES[(V.seed + Math.round(a) + r * 3 + 40) % BOXES.length]);
      } else {
        const ramp = V.load === 'coal' ? COAL : NEON.sand;
        surf(S, (u, s) => [-22 + u * 44, s * 5.8, 1.2 + 3.4 * Math.pow(Math.sin(Math.PI * u), 0.4) * (1 - s * s)], 0, 1, -1, 1, (u, s, nw) => rampRGB(ramp, nw));
      }
    });
    // Le pousseur, accolé à la poupe.
    const P0 = -27;
    asPart(S, 2, () => boxRamp(S, P0 - 12, P0, -6, 6, 0, 3.4, V.hull));
    cabin(S, P0 - 10, P0 - 3, -4, 4, 3.4, 6.8, { wall: WHITE, roof: WHITE, win: CYAN_GLASS, winEvery: 2 });
    asPart(S, PART.mast, () => { for (const c of [-1.5, 1.5]) tube(S, [[P0 - 6, c, 6.8], [P0 - 6, c, 14]], 0.45, (nw) => rampRGB(STEEL, nw)); });
    cabin(S, P0 - 8.5, P0 - 3.5, -3, 3, 14, 18, { wall: WHITE, roof: RED, win: CYAN_GLASS, winEvery: 1.6, winH: [0.3, 0.85] });
    asPart(S, PART.mast, () => tube(S, [[P0 - 3, 0, 18], [P0 - 3, 0, 22]], 0.3, (nw) => rampRGB(STEEL, nw)));
    person(S, P0 - 6, 0, 14, 0, crewPal(CREW_NEON, V.seed, 10), 'steer');
  },
};

// LE BATEAU À MOTEUR DU PÊCHEUR — coque blanche à bande de couleur, console, hors-
// bord noir ; posé, il tient sa canne.
const BATEAU_MOTEUR = {
  id: 'bateau-moteur', role: 'fisher', len: 24, beam: 9, speed: [0.9, 1.2],
  bounds: [-16, 16, -12, 12, -2, 14], ink: '#1d1611',
  variant(seed) { const b = pick([['#4474b6', '#375f96', '#2a4a76', '#1e3556'], RED, ['#3fa8a4', '#328a86', '#256b68', '#194b49'], YELLOW], seed, 2); return { hull: WHITE, hullIn: ['#dfdacd', '#c4beb0', '#a49e90', '#827c70', '#5e594f'], rail: ['#cfd4d8', '#b0b6bc', '#8f969c'], floor: ['#c4beb0', '#a49e90', '#827c70', '#5e594f'], band: [0.3, 1.0], bandRamp: b, seed }; },
  anchors() { return { stern: [-11, 0, 4] }; },
  build(S, ctx) {
    const V = ctx.variant || this.variant(1);
    const H = { L: 24, B: 9, D: 3.4, sb: 1.6, ss: 0.4, pb: 1.5, ps: 3.5, ts: 0.65, flare: 0.25, th: 0.7, plank: 0, open: true, floor: 1 };
    const sh = drawHull(S, H, V);
    const L2 = sh.L2;
    asPart(S, 11, () => {
      boxRamp(S, -1, 2.5, -1.6, 1.6, 1, 4.2, WHITE);
      box(S, 2.3, 3.2, -1.7, 1.7, 4.2, 5.6, (f, u, v, nw) => rampRGB(CYAN_GLASS, nw));
    });
    asPart(S, 13, () => {
      boxRamp(S, -L2 - 2, -L2 + 0.6, -1, 1, 1.2, 4.6, ['#3a3d42', '#2c2e32', '#1f2124', '#141518']);
      tube(S, [[-L2 - 1, 0, 1.2], [-L2 - 1.2, 0, -1]], 0.5, (nw) => rampRGB(['#2c2e32', '#1f2124'], nw));
    });
    const fishing = ctx.state === 'anchor' || ctx.state === 'fish';
    person(S, -L2 + 4, 0, H.floor, fishing ? Math.PI / 2 : 0, crewPal(CREW_NEON, V.seed, 10), fishing ? 'haul' : 'steer', ctx.k || 0);
    if (fishing) {
      noReflect(S, () => {
        rope(S, [-L2 + 5.5, 2, 6.5], [-L2 + 6, 9, 10], '#2a2c30');
        rope(S, [-L2 + 6, 9, 10], [-L2 + 6.5, 12, 0], '#e8eef2');
      });
    } else person(S, 4.5, 0.6, H.floor, 0, crewPal(CREW_NEON, V.seed, 20), ctx.state === 'salute' ? 'wave' : 'sit', 1);
  },
};

// LA NAVETTE — le passeur du Néon : un bateau-bus blanc, une longue verrière
// cintrée, des voyageurs sur la plateforme arrière.
const NAVETTE = {
  id: 'navette', role: 'ferry', len: 36, beam: 12, speed: [0.5, 0.65],
  bounds: [-22, 22, -14, 14, -1, 18], ink: '#1d1611',
  variant(seed) { return { hull: WHITE, hullIn: NEON.hullIn, rail: NEON.rail, deck: STEEL, band: [0.3, 1.1], bandRamp: pick([['#3fa8a4', '#328a86', '#256b68', '#194b49'], ['#4474b6', '#375f96', '#2a4a76', '#1e3556'], YELLOW], seed, 2), seed }; },
  anchors() { return { stern: [-17, 0, 5] }; },
  build(S, ctx) {
    const V = ctx.variant || this.variant(1);
    const H = { L: 36, B: 12, D: 3, sb: 0.8, ss: 0.6, pb: 2.4, ps: 4, ts: 0.7, flare: 0.05, th: 0.7, plank: 0, deck: 0.5 };
    const sh = drawHull(S, H, V);
    const hd = sh.deckH(0);
    asPart(S, 11, () => {
      surf(S, (u, s) => [-6 + u * 20, s * 4.6 * (1 - 0.25 * Math.pow(u, 3)), hd + 4.8 * Math.sqrt(Math.max(0, 1 - s * s * 0.55))], 0, 1, -1, 1,
        (u, s, nw) => ((u * 20) % 3 < 0.35 ? rampRGB(WHITE, nw, 1) : rampRGB(CYAN_GLASS, nw)));
      boxRamp(S, -6.2, 14.4, -4.7, 4.7, hd, hd + 1.4, WHITE);
    });
    for (const side of [-1, 1]) railing(S, -16, -7, side * 5, hd, 2.6, NEON.rail, 3);
    const n = 1 + (V.seed % 3);
    for (let i = 0; i < n; i += 1) person(S, -14 + i * 3, (i % 2 ? -2 : 2), hd, i % 2 ? Math.PI / 2 : -Math.PI / 2, crewPal(CREW_NEON, V.seed, 50 + i * 7), i === 0 && ctx.state === 'salute' ? 'wave' : 'stand', 1);
  },
};

// LA POLICE FLUVIALE — vedette rapide, coque bleu nuit à bandeau blanc, cabine
// vitrée, rampe de gyrophares sur le toit (ancre `beacon`).
const POLICE = {
  id: 'police', role: 'service', service: 'patrol', lights: true, beacon: true, len: 30, beam: 10, speed: [1.2, 1.5],
  bounds: [-18, 18, -14, 14, -1, 18], ink: '#1d1611',
  variant(seed) { return { hull: NAVY, hullIn: NEON.hullIn, rail: NEON.rail, deck: STEEL, band: [0.5, 1.6], bandRamp: WHITE, boot: [0, 0.6], bootRamp: ['#4474b6', '#375f96', '#2a4a76', '#1e3556'], seed }; },
  anchors() { return { beacon: [1.5, 0, 4 + 6.6], port: [1.5, -1.6, 4 + 6.2], stbd: [1.5, 1.6, 4 + 6.2], stern: [-14, 0, 5] }; },
  build(S, ctx) {
    const V = ctx.variant || this.variant(1);
    const H = { L: 30, B: 10, D: 4, sb: 2, ss: 0.4, pb: 1.4, ps: 3.6, ts: 0.7, flare: 0.25, th: 0.7, plank: 0, deck: 0.6 };
    const sh = drawHull(S, H, V);
    const hd = sh.deckH(0);
    cabin(S, -4, 5, -3.6, 3.6, hd, hd + 4, { wall: WHITE, roof: WHITE, win: CYAN_GLASS, winEvery: 2.2, winH: [0.3, 0.85] });
    asPart(S, 11, () => {
      const blue = glow('#5aa8ff')(), red = glow('#ff4a4a')();
      box(S, 0.5, 2.5, -2.2, 2.2, hd + 4, hd + 4.8, (f, u) => (u < 0.5 ? blue : red));
    });
    person(S, -8, 0, hd, Math.PI, crewPal(CREW_NEON, V.seed, 20), ctx.state === 'salute' ? 'wave' : 'stand', 1);
  },
};

// LES POMPIERS — bateau rouge, rouf blanc, deux LANCES orientables sur le toit
// (ancres `jetL` / `jetR` : les jets d'eau sont dessinés au rendu).
const POMPIERS = {
  id: 'pompiers', role: 'service', service: 'fire', lights: true, len: 36, beam: 12, speed: [0.9, 1.1],
  bounds: [-20, 22, -14, 14, -1, 22], ink: '#1d1611',
  variant(seed) { return { hull: RED, hullIn: ['#ab3a2f', '#892c24', '#661f19', '#46140f', '#2e0d09'], rail: NEON.rail, deck: STEEL, band: [0.3, 0.9], bandRamp: WHITE, boot: [0, 0.7], bootRamp: ['#2a2a2e', '#202024', '#18181b'], seed }; },
  anchors() { return { jetL: [6, -1.6, 4.4 + 9.2], jetR: [6, 1.6, 4.4 + 9.2], port: [-2, -1, 4.4 + 9], stbd: [-2, 1, 4.4 + 9], stern: [-16, 0, 6] }; },
  build(S, ctx) {
    const V = ctx.variant || this.variant(1);
    const H = { L: 36, B: 12, D: 4.4, sb: 1.8, ss: 0.6, pb: 1.5, ps: 3.4, ts: 0.65, flare: 0.12, th: 0.8, plank: 0, deck: 0.8 };
    const sh = drawHull(S, H, V);
    const hd = sh.deckH(0);
    cabin(S, -6, 6, -4, 4, hd, hd + 4.4, { wall: WHITE, roof: WHITE, win: CYAN_GLASS, winEvery: 2.2 });
    cabin(S, -4, 2, -2.8, 2.8, hd + 4.4, hd + 8, { wall: RED, roof: WHITE, win: CYAN_GLASS, winEvery: 1.6, winH: [0.4, 0.85] });
    asPart(S, 12, () => {
      for (const c of [-1.6, 1.6]) {
        tube(S, [[4.5, c, hd + 4.4], [4.5, c, hd + 7.6]], 0.5, (nw) => rampRGB(STEEL, nw));
        tube(S, [[4.5, c, hd + 7.6], [6.6, c, hd + 8.8]], 0.45, (nw) => rampRGB(['#e8c24a', '#c9a034', '#a07c26'], nw));
      }
    });
    person(S, -10, 2, hd, Math.PI, crewPal(CREW_NEON, V.seed, 20), ctx.state === 'salute' ? 'wave' : 'stand', 1);
  },
};

const PONTON_ACIER = makeLanding({ id: 'ponton-acier', kind: 'steel' }, NEON);

// ── LA PLAISANCE, À QUAI SEULEMENT ────────────────────────────────────────────
// Le plaisancier ne navigue PLUS (retrait du 2026-07-30, maintenu) : ces coques ne
// servent qu'aux bassins des ports (session « port et plage », drawMooredHull). Elles
// sont amarrées, vides, voiles ferlées sous leur housse.

// Petit voilier à quille : coque, rouf, mât, bôme et voile ferlée sous housse.
function makeSmallSail(id, Lh, Bh, hull, band, cabinWall, mastH, M) {
  return {
    id, role: 'pleasure', len: Lh, beam: Bh, speed: [0.8, 1],
    bounds: [-Lh / 2 - 4, Lh / 2 + 4, -Bh / 2 - 4, Bh / 2 + 4, -1, mastH + 8], ink: '#1d1611',
    variant(seed) { return { hull: pick(hull, seed, 1), hullIn: M.hullIn, rail: M.rail, deck: M.deck, band: [0.3, 0.9], bandRamp: pick(band, seed, 2), seed }; },
    anchors() { return {}; },
    build(S, ctx) {
      const V = ctx.variant || this.variant(1);
      const H = { L: Lh, B: Bh, D: 3.4, sb: 1.6, ss: 0.6, pb: 1.5, ps: 3, ts: 0.55, flare: 0.2, th: 0.7, plank: 0, deck: 0.5 };
      const sh = drawHull(S, H, V);
      const hd = sh.deckH(0);
      if (cabinWall) cabin(S, -Lh * 0.18, Lh * 0.12, -Bh * 0.3, Bh * 0.3, hd, hd + 2.2, { wall: cabinWall, roof: cabinWall, win: CYAN_GLASS, winEvery: 2.2, winH: [0.35, 0.75] });
      const am = Lh * 0.12;
      asPart(S, PART.mast, () => tube(S, [[am, 0, hd], [am, 0, hd + mastH]], 0.32, (nw) => rampRGB(M.mast || STEEL, nw)));
      asPart(S, PART.sail, () => tube(S, [[am - 0.4, 0, hd + 3.4], [-Lh * 0.38, 0, hd + 3]], 0.75, (nw) => rampRGB(M.cover || CANVAS, nw)));
      noReflect(S, () => {
        rope(S, [am, 0, hd + mastH], [Lh / 2 - 0.5, 0, sh.g(1)], '#5f6670');
        rope(S, [am, 0, hd + mastH], [-Lh / 2 + 1, 0, sh.g(-1)], '#5f6670');
      });
    },
  };
}
const ROWBOAT_IRON = makeRowboat({ id: 'canot-plaisance', role: 'pleasure', L: 20, B: 7.4, empty: true, paint: [RED, GREEN, ['#4c74b0', '#3b5e94', '#2c4874', '#1f3354']] },
  { ...FONTE, hull: ['#c99560', '#ab7c4c', '#8c6239', '#6c4a2a', '#4e341c', '#33210f'], hullIn: ['#b5844f', '#966b3e', '#78542f', '#5a3e21', '#3e2a15'], rail: ['#e6c48c', '#caa870', '#a98a56', '#856b40'] }, CREW_IRON);
const COTRE = makeSmallSail('cotre', 28, 9.5, [BLACK, GREEN, WHITE], [RED, YELLOW, WHITE], ['#c99560', '#ab7c4c', '#8c6239', '#6c4a2a'], 20, { ...FONTE, mast: FONTE.wood, cover: CANVAS });

// L'annexe pneumatique : boudins gris, hors-bord.
const ANNEXE = {
  id: 'annexe', role: 'pleasure', len: 16, beam: 7, speed: [0.8, 1],
  bounds: [-11, 11, -7, 7, -1, 7], ink: '#1d1611',
  variant(seed) { return { tube: pick([['#9aa2aa', '#7f878e', '#656c72', '#4c5257'], ['#e2864a', '#c46d36', '#9d5528', '#753e1c'], ['#3d4652', '#2f3640', '#22282f', '#171b20']], seed, 1), seed }; },
  anchors() { return {}; },
  build(S, ctx) {
    const V = ctx.variant || this.variant(1);
    asPart(S, 2, () => {
      for (const side of [-1, 1]) tube(S, [[-6.5, side * 2.6, 1.2], [3, side * 2.6, 1.2], [6.5, side * 1.2, 1.4], [7.2, 0, 1.5]], 1.25, (nw) => rampRGB(V.tube, nw));
      tube(S, [[-6.5, -2.6, 1.2], [-6.5, 2.6, 1.2]], 1.2, (nw) => rampRGB(V.tube, nw));
      box(S, -6, 5.5, -2, 2, 0, 0.6, (f, u, v, nw) => rampRGB(STEEL, nw, 1));
    });
    asPart(S, 13, () => boxRamp(S, -8.6, -6.6, -0.8, 0.8, 1, 4.4, ['#3a3d42', '#2c2e32', '#1f2124', '#141518']));
  },
};
const DERIVEUR = makeSmallSail('deriveur', 20, 7.6, [WHITE, WHITE, ['#e2864a', '#c46d36', '#9d5528', '#753e1c', '#5a2e14']], [['#4474b6', '#375f96', '#2a4a76'], RED, YELLOW], null, 15, { ...NEON, mast: ['#d6dade', '#b6bcc2', '#8f969e'], cover: ['#4474b6', '#375f96', '#2a4a76', '#1e3556'] });
const VOILIER_NEON = makeSmallSail('voilier', 30, 10, [WHITE, WHITE, NAVY], [NAVY, RED, ['#3fa8a4', '#328a86', '#256b68']], WHITE, 26, { ...NEON, mast: ['#d6dade', '#b6bcc2', '#8f969e'], cover: ['#4474b6', '#375f96', '#2a4a76', '#1e3556'] });
// La vedette : coque blanche, flybridge, vitrages sombres.
const VEDETTE = {
  id: 'vedette', role: 'pleasure', len: 30, beam: 10, speed: [1, 1.3],
  bounds: [-18, 18, -10, 10, -1, 14], ink: '#1d1611',
  variant(seed) { return { hull: WHITE, hullIn: NEON.hullIn, rail: NEON.rail, deck: ['#d8c49c', '#c0aa80', '#a28d64', '#7f6d4a'], band: [0.4, 1.2], bandRamp: pick([NAVY, ['#3d4652', '#2f3640', '#22282f'], ['#3fa8a4', '#328a86', '#256b68']], seed, 2), seed }; },
  anchors() { return {}; },
  build(S, ctx) {
    const V = ctx.variant || this.variant(1);
    const H = { L: 30, B: 10, D: 4, sb: 1.8, ss: 0.4, pb: 1.4, ps: 3.6, ts: 0.7, flare: 0.22, th: 0.7, plank: 0, deck: 0.5 };
    const sh = drawHull(S, H, V);
    const hd = sh.deckH(0);
    cabin(S, -7, 6, -3.8, 3.8, hd, hd + 3.2, { wall: WHITE, roof: WHITE, win: ['#3d4652', '#2f3640', '#22282f', '#171b20'], winEvery: 3.2, winH: [0.3, 0.8] });
    cabin(S, -4, 3, -3, 3, hd + 3.2, hd + 5, { wall: WHITE, roof: WHITE, win: ['#3d4652', '#2f3640', '#22282f'], winEvery: 2.4, winH: [0.4, 0.9] });
    for (const side of [-1, 1]) railing(S, -12, 10, side * 4.4, hd, 1.6, NEON.rail, 3.5);
  },
};

export const MODERN_MODELS = {
  vapeur: VAPEUR, 'cargo-vapeur': CARGO_VAPEUR, peniche: PENICHE, 'barque-peinte': BARQUE_PEINTE, chaloupe: CHALOUPE,
  remorqueur: REMORQUEUR, drague: DRAGUE, 'ponton-fer': PONTON_FER,
  'porte-conteneurs': PORTE_CONTENEURS, 'porte-conteneurs-quai': PORTE_CONTENEURS_QUAI, petrolier: PETROLIER, pousseur: POUSSEUR, 'bateau-moteur': BATEAU_MOTEUR,
  navette: NAVETTE, police: POLICE, pompiers: POMPIERS, 'ponton-acier': PONTON_ACIER,
  'canot-plaisance': ROWBOAT_IRON, cotre: COTRE, annexe: ANNEXE, deriveur: DERIVEUR, voilier: VOILIER_NEON, vedette: VEDETTE,
};
export const MODERN_FLEET = {
  5: { trade: ['vapeur', 'cargo-vapeur'], barge: ['peniche'], fisher: ['barque-peinte'], ferry: ['chaloupe'], service: ['remorqueur', 'drague'], landing: 'ponton-fer',
    // À quai seulement (bassin du port) : canot, voilier, voilier, bateau à moteur.
    pleasure: ['canot-plaisance', 'cotre', 'cotre', 'chaloupe'] },
  6: { trade: ['porte-conteneurs', 'petrolier'], barge: ['pousseur'], fisher: ['bateau-moteur'], ferry: ['navette'], service: ['police', 'pompiers'], landing: 'ponton-acier',
    pleasure: ['annexe', 'deriveur', 'voilier', 'vedette'] },
};

