"use strict";
// ── L'OUTILLAGE DE LA COUPE DES PLAISIRS (grille des filles) ─────────────────
// Partagé par la coupe (plaisirsCoupeHD.js : structure, matières, cuisson) et le
// mobilier des âges (plaisirsEraRooms.js). Un pixel de coupe = un pixel de fille.
import { makeRaster } from './isoPixelPaint.js';

// La TOISE : `K` agrandit les largeurs du plan (exprimées à l'ancienne toise).
// Une boîte : plafond (CEIL), mur du fond (WALLH), sol en profondeur (FLOORD) ; la
// charpente entre deux étages (STRUCT) ; murs latéraux en fuite (SIDE) ; poteau entre
// deux boîtes (WALLW) ; façade coupée (WALL) ; cage d'ascenseur (CORE).
export const HD = { CEIL: 8, WALLH: 52, FLOORD: 12, STRUCT: 9, SIDE: 10, WALLW: 10, WALL: 8, CORE: 36, MARGIN: 150, WATER: 52, TOP: 20, K: 2.6 };
export const LH = HD.CEIL + HD.WALLH + HD.FLOORD + HD.STRUCT;
export const INK = '#1c1216';


// ── Outillage de pixel ───────────────────────────────────────────────────────
export const _hx = new Map();
export const hex = (c) => {
  let v = _hx.get(c);
  if (!v) { const n = parseInt(c.slice(1), 16); v = [(n >> 16) & 255, (n >> 8) & 255, n & 255]; _hx.set(c, v); }
  return v;
};
export const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export const bayer = (x, y) => BAYER[(y & 3) * 4 + (x & 3)] / 16;
export function mix(c1, c2, t) {
  const a = hex(c1), b = hex(c2), m = (i) => Math.round(a[i] + (b[i] - a[i]) * t).toString(16).padStart(2, '0');
  return '#' + m(0) + m(1) + m(2);
}
export const h32 = (a, b = 0, c = 0) => {
  let x = (a | 0) * 374761393 + (b | 0) * 668265263 + (c | 0) * 2147483647;
  x = (x ^ (x >>> 13)) * 1274126177;
  return (x ^ (x >>> 16)) >>> 0;
};
// Un peintre sur un raster ; (ox, oy) : où tombe son pixel (0, 0) dans le cadre (les
// PIÈCES de mobilier se peignent dans un petit raster à part, puis se posent).
export function painter(R, ox = 0, oy = 0) {
  const P = {
    R, ox, oy,
    marks: [],
    mark(x, y, c) { P.marks.push(c ? { x, y, c } : { x, y }); },
    alpha(x, y) {
      x -= ox; y -= oy;
      if (x < 0 || y < 0 || x >= R.w || y >= R.h) return 0;
      return R.data[(y * R.w + x) * 4 + 3];
    },
    get(x, y) {
      x -= ox; y -= oy;
      if (x < 0 || y < 0 || x >= R.w || y >= R.h) return '#000000';
      const k = (y * R.w + x) * 4, m = (v) => v.toString(16).padStart(2, '0');
      return '#' + m(R.data[k]) + m(R.data[k + 1]) + m(R.data[k + 2]);
    },
    put(x, y, c, a = 255) {
      x = (x | 0) - ox; y = (y | 0) - oy;
      if (x < 0 || y < 0 || x >= R.w || y >= R.h || !c) return;
      const v = typeof c === 'string' ? hex(c) : c, k = (y * R.w + x) * 4;
      R.data[k] = v[0]; R.data[k + 1] = v[1]; R.data[k + 2] = v[2]; R.data[k + 3] = a;
    },
    rect(x, y, w, h, c) { for (let j = 0; j < h; j += 1) for (let i = 0; i < w; i += 1) P.put(x + i, y + j, c); },
    hline(x, y, w, c) { P.rect(x, y, w, 1, c); },
    vline(x, y, h, c) { P.rect(x, y, 1, h, c); },
    dith(x, y, c1, c2, t) { P.put(x, y, bayer(x, y) < t ? c2 : c1); },
    ellipse(cx, cy, rx, ry, col) {
      for (let j = -ry; j <= ry; j += 1) for (let i = -rx; i <= rx; i += 1) {
        if ((i * i) / (rx * rx + 0.5) + (j * j) / (ry * ry + 0.5) <= 1) {
          const c = typeof col === 'function' ? col(i, j) : col;
          if (c) P.put(cx + i, cy + j, c);
        }
      }
    },
    // Une GRILLE DE LETTRES (dessin à la main) : chaque lettre est une teinte de la
    // palette `pal`, '.' est vide. `flip` la retourne. Rend la liste des pixels posés
    // dont la lettre est dans `lit` (ils s'allument la nuit).
    spr(x, y, rows, pal, flip = false, lit = null, night = null) {
      rows.forEach((row, j) => {
        for (let i = 0; i < row.length; i += 1) {
          const ch = row[flip ? row.length - 1 - i : i];
          if (ch === '.' || ch === ' ') continue;
          const c = pal[ch];
          if (!c) continue;
          P.put(x + i, y + j, c);
          if (night && lit && lit.includes(ch)) night.put(x + i, y + j, c);
        }
      });
    },
  };
  return P;
}
// Une ligne symétrique : la moitié gauche (centre compris) et son miroir.
export const sym = (rows) => rows.map((l) => l + [...l.slice(0, -1)].reverse().join(''));

// LA PIÈCE : un meuble se peint dans son propre petit raster, reçoit un CONTOUR
// d'encre extérieur (le trait du pixel art, comme les filles), puis se pose dans la
// couche. `draw(P)` peint en coordonnées du cadre.
export function piece(dst, x0, y0, w, h, draw, opt = {}) {
  const R = makeRaster(0, 0, w + 2, h + 2);
  const P = painter(R, x0 - 1, y0 - 1);
  draw(P);
  const ink = opt.ink === undefined ? INK : opt.ink;
  const src = new Uint8Array((w + 2) * (h + 2));
  for (let k = 0; k < src.length; k += 1) src[k] = R.data[k * 4 + 3] ? 1 : 0;
  if (ink) {
    const c = hex(ink);
    for (let j = 0; j < h + 2; j += 1) for (let i = 0; i < w + 2; i += 1) {
      if (src[j * (w + 2) + i]) continue;
      const n = (ii, jj) => ii >= 0 && jj >= 0 && ii < w + 2 && jj < h + 2 && src[jj * (w + 2) + ii];
      // Pas de trait SOUS la pièce (elle pose au sol : l'ombre de contact s'en charge).
      if (n(i - 1, j) || n(i + 1, j) || n(i, j - 1) || (opt.under && n(i, j + 1))) {
        const k = (j * (w + 2) + i) * 4;
        R.data[k] = c[0]; R.data[k + 1] = c[1]; R.data[k + 2] = c[2]; R.data[k + 3] = 255;
      }
    }
  }
  for (let j = 0; j < h + 2; j += 1) for (let i = 0; i < w + 2; i += 1) {
    const k = (j * (w + 2) + i) * 4;
    if (!R.data[k + 3]) continue;
    dst.put(x0 - 1 + i, y0 - 1 + j, [R.data[k], R.data[k + 1], R.data[k + 2]]);
  }
}


// La palette des grilles de lettres (dessin à la main).
export function palOf(S) {
  const [W0, W1, W2, W3, W4] = S.wood, [G0, G1, G2, G3, G4] = S.gold, V = S.velvet;
  return {
    k: INK,
    W: W0, w: W1, v: W2, u: W3, U: W4,
    H: G0, G: G1, g: G2, y: G3, Y: G4,
    P: V[0], R: V[1], r: V[2], q: V[3], p: V[4], o: V[5],
    F: S.felt[0], f: S.felt[1], e: S.felt[2], E: S.felt[3],
    I: S.iron[0], i: S.iron[1], j: S.iron[2], J: S.iron[3],
    C: S.cream[0], c: S.cream[1], d: S.cream[2], D: S.cream[3],
    B: S.glass[0], b: S.glass[1], n: S.glass[2], N: S.glass[3],
    L: '#9ad070', l: '#62a24e', m: '#3f7a3a', M: '#285428',
    Z: '#fffbe8', z: '#ffe9a0', x: '#ffb35c',
    K: S.pink[0], Q: S.pink[2], O: S.pink[3],
    1: '#d8404a', 2: '#3a6ad8', 3: '#f6efd8', 4: '#2a2a30', 5: '#3a9a5a',
    A: '#d8aa66', a: '#9a6c38', s: '#5e3e1e',
    T: '#eef2f6', t: '#5a7ab8',
    X: '#ffffff',
  };
}


// ── Les lumières ─────────────────────────────────────────────────────────────
// Une FLAQUE de lumière tramée sur le mur (deux crans, bord en trame de Bayer) :
// c'est elle qui fait vivre un papier peint, bien plus qu'un motif.
export function lightPool(P, cx, cy, rx, ry, x0, x1, y0, y1, warm = '#ffcf8a') {
  for (let y = Math.max(y0, cy - ry); y <= Math.min(y1, cy + ry); y += 1) {
    for (let x = Math.max(x0, cx - rx); x <= Math.min(x1, cx + rx); x += 1) {
      const q = ((x - cx) * (x - cx)) / (rx * rx) + ((y - cy) * (y - cy)) / (ry * ry);
      if (q > 1) continue;
      const t = q < 0.35 ? 0.24 : q < 0.7 ? 0.13 : 0.13 * (bayer(x, y) < (1 - q) / 0.3 ? 1 : 0);
      if (t <= 0) continue;
      P.put(x, y, mix(P.get(x, y), warm, t));
    }
  }
}

// `y` = la ligne du sol (le fond du parquet) ; un meuble posé avance de 3 rangs.
// Les pieds d'un joueur DERRIÈRE une table tombent à y+1, ceux de DEVANT à y+6.
export const FOOT = 4;
// Une OMBRE DE CONTACT sur le parquet (sous un meuble, rangée par rangée).
export function contactShadow(P, x0, x1, y) {
  for (let j = 0; j < 3; j += 1) for (let x = x0 + j; x <= x1 - j; x += 1) {
    if (j === 2 && bayer(x, y + j) > 0.5) continue;
    P.put(x, y + j, mix(P.get(x, y + j), INK, 0.42 - j * 0.1));
  }
}
// Pied tourné (balustre) d'acajou, 3 px.
export function turnedLeg(P, S, x, yTop, yBot) {
  for (let y = yTop; y <= yBot; y += 1) {
    const r = (y - yTop) % 4;
    P.put(x, y, S.wood[1]); P.put(x + 1, y, r === 1 ? S.wood[1] : S.wood[2]); P.put(x + 2, y, S.wood[3]);
  }
  P.put(x, yBot, S.gold[2]); P.put(x + 1, yBot, S.gold[1]); P.put(x + 2, yBot, S.gold[3]);
}

export const BK = 2, SD = 6, FR = 10;                               // profondeurs : fond, côté, devant
