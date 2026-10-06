// LE CALQUE VIVANT DE LA MAISON DES PLAISIRS NE GARDE QUE SES COLONNES (audit du 05/10,
// MEM-3, choix B de Raph).
//
// Le ballon captif de la Fonte (32 × 52) et les torches du feu de camp vivaient dans
// N images de TOUT le cadre du lieu : 10,8 Mo à la Fonte, 2,6 Mo au feu. Le calque ne
// garde plus que les colonnes qui bougent, élargies aux tranches entières qui les
// contiennent, sur toute la hauteur. Ce que ce test tient :
//   · chaque colonne gardée est, image par image, celle du cadre entier ; hors d'elles,
//     le cadre entier était vide ;
//   · les bords sont calés sur les tranches (une tranche pose la même source, au
//     décalage de colonne près), une colonne vide sépare deux images ;
//   · la pose d'une tranche : même destination que la matière, source décalée.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { CM } from '../layout.js';
import { bakePlaisirs } from '../iso/plaisirsBake.js';
import { applyPlaisirsSkin, plaisirsSkinSpec } from '../iso/plaisirsSkin.js';
import { wonderKitForBand } from '../iso/wonderKits.js';
import { drawIsoPlaisirsSeg } from '../iso/isoPlaisirs.js';
import { colRows } from '../iso/rowCrop.js';

const readPng = (src) => {
  const png = PNG.sync.read(fs.readFileSync(path.join(process.cwd(), 'public', src)));
  return { width: png.width, height: png.height, data: new Uint8ClampedArray(png.data) };
};
const G = { osselets: true, tickets: true, cartes: true, icare: true, boutique: true };
const S = 8;

// Le calque d'AVANT (N images de tout le cadre), pour comparer.
function fullLive(R, skin) {
  const n = skin.live.n, L = skin.liveImg, fw = L.width / n, [ax, ay] = skin.at;
  const data = new Uint8ClampedArray(R.w * n * R.h * 4);
  for (let f = 0; f < n; f += 1) for (let j = 0; j < L.height; j += 1) for (let i = 0; i < fw; i += 1) {
    const s = (j * L.width + f * fw + i) * 4;
    if (L.data[s + 3] < 128) continue;
    const x = ax - R.ox + i, y = ay - R.oy + j;
    if (x < 0 || y < 0 || x >= R.w || y >= R.h) continue;
    const k = (y * R.w * n + f * R.w + x) * 4;
    data.set(L.data.subarray(s, s + 3), k); data[k + 3] = 255;
  }
  return data;
}
const cases = [0, 5].map((band) => {
  const spec = plaisirsSkinSpec(band);
  const skin = { ...spec, img: readPng(spec.src), back: readPng(spec.src.replace(/\.png$/, '-back.png')), liveImg: readPng(spec.src.replace(/\.png$/, '-live.png')) };
  const out = bakePlaisirs(wonderKitForBand(band, false), G);
  const sk = applyPlaisirsSkin(out, skin, S);
  return { band, skin, R: sk.R, live: sk.live, full: fullLive(sk.R, skin) };
});

describe('MEM-3 — le calque vivant des Plaisirs, recadré sur ses colonnes', () => {
  it('colonnes gardées = celles du cadre entier, le reste était vide ; calées sur les tranches', () => {
    for (const { band, R, live, full } of cases) {
      expect(live, `âge ${band}`).toBeTruthy();
      const { n, x0, cols, stride } = live;
      expect(x0 % S, `âge ${band} : bord gauche sur une tranche`).toBe(0);
      expect((x0 + cols) % S === 0 || x0 + cols === R.w, `âge ${band} : bord droit sur une tranche`).toBe(true);
      expect(stride).toBe(cols + 1);
      expect([live.w, live.h]).toEqual([stride * n, R.h]);
      // Comptés en boucle nue (un expect par pixel coûtait vingt secondes).
      let lost = 0, diff = 0, gutter = 0, kept = 0;
      for (let f = 0; f < n; f += 1) for (let y = 0; y < R.h; y += 1) {
        for (let x = 0; x < R.w; x += 1) {
          const o = (y * R.w * n + f * R.w + x) * 4;
          if (x < x0 || x >= x0 + cols) { if (full[o + 3]) lost += 1; continue; }
          const c = (y * stride * n + f * stride + x - x0) * 4;
          if (full[o + 3]) kept += 1;
          for (let q = 0; q < 4; q += 1) if (live.data[c + q] !== full[o + q]) { diff += 1; break; }
        }
        if (live.data[(y * stride * n + f * stride + cols) * 4 + 3]) gutter += 1;
      }
      expect({ lost, diff, gutter }, `âge ${band}`).toEqual({ lost: 0, diff: 0, gutter: 0 });
      expect(kept, `âge ${band} : il y a bien quelque chose qui bouge`).toBeGreaterThan(0);
      // Le gain : un dixième (Fonte) à un quart (feu) du calque d'avant.
      expect(live.data.length / full.length, `âge ${band}`).toBeLessThan(0.3);
    }
  });

  it("une tranche pose la même destination que la matière, la source décalée de x0", () => {
    const saved = { cam: CM.cam, dpr: CM.dpr, TILE: CM.TILE, nightF: CM.nightF, ambianceK: CM.ambianceK };
    try {
      CM.TILE = 16; CM.dpr = 1; CM.nightF = 0; CM.ambianceK = 1;
      CM.cam = { ...(CM.cam || {}), zoom: 2 };
      for (const { band, R, live } of cases) {
        const cv = { tag: 'matiere' }, lcv = { tag: 'vivant' };
        const bk = { R, cv, live: { cv: lcv, n: live.n, ms: live.ms, x0: live.x0, cols: live.cols, stride: live.stride },
          rowsR: colRows(R), rowsLive: colRows(live), rowsN: null, cvN: null };
        const m = { bk, cx: 0, cy: 0 };
        let poses = 0;
        for (let c0 = 0; c0 < R.w; c0 += S) {
          const calls = [];
          const ctx = { imageSmoothingEnabled: false, getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }), drawImage: (...a) => calls.push(a) };
          const f = 3, now = f * live.ms + 1;
          drawIsoPlaisirsSeg(ctx, { m, part: 'slice', c0, c1: Math.min(R.w, c0 + S) }, now);
          const mat = calls.find((a) => a[0] === cv), viv = calls.find((a) => a[0] === lcv);
          const inside = c0 >= live.x0 && c0 < live.x0 + live.cols;
          if (!inside || !viv) { expect(!!viv && !inside, `âge ${band}, tranche ${c0} : vivant hors colonnes`).toBe(false); continue; }
          poses += 1;
          expect(viv[1], `âge ${band}, tranche ${c0} : colonne source`).toBe(f * live.stride + c0 - live.x0);
          expect(viv[3]).toBe(mat[3]);                                 // même largeur source
          expect(viv[5]).toBe(mat[5]); expect(viv[7]).toBe(mat[7]);    // même destination en x
        }
        expect(poses, `âge ${band} : tranches vivantes posées`).toBeGreaterThan(0);
      }
    } finally { Object.assign(CM, saved); }
  });
});
