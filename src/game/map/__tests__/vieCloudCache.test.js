// OMBRES DE NUAGES : un cache qui ne se vide plus d'un bloc (audit du 2026-10-05, PERF-24).
//
// vieGenerated vidait tout le cache d'une famille au-delà de son plafond (48 pour les
// nuages) : la frame suivante recuisait d'un coup tous les nuages à l'écran (~30 masques,
// ~35 ms) — et en 4K au zoom 0,6, où 60 nuages sont visibles, à CHAQUE frame. Le test
// d'écran prenait en plus l'étendue entière d'un masque ancré en son centre : des nuages
// hors champ étaient cuits pour rien. Pas de canvas sous Node : un faux document.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CM } from '../layout.js';
import { vieGenerated, vieGeneratedSize } from '../iso/isoVie.js';
import { drawVieClouds } from '../iso/isoVieNuages.js';

let made = 0;
const fakeCanvas = () => (made += 1, { width: 0, height: 0, getContext: () => ({ putImageData() {}, createImageData: (w, h) => ({ data: { set() {} }, width: w, height: h }) }) });
const sprite = () => ({ w: 4, h: 2, data: new Uint8ClampedArray(32) });
const KEYS = ['ctx', 'cw', 'ch', 'dpr', 'layout', 'lodActive', 'fxOn', 'collapseAt', 'nightF', 'rainF', 'windX', 'TILE'];
let saved, savedCam;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, CM[k]]));
  savedCam = { ...CM.cam };
  vi.stubGlobal('document', { createElement: fakeCanvas });
});
afterEach(() => {
  for (const k of KEYS) CM[k] = saved[k];
  Object.assign(CM.cam, savedCam);
  vi.unstubAllGlobals();
});

describe('PERF-24 — vieGenerated évince en LRU', () => {
  it('reste sous son plafond et garde ce qui sert à chaque frame', () => {
    let hotMade = 0;
    for (let i = 0; i < 400; i += 1) {
      // Un nuage qui reste à l'écran (lu à chaque frame) et un flot de nouveaux.
      vieGenerated('cloud:lru-hot', () => { hotMade += 1; return sprite(); });
      vieGenerated('cloud:lru-' + i, sprite);
      expect(vieGeneratedSize('cloud')).toBeLessThanOrEqual(96);
    }
    expect(hotMade).toBe(1);
  });

  it('ne vide jamais tout : une entrée neuve n\'en évince qu\'une', () => {
    for (let i = 0; i < 200; i += 1) vieGenerated('cloud:fill-' + i, sprite);
    const full = vieGeneratedSize('cloud');
    let refaits = 0;
    // Les 60 dernières entrées survivent à l'ajout d'une nouvelle : rien à refaire.
    vieGenerated('cloud:fill-new', sprite);
    for (let i = 140; i < 200; i += 1) vieGenerated('cloud:fill-' + i, () => { refaits += 1; return sprite(); });
    expect(refaits).toBe(0);
    expect(vieGeneratedSize('cloud')).toBe(full);
  });
});

describe('PERF-24 — seuls les nuages à l\'écran sont cuits', () => {
  it('chaque masque cuit est posé (demi-étendue : le masque est centré)', () => {
    const T = 32;
    let blits = 0;
    Object.assign(CM, {
      ctx: { globalAlpha: 1, imageSmoothingEnabled: false, globalCompositeOperation: 'source-over', drawImage: () => { blits += 1; } },
      cw: 1280, ch: 720, dpr: 1, TILE: T, lodActive: false, fxOn: true, collapseAt: 0, nightF: 0, rainF: 0, windX: 0.3,
      layout: { gridN: 160 },
    });
    // Plusieurs instants : les nuages dérivent, d'autres entrent dans le champ. Un
    // masque cuit = un canvas créé (toCanvas).
    let cuits = 0;
    for (const now of [0, 90000, 180000, 270000]) {
      Object.assign(CM.cam, { x: 80 * T, y: 80 * T, zoom: 0.8 });
      made = 0; blits = 0;
      drawVieClouds(now + 7);
      cuits += made;
      // Pas un masque de plus que de nuages réellement posés à cet instant.
      expect(made).toBeLessThanOrEqual(blits);
    }
    expect(cuits).toBeGreaterThan(0);
  });
});
