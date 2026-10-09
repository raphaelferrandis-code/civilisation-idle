// LES MAISONS NE REHACHENT PLUS LEUR TUILE À CHAQUE FRAME (audit du 05/10, PERF-21).
//
// La teinte d'une maison (hachage de « hvar:gx:gy ») et la phase de ses fenêtres
// (« windows:gx:gy ») ne dépendent que de sa tuile ; elles étaient pourtant recalculées
// deux à trois fois par maison et par frame (ombre, dessin, fumée), avec la clé de la
// variante teintée et celle du masque des fenêtres — ~1 ms par frame en mégapole, la
// nuit et en hiver. Trois gardes, sur le vrai chemin de dessin (faux DOM) :
//   · même teinte qu'avant, au tirage près (le hachage d'origine) ;
//   · un hachage par tuile, pas par appel ; aucun pour une variante sans famille ;
//   · une phase de fenêtres par tuile, pas par frame.
import { describe, it, expect, vi, afterAll, beforeEach } from 'vitest';

const hashed = [];
vi.mock('../layout.js', async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, cmHash: (s) => { hashed.push(String(s)); return real.cmHash(s); } };
});

// Faux DOM minimal : une image de 40 × 60 entièrement opaque, décodée aussitôt.
class FakeCtx {
  drawImage() {}
  getImageData(x, y, w, h) { const d = new Uint8ClampedArray(w * h * 4); for (let i = 3; i < d.length; i += 4) d[i] = 255; return { data: d, width: w, height: h }; }
  createImageData(w, h) { return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h }; }
  putImageData() {}
  fillRect() {}
}
class FakeCanvas {
  constructor(w = 0, h = 0) { this.width = w; this.height = h; }
  getContext() { return new FakeCtx(); }
}
class FakeImage {
  constructor() { this.onload = null; this.naturalWidth = 0; this.naturalHeight = 0; this._src = ''; }
  get src() { return this._src; }
  set src(v) { this._src = v; this.naturalWidth = 40; this.naturalHeight = 60; if (this.onload) this.onload(); }
}
const saved = {};
for (const k of ['Image', 'OffscreenCanvas', 'document']) saved[k] = globalThis[k];
globalThis.Image = FakeImage;
globalThis.OffscreenCanvas = FakeCanvas;
globalThis.document = { createElement: () => new FakeCanvas() };
const { CM, cmHash } = await import('../layout.js');
const { WINTER } = await import('../seasonMode.js');
const { pickHouseTint, HOUSE_FAMILY } = await import('../housePalette.js');
const { HOUSE_WINDOWS } = await import('../houseWindowsData.js');
const H = await import('../pixelHouses.js');
const { drawHouseWindows } = await import('../houseWindows.js');
afterAll(() => { for (const k of Object.keys(saved)) globalThis[k] = saved[k]; });

const BAND = 4;
const VARS = ['domus', 'taberna', 'villa', 'insula2', 'townhouse', 'stonehouse'];
const tiles = () => VARS.flatMap((variant, i) => [0, 1, 2, 3].map((j) => ({ type: 'house', variant, gx: 3 + i * 7, gy: 5 + j * 11, size: 1 })));
const geom = (t) => H.pixelHouseSprite(t, 10, 10, 64, 32);

describe('teinte des maisons : un hachage par tuile', () => {
  beforeEach(() => {
    CM.layout = { counts: { eraBand: BAND } };
    CM.season = WINTER;
    H.preloadHouseSprites(BAND);
    hashed.length = 0;
  });

  it('même teinte que le tirage d origine', () => {
    for (const t of tiles()) {
      const g = geom(t);
      expect(g, t.variant).toBeTruthy();
      expect(g.tint).toBe(pickHouseTint(cmHash('hvar:' + t.gx + ':' + t.gy) >>> 0, t.variant));
    }
  });

  it('ombre, dessin, fumée : un seul hachage par maison ; aucun sans famille', () => {
    const ts = tiles();
    for (let frame = 0; frame < 3; frame += 1) for (const t of ts) { geom(t); geom(t); geom(t); }
    const hv = hashed.filter((s) => s.startsWith('hvar:'));
    const withFamily = ts.filter((t) => HOUSE_FAMILY[t.variant] | 0);
    expect(withFamily.length).toBeGreaterThan(0);
    expect(withFamily.length).toBeLessThan(ts.length);   // le lot mêle les deux cas
    expect(hv.length).toBe(withFamily.length);
  });

  it('les fenêtres de nuit : une phase par maison, pas par frame', () => {
    CM.nightF = 1; CM.lodActive = false; CM.ctx = { globalAlpha: 1 };
    // Un relevé D'ESSAI sur la maison à cour (les relevés réels se refont depuis la reprise
    // des sprites, 2026-10-09) : c'est la mémoïsation de la phase qui est vérifiée ici.
    HOUSE_WINDOWS.courtyard = [[16, 24, 2, 5], [24, 27, 2, 5]];
    const ts = [0, 1, 2, 3].map((j) => ({ type: 'house', variant: 'courtyard', gx: 3, gy: 5 + j * 11, size: 1 }));
    expect(ts.length).toBeGreaterThan(0);
    for (let frame = 0; frame < 4; frame += 1) for (const t of ts) drawHouseWindows(t, geom(t));
    expect(hashed.filter((s) => s.startsWith('windows:')).length).toBe(ts.length);
    delete HOUSE_WINDOWS.courtyard;
  });
});
