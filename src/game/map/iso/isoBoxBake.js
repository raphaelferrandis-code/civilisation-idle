"use strict";
// ── LE PIXEL AU LANCER DE RAYON : des boîtes, cuites une fois ───────────────────
//
// Sorti d'iso/isoPier.js le 2026-10-01 (docs/PLAN-PORTS.md) : l'appontement du port
// l'a inventé, le bassin du Vieux-Port et le terminal de commerce s'en servent aussi.
//
// UNE SCÈNE = une poignée de BOÎTES alignées sur les axes du monde ({ X0, X1, Y0, Y1,
// Z0, Z1 } en px monde, + ce que le peintre veut y lire : `part`…). On la cuit UNE
// fois dans l'« espace d'art » des quais (zoom 1, caméra nulle : un pixel d'art devient
// un bloc à l'écran, comme le reste de la carte), en lançant pour chaque pixel le rayon
// de vue à travers les boîtes : le pixel prend la face touchée la plus proche (dessus,
// flanc sud, flanc est), et le peintre de la scène dit sa couleur (`shade`). Pas un
// trait lissé, pas une couleur d'antialias : les bords tombent au pixel.
//   · OMBRE : un pixel de sol est à l'ombre si le rayon vers le soleil (l'est du monde,
//     cf. isoSunShadow) traverse une boîte. Posée en multiply, à la force du soleil.
//   · REFLET : la scène retournée sous le plan de l'eau de chaque boîte (`mz`, 0 par
//     défaut), versée dans le calque des reflets (isoReflect.noteReflectionImage).
// ⚠ Axes du monde SEULEMENT : une boîte en biais sortirait en escaliers de pixels.
import { CM } from '../layout.js';
import { SUN_SHADOW, sunShadowAlpha } from './isoSunShadow.js';
import { noteReflectionImage } from './isoReflect.js';

export function h01(x, y, s = 0) {
  let n = (x | 0) * 374761393 + (y | 0) * 668265263 + s * 982451653;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
export const mul = (c, k) => [Math.min(255, Math.round(c[0] * k)), Math.min(255, Math.round(c[1] * k)), Math.min(255, Math.round(c[2] * k))];
export const mix = (a, b, t) => [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)];
export const hexRgb = (h) => {
  if (typeof h !== 'string') return null;
  if (h[0] === '#') { const n = parseInt(h.slice(1, 7), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  const m = h.match(/\d+(\.\d+)?/g);
  return m ? m.slice(0, 3).map(Number) : null;
};
// Lumière haut-gauche : dessus plein, flanc sud (tourné vers la gauche de l'écran)
// mi-clair, flanc est (vers la droite) dans l'ombre.
export const FACE_LIGHT = [0.64, 0.8, 1];

function mkCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}

// Rayon d'un pixel d'art (ax, ay) → la boîte touchée la plus proche de l'œil.
// Projection (ISO_X = 1, ISO_Y = ½) : ax = wx − wy, ay = (wx + wy)/2 − z. Avec
// s = (wx + wy)/2, le rayon est (s + ax/2, s − ax/2, s − ay) : l'œil est vers s → +∞.
// `mirror` : la scène retournée sous le plan d'eau de chaque boîte (z → 2·mz − z).
// Les boîtes `noMirror` (filins : un trait d'un pixel, retourné puis ondulé, se lisait
// comme une rayure dans l'eau) n'y sont pas.
// Rend { bx, s, face } — face 2 dessus (dessous en miroir), 1 flanc sud, 0 flanc est.
export function castRay(boxes, ax, ay, mirror) {
  let best = null, bs = -Infinity, bface = 0;
  for (const bx of boxes) {
    if (mirror && (bx.noMirror || bx.part === 'rope')) continue;
    const xLo = bx.X0 - ax / 2, xHi = bx.X1 - ax / 2;
    const yLo = bx.Y0 + ax / 2, yHi = bx.Y1 + ax / 2;
    const mz2 = 2 * (bx.mz || 0);
    const zLo = mirror ? ay + mz2 - bx.Z1 : bx.Z0 + ay, zHi = mirror ? ay + mz2 - bx.Z0 : bx.Z1 + ay;
    const lo = Math.max(xLo, yLo, zLo), hi = Math.min(xHi, yHi, zHi);
    if (lo > hi || hi <= bs) continue;
    bs = hi; best = bx;
    bface = hi === zHi ? 2 : hi === yHi ? 1 : 0;
  }
  return best ? { bx: best, s: bs, face: bface } : null;
}

// LA CUISSON. `shade(hit, wx, wy, zz, mirror)` rend [r, g, b] (lumière comprise) ;
// `isWater(wx, wy)` dit si le sol sous un pixel est de l'eau (reflets, clapot) ;
// `foam(bx)` si une boîte fait un clapot clair à son pied. Rend { AX0, AY0, W, H,
// body, shadow, refl } (canevas) ou null.
export function bakeBoxes(boxes, { shade, isWater, shadow = true, reflect = true, foam = null, pad = 6 }) {
  if (!boxes.length) return null;
  let AX0 = Infinity, AX1 = -Infinity, AY0 = Infinity, AY1 = -Infinity;
  for (const b of boxes) {
    for (const x of [b.X0, b.X1]) for (const y of [b.Y0, b.Y1]) {
      const ax = x - y, ay = (x + y) / 2;
      const zTop = Math.max(b.Z1, 0), zMir = Math.max(0, 2 * (b.mz || 0) - b.Z0, -b.Z0);
      AX0 = Math.min(AX0, ax); AX1 = Math.max(AX1, ax + zTop * 0.9);
      AY0 = Math.min(AY0, ay - zTop); AY1 = Math.max(AY1, ay + zMir + Math.max(0, b.Z1) + 2);
    }
  }
  AX0 = Math.floor(AX0) - pad; AY0 = Math.floor(AY0) - pad; AX1 = Math.ceil(AX1) + pad + 2; AY1 = Math.ceil(AY1) + pad;
  const W = AX1 - AX0, H = AY1 - AY0;
  if (!(W > 0 && H > 0) || W * H > 4e6) return null;
  const body = new Uint8ClampedArray(W * H * 4);
  const shad = new Uint8ClampedArray(W * H * 4);
  const refl = new Uint8ClampedArray(W * H * 4);
  const shCol = hexRgb(SUN_SHADOW.col) || [142, 150, 173];
  const kSun = (SUN_SHADOW.len || 0.5) * 2 / Math.sqrt(5);
  const casters = boxes.filter((b) => b.Z1 > 0.5 && !b.noShadow);
  const foamers = foam ? boxes.filter(foam) : [];
  // INDEX EN GRILLE D'ART (cases de 16 px) : une boîte ne couvre à l'écran que les x
  // d'art entre X0 − Y1 et X1 − Y0, et les y entre (X0 + Y0)/2 − Z1 et (X1 + Y1)/2 − Z0
  // (retournés sous le plan d'eau pour le reflet : une seconde grille). Le terminal
  // compte des centaines de boîtes (une pile de conteneurs = une boîte) : sans index,
  // chaque pixel les testait toutes.
  const BIN = 8, nBin = Math.ceil(W / BIN) + 1;
  const G = 16, gw = Math.ceil(W / G) + 1, gh = Math.ceil(H / G) + 1;
  const grid = Array.from({ length: gw * gh }, () => []);
  const gridM = Array.from({ length: gw * gh }, () => []);
  const put2 = (g2, b, ax0, ax1, ay0, ay1) => {
    const i0 = Math.max(0, Math.floor((ax0 - AX0) / G)), i1 = Math.min(gw - 1, Math.floor((ax1 - AX0) / G));
    const j0 = Math.max(0, Math.floor((ay0 - AY0) / G)), j1 = Math.min(gh - 1, Math.floor((ay1 - AY0) / G));
    for (let j = j0; j <= j1; j += 1) for (let i = i0; i <= i1; i += 1) g2[j * gw + i].push(b);
  };
  for (const b of boxes) {
    const ax0 = b.X0 - b.Y1, ax1 = b.X1 - b.Y0, s0 = (b.X0 + b.Y0) / 2, s1 = (b.X1 + b.Y1) / 2;
    put2(grid, b, ax0, ax1, s0 - b.Z1, s1 - b.Z0);
    if (!(b.noMirror || b.part === 'rope')) { const m2 = 2 * (b.mz || 0); put2(gridM, b, ax0, ax1, s0 - m2 + b.Z0, s1 - m2 + b.Z1); }
  }
  // Même index pour les OMBRES : une boîte n'ombre que les colonnes d'art entre son
  // bord ouest et son bord est poussé de k·Z1 (l'ombre file vers l'est du monde).
  const sbins = Array.from({ length: nBin }, () => []);
  for (const b of casters) {
    const b0 = Math.max(0, Math.floor((b.X0 - b.Y1 - AX0) / BIN)), b1 = Math.min(nBin - 1, Math.floor((b.X1 - b.Y0 + kSun * b.Z1 - AX0) / BIN));
    for (let k = b0; k <= b1; k += 1) sbins[k].push(b);
  }
  const wet = new Map();
  const isWet = (gx, gy) => {
    const k = Math.floor(gx) + ',' + Math.floor(gy);
    let v = wet.get(k);
    if (v === undefined) { v = !!isWater(gx, gy); wet.set(k, v); }
    return v;
  };
  for (let py = 0; py < H; py += 1) {
    for (let px = 0; px < W; px += 1) {
      const ax = AX0 + px + 0.5, ay = AY0 + py + 0.5;
      const i = (py * W + px) * 4;
      const gi = Math.floor(py / G) * gw + Math.floor(px / G);
      const hit = castRay(grid[gi], ax, ay, false);
      if (hit) {
        const wx = hit.s + ax / 2, wy = hit.s - ax / 2, zz = hit.s - ay;
        const col = shade(hit, wx, wy, zz, false);
        if (col) { body[i] = col[0]; body[i + 1] = col[1]; body[i + 2] = col[2]; body[i + 3] = col.length > 3 ? col[3] : 255; }
        continue;
      }
      // Rien de bâti devant : le SOL (z = 0) sous ce pixel.
      const gx = ay + ax / 2, gy = ay - ax / 2;
      if (shadow) {
        for (const b of sbins[Math.floor(px / BIN)]) {
          if (gy < b.Y0 || gy > b.Y1) continue;
          const h0 = Math.max(b.Z0, 0.5, (gx - b.X1) / kSun), h1 = Math.min(b.Z1, (gx - b.X0) / kSun);
          if (h0 <= h1) { shad[i] = shCol[0]; shad[i + 1] = shCol[1]; shad[i + 2] = shCol[2]; shad[i + 3] = 255; break; }
        }
      }
      if (!isWet(gx, gy)) continue;
      // Clapot au pied des pieux : un pixel clair au contact de l'eau, devant eux.
      for (const b of foamers) {
        const dx = gx - b.X1, dy = gy - b.Y1;
        const inX = gx >= b.X0 - 0.5 && gx <= b.X1 + 1.6, inY = gy >= b.Y0 - 0.5 && gy <= b.Y1 + 1.6;
        if (inX && inY && (dx > 0 || dy > 0) && h01(Math.floor(gx), Math.floor(gy), 21) < 0.7) {
          body[i] = 214; body[i + 1] = 230; body[i + 2] = 232; body[i + 3] = 150;
          break;
        }
      }
      if (reflect) {
        const rh = castRay(gridM[gi], ax, ay, true);
        if (rh) {
          const wx = rh.s + ax / 2, wy = rh.s - ax / 2, zz = 2 * (rh.bx.mz || 0) - (rh.s - ay);
          const col = shade(rh, wx, wy, zz, true);
          if (col) { refl[i] = col[0]; refl[i + 1] = col[1]; refl[i + 2] = col[2]; refl[i + 3] = 255; }
        }
      }
    }
  }
  // Chaque calque est ROGNÉ à son contenu : le rendu logiciel paie la SURFACE de chaque
  // drawImage, et la boîte commune (ponton + reflet + ombre) est surtout vide.
  const put = (data) => {
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let y = 0; y < H; y += 1) {
      const row = y * W * 4;
      for (let x = 0; x < W; x += 1) {
        if (!data[row + x * 4 + 3]) continue;
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
    if (x1 < 0) return null;
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    const sub = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y += 1) sub.set(data.subarray(((y0 + y) * W + x0) * 4, ((y0 + y) * W + x1 + 1) * 4), y * w * 4);
    const cv = mkCanvas(w, h);
    cv.getContext('2d').putImageData(new ImageData(sub, w, h), 0, 0);
    return { cv, AX0: AX0 + x0, AY0: AY0 + y0, W: w, H: h };
  };
  return { AX0, AY0, W, H, body: put(body), shadow: put(shad), refl: put(refl) };
}

// Pose d'un calque cuit (rogné) à l'écran. Rend la boîte écran, ou null.
export function blitLayer(ctx, layer) {
  return layer ? blitArt(ctx, layer.cv, layer.AX0, layer.AY0, layer.W, layer.H) : null;
}

// Pose d'un canevas d'art à l'écran (au pixel device, sans lissage au-dessus du zoom 1).
export function blitArt(ctx, cv, AX0, AY0, W, H) {
  const z = CM.cam.zoom, dpr = CM.dpr || 1;
  const camX = CM.cam.x - CM.cam.y, camY = (CM.cam.x + CM.cam.y) / 2;
  const snap = (v) => Math.round(v * dpr) / dpr;
  const X = snap((AX0 - camX) * z + CM.cw / 2), Y = snap((AY0 - camY) * z + CM.ch / 2);
  const X1 = snap((AX0 + W - camX) * z + CM.cw / 2), Y1 = snap((AY0 + H - camY) * z + CM.ch / 2);
  if (X1 < 0 || Y1 < 0 || X > CM.cw || Y > CM.ch) return null;
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = z < 0.999;
  ctx.drawImage(cv, X, Y, X1 - X, Y1 - Y);
  ctx.imageSmoothingEnabled = prev;
  return { X, Y, w: X1 - X, h: Y1 - Y };
}

// Sous les bateaux : l'ombre d'une cuisson (multiply, force du soleil du moment) et
// son reflet (calque des reflets, posé sous la surface à l'image suivante).
export function paintBakeUnder(ctx, B, { shadow = true, reflect = true } = {}) {
  if (!B) return;
  const a = shadow ? sunShadowAlpha() : 0;
  if (a > 0) {
    const prevA = ctx.globalAlpha, prevOp = ctx.globalCompositeOperation;
    ctx.globalAlpha = prevA * a;
    if (SUN_SHADOW.mode) ctx.globalCompositeOperation = SUN_SHADOW.mode;
    blitLayer(ctx, B.shadow);
    ctx.globalAlpha = prevA; ctx.globalCompositeOperation = prevOp;
  }
  const R = reflect && B.refl;
  if (R) {
    const z = CM.cam.zoom;
    const camX = CM.cam.x - CM.cam.y, camY = (CM.cam.x + CM.cam.y) / 2;
    const x = (R.AX0 - camX) * z + CM.cw / 2, y = (R.AY0 - camY) * z + CM.ch / 2, w = R.W * z, h = R.H * z;
    if (x + w >= 0 && y + h >= 0 && x <= CM.cw && y <= CM.ch) noteReflectionImage(ctx, R.cv, x, y, w, h);
  }
}
