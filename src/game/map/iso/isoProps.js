"use strict";
// ── LES OBJETS POSÉS — statues, braseros, réverbères, flammes, lueurs ────────
//
// Sortis d'isoBridge.js le 2026-10-01 quand les merveilles ont été refaites
// « comme le pont » (docs/PLAN-MERVEILLES.md) : le même art (places de l'ère,
// réverbères de la ville), la même toise (habitant 7-8 px au zoom 1), la même
// ombre solaire et les mêmes lueurs de nuit pour les deux. Déplacement pur.
import { CM } from '../layout.js';
import { isoArt } from './isoArt.js';
import { drawSunShadow } from './isoSunShadow.js';
import { lightCtx, lightCutImage } from '../lightLayer.js';
import { streetKitLampArt } from './streetKits.js';
import { flameFlicker } from '../flameGlow.js';

// ── Art des objets posés (statues, braseros) ─────────────────────────────────
// L'art des places de l'ère, tel quel : même main que la ville. Boîte d'encre
// mesurée une fois (le canvas porte du vide).
const _ink = new WeakMap();
export function inkBox(img) {
  const known = _ink.get(img);
  if (known !== undefined) return known;
  let b;
  try {
    const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    cx.drawImage(img, 0, 0);
    const d = cx.getImageData(0, 0, w, h).data;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
      if (d[(y * w + x) * 4 + 3] > 16) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    b = x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  } catch { b = null; }
  _ink.set(img, b);
  return b;
}
// Hauteur d'ENCRE voulue (px d'art au zoom 1) par objet posé. Toise : un habitant
// fait 7 à 8 px. Une statue de pont ≈ 1,3 habitant avec son socle rond ; un brasero
// sur trépied dépasse la main courante d'une demi-taille d'homme ; un réverbère fait
// deux habitants. (`small` ×0,72 : sur la main courante ; `big`/porte ×1,4 : vus de
// loin, sur un attique ou un pylône.)
export const PROP_INK_H = { statue: 14, brazier: 8, gaslamp: 16, ledlamp: 17 };
// Art des objets : places de l'ère (statue, brasero) ou réverbères de la ville.
export const PROP_ART = { gaslamp: 'lamp-gas', ledlamp: 'lamp-electric' };
// Point chaud (fraction de la boîte d'encre) et rayon de lueur en tuiles. Un brasero
// éclaire le parapet et le tablier autour de lui, pas le fleuve entier (à 1,1 tuile
// les halos amont posaient des disques sur l'eau).
export const PROP_LIGHT = {
  brazier: { fx: 0.5, fy: 0.18, r: 0.55, col: '255,190,110' },
  gaslamp: { fx: 0.5, fy: 0.08, r: 0.6, col: '255,208,150' },
  ledlamp: { fx: 0.5, fy: 0.06, r: 0.6, col: '150,225,255' },
};
export function propArt(pr) {
  const a = isoArt(PROP_ART[pr.prop] || ('plaza/' + pr.prop + '-' + pr.era));
  return a.ready && a.img ? a.img : null;
}
// Le BRASERO brûle : la bande des places (plaza/anim/brazier-<ère>, scripts/
// plazaBrazierAnim.mjs), N images au canvas exact du statique — même géométrie de
// blit, seule la source change. Liste explicite des ères livrées : réclamer une
// bande absente coûte un ERR_FILE_NOT_FOUND au .exe (cf. ANIM_PROPS, isoPlaza).
const BRAZIER_ANIM_ERAS = new Set(['antique', 'medieval', 'cosmic']);
const BRAZIER_ANIM_MS = 110;
function brazierStrip(pr) {
  if (pr.prop !== 'brazier' || pr.tint || !BRAZIER_ANIM_ERAS.has(pr.era) || !((CM.ambianceK ?? 1) > 0)) return null;
  const a = isoArt('plaza/anim/brazier-' + pr.era);
  if (!a.ready || !a.img) return null;
  const w = a.img.naturalWidth | 0, h = a.img.naturalHeight | 0;
  const n = h > 0 ? Math.round(w / h) : 1;
  return n > 1 ? { img: a.img, n, fw: w / n, fh: h } : null;
}
// Statue DORÉE (pylônes de la fonte) : le marbre des places, recouvert d'or — une
// fois par image, en cache.
// `tintOf(img, '#rrggbb')` généralise (statues des merveilles au métal de leur ère).
const _gold = new WeakMap();
export function goldOf(img) { return tintOf(img, '#e9b44c'); }
export function tintOf(img, hex) {
  let per = _gold.get(img);
  if (!per) { per = new Map(); _gold.set(img, per); }
  const known = per.get(hex);
  if (known !== undefined) return known;
  let c;
  try {
    const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    c = document.createElement('canvas');
    c.width = w; c.height = h;
    const cx = c.getContext('2d');
    cx.drawImage(img, 0, 0);
    cx.globalCompositeOperation = 'multiply';
    cx.fillStyle = hex;
    cx.fillRect(0, 0, w, h);
    cx.globalCompositeOperation = 'destination-in';
    cx.drawImage(img, 0, 0);
  } catch { c = null; }
  per.set(hex, c);
  return c;
}

// Lueur dans le calque de lumière (nuit), autour d'un point écran.
export function glowAt(x, y, r, col, a) {
  const nf = CM.nightF || 0;
  if (nf <= 0.03) return;
  const lc = lightCtx(x - r, y - r, x + r, y + r);
  if (!lc) return;
  const g = lc.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${col},${(a * nf).toFixed(3)})`);
  g.addColorStop(1, `rgba(${col},0)`);
  lc.fillStyle = g;
  lc.fillRect(x - r, y - r, r * 2, r * 2);
}

// FLAMME procédurale (torches des totems, vasques, tour-porte) : 3 images d'un
// petit feu en pixels d'art, qui ondule ; une lueur douce la nuit.
const FLAME_PX = [
  ['.y.', 'yoy', 'oro', '.r.'],
  ['y..', 'oy.', 'ooy', '.rr'],
  ['..y', '.yo', 'yoo', 'rr.'],
];
const FLAME_COL = { y: '#ffe9a0', o: '#f7a23b', r: '#c8452a' };
export function drawFlame(ctx, x, y, z, now, k = 1, phase = 0) {
  const fr = FLAME_PX[((Math.floor((now || 0) / 140 + phase) % 3) + 3) % 3];   // phase < 0 admise
  const s = Math.max(1, Math.round(z * k));
  const x0 = Math.round(x - 1.5 * s), y0 = Math.round(y - 4 * s);
  for (let j = 0; j < fr.length; j += 1) {
    for (let i = 0; i < 3; i += 1) {
      const ch = fr[j][i];
      if (ch === '.') continue;
      ctx.fillStyle = FLAME_COL[ch];
      ctx.fillRect(x0 + i * s, y0 + j * s, s, s);
    }
  }
  // La lueur VACILLE avec la flamme (même scintillement que tous les feux, flameGlow.js).
  glowAt(x, y - 2 * s, Math.max(6, CM.TILE * z * 0.5 * k), '255,170,90', 0.6 * flameFlicker(now, phase * 2.1));
}

export function hexToRgbStr(h) {
  const n = parseInt(String(h).slice(1), 16);
  return ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255);
}

// Objet d'ART (statue, brasero, réverbère) posé au point écran p (pied de l'encre
// sur son support) : ombre du soleil, blit, découpe des halos, lueur de nuit.
// `now` (ms) fait brûler les braseros ; sans lui, le statique.
export function drawSpriteProp(ctx, pr, p, z, now) {
  // RÉVERBÈRE : celui de la rue de la même ère, dessiné par le code au grain de la
  // ville (iso/streetKits.js, 2026-10-03) — un pixel d'art par pixel d'écran, la
  // lumière sur ses têtes dessinées. Les PNG d'avant restent le repli.
  if (pr.prop === 'gaslamp' || pr.prop === 'ledlamp') {
    const kl = streetKitLampArt((CM.layout && CM.layout.counts && CM.layout.counts.eraBand) | 0);
    if (kl) { drawKitLampProp(ctx, kl, p, z); return; }
  }
  let img = propArt(pr);
  if (!img) return;
  const bb = inkBox(img);
  if (!bb) return;
  if (pr.tint === 'gold') img = goldOf(img) || img;
  else if (typeof pr.tint === 'string' && pr.tint[0] === '#') img = tintOf(img, pr.tint) || img;
  const want = (PROP_INK_H[pr.prop] || 16) * (pr.small ? 0.72 : (pr.gate || pr.big) ? 1.4 : 1);
  const s = (want / bb.h) * z;                       // px écran par px d'art
  const dw = (img.naturalWidth || img.width) * s, dh = (img.naturalHeight || img.height) * s;
  // Pied de l'encre (centre bas) posé sur son support.
  const dx = Math.round(p.x - (bb.x + bb.w / 2) * s), dy = Math.round(p.y - (bb.y + bb.h) * s + s * 0.5);
  drawSunShadow(ctx, img, dx, dy, dw, dh, 0, 0, 0, 0, 'column', false);
  const an = now != null ? brazierStrip(pr) : null;
  if (an) {
    // Chaque brasero a SA phase, tirée de sa place dans le kit (l/t d'un pont,
    // x/y d'une merveille) : une rangée qui vacille à l'unisson fait machine.
    const off = Math.floor((pr.l ?? pr.x ?? 0) * 0.37 + (pr.t ?? pr.y ?? 0) * 0.61);
    const f = (((Math.floor(now / BRAZIER_ANIM_MS) + off) % an.n) + an.n) % an.n;
    ctx.drawImage(an.img, f * an.fw, 0, an.fw, an.fh, dx, dy, dw, dh);
  } else {
    ctx.drawImage(img, dx, dy, dw, dh);
  }
  lightCutImage(img, dx, dy, dw, dh);
  const L = PROP_LIGHT[pr.prop];
  // Un brasero qui brûle (bande animée) fait vaciller sa lueur avec lui.
  const fl = an ? flameFlicker(now, (pr.l ?? pr.x ?? 0) * 0.41 + (pr.t ?? pr.y ?? 0) * 0.23) : 1;
  if (L) glowAt(dx + (bb.x + bb.w * L.fx) * s, dy + (bb.y + bb.h * L.fy) * s, Math.max(6, CM.TILE * z * L.r), L.col, 0.55 * fl);
}

// Réverbère de kit posé au point écran p (son pied) : ombre du soleil, blit au
// grain, découpe des halos, une lueur par tête dessinée la nuit.
function drawKitLampProp(ctx, kl, p, z) {
  const f = kl._foot, dw = kl.w * z, dh = kl.h * z;
  const dx = Math.round(p.x - dw * f.footXf), dy = Math.round(p.y - dh * f.footYf);
  drawSunShadow(ctx, kl.img, dx, dy, dw, dh, 0, 0, 0, 0, 'column', false);
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(kl.img, dx, dy, dw, dh);
  ctx.imageSmoothingEnabled = prev;
  lightCutImage(kl.img, dx, dy, dw, dh);
  for (const e of kl.lig.em) glowAt(dx + e.fx * dw, dy + e.fy * dh, Math.max(6, CM.TILE * z * 0.6), kl.lig.col, 0.55);
}
