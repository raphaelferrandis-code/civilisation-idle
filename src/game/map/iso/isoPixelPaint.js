"use strict";
// ── LE PEINTRE ISO — primitives de pixel partagées (pont, merveilles) ─────────
//
// Sorties de bridgeBake.js le 2026-10-01, quand les merveilles ont été refaites
// « comme le pont » (docs/PLAN-MERVEILLES.md) : même repère, même lumière, même
// grain. EXTRACTION PURE — aucun pixel du pont ne change.
//
// Repère : l = longitudinal, t = transverse ; « vertical » → wx = t, wy = l (sinon
// wx = l, wy = t). Écran au zoom 1 : X = wx − wy, Y = (wx + wy)/2 − h. Une face
// verticale est une élévation cisaillée 2:1, un dessus est rempli en projetant
// chaque pixel sur son plan. Lumière haut-gauche : normale +y éclairée, +x ombrée.
// Pur : aucun DOM, aucun CM ; pour seul import le hachage partagé (feuille pure).
import { h32 } from '../hash.js';

// ── Raster ───────────────────────────────────────────────────────────────────
export function makeRaster(ox, oy, w, h) {
  return { ox, oy, w, h, data: new Uint8ClampedArray(Math.max(1, w * h) * 4) };
}
export function put(R, i, j, c) {
  if (i < 0 || j < 0 || i >= R.w || j >= R.h || !c) return;
  const k = (j * R.w + i) * 4;
  R.data[k] = c[0]; R.data[k + 1] = c[1]; R.data[k + 2] = c[2]; R.data[k + 3] = c.length > 3 ? c[3] : 255;
}
export function alphaAt(R, i, j) {
  if (i < 0 || j < 0 || i >= R.w || j >= R.h) return 0;
  return R.data[(j * R.w + i) * 4 + 3];
}

// Couleurs : '#rrggbb' → [r, g, b]. Mémo : les palettes sont relues par pixel.
const _hex = new Map();
export function rgbOf(c) {
  if (Array.isArray(c)) return c;
  let v = _hex.get(c);
  if (!v) {
    const n = parseInt(String(c).slice(1), 16);
    v = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    _hex.set(c, v);
  }
  return v;
}
export const dim = (c, k) => { const v = rgbOf(c); return [v[0] * k, v[1] * k, v[2] * k]; };

// Hash entier stable (même famille que cmHash) : la variante partagée, ré-exportée
// pour les peintres qui la lisent ici (../hash.js, une feuille pure).
export { h32 };
export const mod = (a, n) => ((Math.floor(a) % n) + n) % n;

// ── Projection (repère du pont → écran zoom 1) ───────────────────────────────
export function projLT(vertical, l, t, h = 0) {
  const wx = vertical ? t : l, wy = vertical ? l : t;
  return { X: wx - wy, Y: (wx + wy) / 2 - h };
}
// Inverse sur le plan d'altitude h : point écran → (l, t).
export function unprojLT(vertical, X, Y, h) {
  const Yh = Y + h;
  const a = Yh + X / 2, b = Yh - X / 2;     // a = wx, b = wy
  return vertical ? { l: b, t: a } : { l: a, t: b };
}

// Normale +t / +l éclairée ? (cf. en-tête : +y éclairée, +x ombrée)
export function litNormal(vertical, axis) {
  // axis 't' : normale +t ; 'l' : normale +l.
  if (axis === 't') return !vertical;        // vertical : +t = +x → ombre
  return vertical;                           // vertical : +l = +y → lumière
}

// Cadre (ox, oy, w, h) d'une boîte (l, t, h) du repère du pont.
export function frameOf(v, boxes) {
  let X0 = Infinity, X1 = -Infinity, Y0 = Infinity, Y1 = -Infinity;
  for (const [l0, l1, t0, t1, h0, h1] of boxes) {
    for (const l of [l0, l1]) for (const t of [t0, t1]) for (const h of [h0, h1]) {
      const p = projLT(v, l, t, h);
      X0 = Math.min(X0, p.X); X1 = Math.max(X1, p.X); Y0 = Math.min(Y0, p.Y); Y1 = Math.max(Y1, p.Y);
    }
  }
  const ox = Math.floor(X0) - 2, oy = Math.floor(Y0) - 2;
  return makeRaster(ox, oy, Math.ceil(X1) - ox + 3, Math.ceil(Y1) - oy + 3);
}

// ── Primitives ───────────────────────────────────────────────────────────────
// MUR vertical : plan « fixed » constant sur l'axe `axis` ('t' → mur le long de l,
// 'l' → mur le long de t), de u0 à u1 sur l'autre axe, altitudes [hLo, hHi).
// tex(u, hv, lit) → couleur ou null (trou). hv = altitude ENTIÈRE du pixel.
export function paintWall(R, vertical, axis, fixed, u0, u1, hLo, hHi, tex) {
  if (!(u1 > u0) || !(hHi > hLo)) return;
  const lit = litNormal(vertical, axis);
  const a = axis === 't' ? projLT(vertical, u0, fixed) : projLT(vertical, fixed, u0);
  const b = axis === 't' ? projLT(vertical, u1, fixed) : projLT(vertical, fixed, u1);
  const i0 = Math.floor(Math.min(a.X, b.X) - R.ox), i1 = Math.ceil(Math.max(a.X, b.X) - R.ox);
  for (let i = i0; i < i1; i += 1) {
    const Xc = R.ox + i + 0.5;
    let u;
    if (axis === 't') u = vertical ? fixed - Xc : Xc + fixed;
    else u = vertical ? Xc + fixed : fixed - Xc;
    if (u < u0 || u >= u1) continue;
    const g = axis === 't' ? projLT(vertical, u, fixed) : projLT(vertical, fixed, u);
    const Yg = g.Y;
    const j0 = Math.floor(Yg - hHi - R.oy), j1 = Math.ceil(Yg - hLo - R.oy);
    for (let j = j0; j <= j1; j += 1) {
      const Yc = R.oy + j + 0.5;
      const hc = Yg - Yc;                       // altitude au centre du pixel
      if (hc < hLo || hc >= hHi) continue;
      const c = tex(u, Math.floor(hc), lit);
      if (c) put(R, i, j, c);
    }
  }
}

// DESSUS plat à l'altitude h sur le rectangle [l0,l1]×[t0,t1]. tex(l, t) → couleur ou null.
export function paintTop(R, vertical, l0, l1, t0, t1, h, tex) {
  if (!(l1 > l0) || !(t1 > t0)) return;
  const cs = [projLT(vertical, l0, t0, h), projLT(vertical, l1, t0, h), projLT(vertical, l1, t1, h), projLT(vertical, l0, t1, h)];
  let X0 = Infinity, X1 = -Infinity, Y0 = Infinity, Y1 = -Infinity;
  for (const p of cs) { X0 = Math.min(X0, p.X); X1 = Math.max(X1, p.X); Y0 = Math.min(Y0, p.Y); Y1 = Math.max(Y1, p.Y); }
  const i0 = Math.floor(X0 - R.ox), i1 = Math.ceil(X1 - R.ox);
  const j0 = Math.floor(Y0 - R.oy), j1 = Math.ceil(Y1 - R.oy);
  for (let j = j0; j < j1; j += 1) {
    for (let i = i0; i < i1; i += 1) {
      const q = unprojLT(vertical, R.ox + i + 0.5, R.oy + j + 0.5, h);
      if (q.l < l0 || q.l >= l1 || q.t < t0 || q.t >= t1) continue;
      const c = tex(q.l, q.t);
      if (c) put(R, i, j, c);
    }
  }
}

// BOÎTE : ses deux faces visibles (+t et +l) puis son dessus. `faceTex(face, u, hv,
// lit)` pour les faces ('t' / 'l'), `topTex(l, t)` pour le dessus.
// COUTURE : quand l'arête avant (l1, t1) tombe pile sur un centre de pixel (coin
// à une demi-unité, ex. les monuments posés à 1,5 du parapet), les deux faces
// semi-ouvertes la refusaient toutes deux → une colonne VIDE au milieu du fût
// (totems, piliers, poteaux du portail, tours). La face +l la prend.
export function paintBox(R, vertical, l0, l1, t0, t1, h0, h1, faceTex, topTex) {
  paintWall(R, vertical, 't', t1, l0, l1, h0, h1, (u, hv, lit) => faceTex('t', u, hv, lit));
  paintWall(R, vertical, 'l', l1, t0, t1 + 1e-6, h0, h1, (u, hv, lit) => faceTex('l', u, hv, lit));
  if (topTex) paintTop(R, vertical, l0, l1, t0, t1, h1, topTex);
}

// TRAIT d'un point (l, t, h) à un autre, en pixels d'écran (Bresenham) — câbles,
// haubans, jambes de force. La projection étant linéaire, une droite du monde est
// une droite de l'écran.
export function paintLine(R, v, a, b, col) {
  const pa = projLT(v, a[0], a[1], a[2]), pb = projLT(v, b[0], b[1], b[2]);
  let x0 = Math.floor(pa.X - R.ox), y0 = Math.floor(pa.Y - R.oy);
  const x1 = Math.floor(pb.X - R.ox), y1 = Math.floor(pb.Y - R.oy);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  const c = rgbOf(col);
  for (let guard = 0; guard < 4000; guard += 1) {
    put(R, x0, y0, c);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

// POLYGONE plein en coordonnées ÉCRAN zoom 1 (toits). col(X, Y) → couleur.
export function fillPoly(R, pts, col) {
  let X0 = Infinity, X1 = -Infinity, Y0 = Infinity, Y1 = -Infinity;
  for (const p of pts) { X0 = Math.min(X0, p.X); X1 = Math.max(X1, p.X); Y0 = Math.min(Y0, p.Y); Y1 = Math.max(Y1, p.Y); }
  for (let j = Math.floor(Y0 - R.oy); j < Math.ceil(Y1 - R.oy); j += 1) {
    const Y = R.oy + j + 0.5;
    for (let i = Math.floor(X0 - R.ox); i < Math.ceil(X1 - R.ox); i += 1) {
      const X = R.ox + i + 0.5;
      let inside = false;
      for (let k = 0, m = pts.length - 1; k < pts.length; m = k, k += 1) {
        const a = pts[k], b = pts[m];
        if ((a.Y > Y) !== (b.Y > Y) && X < ((b.X - a.X) * (Y - a.Y)) / (b.Y - a.Y) + a.X) inside = !inside;
      }
      if (inside) put(R, i, j, col(X, Y));
    }
  }
}

// ── Textures ─────────────────────────────────────────────────────────────────
// Rampe de pierre : 0 = reflet … 8 = encre. Une face ÉCLAIRÉE lit la rampe à
// partir de `litBase`, une face à l'OMBRE à partir de `shadeBase`.
export function ramp(P, k) { return rgbOf(P.stone[Math.max(0, Math.min(P.stone.length - 1, k))]); }
export const shadeOf = (K, lit) => (lit ? K.litBase : K.shadeBase);

// Grand appareil : assises hautes, blocs longs, joints d'UN cran plus sombres
// seulement (à deux crans on lisait de la brique). `K.rough` (pierre brute) :
// blocs plus courts, assises irrégulières, plus de blocs foncés.
export function ashlar(P, u, hv, lit, K, seed = 0) {
  const base = shadeOf(K, lit);
  const course = K.course || 4;
  const row = Math.floor((hv + 1000) / course);
  const inRow = (hv + 1000) - row * course;
  const joint = K.joint != null ? K.joint : 2;
  if (inRow === course - 1) return ramp(P, base + joint);         // joint horizontal (bas d'assise)
  const len = (K.block || 11) + (h32(row, seed, 7) % (K.rough ? 7 : 5)) - (K.rough ? 3 : 0);
  const shift = (h32(row, seed, 3) % len);
  const uu = Math.floor(u) + shift + 4096;
  const col = Math.floor(uu / len);
  if (uu - col * len === 0) return ramp(P, base + joint);         // joint vertical
  const v = h32(row, col, seed) % (K.rough ? 5 : 9);
  let k = base + (v === 0 ? 1 : 0);
  if (inRow === 0 && lit) k -= 1;                                  // arête haute éclairée
  return ramp(P, k);
}

// Bois : fibres (une teinte par planche/pièce, une veine sombre de temps en temps).
export function woodTex(P, u, hv, lit, seed = 0) {
  const W = P.wood;
  const k = h32(Math.floor(u / 5), seed, 21) % 5;
  if (h32(Math.floor(u), hv, seed + 3) % 13 === 0) return rgbOf(W[(lit ? 1 : 2) + 1]);
  return rgbOf(W[(lit ? 0 : 1) + (k === 0 ? 1 : 0)]);
}

// CONTOUR : un pixel d'encre là où l'opaque touche le vide (haut, gauche,
// droite) — la même lecture que les bâtiments de la ville, qui ont tous le leur.
// Pas sous l'objet (le pied reste doux sur son sol).
export function outline(R, ink) {
  const { w, h, data } = R;
  const src = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i += 1) src[i] = data[i * 4 + 3] > 0 ? 1 : 0;
  const c = rgbOf(ink);
  for (let j = 0; j < h; j += 1) {
    for (let i = 0; i < w; i += 1) {
      if (!src[j * w + i]) continue;
      const up = j > 0 ? src[(j - 1) * w + i] : 0;
      const lf = i > 0 ? src[j * w + i - 1] : 0;
      const rt = i < w - 1 ? src[j * w + i + 1] : 0;
      if (!up || !lf || !rt) put(R, i, j, c);
    }
  }
}

// ── Arches : plein cintre (un centre) ou brisée (deux centres) ───────────────
// Rend { mid, hs (naissance), arcs } — chaque arc { c (abscisse du centre), R }
// vaut pour une moitié (brisée) ou pour toute l'ouverture (plein cintre).
export function archGeom(a, pointed = false) {
  const w = a.l1 - a.l0, mid = (a.l0 + a.l1) / 2;
  if (pointed) {
    const R = w * 0.8;
    const rise = Math.sqrt(R * R - (w / 2 - R) * (w / 2 - R));
    return { mid, w, pointed, hs: a.crown - rise, R, cL: a.l0 + R, cR: a.l1 - R };
  }
  const r = Math.max(1, a.crown - a.spring);
  const R = (w * w / 4 + r * r) / (2 * r);
  return { mid, w, pointed, hs: a.crown - R, R, cL: mid, cR: mid };
}
// Altitude de l'intrados en l (−∞ hors de l'arche).
export function intrados(g, l) {
  const c = l < g.mid ? g.cL : g.cR;
  const d = l - c;
  if (Math.abs(d) >= g.R) return -Infinity;
  return g.hs + Math.sqrt(g.R * g.R - d * d);
}
// Distance au centre de l'arc qui porte le point (l, h) (anneau de voussoirs).
export function arcDist(g, l, h) {
  const c = l < g.mid ? g.cL : g.cR;
  return { d: Math.hypot(l - c, h - g.hs), ang: Math.atan2(h - g.hs, l - c) };
}
