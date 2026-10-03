"use strict";
// ── LES BATEAUX DES PREMIÈRES ÉPOQUES : FEU, BOIS, PIERRE, COURONNE ────────────
// (docs/PLAN-BATEAUX.md §4 — déroulé validé par Raph le 2026-10-02 : « c'est
// parfait, fais toutes les époques »)
//
//   0 · Feu      radeau de rondins, pirogue monoxyle ; le pêcheur à la sagaie
//   1 · Bois     radeau à voile de peau, barque cousue ; canot ; bac de planches
//   2 · Pierre   knarr à bordé à clin, barque à voile ; chaland de pierre taillée
//   3 · Couronne cogue à châteaux, gabare ; chaland à la perche ; barque à voile latine
//
// Les gens sont ceux de la ville : peaux et fourrures aux deux premières bandes
// (habitants préhistoriques), laines teintes et capuchons au Moyen Âge.

import { surf, box, tube, rope, rampRGB, asPart, noReflect, PART } from './boatBake.js';
import { pick, chance, drawHull, person, crewPal, cargo, squareRig } from './boatParts.js';
import { makeRaft, makeDugout, makeRowboat, makeBac, makeBarge, makeLanding, pennant } from './boatFamilies.js';

// ── Matières ──────────────────────────────────────────────────────────────────
const LOG = ['#a97d52', '#8d6640', '#714f31', '#553923', '#3a2617', '#24170d'];
const LOG_END = ['#e2c391', '#c9a674', '#a98758', '#87683f'];
const COMMON = {
  terra: ['#c98a5e', '#ad6f47', '#8e5636', '#6c3f27', '#4d2b1a'],
  ochre: ['#d8a856', '#bb8c40', '#996f30', '#765223', '#543917'],
  sack: ['#eadcb8', '#d2c299', '#b4a277', '#918059', '#6e603f'],
  bark: ['#a8693f', '#8b5430', '#6f4125', '#53301b', '#3a2113'],
  hide: ['#d4ad80', '#bb9367', '#9a7550', '#78583b', '#563e29'],
  basket: ['#d9b571', '#bf9a58', '#9e7d44', '#7b5f33'],
  net: ['#b8ab8a', '#9c8f70', '#807457', '#635940'],
  thatch: ['#e3c57e', '#c9a862', '#aa8a4b', '#866b37', '#634e27'],
  barrel: ['#c49a62', '#a67d4a', '#866137', '#644628', '#46301b'],
  hoop: ['#6b6058', '#544a43', '#3e3631', '#2b2521'],
  crate: ['#d2b07a', '#b8955f', '#997848', '#775b34'],
  wool: ['#efe6d2', '#d9cdb2', '#bcae8f', '#998b6c'],
  woolTie: ['#7a5a3a', '#5e452c', '#433120'],
  cloth: ['#c05a44', '#a14936', '#80392a', '#5f2a1e'],
  stone: ['#d6cdb8', '#c0b59c', '#a69a80', '#8b7f66', '#6d634e'],
  hay: ['#ead48a', '#d2ba6e', '#b39a52', '#8c773c'],
};
const FEU = {
  ...COMMON, log: LOG, logEnd: LOG_END, logIn: ['#c99d6c', '#ad8355', '#8d6842', '#6c4f31', '#4d3822'],
  wood: ['#9a7148', '#7d5a37', '#604429', '#452f1c'], woodIn: ['#7d5a37', '#604429', '#452f1c', '#2f1f12'],
  deck: ['#c9a06c', '#ad8556', '#8d6943', '#6c4f31'], landPost: ['#7d5a37', '#604429', '#452f1c'],
};
const BOIS = {
  ...COMMON, log: LOG, logEnd: LOG_END, logIn: ['#d2a874', '#b58d5c', '#937047', '#715434', '#503b24'],
  hull: ['#c2955e', '#a07745', '#7d5831', '#5a3d21', '#3a2614', '#24170c'],
  hullIn: ['#a07745', '#7d5831', '#5a3d21', '#3a2614', '#24170c'],
  rail: ['#dcb47e', '#c09862', '#9d7a4a', '#7a5d37'],
  deck: ['#d8b27e', '#bd9764', '#9e7a4c', '#7c5e38', '#5c4428'],
  wood: ['#a07745', '#7d5831', '#5a3d21', '#3a2614'], woodIn: ['#7d5831', '#5a3d21', '#3a2614', '#24170c'],
};
const OAK = ['#b88a58', '#9a7046', '#7b5636', '#5c3f27', '#3f2a1a', '#28190e'];
const OAK_IN = ['#9a7046', '#7b5636', '#5c3f27', '#3f2a1a', '#28190e'];
const TAR = ['#5b524b', '#463f39', '#36302b', '#28231f', '#1c1916', '#110f0d'];
const PIERRE = {
  ...COMMON, hull: OAK, hullIn: OAK_IN, tar: TAR,
  rail: ['#d6b07a', '#bb9460', '#9a7649', '#785a35'],
  deck: ['#cfa978', '#b48e5f', '#947249', '#735735', '#533e25'],
  wood: ['#9a7046', '#7b5636', '#5c3f27', '#3f2a1a'], woodIn: OAK_IN,
};
const COURONNE = {
  ...PIERRE,
  paintRed: ['#c8463a', '#a8382e', '#862b23', '#641f19', '#45150f'],
  paintBlue: ['#4c74b0', '#3b5e94', '#2c4874', '#1f3354', '#142237'],
  gold: ['#f0cc68', '#d5aa45', '#b08635', '#876426', '#5f441a'],
};
// Voiles.
const SAIL_HIDE = ['#e0cba0', '#cbb486', '#ae976a', '#8d7750', '#6b5939'];
const SAIL_WOOL = ['#f0e7d2', '#ddd0b2', '#c2b38f', '#a1906b', '#7e6e4e'];
const SAIL_OCHRE = ['#e2b05a', '#c99643', '#a87934', '#835c26', '#5e411a'];
const SAIL_RED = ['#cf5a44', '#b24734', '#913728', '#6e291d', '#4f1d14'];
const SAIL_BLUE = ['#6688b8', '#506f9c', '#3d577c', '#2c405c', '#1e2c40'];

// ── BANDE 0 · FEU ─────────────────────────────────────────────────────────────
const RADEAU = makeRaft({ id: 'radeau', role: 'trade', L: 34, B: 15, cargo: ['hides', 'baskets', 'pots'], crew: 2, speed: [0.5, 0.7] }, FEU);
const PIROGUE = makeDugout({ id: 'pirogue', role: 'trade', L: 32, B: 6.6, cargo: ['hides', 'baskets'], speed: [0.85, 1.15] }, FEU);
const PIROGUE_PECHE = makeDugout({ id: 'pirogue-peche', role: 'fisher', L: 26, B: 6, fisher: true, speed: [0.75, 1.0] }, FEU);
const RADEAU_BAC = makeRaft({ id: 'radeau-bac', role: 'ferry', L: 30, B: 16, passengers: true, speed: [0.4, 0.55] }, FEU);
const EMB_RONDINS = makeLanding({ id: 'embarcadere-rondins', kind: 'logs' }, FEU);

// ── BANDE 1 · BOIS ────────────────────────────────────────────────────────────
const RADEAU_VOILE = makeRaft({ id: 'radeau-voile', role: 'trade', L: 40, B: 16, logR: 1.3, sail: SAIL_HIDE, cargo: ['baskets', 'pots', 'sacks', 'hides'], crew: 2, speed: [0.6, 0.85] }, BOIS);

// LA BARQUE COUSUE — des planches liées de fibres sur une quille, deux bouts
// relevés en volute ; deux rameurs, des jarres et des paniers.
const BARQUE_COUSUE = {
  id: 'barque-cousue', role: 'trade', len: 38, beam: 10, speed: [0.8, 1.05],
  anim: { frames: 6, period: 2.2, still: ['dock'] },
  bounds: [-24, 24, -18, 18, -1, 16], ink: '#1d1611',
  variant(seed) { return { hull: BOIS.hull, hullIn: BOIS.hullIn, rail: BOIS.rail, floor: BOIS.hullIn, seed, cargo: pick(['baskets', 'amphorae', 'hides'], seed, 4) }; },
  anchors() { return { stern: [-18, 0, 6] }; },
  build(S, ctx) {
    const V = ctx.variant || this.variant(1);
    const H = { L: 38, B: 10, D: 3.4, sb: 3.6, ss: 3.6, pb: 1.6, ps: 1.6, flare: 0.22, th: 0.9, plank: 1.4, open: true, floor: 0.8 };
    const sh = drawHull(S, H, V);
    const L2 = sh.L2;
    asPart(S, 10, () => {
      for (const u of [1, -1]) {
        const g = sh.g(u);
        tube(S, [[u * (L2 - 1.5), 0, g - 1], [u * (L2 + 0.8), 0, g + 1.8], [u * (L2 - 0.4), 0, g + 4], [u * (L2 - 2.2), 0, g + 3.4]], (t) => 0.8 - 0.35 * t, (nw) => rampRGB(BOIS.wood, nw));
      }
    });
    const k = ctx.k || 0;
    const docked = ctx.state === 'dock';
    for (const [a, salt] of [[-7, 10], [6, 20]]) {
      if (!docked) {
        asPart(S, PART.oar, () => {
          for (const side of [-1, 1]) {
            const sw = 0.45 * Math.cos(k), lift = Math.sin(k) > 0 ? 1.7 * Math.sin(k) : 0;
            const port = [a + 1.8, side * (sh.w((a + 1.8) / L2, 3) + 0.2), 3.7];
            tube(S, [port, [port[0] - Math.sin(sw) * 9, port[1] + side * Math.cos(sw) * 9, -0.6 + lift]], 0.3, (nw) => rampRGB(BOIS.wood, nw));
          }
        });
      }
      person(S, a, 0, 1.6, Math.PI, crewPal(V.seed, salt), docked ? 'sit' : 'row', k);
    }
    cargo(S, V.cargo, -2.5, 3.5, -3, 3, () => H.floor, V.seed, BOIS);
    cargo(S, V.cargo, 9.5, 14, -2.4, 2.4, () => H.floor, V.seed + 1, BOIS);
    person(S, -L2 + 4, 0, H.floor, 0, crewPal(V.seed, 30), ctx.state === 'salute' ? 'wave' : 'steer', 1);
  },
};
const CANOT = makeRowboat({ id: 'canot', L: 22, B: 8.4, plank: 1.4, speed: [0.7, 0.95] }, { ...BOIS, net: COMMON.net });
const BAC_BOIS = makeBac({ id: 'bac-bois', L: 30, B: 15 }, BOIS);
const EMB_PLANCHES = makeLanding({ id: 'embarcadere-planches', kind: 'planks' }, BOIS);

// ── BANDE 2 · PIERRE TAILLÉE ──────────────────────────────────────────────────
// LE KNARR — le cargo à bordé à clin : coque goudronnée, étrave et étambot qui se
// relèvent en crosse, grande voile carrée rayée, un seul aviron de gouverne à
// tribord. Le fret sous une bâche de peau entre les deux demi-ponts.
const KNARR = {
  id: 'knarr', role: 'trade', lights: false, len: 56, beam: 15, speed: [1.0, 1.35],
  bounds: [-34, 36, -20, 20, -1, 48], ink: '#1d1611',
  variant(seed) {
    const tar = chance(seed, 1, 0.55);
    return {
      hull: tar ? TAR : OAK, hullIn: OAK_IN, rail: PIERRE.rail, deck: PIERRE.deck,
      band: chance(seed, 6, 0.4) ? [0.4, 1.3] : null, bandRamp: pick([SAIL_RED, SAIL_OCHRE], seed, 7),
      sail: pick(['stripesRed', 'stripesRed', 'wool', 'ochre', 'stripesBlue'], seed, 3),
      cargo: pick(['barrels', 'sacks', 'hides', 'timber'], seed, 4), seed,
    };
  },
  anchors() { return { masthead: [1, 0, 4.4 + 30], stern: [-27, 0, 14] }; },
  build(S, ctx) {
    const V = ctx.variant || this.variant(1);
    const H = { L: 56, B: 15, D: 5.2, sb: 6.5, ss: 6, pb: 1.75, ps: 1.75, flare: 0.25, th: 1, plank: 1.6, open: true, floor: 1.4 };
    const sh = drawHull(S, H, V);
    const L2 = sh.L2;
    // Étrave et étambot en crosse.
    asPart(S, 10, () => {
      for (const u of [1, -1]) {
        const g = sh.g(u);
        tube(S, [[u * (L2 - 2), 0, g - 2], [u * (L2 + 0.5), 0, g + 1], [u * (L2 + 0.8), 0, g + 4.5], [u * (L2 - 0.8), 0, g + 6.5], [u * (L2 - 2.6), 0, g + 5.8]], (t) => 0.95 - 0.4 * t, (nw) => rampRGB(V.hull, nw));
      }
    });
    // Demi-ponts aux deux bouts, bâche de peau sur le fret au milieu.
    asPart(S, 11, () => {
      for (const [a0, a1] of [[-L2 + 2, -L2 + 12], [L2 - 12, L2 - 2]]) {
        surf(S, (u, s) => { const a = a0 + u * (a1 - a0); const w = sh.w(a / L2, sh.g(a / L2)) - 1; return [a, s * Math.max(0, w), sh.g(a / L2) - 1.2]; }, 0, 1, -1, 1,
          (u, s, nw) => rampRGB(PIERRE.deck, nw, ((s + 1) * 4) % 1 < 0.15 ? 1 : 0));
      }
    });
    cargo(S, V.cargo, -L2 + 13, -3, -4.6, 4.6, () => H.floor, V.seed, PIERRE);
    if (V.cargo !== 'timber') {
      asPart(S, 6, () => surf(S, (u, s) => [-L2 + 13.5 + u * 9.5, s * 4.2, H.floor + 3.6 + 1.1 * Math.cos(s * 1.3)], 0, 1, -1, 1, (u, s, nw) => rampRGB(COMMON.hide, nw, u < 0.04 || u > 0.96 ? 1 : 0)));
    }
    const sailRamp = V.sail === 'ochre' ? SAIL_OCHRE : SAIL_WOOL;
    const stripes = V.sail === 'stripesRed' ? { ramp: SAIL_RED, n: 7 } : V.sail === 'stripesBlue' ? { ramp: SAIL_BLUE, n: 7 } : null;
    squareRig(S, { am: 1, hBase: H.floor, mastH: 33, yardH: H.floor + 30, W: 24, Hs: 18, bil: 3.6, ramp: sailRamp, stripes, mast: PIERRE.wood, brails: 0, furled: ctx.state === 'dock' });
    noReflect(S, () => {
      rope(S, [1, 0, H.floor + 32], [L2 - 1, 0, sh.g(1) + 2], '#5b4630');
      rope(S, [1, 0, H.floor + 32], [-L2 + 1, 0, sh.g(-1) + 2], '#5b4630');
    });
    // Aviron de gouverne, À TRIBORD (le « bord du gouvernail »).
    asPart(S, 13, () => {
      const c0 = sh.w(-0.8, sh.g(-0.8)) + 0.5;
      tube(S, [[-L2 + 8, c0, sh.g(-0.8) + 2.5], [-L2 + 2, c0 + 1.4, -0.5]], 0.5, (nw) => rampRGB(OAK_IN, nw));
      box(S, -L2 + 1.2, -L2 + 4, c0 + 1.1, c0 + 1.7, 0, 2.8, (f, u, v, nw) => rampRGB(OAK_IN, nw));
    });
    person(S, -L2 + 6, 1.8, sh.g(-0.8) - 1.2, 0, crewPal(V.seed, 10), 'steer');
    person(S, 4.5, -2.5, H.floor, Math.PI / 2, crewPal(V.seed, 20), ctx.state === 'dock' ? 'haul' : 'stand', ctx.k || 0);
    if (ctx.state === 'salute' || chance(V.seed, 30, 0.6)) person(S, L2 - 7, 0, sh.g(0.75) - 1.2, 0.3, crewPal(V.seed, 30), ctx.state === 'salute' ? 'wave' : 'stand', 1);
  },
};

// LA BARQUE À VOILE — le caboteur de rivière : bordé à clin, une voile carrée
// d'ocre, deux hommes, des sacs.
function makeSailBarque(id, M, sails, o = {}) {
  const L = o.L || 40, B = o.B || 11;
  return {
    id, role: 'trade', len: L, beam: B, speed: o.speed || [0.9, 1.2],
    bounds: [-L / 2 - 4, L / 2 + 6, -16, 16, -1, 34], ink: '#1d1611',
    variant(seed) {
      return { hull: M.hull, hullIn: M.hullIn, rail: M.rail, floor: M.hullIn, seed, sail: pick(sails, seed, 3), cargo: pick(o.cargo || ['sacks', 'barrels', 'crates'], seed, 4), band: chance(seed, 6, 0.4) ? [0.25, 1.1] : null, bandRamp: pick(o.paint || [SAIL_RED], seed, 7) };
    },
    anchors() { return { masthead: [3, 0, 1 + 24], stern: [-L / 2, 0, 6] }; },
    build(S, ctx) {
      const V = ctx.variant || this.variant(1);
      const H = { L, B, D: 3.8, sb: 2.6, ss: 2.2, pb: 1.7, ps: 2.4, ts: o.transom || 0, flare: 0.22, th: 0.9, plank: 1.5, open: true, floor: 1 };
      const sh = drawHull(S, H, V);
      const L2 = sh.L2;
      cargo(S, V.cargo, -L2 + 8, -0.5, -B / 2 + 1.6, B / 2 - 1.6, () => H.floor, V.seed, M);
      squareRig(S, { am: 3, hBase: H.floor, mastH: 24, yardH: H.floor + 22, W: 17, Hs: 13, bil: 2.6, ramp: V.sail, mast: M.wood, brails: 0, cross: o.cross && chance(V.seed, 8, 0.4) ? o.cross : null, furled: ctx.state === 'dock' });
      noReflect(S, () => rope(S, [3, 0, H.floor + 23.5], [L2 - 1, 0, sh.g(1) + 0.5], '#5b4630'));
      asPart(S, 13, () => {
        tube(S, [[-L2 + 1, 0, sh.g(-1) + 2.5], [-L2 - 3, 0, -0.5]], 0.45, (nw) => rampRGB(M.woodIn, nw));
        box(S, -L2 - 3.6, -L2 - 1.4, -0.3, 0.3, 0, 2.2, (f, u, v, nw) => rampRGB(M.woodIn, nw));
      });
      person(S, -L2 + 3, 0, H.floor, 0, crewPal(V.seed, 10), 'steer');
      person(S, L2 - 6, 0.8, H.floor, 0.2, crewPal(V.seed, 20), ctx.state === 'salute' ? 'wave' : (ctx.state === 'dock' ? 'haul' : 'stand'), ctx.k || 1);
    },
  };
}
const BARQUE_VOILE = makeSailBarque('barque-voile', PIERRE, [SAIL_OCHRE, SAIL_WOOL, SAIL_HIDE]);
const CHALAND_PIERRE = makeBarge({ id: 'chaland-pierre', L: 58, B: 16, hut: 'planks', cargo: ['stone', 'stone', 'timber', 'sacks'], paint: [SAIL_RED] }, PIERRE);
const BARQUE = makeRowboat({ id: 'barque', L: 24, B: 9, paint: [SAIL_RED, SAIL_BLUE, SAIL_OCHRE] }, PIERRE);
const BAC_PIERRE = makeBac({ id: 'bac-pierre', L: 30, B: 15 }, PIERRE);

// ── BANDE 3 · COURONNE ────────────────────────────────────────────────────────
// LA COGUE — le gros porteur des royaumes : coque haute et ronde, étrave droite,
// CHÂTEAU crénelé à la poupe et gaillard à la proue, une hune au mât, la grande
// voile aux couleurs du royaume (croix, bandes), une flamme qui claque.
const COGUE = {
  id: 'cogue', role: 'trade', lights: true, len: 60, beam: 19, speed: [0.9, 1.2],
  bounds: [-36, 38, -22, 22, -1, 56], ink: '#1d1611',
  variant(seed) {
    const heraldry = pick(['cross', 'stripes', 'plain', 'cross'], seed, 3);
    const colour = pick([COURONNE.paintRed, COURONNE.paintBlue], seed, 5);
    return {
      hull: OAK, hullIn: OAK_IN, rail: PIERRE.rail, deck: PIERRE.deck,
      band: [0.3, 1.6], bandRamp: colour, heraldry, colour,
      cargo: pick(['barrels', 'wool', 'crates', 'barrels'], seed, 4), seed,
    };
  },
  anchors() { return { masthead: [0, 0, 6 + 38], port: [0, -0.6, 6 + 36], stbd: [0, 0.6, 6 + 36], stern: [-28, 0, 16] }; },
  build(S, ctx) {
    const V = ctx.variant || this.variant(1);
    const H = { L: 60, B: 19, D: 7, sb: 2.2, ss: 2.8, pb: 1.6, ps: 3.2, ts: 0.42, flare: 0.18, th: 1.1, plank: 1.8, deck: 1.4 };
    const sh = drawHull(S, H, V);
    const L2 = sh.L2;
    const hd = (a) => sh.deckH(a / L2);
    // Étrave droite, inclinée.
    asPart(S, 10, () => tube(S, [[L2 - 2, 0, 0.3], [L2 + 3.5, 0, sh.g(1) + 1.5]], 0.9, (nw) => rampRGB(OAK, nw)));
    // CHÂTEAU de poupe : une boîte aux couleurs du royaume, merlons au sommet.
    asPart(S, 11, () => {
      const a0 = -L2 + 1, a1 = -L2 + 15, cw = 7.6, hb = hd(-L2 + 8), ht = 6;
      box(S, a0, a1, -cw, cw, hb, hb + ht, (f, u, v, nw) => {
        if (f === 'top') return rampRGB(PIERRE.deck, nw);
        if (v > 0.72) return rampRGB(V.colour, nw);
        return rampRGB(OAK, nw, ((u * 14) % 2.4) < 0.4 ? 1 : 0);
      });
      for (let a = a0 + 1; a < a1; a += 2.6) for (const c of [-cw + 0.5, cw - 0.5]) boxRamp1(S, a, c, hb + ht, V.colour);
      // Gaillard d'avant (plus bas).
      const b0 = L2 - 11, b1 = L2 - 1, bw = 5.4, hb2 = hd(L2 - 6), ht2 = 3.4;
      box(S, b0, b1, -bw, bw, hb2, hb2 + ht2, (f, u, v, nw) => rampRGB(f === 'top' ? PIERRE.deck : (v > 0.6 ? V.colour : OAK), nw));
    });
    cargo(S, V.cargo, -L2 + 16, L2 - 13, -6.5, 6.5, hd, V.seed, COURONNE);
    // Mâture : grande voile héraldique, hune, flamme.
    const hB = hd(0);
    squareRig(S, {
      am: 0, hBase: hB, mastH: 38, yardH: hB + 33, W: 30, Hs: 20, bil: 4, ramp: SAIL_WOOL, mast: PIERRE.wood, brails: 0,
      cross: V.heraldry === 'cross' ? V.colour : null,
      stripes: V.heraldry === 'stripes' ? { ramp: V.colour, n: 5 } : null,
      furled: ctx.state === 'dock',
    });
    asPart(S, 11, () => {
      surf(S, (u, v) => [1.6 * v * Math.cos(u), 1.6 * v * Math.sin(u), hB + 35.5], 0, Math.PI * 2, 0, 1, (u, v, nw) => rampRGB(OAK, nw));
      surf(S, (u, v) => [1.6 * Math.cos(u), 1.6 * Math.sin(u), hB + 35.5 + v * 1.6], 0, Math.PI * 2, 0, 1, (u, v, nw) => rampRGB(V.colour, nw));
    });
    pennant(S, 0, 0, hB + 40, 9, COURONNE.gold, (V.seed % 7));
    noReflect(S, () => {
      rope(S, [0, 0, hB + 37], [L2 + 3, 0, sh.g(1) + 1.5], '#5b4630');
      rope(S, [0, 0, hB + 37], [-L2 + 2, 0, hd(-L2 + 8) + 6], '#5b4630');
      for (const c of [-1, 1]) rope(S, [0, 0, hB + 34], [-6, c * (sh.w(-0.2, sh.g(-0.2)) - 0.3), sh.g(-0.2)], '#6a5238');
    });
    // Gouvernail d'étambot.
    asPart(S, 13, () => box(S, -L2 - 2.2, -L2 + 0.4, -0.35, 0.35, 0, sh.g(-1) - 1, (f, u, v, nw) => rampRGB(OAK_IN, nw)));
    person(S, -L2 + 6, 0, hd(-L2 + 8) + 6, 0, crewPal(V.seed, 10), 'steer');
    person(S, 3.5, 3, hB, -Math.PI / 2, crewPal(V.seed, 20), ctx.state === 'dock' ? 'haul' : 'stand', ctx.k || 0);
    if (ctx.state === 'salute' || chance(V.seed, 30, 0.6)) person(S, L2 - 6, 0, hd(L2 - 6) + 3.4, 0.3, crewPal(V.seed, 30), ctx.state === 'salute' ? 'wave' : 'stand', 1);
  },
};
// Merlon : un petit cube coloré posé sur le château.
function boxRamp1(S, a, c, h, ramp) {
  box(S, a - 0.6, a + 0.6, c - 0.5, c + 0.5, h, h + 1.2, (f, u, v, nw) => rampRGB(ramp, nw));
}

const GABARE = makeSailBarque('gabare', COURONNE, [SAIL_WOOL, SAIL_OCHRE, SAIL_RED],
  { L: 50, B: 14, transom: 0.5, cargo: ['barrels', 'wool', 'crates', 'sacks'], paint: [COURONNE.paintRed, COURONNE.paintBlue], cross: COURONNE.paintRed, speed: [0.85, 1.15] });
const CHALAND = makeBarge({ id: 'chaland', L: 60, B: 16, hut: 'thatch', cargo: ['barrels', 'wool', 'sacks', 'timber'], paint: [COURONNE.paintRed, COURONNE.paintBlue] }, COURONNE);
const BARQUE_LATINE = makeRowboat({ id: 'barque-latine', L: 26, B: 9.5, lateen: SAIL_WOOL, paint: [COURONNE.paintRed, COURONNE.paintBlue, SAIL_OCHRE] }, COURONNE);
const BAC_TRAILLE = makeBac({ id: 'bac-couronne', L: 32, B: 16, cart: true }, COURONNE);

export const ANCIENT_MODELS = {
  radeau: RADEAU, pirogue: PIROGUE, 'pirogue-peche': PIROGUE_PECHE, 'radeau-bac': RADEAU_BAC, 'embarcadere-rondins': EMB_RONDINS,
  'radeau-voile': RADEAU_VOILE, 'barque-cousue': BARQUE_COUSUE, canot: CANOT, 'bac-bois': BAC_BOIS, 'embarcadere-planches': EMB_PLANCHES,
  knarr: KNARR, 'barque-voile': BARQUE_VOILE, 'chaland-pierre': CHALAND_PIERRE, barque: BARQUE, 'bac-pierre': BAC_PIERRE,
  cogue: COGUE, gabare: GABARE, chaland: CHALAND, 'barque-latine': BARQUE_LATINE, 'bac-couronne': BAC_TRAILLE,
};

export const ANCIENT_FLEET = {
  0: { trade: ['radeau', 'pirogue'], fisher: ['pirogue-peche'], ferry: ['radeau-bac'], landing: 'embarcadere-rondins' },
  1: { trade: ['radeau-voile', 'barque-cousue'], fisher: ['canot'], ferry: ['bac-bois'], landing: 'embarcadere-planches' },
  2: { trade: ['knarr', 'barque-voile'], barge: ['chaland-pierre'], fisher: ['barque'], ferry: ['bac-pierre'], landing: 'embarcadere-planches' },
  3: { trade: ['cogue', 'gabare'], barge: ['chaland'], fisher: ['barque-latine'], ferry: ['bac-couronne'], landing: 'embarcadere-planches' },
};

