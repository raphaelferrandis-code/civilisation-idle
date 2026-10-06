"use strict";
// ── LES FAMILLES DE BATEAUX (docs/PLAN-BATEAUX.md §4) ──────────────────────────
//
// Des modèles PARAMÉTRÉS qu'on retrouve d'une époque à l'autre avec d'autres
// matières : le radeau de rondins, la pirogue, la barque à rames du pêcheur, le
// bac du passeur, le chaland à la perche, l'embarcadère. Chaque fabrique rend un modèle
// complet (même contrat que boatKits : id, role, len, beam, speed, bounds, variant,
// anchors, build). Les kits d'époque (boatKitsAncient, boatKitsModern, boatKitsCosmic)
// les appellent avec leurs matières (M) ; l'équipage, ce sont les habitants de l'ère
// (boatParts.person, boatCrew.js).
//
// M (matières) : hull, hullIn, rail, deck, floor, wood (mâts, perches), woodIn,
//   rope (couleur), net, + couleurs de cargaison (cf. boatParts.cargo) et, au besoin,
//   log / logEnd (rondins), thatch, tile, paint (rampes de liserés).

import { surf, box, boxRamp, tube, rope, ellipsoid, rampRGB, asPart, noReflect, PART, h32 } from './boatBake.js';
import {
  pick, chance, glow, drawHull, person, poler, crewPal, cargo, rowOars, netPile, lateenRig, squareRig, railing,
} from './boatParts.js';

const rnd = (seed, salt, n) => h32(seed, salt, 97) % n;

// ── RADEAU DE RONDINS ─────────────────────────────────────────────────────────
// o = { id, role, L, B, logR, sail: rampe | null, cargo: [kinds], crew (nombre),
//       passengers (bac), speed }
export function makeRaft(o, M) {
  const L = o.L || 34, B = o.B || 15, R = o.logR || 1.25;
  const n = Math.max(4, Math.round(B / (2 * R)));
  return {
    id: o.id, role: o.role || 'trade', len: L, beam: B, speed: o.speed || [0.5, 0.75],
    anim: { frames: 4, period: 3.2, still: ['dock'] },
    bounds: [-L / 2 - 10, L / 2 + 6, -B / 2 - 8, B / 2 + 8, -1, o.sail ? 32 : 14],
    ink: '#1d1611',
    variant(seed) { return { seed, cargo: pick(o.cargo || ['hides'], seed, 4) }; },
    anchors() { return { stern: [-L / 2, 0, 4] }; },
    build(S, ctx) {
      const V = ctx.variant || this.variant(1);
      const k = ctx.k || 0;
      // Les rondins : longueurs inégales, bouts coupés plus clairs.
      asPart(S, 2, () => {
        for (let i = 0; i < n; i += 1) {
          const c = -B / 2 + R + i * ((B - 2 * R) / (n - 1));
          const a0 = -L / 2 + (rnd(V.seed, 10 + i, 3) - 1), a1 = L / 2 - (rnd(V.seed, 20 + i, 3));
          tube(S, [[a0, c, R * 0.45], [a1, c, R * 0.45]], R, (nw) => rampRGB(M.log, nw));
          for (const a of [a0, a1]) {
            surf(S, (u, v) => [a, c + v * R * Math.cos(u), R * 0.45 + v * R * Math.sin(u)], 0, Math.PI * 2, 0, 1,
              (u, v, nw) => rampRGB(M.logEnd, nw, v > 0.7 ? 1 : 0));
          }
        }
      });
      // Les traverses et leurs liens.
      asPart(S, 4, () => {
        for (const a of [-L / 2 + 5, 0, L / 2 - 5]) {
          tube(S, [[a, -B / 2 - 0.4, R * 1.55], [a, B / 2 + 0.4, R * 1.55]], 0.55, (nw) => rampRGB(M.woodIn, nw));
        }
      });
      const top = R * 1.6;
      const hAt = () => top;
      if (o.sail) {
        squareRig(S, { am: 3, hBase: top, mastH: 22, yardH: top + 20, W: Math.min(B + 2, 16), Hs: 13, bil: 2.2, ramp: o.sail, mast: M.wood, brails: 0, furled: ctx.state === 'dock' });
      }
      if (o.passengers) {
        const np = 2 + (h32(V.seed, 40) % 3);
        for (let i = 0; i < np; i += 1) {
          person(S, -L / 2 + 10 + i * 4.4, ((h32(V.seed, 41, i) % 5) - 2) * 1.3, top, (h32(V.seed, 42, i) % 8) * (Math.PI / 4), crewPal(V.seed, 50 + i * 7), ctx.state === 'salute' && i === 0 ? 'wave' : 'stand', 1);
        }
      } else {
        cargo(S, V.cargo, -6, 8, -B / 2 + 2, B / 2 - 2, hAt, V.seed, M);
      }
      // Le perchiste à l'arrière (toujours).
      person(S, -L / 2 + 3.5, 1.4, top, 0, crewPal(V.seed, 10), 'pole', k);
      asPart(S, PART.oar, () => {
        const lean = 0.35 * Math.sin(k);
        tube(S, [[-L / 2 + 5.5 + lean, 1.0, top + 6.3], [-L / 2 - 6 + lean * 4, 2.2, -0.8]], 0.32, (nw) => rampRGB(M.wood, nw));
      });
      if (o.crew > 1 && !o.passengers) person(S, L / 2 - 4, -1.5, top, 0.2, crewPal(V.seed, 20), ctx.state === 'salute' ? 'wave' : 'stand', 1);
    },
  };
}

// ── PIROGUE MONOXYLE ──────────────────────────────────────────────────────────
// Un tronc évidé : étroit, bas, pagayeurs à genoux. o.fisher : un homme se lève,
// la sagaie pointée vers l'eau, quand la pirogue est posée.
export function makeDugout(o, M) {
  const L = o.L || 30, B = o.B || 6.4;
  return {
    id: o.id, role: o.role || 'trade', len: L, beam: B, speed: o.speed || [0.8, 1.1],
    // À quai, les pagaies sont rentrées et les deux hommes assis : la phase n'y sert à
    // rien, une image au lieu de quatre (audit du 05/10, PERF-14).
    anim: { frames: 4, period: 1.6, still: ['dock'] },
    bounds: [-L / 2 - 4, L / 2 + 4, -10, 10, -1, 14],
    ink: '#1d1611',
    variant(seed) { return { seed, cargo: pick(o.cargo || ['hides'], seed, 4) }; },
    anchors() { return { stern: [-L / 2, 0, 3] }; },
    build(S, ctx) {
      const V = ctx.variant || this.variant(1);
      const H = { L, B, D: 2.6, sb: 0.9, ss: 0.9, pb: 1.5, ps: 1.7, flare: 0.1, th: 0.8, plank: 0, open: true, floor: 0.7 };
      drawHull(S, H, { hull: M.log, hullIn: M.logIn || M.woodIn, rail: M.logEnd, floor: M.logIn || M.woodIn });
      const k = ctx.k || 0;
      const fishing = o.fisher && (ctx.state === 'anchor' || ctx.state === 'fish');
      const kneel = (a, salt, pose) => person(S, a, 0, H.floor - 0.3, 0, crewPal(V.seed, salt), pose, k);
      if (fishing) {
        kneel(-L / 2 + 6, 10, 'sit');
        // Debout à la proue, la sagaie pointée vers l'eau.
        person(S, L / 2 - 8, 0, H.floor, Math.PI / 2, crewPal(V.seed, 20), 'haul', k);
        asPart(S, PART.oar, () => tube(S, [[L / 2 - 6, 1.6, 7.5], [L / 2 - 2, 5.5, -0.5]], 0.28, (nw) => rampRGB(M.wood, nw)));
      } else {
        kneel(-L / 2 + 6, 10, ctx.state === 'dock' ? 'sit' : 'paddle');
        kneel(L / 2 - 8, 20, ctx.state === 'salute' ? 'wave' : (ctx.state === 'dock' ? 'sit' : 'paddle'));
        if (ctx.state !== 'dock') {
          asPart(S, PART.oar, () => {
            for (const [a, salt] of [[-L / 2 + 6, 1], [L / 2 - 8, 2]]) {
              if (salt === 2 && ctx.state === 'salute') continue;
              const sw = Math.cos(k + salt);
              tube(S, [[a + 0.8 + sw, 2.2, 5.4], [a - 0.6 + sw * 1.6, 4.4, -0.4]], 0.3, (nw) => rampRGB(M.wood, nw));
            }
          });
        }
        if (!o.fisher) cargo(S, V.cargo, -4, 5, -B / 2 + 1.3, B / 2 - 1.3, () => H.floor, V.seed, M);
      }
    },
  };
}

// ── BARQUE À RAMES (le pêcheur, toutes époques à voile et à rames) ─────────────
// o = { id, L, B, lateen: rampe (voile latine en route) | null, paint: [rampes],
//       speed }
export function makeRowboat(o, M) {
  const L = o.L || 24, B = o.B || 9;
  return {
    id: o.id, role: o.role || 'fisher', len: L, beam: B, speed: o.speed || [0.7, 0.95],
    // Vide à quai (bassins, pontons), rien ne bouge : les rames rangées ignorent k.
    // Une seule image au lieu de six (revue du 04/10) — PAS `still`, qui figerait
    // aussi le rameur d'une barque habitée à quai sur le fleuve.
    // La barque à voile LATINE, elle, ne rame jamais : hors de la pêche, ni sa voile ni
    // son barreur ni son passager ne lisent la phase — six poses identiques par cap,
    // une seule désormais (audit du 05/10, PERF-14).
    anim: { frames: 6, period: 2.2, stillEmpty: ['dock'], ...(o.lateen ? { still: ['cruise', 'dock', 'salute', 'return', 'unload'] } : {}) },
    bounds: [-L / 2 - 4, L / 2 + 4, -16, 16, -1, o.lateen ? 26 : 12],
    ink: '#1d1611',
    variant(seed) {
      const band = o.paint ? pick([...o.paint, null], seed, 2) : null;
      return { hull: M.hull, hullIn: M.hullIn, rail: M.rail, floor: M.hullIn, band: band ? [0.2, 1.1] : null, bandRamp: band, seed };
    },
    anchors() { return { stern: [-L / 2 + 1, 0, 5] }; },
    build(S, ctx) {
      const V = ctx.variant || this.variant(1);
      const H = { L, B, D: 3.4, sb: o.sb || 1.8, ss: o.ss || 1.5, pb: 1.7, ps: o.ps || 2.2, ts: o.ts || 0, flare: 0.2, th: 0.9, plank: o.plank == null ? 1.7 : o.plank, open: true, floor: 0.8 };
      const sh = drawHull(S, H, V);
      const L2 = sh.L2;
      asPart(S, 11, () => {
        for (const a of [-L2 * 0.29, L2 * 0.375]) {
          const u = a / L2, wi = sh.w(u, 2.4) - 0.9;
          boxRamp(S, a - 0.9, a + 0.9, -wi, wi, 1.9, 2.4, M.deck);
        }
      });
      // Barque de PLAISANCE amarrée (o.empty) : vide, rames rentrées, ni filet ni homme.
      if (o.empty) {
        rowOars(S, -L2 * 0.12, sh.w(-0.12, 3) + 0.2, 3.6, L * 0.33, 0, M.wood, true);
        return;
      }
      netPile(S, -L2 + 4.5, 0.6, H.floor, M.net);
      const k = ctx.k || 0;
      const fishing = ctx.state === 'anchor' || ctx.state === 'fish';
      if (!fishing) {
        if (o.lateen) {
          lateenRig(S, { am: L2 * 0.45, hBase: H.floor, mastH: 13, len: 16, bil: 1.6, ramp: o.lateen, mast: M.wood });
          person(S, -L2 + 3, 0, H.floor, 0, crewPal(V.seed, 10), 'steer');
          person(S, -1, 0.5, 1.9, 0, crewPal(V.seed, 20), ctx.state === 'salute' ? 'wave' : 'sit', 1);
        } else {
          rowOars(S, -L2 * 0.12, sh.w(-0.12, 3) + 0.2, 3.6, L * 0.33, k, M.wood, ctx.state === 'dock');
          person(S, -L2 * 0.27, 0, 1.9, Math.PI, crewPal(V.seed, 10), 'row', k);
          person(S, -L2 + 3, 0, H.floor, 0, crewPal(V.seed, 20), ctx.state === 'salute' ? 'wave' : 'sit', 1);
        }
      } else {
        person(S, L2 * 0.3, 1.0, H.floor, Math.PI / 2, crewPal(V.seed, 10), 'haul', k);
        person(S, -L2 * 0.375, -0.6, 1.9, 0, crewPal(V.seed, 20), 'sit');
        noReflect(S, () => rope(S, [L2 * 0.4, 3.2, 2.6], [L2 * 0.55, 7.5, 0], M.netLine || '#cfc4a6'));
      }
    },
  };
}

// ── LE BAC DU PASSEUR (plateforme à la perche) ────────────────────────────────
// o = { id, L, B, cart: bool (une charrette et son âne à bord), speed }
export function makeBac(o, M) {
  const L = o.L || 30, B = o.B || 15;
  return {
    id: o.id, role: 'ferry', len: L, beam: B, speed: o.speed || [0.45, 0.6],
    anim: { frames: 4, period: 3.2, still: ['dock'] },
    bounds: [-L / 2 - 8, L / 2 + 8, -B / 2 - 6, B / 2 + 6, -1, 16],
    ink: '#1d1611',
    variant(seed) { return { hull: M.hull, hullIn: M.hullIn, rail: M.rail, deck: M.deck, seed }; },
    anchors() { return { stern: [-L / 2, 0, 4] }; },
    build(S, ctx) {
      const V = ctx.variant || this.variant(1);
      const H = { L, B, D: 2.5, sb: 0.4, ss: 0.4, pb: 6, ps: 6, tb: 0.92, ts: 0.92, flare: 0.05, th: 0.8, plank: 1.4, deck: 0.35 };
      const sh = drawHull(S, H, V);
      const L2 = sh.L2;
      const hdk = sh.deckH(0);
      for (const side of [-1, 1]) railing(S, -L2 + 3, L2 - 3, side * (sh.w(0, H.D) - 0.6), hdk, 3.2, M.woodIn, 4.8);
      const k = ctx.k || 0;
      person(S, -L2 + 3, 1.5, hdk, 0, crewPal(V.seed, 10), 'pole', k);
      asPart(S, PART.oar, () => {
        const lean = 0.35 * Math.sin(k);
        tube(S, [[-L2 + 5 + lean, 1.1, hdk + 6.3], [-L2 - 6 + lean * 4, 2.2, -0.8]], 0.32, (nw) => rampRGB(M.wood, nw));
      });
      if (o.cart && chance(V.seed, 45, 0.6)) {
        // Une charrette à deux roues, timon au sol.
        asPart(S, 6, () => {
          boxRamp(S, -2, 5, -2.6, 2.6, hdk + 2.2, hdk + 3.2, M.woodIn);
          box(S, -2, 5, -2.7, 2.7, hdk + 3.2, hdk + 4.6, (f, u, v, nw) => rampRGB(f === 'top' ? (M.hay || M.sack) : M.wood, nw));
          for (const c of [-3, 3]) {
            surf(S, (u, v) => [1.5 + 2.1 * v * Math.cos(u), c, hdk + 2.1 + 2.1 * v * Math.sin(u)], 0, Math.PI * 2, 0, 1,
              (u, v, nw) => rampRGB(M.woodIn, nw, v > 0.75 ? 0 : 1));
          }
          tube(S, [[5, 0, hdk + 2.6], [10, 0, hdk + 0.4]], 0.35, (nw) => rampRGB(M.wood, nw));
        });
        person(S, L2 - 4, -2.5, hdk, Math.PI, crewPal(V.seed, 60), 'stand', k);
      } else {
        const n = 2 + (h32(V.seed, 40) % 3);
        for (let i = 0; i < n; i += 1) {
          const a = -L2 + 9 + i * 4.6;
          const c = ((h32(V.seed, 41, i) % 5) - 2) * 1.4;
          person(S, a, c, hdk, (h32(V.seed, 42, i) % 8) * (Math.PI / 4), crewPal(V.seed, 50 + i * 7), i === 0 && (ctx.state === 'salute' || chance(V.seed, 43, 0.3)) ? 'wave' : 'stand', k);
        }
      }
    },
  };
}

// ── LE CHALAND À LA PERCHE ─────────────────────────────────────────────────────
// o = { id, L, B, cargo: [kinds], hut: 'thatch' | 'planks' | 'cabin', hatches
//       (panneaux de cale au lieu de cargaison à l'air), pole (false : automoteur,
//       pas de perchiste), crew (false : personne sur le pont — la péniche, un grand
//       bateau), speed, paint: [rampes] }
// ⛔ PLUS DE HALAGE (Raph, 2026-10-03 : « plus de halage du tout ») : la bête marchait
// en haut du quai, dans la rue, et sa corde balayait le mur et les escaliers. Le
// chaland avance à la PERCHE : un batelier sur le plat-bord, la perche plantée en arrière.
export function makeBarge(o, M) {
  const L = o.L || 60, B = o.B || 16;
  const pole = o.pole !== false;
  return {
    id: o.id, role: 'barge', len: L, beam: B, speed: o.speed || [0.55, 0.75],
    ...(pole ? { anim: { frames: 4, period: 3.2, still: ['dock'] } } : {}),
    bounds: [-L / 2 - 8, L / 2 + 4, -B / 2 - 3, B / 2 + 3, -1, 26],
    ink: '#1d1611',
    variant(seed) {
      const band = o.paint ? pick(o.paint, seed, 2) : null;
      return {
        hull: M.hull, hullIn: M.hullIn, rail: M.rail, deck: M.deck,
        band: band && chance(seed, 1, 0.6) ? [0.3, 1.2] : null, bandRamp: band,
        cargo: pick(o.cargo || ['sacks'], seed, 4), seed,
      };
    },
    anchors() { return { stern: [-L / 2 + 2, 0, 8] }; },
    build(S, ctx) {
      const V = ctx.variant || this.variant(1);
      const k = ctx.k || 0;
      const H = { L, B, D: 3.3, sb: 2.4, ss: 2.8, pb: 4, ps: 4, tb: 0.62, ts: 0.7, flare: 0.08, th: 1.1, plank: o.plank == null ? 1.9 : o.plank, open: !o.hatches, floor: 1.1, deck: o.hatches ? 0.8 : 0 };
      const sh = drawHull(S, H, V);
      const L2 = sh.L2;
      const floor = o.hatches ? sh.deckH(0) : H.floor;
      // L'abri du batelier, à l'arrière.
      asPart(S, 11, () => {
        const a0 = -L2 + 3.5, a1 = -L2 + 10, cw = 4.6, hb = floor, hw = o.hut === 'cabin' ? 4.2 : 5.2;
        box(S, a0, a1, -cw, cw, hb, hb + hw, (f, u, v, nw) => {
          if (o.hut === 'cabin' && f !== 'top' && v > 0.45 && v < 0.75 && (u * 10) % 3 > 1.6) return rampRGB(M.glass || M.woodIn, nw);
          return rampRGB(o.hut === 'cabin' ? (M.paintCabin || M.wood) : M.woodIn, nw, ((u * 10) % 1.8) < 0.4 && o.hut !== 'cabin' ? 1 : 0);
        });
        if (o.hut === 'cabin') {
          boxRamp(S, a0 - 0.3, a1 + 0.3, -cw - 0.3, cw + 0.3, hb + hw, hb + hw + 0.6, M.roof || M.woodIn);
          tube(S, [[a0 + 1.5, 2, hb + hw + 0.6], [a0 + 1.5, 2, hb + hw + 3.2]], 0.45, (nw) => rampRGB(M.iron || M.woodIn, nw, 2));
        } else {
          const roof = o.hut === 'thatch' ? M.thatch : M.wood;
          for (const side of [-1, 1]) {
            surf(S, (u, v) => [a0 - 0.6 + u * (a1 - a0 + 1.2), side * (cw + 0.7) * (1 - v), hb + hw + v * 2.4], 0, 1, 0, 1,
              (u, v, nw) => rampRGB(roof, nw, ((v * 9) % 1) < 0.25 ? 1 : 0));
          }
        }
      });
      // Gouvernail de poupe (safran sur mèche).
      asPart(S, 13, () => {
        tube(S, [[-L2 + 1, 0, sh.g(-1) + 3.5], [-L2 - 4.5, 0, -0.5]], 0.5, (nw) => rampRGB(M.woodIn, nw));
        box(S, -L2 - 5.2, -L2 - 2.6, -0.3, 0.3, 0, 2.2, (f, u, v, nw) => rampRGB(M.woodIn, nw));
      });
      if (o.hatches) {
        // Panneaux de cale : des bâches/couvercles bombés en série.
        asPart(S, 6, () => {
          for (let a = -L2 + 12; a < L2 - 5; a += 6.2) {
            surf(S, (u, s) => [a + u * 5.6, s * (B / 2 - 2.2), floor + 0.6 + 1.3 * Math.cos(s * Math.PI / 2)], 0, 1, -1, 1,
              (u, s, nw) => rampRGB(M.hatch || M.woodIn, nw, u < 0.06 ? 2 : 0));
          }
        });
      } else {
        cargo(S, V.cargo, -L2 + 11.5, L2 - 4, -B / 2 + 2.2, B / 2 - 2.2, () => floor, V.seed, M);
      }
      if (o.crew === false) return;
      person(S, -L2 + 1.8, 0, sh.g(-1) - 0.6, 0, crewPal(V.seed, 10), 'steer');
      if (pole) poler(S, sh, L2 * 0.3, chance(V.seed, 21, 0.5) ? 1 : -1, crewPal(V.seed, 30), M.woodIn, k);
      if (ctx.state === 'salute' || chance(V.seed, 20, 0.5)) person(S, L2 - 3, 1.5, floor, 0, crewPal(V.seed, 20), ctx.state === 'salute' ? 'wave' : 'stand', 1);
    },
  };
}


// ── L'EMBARCADÈRE DU PASSEUR ──────────────────────────────────────────────────
// o = { id, kind: 'logs' | 'planks' | 'iron' | 'steel' | 'nacre', glow (couleur),
//       reach (px d'art de tablier EN PLUS vers le large, 0 par défaut) }
// Origine = le bord du ruban, +a vers le large : le tablier part de la berge (−14)
// et s'avance de 10 px au-dessus de l'eau.
//
// LE TABLIER ALLONGÉ (`reach`, retour Raph du 2026-10-03 : le bac ne doit plus
// monter sur le quai). Sur la rive dont on voit le MUR de quai, l'eau commence au
// pied du mur, plus bas à l'écran : le bac s'arrête là, et le tablier s'avance
// au-dessus de la face du mur jusqu'à lui, sur des pieux qui descendent jusqu'à
// l'eau. La profondeur d'un pieu se lit dans le cap de la cuisson : la ligne du pied
// du mur passe par le bout du tablier (posé sur l'eau), et un pas d'un px vers la
// berge la place 1 / (cos θ + sin θ) px plus bas sous lui (cf. riverFleet.
// quayHiddenDepth — même projection). Modèle dérivé : `withReach(px)`.
//
// LE PONTON FLOTTANT (makeLanding.asPontoon, iso/boatLandings.js) : un plancher posé sur
// des flotteurs, au ras de l'eau — au pied d'un escalier du quai (il prolonge le palier
// d'en bas, collé au mur, de la largeur de la volée) ou au bord d'une rive au mur caché.
// `len` px de long (a de −3 à len : il mord sur le palier, pas un pixel d'eau entre
// eux), FLOAT_W de large (c de −FLOAT_W/2 à +FLOAT_W/2), des taquets, et pour la navette
// des Plaisirs la potence de la lanterne rouge au bout.
export const FLOAT_W = 10;
function floatingPontoon(S, k, M, len, lantern) {
  const FLOAT_LEN = len;
  const deckCol = (f, u, v, nw) => {
    if (f !== 'top') return rampRGB(M.landSide || M.woodIn, nw, 1);
    if (k === 'nacre' || k === 'steel') return rampRGB(M.landDeck || M.deck, nw, (u * FLOAT_LEN) % 6 < 0.45 ? 1 : 0);
    return rampRGB(M.landDeck || M.deck, nw, (u * FLOAT_LEN) % 2.2 < 0.45 ? 2 : 0);
  };
  asPart(S, 2, () => {
    // Les flotteurs : une bande sombre au ras de l'eau, en retrait du plancher.
    boxRamp(S, 0, FLOAT_LEN - 1, -FLOAT_W / 2 + 0.8, FLOAT_W / 2 - 0.8, 0, 1.3, M.landSide || M.woodIn, 2);
    box(S, -3, FLOAT_LEN, -FLOAT_W / 2, FLOAT_W / 2, 1.3, 2.3, deckCol);
  });
  asPart(S, 10, () => {
    for (const a of FLOAT_LEN >= 30 ? [8, FLOAT_LEN / 2, FLOAT_LEN - 8] : [3, FLOAT_LEN - 3]) boxRamp(S, a - 0.6, a + 0.6, FLOAT_W / 2 - 1.4, FLOAT_W / 2 - 0.4, 2.3, 3.3, M.landPost || M.woodIn, 1);
  });
  if (lantern) landingLantern(S, FLOAT_LEN - 1.5, 0, 2.3, 9.4, M);
}
// La potence et sa lanterne rouge (la même que celles du bateau-lanterne). (a, c) : le
// pied de la potence ; h0 : le plancher ; hl : la lanterne.
function landingLantern(S, a, c, h0, hl, M) {
  asPart(S, PART.mast, () => {
    tube(S, [[a, c, h0], [a, c, hl + 2.2]], 0.45, (nw) => rampRGB(M.landPost || M.woodIn, nw));
    tube(S, [[a, c, hl + 2], [a + 2.4, c, hl + 2]], 0.3, (nw) => rampRGB(M.landPost || M.woodIn, nw));
  });
  asPart(S, 10, () => {
    ellipsoid(S, a + 2.2, c, hl, 0.95, 0.95, 1.15, (nw) => rampRGB(['#ff6a4c', '#f04a35', '#cf3328', '#a8241d'], nw));
    boxRamp(S, a + 1.75, a + 2.65, c - 0.45, c + 0.45, hl + 1.0, hl + 1.4, ['#f6dc7a', '#e3bb4f', '#c49738', '#9a7228']);
    boxRamp(S, a + 1.75, a + 2.65, c - 0.45, c + 0.45, hl - 1.4, hl - 1.0, ['#f6dc7a', '#e3bb4f', '#c49738', '#9a7228']);
  });
}

export function makeLanding(o, M) {
  const R = Math.max(0, Math.round(o.reach || 0));
  const tip = 10 + R;
  return {
    id: o.id, role: 'landing', len: 30 + R, beam: 22,
    bounds: [-20, 20 + R, -14, 14, R ? -40 : -1, 14],
    ink: '#1d1611',
    variant(seed) { return { seed }; },
    // La lanterne du ponton de la NAVETTE DES PLAISIRS (o.lantern) : allumée la nuit.
    anchors() {
      if (!o.lantern) return {};
      return o.float ? { lamp0: [o.float + 0.7, 0, 9.4] } : { lamp0: [tip + 1.2, -5.6, 11.2] };
    },
    withReach(r) { return makeLanding({ ...o, id: o.id + '@' + Math.round(r), reach: r }, M); },
    withLantern() { return makeLanding({ ...o, id: o.id + '!lanterne', lantern: true }, M); },
    // Le PONTON FLOTTANT de la navette, au pied d'un escalier du quai (isoQuay, volée
    // demandée) : au ras de l'eau, il part du palier d'en bas vers le large.
    // `len` px de long ; `lantern` : la lanterne rouge de la navette des Plaisirs.
    asPontoon(len, lantern = false) {
      const M2 = makeLanding({ ...o, id: o.id + '!ponton' + len + (lantern ? 'L' : ''), lantern, float: len }, M);
      return { ...M2, bounds: [-8, len + 6, -FLOAT_W, FLOAT_W, -1, 14] };
    },
    build(S) {
      const k = o.kind || 'planks';
      if (o.float) { floatingPontoon(S, k, M, o.float, o.lantern); return; }
      asPart(S, 2, () => {
        if (k === 'logs') {
          for (let c = -6; c <= 6; c += 2.4) tube(S, [[-14, c, 3.4], [tip, c, 3.4]], 1.15, (nw) => rampRGB(M.log, nw));
        } else {
          const D = 24 + R;
          box(S, -14, tip, -7, 7, 3.2, 4.2, (f, u, v, nw) => {
            if (f !== 'top') return rampRGB(M.landSide || M.woodIn, nw, 1);
            if (k === 'nacre') return rampRGB(M.deck, nw, (u * D) % 6 < 0.4 ? 1 : 0);
            const step = k === 'planks' ? 2.2 : 4;
            const kk = Math.floor(u * D / step);
            return rampRGB(M.landDeck || M.deck, nw, (u * D) % step < 0.45 ? 2 : (h32(kk, 3, 7) % 3 === 0 ? 1 : 0));
          });
        }
      });
      asPart(S, PART.mast, () => {
        // Pieux : les trois d'origine, puis un tous les 8 px sous le tablier allongé.
        const piles = [-11, -3, 5];
        for (let a = 13; a <= tip - 3; a += 8) piles.push(a);
        const k45 = Math.max(0.3, S.fx + S.fy);
        for (const a of piles) for (const c of [-6.2, 6.2]) {
          // Au-dessus de la face du mur (0 < a < bout) : jusqu'au pied du mur.
          const low = R && a > 0 ? Math.max(-38, -0.5 - (tip - a) / k45) : -0.5;
          const pile = () => tube(S, [[a, c, low], [a, c, 3.2]], 0.55, (nw) => rampRGB(M.landPost || M.woodIn, nw, 1));
          // Sous la ligne d'eau, un pieu n'a pas de reflet (il serait retourné AU-DESSUS).
          if (low < -0.5) noReflect(S, pile); else pile();
        }
      });
      asPart(S, 10, () => {
        for (const c of [-5.6, 5.6]) {
          tube(S, [[tip - 1, c, 3], [tip - 1, c, 7.2]], 0.75, o.glow ? glow(o.glow) : (nw) => rampRGB(M.landPost || M.wood, nw));
        }
        if (k === 'iron' || k === 'steel' || k === 'nacre') {
          railing(S, -13, tip - 2, -6.6, 4.2, 3, M.landRail || M.woodIn, 3.5);
          railing(S, -13, tip - 2, 6.6, 4.2, 3, M.landRail || M.woodIn, 3.5);
        }
      });
      // Le signe de la Maison au bout du ponton : une potence et sa lanterne rouge.
      if (o.lantern) landingLantern(S, tip - 1, -5.6, 3, 11.2, M);
    },
  };
}

// Une figure de proue / un étendard : flamme triangulaire au vent (pièce pleine).
export function pennant(S, a, c, h, len, ramp, k = 0) {
  asPart(S, 16, () => {
    surf(S, (u, v) => [a - u * len, c + Math.sin(u * 3 + k) * 0.8 * u, h - v * (1.6 * (1 - u))], 0, 1, 0, 1,
      (u, v, nw) => rampRGB(ramp, nw));
  });
}
