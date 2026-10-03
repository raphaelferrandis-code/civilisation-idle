"use strict";
// ── LES BATEAUX DES ÉPOQUES COSMIQUES (docs/PLAN-BATEAUX.md §1, §4) ─────────────
//
// Raph : « un peu des trois » — et la répartition proposée :
//   7 · Noosphère  des CLASSIQUES SUBLIMÉS : coques de nacre, voiles de lumière,
//                  mâts qui luisent ; la forme d'un voilier, la matière d'un rêve
//   8 · Stellaire  des GLISSEURS : coques de nacre effilées, catamarans à aile
//                  rigide, filets lumineux le long des carènes
//   9 · Démiurge   la LÉVITATION : les coques flottent au-dessus de l'eau, un halo
//                  dessous ; elles ne touchent plus le fleuve
// Une même main : la nacre des maisons cosmiques, et la lueur de l'ère (celle des
// quais et du pont : vert, or, violet).

import { surf, box, tube, rampRGB, asPart, inFrame, PART, h32, rgbOf } from './boatBake.js';
import { glow, drawHull, person, crewPal, cabin } from './boatParts.js';
import { makeLanding } from './boatFamilies.js';

const GLOW = { 7: '#5af0b4', 8: '#ffcd78', 9: '#aa8cff' };
const DEEP = { 7: '#1d5640', 8: '#4a3a1c', 9: '#322a52' };
// Hauteur de lévitation (px) des coques du Démiurge.
export const HOVER = 7;

// Nacre : blancs nacrés, une pointe de la couleur de l'ère dans les ombres.
function nacre(band) {
  const g = rgbOf(GLOW[band]);
  const tint = (c, k) => {
    const b = rgbOf(c);
    return '#' + [0, 1, 2].map((i) => Math.round(b[i] * (1 - k) + g[i] * k).toString(16).padStart(2, '0')).join('');
  };
  return {
    shell: [tint('#f7f5fa', 0.02), tint('#e7e4f0', 0.05), tint('#d1cde2', 0.08), tint('#b7b3cf', 0.1), tint('#9894b3', 0.12), tint('#7a7795', 0.14)],
    shellIn: [tint('#d1cde2', 0.08), tint('#b7b3cf', 0.1), tint('#9894b3', 0.12), tint('#7a7795', 0.14), tint('#5c5a77', 0.16)],
    // Verre teinté de la lueur de l'ère.
    crystal: [tint('#f2f8fb', 0.25), tint('#d6e6f0', 0.32), tint('#b0c9da', 0.38), tint('#8aa7bf', 0.42), tint('#6a86a0', 0.45)],
    // Voile de lumière : presque blanche, teintée.
    light: [tint('#fbfdfc', 0.18), tint('#eef6f2', 0.26), tint('#d9ebe3', 0.34), tint('#bed9cd', 0.42), tint('#9fc2b4', 0.5)],
    glow: GLOW[band], deep: DEEP[band],
  };
}


// Cargaison de LUMIÈRE : cubes de cristal qui luisent par la tranche.
function lightCargo(S, a0, a1, c0, c1, h, N, seed) {
  asPart(S, 6, () => {
    for (let a = a0 + 1.4; a <= a1 - 1.3; a += 3) {
      for (let c = c0 + 1.4; c <= c1 - 1.3; c += 3) {
        const z = 1.6 + (h32(seed, Math.round(a * 3 + c), 9) % 3) * 0.6;
        box(S, a - 1.2, a + 1.2, c - 1.2, c + 1.2, h, h + z * 1.4, (f, u, v, nw) => {
          const edge = u < 0.12 || u > 0.88 || v > 0.88;
          return edge ? rgbOf(N.glow) : rampRGB(N.crystal, nw);
        });
      }
    }
  });
}

// Mât et vergue de LUMIÈRE, voile translucide aux ralingues lumineuses.
function lightRig(S, am, hBase, mastH, W, Hs, N, furled) {
  asPart(S, PART.mast, () => tube(S, [[am, 0, hBase], [am, 0, hBase + mastH]], 0.5, glow(N.glow)));
  const yh = hBase + mastH - 2;
  asPart(S, PART.yard, () => tube(S, [[am + 0.6, -W / 2, yh - 0.4], [am + 0.6, 0, yh], [am + 0.6, W / 2, yh - 0.4]], 0.4, glow(N.glow)));
  if (furled) return;
  asPart(S, PART.sail, () => {
    surf(S, (s, v) => {
      const bil = 3 * (1 - s * s) * Math.sin(Math.PI * (0.1 + 0.85 * v)) * (0.55 + 0.45 * v);
      return [am + 1 + bil, s * (W / 2) * (1 - 0.12 * v), yh - 0.6 - v * Hs];
    }, -1, 1, 0, 1, (s, v, nw) => {
      if (Math.abs(s) > 0.95 || v > 0.95) return rgbOf(N.glow);
      return rampRGB(N.light, nw, (Math.floor((s + 1) * 4) % 2) ? 1 : 0);
    });
  });
}

// Enveloppe commune : le Démiurge fait léviter tout le modèle de HOVER px.
function lift(band, S, fn) {
  if (band >= 9) inFrame(S, 0, 0, HOVER, 0, fn); else fn();
}

// ── Marchand A : voilier solaire (7) · glisseur (8) · arche (9) ────────────────
function makeTradeA(band) {
  const N = nacre(band);
  const hover = band >= 9;
  const L = band === 8 ? 66 : 60, B = band === 8 ? 13 : 15;
  const id = band === 7 ? 'voilier-solaire' : band === 8 ? 'glisseur' : 'arche';
  return {
    id, role: 'trade', lights: true, hover, glow: N.glow, len: L, beam: B, speed: band === 8 ? [1.5, 1.9] : [1.2, 1.5],
    bounds: [-L / 2 - 6, L / 2 + 8, -B / 2 - 8, B / 2 + 8, -1, (band === 7 ? 46 : 26) + (hover ? HOVER : 0)], ink: '#1d1611',
    variant(seed) { return { hull: N.shell, hullIn: N.shellIn, rail: N.shell, deck: N.shellIn, smoothDeck: true, glowRail: N.glow, seed }; },
    anchors() { const h = hover ? HOVER : 0; return band === 7 ? { masthead: [2, 0, h + 4.8 + 34], port: [2, -0.6, h + 4.8 + 32], stbd: [2, 0.6, h + 4.8 + 32] } : { masthead: [-14, 0, h + 4 + 13], port: [-14, -0.7, h + 4 + 12], stbd: [-14, 0.7, h + 4 + 12] }; },
    build(S, ctx) {
      const V = ctx.variant || this.variant(1);
      lift(band, S, () => {
        const H = band === 8
          ? { L, B, D: 3.4, sb: 1.2, ss: 0.4, pb: 1.25, ps: 3, ts: 0.5, flare: 0.3, th: 0.8, plank: 0, deck: 0.6, bottom: hover }
          : { L, B, D: 4.8, sb: 3.5, ss: 2.4, pb: 1.5, ps: 1.9, flare: 0.2, th: 0.9, plank: 0, deck: 0.8, bottom: hover };
        const sh = drawHull(S, H, V);
        const hd = sh.deckH(0);
        if (band === 7) {
          lightCargo(S, -20, -2, -4.5, 4.5, hd, N, V.seed);
          lightRig(S, 2, hd, 36, 26, 18, N, ctx.state === 'dock');
          cabin(S, -L / 2 + 3, -L / 2 + 10, -4, 4, hd, hd + 3.6, { wall: N.shell, roof: N.crystal, win: N.glow, winEvery: 2.2, winH: [0.4, 0.62] });
        } else {
          // Le glisseur / l'arche : nacelles de fret effilées, poste vitré à l'arrière.
          asPart(S, 6, () => {
            for (let a = -6; a < L / 2 - 8; a += 8) {
              surf(S, (u, v) => [a + 3.4 * Math.cos(u), 2.6 * Math.sin(u) * Math.cos(v) * 1.15, hd + 2.2 + 2.2 * Math.sin(u) * Math.sin(v)], 0, Math.PI, 0, Math.PI,
                (u, v, nw) => (Math.abs(u - Math.PI / 2) < 0.12 ? rgbOf(N.glow) : rampRGB(N.crystal, nw)));
            }
          });
          cabin(S, -L / 2 + 6, -L / 2 + 17, -4.2, 4.2, hd, hd + 4, { wall: N.shell, roof: N.shell, win: N.crystal, winEvery: 1.8, winH: [0.3, 0.85] });
          asPart(S, PART.mast, () => tube(S, [[-14, 0, hd + 4], [-14, 0, hd + 13]], 0.35, glow(N.glow)));
        }
        person(S, -L / 2 + 6, 0, hd + (band === 7 ? 0 : 4), 0, crewPal(V.seed, 10), ctx.state === 'salute' ? 'wave' : 'steer', 1);
      });
    },
  };
}

// ── Marchand B : galion de verre (7) · catamaran à aile (8) · nef (9) ──────────
function makeTradeB(band) {
  const N = nacre(band);
  const hover = band >= 9;
  const L = 56, B = band === 8 ? 20 : 15;
  const id = band === 7 ? 'galion-verre' : band === 8 ? 'catamaran-stellaire' : 'nef-levitante';
  return {
    id, role: 'trade', lights: true, hover, glow: N.glow, len: L, beam: B, speed: [1.2, 1.5],
    bounds: [-L / 2 - 6, L / 2 + 8, -B / 2 - 6, B / 2 + 6, -1, 44 + (hover ? HOVER : 0)], ink: '#1d1611',
    variant(seed) { return { hull: band === 7 ? N.crystal : N.shell, hullIn: N.shellIn, rail: N.shell, deck: N.shellIn, smoothDeck: true, glowRail: N.glow, seed }; },
    anchors() { const h = hover ? HOVER : 0; return { masthead: [0, 0, h + 30], port: [0, -0.7, h + 28], stbd: [0, 0.7, h + 28] }; },
    build(S, ctx) {
      const V = ctx.variant || this.variant(1);
      lift(band, S, () => {
        if (band === 8) {
          // Deux coques effilées, une passerelle de nacre, l'aile rigide au milieu.
          for (const c of [-6.5, 6.5]) {
            inFrame(S, 0, c, 0, 0, () => drawHull(S, { L, B: 5.5, D: 3.2, sb: 1, ss: 0.4, pb: 1.3, ps: 2.5, ts: 0.4, flare: 0.25, th: 0.7, plank: 0, deck: 0.4 }, V));
          }
          asPart(S, 11, () => box(S, -18, 14, -6.5, 6.5, 3.4, 4.6, (f, u, v, nw) => (f === 'top' ? rampRGB(N.shellIn, nw) : rampRGB(N.shell, nw, 1))));
          lightCargo(S, -4, 12, -5, 5, 4.6, N, V.seed);
          asPart(S, PART.sail, () => surf(S, (u, v) => [-8 + 4 * Math.sin(Math.PI * u) * 0.4 + u * 6, 0.6 * Math.sin(Math.PI * u), 4.6 + v * 24], 0, 1, 0, 1,
            (u, v, nw) => (u < 0.06 || u > 0.94 || v > 0.97 ? rgbOf(N.glow) : rampRGB(N.light, nw))));
          cabin(S, -24, -16, -4, 4, 4.6, 8, { wall: N.shell, roof: N.shell, win: N.crystal, winEvery: 1.8, winH: [0.3, 0.85] });
          person(S, -20, 0, 8, 0, crewPal(V.seed, 10), ctx.state === 'salute' ? 'wave' : 'steer', 1);
          return;
        }
        const H = { L, B, D: 5.4, sb: 4.5, ss: 6, pb: 1.7, ps: 2.2, flare: 0.2, th: 0.9, plank: 0, deck: 0.9, bottom: hover };
        const sh = drawHull(S, H, V);
        const hd = sh.deckH(0);
        lightCargo(S, -16, 12, -5, 5, hd, N, V.seed + 5);
        if (band === 7) {
          lightRig(S, 6, hd, 30, 20, 14, N, ctx.state === 'dock');
          lightRig(S, -10, hd, 24, 16, 11, N, ctx.state === 'dock');
        } else {
          // La nef : des flèches de lumière au lieu de mâts.
          asPart(S, PART.mast, () => { for (const a of [-12, 0, 12]) tube(S, [[a, 0, hd], [a, 0, hd + 14 + (a === 0 ? 8 : 0)]], (t) => 0.9 - 0.7 * t, glow(N.glow)); });
        }
        person(S, -L / 2 + 6, 0, sh.deckH(-0.8), 0, crewPal(V.seed, 10), ctx.state === 'salute' ? 'wave' : 'steer', 1);
      });
    },
  };
}

// ── Chaland cosmique : une longue barque de nacre chargée de lumière ─────────────
function makeBargeC(band) {
  const N = nacre(band);
  const hover = band >= 9;
  return {
    id: 'chaland-lumiere-' + band, role: 'barge', hover, glow: N.glow, len: 62, beam: 15, speed: [0.7, 0.9],
    bounds: [-36, 36, -12, 12, -1, 20 + (hover ? HOVER : 0)], ink: '#1d1611',
    variant(seed) { return { hull: N.shell, hullIn: N.shellIn, rail: N.shell, floor: N.shellIn, glowRail: N.glow, seed }; },
    anchors() { return {}; },
    build(S, ctx) {
      const V = ctx.variant || this.variant(1);
      lift(band, S, () => {
        const H = { L: 62, B: 15, D: 3.2, sb: 1.4, ss: 1.4, pb: 3, ps: 3, tb: 0.5, ts: 0.6, flare: 0.08, th: 0.9, plank: 0, open: true, floor: 1, bottom: hover };
        drawHull(S, H, V);
        lightCargo(S, -22, 26, -5.6, 5.6, 1, N, V.seed);
        cabin(S, -29, -23, -4, 4, 1, 5, { wall: N.shell, roof: N.crystal, win: N.glow, winEvery: 2, winH: [0.45, 0.65] });
        person(S, -29.5, 0, 5, 0, crewPal(V.seed, 10), ctx.state === 'salute' ? 'wave' : 'steer', 1);
      });
    },
  };
}

// ── Pêcheur cosmique : barque de nacre, filet qui luit ──────────────────────────
function makeFisherC(band) {
  const N = nacre(band);
  const hover = band >= 9;
  return {
    id: 'barque-nacre-' + band, role: 'fisher', hover, glow: N.glow, len: 22, beam: 8.5, speed: [0.85, 1.1],
    bounds: [-14, 14, -14, 14, -1, 12 + (hover ? HOVER : 0)], ink: '#1d1611',
    variant(seed) { return { hull: N.shell, hullIn: N.shellIn, rail: N.shell, floor: N.shellIn, glowRail: N.glow, seed }; },
    anchors() { return {}; },
    build(S, ctx) {
      const V = ctx.variant || this.variant(1);
      const fishing = ctx.state === 'anchor' || ctx.state === 'fish';
      lift(band, S, () => {
        const H = { L: 22, B: 8.5, D: 3.2, sb: 1.6, ss: 0.8, pb: 1.5, ps: 2.6, ts: 0.4, flare: 0.25, th: 0.8, plank: 0, open: true, floor: 0.9, bottom: hover };
        drawHull(S, H, V);
        asPart(S, 11, () => surf(S, (u, v) => [-6 + 2.2 * v * Math.cos(u), 0.4 + 2 * v * Math.sin(u), 0.9 + 1.4 * (1 - v * v)], 0, Math.PI * 2, 0, 1,
          (u, v, nw) => (h32(Math.round(u * 9), Math.round(v * 6), 3) % 3 === 0 ? rgbOf(N.glow) : rampRGB(N.crystal, nw))));
        person(S, fishing ? 3.5 : -2, fishing ? 1 : 0, 0.9, fishing ? Math.PI / 2 : 0, crewPal(V.seed, 10), fishing ? 'haul' : (ctx.state === 'salute' ? 'wave' : 'sit'), ctx.k || 1);
      });
    },
  };
}

// ── Passeur cosmique : un disque flottant cerclé de lumière ───────────────────
function makeFerryC(band) {
  const N = nacre(band);
  const hover = band >= 9;
  return {
    id: 'disque-' + band, role: 'ferry', hover, glow: N.glow, len: 24, beam: 24, speed: [0.5, 0.65],
    bounds: [-16, 16, -16, 16, -1, 14 + (hover ? HOVER : 0)], ink: '#1d1611',
    variant(seed) { return { seed }; },
    anchors() { return {}; },
    build(S, ctx) {
      const V = ctx.variant || this.variant(1);
      lift(band, S, () => {
        asPart(S, 2, () => {
          surf(S, (u, v) => [11 * Math.cos(u), 11 * Math.sin(u), v * 2.4], 0, Math.PI * 2, 0, 1, (u, v, nw) => (v > 0.7 ? rgbOf(N.glow) : rampRGB(N.shell, nw, v < 0.3 ? 1 : 0)));
          surf(S, (u, r) => [11 * r * Math.cos(u), 11 * r * Math.sin(u), 2.4], 0, Math.PI * 2, 0, 1, (u, r, nw) => rampRGB(N.shellIn, nw, (r > 0.48 && r < 0.53) ? 2 : 0));
          if (hover) surf(S, (u, r) => [11 * r * Math.cos(u), 11 * r * Math.sin(u), 0], 0, Math.PI * 2, 0, 1, (u, r, nw) => rampRGB(N.shell, nw, 2));
        });
        const n = 2 + (h32(V.seed, 40) % 3);
        for (let i = 0; i < n; i += 1) {
          const an = (i / n) * Math.PI * 2 + 0.4;
          person(S, 5.5 * Math.cos(an), 5.5 * Math.sin(an), 2.4, an + Math.PI, crewPal(V.seed, 50 + i * 7), i === 0 && ctx.state === 'salute' ? 'wave' : 'stand', 1);
        }
        asPart(S, PART.mast, () => tube(S, [[0, 0, 2.4], [0, 0, 9]], 0.5, glow(N.glow)));
      });
    },
  };
}

// ── Service cosmique : la sentinelle, une capsule qui veille ─────────────────
function makeServiceC(band) {
  const N = nacre(band);
  const hover = band >= 9;
  return {
    id: 'sentinelle-' + band, role: 'service', service: 'patrol', beacon: true, hover, glow: N.glow, len: 20, beam: 9, speed: [1.1, 1.4],
    bounds: [-13, 13, -10, 10, -1, 12 + (hover ? HOVER : 0)], ink: '#1d1611',
    variant(seed) { return { seed }; },
    anchors() { return { beacon: [3, 0, (hover ? HOVER : 0) + 7.4] }; },
    build(S) {
      lift(band, S, () => {
        asPart(S, 2, () => {
          surf(S, (u, v) => [10 * Math.cos(u) * Math.cos(v), 4.4 * Math.sin(u) * Math.cos(v), 0.4 + 5 * Math.max(0, Math.sin(v))], 0, Math.PI * 2, 0, Math.PI / 2,
            (u, v, nw) => (Math.abs(v - 0.35) < 0.08 ? rgbOf(N.glow) : rampRGB(N.shell, nw)));
        });
        asPart(S, 11, () => surf(S, (u, v) => [3 + 1.6 * Math.cos(u) * Math.cos(v), 1.6 * Math.sin(u) * Math.cos(v), 5 + 1.6 * Math.sin(v)], 0, Math.PI * 2, 0, Math.PI / 2,
          (u, v, nw) => rampRGB(N.crystal, nw)));
      });
    },
  };
}

// ── Plaisance cosmique (à quai seulement) : l'esquif de nacre et la petite voile
// de lumière, ferlée.
function makeSkiffC(band) {
  const N = nacre(band);
  const hover = band >= 9;
  return {
    id: 'esquif-' + band, role: 'pleasure', hover, glow: N.glow, len: 18, beam: 8, speed: [1, 1.2],
    bounds: [-12, 12, -8, 8, -1, 10 + (hover ? HOVER : 0)], ink: '#1d1611',
    variant(seed) { return { hull: N.shell, hullIn: N.shellIn, rail: N.shell, floor: N.shellIn, glowRail: N.glow, seed }; },
    anchors() { return {}; },
    build(S) {
      const V = this.variant(1);
      lift(band, S, () => {
        drawHull(S, { L: 18, B: 8, D: 2.8, sb: 1.2, ss: 0.6, pb: 1.5, ps: 2.4, ts: 0.4, flare: 0.25, th: 0.7, plank: 0, open: true, floor: 0.9, bottom: hover }, V);
        asPart(S, 11, () => surf(S, (u, v) => [-1 + 4 * Math.cos(u) * Math.cos(v), 2.8 * Math.sin(u) * Math.cos(v), 0.9 + 3 * Math.sin(v)], 0, Math.PI * 2, 0, Math.PI / 2,
          (u, v, nw) => rampRGB(N.crystal, nw)));
      });
    },
  };
}
function makeSailC(band) {
  const N = nacre(band);
  const hover = band >= 9;
  return {
    id: 'voile-' + band, role: 'pleasure', hover, glow: N.glow, len: 24, beam: 8.5, speed: [1, 1.2],
    bounds: [-15, 15, -12, 12, -1, 26 + (hover ? HOVER : 0)], ink: '#1d1611',
    variant(seed) { return { hull: N.shell, hullIn: N.shellIn, rail: N.shell, deck: N.shellIn, smoothDeck: true, glowRail: N.glow, seed }; },
    anchors() { return {}; },
    build(S, ctx) {
      const V = ctx.variant || this.variant(1);
      lift(band, S, () => {
        const sh = drawHull(S, { L: 24, B: 8.5, D: 3.2, sb: 1.6, ss: 0.6, pb: 1.5, ps: 2.8, ts: 0.5, flare: 0.22, th: 0.7, plank: 0, deck: 0.5, bottom: hover }, V);
        lightRig(S, 2, sh.deckH(0), 18, 10, 12, N, true);
      });
    },
  };
}

export const COSMIC_MODELS = {};
export const COSMIC_FLEET = {};
for (const band of [7, 8, 9]) {
  const N = nacre(band);
  const ms = [makeTradeA(band), makeTradeB(band), makeBargeC(band), makeFisherC(band), makeFerryC(band), makeServiceC(band), makeSkiffC(band), makeSailC(band)];
  const landing = makeLanding({ id: 'ponton-nacre-' + band, kind: 'nacre', glow: N.glow }, {
    deck: N.shellIn, landDeck: N.shellIn, landSide: N.shell, landPost: N.shell, landRail: N.shell, woodIn: N.shellIn, wood: N.shell,
  });
  for (const m of [...ms, landing]) COSMIC_MODELS[m.id] = m;
  COSMIC_FLEET[band] = {
    trade: [ms[0].id, ms[1].id], barge: [ms[2].id], fisher: [ms[3].id], ferry: [ms[4].id], service: [ms[5].id], landing: landing.id,
    pleasure: [ms[6].id, ms[7].id, ms[7].id, ms[6].id],
  };
}

