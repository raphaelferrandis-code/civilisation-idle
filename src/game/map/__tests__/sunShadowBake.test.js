import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CM } from '../layout.js';
import { SUN_SHADOW, SHADOW_BAKE_BUDGET, drawSunShadow, pivotGround, rectKey, sunShadowPixels, sunShear } from '../iso/isoSunShadow.js';

// LA CUISSON DES MASQUES D'OMBRE (audit du 05/10, PERF-22). Ce que ces gardes tiennent :
//   1. la grille typée rend EXACTEMENT les pixels de l'ancien Set de chaînes, dans le
//      même ordre, pour tous les pivots — y compris une ombre tournée à la molette ;
//   2. le masque est posé d'UNE pose d'image, aux mêmes octets que les fillRect d'un
//      pixel d'avant (la teinte du jeu est en #rrggbb) ;
//   3. le budget par image étale les cuissons neuves sans en perdre aucune, et ne
//      s'applique pas en capture ;
//   4. un échec (image cassée) est retenu : plus de canvas + getImageData à chaque frame.

// L'algorithme d'AVANT (Set de chaînes), recopié tel quel : l'oracle de l'égalité.
function refShadowPixels(alpha, w, h, pivot, kx, ky) {
  const { bottom, g: ground, at } = pivotGround(alpha, w, h, pivot);
  const atMax = at ? at.length - 1 : 0;
  const out = [];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const seen = new Set();
  for (let x = 0; x < w; x += 1) {
    if (bottom[x] < 0) continue;
    const g = ground[x];
    for (let y = 0; y <= bottom[x]; y += 1) {
      if (alpha(x, y) <= 16) continue;
      const hgt = g - (y + 0.5);
      if (hgt <= 0) continue;
      const tx = x + Math.round(kx * hgt);
      const ty = y + Math.round(ky * hgt + (at ? at[Math.max(0, Math.min(atMax, tx))] - g : 0));
      const k = tx + ',' + ty;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(tx, ty);
      if (tx < x0) x0 = tx; if (tx > x1) x1 = tx;
      if (ty < y0) y0 = ty; if (ty > y1) y1 = ty;
    }
  }
  if (!out.length) return null;
  const fill = [];
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      if (seen.has(x + ',' + y)) continue;
      if ((seen.has((x - 1) + ',' + y) && seen.has((x + 1) + ',' + y))
        || (seen.has(x + ',' + (y - 1)) && seen.has(x + ',' + (y + 1)))) fill.push(x, y);
    }
  }
  for (let i = 0; i < fill.length; i += 2) out.push(fill[i], fill[i + 1]);
  const keep = [];
  let kx0 = Infinity, ky0 = Infinity, kx1 = -Infinity, ky1 = -Infinity;
  for (let i = 0; i < out.length; i += 2) {
    const x = out[i], y = out[i + 1];
    if (alpha(x, y) >= 250) continue;
    keep.push(x, y);
    if (x < kx0) kx0 = x; if (x > kx1) kx1 = x;
    if (y < ky0) ky0 = y; if (y > ky1) ky1 = y;
  }
  if (!keep.length) return null;
  const px = new Int32Array(keep.length);
  for (let i = 0; i < keep.length; i += 2) { px[i] = keep[i] - kx0; px[i + 1] = keep[i + 1] - ky0; }
  return { ox: kx0, oy: ky0, w: kx1 - kx0 + 1, h: ky1 - ky0 + 1, px };
}

// Sprite pseudo-aléatoire (graine fixe) : une silhouette pleine, des trous, des
// pixels à demi transparents (vitres) et des colonnes vides.
function mkSprite(w, h, seed) {
  let s = seed;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  const a = new Uint8Array(w * h);
  const top = Math.floor(h * (0.1 + 0.4 * rnd()));
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (y < top || x < w * 0.1 || rnd() < 0.12) continue;
      a[y * w + x] = rnd() < 0.15 ? Math.floor(rnd() * 250) : 255;
    }
  }
  return { w, h, a, alpha: (x, y) => (x < 0 || y < 0 || x >= w || y >= h) ? 0 : a[y * w + x] };
}

describe('masques d\'ombre : la grille', () => {
  it('rend les mêmes pixels, dans le même ordre, que le Set de chaînes', () => {
    const pivots = ['column', 'plate', 'bottom', 'slope', 0.92, 0.6];
    let n = 0;
    for (const len of [0.5, 1.3, -0.4]) {
      const { kx, ky } = sunShear(len);
      for (let i = 0; i < 6; i += 1) {
        const sp = mkSprite(12 + i * 9, 16 + ((i * 13) % 40), 7 + i * 31);
        for (const pv of pivots) {
          const a = refShadowPixels(sp.alpha, sp.w, sp.h, pv, kx, ky);
          const b = sunShadowPixels(sp.alpha, sp.w, sp.h, pv, kx, ky);
          if (!a) { expect(b).toBeNull(); continue; }
          expect({ ox: b.ox, oy: b.oy, w: b.w, h: b.h }).toEqual({ ox: a.ox, oy: a.oy, w: a.w, h: a.h });
          expect(Array.from(b.px)).toEqual(Array.from(a.px));
          n += 1;
        }
      }
    }
    expect(n).toBeGreaterThan(80);
  });

  it('la clé de rectangle ne confond pas deux rectangles', () => {
    expect(rectKey(0, 0, 48, 48)).not.toBe(rectKey(48, 0, 48, 48));
    expect(rectKey(1, 0, 0, 0)).not.toBe(rectKey(0, 8191, 0, 0));
    expect(rectKey(0, 0, 0, 8191)).not.toBe(rectKey(0, 0, 1, 0));
    // Hors des bornes entières : repli sur une chaîne, jamais une collision de nombre.
    expect(typeof rectKey(0.5, 0, 10, 10)).toBe('string');
    expect(typeof rectKey(0, 0, 9000, 10)).toBe('string');
  });
});

// ── Un faux document : des canvas qui comptent leurs appels ──────────────────
function fakeDom() {
  const st = { canvases: 0, getImageData: 0, fillRect: 0, putImageData: 0, puts: [] };
  const mk2d = (cv) => ({
    fillStyle: '#000',
    drawImage(img, sx, sy, sw, sh) {
      if (img.broken) throw new Error('InvalidStateError');
      cv.src = { img, sx, sy, sw, sh };
    },
    getImageData(x, y, w, h) {
      st.getImageData += 1;
      const d = new Uint8ClampedArray(w * h * 4), s = cv.src;
      for (let j = 0; j < h; j += 1) for (let i = 0; i < w; i += 1) d[(j * w + i) * 4 + 3] = s.img.sp.alpha(s.sx + i, s.sy + j);
      return { data: d, width: w, height: h };
    },
    createImageData(w, h) { return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h }; },
    putImageData(im) { st.putImageData += 1; st.puts.push(im); },
    fillRect(x, y) { st.fillRect += 1; st.puts.push({ rect: [x, y], col: this.fillStyle }); },
  });
  const doc = {
    createElement() {
      st.canvases += 1;
      const cv = { width: 0, height: 0 };
      cv.getContext = () => mk2d(cv);
      return cv;
    },
  };
  return { doc, st };
}
const mapCtx = () => {
  const c = { draws: 0, globalAlpha: 1, globalCompositeOperation: 'source-over', imageSmoothingEnabled: true };
  c.drawImage = () => { c.draws += 1; };
  return c;
};
const img = (w, h, seed, extra = {}) => ({ width: w, height: h, sp: mkSprite(w, h, seed), ...extra });

describe('masques d\'ombre : la cuisson', () => {
  const saved = {};
  let dom;
  beforeEach(() => {
    Object.assign(saved, { night: CM.nightF, lod: CM.lodActive, cap: CM.capture, wb: CM._wonderBoxes, cam: CM.cam, fx: CM.fxOn, ctx: CM.ctx, sh: { ...SUN_SHADOW } });
    CM.nightF = 0; CM.lodActive = false; CM.capture = null; CM.fxOn = true;
    CM.cam = { x: 0, y: 0, zoom: 1 };
    dom = fakeDom();
    vi.stubGlobal('document', dom.doc);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    CM.nightF = saved.night; CM.lodActive = saved.lod; CM.capture = saved.cap; CM._wonderBoxes = saved.wb; CM.cam = saved.cam; CM.fxOn = saved.fx; CM.ctx = saved.ctx;
    Object.assign(SUN_SHADOW, saved.sh);
  });

  it('pose le masque d\'une seule image, aux octets des fillRect d\'avant', () => {
    CM._wonderBoxes = null;                  // hors du peintre : pas de budget
    const im = img(40, 48, 3);
    const ctx = mapCtx();
    drawSunShadow(ctx, im, 0, 0, 40, 48, 0, 0, 0, 0, 'column', false);
    expect(dom.st.fillRect).toBe(0);
    expect(dom.st.putImageData).toBe(1);
    expect(ctx.draws).toBe(1);
    const { kx, ky } = sunShear();
    const r = refShadowPixels(im.sp.alpha, 40, 48, 'column', kx, ky);
    const put = dom.st.puts[0], d = put.data;
    expect([put.width, put.height]).toEqual([r.w, r.h]);
    const v = parseInt(SUN_SHADOW.col.slice(1), 16);
    const want = new Uint8ClampedArray(r.w * r.h * 4);
    for (let i = 0; i < r.px.length; i += 2) {
      const o = (r.px[i + 1] * r.w + r.px[i]) * 4;
      want[o] = v >> 16; want[o + 1] = (v >> 8) & 255; want[o + 2] = v & 255; want[o + 3] = 255;
    }
    expect(Array.from(d)).toEqual(Array.from(want));
    // Une teinte hors #rrggbb (molette) retombe sur le pixel à pixel, comme avant.
    SUN_SHADOW.col = 'rgb(10,20,30)';
    drawSunShadow(ctx, img(40, 48, 4), 0, 0, 40, 48, 0, 0, 0, 0, 'column', false);
    expect(dom.st.fillRect).toBeGreaterThan(0);
  });

  it('étale les cuissons neuves sur plusieurs images, sans en perdre aucune', () => {
    const imgs = Array.from({ length: 12 }, (_, i) => img(200, 200, 11 + i));   // 40 000 px chacune
    const frames = [];
    let drawn = 0;
    for (let f = 0; f < 10 && drawn < imgs.length; f += 1) {
      CM._wonderBoxes = [];                   // une image neuve (l'horloge de bakeBudget)
      const ctx = mapCtx();
      CM.ctx = ctx;                           // la toile de la carte : le budget s'y applique
      const before = dom.st.getImageData;
      for (const im of imgs) drawSunShadow(ctx, im, 0, 0, 200, 200, 0, 0, 0, 0, 'column', false);
      frames.push(dom.st.getImageData - before);
      drawn = ctx.draws;
    }
    const per = Math.ceil(SHADOW_BAKE_BUDGET.px / (200 * 200));
    expect(frames[0]).toBe(per);              // le budget coupe la première image…
    expect(frames.length).toBe(Math.ceil(imgs.length / per));   // … et tout finit par cuire
    expect(drawn).toBe(imgs.length);           // au repos : toutes les ombres, comme avant
    expect(dom.st.getImageData).toBe(imgs.length);   // chaque masque cuit UNE fois
  });

  it('le premier masque de l\'image passe toujours, même plus grand que le budget', () => {
    CM._wonderBoxes = [];
    const big = img(500, 400, 5), ctx = mapCtx();
    CM.ctx = ctx;
    drawSunShadow(ctx, big, 0, 0, 500, 400, 0, 0, 0, 0, 'column', false);
    drawSunShadow(ctx, img(30, 30, 6), 0, 0, 30, 30, 0, 0, 0, 0, 'column', false);
    expect(dom.st.getImageData).toBe(1);
    expect(ctx.draws).toBe(1);
  });

  it('pas de budget en capture : un cliché est complet', () => {
    const imgs = Array.from({ length: 8 }, (_, i) => img(200, 200, 40 + i));
    CM._wonderBoxes = [];
    CM.capture = { night: 0 };
    const ctx = mapCtx();
    CM.ctx = ctx;
    for (const im of imgs) drawSunShadow(ctx, im, 0, 0, 200, 200, 0, 0, 0, 0, 'column', false);
    expect(ctx.draws).toBe(imgs.length);   // 320 000 px : deux budgets, tout passe
    CM.capture = null;
  });

  it('hors de la carte (salle des Plaisirs, carte démontée) : pas de budget, l\'horloge figée ne bloque rien', () => {
    // La dernière image de la carte a laissé son tableau dans CM._wonderBoxes, puis la
    // carte a été démontée (CM.ctx nul) : la salle pose ses habitants sur SA toile.
    CM._wonderBoxes = [];
    CM.ctx = null;
    const salle = mapCtx();
    const imgs = Array.from({ length: 12 }, (_, i) => img(200, 200, 60 + i));   // 480 000 px, 3 budgets
    for (let pass = 0; pass < 2; pass += 1) {
      for (const im of imgs) drawSunShadow(salle, im, 0, 0, 200, 200, 0, 0, 0, 0, 'bottom', false);
    }
    expect(dom.st.getImageData).toBe(imgs.length);   // tout cuit dès la première passe
    expect(salle.draws).toBe(2 * imgs.length);       // aucune ombre manquante
    // Carte montée mais une AUTRE toile (portrait, mesure) : pas de budget non plus.
    CM.ctx = mapCtx();
    const autre = mapCtx();
    for (const im of Array.from({ length: 6 }, (_, i) => img(200, 200, 80 + i))) drawSunShadow(autre, im, 0, 0, 200, 200, 0, 0, 0, 0, 'bottom', false);
    expect(autre.draws).toBe(6);
  });

  it('retient l\'échec d\'une image cassée au lieu de la recuire à chaque frame', () => {
    CM._wonderBoxes = null;
    const bad = img(40, 40, 9, { broken: true }), ctx = mapCtx();
    for (let f = 0; f < 5; f += 1) drawSunShadow(ctx, bad, 0, 0, 40, 40, 0, 0, 0, 0, 'column', false);
    expect(dom.st.canvases).toBe(1);
    expect(ctx.draws).toBe(0);
  });
});
