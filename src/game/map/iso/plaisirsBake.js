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
  mats, box as box0, facet as facet0, revolve as revolve0, cyl, taper, domeProf, ring3d, PLANE_H, line, pick, band5, stairs, hip,
} from './wonderBake.js';

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
function note(R, x, y, h, c) {
  if (!c) return c;
  const i = Math.floor(x - y - R.ox), j = Math.floor((x + y) / 2 - h - R.oy);
  if (i >= 0 && j >= 0 && i < R.w && j < R.h) hbOf(R)[j * R.w + i] = h;
  return c;
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
export const lit = (c) => { const v = rgbOf(c); return [v[0], v[1], v[2], A_LIGHT]; };

// Velours drapé : des plis verticaux tous les 3 px, un cran plus sombre au creux.
export const velvetFold = (I, u) => rgbOf(VELVET[Math.min(4, band5(I) + (fm(u, 3) < 1 ? 1 : 0))]);

// ── Calque de nuit (même règle que wonderBake.finish) ────────────────────────
// Les vitres marquées s'allument (une sur trois reste noire, tirée par fenêtre),
// les sources gardent leur couleur. Rend N (même cadre que R) ou null.
export function nightLayer(R, nightHex) {
  const N = { ox: R.ox, oy: R.oy, w: R.w, h: R.h, data: new Uint8ClampedArray(R.data.length) };
  const night = rgbOf(nightHex);
  let any = false;
  for (let j = 0; j < R.h; j += 1) {
    for (let i = 0; i < R.w; i += 1) {
      const k = (j * R.w + i) * 4, a = R.data[k + 3];
      if (a !== A_WIN && a !== A_LIGHT) continue;
      R.data[k + 3] = 255;
      if (a === A_WIN && h32(i >> 2, j >> 3, 91) % 3 === 0) continue;
      const c = a === A_WIN ? night : [R.data[k], R.data[k + 1], R.data[k + 2]];
      N.data[k] = c[0]; N.data[k + 1] = c[1]; N.data[k + 2] = c[2]; N.data[k + 3] = a === A_WIN ? 235 : 255;
      any = true;
    }
  }
  return any ? N : null;
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
}
function lanternDot(R, x, y, h, c, cDark) {
  const X = Math.floor(x - y - R.ox), Y = Math.floor((x + y) / 2 - h - R.oy);
  put(R, X, Y, lit(c)); put(R, X + 1, Y, lit(c));
  put(R, X, Y + 1, lit(cDark)); put(R, X + 1, Y + 1, lit(c));
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
  if (g.boutique) pavBoutique(R, X, -56, -54, h0);
  if (g.tickets) pavTickets(R, X, 58, -52, h0, 1.3);
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
  const fut = (hA, hB) => revolve(R, 0, 0, hA, hB, cyl(rF), (I, h, a, rho) => {
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
      if (Math.abs(s2) < 0.2 && h > t1 + 7 && h < top) return [...rgbOf(h > top - 5 ? VELVET[3] : '#2b3240').slice(0, 3), A_WIN];
      if (h >= h1 - 2) return X.marble(0);
      return X.marbleL(I);
    }
    // Arcade des lanternes, sous la coupole : piliers et lampions.
    const s3 = fm(a / TAU * 10 + 0.5, 1) - 0.5;
    if (Math.abs(s3) < 0.28 && h > t2 + 2 && h < h2 - 3) return h < t2 + 8 ? lit(PAPER[1]) : rgbOf('#2a1a1c');
    return X.marbleL(I);
  });
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
  icarePerch(R, X, 0, 0, hl + 17, props);
  // ── Le pourtour, partie AVANT : pavillons, poteaux, guirlande, vasques.
  if (g.osselets) pavOsselets(R, X, -62, 28, h0, 1.25);
  if (g.cartes) pavCartes(R, X, 62, 20, h0, 1.3);
  gPost('front');
  ledges.push(...lanternGarland(R, 0, 0, gR, gH, garlandN, 'front', { phase: 0.13 }));
  for (const sx of [-18, 18]) {
    revolve(R, sx, RB - 5, h0, h0 + 5, taper(h0, h0 + 5, 2, 3.4), X.marbleL);
    revolve(R, sx, RB - 5, h0 + 5, h0 + 7, cyl(4), (I, h, a, rho, cap) => (cap ? rgbOf('#3a2a22') : X.metalL(I)));
    props.push({ prop: 'flame', x: sx, y: RB - 5, h: h0 + 7 });
  }
  outline(R, X.ink);
  const N = nightLayer(R, K.pal.night);
  return { R, N, props, ledges, apex: { x: 0, y: 0, h: hl + 39 }, foot: RB };
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
  // ABRI DES TICKETS (Ère II) : une hutte de branches couverte d'une peau ocre.
  if (g.tickets) {
    const x = 26, y = -26;
    gableHide(R, X, x - 9, x + 9, y - 7, y + 7, h0, 12);
  }
  // Le MÂT CENTRAL et le DAIS de peaux sur six perches : la première rotonde.
  const dR = 24, dH = h0 + 22;
  for (let k = 0; k < 6; k += 1) {
    const a = (k / 6) * TAU + 0.5, x = dR * 0.92 * Math.cos(a), y = dR * 0.92 * Math.sin(a);
    if (x + y < 0) line(R, [x, y, h0], [x, y, dH], W[2], 2);
  }
  // Natte des OSSELETS sous le dais : une peau claire, quatre os blancs.
  if (g.osselets) {
    revolve(R, 0, 0, h0, h0 + 1, cyl(13), (I, h, a, rho, cap) => (cap ? rgbOf(rho > 11 ? OCHRE[2] : HIDE[fm(a * 3, 1) < 0.5 ? 0 : 1]) : rgbOf(HIDE[3])));
    for (const [bx, by] of [[-3, 2], [2, -1], [4, 3], [-1, -4]]) {
      const Xs = Math.floor(bx - by - R.ox), Ys = Math.floor((bx + by) / 2 - h0 - 1.5 - R.oy);
      put(R, Xs, Ys, [246, 240, 226]); put(R, Xs + 1, Ys, [222, 214, 196]);
    }
  }
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
  // Le FEU, devant le dais, dans son cercle de pierres.
  const fx = 12, fy = 26;
  for (let k = 0; k < 9; k += 1) {
    const a = (k / 9) * TAU, x = fx + 6 * Math.cos(a), y = fy + 6 * Math.sin(a);
    box(R, x - 1.5, x + 1.5, y - 1.5, y + 1.5, h0, h0 + 2.5, X.plain(1), X.top(2));
  }
  props.push({ prop: 'flame', x: fx, y: fy, h: h0 + 1, big: true });
  ledges.push({ x: fx, y: fy, h: h0 + 4 });
  // Natte des CARTES (Ère III) : écorces peintes sous un petit auvent de peau.
  if (g.cartes) {
    const x = -24, y = 22;
    revolve(R, x, y, h0, h0 + 1, cyl(8), (I, h, a, rho, cap) => (cap ? rgbOf(rho > 6.5 ? OCHRE[2] : HIDE[1]) : rgbOf(HIDE[3])));
    for (const [bx, by, c] of [[-2, 0, OCHRE[0]], [1, -2, HIDE[0]], [2, 2, OCHRE[1]]]) {
      const Xs = Math.floor(x + bx - y - by - R.ox), Ys = Math.floor((x + bx + y + by) / 2 - h0 - 1.5 - R.oy);
      put(R, Xs, Ys, rgbOf(c)); put(R, Xs + 1, Ys, rgbOf(c)); put(R, Xs, Ys + 1, rgbOf(HIDE[3]));
    }
    for (const [dx, dy] of [[-6, -6], [6, 6]]) line(R, [x + dx, y + dy, h0], [x + dx, y + dy, h0 + 13], W[2]);
    stripedCone(R, X, x, y, 10, h0 + 13, 5, 8, 3, { pal: [OCHRE, HIDE], tip: W[2] });
  }
  torches('front');
  lanternGarland(R, 0, 0, tR, tH - 2, nT, 'front', { phase: 0.2, sag: 5, step: 4, pennant: true, cols: [OCHRE[1], HIDE[0]], wire: '#6e5430' });
  outline(R, X.ink);
  const N = nightLayer(R, K.pal.night);
  return { R, N, props, ledges, apex: { x: 0, y: 0, h: dH + 30 }, foot: RB };
}
// Abri à deux pans couvert d'une peau rayée (âge du feu).
function gableHide(R, X, x0, x1, y0, y1, h0, H) {
  const W = X.P.wood;
  box(R, x0 + 1, x1 - 1, y0 + 1, y1 - 1, h0, h0 + 3, (f, u, hv, lv) => rgbOf(W[lv ? 1 : 2]), () => rgbOf(W[1]));
  gableStriped(R, x0, x1, y0, y1, h0 + 2, H);
  line(R, [(x0 + x1) / 2, y1, h0 + 2 + H], [(x0 + x1) / 2, y1 + 2, h0 + 4 + H], W[3]);
}
function gableStriped(R, x0, x1, y0, y1, h0, H) {
  const cx = (x0 + x1) / 2, ins = [cx, (y0 + y1) / 2, h0 + H * 0.3];
  const tex = (I, px) => pick((Math.floor(px / 3) & 1) ? HIDE : OCHRE, I);
  facet(R, [[x0, y0, h0], [x0, y1, h0], [cx, y1, h0 + H], [cx, y0, h0 + H]], ins, tex);
  facet(R, [[x1, y0, h0], [x1, y1, h0], [cx, y1, h0 + H], [cx, y0, h0 + H]], ins, tex);
  facet(R, [[x0, y1, h0], [x1, y1, h0], [cx, y1, h0 + H]], ins, (I) => pick(HIDE, I - 0.15));
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
  const redLit = (lv) => lit(VELVET[lv ? 0 : 1]);
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
  // Pavillon à vitrines rouges (allumées la nuit), toit bordé de néon.
  const vitrine = (x, y, w, d, hb, hh, roofCol) => {
    box(R, x - w, x + w, y - d, y + d, hb, hb + hh, (f, u, hv, lv) => {
      if (hv >= hb + hh - 2) return lit(NEON_PINK[lv ? 0 : 1]);
      if (hv < hb + 2) return X.metal(lv ? 1 : 2);
      if (fm(u, 7) < 1) return X.metal(lv ? 0 : 2);
      return redLit(lv && hv > hb + hh - 7);
    }, () => rgbOf(roofCol || '#9aa2ad'));
  };
  if (g.boutique) vitrine(-56, -50, 10, 7, h0, 14);
  if (g.tickets) vitrine(56, -50, 9, 7, h0, 16);
  // ── LE TRONC renflé (verre et acier) et ses PLATEAUX en éventail.
  const trunk = (h) => 13 + 5 * Math.exp(-(((h - 40) / 26) ** 2)) + 3 * Math.exp(-(((h - 190) / 30) ** 2));
  const futCol = (I, h, a) => {
    if (fm(a / TAU * 16, 1) < 0.14) return pick(X.P.metal, I);           // meneaux
    if (fm(h, 10) < 1) return pick(X.P.metal, I - 0.1);
    const on = h32(Math.floor(a / TAU * 16), Math.floor(h / 10), 7) % 3 !== 0;
    return on ? [...pick(X.P.glassRamp, I).slice(0, 3), A_WIN] : X.glassL(I);
  };
  const fut = (hA, hB) => revolve(R, 0, 0, hA, hB, trunk, futCol);
  // Chaque plateau est DÉCALÉ du tronc (la branche) : l'éventail, pas la pile.
  const plates = [
    { h: 70, r: 60, ox: 8, oy: 10, n: 9, notch: 0.16 },
    { h: 128, r: 50, ox: -12, oy: -2, n: 8, notch: 0.18 },
    { h: 182, r: 42, ox: 6, oy: -10, n: 7, notch: 0.2 },
    { h: 230, r: 30, ox: -4, oy: 4, n: 6, notch: 0.22 },
  ];
  // Le cœur du plateau dallé clair, les pétales alternés cramoisi / crème — les
  // rayures des festons des autres âges, vues du ciel.
  const top = (rho, a, k, rIn) => {
    if (rho < rIn * 0.62) return rgbOf(fm(rho, 7) < 0.8 ? '#c4c9cf' : '#e2e5e9');
    if (rho < rIn * 0.62 + 1.2) return X.metal(0);
    return rgbOf((k & 1) ? CANVAS[fm(rho, 6) < 0.8 ? 1 : 0] : VELVET[fm(rho, 6) < 0.8 ? 2 : 1]);
  };
  const side = (I) => (I > 0.3 ? rgbOf(VELVET[1]) : rgbOf(VELVET[3]));
  let hPrev = h0;
  for (const p of plates) {
    fut(hPrev, p.h);
    // La branche : un cône d'acier sous le plateau, du tronc au centre décalé.
    for (let s = 0; s <= 1.0001; s += 0.1) {
      const r0 = 4 + 4 * s;
      revolve(R, p.ox * s, p.oy * s, p.h - 12 + 12 * s, p.h - 10 + 12 * s, cyl(r0), (I) => pick(X.P.metal, I - 0.1));
    }
    petalPlate(R, p.ox, p.oy, p.r, p.h, 5, p.n, p.notch, { top, side, rim: lit(NEON_PINK[0]) });
    // Pavillons : arrière, le tronc qui passe au travers, puis l'avant.
    const nV = Math.max(3, Math.round(p.r / 13));
    const pav = (front) => {
      for (let k = 0; k < nV; k += 1) {
        const a = (k / nV) * TAU + 0.35 + p.h * 0.01;
        const cx = p.ox + (p.r * 0.66) * Math.cos(a), cy = p.oy + (p.r * 0.66) * Math.sin(a);
        if (front !== (cx + cy >= p.ox + p.oy)) continue;
        vitrine(cx, cy, 4.5, 4.5, p.h + 5, 9);
      }
    };
    pav(false);
    hPrev = p.h + 5;
    fut(hPrev, hPrev + 3);
    pav(true);
    ledges.push({ x: p.ox, y: p.oy + p.r, h: p.h + 4 }, { x: p.ox - p.r * 0.7, y: p.oy + p.r * 0.7, h: p.h + 4 }, { x: p.ox + p.r * 0.7, y: p.oy + p.r * 0.7, h: p.h + 4 });
  }
  // ── Le chapiteau : coupole de néon côtelée, mât d'Icare, balise.
  const hTop = 262;
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
  if (g.osselets) {
    const x = -64, y = 24;
    revolve(R, x, y, h0, h0 + 7, cyl(9), (I, h, a, rho, cap) => (cap ? rgbOf(Math.floor(fm(a / TAU * 12, 12)) & 1 ? VELVET[1] : '#2a2a30') : X.metalL(I)));
    for (const [dx, dy] of [[-9, -9], [9, -9], [-9, 9], [9, 9]]) line(R, [x + dx, y + dy, h0], [x + dx, y + dy, h0 + 18], X.P.metal[1]);
    stripedCone(R, X, x, y, 15, h0 + 18, 6, 14, 3, { neon: NEON_PINK[0] });
  }
  if (g.cartes) vitrine(62, 22, 12, 9, h0, 18, '#c8434a');
  const sx = 30, sy = 40, s0 = h0, s1 = h0 + 56;
  line(R, [sx, sy, s0], [sx, sy, s1 - 34], X.P.metal[2], 2);
  box(R, sx - 1.5, sx + 1.5, sy - 8, sy + 8, s1 - 36, s1, (f, u, hv) => {
    const edge = hv <= s1 - 35 || hv >= s1 - 1 || Math.abs(u - sy) > 6.6;
    if (edge) return fm(u + hv, 2) < 1 ? lit('#ffe08a') : rgbOf('#5a2030');
    const mid = s1 - 18;
    return Math.abs(hv - mid) + Math.abs(u - sy) * 1.6 < 8 ? lit(NEON_PINK[0]) : rgbOf(VELVET[3]);   // le carreau
  }, () => rgbOf('#3a1420'));
  outline(R, X.ink);
  const N = nightLayer(R, K.pal.night);
  return { R, N, props, ledges, apex: { x: 0, y: 0, h: hTop + 56 }, foot: RB };
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
  return { R, N, props, ledges, apex: { x: 0, y: 0, h: apexH }, foot: S.foot || S.RB };
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
  const futCol = baysCol(6, 10, 26, woodL);
  return tiered(K, g, {
    RB: 66, H: 190,
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
    pav: { osselets: [-44, 24, 1.15], tickets: [42, -40, 1.1], cartes: [46, 22, 1.15], boutique: [-38, -42] },
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
  const futCol = windowsCol(X, 12, 58, 68, baysCol(8, 13, 32, X.stoneL));
  return {
    RB: 72, H: 210,
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
    pav: { osselets: [-54, 22, 1.15], tickets: [50, -46, 1.15], cartes: [54, 22, 1.2], boutique: [-46, -48] },
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
  return {
    RB: 78, H: 260,
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
    pav: { osselets: [-56, 24, 1.2], tickets: [52, -48, 1.2], cartes: [56, 24, 1.2], boutique: [-48, -50] },
    pavHook(R, X, game, x, y, h, k) {
      if (game !== 'cartes') return false;
      // Le vingt-et-un dans un PAVILLON DE TOURNOI : tambour de toile, cône rayé.
      revolve(R, x, y, h, h + 12 * k, cyl(8 * k), (I, hh, a) => pick((Math.floor(fm(a / TAU * 12, 12)) & 1) ? CANVAS : VELVET, I));
      stripedCone(R, X, x, y, 10 * k, h + 12 * k, 9 * k, 12, 3);
      return true;
    },
    futR: (h) => (h < 62 ? 28 : h < 94 ? 22 : 16),
    futCol: (I, h, a, rho) => {
      const s = fm(a / TAU * 10 + 0.5, 1) - 0.5;
      if (Math.abs(s) < 0.035 && fm(h, 22) > 9 && fm(h, 22) < 16) return X.dark;          // meurtrières
      return bays(I, h, a, rho);
    },
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

// ══ BANDE 5 — LA FONTE : le kiosque de fonte et de verre ═════════════════════
//   ponton de fonte sur colonnettes, ROUE À AUBES à l'est (le lieu se lit comme un
//   bateau-salon) ; rotonde de verre et de fonte, stores rayés, galerie ajourée ;
//   coupole de verre ; globes de gaz en guirlande ; Icare : un BALLON captif.
function bakeFonte(K, g) {
  const iron = ['#5a5f6a', '#3f434c', '#2c2f36', '#1e2026'];
  const ironL = (I) => pick(iron, I);
  const glassPane = (I, h, a) => {
    if (fm(a / TAU * 20, 1) < 0.12 || fm(h, 9) < 1) return ironL(I);
    const on = h32(Math.floor(a / TAU * 20), Math.floor(h / 9), 3) % 3 !== 0;
    return on ? [...pick(K.pal.glassRamp, I).slice(0, 3), A_WIN] : pick(K.pal.glassRamp, I);
  };
  const bays = baysCol(10, 11, 27, glassPane);
  return tiered(K, g, {
    RB: 78, H: 260, foot: 82,
    base(R, X) {
      pileRing(R, 70, 16, 0, 8, 2, (I, h) => (h < 1.5 ? rgbOf(K.pal.wet[1]) : ironL(I)));
      revolve(R, 0, 0, 8, 11, cyl(78), (I, h, a, rho, cap) => {
        if (!cap) return fm(a * rho / 5, 1) < 0.2 ? rgbOf(iron[0]) : ironL(I);
        if (rho > 52 && rho < 59) { const k = Math.floor(fm(a / TAU * 37, 37)); return rgbOf(k === 0 ? '#3f7a52' : (k & 1) ? VELVET[1] : '#2a2a30'); }
        const y = rho * Math.sin(a);
        return rgbOf(K.pal.wood[fm(y, 5) < 1 ? 2 : 0]);
      });
      stairs(R, X, -11, 11, 86, 13, 0, 11);
      return { deck: 11, fut: 11 };
    },
    garland: { r: 70, h: 16, n: 14, opts: { phase: 0.11, cols: ['#fff6d6', '#ffe6a8', '#b49a64'], wire: '#2c2f36' }, post: '#2c2f36' },
    extra(R, X, props, part) {
      if (part !== 'front') return;
      // LA ROUE À AUBES, à l'est : jante, rayons, pales, tambour cramoisi.
      const cx = 80, cy = -6, ch = 12, r = 15;
      ring3d(R, [cx, cy, ch], r, 2, [0, 1, 0], [0, 0, 1], (I) => pick(iron, I));
      for (let k = 0; k < 10; k += 1) {
        const a = (k / 10) * TAU, y = cy + r * Math.cos(a), h = ch + r * Math.sin(a);
        if (h < 0.5) continue;
        line(R, [cx, cy, ch], [cx, y, h], iron[1]);
        box(R, cx - 3, cx + 3, y - 0.8, y + 0.8, Math.max(0, h - 1.5), h + 1.5, (f, u, hv, lv) => rgbOf(VELVET[lv ? 1 : 2]), () => rgbOf(VELVET[0]));
      }
      ring3d(R, [cx + 1, cy, ch], r + 3, 3, [0, 1, 0], [0, 0, 1], (I) => pick(VELVET, I), 'front');
    },
    pav: { osselets: [-58, 22, 1.2], tickets: [50, -50, 1.2], cartes: [44, 40, 1.2], boutique: [-48, -52] },
    pavM: { L: ironL, F: (k) => rgbOf(iron[k]) },
    futR: (h) => (h < 50 ? 30 : h < 78 ? 22 : 15),
    futCol: (I, h, a, rho) => {
      if (h < 30) return bays(I, h, a, rho);
      return glassPane(I, h, a);
    },
    levels: [
      { h: 48, th: 3, r: 40, col: (I, h, a, rho, cap) => (cap ? rgbOf(K.pal.wood[0]) : (fm(a * rho / 3, 1) < 0.5 ? rgbOf(iron[3]) : ironL(I))),
        posts: { r: 37, n: 14, col: iron[2], w: 1 },
        valance: { r: 40.5, drop: 9, n: 26, pal: PIECES.pal }, bal: { r: 38 } },
      { h: 76, th: 3, r: 28, col: (I, h, a, rho, cap) => (cap ? rgbOf(K.pal.wood[0]) : ironL(I)),
        valance: { r: 28.5, drop: 7, n: 18, pal: PIECES.pal }, bal: { r: 26 } },
    ],
    top: 94,
    crown(R, X, props, hTop, gg) {
      revolve(R, 0, 0, hTop, hTop + 20, domeProf(hTop, 17, 20), (I, h, a) => (fm(a / TAU * 12, 1) < 0.14 ? ironL(I) : [...pick(K.pal.glassRamp, I).slice(0, 3), A_WIN]));
      revolve(R, 0, 0, hTop + 19, hTop + 26, cyl(3.5), ironL);
      // Les globes de gaz du sommet (une source pour la nuit).
      for (const a of [0.3, 1.9, 3.5, 5.1]) props.push({ prop: 'glow', x: 30 * Math.cos(a), y: 30 * Math.sin(a), h: 80 });
      if (!gg.icare) return hTop + 30;
      // ICARE : le BALLON captif, amarré au lanterneau par deux filins.
      const bh = hTop + 80, br = 14;
      line(R, [0, 0, hTop + 26], [-3, 3, bh - br - 6], '#3a2a22');
      line(R, [0, 0, hTop + 26], [3, -3, bh - br - 6], '#3a2a22');
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
  // Nacelles de cristal des jeux : arrière d'abord.
  const pod = (x, y, r, col) => {
    revolve(R, x, y, h0 + 3, h0 + 3 + 2 * r, (h) => Math.sqrt(Math.max(0, r * r - (h - h0 - 3 - r) ** 2)), (I, h) => (h < h0 + 3 + r * 0.7 ? rgbOf(col) : [...pick(GR, I).slice(0, 3), A_LIGHT]));
  };
  const pods = [['boutique', -52, -46, 8], ['tickets', 50, -48, 9], ['osselets', -58, 22, 10], ['cartes', 54, 24, 10]];
  for (const [game, x, y, r] of pods) if (g[game] && x + y < 0) pod(x, y, r, VELVET[1]);
  lanternGarland(R, 0, 0, RB - 10, h0 + 18, 14, 'back', { phase: 0.1, cols: [glow, GR[0], GR[2]], wire: GR[2], sag: 6 });
  // La colonne de lumière, par tronçons ; les plateaux flottants entre deux.
  const col = (I, h, a) => (fm(h, 14) < 1.2 ? lit(glow) : fm(a / TAU * 8, 1) < 0.12 ? white(I) : [...pick(GR, I).slice(0, 3), A_WIN]);
  const colR = (h) => 10 + 2 * Math.sin(h / 23);
  const fut = (hA, hB) => { if (hB > hA) revolve(R, 0, 0, hA, hB, colR, col); };
  const nPl = 3 + (b - 7);
  const plates = [];
  // Les plateaux s'étagent sur toute la hauteur (la plus grande silhouette du
  // jeu : l'âge cosmique dépasse la tour du néon), en éventail autour de la colonne.
  for (let k = 0; k < nPl; k += 1) {
    const t = k / Math.max(1, nPl - 1);
    const a = k * 2.4 + b;
    plates.push({ h: 86 + t * 210, r: 60 - 30 * t + (k & 1 ? -4 : 0), ox: Math.cos(a) * (18 - 8 * t), oy: Math.sin(a) * (18 - 8 * t), n: 9 - k, notch: 0.18 + 0.02 * k });
  }
  let hPrev = h0 + 3;
  const top = (rho, a, k, rIn) => {
    if (rho < rIn * 0.5) return rgbOf('#eef1f4');
    if (rho < rIn * 0.5 + 1.2) return lit(glow);
    return rgbOf((k & 1) ? CANVAS[fm(rho, 6) < 0.8 ? 1 : 0] : VELVET[fm(rho, 6) < 0.8 ? 2 : 1]);
  };
  for (const p of plates) {
    fut(hPrev, p.h - 6);
    // Le plateau FLOTTE : un vide de lumière entre lui et la colonne.
    revolve(R, p.ox, p.oy, p.h - 3, p.h, cyl(p.r * 0.5), () => lit(glow));
    petalPlate(R, p.ox, p.oy, p.r, p.h, 4, Math.max(5, p.n), p.notch, { top, side: () => lit(GR[2]), rim: lit(glow) });
    // Passerelle de lumière vers le plateau précédent / le disque.
    line(R, [p.ox + p.r * 0.6, p.oy + p.r * 0.2, p.h], [0, 30, hPrev], glow);
    hPrev = p.h + 4;
    ledges.push({ x: p.ox, y: p.oy + p.r, h: p.h }, { x: p.ox - p.r * 0.7, y: p.oy + p.r * 0.7, h: p.h }, { x: p.ox + p.r * 0.7, y: p.oy + p.r * 0.7, h: p.h });
  }
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
  // L'avant : nacelles, guirlande d'orbes.
  for (const [game, x, y, r] of pods) if (g[game] && x + y >= 0) pod(x, y, r, VELVET[1]);
  lanternGarland(R, 0, 0, RB - 10, h0 + 18, 14, 'front', { phase: 0.1, cols: [glow, GR[0], GR[2]], wire: GR[2], sag: 6 });
  ledges.push({ x: 0, y: RB - 10, h: h0 + 18 }, { x: -50, y: 50, h: h0 + 18 }, { x: 50, y: 50, h: h0 + 18 });
  outline(R, X.ink);
  const N = nightLayer(R, K.pal.night);
  return { R, N, props, ledges, apex: { x: 0, y: 0, h: hTop + 40 }, foot: RB };
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
// exact, cf. plaisirsMirror).
export function bakePlaisirs(K, g = {}) {
  const out = RECIPES[plaisirsRecipeBand(K.band)](K, g);
  out.H = heightsOf(out.R);
  out.mirror = plaisirsMirror(out.R, out.H);
  return out;
}
export const PLAISIRS_PALETTE = { VELVET, CANVAS, PAPER, HIDE, OCHRE, NEON_PINK };
