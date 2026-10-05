// LES ROULEAUX DE LA MACHINE À SOUS — audit du 2026-10-05, PERF-31.
// paintReels résolvait le symbole (symbolRaster : slotsLook, une clé en chaîne, une
// Map) dans sa boucle la plus intérieure, rouleau × rangée × colonne × échantillon de
// flou — 34 000 fois par image, à 60 i/s pendant chaque tirage. Il les résout
// désormais une fois par appel, et la case lue une fois par rangée. Garde : l'image
// est la MÊME, à l'octet près, que celle de l'ancienne boucle (recopiée ci-dessous,
// avec la vitre), à plusieurs âges de la machine, avec et sans flou, rouleaux à
// l'arrêt ou en route.
import { describe, it, expect } from 'vitest';
import { bakeSlotsScene, paintReels, symbolRaster, SLOT_CELL, SLOT_ICON } from '../plaisirsSlotsArt.js';
import { SLOTS_REELS } from '../../../core/balance.js';

// L'ancienne boucle, telle quelle (avant le 2026-10-05), puis la vitre (inchangée).
function rgb(hex) { const v = parseInt(hex.slice(1), 16); return [v >> 16, (v >> 8) & 255, v & 255]; }
function reelsAvant(R, scene, reels, pos, band, blur = []) {
  const { win, reelX } = scene, C = SLOT_CELL, H = win.h, mid = H / 2;
  const L = rgb(scene.look === 'cosmic' ? '#f8fbff' : '#fbf6e8'), D = rgb('#5a5048');
  for (let r = 0; r < reelX.length; r += 1) {
    const reel = reels[r], n = reel.length, x0 = reelX[r], nb = Math.max(1, Math.min(7, (blur[r] || 0) + 1));
    for (let j = 0; j < H; j += 1) {
      const shade = Math.abs(j - mid) / mid;
      const bt = Math.max(0, shade - 0.35) * 0.9, st = 1 - Math.max(0, shade - 0.45) * 0.8;
      const br = L[0] + (D[0] - L[0]) * bt, bg = L[1] + (D[1] - L[1]) * bt, bb = L[2] + (D[2] - L[2]) * bt;
      for (let i = 0; i < C; i += 1) {
        let ar = 0, ag = 0, ab = 0;
        const sx = i - 1;
        for (let b = 0; b < nb; b += 1) {
          const v = pos[r] + (j + b - mid) / C, cell = Math.floor(v + 0.5), sy = Math.floor((v + 0.5 - cell) * C) - 1;
          let pr = br, pg = bg, pb = bb;
          if (sx >= 0 && sx < SLOT_ICON && sy >= 0 && sy < SLOT_ICON) {
            const ic = symbolRaster(reel[((cell % n) + n) % n], band), k = (sy * SLOT_ICON + sx) * 4;
            if (ic.data[k + 3]) { pr = ic.data[k] * st; pg = ic.data[k + 1] * st; pb = ic.data[k + 2] * st; }
          }
          ar += pr; ag += pg; ab += pb;
        }
        const q = ((win.y + j) * R.w + x0 + i) * 4;
        R.data[q] = ar / nb; R.data[q + 1] = ag / nb; R.data[q + 2] = ab / nb; R.data[q + 3] = 255;
      }
    }
  }
  const { win: w } = scene;
  for (let j = 0; j < w.h; j += 1) for (let i = 0; i < w.w; i += 1) {
    const q = ((w.y + j) * R.w + w.x + i) * 4;
    let t = 0, g = 0;
    if (j < 3) t = (3 - j) * 0.12;
    const d = (((i - j * 0.7) % 70) + 70) % 70;
    if (d < 7) g = d < 2 || d > 5 ? 0.06 : 0.12;
    if (t) { R.data[q] *= 1 - t; R.data[q + 1] *= 1 - t; R.data[q + 2] *= 1 - t; }
    if (g) { R.data[q] += (255 - R.data[q]) * g; R.data[q + 1] += (255 - R.data[q + 1]) * g; R.data[q + 2] += (255 - R.data[q + 2]) * g; }
  }
}

describe('paintReels — symboles résolus une fois, image identique à l octet (PERF-31)', () => {
  it('âges 5, 7 et 9 ; sans flou, flou 3 et 6 ; positions entières, fractionnaires et négatives', () => {
    for (const band of [5, 7, 9]) {
      const scene = bakeSlotsScene(band, 330, 0.6);
      const mk = () => ({ w: scene.back.w, h: scene.back.h, data: new Uint8ClampedArray(scene.back.data) });
      for (const blurV of [0, 3, 6]) {
        const blur = SLOTS_REELS.map(() => blurV);
        for (const pos of [[0, 0, 0, 0, 0], [1.3, 4.21, 7.77, 2.1, 5.5], [-2.37, 13.05, 0.5, -0.49, 31.9]]) {
          const a = mk(), b = mk();
          paintReels(a, scene, SLOTS_REELS, pos, band, blur);
          reelsAvant(b, scene, SLOTS_REELS, pos, band, blur);
          let diff = 0;
          for (let k = 0; k < a.data.length; k += 1) if (a.data[k] !== b.data[k]) diff += 1;
          expect(diff).toBe(0);
        }
      }
    }
  });
});
