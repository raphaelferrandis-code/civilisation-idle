"use strict";
// ── LE QUARTIER FLOTTANT (bande 9) — lot 4 de docs/PLAN-ETAGES.md ─────────────
//
// Le point d'orgue de la fin de partie : un îlot de cristal suspendu AU-DESSUS DU
// FLEUVE, avec ses tours, son jardin, sa flèche, son ombre sur l'eau et des navettes
// qui tournent autour. Au-dessus de l'eau, rien à trier contre la ville en dessous
// (seulement des bateaux), et rien à réserver dans le plan.
//
// OÙ : une colonne du fleuve à 16-30 cases du pont, du côté tiré par la graine de la
// carte, loin du domaine des Plaisirs et du Vieux-Port, là où le fleuve est assez
// large. Choix dérivé du layout (rien de stocké).
// Le dessin est CUIT en une image par (bande, zoom) ; seules les lumières, les
// navettes et l'ombre se posent à chaque frame.
//
// Molette : __floatIsle({ on, shuttles }).
import { CM } from '../layout.js';
import { worldToScreen, depthOf } from './projection.js';
import { boxShapes, bakeShapes, blitBaked, makeBakeCache, artKdAt, elevGlow } from './elevPaint.js';

// ⚠ En iso, une chute verticale se cache derrière le DESSUS tant qu'elle ne dépasse pas
// la demi-hauteur écran de l'emprise (~R·√2/2 tuiles) : le dessous doit être profond
// (underside > R) pour qu'on voie la roche, d'où l'îlot haut et la pointe longue.
export const ISLE = { on: true, shuttles: 1, band: 9, Z: 5.6, R: 2.3, underside: 3.7, shadowA: 0.34 };

function h01(n) {
  let h = Math.imul((n | 0) ^ 0x27d4eb2f, 2654435761) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d) >>> 0; h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

// Côté du pont où l'îlot se pose d'abord (tiré par la graine) — exporté : le
// téléphérique (isoCableCar) prend l'autre côté, à toutes les ères.
export function isleSideOf(L) { return h01((L && L.mapSeed) | 0) < 0.5 ? -1 : 1; }

// Site de l'îlot (cellules) ou null. Pur : lit seulement le layout.
export function floatIsleSite(L) {
  if (!L || !L.counts || (L.counts.eraBand | 0) < ISLE.band) return null;
  const R = L.river;
  if (!R || !R.present || typeof R.riverYAt !== 'function' || !R.bridge) return null;
  const bx = R.bridge.x;
  const side = isleSideOf(L);
  const avoid = [];
  if (R.plaisirs) avoid.push({ x: R.plaisirs.x, r: (R.plaisirs.clear || 8) + 6 });
  const op = L.ports && L.ports.old;
  if (op) avoid.push({ x: op.gx + op.w / 2, r: op.w / 2 + 6 });
  for (const s of [side, -side]) {
    for (let d = 22; d >= 16; d -= 1) {
      for (const dd of [d, d + 8 - (22 - d)]) {
        const x = Math.round(bx + s * dd);
        if (x < 4 || x >= L.gridN - 4) continue;
        if (avoid.some((a) => Math.abs(x - a.x) < a.r)) continue;
        const y = Math.round(R.riverYAt(x));
        if (!R.isWater(x, y)) continue;
        let a = y, b = y;
        while (R.isWater(x, a - 1)) a -= 1;
        while (R.isWater(x, b + 1)) b += 1;
        if (b - a + 1 < 6) continue;
        return { x: x + 0.5, y: (a + b + 1) / 2 };
      }
    }
  }
  return null;
}

// Palette du cristal (bande 9).
const P = {
  rock: ['#7a66b8', '#56488c', '#3c3070', '#271f48'], rim: ['#efeafa', '#cfc5e6', '#a99cd0'],
  top: '#e9e3f8', path: '#f7f5fd', garden: ['#7fb98a', '#5f9a6c'],
  wall: ['#f4f1fb', '#dcd4ee', '#b8acd6'], glass: '#8a6fd8', out: '#3a3050', crystal: ['#d9ccff', '#b49cff', '#8a6fd8'],
};

// Contour organique de l'îlot (tuiles, autour du centre).
function outline(R, seed) {
  const n = 12, pts = [];
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2;
    const r = R * (0.86 + h01(seed + i * 7) * 0.22);
    pts.push([Math.cos(a) * r, Math.sin(a) * r * 0.92]);
  }
  return pts;
}
function isleShapes(T, seed) {
  const R = ISLE.R, Z = ISLE.Z * T, rimH = 0.35 * T, tip = (ISLE.Z - ISLE.underside) * T;
  const ol = outline(R, seed).map(([x, y]) => [x * T, y * T]);
  const s = [];
  // dessous : triangles du contour vers la pointe, faces tournées vers nous seulement
  const n = ol.length;
  for (let i = 0; i < n; i += 1) {
    const a = ol[i], b = ol[(i + 1) % n];
    const ex = b[0] - a[0], ey = b[1] - a[1];
    const nx = ey, ny = -ex;                                  // normale extérieure (contour anti-horaire en y vers le bas)
    if (nx + ny <= 0) continue;
    const v = (ny - nx) / Math.hypot(nx, ny);
    const col = v > 0.35 ? P.rock[0] : v < -0.35 ? P.rock[2] : P.rock[1];
    // deux étages de roche : une ceinture puis la pointe (le cône lit mieux en facettes)
    const mid = [[a[0] * 0.55, a[1] * 0.55], [b[0] * 0.55, b[1] * 0.55]];
    const zm = Z - rimH - (Z - rimH - tip) * 0.45;
    s.push({ poly: [[a[0], a[1], Z - rimH], [b[0], b[1], Z - rimH], [mid[1][0], mid[1][1], zm], [mid[0][0], mid[0][1], zm]], col });
    s.push({ poly: [[mid[0][0], mid[0][1], zm], [mid[1][0], mid[1][1], zm], [0, 0, tip]], col: v > 0.35 ? P.rock[1] : P.rock[2] });
  }
  // veines claires sur les facettes visibles
  for (let i = 0; i < n; i += 1) {
    const a = ol[i];
    if (a[0] + a[1] <= 0) continue;
    for (let k = 1; k < 6; k += 1) {
      const u = k / 6;
      s.push({ px: [a[0] * (1 - u * 0.9), a[1] * (1 - u * 0.9), (Z - rimH) - (Z - rimH - tip) * u], col: P.rock[0] });
    }
  }
  // cristaux pendus sous la roche
  for (let k = 0; k < 6; k += 1) {
    const a = h01(seed + 100 + k) * Math.PI * 2, r = (0.35 + h01(seed + 200 + k) * 0.35) * R * T;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (x + y < -0.2 * R * T) continue;
    const z0 = Z - rimH - (0.3 + h01(seed + 300 + k) * 0.5) * T;
    s.push({ poly: [[x - 0.08 * T, y, z0 + 0.4 * T], [x + 0.08 * T, y, z0 + 0.4 * T], [x, y, z0 - 0.45 * T]], col: P.crystal[1] });
  }
  // ceinture : la tranche du sol, faces visibles
  for (let i = 0; i < n; i += 1) {
    const a = ol[i], b = ol[(i + 1) % n];
    const nx = b[1] - a[1], ny = -(b[0] - a[0]);
    if (nx + ny <= 0) continue;
    const v = (ny - nx) / Math.hypot(nx, ny);
    s.push({ poly: [[a[0], a[1], Z], [b[0], b[1], Z], [b[0], b[1], Z - rimH], [a[0], a[1], Z - rimH]], col: v > 0.35 ? P.rim[0] : v < -0.35 ? P.rim[2] : P.rim[1] });
  }
  // dessus : dallage de nacre, jardin, allée
  s.push({ poly: ol.map(([x, y]) => [x, y, Z]), col: P.top });
  s.push({ poly: ol.map(([x, y]) => [x * 0.62, y * 0.62, Z]), col: P.garden[1] });
  s.push({ poly: ol.map(([x, y]) => [x * 0.55, y * 0.55, Z]), col: P.garden[0] });
  s.push({ poly: [[-R * 0.62 * T, -0.08 * T, Z], [R * 0.62 * T, -0.08 * T, Z], [R * 0.62 * T, 0.08 * T, Z], [-R * 0.62 * T, 0.08 * T, Z]], col: P.path });
  s.push({ poly: [[-0.08 * T, -R * 0.6 * T, Z], [0.08 * T, -R * 0.6 * T, Z], [0.08 * T, R * 0.6 * T, Z], [-0.08 * T, R * 0.6 * T, Z]], col: P.path });
  // tours, du fond vers l'avant (x + y croissant)
  const towers = [
    [-1.35, -0.75, 0.42, 2.3], [0.95, -1.15, 0.38, 1.7], [-1.55, 0.55, 0.34, 1.25],
    [1.45, 0.2, 0.36, 1.45], [-0.35, 1.3, 0.32, 0.95], [0.9, 1.05, 0.3, 0.8],
  ].sort((p, q) => (p[0] + p[1]) - (q[0] + q[1]));
  for (const [tx, ty, hw, hh] of towers) {
    const x = tx * T, y = ty * T, w = hw * T, H = hh * T;
    s.push(...boxShapes(x - w, y - w, x + w, y + w, Z, Z + H, P.wall[0], P.wall[1], P.wall[2], P.out));
    // bandeaux de fenêtres sur les deux faces visibles, tous les 0,18 tuile
    for (let zz = Z + 0.16 * T; zz < Z + H - 0.08 * T; zz += 0.2 * T) {
      for (let u = -0.8; u <= 0.81; u += 0.1) {
        s.push({ px: [x + u * w, y + w, zz], col: P.glass });
        s.push({ px: [x + w, y + u * w, zz], col: P.glass });
      }
    }
    s.push(...boxShapes(x - w * 0.6, y - w * 0.6, x + w * 0.6, y + w * 0.6, Z + H, Z + H + 0.08 * T, P.crystal[0], P.crystal[1], P.crystal[2], null));
  }
  // dôme du jardin (serre) : trois boîtes étagées
  for (const [r, h0, h1, c] of [[0.42, 0, 0.16, 0], [0.32, 0.16, 0.3, 1], [0.18, 0.3, 0.4, 0]]) {
    s.push(...boxShapes(0.75 * T - r * T, -0.25 * T - r * T, 0.75 * T + r * T, -0.25 * T + r * T, Z + h0 * T, Z + h1 * T, P.crystal[c], P.crystal[1], P.crystal[2], null));
  }
  // flèche centrale de cristal
  const sw = 0.16 * T, sh = 3.1 * T;
  s.push(...boxShapes(-sw, -sw, sw, sw, Z, Z + sh * 0.72, P.crystal[0], P.crystal[1], P.crystal[2], P.out));
  s.push({ poly: [[-sw, sw, Z + sh * 0.72], [sw, sw, Z + sh * 0.72], [0, 0, Z + sh]], col: P.crystal[1] });
  s.push({ poly: [[sw, -sw, Z + sh * 0.72], [sw, sw, Z + sh * 0.72], [0, 0, Z + sh]], col: P.crystal[2] });
  // arbres du jardin
  for (let k = 0; k < 7; k += 1) {
    const a = (k / 7) * Math.PI * 2 + 0.4, r = R * 0.42 * T;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    s.push(...boxShapes(x - 0.1 * T, y - 0.1 * T, x + 0.1 * T, y + 0.1 * T, Z + 0.06 * T, Z + 0.3 * T, '#8fd09c', '#6fb07c', '#4f8c5c', null));
  }
  return { shapes: s, ol };
}

// Au zoom de REPOS (elevPaint.getZ) : pendant un glissement de zoom, la dernière
// cuisson, posée à l'échelle — l'îlot, son ombre et la navette recuisaient à chaque frame.
const _bakes = makeBakeCache(24);
function bakedIsle(seed, T) {
  const d = CM.dpr || 1;
  return _bakes.getZ('isle|' + seed, d, (z) => bakeShapes(isleShapes(T, seed).shapes, z, d, artKdAt(z, d)));
}
function bakedShadow(seed, T) {
  const d = CM.dpr || 1;
  return _bakes.getZ('ish|' + seed, d, (z) => bakeShapes([{ poly: outline(ISLE.R, seed).map(([x, y]) => [x * T, y * T, 0]), col: '#141430' }], z, d, artKdAt(z, d)));
}
function bakedShuttle(T) {
  const d = CM.dpr || 1;
  return _bakes.getZ('shu', d, (z) => bakeShapes(shuttleShapes(T), z, d, artKdAt(z, d)));
}
function shuttleShapes(T) {
  return [
    ...boxShapes(-0.16 * T, -0.08 * T, 0.16 * T, 0.08 * T, 0, 0.07 * T, '#f4f1fb', '#dcd4ee', '#b8acd6', '#3a3050'),
    ...boxShapes(-0.07 * T, -0.05 * T, 0.09 * T, 0.05 * T, 0.07 * T, 0.13 * T, '#8a6fd8', '#8a6fd8', '#3a3050', null),
  ];
}

// Emprise de l'îlot pour le ciel (les couloirs du fleuve s'en écartent) : { x0, x1 } monde.
export function floatIsleSpan(L) {
  const site = ISLE.on ? floatIsleSite(L) : null;
  if (!site) return null;
  const T = CM.TILE;
  return { x0: (site.x - ISLE.R - 1.2) * T, x1: (site.x + ISLE.R + 1.2) * T };
}

const isleStats = { on: false, site: null };
let _siteFor = null, _site = null;
export function floatIsleActors(now, out, decay = 0) {
  isleStats.on = false;
  const L = CM.layout;
  if (!ISLE.on || !L) return;
  if (_siteFor !== L) { _siteFor = L; _site = floatIsleSite(L); }
  const site = _site;
  isleStats.site = site;
  if (!site) return;
  const T = CM.TILE, z = CM.cam.zoom, d = CM.dpr || 1;
  const wx = site.x * T, wy = site.y * T;
  // À l'effondrement, l'îlot descend vers l'eau et s'éteint.
  const sink = decay * (ISLE.Z - 0.6) * T;
  const p = worldToScreen(wx, wy, -sink);
  const mg = 6 * T * z;
  if (p.x < -mg || p.x > CM.cw + mg || p.y < -mg || p.y > CM.ch + mg * 2) return;
  isleStats.on = true;
  const seed = (L.mapSeed | 0) ^ 0x1515;
  const n = CM.nightF || 0;
  // ombre sur l'eau, décalée vers le bas-droite (soleil haut-gauche)
  const so = (ISLE.Z * T - sink) * 0.35;
  out.push({ wx: wx + so, wy, d: depthOf(wx, wy) - 4 * T, draw(ctx) {
    const q = worldToScreen(wx + so, wy, 0);
    blitBaked(ctx, bakedShadow(seed, T), q.x, q.y, d, ISLE.shadowA * (1 - 0.6 * n) * (1 - decay * 0.5));
  } });
  out.push({ wx, wy, d: depthOf(wx, wy), draw(ctx) {
    const q = worldToScreen(wx, wy, -sink);
    blitBaked(ctx, bakedIsle(seed, T), q.x, q.y, d);
    const lit = n * (1 - decay);
    if (lit > 0.05) {
      // lueur sous la roche, fenêtres, sommet de la flèche
      const tip = worldToScreen(wx, wy, (ISLE.Z - ISLE.underside) * T - sink);
      elevGlow(tip.x, tip.y, 22 * z / 0.625, '120,230,255', 0.55 * lit);
      const top = worldToScreen(wx, wy, (ISLE.Z + 3.1) * T - sink);
      elevGlow(top.x, top.y, 10 * z / 0.625, '200,180,255', 0.8 * lit);
      const mid = worldToScreen(wx, wy, (ISLE.Z + 1) * T - sink);
      elevGlow(mid.x, mid.y, 40 * z / 0.625, '255,226,170', 0.22 * lit);
    }
  } });
  // navettes en orbite
  if (ISLE.shuttles > 0 && decay < 0.5) {
    const t = now / 1000;
    for (let k = 0; k < 3; k += 1) {
      const a = t * (0.35 + k * 0.08) + k * 2.1;
      const r = (ISLE.R + 0.9 + k * 0.35) * T;
      const sx = wx + Math.cos(a) * r, sy = wy + Math.sin(a) * r * 0.9;
      const sz = (ISLE.Z - 0.6 + k * 0.5) * T;
      out.push({ wx: sx, wy: sy, d: depthOf(sx, sy) + 0.1 * T, draw(ctx) {
        const q = worldToScreen(sx, sy, sz);
        blitBaked(ctx, bakedShuttle(T), q.x, q.y, d);
        if (n > 0.05) elevGlow(q.x, q.y + 2, 4 * z / 0.625, '255,90,200', 0.6 * n);
      } });
    }
  }
}

if (import.meta.env?.DEV && typeof window !== 'undefined') {
  // Seul un réglage de FORME vide les images cuites (allumer/éteindre ne coûte rien).
  window.__floatIsle = (o) => { if (o) { Object.assign(ISLE, o); if (Object.keys(o).some((k) => k !== 'on' && k !== 'shuttles')) { _siteFor = null; _bakes.clear(); } } return { ...ISLE, stats: { ...isleStats } }; };
}
