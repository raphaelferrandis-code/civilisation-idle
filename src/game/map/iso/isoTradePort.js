"use strict";
// ── LE PORT DE COMMERCE : docks au XIXe, terminal à conteneurs ensuite ──────────
// (docs/PLAN-PORTS.md, lot P2)
//
// Demande de Raph (2026-10-01) : « aux ères plus avancées le port devient un
// véritable port commercial, tel que le port du Havre », « un commercial en
// périphérie de la ville ». Le layout fonde le site une fois (map/portSites.js,
// cityCore.ports.trade) : un terre-plein le long d'un tronçon de berge droit, en
// aval, au bord de la ville du moment. Ce module le DESSINE, au pixel, avec le
// moteur de boîtes du ponton (iso/isoBoxBake.js) :
//   · bande 5 — LES DOCKS : quai de pierre, voie ferrée le long du bord, entrepôts
//     de brique alignés derrière, grues à vapeur à flèche, vapeurs à quai ;
//   · bande 6 — LE TERMINAL (Le Havre) : quai de béton à défenses, rails de
//     portique, PORTIQUES à conteneurs dont la flèche avance au-dessus des navires,
//     piles de conteneurs colorées, porte-conteneurs à quai ;
//   · bandes 7-9 — le terminal en nacre de l'ère, liseré lumineux.
// Sa taille suit les Ports achetés : plus de portiques, de piles et de postes.
//
// DEUX CUISSONS, UN NAVIRE ENTRE ELLES : le bas (terre-plein, quai, piles, pieds des
// portiques) est peint, puis les navires à quai, puis le HAUT des portiques (poutres,
// flèches, cabines) : une flèche passe au-dessus d'un navire, jamais dessous.
import { CM } from '../layout.js';
import { quayWallTiles, quayWallTune, quayStyleFor } from '../quaysAndRiot.js';
import { bakeBoxes, blitLayer, paintBakeUnder, h01, mul, mix, hexRgb, FACE_LIGHT } from './isoBoxBake.js';
import { drawMooredHull, hullFootprint, riverEdgeAt as edgeAt, riverWaterAt as waterAtW, riverWindow, registerPortProvider, registerPortLamps, quayJoin } from './portBerths.js';
import { queueFlameGlow } from '../flameGlow.js';
import { worldToScreen, depthOf } from './projection.js';

export const TRADE = { on: true, shadow: true, reflect: true };
if (typeof window !== 'undefined') {
  window.__trade = (o) => {
    if (o === false) TRADE.on = false;
    else if (o === true) TRADE.on = true;
    else if (o && typeof o === 'object') Object.assign(TRADE, o);
    _cache.clear();
    return { ...TRADE };
  };
}

// ── LES PALETTES ─────────────────────────────────────────────────────────────
const PAL = {
  docks: {
    top: [[184, 174, 154], [176, 166, 146], [190, 180, 160]], gap: [142, 134, 118], coping: [214, 206, 188],
    wall: [168, 158, 140], rail: [64, 62, 60], sleeper: [112, 86, 62], bollard: [52, 50, 48], bollardTop: [92, 90, 86],
    brick: [152, 72, 54], brickD: [124, 58, 44], window: [42, 38, 46], roof: [88, 90, 98], cornice: [202, 188, 158],
    crane: [54, 54, 58], cab: [104, 64, 46], chimney: [40, 40, 42], rope: [44, 42, 40],
    goods: [[160, 120, 74], [124, 84, 52], [196, 180, 140]],
  },
  terminal: {
    top: [[172, 172, 166], [166, 166, 160], [178, 178, 172]], gap: [140, 140, 136], coping: [196, 196, 190],
    wall: [150, 150, 146], rail: [78, 80, 84], line: [216, 182, 58], fender: [40, 40, 42], bollard: [46, 48, 52], bollardTop: [86, 88, 92],
    gantry: [52, 98, 168], boom: [52, 98, 168], house: [226, 228, 230], stay: [58, 60, 68], trolley: [70, 72, 80],
    conts: [[178, 62, 50], [56, 98, 162], [62, 132, 82], [214, 142, 54], [150, 152, 154], [226, 226, 220], [122, 52, 62], [58, 142, 152], [202, 182, 62]],
  },
};
function cosmicPal(band) {
  const st = quayStyleFor(band) || {};
  const glow = hexRgb(st.glow) || [120, 230, 200];
  const p = PAL.terminal;
  return {
    ...p,
    top: [[198, 202, 212], [192, 196, 206], [204, 208, 218]], gap: [168, 172, 184], coping: [222, 226, 234], wall: [176, 180, 192],
    line: glow, rail: [120, 126, 140], gantry: [214, 220, 228], boom: [214, 220, 228], house: mix([236, 240, 246], glow, 0.15), stay: [150, 156, 170],
    trolley: [160, 166, 180], conts: p.conts.map((c, i) => mix(c, i % 3 === 0 ? glow : [236, 238, 244], 0.45)), glow,
  };
}

// ── LE PLAN : des boîtes en px monde, en repère « bord du quai » ────────────────
// `u` = distance au bord d'eau vers l'intérieur des terres (négative au-dessus de
// l'eau), x = le long du quai, z = hauteur (le terre-plein à 0, comme le sol).
function tradePlan(tp, level, band, T, sm) {
  const style = band >= 6 ? 'terminal' : 'docks';
  const P = band >= 7 ? cosmicPal(band) : PAL[style];
  const dir = tp.side === 'N' ? 1 : -1;
  const x0 = tp.x0, x1 = tp.x0 + tp.len;
  let yF = dir > 0 ? -Infinity : Infinity;
  for (let x = x0; x <= x1 + 1e-6; x += 0.5) { const e = edgeAt(sm, x, tp.side); yF = dir > 0 ? Math.max(yF, e) : Math.min(yF, e); }
  yF += dir * 0.12;
  const wh = quayWallTiles(band) * quayWallTune.heightK;
  const low = [], high = [], beacons = [];
  const box = (arr, part, ax0, ax1, u0, u1, z0, z1, extra) => {
    const ya = yF - dir * u0, yb = yF - dir * u1;
    arr.push({ part, X0: ax0 * T, X1: ax1 * T, Y0: Math.min(ya, yb) * T, Y1: Math.max(ya, yb) * T, Z0: z0 * T, Z1: z1 * T, ...extra });
  };
  const D = tp.depth + 0.3;
  // Terre-plein (au ras du sol) et mur de quai qui pend au-dessus de l'eau.
  box(low, 'apron', x0, x1, 0, D, -0.03, 0, { noShadow: true, noMirror: true });
  box(low, 'wall', x0, x1, -0.02, 0.06, -wh, 0, { noShadow: true, noMirror: true });
  // RACCORDS avec le quai du fleuve, qui reprend au premier sample hors de la coupure :
  // sans eux, un coin de berge restait entre les deux maçonneries.
  const join = quayJoin(sm, x0 - 0.5, x1 + 0.5);
  if (join) {
    for (const [xa, xb] of [[join.xL, x0], [x1, join.xR]]) {
      if (!(xb - xa > 0.05)) continue;
      box(low, 'apron', xa, xb, 0, 1, -0.03, 0, { noShadow: true, noMirror: true });
      box(low, 'wall', xa, xb, -0.02, 0.06, -wh, 0, { noShadow: true, noMirror: true });
    }
  }
  // Bornes d'amarrage le long du bord.
  for (let x = x0 + 0.5; x < x1 - 0.2; x += 1.25) box(low, 'bollard', x, x + 0.09, 0.1, 0.19, 0, 0.09, { noMirror: true });
  const ships = [];
  if (style === 'terminal') {
    // Défenses de caoutchouc sur la face du quai.
    for (let x = x0 + 0.3; x < x1 - 0.2; x += 1.1) box(low, 'fender', x, x + 0.16, -0.07, -0.02, -wh * 0.85, -wh * 0.12, { noMirror: true });
    const nG = level >= 150 ? 4 : level >= 50 ? 3 : 2;
    const usable = tp.len - 2.4;
    for (let k = 0; k < nG; k += 1) {
      const xg = x0 + 1.2 + usable * (k + 0.5) / nG;
      for (const xs of [xg - 0.46, xg + 0.34]) {
        for (const us of [0.22, 1.3]) {
          box(low, 'gantry', xs, xs + 0.12, us, us + 0.12, 0, 1.86);
          box(high, 'gantry', xs, xs + 0.12, us, us + 0.12, 1.86, 1.96);
        }
        box(low, 'gantry', xs, xs + 0.12, 0.22, 1.42, 0.36, 0.46);     // traverse basse
        box(high, 'gantry', xs, xs + 0.12, 0.22, 1.42, 1.86, 2.0);     // longeron haut
      }
      for (const us of [0.22, 1.3]) box(high, 'gantry', xg - 0.46, xg + 0.46, us, us + 0.12, 1.86, 2.0);
      box(high, 'boom', xg - 0.1, xg + 0.1, -2.35, 2.05, 2.0, 2.13);
      box(high, 'house', xg - 0.3, xg + 0.3, 0.72, 1.55, 2.13, 2.44);
      for (const xa of [xg - 0.27, xg + 0.19]) box(high, 'gantry', xa, xa + 0.08, 0.95, 1.05, 2.13, 2.86);
      box(high, 'gantry', xg - 0.27, xg + 0.27, 0.95, 1.05, 2.8, 2.88);
      const stay = (ua, za, ub, zb, n) => {
        for (let i = 0; i < n; i += 1) {
          const t0 = i / n, t1 = (i + 1) / n;
          const u0 = ua + (ub - ua) * t0, u1 = ua + (ub - ua) * t1, z0 = za + (zb - za) * t0, z1 = za + (zb - za) * t1;
          box(high, 'stay', xg - 0.02, xg + 0.02, Math.min(u0, u1), Math.max(u0, u1) + 0.02, Math.min(z0, z1), Math.max(z0, z1) + 0.03, { noMirror: true });
        }
      };
      stay(1.0, 2.86, -2.3, 2.13, 16);
      stay(1.0, 2.86, 2.0, 2.13, 5);
      // Chariot sur la flèche, et un conteneur au bout de ses câbles.
      const ut = -0.55 - 0.9 * h01(k, level, 3);
      box(high, 'trolley', xg - 0.13, xg + 0.13, ut - 0.15, ut + 0.15, 1.9, 2.0);
      box(high, 'stay', xg - 0.015, xg + 0.015, ut - 0.01, ut + 0.02, 1.36, 1.9, { noMirror: true });
      box(high, 'stack', xg - 0.26, xg + 0.26, ut - 0.1, ut + 0.1, 1.2, 1.36, { cx: k, cy: 99, hz: 0.16 * T });
      // Feux d'obstacle rouges : au sommet du chevalet et au bout de la flèche.
      beacons.push({ x: xg, y: yF - dir * 1.0, z: 2.92 }, { x: xg, y: yF + dir * 2.3, z: 2.17 });
    }
    // Piles de conteneurs derrière les portiques.
    const maxH = level >= 120 ? 4 : level >= 40 ? 3 : 2;
    let row = 0;
    for (let u = 1.78; u + 0.21 <= tp.depth - 0.05; u += 0.23) {
      if (row > 0 && row % 4 === 0) u += 0.18;                       // allée
      let col = 0;
      for (let x = x0 + 0.6; x + 0.52 <= x1 - 0.5; x += 0.56) {
        if (col > 0 && col % 5 === 0) x += 0.3;                       // voie de cavalier
        if (x + 0.52 > x1 - 0.5) break;
        const r = h01(col, row, 17);
        const n = r < 0.12 ? 0 : 1 + Math.floor(h01(col, row, 23) * maxH);
        if (n > 0) box(low, 'stack', x, x + 0.52, u, u + 0.21, 0, n * 0.16, { cx: col, cy: row, hz: 0.16 * T });
        col += 1;
      }
      row += 1;
    }
    // Porte-conteneurs à quai, entre les portiques.
    const fp = hullFootprint('container', band);
    const nS = Math.max(1, Math.min(Math.floor(tp.len / (fp.len + 0.7)), level >= 100 ? 3 : level >= 30 ? 2 : 1));
    for (let k = 0; k < nS; k += 1) {
      const xs = x0 + tp.len * (k + 0.5) / nS;
      ships.push({ role: 'container', x: xs, y: yF + dir * (fp.beam / 2 + 0.06), z: -wh });
    }
  } else {
    // DOCKS du XIXe : voie ferrée le long du quai (dessinée sur le terre-plein), une
    // rangée d'entrepôts de brique derrière, des grues à vapeur au bord.
    const wu0 = 1.55, wu1 = tp.depth - 0.05;
    let x = x0 + 0.4;
    let k = 0;
    while (x < x1 - 1.6) {
      const len = Math.min(x1 - 0.4 - x, 2.6 + 1.4 * h01(k, 5, 7));
      if (len < 1.4) break;
      box(low, 'warehouse', x, x + len, wu0, wu1, 0, 1.05 + 0.25 * h01(k, 9, 3), { wk: k });
      x += len + 0.55; k += 1;
    }
    const nC = level >= 80 ? 4 : level >= 25 ? 3 : 2;
    for (let i = 0; i < nC; i += 1) {
      const xc = x0 + 1 + (tp.len - 2) * (i + 0.5) / nC;
      const m = 0.1, H = 1.25;
      box(low, 'crane', xc, xc + m, 0.35, 0.35 + m, 0, H);
      box(low, 'cab', xc - 0.12, xc + 0.22, 0.3, 0.62, 0.05, 0.38);
      box(low, 'chimney', xc + 0.12, xc + 0.18, 0.5, 0.56, 0.38, 0.62);
      // Flèche inclinée vers l'eau, en marches, et son hauban.
      const N = 14, tipU = -1.25, tipZ = H * 0.85;
      for (let j = 0; j < N; j += 1) {
        const t0 = j / N, t1 = (j + 1) / N;
        const ua = 0.35 + (tipU - 0.35) * t0, ub = 0.35 + (tipU - 0.35) * t1, za = 0.2 + (tipZ - 0.2) * t0, zb = 0.2 + (tipZ - 0.2) * t1;
        box(high, 'crane', xc + 0.02, xc + 0.08, Math.min(ua, ub), Math.max(ua, ub) + 0.02, Math.min(za, zb), Math.max(za, zb) + 0.07);
        const ra = 0.35 + (tipU - 0.35) * t0, rb = 0.35 + (tipU - 0.35) * t1, sa = H + (tipZ + 0.05 - H) * t0, sb = H + (tipZ + 0.05 - H) * t1;
        box(high, 'rope', xc + 0.035, xc + 0.065, Math.min(ra, rb), Math.max(ra, rb) + 0.02, Math.min(sa, sb), Math.max(sa, sb) + 0.03, { noMirror: true });
      }
      box(high, 'rope', xc + 0.035, xc + 0.065, tipU - 0.01, tipU + 0.02, 0.45, tipZ, { noMirror: true });
      box(high, 'goods', xc - 0.06, xc + 0.16, tipU - 0.1, tipU + 0.1, 0.25, 0.45, { gk: i });
      // Marchandises au pied de la grue.
      for (let j = 0; j < 3; j += 1) {
        const gx = xc + 0.35 + j * 0.24, gh = 0.12 + 0.12 * h01(i, j, 5);
        box(low, 'goods', gx, gx + 0.2, 0.75, 0.97, 0, gh, { gk: i * 3 + j });
      }
    }
    const fp = hullFootprint('steam', band);
    const nS = Math.max(1, Math.min(Math.floor(tp.len / (fp.len + 0.8)), level >= 60 ? 3 : 2));
    for (let k2 = 0; k2 < nS; k2 += 1) {
      ships.push({ role: 'steam', x: x0 + tp.len * (k2 + 0.5) / nS, y: yF + dir * (fp.beam / 2 + 0.06), z: -wh });
    }
  }
  return { style, P, low, high, ships, beacons, yF, dir, wh: wh * T, x0, x1, depth: tp.depth };
}

// ── LA COULEUR D'UN POINT TOUCHÉ ─────────────────────────────────────────────
function shadeTrade(plan, T) {
  const P = plan.P, dir = plan.dir, yF = plan.yF * T;
  // Dans le reflet, le « dessus » touché est le DESSOUS de la boîte : à l'ombre.
  const inner = (hit, wx, wy, zz) => {
    const bx = hit.bx, face = hit.face, part = bx.part;
    const u = (yF - wy) * dir;                                    // distance au bord, px
    const g = 1 + (h01(Math.floor(wx), Math.floor(wy), 3) - 0.5) * 0.05;
    let col;
    if (part === 'apron') {
      if (face !== 2) return mul(P.wall, FACE_LIGHT[face]);
      if (plan.style === 'terminal') {
        const ki = Math.floor(wx / 32), kj = Math.floor(u / 32);
        col = P.top[Math.floor(h01(ki, kj, 4) * P.top.length)];
        if (((wx % 32) + 32) % 32 < 1 || ((u % 32) + 32) % 32 < 1) col = P.gap;
        // Rails des portiques (deux files), ligne de sécurité jaune au bord.
        if (Math.abs(u - 0.28 * T) < 0.8 || Math.abs(u - 1.36 * T) < 0.8) col = P.rail;
        if (u > 0.45 * T && u < 0.45 * T + 1.2) col = P.line;
        if (u < 1.4) col = P.coping;
        if (P.glow && u > 0.12 * T && u < 0.12 * T + 1) col = P.glow;
      } else {
        const ka = Math.floor(wx / 10.5), kb = Math.floor(u / 9);
        col = P.top[Math.floor(h01(ka, kb, 5) * P.top.length)];
        if (((wx % 10.5) + 10.5) % 10.5 < 1 || ((u % 9) + 9) % 9 < 1) col = P.gap;
        // Voie ferrée : deux rails sur traverses.
        const ur = u - 0.62 * T;
        if (ur > -3 && ur < 6 && ((Math.floor(wx) % 3) + 3) % 3 === 0) col = P.sleeper;
        if (Math.abs(ur + 1) < 0.6 || Math.abs(ur - 4) < 0.6) col = P.rail;
        if (u < 1.4) col = P.coping;
      }
      return mul(col, g);
    }
    if (part === 'wall') {
      if (face === 2) return mul(P.coping, g);
      col = P.wall;
      if (plan.style === 'docks') {
        const row = Math.floor(-zz / 3.2), off = (row & 1) ? 4 : 0;
        if (((-zz) - row * 3.2) < 0.9 || ((((Math.floor(wx) + off) % 8) + 8) % 8 === 0)) col = P.gap;
      } else if (((Math.floor(wx) % 16) + 16) % 16 === 0) col = P.gap;
      if (-zz > plan.wh - 2.2) col = mix(mul(col, 0.6), [58, 76, 56], 0.3);   // pied mouillé
      return mul(col, FACE_LIGHT[face] * g);
    }
    if (part === 'bollard') return mul(face === 2 ? P.bollardTop : P.bollard, FACE_LIGHT[face]);
    if (part === 'fender') return mul(P.fender, FACE_LIGHT[face]);
    if (part === 'stack') {
      const lvl = Math.max(0, Math.floor((zz - 0.01) / (bx.hz || 5)));
      col = P.conts[Math.floor(h01(bx.cx, bx.cy * 7 + lvl, 29) * P.conts.length)];
      if (face === 2) return mul(col, 1.06 * g);
      if (zz - lvl * (bx.hz || 5) < 0.9) col = mul(col, 0.62);              // jointure entre deux conteneurs
      else if (face === 1 && ((Math.floor(wx) % 2) + 2) % 2 === 0) col = mul(col, 0.86);   // nervures
      else if (face === 0 && ((Math.floor(wy) % 3) + 3) % 3 === 0) col = mul(col, 0.8);    // portes
      return mul(col, FACE_LIGHT[face] * g);
    }
    if (part === 'gantry' || part === 'boom') {
      col = P.gantry;
      if (face === 2) col = mul(col, 1.15);
      if (part === 'boom' && u < -2.1 * T) col = face === 2 ? [230, 230, 228] : [200, 60, 52];   // pointe blanc et rouge
      if (P.glow && part === 'boom' && face !== 2 && bx.Z1 - zz < 1) col = P.glow;
      return mul(col, FACE_LIGHT[face] * g);
    }
    if (part === 'house') {
      col = P.house;
      if (face !== 2 && zz > bx.Z0 + 0.35 * (bx.Z1 - bx.Z0) && zz < bx.Z0 + 0.6 * (bx.Z1 - bx.Z0) && ((Math.floor(face === 1 ? wx : wy) % 4) + 4) % 4 < 2) col = [70, 96, 120];
      return mul(col, FACE_LIGHT[face] * g);
    }
    if (part === 'trolley') return mul(P.trolley, FACE_LIGHT[face]);
    if (part === 'stay' || part === 'rope') return P.stay || P.rope;
    if (part === 'warehouse') {
      if (face === 2) {
        col = P.roof;
        // Verrières en bandes (les entrepôts des docks éclairaient leurs plateaux par
        // le toit) et le faîtage qui les sépare.
        const ra = ((wx - bx.X0) % 16 + 16) % 16, inner = wy - bx.Y0 > 4 && bx.Y1 - wy > 4;
        if (inner && ra > 5 && ra < 10) col = ra < 7 ? [156, 176, 190] : [124, 144, 160];
        else if (inner && ra >= 10 && ra < 11) col = mul(P.roof, 0.8);
        if (wx - bx.X0 < 1.3 || bx.X1 - wx < 1.3 || wy - bx.Y0 < 1.3 || bx.Y1 - wy < 1.3) col = P.cornice;
        return mul(col, g);
      }
      const along = face === 1 ? wx - bx.X0 : wy - bx.Y0, h = zz;
      col = ((Math.floor(h / 2) + (Math.floor(along / 4) & 1)) & 1) ? P.brick : P.brickD;
      if (bx.Z1 - h < 2) col = P.cornice;                                  // corniche
      else if (h < 11 && face === 1 && ((Math.floor(along / 24) % 2) === 0) && ((along % 24) > 6 && (along % 24) < 18)) col = [70, 52, 40];   // portes de chargement
      else {
        const wcol = ((along % 8) + 8) % 8, wrow = h % 11;
        if (wcol > 2 && wcol < 6 && wrow > 4 && wrow < 9 && h > 12 && bx.Z1 - h > 4) col = P.window;
      }
      return mul(col, FACE_LIGHT[face] * g);
    }
    if (part === 'crane') return mul(face === 2 ? mul(P.crane, 1.3) : P.crane, FACE_LIGHT[face]);
    if (part === 'cab') return mul(face === 2 ? [70, 72, 76] : P.cab, FACE_LIGHT[face] * g);
    if (part === 'chimney') return mul(P.chimney, FACE_LIGHT[face]);
    if (part === 'goods') {
      col = P.goods[(bx.gk | 0) % P.goods.length];
      if (face !== 2 && ((Math.floor(zz) % 4) + 4) % 4 === 0) col = mul(col, 0.8);
      return mul(col, FACE_LIGHT[face] * g);
    }
    return mul([128, 128, 128], FACE_LIGHT[face]);
  };
  return (hit, wx, wy, zz, mirror) => {
    const c = inner(hit, wx, wy, zz);
    return mirror && hit.face === 2 && c ? mul(c, 0.5) : c;
  };
}

// ── LE CACHE ─────────────────────────────────────────────────────────────────
const _cache = new Map();
function tradeGeom(t, band) {
  const L = CM.layout, rv = L && L.river;
  if (!rv || !rv.present || !rv.samples || !t.tradePort) return null;
  const level = Math.floor(t.level || 0);
  // ⚠ CLÉ = LA GÉOMÉTRIE, pas l'horodatage du layout : celui-ci change à chaque
  // recalcul (un achat peut en déclencher un), et la cuisson coûte quelques centaines
  // de ms — elle se refaisait à chaque fois. Le cache est indexé par la clé, pas par
  // l'objet tuile (un recalcul en fabrique de nouveaux).
  // Le niveau compte par PALIERS (ceux de tradePlan : portiques, piles, postes).
  const tp = t.tradePort, lvlB = [25, 30, 40, 50, 60, 80, 100, 120, 150].filter((v) => level >= v).length;
  const key = (L.mapSeed | 0) + ':' + tp.x0 + ',' + tp.len + ',' + tp.side + ',' + tp.depth + ',' + tp.edge.join('.') + ':' + band + ':' + lvlB
    + ':' + (TRADE.shadow ? 1 : 0) + (TRADE.reflect ? 1 : 0);
  if (_cache.has(key)) return _cache.get(key);
  const T = CM.TILE, sm = rv.samples;
  const plan = tradePlan(t.tradePort, level, band, T, sm);
  const shade = shadeTrade(plan, T);
  const [j0, j1] = riverWindow(sm, t.tradePort.x0 - 4, t.tradePort.x0 + t.tradePort.len + 4);
  const isWater = (wx, wy) => waterAtW(sm, wx, wy, T, j0, j1);
  const opt = { shade, isWater, shadow: TRADE.shadow, reflect: TRADE.reflect, foam: (b) => b.part === 'gantry' && b.Z0 <= 0.01 };
  const g = { plan, low: bakeBoxes(plan.low, opt), high: bakeBoxes(plan.high, opt) };
  if (_cache.size > 4) _cache.clear();
  _cache.set(key, g);
  return g;
}

function tradeTiles(L) {
  const nT = (L.tiles || []).length;
  if (L._tradePorts && L._tradePorts.n === nT) return L._tradePorts.list;
  const list = (L.tiles || []).filter((t) => t.tradePort);
  L._tradePorts = { n: nT, list };
  return list;
}

// Sous les bateaux (passe des quais) : ombres et reflets du terminal.
export function paintTradePortUnder(ctx) {
  if (!TRADE.on) return;
  const L = CM.layout;
  if (!L || CM.collapseAt) return;
  const band = (L.counts && L.counts.eraBand) | 0;
  for (const t of tradeTiles(L)) {
    const g = tradeGeom(t, band);
    if (!g) continue;
    paintBakeUnder(ctx, g.low, { shadow: TRADE.shadow, reflect: TRADE.reflect });
    paintBakeUnder(ctx, g.high, { shadow: TRADE.shadow, reflect: TRADE.reflect });
  }
}

// Le terminal, dans le tri du peintre (scène riveraine de sa tuile).
export function drawTradePort(ctx, t, band, ei, now) {
  if (!TRADE.on) return;
  const g = tradeGeom(t, band);
  if (!g) return;
  // Navires à quai, cap le long du quai (vers l'est à l'écran : le monde +x), au
  // niveau de l'eau (au pied du mur). Rive nord : ils sont DEVANT le quai (peints
  // après lui) ; rive sud : DERRIÈRE (peints avant, le quai cache leur flanc bas).
  const heading = Math.atan2(0.5, 1);
  const ships = () => { for (const sh of g.plan.ships) drawMooredHull(ctx, { role: sh.role, heading, x: sh.x, y: sh.y, z: sh.z, now, band }); };
  const B = g.low;
  if (g.plan.dir < 0) ships();
  if (B) blitLayer(ctx, B.body);
  if (g.plan.dir > 0) ships();
  const H = g.high;
  if (H) blitLayer(ctx, H.body);
  const T = CM.TILE, z = CM.cam.zoom;
  g.plan.beacons.forEach((b, i) => {
    const p = worldToScreen(b.x * T, b.y * T, b.z * T);
    queueFlameGlow(p.x, p.y, T * z * 0.2, '255,72,56', now, i * 1.7, 1.8);
  });
}

// ── CE QUE LA FLOTTE DOIT SAVOIR DU TERMINAL (iso/portBerths.js) ───────────────
// Un poste par navire à quai (décor), et l'emprise de ces coques dans l'eau.
registerPortProvider('commerce', (L) => {
  if (!TRADE.on || !L || !L.counts) return null;
  const band = L.counts.eraBand | 0;
  const berths = [], water = [];
  for (const t of tradeTiles(L)) {
    const g = tradeGeom(t, band);
    if (!g) continue;
    g.plan.ships.forEach((sh, i) => {
      const fp = hullFootprint(sh.role, band);
      berths.push({ id: 'commerce-' + i, kind: 'commerce', x: sh.x, y: sh.y, heading: Math.atan2(0.5, 1), axis: { x: 1, y: 0 }, maxLen: fp.len + 0.6, decor: true });
      for (let d = -fp.len / 2 + fp.beam / 2; d <= fp.len / 2 - fp.beam / 2 + 1e-6; d += fp.beam) water.push({ x: sh.x + d, y: sh.y, r: fp.beam / 2 + 0.15, id: 'navire-a-quai' });
    });
  }
  return { berths, water };
});

// ── LES RÉVERBÈRES DU TERMINAL (iso/portBerths.js → isoStreet.isoLamps) ─────────
// Une file de mâts de l'ère à l'arrière du terre-plein, tous les ~2,2 tuiles.
registerPortLamps('commerce', (L, band) => {
  if (!TRADE.on || !L) return [];
  const T = CM.TILE, out = [];
  for (const t of tradeTiles(L)) {
    const g = tradeGeom(t, band);
    if (!g) continue;
    const pl = g.plan, y = pl.yF - pl.dir * (pl.depth + 0.1);
    for (let x = pl.x0 + 0.8; x < pl.x1 - 0.4; x += 2.2) {
      const wx = x * T, wy = y * T;
      out.push({ wx, wy, gx: Math.floor(x), gy: Math.floor(y), d: depthOf(wx, wy), s: ((Math.floor(x * 7) * 73856093) ^ (Math.floor(y * 7) * 19349663)) >>> 0 });
    }
  }
  return out;
});
