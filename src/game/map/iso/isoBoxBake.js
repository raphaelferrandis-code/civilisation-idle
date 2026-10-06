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
//     cf. isoSunShadow) traverse une boîte. Posée au mode et à la teinte de l'ombre du
//     soleil (SUN_SHADOW, lue à la cuisson), à la force du soleil.
//   · REFLET : la scène retournée sous le plan de l'eau de chaque boîte (`mz`, 0 par
//     défaut), versée dans le calque des reflets (isoReflect.noteReflectionImage).
// ⚠ Axes du monde SEULEMENT : une boîte en biais sortirait en escaliers de pixels.
import { CM } from '../layout.js';
import { SUN_SHADOW, sunShadowAlpha } from './isoSunShadow.js';
import { noteReflectionImage } from './isoReflect.js';
import { h01Imul as h01 } from '../hash.js';
import { mkCanvas, mixRgb as mix } from '../pixelUtil.js';

// h01(x, y, graine) → [0, 1) (../hash.js) et mix (rvb → rvb, ../pixelUtil.js) : les
// variantes partagées, ré-exportées pour les ports qui les lisent ici.
export { h01, mix };
export const mul = (c, k) => [Math.min(255, Math.round(c[0] * k)), Math.min(255, Math.round(c[1] * k)), Math.min(255, Math.round(c[2] * k))];
export const hexRgb = (h) => {
  if (typeof h !== 'string') return null;
  if (h[0] === '#') { const n = parseInt(h.slice(1, 7), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  const m = h.match(/\d+(\.\d+)?/g);
  return m ? m.slice(0, 3).map(Number) : null;
};
// Lumière haut-gauche : dessus plein, flanc sud (tourné vers la gauche de l'écran)
// mi-clair, flanc est (vers la droite) dans l'ombre.
export const FACE_LIGHT = [0.64, 0.8, 1];
// Ombrage PIXEL ART : une face à l'ombre ne fait pas que foncer, elle glisse vers le
// bleu-violet ; une face au soleil (k > 1) vers l'ocre clair — comme les sprites de la
// carte, jamais un simple gris multiplié (le « rendu 3D » vu par Raph le 2026-10-03).
export function faceLit(col, k) {
  if (k >= 1) return k === 1 ? col : mix(col, [255, 246, 222], Math.min(0.6, (k - 1) * 0.9));
  return mix(mul(col, k), [34, 42, 96], (1 - k) * 0.42);
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
// `foam(bx)` si une boîte fait un clapot clair à son pied ; `origin` ({ X, Y }, px monde
// entiers) : l'ancre de la scène, où se lit le grain de ce clapot (cf. anchoredBake).
// Rend { AX0, AY0, W, H, body, shadow, refl } (canevas) ou null.
export function bakeBoxes(boxes, { shade, isWater, shadow = true, reflect = true, foam = null, pad = 6, ink = null, origin = null }) {
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
  // Ce que touche chaque pixel du corps (boîte, face, profondeur) : la passe d'encre
  // (`ink`, plus bas) en tire contours et arêtes.
  const hb = ink ? new Int32Array(W * H).fill(-1) : null, hf = ink ? new Int8Array(W * H) : null, hs = ink ? new Float32Array(W * H) : null;
  if (ink) boxes.forEach((b, k) => { b._k = k; });
  const shad = new Uint8ClampedArray(W * H * 4);
  const refl = new Uint8ClampedArray(W * H * 4);
  const shCol = hexRgb(SUN_SHADOW.col) || [0, 8, 28];
  const kSun = (SUN_SHADOW.len || 0.5) * 2 / Math.sqrt(5);
  const casters = boxes.filter((b) => b.Z1 > 0.5 && !b.noShadow);
  const foamers = foam ? boxes.filter(foam) : [];
  const oX = origin ? origin.X : 0, oY = origin ? origin.Y : 0;
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
        if (col) {
          body[i] = col[0]; body[i + 1] = col[1]; body[i + 2] = col[2]; body[i + 3] = col.length > 3 ? col[3] : 255;
          if (hb) { const q = i >> 2; hb[q] = hit.bx._k; hf[q] = hit.face; hs[q] = hit.s; }
        }
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
      // Clapot au pied des pieux : un pixel clair au contact de l'eau, devant eux. Son
      // grain se lit depuis l'ancre de la scène (PERF-10) : il suit le port, pas le monde.
      for (const b of foamers) {
        const dx = gx - b.X1, dy = gy - b.Y1;
        const inX = gx >= b.X0 - 0.5 && gx <= b.X1 + 1.6, inY = gy >= b.Y0 - 0.5 && gy <= b.Y1 + 1.6;
        if (inX && inY && (dx > 0 || dy > 0) && h01(Math.floor(gx - oX), Math.floor(gy - oY), 21) < 0.7) {
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
  if (hb) inkPass(body, W, H, boxes, hb, hf, hs, ink);
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

// ── LA CUISSON ANCRÉE AU PORT (audit du 05/10, PERF-10, choix A de Raph) ────────
// Quand la grille grandit, le layout recentre la ville : un port se TRANSLATE d'un
// nombre entier de cases (sa clé de géométrie change), et sa cuisson se refaisait —
// port de commerce ~200 ms, Vieux-Port ~85 ms, ponton ~25 ms, dans la même image —,
// pour la même scène, décalée. Ce qui l'empêchait d'être gardée : son GRAIN (écume au
// pied des pieux, mouchetis, dalles, briques, nervures : h01 et modulos) se lisait sur
// les coordonnées monde ABSOLUES.
// Chaque port cuit désormais dans son repère : une ANCRE (OX, OY), un coin de son site
// en px monde (entier, multiple de la tuile), et tout son grain se lit RELATIF à cette
// ancre (le peintre de la scène reçoit l'ancre, bakeBoxes la reçoit en `origin`). Une
// scène translatée cuit alors la même image, au pixel près, décalée de (dX − dY,
// (dX + dY)/2) en px d'art — un entier : la tuile est paire. La cuisson se garde, ses
// calques déplacés (shiftBake). Le grain a changé UNE fois, au passage à l'ancre :
// même dessin, pas les mêmes pixels (planche avant/après : planches/ports-grain-ancre).
// La CLÉ RELATIVE dit tout ce que la cuisson lit, rapporté à l'ancre : les boîtes
// (boxesKey) et le fleuve qui borde le port (riverKey : l'eau, ses reflets, son
// clapot). Un fleuve qui se RÉSHAPE sous le port la change, et la cuisson se refait,
// comme avant — au premier cycle, la largeur de pose du fleuve suit la grille (RN = N,
// layout.computeCityLayout) : la berge glisse de ~1 px à chaque croissance, et le port
// doit la suivre. Dans la même vallée (largeur figée), la grille grandit en pure
// translation : la cuisson se garde.
export const anchorStats = { cuites: 0, gardees: 0 };
// Arrondi des valeurs d'une clé : la même scène translatée diffère au 1e-12 près
// (flottants), jamais au 1e-4.
const rk = (v) => Math.round(v * 1e4) / 1e4;
// Les champs de boîte qui sont des abscisses / ordonnées monde (px) ; un port en
// ajoute (`mid`, l'axe d'une travée du port de commerce). Les champs `_…` sont des
// marques de cuisson (inkPass), pas de la géométrie.
const BOX_X = ['X0', 'X1'], BOX_Y = ['Y0', 'Y1'];
export function boxesKey(boxes, OX, OY, xKeys = BOX_X, yKeys = BOX_Y) {
  let s = '';
  for (const b of boxes) {
    for (const k in b) {
      if (k[0] === '_') continue;
      const v = b[k];
      if (typeof v === 'number') s += k + (xKeys.includes(k) ? rk(v - OX) : yKeys.includes(k) ? rk(v - OY) : rk(v)) + ',';
      else if (v != null && typeof v !== 'object' && typeof v !== 'function') s += k + v + ',';
    }
    s += ';';
  }
  return s;
}
// Les échantillons [j0, j1] du fleuve (tuiles), relatifs à l'ancre (ox, oy) en tuiles.
export function riverKey(sm, j0, j1, ox, oy) {
  let s = '';
  for (let j = Math.max(0, j0); j <= Math.min(sm.length - 1, j1); j += 1) s += rk(sm[j].x - ox) + ',' + rk(sm[j].y - oy) + ',' + rk(sm[j].hw || 2) + ';';
  return s;
}
// Une cuisson (bakeBoxes) déplacée de (dX, dY) px monde : mêmes canevas, calques décalés.
export function shiftBake(B, dX, dY) {
  if (!B || (!dX && !dY)) return B;
  const dA = dX - dY, dB = (dX + dY) / 2;
  const mv = (l) => l && { ...l, AX0: l.AX0 + dA, AY0: l.AY0 + dB };
  return { ...B, AX0: B.AX0 + dA, AY0: B.AY0 + dB, body: mv(B.body), shadow: mv(B.shadow), refl: mv(B.refl) };
}
// La cuisson de la clé relative `rel`, cuite à l'ancre (OX, OY) par `make()` ou gardée
// d'une ancre précédente et déplacée par `shift(v, dX, dY)`. `store` : la Map du port
// (les `cap` dernières clés).
const _stores = new Set();
export function anchoredBake(store, rel, OX, OY, make, shift, cap = 4) {
  _stores.add(store);
  let e = store.get(rel);
  if (!e) {
    e = { OX, OY, v: make() };
    anchorStats.cuites += 1;
    while (store.size >= cap) store.delete(store.keys().next().value);
    store.set(rel, e);
    return e.v;
  }
  anchorStats.gardees += 1;
  store.delete(rel); store.set(rel, e);                  // la plus récente
  return shift(e.v, OX - e.OX, OY - e.OY);
}
// Oublie toutes les cuissons gardées (les tests : la prochaine cuisson est fraîche).
export function forgetAnchoredBakes() {
  for (const s of _stores) s.clear();
}

// ── L'ENCRE : ce qui fait d'une cuisson un dessin de pixel art ─────────────────
// Sur le seul corps (les reflets ondulent, les ombres sont des aplats) :
//   · CONTOUR : un pixel au bord de sa boîte, devant le vide ou devant une boîte plus
//     LOINTAINE, prend l'encre — sa teinte, très foncée, tirée vers le violet (le
//     contour sélectif des sprites, pas un noir collé) ;
//   · ARÊTES : le dessus d'une boîte s'éclaire d'un pixel au-dessus de sa face avant, et
//     l'arête verticale entre ses deux flancs d'un trait clair (le volume « taillé ») ;
//   · JOINTS : deux boîtes qui se touchent à même profondeur se séparent d'un pixel
//     plus sombre (conteneurs d'une pile, marches) ;
//   · PIED : le sol juste sous un objet s'assombrit (le contact, que l'ombre portée ne
//     dessine pas du côté du soleil).
// `ink.skip(b)` : boîtes sans encre et qui n'en découpent pas (filins d'un pixel) ;
// `ink.ground(b)` : le sol (terre-plein, quai) — pas de contour, mais le pied.
function inkPass(body, W, H, boxes, hb, hf, hs, ink) {
  const skip = ink.skip || (() => false), ground = ink.ground || (() => false);
  const EPS = 2;
  const src = body.slice();
  const ND = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  for (let py = 0; py < H; py += 1) {
    for (let px = 0; px < W; px += 1) {
      const q = py * W + px, bi = hb[q];
      if (bi < 0) continue;
      const b = boxes[bi];
      if (skip(b)) continue;
      const gb = ground(b), s = hs[q], f = hf[q];
      let edge = false, seam = false, foot = false, rim = 0;
      for (const [dx, dy] of ND) {
        const x2 = px + dx, y2 = py + dy;
        const j = (x2 < 0 || y2 < 0 || x2 >= W || y2 >= H) ? -1 : y2 * W + x2;
        const nb = j < 0 ? -1 : hb[j];
        if (nb < 0) { if (!gb && !(j >= 0 && src[j * 4 + 3])) edge = true; continue; }
        const B2 = boxes[nb];
        // Même boîte, ou même OBJET fait de plusieurs boîtes (`grp` : les marches d'un toit).
        if (nb === bi || (b.grp != null && B2.grp === b.grp)) {
          if (nb !== bi) continue;
          if (f === 2 && dy === 1 && hf[j] !== 2) rim = Math.max(rim, 0.34);          // arête haute
          else if (f === 1 && dx === 1 && hf[j] === 0) rim = Math.max(rim, 0.16);     // arête verticale
          continue;
        }
        if (skip(B2)) continue;
        const g2 = ground(B2);
        if (gb) { if (!g2 && dy === -1) foot = true; continue; }
        if (hs[j] < s - EPS) edge = true;
        else if (!g2 && Math.abs(hs[j] - s) <= EPS) seam = true;
      }
      if (!(edge || seam || foot || rim)) continue;
      const k = q * 4;
      let c = [src[k], src[k + 1], src[k + 2]];
      if (edge) c = mix(mul(c, 0.42), [24, 18, 44], 0.32);
      else if (foot) c = mix(mul(c, 0.7), [34, 42, 96], 0.12);
      else if (seam) c = mul(c, 0.8);
      else c = mix(c, [255, 248, 228], rim);
      body[k] = c[0]; body[k + 1] = c[1]; body[k + 2] = c[2];
    }
  }
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

// Sous les bateaux : l'ombre d'une cuisson (mode de SUN_SHADOW, force du soleil du moment) et
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
