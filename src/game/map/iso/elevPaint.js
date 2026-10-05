"use strict";
// ── PEINTRE PIXEL DES ÉTAGES (docs/PLAN-ETAGES.md) ───────────────────────────
//
// Les étages de la ville (trafic aérien, viaducs, métro) sont DESSINÉS PAR LE CODE,
// comme les ponts : des boîtes et des faces projetées en iso, remplies sur la grille
// d'art (k px device par pixel d'art, le grain des maisons — vieK). Pas de dégradé,
// pas d'anticrénelage : un polygone est rempli rangée d'art par rangée d'art.
//
// Ce qui se répète (un véhicule, son ombre, sa traînée) est CUIT une fois par
// (forme, zoom, dpr) dans une petite image, puis blitté : un drawImage par objet et
// par frame. ⚠ Remplir les polygones à chaque frame coûtait ~100 fillRect par
// véhicule — 15 000 par frame dans un ciel de la bande 9, rédhibitoire en rendu
// logiciel (cf. la fiche « Chrome de Raph : GPU désactivé »).
import { CM } from '../layout.js';
import { ISO_X, ISO_Y } from './projection.js';
import { lightCtx } from '../lightLayer.js';
import { vieHalo, VIE_GRAIN } from './isoVie.js';

// Remplit un polygone CONVEXE (points en px DEVICE) sur une grille de pas `kd`.
// Une rangée d'art est peinte si son centre est dans le polygone ; ses bords sont
// arrondis à la colonne d'art la plus proche.
export function fillPolyDev(g, pts, kd, col) {
  let minY = Infinity, maxY = -Infinity;
  for (const p of pts) { if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1]; }
  const r0 = Math.floor(minY / kd), r1 = Math.ceil(maxY / kd);
  g.fillStyle = col;
  const n = pts.length;
  for (let r = r0; r < r1; r += 1) {
    const yc = (r + 0.5) * kd;
    let xl = Infinity, xr = -Infinity;
    for (let i = 0; i < n; i += 1) {
      const a = pts[i], b = pts[(i + 1) % n];
      if ((a[1] <= yc && b[1] > yc) || (b[1] <= yc && a[1] > yc)) {
        const x = a[0] + (yc - a[1]) * (b[0] - a[0]) / (b[1] - a[1]);
        if (x < xl) xl = x;
        if (x > xr) xr = x;
      }
    }
    if (xr > xl) {
      const c0 = Math.round(xl / kd), c1 = Math.round(xr / kd);
      if (c1 > c0) g.fillRect(c0 * kd, r * kd, (c1 - c0) * kd, kd);
    }
  }
}

// Projection LOCALE (px CSS, relative à l'origine de l'objet) — la même algèbre que
// worldToScreen, sans la caméra : un objet cuit à l'origine se pose n'importe où.
export function isoLocal(dx, dy, dz, z) {
  return [(dx - dy) * ISO_X * z, (dx + dy) * ISO_Y * z - dz * z];
}

// Formes élémentaires, en px MONDE autour de l'origine de l'objet.
//   { poly: [[dx,dy,dz], …], col, off?: [ox, oy] en pixels d'art }
//   { px: [dx,dy,dz], col }  — un pixel d'art isolé
// Une boîte alignée sur les axes : face +y (bas-gauche) ÉCLAIRÉE, face +x (bas-droite)
// à l'OMBRE — lumière haut-gauche du jeu. `out` = contour d'un pixel d'art (silhouette
// décalée dans les quatre directions, posée AVANT les faces).
export function boxShapes(x0, y0, x1, y1, z0, z1, cT, cL, cR, out) {
  const a = [x0, y0, z1], b = [x1, y0, z1], c = [x1, y1, z1], d = [x0, y1, z1];
  const e = [x1, y1, z0], f = [x0, y1, z0], g = [x1, y0, z0];
  const s = [];
  if (out) for (const o of [[-1, 0], [1, 0], [0, -1], [0, 1]]) s.push({ poly: [a, b, g, e, f, d], col: out, off: o });
  if (cL) s.push({ poly: [d, c, e, f], col: cL });
  if (cR) s.push({ poly: [b, g, e, c], col: cR });
  if (cT) s.push({ poly: [a, b, c, d], col: cT });
  return s;
}

// Le pixel d'art (px device) au zoom z : celui de vieK(), mais au zoom de la CUISSON —
// une cuisson faite au zoom cible pendant un glissement n'a pas le grain du zoom courant.
export function artKdAt(z, dpr) { return Math.max(1, Math.round(VIE_GRAIN * z * dpr)); }

// Cuit une liste de formes à l'échelle (z, dpr) avec un pixel d'art de `kd` px device.
// Rend { cv, ox, oy, w, h, z } : (ox, oy) = position, dans l'image, de l'ORIGINE de
// l'objet (px device) ; z = le zoom de la cuisson. null hors DOM (tests).
export function bakeShapes(shapes, z, dpr, kd) {
  if (typeof document === 'undefined') return null;
  const P = [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const proj = (p, off) => {
    const [x, y] = isoLocal(p[0], p[1], p[2], z);
    const X = x * dpr + (off ? off[0] * kd : 0), Y = y * dpr + (off ? off[1] * kd : 0);
    if (X < minX) minX = X; if (X > maxX) maxX = X;
    if (Y < minY) minY = Y; if (Y > maxY) maxY = Y;
    return [X, Y];
  };
  for (const s of shapes) P.push(s.poly ? s.poly.map((p) => proj(p, s.off)) : [proj(s.px)]);
  if (!Number.isFinite(minX)) return null;
  const Ox = Math.floor(minX / kd) * kd - 2 * kd, Oy = Math.floor(minY / kd) * kd - 2 * kd;
  const w = Math.max(kd, Math.ceil((maxX - Ox) / kd) * kd + 2 * kd);
  const h = Math.max(kd, Math.ceil((maxY - Oy) / kd) * kd + 2 * kd);
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  shapes.forEach((s, i) => {
    const pts = P[i].map(([X, Y]) => [X - Ox, Y - Oy]);
    if (s.poly) fillPolyDev(g, pts, kd, s.col);
    else {
      g.fillStyle = s.col;
      g.fillRect(Math.round(pts[0][0] / kd - 0.5) * kd, Math.round(pts[0][1] / kd - 0.5) * kd, kd, kd);
    }
  });
  return { cv, ox: -Ox, oy: -Oy, w, h, z };
}

// Pose une image cuite avec son ORIGINE au point écran (x, y) (px CSS). Position
// rabattue sur la grille device, comme vieBlit. Une image cuite à un autre zoom que
// celui de la caméra (pendant un glissement de zoom, cf. getZ) est posée à l'échelle
// z / zCuit ; au repos, l'échelle vaut 1 et la pose est celle d'origine.
export function blitBaked(ctx, bk, x, y, dpr, alpha = 1) {
  if (!bk || alpha <= 0.01) return false;
  const zc = CM.cam.zoom, s = bk.z != null && bk.z !== zc ? zc / bk.z : 1;
  const pa = ctx.globalAlpha, ps = ctx.imageSmoothingEnabled;
  if (alpha < 1) ctx.globalAlpha = pa * alpha;
  ctx.imageSmoothingEnabled = false;
  if (s === 1) {
    const X = Math.round(x * dpr) - bk.ox, Y = Math.round(y * dpr) - bk.oy;
    ctx.drawImage(bk.cv, X / dpr, Y / dpr, bk.w / dpr, bk.h / dpr);
  } else {
    const X = Math.round(x * dpr - bk.ox * s), Y = Math.round(y * dpr - bk.oy * s);
    ctx.drawImage(bk.cv, X / dpr, Y / dpr, bk.w * s / dpr, bk.h * s / dpr);
  }
  ctx.globalAlpha = pa; ctx.imageSmoothingEnabled = ps;
  return true;
}

// Cache borné des images cuites. ⚠ Une rampe ou une courbe a un tronçon UNIQUE par
// demi-cellule (pente, cap) : l'autoroute en compte ~400 par zoom, le métro ~300. Un
// cache trop petit vidé d'un coup recuisait TOUT à chaque frame (mesuré : +20 ms en
// rendu logiciel). Ici : grand plafond, et au débordement on retire la MOITIÉ LA PLUS
// ANCIENNE (une Map garde l'ordre d'insertion ; un accès réinsère) — le jeu de travail
// d'un zoom reste chaud, ceux des zooms quittés partent.
//
// getZ(forme, dpr, make(zCuit)) — LE ZOOM DE REPOS (audit du 05/10, PERF-15). La clé
// portait le zoom BRUT, or il glisse vers sa cible (7 à 19 valeurs par cran de molette) :
// tout ce qui était visible se recuisait à chaque frame du glissement (métro : 41 à 51
// canvas par frame, autoroute 109 à 139, ciel habité 22 à 36 ms en rendu logiciel), et
// le cache gardait des milliers d'images de zooms périmés. Comme le sol
// (solPyramideFrame) :
//   · caméra POSÉE : la cuisson au zoom exact, comme avant — l'image est la même ;
//   · pendant un GLISSEMENT : la dernière cuisson de la même forme, que blitBaked pose à
//     l'échelle ; une forme jamais cuite l'est au zoom CIBLE, hors du cache exact (sa
//     recuisson à la pose garde le repos identique au pixel).
// Le cache ne garde que les DEUX derniers zooms de repos.
export function makeBakeCache(max = 240) {
  const m = new Map();
  const last = new Map();          // forme|dpr → dernière cuisson
  const byZoom = new Map();        // zoom de repos → ses clés exactes
  let zNow = null, zPrev = null;
  const get = (key, make) => {
    let v = m.get(key);
    if (v === undefined) {
      if (m.size >= max) {
        let n = m.size >> 1;
        for (const k of m.keys()) { if (n-- <= 0) break; m.delete(k); }
      }
      v = make();
    } else m.delete(key);
    m.set(key, v);
    return v;
  };
  const remember = (lk, v) => {
    last.delete(lk);
    if (last.size >= max) {
      let n = last.size >> 1;
      for (const k of last.keys()) { if (n-- <= 0) break; last.delete(k); }
    }
    last.set(lk, v);
  };
  // Un nouveau zoom de repos : on oublie ceux d'avant l'avant-dernier.
  const settle = (z) => {
    if (z === zNow) return;
    zPrev = zNow; zNow = z;
    for (const [zz, keys] of byZoom) {
      if (zz === zNow || zz === zPrev) continue;
      for (const k of keys) m.delete(k);
      byZoom.delete(zz);
    }
    for (const [k, v] of last) if (v && v.z != null && v.z !== zNow && v.z !== zPrev) last.delete(k);
  };
  return {
    get,
    getZ(key, d, make) {
      const z = CM.cam.zoom, goal = CM.zoomGoal, lk = key + '|' + d;
      if (CM.capture || goal == null || Math.abs(goal - z) <= 1e-6) {
        settle(z);
        const k = key + '|' + z + '|' + d;
        const v = get(k, () => make(z));
        let keys = byZoom.get(z);
        if (!keys) { keys = new Set(); byZoom.set(z, keys); }
        keys.add(k);
        remember(lk, v);
        return v;
      }
      const prev = last.get(lk);
      if (prev !== undefined) return prev;
      const v = make(goal);
      remember(lk, v);
      return v;
    },
    clear() { m.clear(); last.clear(); byZoom.clear(); zNow = zPrev = null; },
    get size() { return m.size; },
  };
}

// ── RUBANS (tabliers) ─────────────────────────────────────────────────────────
// Géométrie d'un tronçon a→b ({x, y, z} px monde) de largeur w : quatre coins
// [x, y, z], normale gauche (nx, ny), direction (ux, uy), longueur L.
export function segGeo(a, b, w) {
  const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
  const nx = -dy / L, ny = dx / L, h = w / 2;
  return {
    AL: [a.x + nx * h, a.y + ny * h, a.z], BL: [b.x + nx * h, b.y + ny * h, b.z],
    AR: [a.x - nx * h, a.y - ny * h, a.z], BR: [b.x - nx * h, b.y - ny * h, b.z],
    nx, ny, ux: dx / L, uy: dy / L, L,
  };
}
// Teinte d'une face verticale de normale (nx, ny) : +y éclairée, +x à l'ombre.
export function shadeFace(M, nx, ny) {
  const v = (ny - nx) / Math.SQRT2;
  return v > 0.35 ? M.lit : v < -0.35 ? M.dark : M.mid;
}
// Point [x, y, z] relatif à l'origine a (l'image cuite se pose à worldToScreen(a)).
export const relTo = (a, p) => [p[0] - a.x, p[1] - a.y, p[2] - a.z];
// Face verticale entre deux arêtes p→q, de dz0 à dz1 au-dessus d'elles.
export const vquad = (a, p, q, dz0, dz1, col) => ({ poly: [relTo(a, [p[0], p[1], p[2] + dz1]), relTo(a, [q[0], q[1], q[2] + dz1]), relTo(a, [q[0], q[1], q[2] + dz0]), relTo(a, [p[0], p[1], p[2] + dz0])], col });

// Lueur dans le calque de lumière occultée (petite → halo au pixel, sinon dégradé).
export function elevGlow(x, y, r, col, a) {
  const lc = lightCtx(x - r, y - r, x + r, y + r);
  if (!lc || !(a > 0.004)) return;
  if (vieHalo(lc, x, y, r, col, a)) return;
  const g = lc.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${col},${a.toFixed(3)})`);
  g.addColorStop(1, `rgba(${col},0)`);
  lc.fillStyle = g;
  lc.fillRect(x - r, y - r, r * 2, r * 2);
}
