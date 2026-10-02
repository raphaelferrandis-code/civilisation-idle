"use strict";
// ── LE MÉTRO DU QUAI — le dessin (lot 3 de docs/PLAN-ETAGES.md) ──────────────
//
// Le tracé vient de procedural/metroPlan.js (au-dessus de la promenade du quai de la
// rive opposée au cœur), mémorisé par layout. Deux époques sur la MÊME ligne :
//   · bandes 5-6, MÉTRO DE FER : viaduc à poutres-treillis sur piles de pierre,
//     ballast et deux voies, garde-corps ; rames vert et crème (B5) puis bleu et
//     blanc (B6) ; stations à marquise de verre ;
//   · bandes 7-9, MONORAIL : deux poutres fines sur piles en Y, rames profilées dans
//     la matière de l'ère (jade, nacre et or, cristal), stations-capsules.
// Même découpage que l'autoroute : par tronçon, le dessus trié au coin arrière, la
// tranche au coin avant ; piles sous le dessus ; ombre au sol ; nuit dans le calque
// de lumière (fenêtres des rames, marquises, rive des poutres).
//
// Molette : __metro({ on, trains, shadow }).
import { CM } from '../layout.js';
import { worldToScreen, depthOf } from './projection.js';
import { vieK } from './isoVie.js';
import { planMetro, METRO } from '../procedural/metroPlan.js';
import { boxShapes, bakeShapes, blitBaked, makeBakeCache, elevGlow, segGeo, relTo, vquad } from './elevPaint.js';

export const MET = { on: true, trains: 1, shadow: 0.55 };

// Matière par bande.
const MAT = {
  5: { kind: 'iron', ballast: '#7d7468', rail: '#3b3530', iron: ['#55665f', '#3f4c47', '#2c3532'], lit: '#55665f', mid: '#47564f', dark: '#3a4641',
    stone: ['#d9cbb0', '#b9a888', '#8f7f64', '#4a4236'], car: ['#8d948f', '#3f7550', '#2f5a3d', '#e9dfc4', '#26302b'], roof: ['#cfe3ea', '#9fbfcc', '#6f8f9c'], glow: '255,210,130', edge: null },
  6: { kind: 'iron', ballast: '#6f6d68', rail: '#33312e', iron: ['#6d7378', '#555b60', '#3c4145'], lit: '#6d7378', mid: '#5c6267', dark: '#4a4f53',
    stone: ['#cfccc4', '#aeaaa2', '#86837d', '#3b3a37'], car: ['#c9ced3', '#3e6fa8', '#2c5482', '#f2f2ee', '#22303f'], roof: ['#d6e8f2', '#a8c6d8', '#7896a8'], glow: '255,226,170', edge: null },
  7: { kind: 'mono', beam: ['#e6f0ea', '#c4d8cd', '#93ab9e'], lit: '#e6f0ea', mid: '#c4d8cd', dark: '#93ab9e', out: '#2d3a33',
    car: ['#f4fbf6', '#d6ebe0', '#a3c8b6', '#3f8fb0', '#24382c'], roof: ['#d6f2ea', '#9ad6c4', '#5fae98'], glow: '170,255,220', edge: '150,255,210' },
  8: { kind: 'mono', beam: ['#fbf3dc', '#ead9a8', '#c9ad6a'], lit: '#fbf3dc', mid: '#ead9a8', dark: '#c9ad6a', out: '#40341c',
    car: ['#fffaf0', '#f2e3b8', '#d4b876', '#4fb3a0', '#40341c'], roof: ['#fdf2d0', '#f0d48a', '#c9a24a'], glow: '255,214,140', edge: '255,220,140' },
  9: { kind: 'mono', beam: ['#f4f1fb', '#dcd4ee', '#b8acd6'], lit: '#f4f1fb', mid: '#dcd4ee', dark: '#b8acd6', out: '#3a3050',
    car: ['#fbfaff', '#e6dff5', '#c4b8e0', '#8a6fd8', '#3a3050'], roof: ['#ece6fb', '#cbbcf2', '#9c88d8'], glow: '200,180,255', edge: '170,140,255' },
};
const matFor = (band) => MAT[Math.max(5, Math.min(9, band | 0))];

// ── LE TRACÉ (mémo par layout) ───────────────────────────────────────────────
let _for = null, _plan = null;
export function metroPlanFor(L) {
  if (_for === L) return _plan;
  _for = L; _plan = null;
  if (!L || !L.river || !L.plan || !L.counts) return null;
  const occ = new Set();
  for (const t of L.tiles || []) {
    if (t.type === 'field') continue;
    const sx = t.spanX || 1, sy = t.spanY || 1;
    for (let i = 0; i < sx; i += 1) for (let j = 0; j < sy; j += 1) occ.add((t.gx + i) + ',' + (t.gy + j));
  }
  const p = planMetro({ river: L.river, core: L.plan.core, N: L.gridN, band: L.counts.eraBand | 0, built: (x, y) => occ.has(x + ',' + y) });
  if (!p) return null;
  const T = CM.TILE;
  p.w = p.mono ? 0.9 : 0.8;
  // Recentré d'un tiers de tuile vers les terres : le tablier couvre la promenade du
  // quai, il ne déborde pas sur l'eau (il cachait le mur de quai).
  p.wpts = p.pts.map((q) => ({ x: q.x * T, y: (q.y + p.sign * 0.32) * T, z: q.z * T }));
  p.cum = [0];
  for (let i = 1; i < p.wpts.length; i += 1) p.cum.push(p.cum[i - 1] + Math.hypot(p.wpts[i].x - p.wpts[i - 1].x, p.wpts[i].y - p.wpts[i - 1].y));
  _plan = p;
  return p;
}

// ── FORMES ───────────────────────────────────────────────────────────────────
const TH_IRON = 0.42, TH_MONO = 0.26, PAR = 0.1;
function ironBack(M, a, b, g, T) {
  const s = [];
  s.push({ poly: [relTo(a, g.AL), relTo(a, g.BL), relTo(a, g.BR), relTo(a, g.AR)], col: M.ballast });
  // deux voies (quatre files de rail) + traverses toutes les demi-tuiles
  for (let u = 0; u < 1; u += 1 / 16) {
    for (const off of [-0.27, -0.13, 0.13, 0.27]) {
      s.push({ px: relTo(a, [a.x + (b.x - a.x) * u + g.nx * off * T, a.y + (b.y - a.y) * u + g.ny * off * T, a.z + (b.z - a.z) * u]), col: M.rail });
    }
  }
  const visL = (g.nx + g.ny) > 0, visR = (-g.nx - g.ny) > 0;
  if (!visL) s.push(vquad(a, g.AL, g.BL, 0, PAR * T, M.iron[1]));
  if (!visR) s.push(vquad(a, g.AR, g.BR, 0, PAR * T, M.iron[1]));
  return s;
}
function ironFront(M, a, b, g, T) {
  const s = [];
  const th = TH_IRON * T;
  const visL = (g.nx + g.ny) > 0;
  const P = visL ? [g.AL, g.BL] : [g.AR, g.BR];
  // poutre-treillis : fond sombre, croix de Saint-André claires, semelles
  s.push(vquad(a, P[0], P[1], -th, 0, M.iron[2]));
  const n = 16;
  for (let k = 0; k <= n; k += 1) {
    const u = k / n;
    for (const [uu, zz] of [[u, -th * u], [u, -th * (1 - u)]]) {
      const p = [P[0][0] + (P[1][0] - P[0][0]) * uu, P[0][1] + (P[1][1] - P[0][1]) * uu, P[0][2] + (P[1][2] - P[0][2]) * uu + zz];
      s.push({ px: relTo(a, p), col: M.iron[0] });
    }
  }
  s.push(vquad(a, P[0], P[1], -0.06 * T, 0, M.iron[0]));
  s.push(vquad(a, P[0], P[1], -th, -th + 0.06 * T, M.iron[0]));
  s.push(vquad(a, P[0], P[1], 0, PAR * T, M.iron[0]));
  return s;
}
// Monorail : deux poutres fines (une par sens), sans tablier.
function monoBeams(g, T) {
  const off = 0.24 * T, hw = 0.07 * T;
  return [-off, off].map((o) => ({
    L0: [g.AL[0] + (g.AR[0] - g.AL[0]) * 0.5 + g.nx * (o + hw), g.AL[1] + (g.AR[1] - g.AL[1]) * 0.5 + g.ny * (o + hw)],
    R0: [g.AL[0] + (g.AR[0] - g.AL[0]) * 0.5 + g.nx * (o - hw), g.AL[1] + (g.AR[1] - g.AL[1]) * 0.5 + g.ny * (o - hw)],
  }));
}
function monoBack(M, a, b, g, T) {
  const s = [];
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  for (const bm of monoBeams(g, T)) {
    const A0 = [bm.L0[0], bm.L0[1], a.z], A1 = [bm.R0[0], bm.R0[1], a.z];
    const B0 = [A0[0] + dx, A0[1] + dy, b.z], B1 = [A1[0] + dx, A1[1] + dy, b.z];
    s.push({ poly: [relTo(a, A0), relTo(a, B0), relTo(a, B1), relTo(a, A1)], col: M.beam[1] });
  }
  void dz;
  return s;
}
function monoFront(M, a, b, g, T) {
  const s = [];
  const th = TH_MONO * T;
  const dx = b.x - a.x, dy = b.y - a.y;
  for (const bm of monoBeams(g, T)) {
    const A0 = [bm.L0[0], bm.L0[1], a.z], A1 = [bm.R0[0], bm.R0[1], a.z];
    const B0 = [A0[0] + dx, A0[1] + dy, b.z], B1 = [A1[0] + dx, A1[1] + dy, b.z];
    const visL = (g.nx + g.ny) > 0;
    const [P, Q] = visL ? [A0, B0] : [A1, B1];
    s.push(vquad(a, P, Q, -th, 0, M.beam[2]));
    s.push(vquad(a, P, Q, -0.04 * T, 0, M.beam[0]));
    s.push(vquad(a, P, Q, -th, -th * 0.75, M.out));
  }
  return s;
}
function pierShapes(M, g, top, T, mono) {
  if (!mono) {
    const c = 0.22 * T, hw = 0.47 * T;
    const ax = Math.abs(g.ny) > Math.abs(g.nx);           // tablier le long de x → pile allongée en y
    const [ex, ey] = ax ? [c, hw] : [hw, c];
    return [
      ...boxShapes(-ex, -ey, ex, ey, -top, -top + 0.12 * T, M.stone[0], M.stone[1], M.stone[2], M.stone[3]),
      ...boxShapes(-ex * 0.8, -ey * 0.8, ex * 0.8, ey * 0.8, -top + 0.12 * T, -0.1 * T, null, M.stone[1], M.stone[2], M.stone[3]),
      ...boxShapes(-ex, -ey, ex, ey, -0.1 * T, 0, M.stone[0], M.stone[0], M.stone[1], M.stone[3]),
    ];
  }
  // pile en Y : un fût, deux bras vers les poutres
  const c = 0.1 * T, arm = 0.3 * T;
  const ax = Math.abs(g.ny) > Math.abs(g.nx);
  const s = [...boxShapes(-c, -c, c, c, -top, -0.3 * T, null, M.beam[1], M.beam[2], M.out)];
  const [ex, ey] = ax ? [c, arm] : [arm, c];
  s.push(...boxShapes(-ex, -ey, ex, ey, -0.3 * T, -0.18 * T, M.beam[0], M.beam[1], M.beam[2], M.out));
  return s;
}
function stationShapes(M, g, T, mono) {
  const L = 0.85 * T, W = 0.44 * T, H = 0.5 * T;
  const ax = Math.abs(g.ny) > Math.abs(g.nx);              // ligne le long de x
  const box = (u0, u1, v0, v1, z0, z1, cT, cL, cR, out) => (ax ? boxShapes(u0, v0, u1, v1, z0, z1, cT, cL, cR, out) : boxShapes(v0, u0, v1, u1, z0, z1, cT, cL, cR, out));
  const s = [];
  if (!mono) {
    // poteaux de fonte (quatre), puis la marquise : deux pans de verre et un faîte
    for (const u of [-L * 0.85, L * 0.85]) for (const v of [-W * 0.9, W * 0.9]) s.push(...box(u - 0.03 * T, u + 0.03 * T, v - 0.03 * T, v + 0.03 * T, 0, H, null, M.iron[1], M.iron[2], null));
    s.push(...box(-L, L, -W, 0, H, H + 0.06 * T, M.roof[1], M.roof[1], M.roof[2], M.iron[2]));
    s.push(...box(-L, L, 0, W, H, H + 0.06 * T, M.roof[0], M.roof[0], M.roof[2], M.iron[2]));
    s.push(...box(-L, L, -0.03 * T, 0.03 * T, H + 0.06 * T, H + 0.1 * T, M.iron[0], M.iron[1], M.iron[2], null));
  } else {
    // capsule : socle plein, bandeau vitré tout autour, toit débordant
    s.push(...box(-L, L, -W, W, 0.04 * T, H * 0.35, M.roof[0], M.roof[1], M.roof[2], M.out));
    s.push(...box(-L, L, -W, W, H * 0.35, H * 0.8, M.car[3], M.car[3], M.out, M.out));
    s.push(...box(-L * 1.06, L * 1.06, -W * 1.1, W * 1.1, H * 0.8, H, M.lit, M.mid, M.dark, M.out));
  }
  return s;
}
function trainShapes(M, ux, uy, T, mono) {
  // une voiture, alignée sur (ux, uy) arrondi à l'axe dominant
  const ax = Math.abs(ux) >= Math.abs(uy);
  const Lh = (mono ? 0.46 : 0.44) * T, Wh = (mono ? 0.12 : 0.15) * T, H = (mono ? 0.32 : 0.4) * T;
  const [ex, ey] = ax ? [Lh, Wh] : [Wh, Lh];
  const c = M.car;
  const s = [...boxShapes(-ex, -ey, ex, ey, mono ? -0.06 * T : 0.06 * T, H, c[0], c[1], c[2], c[4])];
  // bandeau de fenêtres sur les deux faces visibles
  const n = mono ? 14 : 6;
  for (let k = 1; k < n; k += 1) {
    const u = -1 + (2 * k) / n;
    for (const zz of [H * 0.6, H * 0.6 + 0.04 * T]) {
      s.push({ px: ax ? [u * Lh * 0.92, Wh, zz] : [Wh, u * Lh * 0.92, zz], col: c[3] });
    }
  }
  if (mono) s.push(...boxShapes(...(ax ? [-Lh, -Wh * 0.9, Lh, Wh * 0.9] : [-Wh * 0.9, -Lh, Wh * 0.9, Lh]), -0.12 * T, -0.06 * T, null, c[4], c[4], null));
  return s;
}

const _bakes = makeBakeCache(1200);
function baked(key, make) {
  const z = CM.cam.zoom, d = CM.dpr || 1, kd = Math.max(1, Math.round(vieK() * d));
  return _bakes.get(key + '|' + z + '|' + d, () => bakeShapes(make(), z, d, kd));
}
const r1 = (v) => Math.round(v * 10) / 10;

// Point de la ligne à l'abscisse curviligne s.
function along(p, s) {
  let j = 1;
  while (j < p.cum.length - 1 && p.cum[j] < s) j += 1;
  const a = p.wpts[j - 1], b = p.wpts[j], seg = (p.cum[j] - p.cum[j - 1]) || 1;
  const u = Math.max(0, Math.min(1, (s - p.cum[j - 1]) / seg));
  return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, z: a.z + (b.z - a.z) * u, ux: (b.x - a.x) / seg, uy: (b.y - a.y) / seg };
}

// ── LES ACTEURS ──────────────────────────────────────────────────────────────
export const metroStats = { segs: 0, cars: 0, where: null };
export function metroActors(now, out, decay = 0) {
  metroStats.segs = 0; metroStats.cars = 0; metroStats.where = null;
  const L = CM.layout;
  if (!MET.on || !L || CM.lodActive) return;
  const p = metroPlanFor(L);
  if (!p) return;
  const T = CM.TILE, z = CM.cam.zoom, d = CM.dpr || 1;
  const band = (L.counts.eraBand) | 0;
  const M = matFor(band), mono = p.mono;
  const mg = 3 * T * z;
  const vis = (x, y, zz) => { const q = worldToScreen(x, y, zz); return q.x > -mg && q.x < CM.cw + mg && q.y > -mg && q.y < CM.ch + mg * 2; };
  const w = p.w * T;
  const th = (mono ? TH_MONO : TH_IRON) * T;
  for (let i = 0; i < p.wpts.length - 1; i += 1) {
    const a = p.wpts[i], b = p.wpts[i + 1];
    if (Math.max(a.z, b.z) < 0.03 * T) continue;
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    if (!vis(mx, my, a.z) && !vis(mx, my, 0)) continue;
    // LA CHUTE (lot 4) : travées tombées par grappes de 3 tronçons.
    if (decay > 0.5 && ((Math.floor(i / 3) * 2654435761) >>> 0) / 4294967296 < (decay - 0.4) * 1.0) continue;
    metroStats.segs += 1;
    const g = segGeo(a, b, w);
    const kGeo = r1(b.x - a.x) + ',' + r1(b.y - a.y) + ',' + r1(a.z) + ',' + r1(b.z - a.z);
    const corners = [g.AL, g.BL, g.AR, g.BR].map((q) => depthOf(q[0], q[1]));
    const dBack = Math.min(...corners), dFront = Math.max(...corners);
    if (MET.shadow > 0) {
      const sk = MET.shadow;
      const o = { x: a.x + a.z * sk, y: a.y, z: 0 };
      const q = [g.AL, g.BL, g.BR, g.AR].map((c) => [c[0] + c[2] * sk - o.x, c[1] - o.y, 0]);
      out.push({ wx: o.x, wy: o.y, d: Math.min(...q.map((c) => depthOf(c[0] + o.x, c[1] + o.y))) - 0.05 * T, draw(ctx) {
        const bk = baked('sh|' + (mono ? 1 : 0) + '|' + kGeo, () => [{ poly: q, col: '#141828' }]);
        const s0 = worldToScreen(o.x, o.y, 0);
        blitBaked(ctx, bk, s0.x, s0.y, d, (mono ? 0.11 : 0.15) * (1 - 0.75 * (CM.nightF || 0)));
      } });
    }
    out.push({ wx: mx, wy: my, d: dBack + 0.05 * T, draw(ctx) {
      const bk = baked('bk|' + band + '|' + kGeo, () => (mono ? monoBack : ironBack)(M, a, b, g, T));
      const s0 = worldToScreen(a.x, a.y, a.z);
      blitBaked(ctx, bk, s0.x, s0.y, d);
    } });
    out.push({ wx: mx, wy: my, d: dFront + 0.4 * T, draw(ctx) {
      const bk = baked('fr|' + band + '|' + kGeo, () => (mono ? monoFront : ironFront)(M, a, b, g, T));
      const s0 = worldToScreen(a.x, a.y, a.z);
      blitBaked(ctx, bk, s0.x, s0.y, d);
      if (M.edge && (CM.nightF || 0) * (1 - decay) > 0.05) {
        const s1 = worldToScreen(b.x, b.y, b.z);
        elevGlow((s0.x + s1.x) / 2, (s0.y + s1.y) / 2 + th * z * 0.5, 2.5 * z / 0.625, M.edge, 0.3 * (CM.nightF || 0));
      }
    } });
    // piles : toutes les 3 cellules (fer) / 4 (monorail)
    const every = mono ? 4 : 3;
    const top = a.z - th;
    if (i % every === 1 && top > 0.3 * T) {
      out.push({ wx: a.x, wy: a.y, d: dBack - 0.02 * T, draw(ctx) {
        const bk = baked('pi|' + band + '|' + r1(top) + '|' + (Math.abs(g.ny) > Math.abs(g.nx) ? 1 : 0), () => pierShapes(M, g, top, T, mono));
        const s0 = worldToScreen(a.x, a.y, top);
        blitBaked(ctx, bk, s0.x, s0.y, d);
      } });
    }
  }
  // stations
  for (const sx of p.stations) {
    const i = sx - p.x0;
    if (i < 0 || i >= p.wpts.length - 1) continue;
    const a = p.wpts[i], b = p.wpts[i + 1];
    if (!vis(a.x, a.y, a.z)) continue;
    const g = segGeo(a, b, w);
    out.push({ wx: a.x, wy: a.y, d: depthOf(a.x, a.y) + 0.45 * T, draw(ctx) {
      const bk = baked('st|' + band + '|' + (Math.abs(g.ny) > Math.abs(g.nx) ? 1 : 0), () => stationShapes(M, g, T, mono));
      const s0 = worldToScreen(a.x, a.y, a.z);
      blitBaked(ctx, bk, s0.x, s0.y, d);
      const n = (CM.nightF || 0) * (1 - decay);
      if (n > 0.05) elevGlow(s0.x, s0.y - 0.3 * T * z, 14 * z / 0.625, M.glow, 0.5 * n);
    } });
  }
  // rames : une par sens, 3 voitures (fer) ou 4 (monorail)
  if (MET.trains > 0 && decay < 0.5) {
    const total = p.cum[p.cum.length - 1];
    const t = now / 1000;
    const speed = (mono ? 3.2 : 2.4) * T;
    const nCars = mono ? 4 : 3, carL = 0.98 * T;
    for (const [dir, lane, phase] of [[1, mono ? 0.24 : 0.2, 0], [-1, mono ? -0.24 : -0.2, 0.5]]) {
      const loop = total + nCars * carL + 6 * T;         // un temps hors champ entre deux passages
      const head = ((t * speed + phase * loop) % loop);
      for (let c = 0; c < nCars; c += 1) {
        const s = head - c * carL;
        if (s < 0 || s > total) continue;
        const sd = dir > 0 ? s : total - s;
        const q = along(p, sd);
        if (q.z < 0.5 * T) continue;                       // pas de rame sur les rampes basses
        const x = q.x + -q.uy * lane * T, y = q.y + q.ux * lane * T;
        if (!vis(x, y, q.z)) continue;
        metroStats.cars += 1;
        if (!metroStats.where) metroStats.where = [Math.round(x / T), Math.round(y / T)];
        out.push({ wx: x, wy: y, d: depthOf(x, y) + 0.3 * T, draw(ctx) {
          const bk = baked('tr|' + band + '|' + (Math.abs(q.ux) >= Math.abs(q.uy) ? 1 : 0), () => trainShapes(M, q.ux, q.uy, T, mono));
          const s0 = worldToScreen(x, y, q.z);
          blitBaked(ctx, bk, s0.x, s0.y, d);
          const n = CM.nightF || 0;
          if (n > 0.05) elevGlow(s0.x, s0.y - 0.25 * T * z, 9 * z / 0.625, M.glow, 0.4 * n);
        } });
      }
    }
  }
}

if (typeof window !== 'undefined') {
  window.__metro = (o) => { if (o) Object.assign(MET, o); const p = CM.layout ? metroPlanFor(CM.layout) : null; return { ...MET, plan: p ? { sign: p.sign, x0: p.x0, x1: p.x1, stations: p.stations, mono: p.mono, y0: p.pts[0] && p.pts[0].y } : null, stats: { ...metroStats }, deck: METRO.deck }; };
}
