// LA TOILE D'UNE TUILE RECUITE RESERT (audit du 05/10, PERF-53 point 1). Chaque
// recuisson allouait une toile neuve (~300 Ko à dpr 1, 0,35 ms d'allocation de texture
// en GPU) et laissait l'ancienne au ramasse-miettes : après une recuisson d'écran
// (saison, décodage), des dizaines de Mo en suspens. La cuisson reprend maintenant la
// toile de l'entrée qu'elle remplace — à la même taille, et seulement si son contexte
// sait se remettre à zéro (reset), ce qui la rend identique à une toile neuve.
// Pas de canvas sous Node : un faux OffscreenCanvas compte les toiles et les remises à
// zéro, et la peinture du sol (drawIsoGround) est neutralisée.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';

vi.mock('../iso/isoGroundBake.js', async (importOriginal) => ({ ...(await importOriginal()), drawIsoGround: () => {} }));

let made = 0, resets = 0, withReset = true;
class FakeOffscreen {
  constructor(w, h) {
    made += 1;
    this.width = w; this.height = h;
    const ctx = { setTransform() {}, clearRect() {}, imageSmoothingEnabled: true };
    if (withReset) ctx.reset = () => { resets += 1; };
    this._ctx = ctx;
  }
  getContext() { return this._ctx; }
}

const { CM } = await import('../layout.js');
const { cookTile, tileSideCss } = await import('../iso/solPyramide.js');
const { paintGroundPyramid, solPyramideReset } = await import('../iso/solPyramideFrame.js');
const { solInvalidate } = await import('../iso/solInvalidate.js');

const saved = {};
beforeEach(() => {
  saved.Off = globalThis.OffscreenCanvas;
  saved.cam = { ...CM.cam }; saved.cw = CM.cw; saved.ch = CM.ch; saved.dpr = CM.dpr;
  saved.capture = CM.capture; saved.zoomGoal = CM.zoomGoal; saved.layout = CM.layout;
  globalThis.OffscreenCanvas = FakeOffscreen;
  made = 0; resets = 0; withReset = true;
  CM.dpr = 1;
});
afterEach(() => {
  globalThis.OffscreenCanvas = saved.Off;
  Object.assign(CM.cam, saved.cam);
  CM.cw = saved.cw; CM.ch = saved.ch; CM.dpr = saved.dpr;
  CM.capture = saved.capture; CM.zoomGoal = saved.zoomGoal; CM.layout = saved.layout;
  solPyramideReset();
});

describe('cookTile — la toile passée en option', () => {
  it('reprise à la même taille, remise à zéro ; refusée sinon', () => {
    const a = cookTile(1, 0, 0);
    expect(made).toBe(1);
    expect(resets).toBe(0);
    const b = cookTile(1, 0, 0, { canvas: a.canvas });
    expect(b.canvas).toBe(a.canvas);
    expect(made).toBe(1);
    expect(resets).toBe(1);
    // Une toile d'une autre taille (un autre dpr, une autre gouttière) : une toile neuve.
    const W = Math.round((tileSideCss(1, 1) + 2 * a.G) * 1);
    expect(a.canvas.width).toBe(W);
    const other = new FakeOffscreen(W + 8, W + 8);
    const c = cookTile(1, 0, 0, { canvas: other });
    expect(c.canvas).not.toBe(other);
    expect(c.canvas.width).toBe(W);
    expect(made).toBe(3);
    // Un contexte qui ne sait pas se remettre à zéro : jamais repris.
    withReset = false;
    const d = cookTile(1, 3, 3);
    const e = cookTile(1, 3, 3, { canvas: d.canvas });
    expect(e.canvas).not.toBe(d.canvas);
  });
});

describe('la frame — une tuile périmée recuit dans sa toile', () => {
  it('après une invalidation, aucune toile neuve, les mêmes toiles posées', () => {
    const L = {
      roadSet: new Set(), roadMap: new Map(), urbanSet: new Set(), wonderGround: new Set(),
      river: { present: false, cells: new Set() }, tiles: [], gridN: 60, mapSeed: 7, counts: { eraBand: 0 },
    };
    CM.layout = null; CM.capture = true; CM.zoomGoal = null;   // capture : tout le visible se cuit dans la frame
    CM.cam.x = 30 * CM.TILE; CM.cam.y = 30 * CM.TILE; CM.cam.zoom = 1;
    CM.cw = 1200; CM.ch = 700;
    const posed = () => { const s = new Set(); paintGroundPyramid({ imageSmoothingEnabled: true, drawImage(cv) { s.add(cv); } }, L, 1000); return s; };
    const first = posed();
    expect(first.size).toBeGreaterThan(0);
    const n0 = made;
    solInvalidate('all');                       // tout est périmé : recuisson de l'écran
    const second = posed();
    expect(made).toBe(n0);                      // aucune toile neuve
    expect(resets).toBeGreaterThanOrEqual(first.size);
    expect([...second].every((cv) => first.has(cv))).toBe(true);
  });
});
