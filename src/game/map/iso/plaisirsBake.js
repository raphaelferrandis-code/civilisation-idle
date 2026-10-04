"use strict";
// ── LA MAISON DES PLAISIRS, CONSTRUITE PAR LE CODE ────────────────────────────
//
// Refonte du 2026-10-02 (docs/PLAN-MAISON-DES-PLAISIRS.md, section ⭐) : Raph veut
// « un design plus raccord, progressif avec le temps ». Le lieu quitte son sprite
// néon unique pour la même main que les merveilles (wonderBake.js) : mêmes
// primitives, même lumière, même pierre de l'ère (wonderKits.js).
//
// L'ADN — ce qui le fait reconnaître à tous les âges, du radeau à la lévitation :
//   · posé SUR L'EAU, au large (la place ne change pas : layout.js) ;
//   · un FÛT central qui porte des plateaux ronds ;
//   · le DAIS EN PÉTALES : une bordure festonnée rayée cramoisi et crème ;
//   · des GUIRLANDES DE LANTERNES ROUGES ;
//   · un pavillon par jeu (osselets, tickets, vingt-et-un) et, au sommet, la
//     plateforme d'envol d'Icare.
// L'âge donne la matière (la pierre, le métal, le toit de son kit) ; les jeux
// ouverts ajoutent leurs pavillons.
//
// Repère : celui des merveilles — x est, y sud, h altitude (px d'écran), origine au
// pied du lieu, au niveau de l'EAU (h = 0). Lumière haut-gauche : faces sud
// éclairées, est à l'ombre.
//
// Pur : aucun DOM, aucun CM. Testable en Node.
import { rgbOf, h32, frameOf, outline, put } from './isoPixelPaint.js';
import {
  mats, box as box0, facet as facet0, revolve as revolve0, cyl, taper, domeProf, ring3d as ring3d0, PLANE_H, line as line0, pick, band5, stairs,
  hip as hip0, nightOf,
} from './wonderBake.js';
import { plaisirsPlan } from './plaisirsPlan.js';

const fm = (a, n) => ((a % n) + n) % n;
const TAU = Math.PI * 2;

// ── LA HAUTEUR DE CHAQUE PIXEL (pour le reflet et l'ombre) ────────────────────
// Retour de Raph sur le pilote (2026-10-03, capture du radeau) : « le reflet est
// trop grand ». Le reflet générique (isoReflect) retourne chaque COLONNE autour de
// son pixel le plus bas : juste pour un mur, faux pour un lieu PLAT posé sur l'eau —
// le pont du radeau (et les dalles du Marbre et du Néon) se reflétait comme s'il
// était dressé, en un grand losange sous lui. Le vrai miroir d'un point de hauteur h
// tombe 2h plus bas que lui ; il faut donc connaître h pour chaque pixel.
// Les trois primitives que les recettes appellent sont ENVELOPPÉES : leur couleur
// reçoit déjà le point du monde sous le pixel (solide de révolution, facette) ou sa
// face et son altitude (boîte) — on en tire le pixel et on note sa hauteur dans
// `R.hb`. Ce que les enveloppes ne voient pas (traits, toits en croupe, contour
// d'encre, lanternes posées au pixel) est complété dans `heightsOf`.
function hbOf(R) { return R.hb || (R.hb = new Float32Array(R.w * R.h).fill(NaN)); }
// LA PROFONDEUR de chaque pixel (x + y du point du monde qu'il montre), notée du
// même geste dans `R.db` : les filles de la maison passent derrière ce qui est
// DEVANT elles, au pixel (isoPlaisirs.js). Triées en tranches verticales entières,
// le pont qu'elles foulaient les coupait (Raph, 2026-10-03).
function dbOf(R) { return R.db || (R.db = new Float32Array(R.w * R.h).fill(NaN)); }
function note(R, x, y, h, c) {
  if (!c) return c;
  const i = Math.floor(x - y - R.ox), j = Math.floor((x + y) / 2 - h - R.oy);
  if (i >= 0 && j >= 0 && i < R.w && j < R.h) { hbOf(R)[j * R.w + i] = h; dbOf(R)[j * R.w + i] = x + y; }
  return c;
}
// La profondeur SEULE (rails, traits, toits en croupe, lanternes) : leur hauteur
// reste celle que heightsOf leur porte — l'ombre et le reflet ne bougent pas.
function noteD(R, x, y, h) {
  const i = Math.floor(x - y - R.ox), j = Math.floor((x + y) / 2 - h - R.oy);
  if (i >= 0 && j >= 0 && i < R.w && j < R.h) dbOf(R)[j * R.w + i] = x + y;
}
function ring3d(R, c, rad, th, U, W, col, part) {
  return ring3d0(R, c, rad, th, U, W, (I, p) => {
    const v = col(I, p);
    if (v) noteD(R, p.x, p.y, p.h);
    return v;
  }, part);
}
function hip(R, x0, x1, y0, y1, h0, H, col) {
  const f = typeof col === 'function' ? col : () => col;
  return hip0(R, x0, x1, y0, y1, h0, H, (I, x, y, h) => {
    const v = f(I, x, y, h);
    if (v) noteD(R, x, y, h);
    return v;
  });
}
// Le trait : le même tracé que paintLine (Bresenham entre les deux projections),
// profondeur interpolée le long du trait.
function line(R, a, b, col, w = 1) {
  line0(R, a, b, col, w);
  if (!col) return;
  for (let k = 0; k < w; k += 1) {
    const o = k - Math.floor((w - 1) / 2);
    const ax = a[0] + o / 2, ay = a[1] - o / 2, bx = b[0] + o / 2, by = b[1] - o / 2;
    const xs = Math.floor(ax - ay - R.ox), ys = Math.floor((ax + ay) / 2 - a[2] - R.oy);
    const x1 = Math.floor(bx - by - R.ox), y1 = Math.floor((bx + by) / 2 - b[2] - R.oy);
    const dx = Math.abs(x1 - xs), dy = -Math.abs(y1 - ys), sx = xs < x1 ? 1 : -1, sy = ys < y1 ? 1 : -1;
    const n = Math.max(dx, -dy) || 1, d0 = ax + ay, d1 = bx + by, db = dbOf(R);
    let x0 = xs, y0 = ys, err = dx + dy;
    for (let guard = 0; guard < 4000; guard += 1) {
      if (x0 >= 0 && y0 >= 0 && x0 < R.w && y0 < R.h) {
        const t = Math.max(Math.abs(x0 - xs), Math.abs(y0 - ys)) / n;
        db[y0 * R.w + x0] = d0 + (d1 - d0) * t;
      }
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
}
export function revolve(R, cx, cy, h0, h1, prof, col, facets) {
  return revolve0(R, cx, cy, h0, h1, prof, (I, h, a, rho, cap) =>
    note(R, cx + rho * Math.cos(a), cy + rho * Math.sin(a), h, col(I, h, a, rho, cap)), facets);
}
export function facet(R, pts, inside, col) {
  return facet0(R, pts, inside, (I, x, y, h) => note(R, x, y, h, col(I, x, y, h)));
}
export function box(R, x0, x1, y0, y1, h0, h1, face, top) {
  return box0(R, x0, x1, y0, y1, h0, h1,
    (f, u, hv, lv) => (f === 'S' ? note(R, u, y1, hv + 0.5, face(f, u, hv, lv)) : note(R, x1, u, hv + 0.5, face(f, u, hv, lv))),
    top ? (x, y) => note(R, x, y, h1, top(x, y)) : top);
}
// Hauteurs complétées : un pixel opaque non noté prend celle du pixel noté le plus
// proche SOUS lui dans sa colonne, plus l'écart (il est porté verticalement — mât,
// poteau, toit, liseré d'encre) ; sans rien dessous, il est au ras de l'eau.
export function heightsOf(R) {
  const hb = hbOf(R), H = new Float32Array(R.w * R.h);
  for (let i = 0; i < R.w; i += 1) {
    let lastH = 0, lastJ = -1;
    for (let j = R.h - 1; j >= 0; j -= 1) {
      const k = j * R.w + i;
      if (!R.data[k * 4 + 3]) continue;
      const v = hb[k];
      if (Number.isFinite(v)) { H[k] = Math.max(0, v); lastH = H[k]; lastJ = j; } else H[k] = lastJ < 0 ? 0 : lastH + (lastJ - j);
    }
  }
  return H;
}
// Profondeurs complétées : un pixel opaque que rien n'a noté (marches, enseigne posée
// au pixel) prend celle de son voisin noté le plus PROCHE de l'œil, sinon celle du
// pixel sous lui dans sa colonne (porté verticalement : même x + y) ; rien : −∞, il
// ne cache jamais rien.
export function depthsOf(R) {
  const db = dbOf(R), w = R.w, h = R.h, D = new Float32Array(w * h).fill(-Infinity);
  for (let k = 0; k < w * h; k += 1) {
    if (!R.data[k * 4 + 3]) continue;
    let v = db[k];
    if (!Number.isFinite(v)) {
      const i = k % w, j = (k - i) / w;
      for (let dj = -1; dj <= 1; dj += 1) for (let di = -1; di <= 1; di += 1) {
        const ii = i + di, jj = j + dj;
        if ((di || dj) && ii >= 0 && jj >= 0 && ii < w && jj < h && Number.isFinite(db[jj * w + ii])) v = Number.isFinite(v) ? Math.max(v, db[jj * w + ii]) : db[jj * w + ii];
      }
    }
    D[k] = Number.isFinite(v) ? v : NaN;
  }
  for (let i = 0; i < w; i += 1) {
    let last = -Infinity;
    for (let j = h - 1; j >= 0; j -= 1) {
      const k = j * w + i;
      if (!R.data[k * 4 + 3]) continue;
      if (Number.isNaN(D[k])) D[k] = last; else last = D[k];
    }
  }
  return D;
}
// LE MIROIR par le plan de l'eau : le pixel de hauteur h tombe 2h plus bas, même
// colonne. Deux points qui tombent au même endroit : le plus PROCHE de l'œil dans la
// scène retournée l'emporte (clé x + y − h, soit 2·j + h à l'écran). Ce qui touche
// l'eau (h < 0,75 : bordage mouillé, pilotis au ras) ne se reflète pas. Rend un
// raster dans le repère du lieu, ou null.
export function plaisirsMirror(R, H) {
  let j0 = Infinity, j1 = -1;
  const tgt = new Int32Array(R.w * R.h).fill(-1);
  for (let k = 0; k < R.w * R.h; k += 1) {
    if (!R.data[k * 4 + 3] || H[k] < 0.75) continue;
    const j = Math.floor(k / R.w), t = Math.round(j + 2 * H[k]);
    tgt[k] = t;
    if (t < j0) j0 = t; if (t > j1) j1 = t;
  }
  if (j1 < 0) return null;
  const h = j1 - j0 + 1, data = new Uint8ClampedArray(R.w * h * 4), key = new Float32Array(R.w * h).fill(-Infinity);
  for (let k = 0; k < R.w * R.h; k += 1) {
    const t = tgt[k];
    if (t < 0) continue;
    const i = k % R.w, j = Math.floor(k / R.w), kk = (t - j0) * R.w + i, ky = 2 * j + H[k];
    if (ky <= key[kk]) continue;
    key[kk] = ky;
    data[kk * 4] = R.data[k * 4]; data[kk * 4 + 1] = R.data[k * 4 + 1]; data[kk * 4 + 2] = R.data[k * 4 + 2]; data[kk * 4 + 3] = 255;
  }
  return { ox: R.ox, oy: R.oy + j0, w: R.w, h, data };
}
// L'OMBRE PORTÉE au soleil (isoSunShadow.sunShear : un point de hauteur h part de
// (x + kx·h, y + ky·h) à l'écran). Une seule couleur ; l'union des points.
export function plaisirsShadow(R, H, kx, ky) {
  const pts = [];
  let i0 = Infinity, i1 = -Infinity, j0 = Infinity, j1 = -Infinity;
  for (let k = 0; k < R.w * R.h; k += 1) {
    if (!R.data[k * 4 + 3] || H[k] < 0.75) continue;
    const i = (k % R.w) + Math.round(kx * H[k]), j = Math.floor(k / R.w) + Math.round(ky * H[k]);
    pts.push(i, j);
    if (i < i0) i0 = i; if (i > i1) i1 = i; if (j < j0) j0 = j; if (j > j1) j1 = j;
  }
  if (!pts.length) return null;
  const w = i1 - i0 + 1, h = j1 - j0 + 1, mask = new Uint8Array(w * h);
  for (let n = 0; n < pts.length; n += 2) mask[(pts[n + 1] - j0) * w + (pts[n] - i0)] = 1;
  return { ox: R.ox + i0, oy: R.oy + j0, w, h, mask };
}

// ── La couleur du lieu ───────────────────────────────────────────────────────
// Le seul rouge franc de la carte : c'est le signal du lieu, il se lit de loin.
// Velours (rideaux, dais), toile crème (rayures), papier des lanternes.
const VELVET = ['#e06a5e', '#c8434a', '#a2303e', '#7a2333', '#521827'];
const CANVAS = ['#f6ead0', '#e6d4ae', '#c9b38a', '#a08b66', '#74644a'];
const PAPER = ['#ff7a52', '#e8483a', '#a92a2a'];
// Une source de lumière est peinte avec un alpha de 253, une vitre de 254 : le
// calque de nuit les retrouve (même marquage que wonderBake.js).
export const A_WIN = 254, A_LIGHT = 253;
// Une OMBRE CHINOISE (252) : de jour, la vitre qu'on voit ; la nuit, si sa fenêtre
// s'allume, une silhouette sombre dessus (danseuse, couple).
export const A_SIL = 252;
// Un VERRE QUI S'ALLUME EN ENTIER la nuit (251 : la verrière éclairée par les salons
// d'en dessous) : de jour la vitre, la nuit une lumière chaude, sans tirage.
export const A_GLOW = 251;
export const lit = (c) => { const v = rgbOf(c); return [v[0], v[1], v[2], A_LIGHT]; };

// Velours drapé : des plis verticaux tous les 3 px, un cran plus sombre au creux.
export const velvetFold = (I, u) => rgbOf(VELVET[Math.min(4, band5(I) + (fm(u, 3) < 1 ? 1 : 0))]);

// ── Calque de nuit : la règle de wonderBake (nightOf), telle quelle ──────────
// Les vitres marquées s'allument (une sur trois reste noire), les sources gardent leur
// couleur. Rend N (même cadre que R) ou null.
// ⚠ Le tirage se fait par VITRE (tache connexe), jamais par pavé de pixels : la copie
// d'origine tirait par pavé de 4 × 8 px, et une fenêtre à cheval sur deux pavés
// s'allumait à moitié (Raph 2026-10-03, « la lumière ne remplit pas les fenêtres »).
export function nightLayer(R, nightHex) {
  // Les ombres chinoises comptent comme de la vitre pour le tirage (la fenêtre reste
  // UNE tache) ; si elle s'allume, elles deviennent des silhouettes sur la lumière.
  const sil = [], glow = [];
  for (let k = 3; k < R.data.length; k += 4) {
    if (R.data[k] === A_SIL) { R.data[k] = A_WIN; sil.push(k - 3); } else if (R.data[k] === A_GLOW) { R.data[k] = 255; glow.push(k - 3); }
  }
  let N = nightOf(R, { P: { night: nightHex } });
  if (N) for (const k of sil) if (N.data[k + 3]) { N.data[k] = 42; N.data[k + 1] = 16; N.data[k + 2] = 24; N.data[k + 3] = 255; }
  if (glow.length) {
    if (!N) N = { ox: R.ox, oy: R.oy, w: R.w, h: R.h, data: new Uint8ClampedArray(R.data.length) };
    for (const k of glow) { N.data[k] = 255; N.data[k + 1] = 233; N.data[k + 2] = 200; N.data[k + 3] = 225; }
  }
  return N;
}

// ── Pièces de l'ADN ──────────────────────────────────────────────────────────
// DAIS EN PÉTALES : une bordure circulaire de rayon r, haute de `drop`, accrochée
// à l'altitude h et découpée en festons (n pétales). Rayée cramoisi / crème par
// pétale. Seule la moitié AVANT se voit (c'est un solide : son arrière est caché
// par ce qu'il entoure).
export function petalValance(R, cx, cy, r, h, drop, n, opt = {}) {
  const a0 = opt.phase || 0;
  revolve(R, cx, cy, h - drop, h, cyl(r), (I, hh, ang, rho, cap) => {
    if (cap) return null;
    const s = fm((ang - a0) / TAU * n, 1);                    // position dans le pétale
    const edge = h - drop + drop * 0.62 * (1 - Math.sin(s * Math.PI));
    if (hh < edge) return null;
    const k = Math.floor(fm((ang - a0) / TAU * n, n));
    const pals = opt.pal || [VELVET, CANVAS];
    const P = (k & 1) ? pals[1] : pals[0];
    if (hh >= h - 1) return rgbOf(opt.trim || P[0]);         // galon du haut
    if (opt.neon && hh < edge + 1) return lit(opt.neon);     // liseré néon du bord
    return pick(P, I - (hh < edge + 1 ? 0.2 : 0));
  });
}
// GUIRLANDE de lanternes entre des poteaux posés sur un cercle de rayon r, à
// l'altitude h (accroche) : un fil qui s'affaisse, une lanterne tous les `step` px.
// `part` : 'back' ou 'front' (pour encadrer ce qui est au centre). Rend les points
// d'accroche (pour l'aura).
export function lanternGarland(R, cx, cy, r, h, n, part, opt = {}) {
  const sag = opt.sag || 4, step = opt.step || 5, cols = opt.cols || PAPER;
  const pts = [];
  for (let k = 0; k < n; k += 1) {
    const a = (k / n) * TAU + (opt.phase || 0), b = ((k + 1) / n) * TAU + (opt.phase || 0);
    const pa = [cx + r * Math.cos(a), cy + r * Math.sin(a)], pb = [cx + r * Math.cos(b), cy + r * Math.sin(b)];
    const dm = (pa[0] + pb[0]) / 2 + (pa[1] + pb[1]) / 2;     // profondeur du segment
    if ((part === 'back') !== (dm - cx - cy < 0)) continue;
    const len = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]);
    const m = Math.max(2, Math.round(len / 2));
    let prev = null;
    for (let i = 0; i <= m; i += 1) {
      const t = i / m, x = pa[0] + (pb[0] - pa[0]) * t, y = pa[1] + (pb[1] - pa[1]) * t;
      const hh = h - sag * 4 * t * (1 - t);
      if (prev) line(R, prev, [x, y, hh], opt.wire || '#3a2a22');
      prev = [x, y, hh];
    }
    const nl = Math.max(1, Math.floor(len / step));
    for (let i = 1; i < nl; i += 1) {
      const t = i / nl, x = pa[0] + (pb[0] - pa[0]) * t, y = pa[1] + (pb[1] - pa[1]) * t;
      const hh = h - sag * 4 * t * (1 - t) - 1;
      const c = cols[h32(k, i, 13) % 2];
      // Une lanterne = 2×2 px : le haut lumineux, le bas plus sombre. Un FANION
      // (âges sans lumière portable) : un petit triangle d'étoffe, éteint.
      if (opt.pennant) pennantDot(R, x, y, hh, c);
      else lanternDot(R, x, y, hh, c, cols[2] || '#7a2333');
    }
    pts.push({ x: pa[0], y: pa[1], h });
  }
  return pts;
}
function pennantDot(R, x, y, h, c) {
  const X = Math.floor(x - y - R.ox), Y = Math.floor((x + y) / 2 - h - R.oy), v = rgbOf(c);
  put(R, X, Y, v); put(R, X + 1, Y, v); put(R, X, Y + 1, v); put(R, X, Y + 2, v);
  dotDepth(R, X, Y, 2, 1, x + y); dotDepth(R, X, Y + 1, 1, 2, x + y);
}
function bulbDot(R, x, y, h, c) {
  put(R, Math.floor(x - y - R.ox), Math.floor((x + y) / 2 - h - R.oy), lit(c));
  noteD(R, x, y, h);
}
function lanternDot(R, x, y, h, c, cDark) {
  const X = Math.floor(x - y - R.ox), Y = Math.floor((x + y) / 2 - h - R.oy);
  put(R, X, Y, lit(c)); put(R, X + 1, Y, lit(c));
  put(R, X, Y + 1, lit(cDark)); put(R, X + 1, Y + 1, lit(c));
  dotDepth(R, X, Y, 2, 2, x + y);
}
// La profondeur d'un petit bloc posé au pixel (lanterne, fanion) : là où il a peint.
function dotDepth(R, X, Y, w, h, d) {
  const db = dbOf(R);
  for (let j = Y; j < Y + h; j += 1) for (let i = X; i < X + w; i += 1) {
    if (i >= 0 && j >= 0 && i < R.w && j < R.h && R.data[(j * R.w + i) * 4 + 3]) db[j * R.w + i] = d;
  }
}
// POTEAU fin (mât de guirlande, lampadaire) de h0 à h1.
export function post(R, x, y, h0, h1, col) {
  line(R, [x, y, h0], [x, y, h1], col);
}
// CANOPÉE CONIQUE rayée (tente, parasol, kiosque) : cône de rayon r à la base h0,
// pointe en h0 + H, bord festonné de `drop` px. Rayures par secteur.
export function stripedCone(R, X, cx, cy, r, h0, H, n = 12, drop = 3, opt = {}) {
  const pals = opt.pal || [VELVET, CANVAS];
  revolve(R, cx, cy, h0, h0 + H, taper(h0, h0 + H, r, 0.6), (I, hh, ang) => {
    const k = Math.floor(fm(ang / TAU * n, n));
    return pick((k & 1) ? pals[1] : pals[0], I);
  });
  petalValance(R, cx, cy, r, h0 + 0.5, drop, n, { pal: pals, neon: opt.neon });
  line(R, [cx, cy, h0 + H], [cx, cy, h0 + H + 3], opt.tip || X.P.metal[1]);
}

// ── Les pavillons des jeux ───────────────────────────────────────────────────
// La MATIÈRE d'un pavillon suit l'âge : `L(I)` pour un volume éclairé, `F(k)` pour
// un aplat (0 clair … 2 sombre). Marbre par défaut.
export function pavMat(X, kind) {
  if (kind === 'wood') return { L: X.woodL, F: (k) => X.wood(k + 1) };
  if (kind === 'stone') return { L: X.smooth, F: (k) => X.marble(k) };
  if (kind === 'metal') return { L: X.metalL, F: (k) => X.metal(k) };
  if (kind === 'crystal') return { L: (I) => [...X.glassL(I).slice(0, 3), A_LIGHT], F: (k) => lit(X.P.glassRamp[k]) };
  return { L: X.marbleL, F: (k) => X.marble(k) };
}
// LES OSSELETS : une table ronde sous un parasol rayé.
function pavOsselets(R, X, x, y, h, k = 1, M = pavMat(X)) {
  const q = (v) => v * k;
  for (const [dx, dy] of [[-7, -7], [7, -7], [-7, 7], [7, 7]]) post(R, x + q(dx), y + q(dy), h, h + q(15), X.P.metal[2]);
  revolve(R, x, y, h, h + 1, cyl(q(3.5)), M.L);
  revolve(R, x, y, h + 1, h + q(6), cyl(q(1.6)), M.L);
  revolve(R, x, y, h + q(6), h + q(8), cyl(q(7)), (I, hh, a, rho, cap) => (cap ? rgbOf(VELVET[3]) : M.L(I)));
  stripedCone(R, X, x, y, q(12), h + q(15), q(9), 12, 3);
}
// LE VINGT-ET-UN : un pavillon clos à rideaux, toit à quatre pans, une enseigne.
function pavCartes(R, X, x, y, h, k = 1, M = pavMat(X)) {
  const w = 9 * k, d = 7 * k, H = 16 * k;
  box(R, x - w, x + w, y - d, y + d, h, h + H, (f, u, hv, lv) => {
    if (hv >= h + H - 2) return M.F(lv ? 0 : 2);
    if (hv < h + 2) return M.F(lv ? 1 : 2);
    const m = fm(u, f === 'S' ? 6 : 7);
    if (m < 1.2) return M.F(lv ? 1 : 2);                     // pilastre
    return velvetFold(lv ? 0.5 : 0.2, u);                    // rideau tiré
  }, () => M.F(0));
  hip(R, x - w - 1.5, x + w + 1.5, y - d - 1.5, y + d + 1.5, h + H, 8, X.roofL);
  // Enseigne : un losange d'or (le carreau des cartes) sur le pignon sud.
  const sx = x, sy = y + d + 1.6, sh = h + H + 3;
  for (const [a, b] of [[0, 2], [-1, 1], [1, 1], [0, 0], [-1, 0.5], [1, 0.5]]) {
    put(R, Math.floor(sx + a - sy - R.ox), Math.floor((sx + sy) / 2 - sh - b - R.oy), lit(X.P.metal[0]));
  }
}
// LES TICKETS : un kiosque hexagonal, comptoir ouvert, coupole et épi d'or.
function pavTickets(R, X, x, y, h, k = 1, M = pavMat(X)) {
  const q = (v) => v * k;
  revolve(R, x, y, h, h + q(14), cyl(q(7.5)), (I, hh, ang) => {
    // Le comptoir : une baie sur la face qui regarde la rotonde… et l'œil.
    const face = Math.abs(fm(ang - Math.PI * 0.35 + Math.PI, TAU) - Math.PI) < 0.7;
    if (face && hh > h + q(5) && hh < h + q(11)) return [rgbOf(VELVET[4])[0], rgbOf(VELVET[4])[1], rgbOf(VELVET[4])[2], A_WIN];
    if (hh >= h + q(12)) return X.metal(band5(I) <= 1 ? 0 : 1);
    return M.L(I);
  }, 6);
  revolve(R, x, y, h + q(14), h + q(20), domeProf(h + q(14), q(8.5), q(6)), (I) => pick(VELVET, I));
  revolve(R, x, y, h + q(19), h + q(25), taper(h + q(19), h + q(25), 1.3, 0), X.metalL);
}
// LA BOUTIQUE (ouverte au premier effondrement) : une échoppe à auvent rayé.
function pavBoutique(R, X, x, y, h, M = null) {
  box(R, x - 8, x + 8, y - 6, y + 6, h, h + 12, M ? (f, u, hv, lv) => M.F(lv ? 1 : 2) : X.stone(71), M ? () => M.F(0) : X.top(1));
  box(R, x - 9, x + 9, y + 6, y + 10, h + 10, h + 12, (f, u) => rgbOf((Math.floor(u / 3) & 1) ? CANVAS[1] : VELVET[1]), (l, t) => rgbOf((Math.floor(t / 3) & 1) ? CANVAS[0] : VELVET[0]));
  hip(R, x - 9, x + 9, y - 7, y + 7, h + 12, 6, X.roofL);
}

// PLATEFORME D'ENVOL d'Icare, au sommet : un mât, une hune, deux ailes d'or
// déployées et la flamme rouge du lieu. La forme suit l'âge (ici : mât et ailes).
export function icarePerch(R, X, x, y, h, props) {
  line(R, [x, y, h], [x, y, h + 22], X.P.metal[2], 2);
  revolve(R, x, y, h + 12, h + 14, cyl(4), X.metalL);
  // Les ailes : deux pans plats en V, plumes d'or (trois crans, du bord d'attaque
  // au bout des rémiges). ⚠ Le plan des ailes contient (1, −1, 0) : le point
  // « intérieur » de la facette doit être DERRIÈRE lui (x + y < 0), sinon sa normale
  // tourne le dos à l'œil et la facette n'est pas peinte (mesuré : ailes absentes).
  const wy = h + 19;
  for (const s of [-1, 1]) {
    facet(R, [[x, y, wy], [x + s * 9, y - s * 9, wy + 5], [x + s * 8, y - s * 8, wy + 1], [x + s * 2, y - s * 2, wy - 2]],
      [x - 2, y - 2, wy], (I, px, py, ph) => rgbOf(X.P.metal[ph > wy + 2 ? 0 : fm(px - py, 3) < 1 ? 2 : 1]));
  }
  props.push({ prop: 'flag', x, y, h: h + 22, poleH: 6, fw: 6, fh: 3 });
}

// ══ BANDE 4 — LE MARBRE : la rotonde des plaisirs ════════════════════════════
//   îlot maçonné rond en deux gradins, embarcadère au sud ;
//   rotonde à péristyle, rideaux cramoisis aux baies, dais en pétales ;
//   galerie haute, coupole dorée côtelée, lanterneau ;
//   pavillons des jeux sur le pourtour, guirlandes de lanternes rouges ;
//   vasques de feu de part et d'autre de l'escalier.
// TERRASSE RONDE (plateau) de rayon r, à l'altitude h : corniche de marbre, frise
// d'or, dallage. `inlay` : l'anneau de mosaïque rouge et crème (la roulette).
function terrace(R, X, r, h0, h1, inlay) {
  revolve(R, 0, 0, h0, h1, cyl(r), (I, h, a, rho, cap) => {
    if (!cap) {
      if (h >= h1 - 1.5) return X.marble(band5(I) <= 1 ? 0 : 1);
      return fm(a * rho / 4, 1) < 0.5 ? X.metal(band5(I) <= 1 ? 1 : 2) : X.marble(band5(I) <= 1 ? 1 : 2);
    }
    if (inlay && rho > inlay[0] && rho < inlay[1]) {
      const k = Math.floor(fm(a / TAU * inlay[2], inlay[2]));
      return rgbOf(k === 0 ? '#3f7a52' : (k & 1) ? VELVET[2] : CANVAS[1]);
    }
    if (inlay && (Math.abs(rho - inlay[0]) < 0.8 || Math.abs(rho - inlay[1]) < 0.8)) return X.metal(1);
    const ringJ = fm(rho, 8) < 0.7, radJ = fm(a * rho / 9, 1) < 0.09;
    return X.marble(ringJ || radJ ? 2 : rho > r - 3 ? 0 : 1);
  });
}
// BALUSTRADE d'or sur le bord d'une terrasse (moitié arrière ou avant).
export function balustrade(R, X, r, h, part) {
  ring3d(R, [0, 0, h + 3], r, 1, PLANE_H[0], PLANE_H[1], (I) => pick(X.P.metal, I - 0.15), part);
  const n = Math.round(r * 0.5);
  for (let k = 0; k < n; k += 1) {
    const a = (k / n) * TAU, x = r * Math.cos(a), y = r * Math.sin(a);
    if ((part === 'back') !== (x + y < 0)) continue;
    line(R, [x, y, h], [x, y, h + 3], X.P.metal[2]);
  }
}

function bakeMarbre(K, g) {
  const X = mats(K), props = [], ledges = [];
  const RB = 90, H = 290;
  const R = frameOf(true, [[-RB - 14, RB + 14, -RB - 14, RB + 14, -2, H]]);
  // ── L'îlot : soubassement à bossages (pied mouillé), terrasse dallée de marbre
  //    avec son anneau de mosaïque — la roulette, vue du ciel.
  revolve(R, 0, 0, 0, 7, cyl(RB), (I, h, a, rho, cap) => {
    if (cap) return X.marble(1);
    if (h < 2) return rgbOf(K.pal.wet[h < 1 ? 1 : 0]);
    return X.stoneL(I, h, a, rho);
  });
  const h0 = 10;
  terrace(R, X, RB - 5, 7, h0, [62, 70, 45]);
  // Embarcadère : l'escalier qui descend à l'eau, face au sud.
  stairs(R, X, -12, 12, RB + 6, 15, 0, h0);
  // ── Le pourtour, partie ARRIÈRE (derrière la rotonde).
  const garlandN = 14, gR = RB - 10, gH = h0 + 16;
  const gPost = (part) => {
    for (let k = 0; k < garlandN; k += 1) {
      const a = (k / garlandN) * TAU + 0.13, x = gR * Math.cos(a), y = gR * Math.sin(a);
      if ((part === 'back') === (x + y < 0)) post(R, x, y, h0, gH + 1, X.P.metal[2]);
    }
  };
  gPost('back');
  ledges.push(...lanternGarland(R, 0, 0, gR, gH, garlandN, 'back', { phase: 0.13 }));
  // (Les jeux sont DEDANS, dans la coupe : plus de kiosques sur la terrasse.)
  // ── LE FÛT : rotonde à péristyle, premier plateau en pétales.
  const rC = 48, nC = 16, cH = 42, rF = 35;
  const colAt = (k) => { const a = (k / nC) * TAU + Math.PI / nC; return [rC * Math.cos(a), rC * Math.sin(a)]; };
  const column = (x, y) => {
    revolve(R, x, y, h0, h0 + 2, cyl(3.2), X.marbleL);
    revolve(R, x, y, h0 + 2, h0 + cH - 2, cyl(2.3), X.marbleL);
    revolve(R, x, y, h0 + cH - 2, h0 + cH, cyl(3), X.marbleL);
  };
  for (let k = 0; k < nC; k += 1) { const [x, y] = colAt(k); if (x + y < 0) column(x, y); }
  const eH = h0 + cH, t1 = eH + 5;               // entablement → 1er plateau
  const h1 = t1 + 34, t2 = h1 + 5;               // tambour haut → 2e plateau
  const h2 = t2 + 18;                            // arcade des lanternes → coupole
  // Les baies du rez : rideaux cramoisis tirés, une FENTE de lumière entre les
  // deux pans (la nuit, c'est elle qui s'allume — les silhouettes derrière la vitre).
  // ⚠ Le fût se peint PAR ÉTAGE, de bas en haut, chaque plateau entre deux : un
  // solide de révolution ne connaît pas ses voisins, et la galette d'un plateau
  // peinte après un fût d'un seul tenant repasserait sur sa face avant.
  const bays = 8;
  const fut = (hA, hB) => revolve(R, 0, 0, hA, hB, cyl(rF), withDoor((I, h, a, rho) => {
    const s = fm(a / TAU * bays + 0.5, 1) - 0.5;
    if (h < eH) {
      const half = 0.19, top = h0 + 26 + 6 * Math.sqrt(Math.max(0, 1 - (s / half) ** 2));
      if (Math.abs(s) < half && h < top) {
        if (Math.abs(s) < 0.025 || h > top - 3) return [...rgbOf(PAPER[0]), A_WIN];
        return velvetFold(I, a * rho);
      }
      if (Math.abs(s) < half + 0.04 && h < top + 1.5) return X.marble(band5(I) <= 1 ? 0 : 2);
      return X.stoneL(I, h, a, rho);
    }
    if (h < h1) {
      // Étage noble : douze fenêtres cintrées, vitres de l'ère.
      const s2 = fm(a / TAU * 12 + 0.5, 1) - 0.5;
      const top = t1 + 23 + 3 * Math.sqrt(Math.max(0, 1 - (s2 / 0.2) ** 2));
      if (Math.abs(s2) < 0.2 && h > t1 + 7 && h < top) {
        // L'étage du CABARET : la nuit, une danseuse en ombre chinoise une fenêtre sur trois.
        const c = rgbOf(h > top - 5 ? VELVET[3] : '#2b3240'), bay = Math.floor(fm(a / TAU * 12 + 0.5, 12));
        if (bay % 3 === 1 && dancerAt(Math.round(s2 * TAU * rho / 12) * (bay & 2 ? -1 : 1), Math.floor(h - t1 - 8))) return [...c, A_SIL];
        return [...c, A_WIN];
      }
      if (h >= h1 - 2) return X.marble(0);
      return X.marbleL(I);
    }
    // Arcade des lanternes, sous la coupole : piliers et lampions.
    const s3 = fm(a / TAU * 10 + 0.5, 1) - 0.5;
    // L'arcade sous la coupole, c'est le BOUDOIR : vitres roses, un couple sur deux.
    if (Math.abs(s3) < 0.28 && h > t2 + 2 && h < h2 - 2) {
      const bay = Math.floor(fm(a / TAU * 10 + 0.5, 10)), u = Math.round(s3 * TAU * rho / 10), v = Math.floor(h - t2 - 3);
      if (bay % 2 === 0 && coupleAt(u, v)) return [...rgbOf('#ff9ab8'), A_SIL];
      return lit(v > 9 ? '#ffc2d6' : '#ff9ab8');
    }
    return X.marbleL(I);
  }, h0, DOOR_WOOD));
  fut(h0, eH);
  for (let k = 0; k < nC; k += 1) { const [x, y] = colAt(k); if (x + y >= 0) column(x, y); }
  // Premier plateau : sur la colonnade, pétales pendus à son bord.
  terrace(R, X, rC + 6, eH, t1, null);
  petalValance(R, 0, 0, rC + 6.5, eH + 1, 12, 28, { trim: X.P.metal[0] });
  balustrade(R, X, rC + 4, t1, 'back');
  fut(t1, h1);
  balustrade(R, X, rC + 4, t1, 'front');
  // Deuxième plateau : terrasse plus étroite, pétales plus courts.
  terrace(R, X, rF + 8, h1, t2, null);
  petalValance(R, 0, 0, rF + 8.5, h1 + 1, 9, 20, { trim: X.P.metal[0] });
  balustrade(R, X, rF + 6, t2, 'back');
  fut(t2, h2);
  balustrade(R, X, rF + 6, t2, 'front');
  ledges.push({ x: 0, y: rC + 5, h: t1 }, { x: -rC * 0.75, y: rC * 0.75, h: t1 }, { x: rC * 0.75, y: rC * 0.75, h: t1 },
    { x: 0, y: rF + 7, h: t2 });
  // ── La coupole dorée côtelée, ses pétales, le lanterneau, la plateforme d'Icare.
  const rDome = 30, Hd = 33;
  revolve(R, 0, 0, h2, h2 + Hd, domeProf(h2, rDome, Hd), (I, h, a) => {
    if (fm(a / TAU * 16, 1) < 0.12) return pick(X.P.metal, I - 0.35);
    return pick(X.P.metal, I + 0.05);
  });
  petalValance(R, 0, 0, rDome + 1.5, h2 + 1, 6, 18, { trim: X.P.metal[0] });
  const hl = h2 + Hd - 2;
  revolve(R, 0, 0, hl, hl + 12, cyl(6.5), (I, h, a) => (fm(a / TAU * 6, 1) < 0.3 ? X.marble(band5(I) <= 1 ? 0 : 2) : lit(PAPER[0])));
  revolve(R, 0, 0, hl + 12, hl + 17, domeProf(hl + 12, 7.5, 5), X.metalL);
  props.push({ prop: 'glow', x: 0, y: 0, h: hl + 6 });
  if (g.icare) icarePerch(R, X, 0, 0, hl + 17, props);
  // ── Le pourtour, partie AVANT : pavillons, poteaux, guirlande, vasques.
  gPost('front');
  ledges.push(...lanternGarland(R, 0, 0, gR, gH, garlandN, 'front', { phase: 0.13 }));
  for (const sx of [-18, 18]) {
    revolve(R, sx, RB - 5, h0, h0 + 5, taper(h0, h0 + 5, 2, 3.4), X.marbleL);
    revolve(R, sx, RB - 5, h0 + 5, h0 + 7, cyl(4), (I, h, a, rho, cap) => (cap ? rgbOf('#3a2a22') : X.metalL(I)));
    props.push({ prop: 'flame', x: sx, y: RB - 5, h: h0 + 7 });
  }
  outline(R, X.ink);
  const N = nightLayer(R, K.pal.night);
  const sb = Math.PI / 4 + 0.45;
  return { R, N, props, ledges, apex: { x: 0, y: 0, h: hl + 39 }, foot: RB,
    stroll: { r: 66, h: h0, door: [41.6, 37.6, h0], balcony: [51 * Math.cos(sb), 51 * Math.sin(sb), t1] } };
}

// ══ BANDE 0 — LE FEU : le radeau des joueurs ═════════════════════════════════
// L'Ère II, encore le campement de tentes : le lieu n'est qu'un grand radeau de
// rondins amarré à un rocher. L'ADN y est déjà, à la mesure de l'âge :
//   le fût = le mât central, les plateaux = le radeau, le dais = un auvent de
//   peaux teintes à l'ocre rouge, festonné ; les lanternes = des torches et des
//   fanions ; les jeux = des nattes (osselets), un abri de branches (tickets),
//   puis, à l'Ère III, une natte d'écorces peintes (cartes) et, au sommet du mât,
//   des ailes de plumes liées (Icare).
const HIDE = ['#ecd6a8', '#d2b582', '#ad8f60', '#806740', '#56442a'];
const OCHRE = ['#d8794c', '#b85a36', '#913f27', '#682e1d', '#441e12'];
function bakeFeu(K, g) {
  const X = mats(K), props = [], ledges = [];
  const RB = 52, H = 130;
  const R = frameOf(true, [[-RB - 30, RB + 14, -RB - 30, RB + 14, -2, H]]);
  const W = K.pal.wood;
  // Le ROCHER d'amarrage, au nord-ouest : il émerge, le radeau s'y tient.
  // Trois blocs qui se chevauchent, facettés : un rocher, pas un dôme.
  const rk = [-40, -38];
  const boulder = (x, y, r, H, seed) => revolve(R, x, y, 0, H, (h) => r * (1 - Math.pow(h / H, 2.2)) + 1.5,
    (I, h, a, rho, cap) => {
      if (h < 1.6) return rgbOf(K.pal.wet[0]);
      if (cap && h32(Math.round(a * 7), Math.round(rho), seed) % 3 === 0) return X.turf(h32(Math.round(a * 5), seed) % 3 === 0 ? 3 : 2);   // mousse
      return X.roughL(I, h, a);
    }, 7);
  boulder(rk[0] - 8, rk[1] - 6, 14, 15, 1);
  boulder(rk[0] + 4, rk[1] - 2, 16, 21, 2);
  boulder(rk[0] + 10, rk[1] + 10, 9, 10, 3);
  // LE RADEAU : des rondins le long de x, longueurs taillées en octogone.
  const logW = 6, lh = 4;
  for (let y = -RB + 4; y <= RB - 4; y += logW) {
    const half = Math.sqrt(Math.max(0, RB * RB - (y + logW / 2) ** 2)) * 0.96;
    const x0 = -half, x1 = half;
    box(R, x0, x1, y, y + logW - 0.6, 0, lh, (f, u, hv, lv) => {
      if (hv < 1) return rgbOf(K.pal.wet[1]);
      if (f === 'E') return rgbOf(W[(hv === lh - 1 ? 1 : 2) + (fm(u, 6) < 1 ? 1 : 0)]);     // bout du rondin
      return rgbOf(W[lv ? (hv === lh - 1 ? 0 : 1) : 2]);
    }, (l, t) => rgbOf(W[fm(t, logW) < 1.2 ? 2 : h32(Math.floor(l / 9), Math.floor(y), 5) % 5 === 0 ? 1 : 0]));
  }
  // Les liens de corde en travers, et l'amarre vers le rocher.
  for (const x of [-RB * 0.55, 0, RB * 0.55]) line(R, [x, -RB + 6, lh + 0.2], [x, RB - 6, lh + 0.2], '#8a6a3a');
  line(R, [-RB * 0.6, -RB * 0.6, lh], [rk[0] + 10, rk[1] + 10, 10], '#6e5430');
  line(R, [-RB * 0.75, -RB * 0.2, lh], [rk[0] + 14, rk[1] + 4, 8], '#6e5430');
  const h0 = lh;
  // Torches tout autour (le premier feu du lieu), fanions d'ocre entre elles.
  const nT = 8, tR = RB - 6, tH = h0 + 16;
  const torches = (part) => {
    for (let k = 0; k < nT; k += 1) {
      const a = (k / nT) * TAU + 0.2, x = tR * Math.cos(a), y = tR * Math.sin(a);
      if ((part === 'back') !== (x + y < 0)) continue;
      line(R, [x, y, h0], [x, y, tH], W[2], 1);
      // Tête de la torche : poix qui rougeoie (une source pour le calque de nuit).
      put(R, Math.floor(x - y - R.ox), Math.floor((x + y) / 2 - tH - R.oy), lit('#ff9a3a'));
      props.push({ prop: 'flame', x, y, h: tH, small: true });
      ledges.push({ x, y, h: tH });
    }
  };
  torches('back');
  lanternGarland(R, 0, 0, tR, tH - 2, nT, 'back', { phase: 0.2, sag: 5, step: 4, pennant: true, cols: [OCHRE[1], HIDE[0]], wire: '#6e5430' });
  // LA GRANDE TENTE (« un plan, deux vues ») : la coupe range les six lieux sous une
  // seule tente ; dehors, le dais devient cette salle — six perches, des parois de
  // peaux, trois pans relevés sur la lumière du dedans (une danseuse en ombre chinoise,
  // la nuit), le mât au milieu. Plus de nattes de jeux sur le pont : on joue DEDANS.
  const dR = 32, dH = h0 + 22;
  for (let k = 0; k < 6; k += 1) {
    const a = (k / 6) * TAU + 0.5, x = dR * 0.92 * Math.cos(a), y = dR * 0.92 * Math.sin(a);
    if (x + y < 0) line(R, [x, y, h0], [x, y, dH], W[2], 2);
  }
  // Les parois : peaux à rayures d'ocre ; les pans de face relevés (vitre de lumière :
  // A_WIN, allumée la nuit, une danseuse en ombre chinoise dans l'un d'eux).
  revolve(R, 0, 0, h0, dH, cyl(dR * 0.9), (I, h, a, rho, cap) => {
    if (cap) return null;
    const k = Math.floor(fm(a / TAU * 6 + 0.5, 6)), sp = fm(a / TAU * 6 + 0.5, 1) - 0.5;
    const open = (k === 0 || k === 1) && Math.abs(sp) < 0.3 && h < dH - 4;
    if (open) {
      const u = Math.round(sp * TAU * rho / 6), v = Math.floor(h - h0 - 1);
      if (k === 1 && dancerAt(u, v)) return [...rgbOf('#ffb060'), A_SIL];
      return [...rgbOf('#3a2414'), A_WIN];
    }
    if (Math.abs(sp) > 0.44) return rgbOf(W[2]);                       // la perche
    return pick((Math.floor(fm(a * rho / 3, 2)) === 0) ? HIDE : OCHRE, I);
  });
  line(R, [0, 0, h0], [0, 0, dH + 26], W[1], 2);
  for (let k = 0; k < 6; k += 1) {
    const a = (k / 6) * TAU + 0.5, x = dR * 0.92 * Math.cos(a), y = dR * 0.92 * Math.sin(a);
    if (x + y >= 0) line(R, [x, y, h0], [x, y, dH], W[2], 2);
  }
  revolve(R, 0, 0, dH, dH + 12, taper(dH, dH + 12, dR + 2, 2), (I, h, ang) => {
    const k = Math.floor(fm(ang / TAU * 12, 12));
    return pick((k & 1) ? HIDE : OCHRE, I);
  });
  petalValance(R, 0, 0, dR + 2, dH + 0.5, 5, 12, { pal: [OCHRE, HIDE], trim: HIDE[0] });
  // ICARE (Ère III) : au sommet du mât, des ailes de plumes liées sur une traverse.
  if (g.icare) {
    const wy = dH + 22;
    line(R, [-7, 7, wy], [7, -7, wy], W[2]);
    for (const sgn of [-1, 1]) {
      facet(R, [[0, 0, wy], [sgn * 10, -sgn * 10, wy + 4], [sgn * 9, -sgn * 9, wy - 1], [sgn * 2, -sgn * 2, wy - 2]],
        [-2, -2, wy], (I, px, py, ph) => rgbOf(fm(px - py, 3) < 1 ? HIDE[2] : ph > wy + 1 ? '#f4efe6' : HIDE[0]));
    }
  }
  props.push({ prop: 'flag', x: 0, y: 0, h: dH + 26, poleH: 5, fw: 5, fh: 3 });
  // Le FEU, devant la tente, dans son cercle de pierres.
  const fx = 20, fy = 38;
  for (let k = 0; k < 9; k += 1) {
    const a = (k / 9) * TAU, x = fx + 6 * Math.cos(a), y = fy + 6 * Math.sin(a);
    box(R, x - 1.5, x + 1.5, y - 1.5, y + 1.5, h0, h0 + 2.5, X.plain(1), X.top(2));
  }
  props.push({ prop: 'flame', x: fx, y: fy, h: h0 + 1, big: true });
  ledges.push({ x: fx, y: fy, h: h0 + 4 });
  torches('front');
  lanternGarland(R, 0, 0, tR, tH - 2, nT, 'front', { phase: 0.2, sag: 5, step: 4, pennant: true, cols: [OCHRE[1], HIDE[0]], wire: '#6e5430' });
  outline(R, X.ink);
  const N = nightLayer(R, K.pal.night);
  return { R, N, props, ledges, apex: { x: 0, y: 0, h: dH + 30 }, foot: RB,
    // Les filles du foyer : le tour du radeau, l'entrée de la tente, la danse au feu.
    stroll: { r: 42, h: h0, door: [dR * 0.64 + 6, dR * 0.64 - 4, h0], balcony: [fx - 8, fy - 2, h0] } };
}

// ══ BANDE 6 — LE NÉON : la tour-fleur ════════════════════════════════════════
// La silhouette validée par Raph en août (« la structure qui me parle le plus »),
// refaite dans la DA de la carte. Ce que montraient ses références, et que la
// tour doit garder : une silhouette ARBORESCENTE, pas prismatique — des plateaux
// en soucoupe qui s'étagent EN ÉVENTAIL autour d'un tronc renflé ; de la
// verticalité ; des pétales bordés de néon ; sur chaque pétale de petits pavillons
// à vitrines rouges. Une dalle sur pilotis au pied, le mât d'Icare au sommet, les
// projecteurs la nuit (isoPlaisirs).
const NEON_PINK = ['#ff8cc6', '#ff3d97', '#b81e66'];
// PLATEAU EN PÉTALES : un disque dont le bord est festonné EN PLAN (n pétales,
// creux de `notch` × r entre deux), épais de `th`. Le noyau (rayon des creux) est
// peint plein, avec ses flancs ; les pétales n'existent qu'au-dessus, avec un
// liseré au bord — c'est le liseré qui dessine la fleur vue du ciel.
function petalPlate(R, cx, cy, r, h, th, n, notch, o) {
  const rIn = r * (1 - notch);
  const rOf = (a) => r * (1 - notch * Math.pow(1 - Math.abs(Math.cos((a * n) / 2)), 1.4));
  const petal = (a) => Math.round((fm(a, TAU) * n) / TAU) % n;
  revolve(R, cx, cy, h, h + th - 1, cyl(rIn), (I, hh, a, rho, cap) => (cap ? o.top(rho, a, petal(a), rIn) : o.side(I, hh)));
  revolve(R, cx, cy, h + th - 1.5, h + th, cyl(r), (I, hh, a, rho, cap) => {
    const rp = rOf(Math.atan2(rho * Math.sin(a), rho * Math.cos(a)));
    if (rho > rp) return null;
    if (rho > rp - 1.6) return o.rim;
    if (!cap) return o.side(I, hh);
    return o.top(rho, a, petal(a), rIn);
  });
}
function bakeNeon(K, g) {
  const X = mats(K), props = [], ledges = [];
  const RB = 88, H = 400;
  const R = frameOf(true, [[-RB - 20, RB + 20, -RB - 20, RB + 20, -2, H]]);
  const conc = (I, h, a, rho) => X.stoneL(I, h, a, rho);
  // ── La dalle sur PILOTIS : l'eau passe dessous.
  const hs = 8, h0 = 12, nP = 14;
  const pile = (x, y) => revolve(R, x, y, 0, hs, cyl(3.2), (I, h) => (h < 1.5 ? rgbOf(K.pal.wet[1]) : conc(I, h)));
  for (let k = 0; k < nP; k += 1) {
    const a = (k / nP) * TAU, x = (RB - 8) * Math.cos(a), y = (RB - 8) * Math.sin(a);
    if (x + y < 0) pile(x, y);
  }
  pile(0, 0);
  for (let k = 0; k < nP; k += 1) {
    const a = (k / nP) * TAU, x = (RB - 8) * Math.cos(a), y = (RB - 8) * Math.sin(a);
    if (x + y >= 0) pile(x, y);
  }
  revolve(R, 0, 0, hs, h0, cyl(RB), (I, h, a, rho, cap) => {
    if (!cap) return h < hs + 1.5 ? lit(NEON_PINK[1]) : conc(I, h, a, rho);
    if (rho > 60 && rho < 68) {                              // la roulette, en résine
      const k = Math.floor(fm(a / TAU * 37, 37));
      return rgbOf(k === 0 ? '#2f8a5a' : (k & 1) ? VELVET[1] : '#2a2a30');
    }
    if (Math.abs(rho - 60) < 0.8 || Math.abs(rho - 68) < 0.8) return X.metal(0);
    return rgbOf(fm(rho, 10) < 0.8 || fm(a * rho / 10, 1) < 0.08 ? '#b9bec6' : '#d5d9de');
  });
  stairs(R, X, -12, 12, RB + 7, 15, 0, h0);
  // (Les jeux sont DEDANS : plus de vitrines de jeux sur la dalle.)
  // ── LE TRONC (la cage de l'ascenseur) et ses PLATEAUX en éventail, chacun portant
  // SON SALON vitré : les cinq étages de la coupe (« un plan, deux vues ») — le rez sur
  // la dalle (osselets, boutique), puis le vingt-et-un, les tickets, la SCÈNE (la nuit,
  // des danseuses en ombres chinoises), et le salon-boudoir au sommet, vitres roses.
  const trunk = (h) => 13 + 3 * Math.exp(-(((h - 40) / 26) ** 2));
  const futCol = (I, h, a) => {
    if (fm(a / TAU * 16, 1) < 0.14) return pick(X.P.metal, I);           // meneaux
    if (fm(h, 10) < 1) return pick(X.P.metal, I - 0.1);
    return [...pick(X.P.glassRamp, I).slice(0, 3), A_WIN];
  };
  const fut = (hA, hB) => { if (hB > hA) revolve(R, 0, 0, hA, hB, trunk, futCol); };
  const lv = plaisirsPlan(6).levels, widths = plaisirsPlan(6).widths;
  const FH = 22;
  // Un salon : verre et acier, un bandeau néon en corniche, la porte au rez.
  const salonCol = (hA, hB, rooms, door) => {
    const fl = [{ h0: hA, h1: hB, rooms, kind: rooms.includes('boudoir') ? 'boudoir' : rooms.includes('scene') ? 'cabaret' : 'jeux', n: 14, sill: hA + 3 }];
    const base = (I, h, a) => {
      if (h > hB - 2) return lit(NEON_PINK[h > hB - 1 ? 0 : 1]);              // la corniche de néon
      if (h < hA + 2) return pick(X.P.metal, I - 0.1);
      if (fm(a / TAU * 14 + 0.5, 1) < 0.12) return pick(X.P.metal, I);
      return [...pick(X.P.glassRamp, I).slice(0, 3), A_WIN];
    };
    const c = nightLife(base, fl, 14);
    return door ? withDoor(c, hA, DOOR_NEON) : c;
  };
  const salon = (cx, cy, r, hA, rooms, door) => revolve(R, cx, cy, hA, hA + FH, cyl(r), salonCol(hA, hA + FH, rooms, door));
  // Le rez, sur la dalle.
  salon(0, 0, widths[0] / 6, h0, lv[0], true);
  const plates = [
    { h: h0 + FH + 14, r: 58, ox: 6, oy: 8, n: 9, notch: 0.16 },
    { h: h0 + 2 * (FH + 14) + 8, r: 54, ox: -8, oy: -2, n: 8, notch: 0.18 },
    { h: h0 + 3 * (FH + 14) + 16, r: 50, ox: 5, oy: -7, n: 7, notch: 0.2 },
    { h: h0 + 4 * (FH + 14) + 24, r: 46, ox: -3, oy: 3, n: 6, notch: 0.22 },
  ];
  // Le cœur du plateau dallé clair, les pétales alternés cramoisi / crème.
  const top = (rho, a, k, rIn) => {
    if (rho < rIn * 0.62) return rgbOf(fm(rho, 7) < 0.8 ? '#c4c9cf' : '#e2e5e9');
    if (rho < rIn * 0.62 + 1.2) return X.metal(0);
    return rgbOf((k & 1) ? CANVAS[fm(rho, 6) < 0.8 ? 1 : 0] : VELVET[fm(rho, 6) < 0.8 ? 2 : 1]);
  };
  const side = (I) => (I > 0.3 ? rgbOf(VELVET[1]) : rgbOf(VELVET[3]));
  let hPrev = h0 + FH;
  plates.forEach((p, i) => {
    fut(hPrev, p.h);
    // La branche : un cône d'acier sous le plateau, du tronc au centre décalé.
    for (let q = 0; q <= 1.0001; q += 0.1) {
      revolve(R, p.ox * q, p.oy * q, p.h - 12 + 12 * q, p.h - 10 + 12 * q, cyl(4 + 4 * q), (I) => pick(X.P.metal, I - 0.1));
    }
    petalPlate(R, p.ox, p.oy, p.r, p.h, 5, p.n, p.notch, { top, side, rim: lit(NEON_PINK[0]) });
    salon(p.ox, p.oy, widths[i + 1] / 6, p.h + 5, lv[i + 1], false);
    hPrev = p.h + 5 + FH;
    ledges.push({ x: p.ox, y: p.oy + p.r, h: p.h + 4 }, { x: p.ox - p.r * 0.7, y: p.oy + p.r * 0.7, h: p.h + 4 }, { x: p.ox + p.r * 0.7, y: p.oy + p.r * 0.7, h: p.h + 4 });
  });
  // ── Le chapiteau : coupole de néon côtelée, mât d'Icare, balise.
  const hTop = hPrev + 6;
  fut(hPrev, hTop);
  revolve(R, 0, 0, hTop, hTop + 18, domeProf(hTop, 18, 18), (I, h, a) => (fm(a / TAU * 12, 1) < 0.12 ? pick(X.P.metal, I) : [...pick(NEON_PINK, I + 0.2).slice(0, 3), A_LIGHT]));
  line(R, [0, 0, hTop + 18], [0, 0, hTop + 56], X.P.metal[1], 2);
  for (const hh of [hTop + 28, hTop + 38]) ring3d(R, [0, 0, hh], 4, 1, PLANE_H[0], PLANE_H[1], () => lit(NEON_PINK[0]));
  if (g.icare) {
    const wy = hTop + 48;
    for (const sgn of [-1, 1]) {
      facet(R, [[0, 0, wy], [sgn * 13, -sgn * 13, wy + 5], [sgn * 12, -sgn * 12, wy + 1], [sgn * 2, -sgn * 2, wy - 2]],
        [-2, -2, wy], (I, px, py, ph) => (ph > wy + 2 ? lit(NEON_PINK[0]) : pick(X.P.metal, I)));
    }
  }
  props.push({ prop: 'beacon', x: 0, y: 0, h: hTop + 58 });
  // ── Sur la dalle, devant : la roulette couverte (osselets), le club du
  // vingt-et-un, l'enseigne verticale à ampoules.
  const sx = 30, sy = 40, s0 = h0, s1 = h0 + 56;
  line(R, [sx, sy, s0], [sx, sy, s1 - 34], X.P.metal[2], 2);
  box(R, sx - 1.5, sx + 1.5, sy - 8, sy + 8, s1 - 36, s1, (f, u, hv) => {
    const edge = hv <= s1 - 35 || hv >= s1 - 1 || Math.abs(u - sy) > 6.6;
    if (edge) return fm(u + hv, 2) < 1 ? lit('#ffe08a') : rgbOf('#5a2030');
    // La DANSEUSE de néon, jambe levée (l'enseigne de revue).
    return dancerAt(Math.round(u - sy), Math.floor((hv - (s1 - 31)) / 2.4)) ? lit(NEON_PINK[0]) : rgbOf(VELVET[3]);
  }, () => rgbOf('#3a1420'));
  outline(R, X.ink);
  const N = nightLayer(R, K.pal.night);
  const sb = Math.PI / 4 + 0.45;
  return { R, N, props, ledges, apex: { x: 0, y: 0, h: hTop + 56 }, foot: RB,
    stroll: { r: 74, h: h0, door: [widths[0] / 6 * 0.707 + 10, widths[0] / 6 * 0.707 + 2, h0], balcony: [6 + 44 * Math.cos(sb), 8 + 44 * Math.sin(sb), plates[0].h + 5] } };
}

// ══ LE SQUELETTE COMMUN : socle, fût, plateaux, festons, couronne ════════════
// Les âges Bois, Pierre taillée, Couronne, Fonte et cosmiques partagent la même
// ossature — c'est l'ADN : un SOCLE sur l'eau, un FÛT qui monte par étages, à
// chaque étage un PLATEAU (terrasse ou jupe de toit) bordé de PÉTALES, des
// GUIRLANDES de lumières, les PAVILLONS des jeux sur le pourtour, une COURONNE et
// la plateforme d'Icare au sommet. Chaque âge n'en donne que la matière et les
// pièces propres (portique, masque, roue à aubes, lévitation).
//
// ORDRE DE PEINTURE (le raster ne trie rien) : arrière du pourtour → fût par
// tronçons, chaque plateau entre deux (la galette d'un plateau peinte après un fût
// d'un seul tenant repasserait sur sa face avant) → couronne → avant du pourtour.
//
// S = {
//   RB, H, foot?           rayon du socle, hauteur du cadre, rayon de tri
//   base(R, X, props)      peint le socle, rend { deck, fut } (altitudes)
//   garland?               { r, h (au-dessus du pont), n, opts, post }
//   pav: { osselets, tickets, cartes, boutique } → [x, y, k] ; pavM : matière
//   pavHook?(R, X, game, x, y, h, k, props) → true s'il a peint le pavillon lui-même
//   futR(h), futCol(I, h, a, rho)
//   levels: [{ h, th, r | prof(hh), col, valance: { r, drop, n, pal, neon, trim },
//              bal?: { r }, posts?: { r, n, col }, hook?(R, X, props, part) }]
//   top, crown(R, X, props, hTop, g) → altitude du sommet
//   extra?(R, X, props, part, deck)  pièces du bord : arrière d'abord, avant en dernier
// }
// `Sf` peut être une fonction de la matière X (mats(K)) : les couleurs se tirent
// alors une fois, pas à chaque pixel.
function tiered(K, g, Sf) {
  const X = mats(K), props = [], ledges = [];
  const S = typeof Sf === 'function' ? Sf(X) : Sf;
  const R = frameOf(true, [[-S.RB - 22, S.RB + 22, -S.RB - 22, S.RB + 22, -2, S.H]]);
  const { deck, fut: hFut } = S.base(R, X, props);
  const gar = S.garland;
  const posts = (part) => {
    for (let k = 0; k < gar.n; k += 1) {
      const a = (k / gar.n) * TAU + (gar.opts.phase || 0), x = gar.r * Math.cos(a), y = gar.r * Math.sin(a);
      if ((part === 'back') === (x + y < 0)) post(R, x, y, deck, deck + gar.h + 1, gar.post || X.P.metal[2]);
    }
  };
  const M = S.pavM || pavMat(X);
  const pavs = (part) => {
    for (const game of ['boutique', 'tickets', 'osselets', 'cartes']) {
      const p = S.pav && S.pav[game];
      if (!p || !g[game] || (part === 'back') !== (p[0] + p[1] < 0)) continue;
      const [x, y, k = 1] = p;
      if (S.pavHook && S.pavHook(R, X, game, x, y, deck, k, props)) continue;
      if (game === 'osselets') pavOsselets(R, X, x, y, deck, k, M);
      else if (game === 'tickets') pavTickets(R, X, x, y, deck, k, M);
      else if (game === 'cartes') pavCartes(R, X, x, y, deck, k, M);
      else pavBoutique(R, X, x, y, deck, M);
    }
  };
  if (gar) { posts('back'); ledges.push(...lanternGarland(R, 0, 0, gar.r, deck + gar.h, gar.n, 'back', gar.opts)); }
  if (S.extra) S.extra(R, X, props, 'back', deck);
  pavs('back');
  const fut = (hA, hB) => { if (hB > hA) revolve(R, 0, 0, hA, hB, (h) => S.futR(h), S.futCol); };
  const ring = (L, part) => {
    if (!L.posts) return;
    for (let k = 0; k < L.posts.n; k += 1) {
      const a = (k / L.posts.n) * TAU + Math.PI / L.posts.n, x = L.posts.r * Math.cos(a), y = L.posts.r * Math.sin(a);
      if ((part === 'back') === (x + y < 0)) line(R, [x, y, L.base], [x, y, L.h], L.posts.col, L.posts.w || 2);
    }
  };
  let hPrev = hFut, pending = null;
  for (const L of S.levels) {
    L.base = hPrev;
    ring(L, 'back');
    fut(hPrev, L.h);
    if (pending) { pending(); pending = null; }
    ring(L, 'front');
    if (L.hook) L.hook(R, X, props, 'front');
    const prof = L.prof || cyl(L.r);
    revolve(R, 0, 0, L.h, L.h + L.th, prof, L.col);
    if (L.valance) {
      const v = L.valance;
      petalValance(R, 0, 0, v.r, (v.at != null ? v.at : L.h) + 1, v.drop, v.n, { pal: v.pal, neon: v.neon, trim: v.trim || X.P.metal[0] });
    }
    if (L.bal) {
      balustrade(R, X, L.bal.r, L.h + L.th, 'back');
      pending = () => balustrade(R, X, L.bal.r, L.h + L.th, 'front');
    }
    if (L.flags) for (const a of L.flags) props.push({ prop: 'flag', x: L.flagR * Math.cos(a), y: L.flagR * Math.sin(a), h: L.h + L.th, poleH: 7, fw: 6, fh: 4 });
    const rr = (L.valance && L.valance.r) || L.r || 20;
    ledges.push({ x: 0, y: rr, h: L.h }, { x: -rr * 0.7, y: rr * 0.7, h: L.h }, { x: rr * 0.7, y: rr * 0.7, h: L.h });
    hPrev = L.h + L.th;
  }
  fut(hPrev, S.top);
  if (pending) pending();
  const apexH = S.crown(R, X, props, S.top, g);
  pavs('front');
  if (gar) { posts('front'); ledges.push(...lanternGarland(R, 0, 0, gar.r, deck + gar.h, gar.n, 'front', gar.opts)); }
  // Les pièces du BORD (merlons, roue à aubes) sont les plus proches de l'œil.
  if (S.extra) S.extra(R, X, props, 'front', deck);
  outline(R, X.ink);
  const N = nightLayer(R, K.pal.night);
  return { R, N, props, ledges, apex: { x: 0, y: 0, h: apexH }, foot: S.foot || S.RB, stroll: S.stroll || null };
}
// Ring de piliers / pieux du socle (arrière d'abord, puis le centre, puis l'avant).
function pileRing(R, r, n, h0, h1, rad, col) {
  const at = (k) => { const a = (k / n) * TAU; return [r * Math.cos(a), r * Math.sin(a)]; };
  for (let k = 0; k < n; k += 1) { const [x, y] = at(k); if (x + y < 0) revolve(R, x, y, h0, h1, cyl(rad), col); }
  for (let k = 0; k < n; k += 1) { const [x, y] = at(k); if (x + y >= 0) revolve(R, x, y, h0, h1, cyl(rad), col); }
}
// Baies au rez d'un fût : n baies cintrées, rideaux tirés et fente de lumière ;
// sinon `wall(I, h, a, rho)`.
export function baysCol(n, hA, hTop, wall) {
  return (I, h, a, rho) => {
    const s = fm(a / TAU * n + 0.5, 1) - 0.5;
    const half = 0.18, top = hTop + 4 * Math.sqrt(Math.max(0, 1 - (s / half) ** 2));
    if (h >= hA && Math.abs(s) < half && h < top) {
      if (Math.abs(s) < 0.025 || h > top - 3) return [...rgbOf(PAPER[0]), A_WIN];
      return velvetFold(I, a * rho);
    }
    return wall(I, h, a, rho);
  };
}
// Fenêtres en bande : n fenêtres de hA à hB, vitre de l'ère (allumée la nuit).
function windowsCol(X, n, hA, hB, wall) {
  return (I, h, a, rho) => {
    const s = fm(a / TAU * n + 0.5, 1) - 0.5;
    if (Math.abs(s) < 0.2 && h > hA && h < hB) return X.win(0, h, band5(I) <= 2);
    return wall(I, h, a, rho);
  };
}
// Toit conique (chaume, tuile, ardoise) de rayon r à l'égout h0, pointe en h0 + H.
function coneRoof(R, X, r, h0, H, col) {
  revolve(R, 0, 0, h0, h0 + H, taper(h0, h0 + H, r, 0.8), col || ((I, h) => (X.roofL(I + (fm(h, 3) < 1 ? -0.12 : 0)))));
}
const PIECES = { pal: [VELVET, CANVAS] };

// ══ BANDE 1 — LE BOIS : la maison sur pilotis ═══════════════════════════════
//   pont de planches sur pilotis, embarcadère ; rotonde de planches à galerie
//   couverte de chaume, toile rayée tendue aux égouts ; étage, toit conique ;
//   lampions de papier ; Icare : un cerf-volant d'oiseau au bout d'un mât.
function bakeBois(K, g) {
  const W = K.pal.wood;
  // Planches verticales : un joint sombre tous les 4 px.
  const woodL = (I, h, a, rho) => rgbOf(W[Math.min(3, (band5(I) <= 1 ? 0 : band5(I) <= 2 ? 1 : 2) + (fm(a * rho, 4) < 1 ? 1 : 0))]);
  const THATCH = ['#d9b46a', '#b8904c', '#8c6a34', '#5e4422'];
  const thatch = (I, h) => rgbOf(THATCH[Math.min(3, Math.floor(band5(I) * 0.75) + (fm(h, 3) < 1 ? 1 : 0))]);
  // Les étages du plan : le rez (jeux, scène), l'étage (cartes, tickets, BOUDOIR) —
  // ses fenêtres roses où passent des couples, la nuit ; la porte de face.
  const floors = floorsFromPlan(1, [[10, 36], [39, 58]]);
  Object.assign(floors[0], { n: 6, sill: 11 }); Object.assign(floors[1], { n: 8, sill: 43 });
  const futCol = nightLife(withDoor(windowsCol(mats(K), 8, 42, 54, baysCol(6, 10, 26, woodL)), 10, DOOR_RUSTIC), floors, 8);
  return tiered(K, g, {
    RB: 66, H: 190,
    stroll: { r: 48, h: 10, door: [25.6, 17.6, 10], balcony: [8.2, 23.6, 39] },
    base(R) {
      pileRing(R, 58, 14, 0, 7, 2.6, (I, h) => (h < 1.5 ? rgbOf(K.pal.wet[1]) : pick(W, I)));
      revolve(R, 0, 0, 7, 10, cyl(66), (I, h, a, rho, cap) => {
        if (!cap) return rgbOf(W[h < 8 ? 3 : band5(I) <= 1 ? 1 : 2]);
        const y = rho * Math.sin(a), x = rho * Math.cos(a);
        return rgbOf(W[fm(y, 5) < 1 ? 2 : h32(Math.floor(x / 13), Math.floor(y / 5), 7) % 4 === 0 ? 1 : 0]);
      }, 8);
      // Embarcadère de planches vers le sud, sur deux pieux.
      for (const x of [-5, 5]) revolve(R, x, 82, 0, 8, cyl(1.6), (I) => pick(W, I));
      box(R, -7, 7, 60, 84, 7, 9, (f, u, hv, lv) => rgbOf(W[lv ? 1 : 2]), (x, y) => rgbOf(W[fm(y, 4) < 1 ? 2 : 0]));
      return { deck: 10, fut: 10 };
    },
    garland: { r: 58, h: 15, n: 12, opts: { phase: 0.15, sag: 4, step: 5 }, post: W[2] },
    pav: {},   // les jeux sont DEDANS (la coupe) : plus de kiosques sur le pont
    pavM: null,
    pavHook(R, X, game, x, y, h, k) {
      if (game !== 'cartes') return false;
      // Le vingt-et-un sous une TENTE de toile rayée.
      gableStripedPal(R, x - 10 * k, x + 10 * k, y - 7 * k, y + 7 * k, h, 12 * k, [VELVET, CANVAS]);
      return true;
    },
    futR: (h) => (h < 38 ? 22 : h < 60 ? 16 : 11),
    futCol,
    levels: [
      { h: 36, th: 3, r: 34, col: (I, h, a, rho, cap) => (cap ? thatch(I, h) : rgbOf(W[2])),
        posts: { r: 31, n: 12, col: W[1], w: 2 },
        valance: { r: 34.5, drop: 8, n: 20, pal: PIECES.pal } },
      { h: 58, th: 3, r: 24, col: (I, h, a, rho, cap) => (cap ? rgbOf(W[1]) : rgbOf(W[2])),
        valance: { r: 24.5, drop: 6, n: 14, pal: PIECES.pal }, bal: { r: 22 } },
    ],
    top: 70,
    crown(R, X, props, hTop) {
      coneRoof(R, X, 16, hTop, 18, thatch);
      petalValance(R, 0, 0, 16.5, hTop + 1, 5, 12, { pal: PIECES.pal, trim: CANVAS[0] });
      icarePerch(R, X, 0, 0, hTop + 18, props);
      return hTop + 42;
    },
  });
}
// Toit à deux pans rayé (tente) : palette au choix.
export function gableStripedPal(R, x0, x1, y0, y1, h0, H, pals) {
  const cx = (x0 + x1) / 2, ins = [cx, (y0 + y1) / 2, h0 + H * 0.3];
  const tex = (I, px) => pick((Math.floor(px / 3) & 1) ? pals[1] : pals[0], I);
  facet(R, [[x0, y0, h0], [x0, y1, h0], [cx, y1, h0 + H], [cx, y0, h0 + H]], ins, tex);
  facet(R, [[x1, y0, h0], [x1, y1, h0], [cx, y1, h0 + H], [cx, y0, h0 + H]], ins, tex);
  facet(R, [[x0, y1, h0], [x1, y1, h0], [cx, y1, h0 + H]], ins, (I) => pick(pals[1], I - 0.15));
}

// ══ BANDE 2 — LA PIERRE TAILLÉE : le pavillon au portique ════════════════════
//   îlot maçonné et podium, braseros ; rotonde de pierre à PORTIQUE (quatre
//   colonnes, fronton) ; terrasse à balustrade de bronze et vélum rayé ; étage à
//   fenêtres ; toit conique de tuiles, Icare : perchoir et ailes de bronze.
function bakePierre(K, g) {
  return tiered(K, g, (X) => {
  const floors = floorsFromPlan(2, [[13, 50], [54, 74]]);
  Object.assign(floors[0], { n: 8, sill: 14 }); Object.assign(floors[1], { n: 12, sill: 58 });
  const futCol = nightLife(withDoor(windowsCol(X, 12, 58, 68, baysCol(8, 13, 32, X.stoneL)), 13, DOOR_WOOD), floors, 12);
  return {
    RB: 72, H: 210,
    stroll: { r: 56, h: 8, door: [28.4, 20.4, 8], balcony: [9.2, 26.4, 54] },
    base(R, X, props) {
      revolve(R, 0, 0, 0, 8, cyl(72), (I, h, a, rho, cap) => {
        if (cap) return X.marble(1);
        if (h < 2) return rgbOf(K.pal.wet[h < 1 ? 1 : 0]);
        return X.stoneL(I, h, a, rho);
      });
      terrace(R, X, 70, 6, 8, [52, 58, 31]);
      stairs(R, X, -11, 11, 78, 13, 0, 8);
      // Podium du fût.
      revolve(R, 0, 0, 8, 13, cyl(42), (I, h, a, rho, cap) => (cap ? X.marble(1) : h >= 12 ? X.marble(0) : X.stoneL(I, h, a, rho)));
      for (const [x, y] of [[-40, 40], [40, 40]]) {
        revolve(R, x * 0.8, y * 0.8, 8, 15, taper(8, 15, 2.2, 3.4), X.metalL);
        props.push({ prop: 'flame', x: x * 0.8, y: y * 0.8, h: 15 });
      }
      return { deck: 8, fut: 13 };
    },
    garland: { r: 62, h: 15, n: 12, opts: { phase: 0.15 } },
    pav: {},   // les jeux sont DEDANS
    pavM: null,
    futR: (h) => (h < 52 ? 26 : h < 74 ? 20 : 14),
    futCol,
    levels: [
      { h: 50, th: 4, r: 36, col: (I, h, a, rho, cap) => (cap ? X.marble(1) : h >= 53 ? X.marble(0) : X.stoneL(I, h, a, rho)),
        hook(R, X) {
          // LE PORTIQUE : quatre colonnes, architrave, fronton — face au sud.
          for (const x of [-13, -4.5, 4.5, 13]) {
            revolve(R, x, 33, 13, 15, cyl(3), X.marbleL);
            revolve(R, x, 33, 15, 41, cyl(2.2), X.marbleL);
            revolve(R, x, 33, 41, 43, cyl(2.8), X.marbleL);
          }
          box(R, -17, 17, 22, 36, 43, 47, (f, u, hv) => (hv === 45 ? X.metal(1) : X.marble(f === 'S' ? 0 : 2)), () => X.marble(1));
          facet(R, [[-17, 36, 47], [17, 36, 47], [0, 36, 53]], [0, 22, 47], (I) => X.marbleL(I));
          facet(R, [[-17, 22, 47], [-17, 36, 47], [0, 36, 53], [0, 22, 53]], [0, 29, 46], X.roofL);
          facet(R, [[17, 22, 47], [17, 36, 47], [0, 36, 53], [0, 22, 53]], [0, 29, 46], X.roofL);
        },
        valance: { r: 36.5, drop: 8, n: 22, pal: PIECES.pal }, bal: { r: 34 } },
      { h: 74, th: 3, r: 25, col: (I, h, a, rho, cap) => (cap ? X.marble(1) : X.marble(band5(I) <= 1 ? 0 : 2)),
        valance: { r: 25.5, drop: 6, n: 16, pal: PIECES.pal } },
    ],
    top: 88,
    crown(R, X, props, hTop) {
      coneRoof(R, X, 19, hTop, 20);
      petalValance(R, 0, 0, 19.5, hTop + 1, 5, 14, { pal: PIECES.pal, trim: X.P.metal[0] });
      icarePerch(R, X, 0, 0, hTop + 20, props);
      return hTop + 44;
    },
  };
  });
}

// ══ BANDE 3 — LA COURONNE : le palais au grand masque ═══════════════════════
//   îlot fortifié à merlons ; donjon rond au GRAND MASQUE d'or (le tirage C choisi
//   par Raph en août) ; toits d'ardoise EN ÉTAGES, chacun bordé de pétales et de
//   bannières ; flèche dorée ; Icare : ailes d'or au faîte.
function bakeCouronne(K, g) {
  const slate = (I, h) => pick(['#7d8596', '#5f6676', '#474d5b', '#323642'], I + (fm(h, 3) < 1 ? -0.1 : 0));
  return tiered(K, g, (X) => {
  const bays = baysCol(8, 10, 30, X.stoneL);
  // Les étages du plan : le rez, l'étage noble (cartes, scène : des danseuses en ombres
  // chinoises), le haut (tickets, BOUDOIR aux vitres roses) — avec leurs fenêtres.
  const floors = floorsFromPlan(3, [[10, 62], [70, 94], [101, 118]]);
  Object.assign(floors[0], { n: 8, sill: 11 }); Object.assign(floors[1], { n: 10, sill: 77 }); Object.assign(floors[2], { n: 8, sill: 105 });
  const stone = (I, h, a, rho) => {
    const s = fm(a / TAU * 10 + 0.5, 1) - 0.5;
    if (Math.abs(s) < 0.035 && fm(h, 22) > 9 && fm(h, 22) < 16) return X.dark;          // meurtrières
    return bays(I, h, a, rho);
  };
  const futCol = nightLife(withDoor(windowsCol(X, 10, 76, 89, windowsCol(X, 8, 104, 115, stone)), 10, DOOR_WOOD), floors, 8);
  return {
    RB: 78, H: 260,
    stroll: { r: 62, h: 10, door: [29.8, 21.8, 10], balcony: [10.2, 29.3, 70] },
    base(R, X) {
      revolve(R, 0, 0, 0, 10, cyl(78), (I, h, a, rho, cap) => {
        if (cap) return X.marble(1);
        if (h < 2) return rgbOf(K.pal.wet[h < 1 ? 1 : 0]);
        return X.stoneL(I, h, a, rho);
      });
      terrace(R, X, 74, 8, 10, [56, 63, 37]);
      stairs(R, X, -11, 11, 84, 14, 0, 10);
      return { deck: 10, fut: 10 };
    },
    garland: { r: 66, h: 16, n: 14, opts: { phase: 0.11 } },
    extra(R, X, props, part) {
      // Merlons du parapet, sur le pourtour (on laisse l'escalier libre).
      const n = 30;
      for (let k = 0; k < n; k += 1) {
        const a = (k / n) * TAU, x = 75 * Math.cos(a), y = 75 * Math.sin(a);
        if ((part === 'back') !== (x + y < 0) || (Math.abs(x) < 15 && y > 0)) continue;
        box(R, x - 2, x + 2, y - 2, y + 2, 10, 15, X.plain(0), X.top(1));
      }
    },
    pav: {},   // les jeux sont DEDANS
    pavHook(R, X, game, x, y, h, k) {
      if (game !== 'cartes') return false;
      // Le vingt-et-un dans un PAVILLON DE TOURNOI : tambour de toile, cône rayé.
      revolve(R, x, y, h, h + 12 * k, cyl(8 * k), (I, hh, a) => pick((Math.floor(fm(a / TAU * 12, 12)) & 1) ? CANVAS : VELVET, I));
      stripedCone(R, X, x, y, 10 * k, h + 12 * k, 9 * k, 12, 3);
      return true;
    },
    futR: (h) => (h < 62 ? 28 : h < 94 ? 22 : 16),
    futCol,
    levels: [
      { h: 62, th: 8, prof: taper(62, 70, 40, 29), col: (I, h) => slate(I, h),
        hook(R, X) {
          // LE GRAND MASQUE, en fronton sur la face qui regarde l'œil.
          vdiscMask(R, X, 23, 23, 40, 13);
        },
        valance: { r: 40.5, drop: 8, n: 24, pal: [VELVET, ['#f0cf6a', '#d2a53e', '#9c7524', '#6d4c25', '#4a3418']], at: 62 },
        flags: [Math.PI * 0.15, Math.PI * 0.6, Math.PI * 1.1, Math.PI * 1.6], flagR: 38 },
      { h: 94, th: 7, prof: taper(94, 101, 32, 23), col: (I, h) => slate(I, h),
        valance: { r: 32.5, drop: 7, n: 18, pal: [VELVET, ['#f0cf6a', '#d2a53e', '#9c7524', '#6d4c25', '#4a3418']], at: 94 },
        flags: [Math.PI * 0.35, Math.PI * 1.35], flagR: 30 },
    ],
    top: 118,
    crown(R, X, props, hTop) {
      revolve(R, 0, 0, hTop, hTop + 7, taper(hTop, hTop + 7, 25, 17), slate);
      petalValance(R, 0, 0, 25.5, hTop + 1, 6, 14, { pal: [VELVET, ['#f0cf6a', '#d2a53e', '#9c7524', '#6d4c25', '#4a3418']] });
      revolve(R, 0, 0, hTop + 7, hTop + 38, taper(hTop + 7, hTop + 38, 15, 0.6), slate);
      line(R, [0, 0, hTop + 38], [0, 0, hTop + 44], X.P.metal[0], 2);
      icarePerch(R, X, 0, 0, hTop + 40, props);
      return hTop + 66;
    },
  };
  });
}
// LE MASQUE de théâtre en or, dressé face à l'œil (centre x, y, h ; rayon r) :
// front et pommettes éclairés, yeux en amande percés, bouche rieuse, plumes rouges.
export function vdiscMask(R, X, cx, cy, hc, r) {
  const G = X.P.metal;
  const S2 = Math.SQRT2;
  const c = { X: cx - cy, Y: (cx + cy) / 2 - hc };
  for (let j = Math.floor(c.Y - r * S2 - R.oy) - 1; j <= Math.ceil(c.Y + r * S2 - R.oy) + 1; j += 1) {
    for (let i = Math.floor(c.X - r * S2 - R.ox) - 1; i <= Math.ceil(c.X + r * S2 - R.ox) + 1; i += 1) {
      const s = (R.ox + i + 0.5 - c.X) / (S2 * r), v = -(R.oy + j + 0.5 - c.Y) / (S2 * r);
      // Silhouette : un ovale un peu plus large en haut (front), menton pointu.
      const e = (s * s) / (0.92 + 0.18 * v) ** 2 + (v * v) / (v < 0 ? 0.9 : 1);
      if (e > 1) continue;
      const eye = ((Math.abs(s) - 0.36) ** 2) / 0.03 + ((v - 0.16) ** 2) / 0.006 < 1;
      const mouth = v < -0.28 && v > -0.42 - 0.1 * (1 - s * s) && Math.abs(s) < 0.36 && v > -0.5 + 0.55 * s * s;
      let col;
      if (eye) col = rgbOf('#1c0e10');
      else if (mouth) col = rgbOf(VELVET[3]);
      else if (e > 0.82) col = rgbOf(G[2]);
      else col = rgbOf(G[(v > 0.35 || (Math.abs(s) > 0.4 && v < 0 && v > -0.25)) ? 0 : 1]);
      put(R, i, j, col);
    }
  }
  // Plumes : trois traits rouges qui jaillissent du front.
  for (const [dx, dh] of [[-4, 12], [0, 15], [4, 12]]) line(R, [cx - dx / 2, cy + dx / 2, hc + r * 0.9], [cx - dx, cy + dx, hc + r * 0.9 + dh], VELVET[1]);
}

// ══ BANDE 5 — LA FONTE : la maison close Belle Époque ════════════════════════
//   « Un plan, deux vues » (2026-10-03) : les ÉTAGES sont ceux de la coupe
//   (plaisirsPlan.js) — salle de jeux au rez, CABARET au premier, salons
//   particuliers sous la verrière —, leurs diamètres suivent ses largeurs. Ponton de
//   fonte sur colonnettes et ROUE À AUBES (le bateau-salon) ; rotondes de fonte et
//   de verre aux rideaux de velours ; la nuit, des danseuses passent en ombres
//   chinoises aux fenêtres du cabaret, des couples à celles du boudoir, dont les
//   vitres sont ROSES ; lanternes ROUGES ; le MOULIN rouge sur la terrasse ; une
//   marquise lumineuse à l'entrée ; Icare : le BALLON captif.
// Ombre chinoise sur une baie (u : écart au milieu de la baie en px, v : hauteur
// au-dessus de l'appui) — une danseuse jambe levée, ou un couple enlacé.
function dancerAt(u, v) {
  if (v >= 9 && v <= 11) return Math.abs(u) <= 1 && !(v === 11 && Math.abs(u) === 1);   // tête
  if (v >= 5 && v <= 8) return u >= -1 && u <= 1;                                         // buste
  if (v >= 3 && v <= 4) return u >= -2 && u <= 2;                                         // jupons
  if (v >= 0 && v <= 2) return u === -1 || u === 2 + (2 - v);                             // jambe levée
  return false;
}
function coupleAt(u, v) {
  if (v >= 8 && v <= 10) return (u >= -3 && u <= -1) || (u >= 1 && u <= 3 && v >= 9);    // têtes (lui plus grand)
  if (v >= 1 && v <= 7) return (u >= -3 && u <= -1) || (u >= 1 && u <= 3) || (u === 0 && v >= 4 && v <= 6);
  return false;
}
// ── LA VIE DES ÉTAGES, vue du dehors (déroulé du 2026-10-03) ─────────────────
// « Un plan, deux vues » : chaque âge compte dehors les étages de sa coupe. Ces aides
// donnent aux fenêtres ce qui se passe dedans, quel que soit l'âge :
//   · le CABARET (la scène) : la nuit, une danseuse jambe levée en ombre chinoise ;
//   · le BOUDOIR : vitres roses, et la nuit un couple enlacé derrière une sur deux ;
//   · la PORTE d'entrée, de face, entrebâillée sur la lumière du dedans.
// `floors` : [{ h0, h1, rooms }] (altitudes du plancher et du plafond de chaque étage,
// les lieux du plan) ; `n` : baies par tour de rotonde.
const kindOf = (rooms) => (rooms.includes('boudoir') ? 'boudoir' : rooms.includes('scene') ? 'cabaret' : 'jeux');
export function floorsFromPlan(band, spans) {
  return plaisirsPlan(band).levels.map((rooms, i) => ({ rooms, kind: kindOf(rooms), h0: spans[i][0], h1: spans[i][1] }));
}
// Enveloppe la couleur d'une rotonde : les pixels de VITRE (A_WIN) de l'étage du
// cabaret et du boudoir reçoivent leurs ombres chinoises ; le boudoir rosit.
export function nightLife(col, floors, n) {
  const PINK = ['#ffc2d6', '#ff9ab8'];
  return (I, h, a, rho, cap) => {
    const c = col(I, h, a, rho, cap);
    if (!c || c.length < 4 || c[3] !== A_WIN) return c;
    const f = floors.find((ff) => h >= ff.h0 && h < ff.h1);
    if (!f || f.kind === 'jeux') return c;
    const nn = f.n || n, s = fm(a / TAU * nn + 0.5, 1) - 0.5, bay = Math.floor(fm(a / TAU * nn + 0.5, nn));
    const u = Math.round(s * TAU * rho / nn), v = Math.floor(h - (f.sill != null ? f.sill : f.h0 + 3));
    if (f.kind === 'boudoir') {
      if (bay % 2 === 0 && coupleAt(u, v)) return [...rgbOf(PINK[1]), A_SIL];
      return lit(PINK[v > (f.h1 - f.h0) - 9 ? 0 : 1]);
    }
    if (bay % 3 === 1 && dancerAt(u * (bay & 2 ? -1 : 1), v)) return [c[0], c[1], c[2], A_SIL];
    return c;
  };
}
// LA PORTE de face (la baie qui regarde l'œil, angle π/4) : chambranle, deux battants
// à panneaux, poignées, imposte allumée, et le trait de lumière entre les battants.
// `m` : { frame, frameDark, wood, panel, dark, handle } (la matière de l'âge).
export function doorPx(u, hh, m) {
  const au = Math.abs(u);
  if (au > 6 || hh > 17 || hh < 1) return null;
  if (au >= 5 && hh <= 16) return rgbOf(hh === 16 ? m.handle : au === 6 ? m.frameDark : m.frame);
  if (hh > 12 && hh <= 16) {
    const d2 = u * u + (hh - 12) * (hh - 12) * 1.6;
    if (d2 > 22) return rgbOf(m.frameDark);
    if (u === 0 || (au === Math.round((hh - 12) * 0.9) + 1 && hh < 16)) return rgbOf(m.dark);
    return lit(hh > 14 ? '#fff0c0' : '#ffd890');
  }
  if (hh > 12) return rgbOf(m.frameDark);
  if (u === 0) return lit('#ffc870');
  if (au === 1 && hh === 6) return rgbOf(m.handle);
  const panel = au >= 2 && au <= 3 && ((hh >= 2 && hh <= 4) || (hh >= 7 && hh <= 10));
  return rgbOf(panel ? m.panel : hh === 11 ? m.dark : m.wood);
}
// Enveloppe une couleur de rotonde : la porte, au rez, dans l'axe qui regarde l'œil.
export function withDoor(col, h0, m) {
  return (I, h, a, rho, cap) => {
    if (!cap && h >= h0 && h < h0 + 18) {
      const da = fm(a - Math.PI / 4 + Math.PI, TAU) - Math.PI;
      if (Math.abs(da) * rho < 7.5) { const d = doorPx(Math.round(da * rho), Math.floor(h - h0), m); if (d) return d; }
    }
    return col(I, h, a, rho, cap);
  };
}
const DOOR_WOOD = { frame: '#d2a53e', frameDark: '#8a6420', wood: '#5a2418', panel: '#6e3020', dark: '#3a1610', handle: '#f0cf6a' };
const DOOR_NEON = { frame: '#e6e9ed', frameDark: '#9aa2ad', wood: '#2a2a34', panel: '#3e3e4c', dark: '#16161c', handle: '#ff8cc6' };
const DOOR_CRYSTAL = { frame: '#eef1f4', frameDark: '#9aa4b2', wood: '#3a3a5a', panel: '#5a5a80', dark: '#1e1e30', handle: '#ffffff' };
const DOOR_RUSTIC = { frame: '#8a6440', frameDark: '#5a3e24', wood: '#6e4a2a', panel: '#86603a', dark: '#3a2614', handle: '#c8a060' };
function bakeFonte(K, g) {
  const plan = plaisirsPlan(5);
  const iron = ['#5a5f6a', '#3f434c', '#2c2f36', '#1e2026'];
  const ironL = (I) => pick(iron, I);
  const PINKG = ['#ffc2d6', '#ff9ab8', '#e0708f'];
  // LES ÉTAGES DU PLAN : rayon = largeur de coupe / 6, hauteur d'étage 24 px.
  const deck = 11, FH = 24, TH = 3;
  const floors = plan.levels.map((rooms, i) => {
    const h0 = deck + i * (FH + TH);
    return { i, rooms, r: Math.round(plan.widths[i] / 6), h0, h1: h0 + FH };
  });
  const fOf = (h) => floors[Math.max(0, Math.min(floors.length - 1, Math.floor((h - deck) / (FH + TH))))];
  const kind = (f) => (f.rooms.includes('boudoir') ? 'boudoir' : f.rooms.includes('scene') ? 'cabaret' : 'jeux');
  // Une rotonde : pilastres de fonte, baies vitrées entre deux rideaux de velours.
  const N_BAYS = 12;
  // LA PORTE (retour de Raph : « la porte fait cheap ») : dans la baie de face du rez,
  // une double porte d'acajou à panneaux et poignées de laiton, chambranle doré et une
  // IMPOSTE en éventail allumée ; l'enseigne est sur l'AUVENT (un auvent cache
  // toujours le mur juste au-dessous de lui : une enseigne murale y disparaissait).
  const door = (I, u, hh) => {
    const au = Math.abs(u);
    if (au > 6 || hh > 17) return null;
    if (au >= 5 && hh <= 16) return rgbOf(hh === 16 ? '#f0cf6a' : au === 6 ? '#8a6420' : '#d2a53e');   // chambranle
    if (hh > 12 && hh <= 16) {                                  // l'imposte en éventail
      const d2 = u * u + (hh - 12) * (hh - 12) * 1.6;
      if (d2 > 22) return rgbOf('#8a6420');
      if (u === 0 || (au === Math.round((hh - 12) * 0.9) + 1 && hh < 16)) return rgbOf('#2c2f36');
      return lit(hh > 14 ? '#fff0c0' : '#ffd890');
    }
    if (hh > 12) return rgbOf('#8a6420');
    if (u === 0) return lit('#ffc870');                         // la porte entrebâillée : la lumière du dedans
    if (au === 1 && hh === 6) return rgbOf('#f0cf6a');         // les poignées
    const panel = au >= 2 && au <= 3 && ((hh >= 2 && hh <= 4) || (hh >= 7 && hh <= 10));
    return rgbOf(panel ? '#6e3020' : hh === 11 ? '#3a1610' : '#5a2418');
  };
  const wall = (I, h, a, rho) => {
    const f = fOf(h), hh = h - f.h0, kd = kind(f);
    // s : position dans la baie (0 au milieu) ; les pilastres aux bords, puis les rideaux.
    const s = fm(a / TAU * N_BAYS, 1) - 0.5, bay = Math.floor(fm(a / TAU * N_BAYS, N_BAYS)), edge = 0.5 - Math.abs(s);
    if (f.i === 0 && bay === 1 && hh >= 1) { const d = door(I, Math.round(s * TAU * rho / N_BAYS), Math.floor(hh)); if (d) return d; }
    if (hh < 2 || hh > FH - 2) return ironL(I - 0.1);
    if (edge < 0.09 || hh < 3 || hh > FH - 3) return ironL(I);
    if (edge < 0.2) return velvetFold(I, a * rho);
    const u = Math.round(s * TAU * rho / N_BAYS), v = Math.floor(hh - 3);
    if (kd === 'boudoir') {
      // Les vitres ROSES du boudoir ; la nuit, un couple derrière une sur deux.
      if (bay % 2 === 0 && coupleAt(u, v)) return [...rgbOf(PINKG[1]), A_SIL];
      return lit(PINKG[v > FH - 9 ? 0 : 1]);
    }
    if (kd === 'cabaret' && bay % 3 === 1 && dancerAt(u * (bay & 2 ? -1 : 1), v)) return [...pick(K.pal.glassRamp, I).slice(0, 3), A_SIL];
    return [...pick(K.pal.glassRamp, I).slice(0, 3), A_WIN];
  };
  // LE MOULIN ROUGE, sur le pont à l'avant-droite de l'entrée.
  const mill = (R, part) => {
    const r = 56, a = 0.32, x = r * Math.cos(a), y = r * Math.sin(a), h = deck;
    if (part !== 'front') return;
    revolve(R, x, y, h, h + 17, taper(h, h + 17, 5.5, 0.8), (I, hh, aa) => (hh > h + 6 && hh < h + 10 && fm(aa / TAU * 4, 1) < 0.18 ? lit('#ffe9a0') : pick(VELVET, I)));
    revolve(R, x, y, h + 17, h + 23, taper(h + 17, h + 23, 5, 0.15), (I) => pick(['#3a2a22', '#2a1e18', '#1a1210'], I));
    // Les quatre ailes, dans le plan de la façade (face à l'œil).
    const hub = [x + 5, y + 5, h + 16];
    for (const [du, dv] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) {
      const tip = [hub[0] + du * 9, hub[1] - du * 9, hub[2] + dv * 11];
      line(R, hub, tip, '#2a1e18');
      // L'aile, bordée d'ampoules : elle s'allume la nuit, comme celles de Montmartre.
      line(R, [hub[0] + du * 1.5, hub[1] - du * 1.5 + 0.5, hub[2] + dv * 2], [tip[0] + 0.7, tip[1] + 0.7, tip[2]], lit('#fff2c8'));
    }
    line(R, hub, [hub[0] + 0.7, hub[1] - 0.7, hub[2]], '#f0cf6a');
  };
  return tiered(K, g, {
    RB: 78, H: 230, foot: 82,
    base(R, X) {
      pileRing(R, 70, 16, 0, 8, 2, (I, h) => (h < 1.5 ? rgbOf(K.pal.wet[1]) : ironL(I)));
      revolve(R, 0, 0, 8, deck, cyl(78), (I, h, a, rho, cap) => {
        if (!cap) return fm(a * rho / 5, 1) < 0.2 ? rgbOf(iron[0]) : ironL(I);
        // Le TAPIS ROUGE de l'entrée, des marches jusqu'à la marquise.
        if (Math.abs(rho * Math.cos(a) - rho * Math.sin(a)) < 6 && rho * Math.cos(a) + rho * Math.sin(a) > 40) return rgbOf(VELVET[(fm(rho, 4) < 1) ? 2 : 1]);
        if (rho > 60 && rho < 66) { const k = Math.floor(fm(a / TAU * 37, 37)); return rgbOf(k === 0 ? '#3f7a52' : (k & 1) ? VELVET[1] : '#2a2a30'); }
        const y = rho * Math.sin(a);
        return rgbOf(K.pal.wood[fm(y, 5) < 1 ? 2 : 0]);
      });
      stairs(R, X, -11, 11, 86, 13, 0, deck);
      return { deck, fut: deck };
    },
    // Les LANTERNES ROUGES.
    garland: { r: 70, h: 16, n: 14, opts: { phase: 0.11, cols: ['#ff6a5a', '#e8483a', '#7a2333'], wire: '#2c2f36' }, post: '#2c2f36' },
    extra(R, X, props, part) {
      if (part !== 'front') return;
      mill(R, part);
      // LA MARQUISE de l'entrée, un AUVENT DE THÉÂTRE : verrière ambrée (allumée la
      // nuit), bandeau cramoisi à lettres d'or entre deux rangs d'ampoules, deux
      // colonnettes ; de part et d'autre du tapis rouge, deux CANDÉLABRES à globes.
      const r0 = floors[0].r, e = r0 * 0.707, W = [e + 0.5, e + 0.5], hc = deck + 22;
      const o = [0.707, 0.707], t = [0.707, -0.707];
      const at = (u, d, h) => [W[0] + t[0] * u + o[0] * d, W[1] + t[1] * u + o[1] * d, h];
      const AW = 9, AD = 7, FT = 4;
      // La verrière (le dessus), inclinée vers la rue.
      facet(R, [at(-AW, 0, hc + 1), at(AW, 0, hc + 1), at(AW, AD, hc), at(-AW, AD, hc)], at(0, AD / 2, hc - 6),
        (I, px, py) => (fm((px - py) * 0.707, 3) < 0.7 ? rgbOf(iron[1]) : [...rgbOf(fm((px - py) * 0.707, 6) < 3 ? '#f2c470' : '#e0a850'), A_GLOW]));
      // Le BANDEAU, face à la rue : ampoules, lettres d'or, ampoules.
      facet(R, [at(-AW, AD, hc), at(AW, AD, hc), at(AW, AD, hc - FT), at(-AW, AD, hc - FT)], at(0, AD - 3, hc - 2), (I, px, py, ph) => {
        const u = Math.round((px - py) * 0.707), row = Math.round(hc - ph);
        if (row <= 0 || row >= FT) return fm(u, 2) < 1 ? lit('#fff2c8') : rgbOf('#2c2f36');
        // Le rang du milieu : des traits d'or, comme des lettres lues de loin.
        return row === 2 && fm(u, 3) < 2 && Math.abs(u) < AW - 1 ? lit('#ffd36a') : rgbOf(VELVET[2]);
      });
      // Les flancs et les colonnettes d'angle.
      for (const sg of [-1, 1]) facet(R, [at(sg * AW, 0, hc + 1), at(sg * AW, AD, hc), at(sg * AW, AD, hc - FT), at(sg * AW, 0, hc - FT + 1)], at(sg * (AW - 3), AD / 2, hc - 2), () => rgbOf(VELVET[3]));
      for (const sg of [-1, 1]) { const q = at(sg * (AW - 1), AD - 1, 0); line(R, [q[0], q[1], deck], [q[0], q[1], hc - FT], iron[2]); }
      for (const sg of [-1, 1]) {
        const x = W[0] + o[0] * 22 + sg * t[0] * 9, y = W[1] + o[1] * 22 + sg * t[1] * 9;
        line(R, [x, y, deck], [x, y, deck + 14], iron[2]); line(R, [x - 0.5, y - 0.5, deck], [x - 0.5, y - 0.5, deck + 2], iron[1]);
        line(R, [x - 2, y + 2, deck + 13], [x + 2, y - 2, deck + 13], iron[2]);
        for (const [dx, dh] of [[-2, 14], [0, 16], [2, 14]]) bulbDot(R, x + dx * 0.707, y - dx * 0.707, deck + dh, '#fff2c8');
        props.push({ prop: 'glow', x, y, h: deck + 15 });
      }
      // LA ROUE À AUBES, à l'est : jante, rayons, pales, tambour cramoisi.
      const cx = 80, cy = -6, ch = 12, rr = 15;
      ring3d(R, [cx, cy, ch], rr, 2, [0, 1, 0], [0, 0, 1], (I) => pick(iron, I));
      for (let k = 0; k < 10; k += 1) {
        const a = (k / 10) * TAU, y = cy + rr * Math.cos(a), h = ch + rr * Math.sin(a);
        if (h < 0.5) continue;
        line(R, [cx, cy, ch], [cx, y, h], iron[1]);
        box(R, cx - 3, cx + 3, y - 0.8, y + 0.8, Math.max(0, h - 1.5), h + 1.5, (f, u, hv, lv) => rgbOf(VELVET[lv ? 1 : 2]), () => rgbOf(VELVET[0]));
      }
      ring3d(R, [cx + 1, cy, ch], rr + 3, 3, [0, 1, 0], [0, 0, 1], (I) => pick(VELVET, I), 'front');
    },
    pav: {},
    // Où se tiennent les FILLES DE LA MAISON sur la carte (isoPlaisirs.js) : le tour
    // du ponton, l'entrée sous la marquise, le balcon du premier.
    stroll: (() => {
      const e = floors[0].r * 0.707, rb = (floors[0].r + 3 + floors[1].r) / 2, ab = Math.PI / 4 + 0.45;
      return { r: 64, h: deck, door: [e + 13, e + 1, deck], balcony: [rb * Math.cos(ab), rb * Math.sin(ab), floors[0].h1 + TH] };
    })(),
    futR: (h) => fOf(h).r,
    futCol: wall,
    // Un PLATEAU entre deux étages : la dalle, son dais de pétales, la balustrade
    // de la terrasse quand l'étage du dessus est plus étroit.
    levels: floors.map((f, i) => ({
      h: f.h1, th: TH, r: f.r + 3,
      col: (I, h, a, rho, cap) => (cap ? rgbOf(K.pal.wood[fm(rho, 4) < 1 ? 1 : 0]) : ironL(I)),
      valance: { r: f.r + 3.5, drop: i === floors.length - 1 ? 5 : 7, n: Math.round(f.r * 0.6), pal: PIECES.pal },
      ...(i < floors.length - 1 ? { bal: { r: f.r + 2 } } : {}),
    })),
    top: floors[floors.length - 1].h1 + TH,
    crown(R, X, props, hTop, gg) {
      const rd = floors[floors.length - 1].r - 3;
      // La verrière : du VERRE le jour (comme en coupe), allumée la nuit.
      revolve(R, 0, 0, hTop, hTop + 18, domeProf(hTop, rd, 18), (I, h, a) => (fm(a / TAU * 12, 1) < 0.14 ? ironL(I) : [...pick(K.pal.glassRamp, I).slice(0, 3), A_GLOW]));
      revolve(R, 0, 0, hTop + 17, hTop + 23, cyl(3), ironL);
      // Les halos des lanternes rouges du pont.
      for (const a of [0.3, 1.9, 3.5, 5.1]) props.push({ prop: 'glow', x: 70 * Math.cos(a), y: 70 * Math.sin(a), h: deck + 14 });
      if (!gg.icare) return hTop + 26;
      // ICARE : le BALLON captif, amarré au lanterneau par deux filins.
      // (assez haut pour que la Fonte dépasse le Marbre : le lieu ne baisse jamais)
      const bh = hTop + 80, br = 13;
      line(R, [0, 0, hTop + 23], [-3, 3, bh - br - 6], '#3a2a22');
      line(R, [0, 0, hTop + 23], [3, -3, bh - br - 6], '#3a2a22');
      box(R, -3, 3, -3, 3, bh - br - 9, bh - br - 4, (f, u, hv, lv) => rgbOf(K.pal.wood[lv ? 1 : 2]), () => rgbOf(K.pal.wood[0]));
      revolve(R, 0, 0, bh - br, bh + br, (h) => Math.sqrt(Math.max(0, br * br - (h - bh) * (h - bh))) * (h < bh ? 0.75 + 0.25 * (h - bh + br) / br : 1),
        (I, h, a) => pick((Math.floor(fm(a / TAU * 12, 12)) & 1) ? CANVAS : VELVET, I));
      return bh + br + 2;
    },
  });
}

// ══ BANDES 7 à 9 — LES ÂGES COSMIQUES : les plateaux en lévitation ═══════════
//   un disque qui FLOTTE au-dessus de l'eau (l'ombre et le reflet disent la
//   hauteur), une colonne de lumière de l'ère, des plateaux-pétales détachés qui
//   flottent autour d'elle, reliés par des PASSERELLES DE LUMIÈRE ; des nacelles de
//   cristal pour les jeux ; Icare : des ailes de lumière au sommet. Chaque âge a
//   sa lumière (jade, or, améthyste — wonderKits) et grandit d'un plateau.
function bakeCosmique(K, g) {
  const X = mats(K), props = [], ledges = [];
  const b = K.band, glow = K.pal.glow, GR = K.pal.glassRamp;
  const RB = 84, H = 470;
  const R = frameOf(true, [[-RB - 22, RB + 22, -RB - 22, RB + 22, -2, H]]);
  const h0 = 34;
  const white = (I) => pick(['#f4f6f8', '#dfe4ea', '#c4ccd6', '#9aa4b2'], I);
  // Le pied de lumière (là où le disque « tient » sur l'eau) et le disque flottant.
  revolve(R, 0, 0, 0, h0 - 6, taper(0, h0 - 6, 5, 9), () => lit(GR[1]));
  revolve(R, 0, 0, h0 - 6, h0, taper(h0 - 6, h0, RB - 14, RB), (I, h, a, rho, cap) => (cap ? null : lit(h < h0 - 4 ? glow : GR[1])));
  revolve(R, 0, 0, h0, h0 + 3, cyl(RB), (I, h, a, rho, cap) => {
    if (!cap) return h < h0 + 1.5 ? lit(glow) : white(I);
    if (rho > 58 && rho < 65) { const k = Math.floor(fm(a / TAU * 37, 37)); return k === 0 ? lit(glow) : rgbOf((k & 1) ? VELVET[1] : '#2a2a30'); }
    return rgbOf(fm(rho, 9) < 0.8 ? '#cfd6de' : '#eef1f4');
  });
  // Rampe de lumière jusqu'à l'eau, au sud.
  for (let k = 0; k < 9; k += 1) box(R, -9, 9, RB + 2 + k * 3, RB + 5 + k * 3, h0 - 3 - k * 3.6, h0 - 2 - k * 3.6, () => lit(GR[k & 1 ? 1 : 0]), () => lit(GR[0]));
  // (Les jeux sont DEDANS, dans les salons de cristal : plus de nacelles sur le disque.)
  lanternGarland(R, 0, 0, RB - 10, h0 + 18, 14, 'back', { phase: 0.1, cols: [glow, GR[0], GR[2]], wire: GR[2], sag: 6 });
  // La colonne de lumière, par tronçons ; les plateaux flottants entre deux.
  const col = (I, h, a) => (fm(h, 14) < 1.2 ? lit(glow) : fm(a / TAU * 8, 1) < 0.12 ? white(I) : [...pick(GR, I).slice(0, 3), A_WIN]);
  const colR = (h) => 10 + 2 * Math.sin(h / 23);
  const fut = (hA, hB) => { if (hB > hA) revolve(R, 0, 0, hA, hB, colR, col); };
  // LES ÉTAGES DE LA COUPE (« un plan, deux vues ») : un salon de cristal au rez, sur le
  // disque, puis un par plateau flottant — la scène (danseuses en ombres chinoises), le
  // boudoir au sommet (vitres roses). La colonne de lumière, c'est la cage.
  const lv = plaisirsPlan(b).levels, widths = plaisirsPlan(b).widths, FH = 22;
  const salonCol = (hA, hB, rooms, door) => {
    const fl = [{ h0: hA, h1: hB, rooms, kind: rooms.includes('boudoir') ? 'boudoir' : rooms.includes('scene') ? 'cabaret' : 'jeux', n: 12, sill: hA + 3 }];
    const base = (I, h, a2) => {
      if (h > hB - 2 || h < hA + 1.5) return lit(glow);                      // anneaux de lumière
      if (fm(a2 / TAU * 12 + 0.5, 1) < 0.1) return white(I);
      return [...pick(GR, I).slice(0, 3), A_WIN];
    };
    const c = nightLife(base, fl, 12);
    return door ? withDoor(c, hA, DOOR_CRYSTAL) : c;
  };
  const salon = (cx, cy, r, hA, rooms, door) => revolve(R, cx, cy, hA, hA + FH, cyl(r), salonCol(hA, hA + FH, rooms, door));
  salon(0, 0, widths[0] / 6, h0 + 3, lv[0], true);
  const nPl = lv.length - 1;
  const plates = [];
  for (let k = 0; k < nPl; k += 1) {
    const a = k * 2.4 + b;
    // (Des vides de lumière plus grands que ceux du néon : l'âge cosmique le dépasse.)
    plates.push({ h: h0 + 3 + FH + 22 + k * (FH + 30), r: 56 - 4 * k, ox: Math.cos(a) * 8, oy: Math.sin(a) * 8, n: 9 - k, notch: 0.18 + 0.02 * k });
  }
  let hPrev = h0 + 3 + FH;
  const top = (rho, a, k, rIn) => {
    if (rho < rIn * 0.5) return rgbOf('#eef1f4');
    if (rho < rIn * 0.5 + 1.2) return lit(glow);
    return rgbOf((k & 1) ? CANVAS[fm(rho, 6) < 0.8 ? 1 : 0] : VELVET[fm(rho, 6) < 0.8 ? 2 : 1]);
  };
  plates.forEach((p, i) => {
    fut(hPrev, p.h - 6);
    // Le plateau FLOTTE : un vide de lumière entre lui et la colonne.
    revolve(R, p.ox, p.oy, p.h - 3, p.h, cyl(p.r * 0.5), () => lit(glow));
    petalPlate(R, p.ox, p.oy, p.r, p.h, 4, Math.max(5, p.n), p.notch, { top, side: () => lit(GR[2]), rim: lit(glow) });
    salon(p.ox, p.oy, widths[i + 1] / 6, p.h + 4, lv[i + 1], false);
    // Passerelle de lumière vers l'étage d'en dessous.
    line(R, [p.ox + p.r * 0.6, p.oy + p.r * 0.2, p.h], [0, 30, hPrev], glow);
    hPrev = p.h + 4 + FH;
    ledges.push({ x: p.ox, y: p.oy + p.r, h: p.h }, { x: p.ox - p.r * 0.7, y: p.oy + p.r * 0.7, h: p.h }, { x: p.ox + p.r * 0.7, y: p.oy + p.r * 0.7, h: p.h });
  });
  const hTop = hPrev + 26;
  fut(hPrev, hTop);
  if (b >= 8) {
    for (const hr of [hTop - 60, hTop - 10]) ring3d(R, [0, 0, hr], 24, 2, PLANE_H[0], PLANE_H[1], () => lit(glow));
  }
  revolve(R, 0, 0, hTop, hTop + 14, domeProf(hTop, 13, 14), () => lit(GR[0]));
  if (g.icare) {
    const wy = hTop + 28;
    line(R, [0, 0, hTop + 14], [0, 0, wy + 4], glow, 2);
    for (const sgn of [-1, 1]) {
      facet(R, [[0, 0, wy], [sgn * 16, -sgn * 16, wy + 7], [sgn * 14, -sgn * 14, wy + 1], [sgn * 3, -sgn * 3, wy - 2]],
        [-2, -2, wy], (I, px, py, ph) => lit(ph > wy + 3 ? GR[0] : glow));
    }
  }
  props.push({ prop: 'halo', x: 0, y: 0, h: hTop + 44, r: 18 });
  // L'avant : la guirlande d'orbes.
  lanternGarland(R, 0, 0, RB - 10, h0 + 18, 14, 'front', { phase: 0.1, cols: [glow, GR[0], GR[2]], wire: GR[2], sag: 6 });
  ledges.push({ x: 0, y: RB - 10, h: h0 + 18 }, { x: -50, y: 50, h: h0 + 18 }, { x: 50, y: 50, h: h0 + 18 });
  outline(R, X.ink);
  const N = nightLayer(R, K.pal.night);
  const sb = Math.PI / 4 + 0.45, r0 = widths[0] / 6;
  return { R, N, props, ledges, apex: { x: 0, y: 0, h: hTop + 40 }, foot: RB,
    stroll: { r: 70, h: h0 + 3, door: [r0 * 0.707 + 10, r0 * 0.707 + 2, h0 + 3], balcony: [plates[0].ox + 46 * Math.cos(sb), plates[0].oy + 46 * Math.sin(sb), plates[0].h + 4] } };
}

// Les jeux ouverts, lus sur la MEILLEURE ère (les jeux survivent à l'effondrement,
// le lieu aussi). ⚠ Les seuils sont ceux des jeux eux-mêmes (scratchUnlocked,
// osselets → Ère II ; blackjackUnlocked, icarusUnlocked → Ère III) ; la boutique
// suit son onglet (App.jsx). plaisirsReveal.test.js verrouille l'accord.
export function plaisirsGames(s, eraIndex = 0) {
  const be = Math.max((s && s.bestEraIndex) | 0, eraIndex | 0);
  return {
    osselets: be >= 2, tickets: be >= 2, cartes: be >= 3, icare: be >= 3,
    boutique: ((s && s.cycles) || 0) >= 1 || ((s && s.grandResetCount) || 0) > 0 || ((s && s.faveur) || 0) > 0,
  };
}

// ── Point d'entrée ───────────────────────────────────────────────────────────
// `g` : jeux ouverts { osselets, tickets, cartes, icare, boutique }. Les âges pas
// encore dessinés retombent sur la recette la plus proche (déroulé en cours).
const RECIPES = { 0: bakeFeu, 1: bakeBois, 2: bakePierre, 3: bakeCouronne, 4: bakeMarbre, 5: bakeFonte, 6: bakeNeon, 7: bakeCosmique, 8: bakeCosmique, 9: bakeCosmique };
export function plaisirsRecipeBand(band) {
  const b = Math.max(0, Math.min(9, band | 0));
  if (RECIPES[b]) return b;
  return 4;
}
// Rend aussi `H` (hauteur de chaque pixel, pour l'ombre) et `mirror` (le reflet
// exact, cf. plaisirsMirror) et `D` (profondeur de chaque pixel, cf. depthsOf).
export function bakePlaisirs(K, g = {}) {
  const out = RECIPES[plaisirsRecipeBand(K.band)](K, g);
  out.H = heightsOf(out.R);
  out.D = depthsOf(out.R);
  out.mirror = plaisirsMirror(out.R, out.H);
  return out;
}
export const PLAISIRS_PALETTE = { VELVET, CANVAS, PAPER, HIDE, OCHRE, NEON_PINK };
