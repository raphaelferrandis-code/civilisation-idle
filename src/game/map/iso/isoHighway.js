"use strict";
// ── L'AUTOROUTE DE L'ARTÈRE — le dessin (lot 2 de docs/PLAN-ETAGES.md) ───────
//
// Le PLAN (tracé, profil, échangeur) vient du layout : L.highway, calculé par
// procedural/highwayPlan.js. Ici on le dessine, au grain du sol, comme les ponts :
//   · le TABLIER, découpé en tronçons d'une demi-cellule. Chaque tronçon donne
//     DEUX acteurs au peintre : le dessus (chaussée, marquages, face intérieure des
//     glissières qui regardent ailleurs) trié à son coin ARRIÈRE, et la tranche
//     (face visible, sous-face, glissière extérieure) triée à son coin AVANT —
//     ce qui roule dessus passe entre les deux ;
//   · les PILES en T sur le terre-plein central, les lampadaires, l'OMBRE au sol ;
//   · la CIRCULATION : les vraies voitures de l'ère (drawIsoVehicle, skins de
//     vehSkinFor), posées à la hauteur du tablier, en pur f(now).
// Tout morceau qui se répète est CUIT (elevPaint) : le tablier droit tient en deux
// images par zoom.
//
// Molette : __highway({ on, cars, lamps, shadow }).
import { CM } from '../layout.js';
import { worldToScreen, depthOf } from './projection.js';
import { lightCtx } from '../lightLayer.js';
import { vieK, vieHalo } from './isoVie.js';
import { drawIsoVehicle } from './isoUnits.js';
import { vehSkinFor } from '../agents.js';
import { bankRibbon, loopRibbons, HIGHWAY } from '../procedural/highwayPlan.js';
import { boxShapes, bakeShapes, blitBaked, makeBakeCache } from './elevPaint.js';

export const HWY = { on: true, cars: 1, lamps: 1, shadow: 0.55, th: 0.26, ph: 0.1 };

// Matière par ère : chaussée (2 tons), marquages, faces (éclairée / moyenne /
// ombre), sous-face, face intérieure des glissières, piles, contour, et la lueur
// des bandes de rive la nuit (null = aucune).
const MAT = {
  6: { top: ['#55575d', '#5c5e64'], line: 'rgba(236,232,220,0.85)', mid2: 'rgba(240,200,80,0.9)', lit: '#cfccc4', mid: '#aeaaa2', dark: '#86837d', under: '#5d5b57', parIn: '#9a978f', pyl: ['#c4c0b8', '#9e9a92'], out: '#3b3a37', edge: null, lamp: '255,190,110' },
  7: { top: ['#4a5552', '#505b58'], line: 'rgba(226,246,236,0.85)', mid2: 'rgba(120,230,190,0.9)', lit: '#e6f0ea', mid: '#c4d8cd', dark: '#93ab9e', under: '#5e6f66', parIn: '#b5c9be', pyl: ['#e0ece5', '#a9c2b5'], out: '#2d3a33', edge: '150,255,210', lamp: '170,255,220' },
  8: { top: ['#4f4a44', '#56514a'], line: 'rgba(250,240,214,0.85)', mid2: 'rgba(240,196,90,0.9)', lit: '#fbf3dc', mid: '#ead9a8', dark: '#c9ad6a', under: '#7a6a48', parIn: '#e0cfa0', pyl: ['#f6ecd0', '#d6bf86'], out: '#40341c', edge: '255,220,140', lamp: '255,214,140' },
  9: { top: ['#4c4860', '#534f68'], line: 'rgba(240,236,252,0.85)', mid2: 'rgba(180,150,255,0.9)', lit: '#f4f1fb', mid: '#dcd4ee', dark: '#b8acd6', under: '#6c6288', parIn: '#cfc5e6', pyl: ['#efeafa', '#c4b8e0'], out: '#3a3050', edge: '170,140,255', lamp: '200,180,255' },
};
const matFor = (band) => MAT[Math.max(6, Math.min(9, band | 0))];

// ── RUBANS (monde) ───────────────────────────────────────────────────────────
let _ribFor = null, _ribs = [];
export function highwayRibbons(H, T) {
  if (!H) return [];
  if (_ribFor === H) return _ribs;
  const out = [];
  for (const b of H.banks) out.push(bankRibbon(H, b));
  for (const r of loopRibbons(H)) out.push(r);
  for (const r of out) {
    r.pts = r.pts.map((p) => ({ x: p.x * T, y: p.y * T, z: p.z * T }));
    r.cum = [0];
    for (let i = 1; i < r.pts.length; i += 1) r.cum.push(r.cum[i - 1] + Math.hypot(r.pts[i].x - r.pts[i - 1].x, r.pts[i].y - r.pts[i - 1].y));
  }
  _ribFor = H; _ribs = out;
  return out;
}

// Géométrie d'un tronçon a→b de largeur w (px monde) : quatre coins, normale gauche.
function segGeo(a, b, w) {
  const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
  const nx = -dy / L, ny = dx / L, h = w / 2;
  return {
    AL: [a.x + nx * h, a.y + ny * h, a.z], BL: [b.x + nx * h, b.y + ny * h, b.z],
    AR: [a.x - nx * h, a.y - ny * h, a.z], BR: [b.x - nx * h, b.y - ny * h, b.z],
    nx, ny, ux: dx / L, uy: dy / L, L,
  };
}
// Face verticale de normale (nx, ny) : +y éclairée, +x à l'ombre (lumière haut-gauche).
function shade(M, nx, ny) {
  const v = (ny - nx) / Math.SQRT2;
  return v > 0.35 ? M.lit : v < -0.35 ? M.dark : M.mid;
}
// Coordonnées relatives à l'origine a (le bake est posé à worldToScreen(a)).
const rel = (a, p) => [p[0] - a.x, p[1] - a.y, p[2] - a.z];
const vquad = (a, p, q, dz0, dz1, col) => ({ poly: [rel(a, [p[0], p[1], p[2] + dz1]), rel(a, [q[0], q[1], q[2] + dz1]), rel(a, [q[0], q[1], q[2] + dz0]), rel(a, [p[0], p[1], p[2] + dz0])], col });

function backShapes(M, r, a, b, g, i, T) {
  const s = [];
  const ph = HWY.ph * T;
  s.push({ poly: [rel(a, g.AL), rel(a, g.BL), rel(a, g.BR), rel(a, g.AR)], col: M.top[i % 2] });
  // marquages : rives pleines, tirets entre voies (deux sur quatre), axe central
  const half = r.w / 2;
  const tick = (u, off, col) => {
    const p = [a.x + (b.x - a.x) * u + g.nx * off, a.y + (b.y - a.y) * u + g.ny * off, a.z + (b.z - a.z) * u];
    s.push({ px: rel(a, p), col });
  };
  for (let u = 0; u < 1; u += 0.25) {
    tick(u, half - 0.1 * T, M.line); tick(u, -half + 0.1 * T, M.line);
    if (r.main) {
      if ((i % 2) === 0) { tick(u, 0.49 * T, M.line); tick(u, -0.49 * T, M.line); }
      tick(u, 0.03 * T, M.mid2); tick(u, -0.03 * T, M.mid2);
    }
  }
  // glissières dont la face extérieure regarde AILLEURS : on voit leur face intérieure
  const visL = (g.nx + g.ny) > 0, visR = (-g.nx - g.ny) > 0;
  if (!visL) s.push(vquad(a, g.AL, g.BL, 0, ph, M.parIn));
  if (!visR) s.push(vquad(a, g.AR, g.BR, 0, ph, M.parIn));
  return s;
}
function frontShapes(M, g, a, T) {
  const s = [];
  const ph = HWY.ph * T, th = HWY.th * T;
  const visL = (g.nx + g.ny) > 0, visR = (-g.nx - g.ny) > 0;
  if (visL) {
    s.push(vquad(a, g.AL, g.BL, -th, 0, shade(M, g.nx, g.ny)));
    s.push(vquad(a, g.AL, g.BL, -th, -th * 0.72, M.under));
    s.push(vquad(a, g.AL, g.BL, 0, ph, M.lit));
  }
  if (visR) {
    s.push(vquad(a, g.AR, g.BR, -th, 0, shade(M, -g.nx, -g.ny)));
    s.push(vquad(a, g.AR, g.BR, -th, -th * 0.72, M.under));
    s.push(vquad(a, g.AR, g.BR, 0, ph, M.mid));
  }
  return s;
}
function pierShapes(M, r, g, top, T) {
  const big = r.main, c = (big ? 0.16 : 0.1) * T;
  const s = boxShapes(-c, -c, c, c, -top, -(big ? 0.14 : 0.05) * T, null, M.pyl[0], M.pyl[1], M.out);
  if (!big) return s;
  // chevêtre : poutre transversale sous le tablier
  const hw = r.w * 0.42;
  const ax = Math.abs(g.nx) > Math.abs(g.ny);
  if (ax) s.push(...boxShapes(-hw, -0.2 * T, hw, 0.2 * T, -0.18 * T, 0, M.mid, M.lit, M.dark, null));
  else s.push(...boxShapes(-0.2 * T, -hw, 0.2 * T, hw, -0.18 * T, 0, M.mid, M.lit, M.dark, null));
  return s;
}
function lampShapes(M, T) {
  const s = [];
  for (let k = 0; k < 8; k += 1) s.push({ px: [0, 0, (0.62 * T * k) / 7], col: M.out });
  s.push({ px: [-0.06 * T, 0.06 * T, 0.64 * T], col: '#d8d4c8' }, { px: [0, 0, 0.64 * T], col: '#d8d4c8' }, { px: [0.06 * T, -0.06 * T, 0.64 * T], col: '#d8d4c8' });
  return s;
}

const _bakes = makeBakeCache(320);
function baked(key, make) {
  const z = CM.cam.zoom, d = CM.dpr || 1, kd = Math.max(1, Math.round(vieK() * d));
  return _bakes.get(key + '|' + z + '|' + d, () => bakeShapes(make(), z, d, kd));
}
const r1 = (v) => Math.round(v * 10) / 10;

function glowAt(x, y, r, col, a) {
  const lc = lightCtx(x - r, y - r, x + r, y + r);
  if (!lc || !(a > 0.004)) return;
  if (vieHalo(lc, x, y, r, col, a)) return;
  const gr = lc.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, `rgba(${col},${a.toFixed(3)})`);
  gr.addColorStop(1, `rgba(${col},0)`);
  lc.fillStyle = gr;
  lc.fillRect(x - r, y - r, r * 2, r * 2);
}

// ── LA CIRCULATION ───────────────────────────────────────────────────────────
const CAR_TYPES = ['car', 'car', 'car', 'taxi', 'car', 'bus', 'car', 'van', 'car', 'truck'];
function h01(n) {
  let h = Math.imul((n | 0) ^ 0x85ebca6b, 2654435761) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d) >>> 0; h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}
// Point du ruban à l'abscisse curviligne s : position, cap, hauteur.
function along(r, s) {
  let j = 1;
  while (j < r.cum.length - 1 && r.cum[j] < s) j += 1;
  const a = r.pts[j - 1], b = r.pts[j], seg = (r.cum[j] - r.cum[j - 1]) || 1;
  const u = Math.max(0, Math.min(1, (s - r.cum[j - 1]) / seg));
  return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, z: a.z + (b.z - a.z) * u, ux: (b.x - a.x) / seg, uy: (b.y - a.y) / seg };
}
const _veh = [];
function carActors(r, ri, now, band, T, out, vis) {
  const total = r.cum[r.cum.length - 1];
  if (total <= 0) return;
  const t = now / 1000;
  r.lanes.forEach((lo, li) => {
    const dir = r.lanes.length === 1 ? 1 : (lo > 0 ? 1 : -1);
    const gap = (1.4 + h01(ri * 31 + li * 7) * 1.2) * T;
    const n = Math.floor(total / gap);
    for (let i = 0; i < n; i += 1) {
      const id = ri * 1000 + li * 100 + i;
      if (h01(id * 13) < 0.3 * (2 - HWY.cars)) continue;
      const s = ((t * 2.4 * T * dir + i * gap + h01(id * 3) * gap * 0.5) % total + total) % total;
      const p = along(r, s);
      if (p.z < 0.12 * T) continue;                       // au sol : les voitures du jeu y sont déjà
      const x = p.x + -p.uy * lo * T, y = p.y + p.ux * lo * T;
      if (!vis(x, y, p.z)) continue;
      const hx = p.ux * dir, hy = p.uy * dir;
      const vdir = Math.abs(hx) > Math.abs(hy) ? (hx > 0 ? 0 : 1) : (hy > 0 ? 2 : 3);
      const type = CAR_TYPES[Math.floor(h01(id * 17) * CAR_TYPES.length)];
      const v = _veh[id] || (_veh[id] = { x: 0, y: 0, gx: 0, gy: 0, dir: 0, type, skin: vehSkinFor(type, id * 2654435761, band), rollDist: 0, fade: 1, _lox: 0, _loy: 0, tx: 0, ty: 0, parkT: 0, pauseT: 0 });
      if (v._band !== band) { v._band = band; v.type = type; v.skin = vehSkinFor(type, id * 2654435761, band) || undefined; }
      const z = p.z;
      out.push({ wx: x, wy: y, d: depthOf(x, y) + 0.2 * T, draw(ctx, nw) {
        v.x = x; v.y = y; v.gx = Math.floor(x / T); v.gy = Math.floor(y / T);
        v.dir = vdir; v.rollDist = s; v.tx = x + hx * T; v.ty = y + hy * T;
        const zz = CM.cam.zoom;
        ctx.save();
        ctx.translate(0, -Math.round(z * zz * (CM.dpr || 1)) / (CM.dpr || 1));
        try { drawIsoVehicle(ctx, v, nw, zz); } finally { ctx.restore(); }
      } });
    }
  });
}

// ── LES ACTEURS ──────────────────────────────────────────────────────────────
export const hwyStats = { segs: 0, cars: 0 };
export function highwayActors(now, out) {
  hwyStats.segs = 0; hwyStats.cars = 0;
  const L = CM.layout;
  if (!HWY.on || !L || !L.highway || CM.lodActive) return;
  const T = CM.TILE, z = CM.cam.zoom, d = CM.dpr || 1;
  const band = (L.counts && L.counts.eraBand) | 0;
  const M = matFor(band);
  const night = CM.nightF || 0;
  const mg = 3 * T * z;
  const vis = (x, y, zz) => {
    const p = worldToScreen(x, y, zz);
    return p.x > -mg && p.x < CM.cw + mg && p.y > -mg && p.y < CM.ch + mg * 2;
  };
  const ribs = highwayRibbons(L.highway, T);
  ribs.forEach((r, ri) => {
    const w = r.w * T;
    for (let i = 0; i < r.pts.length - 1; i += 1) {
      const a = r.pts[i], b = r.pts[i + 1];
      if (Math.max(a.z, b.z) < 0.03 * T) continue;      // au sol : la rue suffit
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      if (!vis(mx, my, a.z) && !vis(mx, my, 0)) continue;
      hwyStats.segs += 1;
      const g = segGeo(a, b, w);
      const kGeo = r1(b.x - a.x) + ',' + r1(b.y - a.y) + ',' + r1(a.z) + ',' + r1(b.z - a.z) + '|' + r.w + '|' + (r.main ? 1 : 0);
      const corners = [g.AL, g.BL, g.AR, g.BR].map((p) => depthOf(p[0], p[1]));
      const dBack = Math.min(...corners), dFront = Math.max(...corners);
      // ombre au sol, décalée vers le bas-droite (soleil haut-gauche)
      if (HWY.shadow > 0) {
        const sk = HWY.shadow;
        const o = { x: a.x + a.z * sk, y: a.y, z: 0 };
        const q = [g.AL, g.BL, g.BR, g.AR].map((p) => [p[0] + p[2] * sk - o.x, p[1] - o.y, 0]);
        const sd = Math.min(...q.map((p) => depthOf(p[0] + o.x, p[1] + o.y)));
        out.push({ wx: o.x, wy: o.y, d: sd - 0.05 * T, draw(ctx) {
          const bk = baked('sh|' + kGeo, () => [{ poly: q, col: '#141828' }]);
          const p = worldToScreen(o.x, o.y, 0);
          blitBaked(ctx, bk, p.x, p.y, d, 0.16 * (1 - 0.75 * (CM.nightF || 0)));
        } });
      }
      out.push({ wx: mx, wy: my, d: dBack + 0.05 * T, draw(ctx) {
        const bk = baked('bk|' + band + '|' + (i % 2) + '|' + kGeo, () => backShapes(M, r, a, b, g, i, T));
        const p = worldToScreen(a.x, a.y, a.z);
        blitBaked(ctx, bk, p.x, p.y, d);
      } });
      out.push({ wx: mx, wy: my, d: dFront + 0.4 * T, draw(ctx) {
        const bk = baked('fr|' + band + '|' + kGeo, () => frontShapes(M, g, a, T));
        const p = worldToScreen(a.x, a.y, a.z);
        blitBaked(ctx, bk, p.x, p.y, d);
        // la nuit, les ères cosmiques allument la rive du tablier
        if (M.edge && (CM.nightF || 0) > 0.05) {
          const pb = worldToScreen(b.x, b.y, b.z);
          glowAt((p.x + pb.x) / 2, (p.y + pb.y) / 2 + HWY.th * T * z * 0.5, 3 * z / 0.625, M.edge, 0.35 * (CM.nightF || 0));
        }
      } });
      // piles : sur le terre-plein (tablier principal) toutes les 3 cellules, sous
      // les boucles toutes les 4 tranches
      const every = r.main ? 6 : 4;
      const top = a.z - HWY.th * T;
      if (i % every === 0 && top > 0.35 * T) {
        // ⚠ AVANT le dessus du tablier : le chevêtre est SOUS la chaussée ; trié à
        // l'aplomb de l'axe, il se peignait par-dessus elle.
        out.push({ wx: a.x, wy: a.y, d: dBack - 0.02 * T, draw(ctx) {
          const bk = baked('pi|' + band + '|' + r1(top) + '|' + (r.main ? 1 : 0) + '|' + (Math.abs(g.nx) > Math.abs(g.ny) ? 1 : 0), () => pierShapes(M, r, g, top, T));
          const p = worldToScreen(a.x, a.y, top);
          blitBaked(ctx, bk, p.x, p.y, d);
        } });
      }
      // lampadaires sur l'axe du tablier principal, toutes les 2 cellules
      if (HWY.lamps > 0 && r.main && i % 4 === 2 && a.z > 0.5 * T) {
        out.push({ wx: a.x, wy: a.y, d: depthOf(a.x, a.y) + 0.25 * T, draw(ctx) {
          const p = worldToScreen(a.x, a.y, a.z);
          blitBaked(ctx, baked('la|' + band, () => lampShapes(M, T)), p.x, p.y, d);
          if (night > 0.05) {
            const ph = worldToScreen(a.x, a.y, a.z + 0.64 * T);
            glowAt(ph.x, ph.y, 13 * z / 0.625, M.lamp, 0.5 * night);
          }
        } });
      }
    }
    if (HWY.cars > 0) { const n0 = out.length; carActors(r, ri, now, band, T, out, vis); hwyStats.cars += out.length - n0; }
  });
}

if (typeof window !== 'undefined') {
  window.__highway = (o) => { if (o) Object.assign(HWY, o); const L = CM.layout; return { ...HWY, plan: L && L.highway ? { banks: L.highway.banks.map((b) => ({ sign: b.sign, y0: b.y0, len: b.len, s0: b.s0, s1: b.s1, ramp: b.ramp })), interchange: L.highway.interchange, ax: L.highway.ax } : null, stats: { ...hwyStats }, deck: HIGHWAY.deck }; };
}
