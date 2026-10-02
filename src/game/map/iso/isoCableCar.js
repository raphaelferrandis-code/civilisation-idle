"use strict";
// ── LE TÉLÉPHÉRIQUE DU FLEUVE — dernier lot de docs/PLAN-ETAGES.md ────────────
//
// Une ligne de cabines au-dessus du fleuve, d'une rive à l'autre (bandes 5-9). Il
// part de la promenade du quai côté CŒUR et arrive sur le TOIT d'une station du métro
// de l'autre rive (correspondance) : aucun terrain pris, rien à réserver. Placé du
// côté du pont opposé au quartier flottant, à 10-30 cases du pont, loin du Vieux-Port
// et des Plaisirs. « Un seul pont » tient : c'est un câble, pas un ouvrage.
// B5-B6 : pylônes de fer et cabines rouges ; B7-B9 : mâts fins et capsules de l'ère.
// Pur f(now) ; câbles et cabines triés à l'aplomb (au-dessus de l'eau, rien dessous).
//
// Molette : __cableCar({ on }).
import { CM } from '../layout.js';
import { worldToScreen, depthOf } from './projection.js';
import { vieK } from './isoVie.js';
import { METRO, bankRowAt } from '../procedural/metroPlan.js';
import { metroPlanFor } from './isoMetro.js';
import { isleSideOf, floatIsleSite, ISLE } from './isoFloatIsle.js';
import { boxShapes, bakeShapes, blitBaked, makeBakeCache, elevGlow } from './elevPaint.js';

export const CABLE = { on: true, band: 5, top: 3.6, sag: 0.55, cabins: 3, speed: 0.9 };

const MAT = {
  5: { pyl: ['#55665f', '#3f4c47', '#2c3532'], head: ['#d9cbb0', '#b9a888', '#8f7f64'], roof: '#8f3b2e', cab: ['#e8d9b8', '#c0392b', '#8e2a1f', '#f3e3a8'], wire: '#2a2622', glow: '255,210,130' },
  6: { pyl: ['#6d7378', '#555b60', '#3c4145'], head: ['#e3e6e9', '#c2c7cc', '#9aa0a6'], roof: '#c0392b', cab: ['#f2f2ee', '#d64a3a', '#a33528', '#cfe6f2'], wire: '#25282c', glow: '255,226,170' },
  7: { pyl: ['#e6f0ea', '#c4d8cd', '#93ab9e'], head: ['#f4fbf6', '#d6ebe0', '#a3c8b6'], roof: '#5fae98', cab: ['#f4fbf6', '#9ad6c4', '#5fae98', '#3f8fb0'], wire: '#2d3a33', glow: '170,255,220' },
  8: { pyl: ['#fbf3dc', '#ead9a8', '#c9ad6a'], head: ['#fffaf0', '#f2e3b8', '#d4b876'], roof: '#c9a24a', cab: ['#fffaf0', '#f0d48a', '#c9a24a', '#4fb3a0'], wire: '#40341c', glow: '255,214,140' },
  9: { pyl: ['#f4f1fb', '#dcd4ee', '#b8acd6'], head: ['#fbfaff', '#e6dff5', '#c4b8e0'], roof: '#8a6fd8', cab: ['#fbfaff', '#cbbcf2', '#9c88d8', '#8a6fd8'], wire: '#3a3050', glow: '200,180,255' },
};
const matFor = (b) => MAT[Math.max(5, Math.min(9, b | 0))];

// La ligne : { x, yN, yS, zN, zS } (cellules / tuiles) ou null. Le côté « cœur » est
// la rive opposée à celle du métro.
export function cableSite(L, metro) {
  if (!L || !L.counts || (L.counts.eraBand | 0) < CABLE.band) return null;
  const R = L.river;
  if (!R || !R.present || !R.bridge || !metro) return null;
  const bx = R.bridge.x;
  const avoid = [{ x: bx, r: 10 }];
  const op = L.ports && L.ports.old;
  if (op) avoid.push({ x: op.gx + op.w / 2, r: op.w / 2 + 4 });
  if (R.plaisirs) avoid.push({ x: R.plaisirs.x, r: (R.plaisirs.clear || 8) + 4 });
  const isle = floatIsleSite(L);
  if (isle) avoid.push({ x: isle.x, r: ISLE.R + 5 });
  const side = -isleSideOf(L);
  const cands = metro.stations.filter((x) => Math.abs(x - bx) <= 30 && !avoid.some((a) => Math.abs(x + 0.5 - a.x) < a.r));
  cands.sort((p, q) => ((p - bx) * side > 0 ? 0 : 1) - ((q - bx) * side > 0 ? 0 : 1) || Math.abs(Math.abs(p - bx) - 18) - Math.abs(Math.abs(q - bx) - 18));
  for (const x of cands) {
    const i = x - metro.x0;
    const mp = metro.pts[i];
    if (!mp || mp.z < METRO.deck - 1e-6) continue;
    const yCore = bankRowAt(R, x, -metro.sign, L.gridN);
    if (yCore == null) continue;
    // tour côté cœur : sur la promenade, à mi-cellule ; arrivée : au-dessus de la station
    return { x: x + 0.5, yN: yCore + 0.5 - metro.sign * 0.2, yS: mp.y + metro.sign * 0.32, baseN: 0, baseS: METRO.deck + 0.5, sign: metro.sign };
  }
  return null;
}

// Hauteur du câble à u ∈ [0,1] (chaînette approchée par une parabole).
export function cableZ(u, top = CABLE.top, sag = CABLE.sag) { return top - 4 * sag * u * (1 - u); }

const _bakes = makeBakeCache(40);
function baked(key, make) {
  const z = CM.cam.zoom, d = CM.dpr || 1, kd = Math.max(1, Math.round(vieK() * d));
  return _bakes.get(key + '|' + z + '|' + d, () => bakeShapes(make(), z, d, kd));
}
function towerShapes(M, T, base, top, mono) {
  const s = [];
  const h = (top - base) * T, c = (mono ? 0.07 : 0.1) * T;
  if (mono) s.push(...boxShapes(-c, -c, c, c, 0, h - 0.35 * T, null, M.pyl[1], M.pyl[2], M.pyl[2]));
  else {
    // pylône en treillis : deux montants et des croisillons
    for (const o of [-0.13, 0.13]) s.push(...boxShapes(o * T - c * 0.5, -c * 0.5, o * T + c * 0.5, c * 0.5, 0, h - 0.35 * T, null, M.pyl[1], M.pyl[2], null));
    for (let zz = 0.1 * T; zz < h - 0.4 * T; zz += 0.22 * T) {
      for (let u = 0; u <= 1; u += 0.125) {
        s.push({ px: [(-0.13 + 0.26 * u) * T, 0, zz + u * 0.2 * T], col: M.pyl[0] });
        s.push({ px: [(0.13 - 0.26 * u) * T, 0, zz + u * 0.2 * T], col: M.pyl[0] });
      }
    }
  }
  // tête : la gare du câble
  s.push(...boxShapes(-0.32 * T, -0.26 * T, 0.32 * T, 0.26 * T, h - 0.38 * T, h - 0.02 * T, M.head[0], M.head[1], M.head[2], M.pyl[2]));
  s.push(...boxShapes(-0.36 * T, -0.3 * T, 0.36 * T, 0.3 * T, h - 0.02 * T, h + 0.06 * T, M.roof, M.roof, M.pyl[2], null));
  return s;
}
function cabinShapes(M, T) {
  const s = [];
  for (let k = 0; k < 5; k += 1) s.push({ px: [0, 0, 0.3 * T - k * 0.05 * T], col: M.wire });
  s.push(...boxShapes(-0.13 * T, -0.1 * T, 0.13 * T, 0.1 * T, 0.02 * T, 0.1 * T, M.cab[0], M.cab[0], M.cab[2], M.wire));
  s.push(...boxShapes(-0.13 * T, -0.1 * T, 0.13 * T, 0.1 * T, -0.14 * T, 0.02 * T, M.cab[1], M.cab[1], M.cab[2], M.wire));
  for (const u of [-0.08, 0, 0.08]) { s.push({ px: [u * T, 0.1 * T, 0.06 * T], col: M.cab[3] }); s.push({ px: [0.13 * T, u * T, 0.06 * T], col: M.cab[3] }); }
  return s;
}

let _siteFor = null, _site = null;
export const cableStats = { on: false, site: null };
export function cableCarActors(now, out, decay = 0) {
  cableStats.on = false;
  const L = CM.layout;
  if (!CABLE.on || !L) return;
  if (_siteFor !== L) { _siteFor = L; _site = cableSite(L, metroPlanFor(L)); }
  const S = _site;
  cableStats.site = S;
  if (!S) return;
  const T = CM.TILE, z = CM.cam.zoom, d = CM.dpr || 1, k = vieK();
  const band = L.counts.eraBand | 0, M = matFor(band), mono = band >= 7;
  const xw = S.x * T, yN = S.yN * T, yS = S.yS * T;
  const mg = 4 * T * z;
  const pN = worldToScreen(xw, yN, CABLE.top * T), pS = worldToScreen(xw, yS, CABLE.top * T);
  if (Math.max(pN.x, pS.x) < -mg || Math.min(pN.x, pS.x) > CM.cw + mg || Math.max(pN.y, pS.y) < -mg || Math.min(pN.y, pS.y) > CM.ch + mg * 3) return;
  cableStats.on = true;
  const n = (CM.nightF || 0) * (1 - decay);
  // deux pylônes
  for (const [y, base, key] of [[yN, S.baseN, 'N'], [yS, S.baseS, 'S']]) {
    out.push({ wx: xw, wy: y, d: depthOf(xw, y) + (key === 'S' ? 0.6 * T : 0.05 * T), draw(ctx) {
      const bk = baked('tw|' + band + '|' + key, () => towerShapes(M, T, base, CABLE.top + 0.25, mono));
      const q = worldToScreen(xw, y, base * T);
      blitBaked(ctx, bk, q.x, q.y, d);
      if (n > 0.05) { const h = worldToScreen(xw, y, (CABLE.top + 0.05) * T); elevGlow(h.x, h.y, 12 * z / 0.625, M.glow, 0.5 * n); }
    } });
  }
  // câbles : deux (un par sens), en 8 tronçons triés à leur aplomb
  const cut = decay > 0.5 ? 0.55 : 1;                    // la ville tombe : le câble rompu pend
  const len = yS - yN;
  for (const off of [-0.12, 0.12]) {
    const cx = xw + off * T;
    for (let sgm = 0; sgm < 8; sgm += 1) {
      const u0 = sgm / 8, u1 = (sgm + 1) / 8;
      if (u0 >= cut) break;
      const ym = yN + len * (u0 + u1) / 2;
      out.push({ wx: cx, wy: ym, d: depthOf(cx, ym) + 0.02 * T, draw(ctx) {
        ctx.fillStyle = M.wire;
        const steps = 24;
        for (let i = 0; i <= steps; i += 1) {
          const u = u0 + (Math.min(u1, cut) - u0) * (i / steps);
          const q = worldToScreen(cx, yN + len * u, cableZ(u) * T);
          ctx.fillRect(Math.round(q.x / k - 0.5) * k, Math.round(q.y / k - 0.5) * k, k, k);
        }
      } });
    }
  }
  // cabines
  if (decay < 0.5) {
    const t = now / 1000;
    for (const [off, dir] of [[-0.12, 1], [0.12, -1]]) {
      for (let c = 0; c < CABLE.cabins; c += 1) {
        const ph = ((t * CABLE.speed * T / len) + c / CABLE.cabins + (dir < 0 ? 0.5 / CABLE.cabins : 0)) % 1;
        const u = dir > 0 ? ph : 1 - ph;
        const fade = Math.min(1, Math.min(u, 1 - u) / 0.06);
        if (fade <= 0.02) continue;
        const cx = xw + off * T, cy = yN + len * u, cz = cableZ(u) * T - 0.3 * T;
        out.push({ wx: cx, wy: cy, d: depthOf(cx, cy) + 0.05 * T, draw(ctx) {
          const q = worldToScreen(cx, cy, cz);
          blitBaked(ctx, baked('cab|' + band, () => cabinShapes(M, T)), q.x, q.y, d, fade);
          if (n > 0.05) elevGlow(q.x, q.y - 0.02 * T * z, 6 * z / 0.625, M.glow, 0.5 * n * fade);
        } });
      }
    }
  }
}

if (typeof window !== 'undefined') {
  // Seul un réglage de FORME vide les images cuites (allumer/éteindre ne coûte rien).
  window.__cableCar = (o) => { if (o) { Object.assign(CABLE, o); if (Object.keys(o).some((k) => k !== 'on')) { _siteFor = null; _bakes.clear(); } } return { ...CABLE, stats: { ...cableStats } }; };
}
