// REFLET DE L'ÎLOT PENDANT L'ÉRECTION (PERF-55 b, audit du 2026-10-05). Le quai de
// l'Aiguille déposait son reflet dès e ≥ 0,98, avec la découpe du moment
// (sy = bcut) : chaque cran des dernières images de l'érection était une clé neuve
// de reflectCanvas — un miroir du raster entier (getImageData + reflectPixels, 3 à
// 9 ms) recalculé, puis gardé en cache sur cvR tant que l'île vit. Le reflet n'est
// plus déposé qu'une fois l'île toute sortie (bcut 0), avec la clé du repos.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../iso/isoReflect.js', async (orig) => ({ ...(await orig()), noteReflection: vi.fn() }));

import { CM } from '../layout.js';
import { noteReflection } from '../iso/isoReflect.js';
import { drawIsoWonderSeg } from '../iso/isoWonder.js';

const savedCam = { ...CM.cam }, savedBorn = CM.born, savedCw = CM.cw, savedCh = CM.ch;
beforeEach(() => {
  Object.assign(CM.cam, { x: 0, y: 0, zoom: 1 });
  CM.cw = 800; CM.ch = 600;
  CM.born = {};
  noteReflection.mockClear();
});
afterEach(() => { Object.assign(CM.cam, savedCam); CM.born = savedBorn; CM.cw = savedCw; CM.ch = savedCh; });

// L'îlot nu : un raster de 1035 × 625 (la taille mesurée par l'audit), sans écume.
const H = 625, W = 1035;
const cv = { width: W, height: H };
const isl = { R: { w: W, h: H, ox: 0, oy: 0 }, cv, cvR: cv, box: null };
const item = { part: 'isle', w: { id: 'era_mega' }, wi: 0, m: { bk: { R: { w: 8, h: 8, ox: 0, oy: 0 }, cv }, cx: 0, cy: 0, isl } };
const ctx = { imageSmoothingEnabled: false, drawImage() {} };
function draw(now) {
  // blitInk lit encore une molette A/B sur `window` : un objet vide suffit sous Node.
  const hadWin = typeof globalThis.window !== 'undefined';
  if (!hadWin) globalThis.window = {};
  try { drawIsoWonderSeg(ctx, item, now); } finally { if (!hadWin) delete globalThis.window; }
}

describe('reflet de l îlot : un miroir, celui du repos', () => {
  it('aucun reflet pendant les derniers crans (bcut > 0), le reflet du repos ensuite', () => {
    // Érection de 1 400 ms en smoothstep : de p = 0,90 à 0,99, e passe de 0,972 à
    // 0,9997 — l'ancien seuil (0,98) y est franchi, bcut descend de 17 à 0.
    const born = 10000;
    CM.born['wonder:era_mega'] = born;
    const cuts = new Set();
    for (let p = 0.90; p < 0.99; p += 0.002) {
      const e = p * p * (3 - 2 * p);
      const bcut = Math.floor(H * (1 - e));
      if (e >= 0.98 && bcut > 0) cuts.add(bcut);
      draw(born + p * 1400);
    }
    expect(cuts.size).toBeGreaterThan(3);          // l'ancien code y créait autant de miroirs
    for (const call of noteReflection.mock.calls) expect(call[7]).toBe(0);   // sy : jamais une découpe
    noteReflection.mockClear();
    // Au repos (érection finie) : un reflet, sur le raster entier.
    delete CM.born['wonder:era_mega'];
    draw(99999);
    expect(noteReflection).toHaveBeenCalledTimes(1);
    const c = noteReflection.mock.calls[0];
    expect(c.slice(6, 10)).toEqual([0, 0, W, H]);
  });
});
