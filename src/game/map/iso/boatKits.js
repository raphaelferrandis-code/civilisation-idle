"use strict";
// ── LES KITS DE BATEAUX, PAR BANDE D'ÈRE (docs/PLAN-BATEAUX.md §4) ─────────────
//
// Un modèle = une fonction qui CONSTRUIT le bateau en volumes dans son repère
// (cf. boatBake.js : a le long, c en travers tribord +, h au-dessus de l'eau, en
// px monde au zoom 1), plus ses bornes, ses ancres (feux, tête de mât, poupe…)
// et ses variantes (coque, voile, cargaison tirées par bateau).
//
// TOISE (docs/PLAN-BATEAUX.md §3) : un habitant fait ~7,5 px (1,7 m) → 1 px ≈
// 0,23 m. Les petits métiers sont à l'échelle (barque ≈ 24 px), les gros porteurs
// comprimés (corbita ≈ 58 px au lieu de ~100) ; l'équipage, lui, est TOUJOURS à la
// taille des habitants : c'est lui qui dit la taille du bateau.
//
// Rampes : du plus clair (dessus) au plus sombre (creux) ; cf. shadeIndex.

import {
  surf, box, boxRamp, ellipsoid, tube, rope, rampRGB, asPart, noReflect, PART, h32,
} from './boatBake.js';
import {
  pick, chance, drawHull, person, poler, crewPal, amphora, cargo as cargoOf, squareRig as rigOf,
} from './boatParts.js';
export { hullShape, drawHull, person } from './boatParts.js';
import { makeLanding } from './boatFamilies.js';
import { ANCIENT_MODELS, ANCIENT_FLEET } from './boatKitsAncient.js';
import { MODERN_MODELS, MODERN_FLEET } from './boatKitsModern.js';
import { COSMIC_MODELS, COSMIC_FLEET } from './boatKitsCosmic.js';
import { PLAISIRS_MODELS, shuttleModelFor } from './boatKitsPlaisirs.js';

const cargo = (S, kind, a0, a1, c0, c1, hAt, seed) => cargoOf(S, kind, a0, a1, c0, c1, hAt, seed, PAL);
const squareRig = (S, sp) => rigOf(S, { mast: PAL.oak, ...sp });

// ── Palettes de la bande 4 (Marbre) ───────────────────────────────────────────
// Une seule main : la terre cuite des amphores est celle des toits de la ville,
// le marbre des blocs celui des quais et du pont.
const PAL = {
  oak: ['#c99c64', '#ab7e4c', '#8c623a', '#6c472a', '#4f321d', '#33200f'],
  oakIn: ['#a87b4a', '#8a6038', '#6e4a2b', '#53361f', '#3b2615', '#26180c'],
  pitch: ['#615750', '#4a423c', '#39322d', '#2a2521', '#1e1a17', '#13100e'],
  pitchIn: ['#4e4540', '#3c3530', '#2e2824', '#221e1a', '#181512', '#0f0d0b'],
  deck: ['#dcb887', '#c39d6b', '#a68052', '#86653e', '#674c2d', '#47331d'],
  rail: ['#e8c993', '#cfab76', '#b08b59', '#8d6c42', '#6a4f30'],
  red: ['#dc6440', '#bf4c31', '#9c3925', '#782919', '#561d10'],
  blue: ['#6496c8', '#4a79aa', '#365d8a', '#26446a', '#192e4b'],
  ochre: ['#e6b452', '#c8953c', '#a6782e', '#815b22', '#5d4117'],
  green: ['#7fae6a', '#62904f', '#4a723c', '#36552c', '#253b1f'],
  linen: ['#f8f1de', '#e9dec3', '#d4c4a1', '#baa780', '#9b8862'],
  saffron: ['#f3cd6c', '#dfae4e', '#c48f39', '#a1712a', '#7b531d'],
  sailRed: ['#e27a56', '#c85e3f', '#a6472f', '#823522', '#5f2617'],
  terra: ['#e8a072', '#cd8054', '#ae643f', '#8b4b2d', '#67351f'],
  tile: ['#d9734e', '#bf5b3a', '#9d462c', '#7a341f', '#582515'],
  marble: ['#f6f3ec', '#e5e0d5', '#cdc6b8', '#afa797', '#8a8273'],
  marblePink: ['#f3e1da', '#e3cbc2', '#cbb0a6', '#ad9289', '#89726a'],
  // Sacs plus CLAIRS que le pont : de la même toile que lui, ils disparaissaient
  // dans le chaland (première planche).
  sack: ['#f3e9cf', '#ddcea9', '#c1af88', '#9c8b66', '#776849'],
  bronze: ['#ecc66e', '#cfa04c', '#ab7d37', '#835c28', '#5d401a'],
  gilt: ['#f6dc7a', '#e3bb4f', '#c49738', '#9a7228', '#6f511b'],
  thatch: ['#e3c57e', '#c9a862', '#aa8a4b', '#866b37', '#634e27'],
  timber: ['#c8a272', '#a9845a', '#8a6844', '#6a4f33', '#4c3824'],
  // Grumes : écorce rousse, plus sombre que le bordé de chêne.
  bark: ['#a8693f', '#8b5430', '#6f4125', '#53301b', '#3a2113'],
  net: ['#b8ab8a', '#9c8f70', '#807457', '#635940'],
  cloth: [
    ['#f2ece0', '#ddd3c2', '#c2b6a2', '#9e917c'],   // tunique écrue
    ['#d9734e', '#bc5a3a', '#984429', '#72311d'],   // terre rouge
    ['#7fa3c9', '#6286ae', '#4a6a90', '#36506e'],   // bleu
    ['#d6b25c', '#ba9545', '#987634', '#735827'],   // ocre
    ['#9aa37a', '#7f8862', '#646c4c', '#4b5139'],   // olive
    ['#b07a9a', '#94607f', '#764a65', '#58364b'],   // pourpre éteint
  ],
};
export { PAL as MARBRE_PAL };


// ── BANDE 4 · MARBRE ──────────────────────────────────────────────────────────

// LA CORBITA — le gros porteur romain : coque ronde et pleine, poupe relevée en
// COL DE CYGNE, petite cabine à l'arrière, grande voile carrée, artimon incliné
// à la proue. Amphores, sacs de blé ou blocs de marbre sur le pont.
const CORBITA = {
  id: 'corbita',
  role: 'trade',
  lights: true,
  len: 58, beam: 17,
  speed: [0.9, 1.25],          // tuiles/s : le gros porteur à la voile
  bounds: [-36, 40, -20, 20, -1, 52],
  ink: '#1d1611',
  variant(seed) {
    const pitch = chance(seed, 1, 0.45);
    const band = pick([PAL.red, PAL.blue, PAL.ochre, PAL.green], seed, 2);
    const sail = pick(['linen', 'linen', 'stripe', 'saffron', 'red'], seed, 3);
    return {
      hull: pitch ? PAL.pitch : PAL.oak, hullIn: pitch ? PAL.pitchIn : PAL.oakIn,
      rail: PAL.rail, deck: PAL.deck, band: [0.4, 1.8], bandRamp: band,
      sail, cargo: pick(['amphorae', 'amphorae', 'sacks', 'marble'], seed, 4),
      neck: chance(seed, 5, 0.35) ? PAL.gilt : (pitch ? PAL.pitch : PAL.oak),
      seed,
    };
  },
  anchors() {
    return { masthead: [2, 0, 4.6 + 31], port: [2, -0.6, 4.6 + 29.5], stbd: [2, 0.6, 4.6 + 29.5], stern: [-27, 0, 15] };
  },
  build(S, ctx) {
    const V = ctx.variant || CORBITA.variant(1);
    const H = { L: 58, B: 17, D: 6.2, sb: 4.4, ss: 6.5, pb: 1.9, ps: 2.3, flare: 0.22, th: 1.1, plank: 2.2, deck: 1.6 };
    const sh = drawHull(S, H, V);
    const L2 = sh.L2;
    const hd = (a) => sh.deckH(a / L2);
    // Col de cygne : le pavois arrière se relève, s'enroule vers l'avant.
    const gS = sh.g(-1);
    asPart(S, 10, () => {
      tube(S, [[-L2 + 2.5, 0, gS - 1], [-L2 - 0.5, 0, gS + 2.5], [-L2 - 1.6, 0, gS + 6.5], [-L2 + 0.4, 0, gS + 9.5], [-L2 + 3.2, 0, gS + 9.8], [-L2 + 4.3, 0, gS + 8.2]],
        (t) => 1.25 - 0.55 * t, (nw) => rampRGB(V.neck, nw));
      // Étrave : l'éperon arrondi qui fend l'eau, et son montant.
      const gB = sh.g(1);
      tube(S, [[L2 - 1.5, 0, 0.2], [L2 + 1.2, 0, 2.2], [L2 + 1.5, 0, gB + 1.2]], 0.9, (nw) => rampRGB(V.hull, nw));
    });
    // Cabine arrière, toit de tuiles à deux pans.
    asPart(S, 11, () => {
      const a0 = -L2 + 8, a1 = -L2 + 16, cw = 5.2, hb = hd(-L2 + 12), hw = 4.4;
      box(S, a0, a1, -cw, cw, hb, hb + hw, (f, u, v, nw) => rampRGB(PAL.deck, nw, (f === 'c1' || f === 'c0') && v > 0.85 ? 1 : 0));
      // Porte côté proue.
      surf(S, (s, v) => [a1 + 0.05, s * 1.1, hb + v * 3], -1, 1, 0, 1, (s, v, nw) => rampRGB(PAL.oakIn, nw, 2));
      for (const side of [-1, 1]) {
        surf(S, (u, v) => [a0 - 0.6 + u * (a1 - a0 + 1.2), side * (cw + 0.8) * (1 - v), hb + hw + v * 2.6], 0, 1, 0, 1,
          (u, v, nw) => rampRGB(PAL.tile, nw, ((u * (a1 - a0 + 1.2)) % 1.6) < 0.45 ? 1 : 0));
      }
    });
    // Mâture.
    const sailRamp = V.sail === 'saffron' ? PAL.saffron : V.sail === 'red' ? PAL.sailRed : PAL.linen;
    const hB = hd(2);
    squareRig(S, {
      am: 2, hBase: hB, mastH: 31, yardH: hB + 29, W: 27, Hs: 15.5, bil: 3.4, ramp: sailRamp,
      stripe: V.sail === 'stripe' ? { ramp: PAL.sailRed, at: [0.22, 0.4] } : null,
      brails: 6, furled: ctx.state === 'dock',
    });
    // Artimon : petit mât incliné sur l'avant et sa voile.
    asPart(S, PART.yard, () => {
      const gB = sh.g(1);
      tube(S, [[L2 - 5, 0, gB - 1], [L2 + 5.5, 0, gB + 11]], 0.5, (nw) => rampRGB(PAL.oak, nw));
    });
    asPart(S, PART.sail, () => {
      const gB = sh.g(1);
      if (ctx.state !== 'dock') {
        surf(S, (s, v) => [L2 + 4.2 - v * 1.5 + 0.8 * (1 - s * s), s * 4.2, gB + 10.2 - v * 6], -1, 1, 0, 1,
          (s, v, nw) => rampRGB(sailRamp, nw));
      }
    });
    // Cordages : étai et pataras.
    noReflect(S, () => {
      rope(S, [2, 0, hB + 30.5], [L2 + 4.5, 0, sh.g(1) + 10], '#5b4630');
      rope(S, [2, 0, hB + 30.5], [-L2 + 2, 0, gS + 1], '#5b4630');
      rope(S, [2.7, -14.5, hB + 28.3], [-L2 + 10, -5, hd(-L2 + 10) + 5], '#6a5238');
      rope(S, [2.7, 14.5, hB + 28.3], [-L2 + 10, 5, hd(-L2 + 10) + 5], '#6a5238');
    });
    // Avirons de gouverne sur les deux hanches.
    asPart(S, 13, () => {
      for (const side of [-1, 1]) {
        const c0 = side * (sh.w(-0.78, sh.g(-0.78)) + 0.6);
        tube(S, [[-L2 + 7, c0, sh.g(-0.78) + 2], [-L2 + 1, c0 + side * 1.6, -0.5]], 0.5, (nw) => rampRGB(PAL.oakIn, nw));
        box(S, -L2 + 0.4, -L2 + 3.2, c0 + side * 1.2 - 0.3, c0 + side * 1.2 + 0.3, 0, 2.6, (f, u, v, nw) => rampRGB(PAL.oakIn, nw));
      }
    });
    // Cargaison entre le mât et la cabine.
    cargo(S, V.cargo, -L2 + 17.5, -1.5, -5.6, 5.6, hd, V.seed);
    // Équipage : le pilote à la barre, un matelot au mât, un sur l'avant.
    person(S, -L2 + 5.2, 0, hd(-L2 + 5.2), 0, crewPal(V.seed, 10), 'steer');
    person(S, 5.5, -2.5, hd(5.5), Math.PI / 2, crewPal(V.seed, 20), ctx.state === 'dock' ? 'haul' : 'stand', ctx.k || 0);
    // Le matelot de l'avant SALUE quand on croise un autre bateau (riverFleet : salute).
    if (ctx.state === 'salute' || chance(V.seed, 30, 0.6)) person(S, L2 - 9, 2, hd(L2 - 9), 0.3, crewPal(V.seed, 30), ctx.state === 'salute' ? 'wave' : 'stand', 1);
  },
};

// LA GALÈRE MARCHANDE — longue, basse, rapide : deux rangs de rames qui battent
// en cadence, une petite voile carrée, l'éperon de bronze et l'ŒIL peint à la
// proue, la poupe relevée en éventail (aplustre).
const GALERE = {
  id: 'galere',
  role: 'trade',
  lights: true,
  // Les rames battent en cadence : 6 poses sur 1,8 s (à quai : immobiles).
  anim: { frames: 6, period: 1.8, still: ['dock'] },
  len: 64, beam: 12,
  speed: [1.3, 1.7],           // les rames : le plus rapide du fleuve
  bounds: [-38, 42, -24, 24, -1, 40],
  ink: '#1d1611',
  variant(seed) {
    const band = pick([PAL.red, PAL.blue, PAL.ochre], seed, 2);
    return {
      hull: chance(seed, 1, 0.7) ? PAL.pitch : PAL.oak, hullIn: PAL.oakIn, rail: PAL.rail, deck: PAL.deck,
      band: [0.35, 2.0], bandRamp: band,
      sail: pick(['linen', 'stripe', 'saffron'], seed, 3),
      eye: true, seed,
    };
  },
  anchors() { return { masthead: [3, 0, 3.6 + 22], port: [3, -0.6, 3.6 + 21], stbd: [3, 0.6, 3.6 + 21], stern: [-31, 0, 14] }; },
  build(S, ctx) {
    const V = ctx.variant || GALERE.variant(1);
    const H = { L: 64, B: 12, D: 4.4, sb: 2.6, ss: 7.5, pb: 1.45, ps: 2.0, flare: 0.18, th: 1, plank: 0, deck: 1.2 };
    const sh = drawHull(S, H, V);
    const L2 = sh.L2;
    const hd = (a) => sh.deckH(a / L2);
    asPart(S, 10, () => {
      // Éperon de bronze à fleur d'eau.
      tube(S, [[L2 - 2, 0, 1.3], [L2 + 6, 0, 0.9]], (t) => 1.3 - 0.8 * t, (nw) => rampRGB(PAL.bronze, nw));
      // Aplustre : la poupe s'enroule vers l'avant en éventail.
      const gS = sh.g(-1);
      for (const off of [-1.2, 0, 1.2]) {
        tube(S, [[-L2 + 2, off, gS - 0.5], [-L2 - 1, off * 1.2, gS + 3.5], [-L2 + 0.5, off * 1.6, gS + 7.2], [-L2 + 3.2, off * 1.8, gS + 7.6]],
          (t) => 0.7 - 0.3 * t, (nw) => rampRGB(V.hull === PAL.pitch ? PAL.gilt : PAL.oak, nw));
      }
    });
    // L'œil : un pixel blanc et sa pupille, à la joue de la proue (les deux bords).
    asPart(S, 14, () => {
      for (const side of [-1, 1]) {
        const u = 0.8, gg = sh.g(u), h = gg - 2.3;
        const c = side * (sh.w(u, h) + 0.15);
        ellipsoid(S, u * L2, c, h, 0.9, 0.3, 0.6, () => [238, 232, 214]);
        ellipsoid(S, u * L2 + 0.25, c + side * 0.25, h, 0.42, 0.25, 0.42, () => [32, 26, 22]);
      }
    });
    // Rames : neuf par bord, en cadence. k = phase (rad).
    const k = ctx.k || 0;
    asPart(S, 15, () => {
      const n = 9;
      for (let i = 0; i < n; i += 1) {
        const a = -L2 + 16 + i * ((L2 * 2 - 30) / (n - 1));
        const u = a / L2;
        for (const side of [-1, 1]) {
          const port = [a, side * (sh.w(u, sh.g(u) - 1) + 0.4), sh.g(u) - 1.1];
          // À QUAI, les rames sont rentrées : relevées contre la coque, pelle en l'air
          // (sinon la galère amarrée gardait ses dix-huit rames dans l'eau).
          const docked = ctx.state === 'dock';
          const sweep = docked ? 0.25 : 0.42 * Math.cos(k);
          const lift = docked ? 6.5 : (Math.sin(k) > 0 ? 2.6 * Math.sin(k) : 0);
          const reach = docked ? 5.5 : 11.5;
          const tip = [port[0] - Math.sin(sweep) * reach, port[1] + side * Math.cos(sweep) * reach, -0.8 + lift];
          tube(S, [port, tip], 0.36, (nw) => rampRGB(PAL.timber, nw));
          const bl = [tip[0] - (tip[0] - port[0]) * 0.22, tip[1] - (tip[1] - port[1]) * 0.22, tip[2] + (port[2] - tip[2]) * 0.22];
          tube(S, [bl, tip], 0.62, (nw) => rampRGB(PAL.timber, nw, 1));
        }
      }
    });
    // Coursive centrale et petite cabine de poupe.
    asPart(S, 11, () => {
      boxRamp(S, -L2 + 14, L2 - 12, -1.4, 1.4, hd(0), hd(0) + 0.7, PAL.deck);
      const a0 = -L2 + 5.5, a1 = -L2 + 12, hb = hd(-L2 + 9);
      box(S, a0, a1, -3.6, 3.6, hb, hb + 3.6, (f, u, v, nw) => rampRGB(f === 'top' ? PAL.tile : PAL.deck, nw));
    });
    const sailRamp = V.sail === 'saffron' ? PAL.saffron : PAL.linen;
    squareRig(S, {
      am: 3, hBase: hd(3), mastH: 22, yardH: hd(3) + 20.5, W: 19, Hs: 11, bil: 2.4, ramp: sailRamp,
      stripe: V.sail === 'stripe' ? { ramp: PAL.sailRed, at: [0.0, 0.16] } : null, brails: 4,
      furled: ctx.state === 'dock',
    });
    noReflect(S, () => {
      rope(S, [3, 0, hd(3) + 22], [L2 - 1, 0, sh.g(1) + 0.5], '#5b4630');
      rope(S, [3, 0, hd(3) + 22], [-L2 + 4, 0, sh.g(-1) + 1], '#5b4630');
    });
    asPart(S, 13, () => {
      for (const side of [-1, 1]) {
        const c0 = side * (sh.w(-0.82, sh.g(-0.82)) + 0.5);
        tube(S, [[-L2 + 7, c0, sh.g(-0.82) + 1.5], [-L2 + 1.5, c0 + side * 1.4, -0.5]], 0.45, (nw) => rampRGB(PAL.oakIn, nw));
      }
    });
    cargo(S, 'amphorae', -L2 + 13, -L2 + 19, -3.2, 3.2, hd, V.seed);
    person(S, -L2 + 4, 0, hd(-L2 + 4) + 3.6, 0, crewPal(V.seed, 10), 'steer');
    person(S, L2 - 10, 0, hd(L2 - 10), 0, crewPal(V.seed, 20), ctx.state === 'salute' ? 'wave' : 'stand', 1);
  },
};

// LA CODICARIA — le chaland du Tibre : fond plat, bouts carrés relevés. Chargée à
// ras bord ; une hutte de planches à l'arrière pour le batelier. Elle avance à la
// PERCHE (⛔ plus de halage depuis la berge : Raph, 2026-10-03, cf. makeBarge).
const CODICARIA = {
  id: 'codicaria',
  role: 'barge',
  anim: { frames: 4, period: 3.2, still: ['dock'] },
  len: 60, beam: 16,
  speed: [0.55, 0.75],         // au pas du perchiste
  bounds: [-34, 34, -12, 12, -1, 26],
  ink: '#1d1611',
  variant(seed) {
    return {
      hull: PAL.oak, hullIn: PAL.oakIn, rail: PAL.rail, deck: PAL.deck,
      band: chance(seed, 1, 0.4) ? [0.3, 1.2] : null, bandRamp: pick([PAL.red, PAL.blue], seed, 2),
      cargo: pick(['marble', 'marble', 'amphorae', 'sacks', 'timber'], seed, 4), seed,
    };
  },
  anchors() { return { stern: [-28, 0, 8] }; },
  build(S, ctx) {
    const V = ctx.variant || CODICARIA.variant(1);
    const H = { L: 60, B: 16, D: 3.3, sb: 2.4, ss: 2.8, pb: 4, ps: 4, tb: 0.62, ts: 0.7, flare: 0.08, th: 1.1, plank: 1.9, open: true, floor: 1.1 };
    const sh = drawHull(S, H, V);
    const L2 = sh.L2;
    const fl = () => H.floor;
    // Hutte du batelier.
    asPart(S, 11, () => {
      const a0 = -L2 + 3.5, a1 = -L2 + 10, cw = 4.6, hb = H.floor, hw = 5.2;
      box(S, a0, a1, -cw, cw, hb, hb + hw, (f, u, v, nw) => rampRGB(PAL.timber, nw, ((u * 10) % 1.8) < 0.4 ? 1 : 0));
      for (const side of [-1, 1]) {
        surf(S, (u, v) => [a0 - 0.6 + u * (a1 - a0 + 1.2), side * (cw + 0.7) * (1 - v), hb + hw + v * 2.4], 0, 1, 0, 1,
          (u, v, nw) => rampRGB(PAL.thatch, nw, ((v * 9) % 1) < 0.25 ? 1 : 0));
      }
    });
    asPart(S, 13, () => {
      tube(S, [[-L2 + 1, 0, sh.g(-1) + 3.5], [-L2 - 4.5, 0, -0.5]], 0.5, (nw) => rampRGB(PAL.oakIn, nw));
      box(S, -L2 - 5.2, -L2 - 2.6, -0.3, 0.3, 0, 2.2, (f, u, v, nw) => rampRGB(PAL.oakIn, nw));
    });
    cargo(S, V.cargo, -L2 + 11.5, L2 - 4, -5.8, 5.8, fl, V.seed);
    person(S, -L2 + 1.8, 0, sh.g(-1) - 0.6, 0, crewPal(V.seed, 10), 'steer');
    poler(S, sh, L2 * 0.3, chance(V.seed, 21, 0.5) ? 1 : -1, crewPal(V.seed, 30), PAL.oakIn, ctx.k || 0);
    if (ctx.state === 'salute' || chance(V.seed, 20, 0.5)) person(S, L2 - 3, 1.5, H.floor, 0, crewPal(V.seed, 20), ctx.state === 'salute' ? 'wave' : 'stand', 1);
  },
};

// LA SCAPHA — la barque du pêcheur : ouverte, deux bancs, le filet en tas à
// l'arrière. En route, l'un rame ; posée, l'autre relève le filet.
const SCAPHA = {
  id: 'scapha',
  role: 'fisher',
  // En route il rame, posé il relève le filet : 8 poses par coup (6 faisaient moins
  // de 3 images/s — ça saccadait, Raph 2026-10-04).
  anim: { frames: 8, period: 2.2 },
  len: 24, beam: 9,
  speed: [0.7, 0.95],
  bounds: [-16, 16, -16, 16, -1, 12],
  ink: '#1d1611',
  variant(seed) {
    const band = pick([PAL.red, PAL.blue, PAL.ochre, PAL.green, null], seed, 2);
    return { hull: PAL.oak, hullIn: PAL.oakIn, rail: PAL.rail, floor: PAL.oakIn, band: band ? [0.2, 1.1] : null, bandRamp: band, seed };
  },
  anchors() { return { stern: [-11, 0, 5] }; },
  build(S, ctx) {
    const V = ctx.variant || SCAPHA.variant(1);
    const H = { L: 24, B: 9, D: 3.4, sb: 1.8, ss: 1.5, pb: 1.7, ps: 2.2, flare: 0.2, th: 0.9, plank: 1.7, open: true, floor: 0.8 };
    const sh = drawHull(S, H, V);
    const L2 = sh.L2;
    asPart(S, 11, () => {
      for (const a of [-3.5, 4.5]) {
        const u = a / L2, wi = sh.w(u, 2.4) - 0.9;
        boxRamp(S, a - 0.9, a + 0.9, -wi, wi, 1.9, 2.4, PAL.deck);
      }
      // Tas de filet à la poupe.
      ellipsoid(S, -L2 + 4.5, 0.6, H.floor, 2.4, 2.2, 1.6, (nw) => rampRGB(PAL.net, nw, (h32(Math.round(nw[0] * 9), Math.round(nw[1] * 9), 2) % 4 === 0) ? 1 : 0), 0);
    });
    const k = ctx.k || 0;
    const fishing = ctx.state === 'anchor' || ctx.state === 'fish';
    if (!fishing) {
      // Rames dans les tolets.
      asPart(S, 15, () => {
        for (const side of [-1, 1]) {
          const port = [-1.4, side * (sh.w(-0.12, 3) + 0.2), 3.6];
          const sweep = 0.5 * Math.cos(k);
          const lift = Math.sin(k) > 0 ? 1.8 * Math.sin(k) : 0;
          const reach = 8;
          const tip = [port[0] - Math.sin(sweep) * reach, port[1] + side * Math.cos(sweep) * reach, -0.6 + lift];
          tube(S, [[port[0] + Math.sin(sweep) * 2.4, port[1] - side * 2.4, port[2] + 0.6], port, tip], 0.3, (nw) => rampRGB(PAL.timber, nw));
          tube(S, [[tip[0] - (tip[0] - port[0]) * 0.25, tip[1] - (tip[1] - port[1]) * 0.25, tip[2] + 0.4], tip], 0.55, (nw) => rampRGB(PAL.timber, nw, 1));
        }
      });
      person(S, -3.2, 0, 1.9, Math.PI, crewPal(V.seed, 10), 'row', k);
      person(S, -L2 + 3, 0, H.floor, 0, crewPal(V.seed, 20), ctx.state === 'salute' ? 'wave' : 'sit', 1);
    } else {
      person(S, 3.6, 1.0, H.floor, Math.PI / 2, crewPal(V.seed, 10), 'haul', k);
      person(S, -4.5, -0.6, 1.9, 0, crewPal(V.seed, 20), 'sit');
      // La ligne du filet qui plonge.
      noReflect(S, () => rope(S, [4.8, 3.2, 2.6], [6.5, 7.5, 0], '#cfc4a6'));
    }
  },
};

// LE BAC — la plateforme du passeur : un plancher sur deux flotteurs, des
// garde-corps bas, le passeur à la perche à un bout, les voyageurs debout.
const BAC = {
  id: 'bac',
  role: 'ferry',
  anim: { frames: 4, period: 3.2, still: ['dock'] },
  len: 30, beam: 15,
  speed: [0.45, 0.6],
  bounds: [-22, 22, -14, 14, -1, 16],
  ink: '#1d1611',
  variant(seed) { return { hull: PAL.oak, hullIn: PAL.oakIn, rail: PAL.rail, deck: PAL.deck, seed }; },
  anchors() { return { stern: [-15, 0, 4] }; },
  build(S, ctx) {
    const V = ctx.variant || BAC.variant(1);
    const H = { L: 30, B: 15, D: 2.5, sb: 0.4, ss: 0.4, pb: 6, ps: 6, tb: 0.92, ts: 0.92, flare: 0.05, th: 0.8, plank: 1.4, deck: 0.35 };
    const sh = drawHull(S, H, V);
    const L2 = sh.L2;
    const hdk = sh.deckH(0);
    // Garde-corps bas sur les deux longs bords : poteaux + lisse.
    asPart(S, PART.yard, () => {
      for (const side of [-1, 1]) {
        const c = side * (sh.w(0, H.D) - 0.6);
        for (let a = -L2 + 3; a <= L2 - 3; a += 4.8) tube(S, [[a, c, hdk], [a, c, hdk + 3.2]], 0.32, (nw) => rampRGB(PAL.timber, nw));
        tube(S, [[-L2 + 3, c, hdk + 3.2], [L2 - 3, c, hdk + 3.2]], 0.32, (nw) => rampRGB(PAL.rail, nw));
      }
    });
    const k = ctx.k || 0;
    // Le passeur et sa perche (elle plonge vers l'arrière et pousse).
    person(S, -L2 + 3, 1.5, hdk, 0, crewPal(V.seed, 10), 'pole', k);
    asPart(S, 15, () => {
      const lean = 0.35 * Math.sin(k);
      tube(S, [[-L2 + 5 + lean, 1.1, hdk + 6.3], [-L2 - 6 + lean * 4, 2.2, -0.8]], 0.32, (nw) => rampRGB(PAL.timber, nw));
    });
    // Voyageurs (deux à quatre), un âne parfois chargé de jarres.
    const n = 2 + (h32(V.seed, 40) % 3);
    for (let i = 0; i < n; i += 1) {
      const a = -L2 + 9 + i * 4.6;
      const c = ((h32(V.seed, 41, i) % 5) - 2) * 1.4;
      person(S, a, c, hdk, (h32(V.seed, 42, i) % 8) * (Math.PI / 4), crewPal(V.seed, 50 + i * 7), i === 0 && chance(V.seed, 43, 0.3) ? 'wave' : 'stand', k);
    }
    if (ctx.cargo !== false && chance(V.seed, 44, 0.5)) {
      asPart(S, 6, () => { for (let i = 0; i < 3; i += 1) amphora(S, L2 - 4, -3 + i * 2.4, hdk, PAL.terra); });
    }
  },
};

// L'EMBARCADÈRE du passeur (pas un bateau, mais le même peintre) : un petit
// appontement de planches sur pieux, qui s'avance d'une tuile depuis la rive, deux
// poteaux d'amarrage au bout. a = vers le large (cap = la normale de la rive).
// La famille commune (boatFamilies.makeLanding, planches) avec le chêne du Marbre :
// même dessin que l'appontement écrit ici à la main pour le pilote, et il sait
// allonger son tablier jusqu'au pied d'un mur de quai (`withReach`).
const EMBARCADERE = makeLanding({ id: 'embarcadere', kind: 'planks' }, { deck: PAL.deck, woodIn: PAL.oakIn, wood: PAL.oak });

export const BOAT_MODELS = {
  ...ANCIENT_MODELS, ...MODERN_MODELS, ...COSMIC_MODELS, ...PLAISIRS_MODELS,
  corbita: CORBITA, galere: GALERE, codicaria: CODICARIA, scapha: SCAPHA, bac: BAC, embarcadere: EMBARCADERE,
};

// La flotte d'une bande, par métier. Le premier de chaque liste est le modèle
// « signature » de l'époque ; `landing` = l'embarcadère du passeur.
export const BAND_FLEET = {
  ...ANCIENT_FLEET,
  4: { trade: ['corbita', 'galere'], barge: ['codicaria'], fisher: ['scapha'], ferry: ['bac'], landing: 'embarcadere' },
  ...MODERN_FLEET,
  ...COSMIC_FLEET,
};
// La NAVETTE DES PLAISIRS, à tous les âges (boatKitsPlaisirs.js) : le bateau-lanterne.
for (const b of Object.keys(BAND_FLEET)) BAND_FLEET[b] = { ...BAND_FLEET[b], shuttle: [shuttleModelFor(+b)] };
// Les MÉTIERS d'une bande (sans l'embarcadère, qui n'est pas un bateau).
export function fleetRoles(band) {
  const fl = BAND_FLEET[band];
  return fl ? Object.keys(fl).filter((k) => k !== 'landing') : null;
}
export function fleetFor(band) {
  return BAND_FLEET[band] || null;
}
