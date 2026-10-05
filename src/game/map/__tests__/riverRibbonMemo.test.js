import { describe, it, expect, vi, beforeAll } from 'vitest';

// LE RUBAN DU FLEUVE, PROJETÉ UNE FOIS PAR FRAME (audit du 05/10, PERF-42). Corps,
// nappe, voile, sillage, bas-fond, galets, poissons, reflets, vie de surface et
// remous retraçaient chacun le ruban : ~11 projections complètes des deux rives et
// des contours d'îles par frame (18 763 worldToScreen mesurés, ~25 000 objets jetés).
// Ces gardes comptent les projections (pas de chronomètre) et vérifient que la
// mémoire de frame ne sert jamais un ruban périmé : caméra bougée, frame suivante.

const count = { w2s: 0 };
vi.mock('../iso/projection.js', async (importOriginal) => {
  const mod = await importOriginal();
  return { ...mod, worldToScreen: (...a) => { count.w2s += 1; return mod.worldToScreen(...a); } };
});
class FakeImg { constructor() { this.naturalWidth = 0; this.naturalHeight = 0; } set src(v) { this._src = v; } get src() { return this._src; } }
globalThis.Image = globalThis.Image || FakeImg;

const { CM } = await import('../layout.js');
const { drawIsoRiver, riverRibbonPath } = await import('../iso/isoRiver.js');

// Contexte qui RECOPIE les sommets tracés : deux tracés identiques, même liste.
function recCtx() {
  const log = [];
  const target = { log, canvas: { width: 1600, height: 900 }, getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
    createPattern: () => null, createLinearGradient: () => ({ addColorStop() {} }) };
  return new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'moveTo' || k === 'lineTo') return (x, y) => log.push(k, x, y);
      if (typeof k === 'string' && /^[a-z]/.test(k)) return () => {};
      return undefined;
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

const N = 160;
beforeAll(() => {
  const sm = [];
  for (let i = 0; i < N; i += 1) sm.push({ x: -40 + i * 0.8, y: 30 + Math.sin(i / 20) * 4, hw: 3.2 });
  CM.layout = {
    river: { present: true, samples: sm, islands: [{ x: 20, y: 30 + Math.sin(75 / 20) * 4, rx: 5, ry: 1.8, tx: 1, ty: 0 }] },
    counts: { eraBand: 1, eraIndex: 3 }, tiles: [], roadSet: new Set(), gridN: 80,
  };
  CM.layoutRecomputeAt = 4242; CM.cw = 1600; CM.ch = 900; CM.dpr = 1; CM.TILE = 32;
  CM.cam = { x: 20 * 32, y: 30 * 32, zoom: 1 }; CM.collapseAt = 0; CM.lodActive = false;
  CM.season = 1; CM.rainF = 0; CM.nightF = 0; CM.quayGate = null;
});

describe('ruban du fleuve : une projection par frame', () => {
  it('deux tracés dans la même frame : mêmes sommets, aucune projection de plus', () => {
    CM.ctx = recCtx();
    drawIsoRiver(1000);                                // ouvre la frame d'onde
    const a = recCtx(), b = recCtx();
    count.w2s = 0;
    riverRibbonPath(a, CM.layout.river.samples, CM.TILE);
    const first = count.w2s;
    riverRibbonPath(b, CM.layout.river.samples, CM.TILE);
    expect(count.w2s).toBe(first);                     // le second est servi par la mémoire
    expect(b.log).toEqual(a.log);
  });

  it('une caméra bougée ou la frame suivante reprojettent : jamais un ruban périmé', () => {
    CM.ctx = recCtx();
    drawIsoRiver(2000);
    const sm = CM.layout.river.samples;
    const a = recCtx();
    riverRibbonPath(a, sm, CM.TILE);
    CM.cam.x += 16;                                    // pan d'une demi-tuile
    const b = recCtx();
    count.w2s = 0;
    riverRibbonPath(b, sm, CM.TILE);
    expect(count.w2s).toBeGreaterThanOrEqual(2 * N);
    expect(b.log).not.toEqual(a.log);
    CM.cam.x -= 16;
    // Même caméra, frame suivante (l'onde a avancé) : reprojeté aussi.
    CM.ctx = recCtx();
    drawIsoRiver(2600);
    const c = recCtx();
    count.w2s = 0;
    riverRibbonPath(c, sm, CM.TILE);
    expect(count.w2s).toBe(0);                         // la frame l'a déjà projeté…
    expect(c.log).not.toEqual(a.log);                  // … à SON instant, pas à celui d'avant
  });

  it('une frame entière du fleuve projette les rives quelques fois, pas onze', () => {
    CM.ctx = recCtx();
    drawIsoRiver(3000);
    count.w2s = 0;
    CM.ctx = recCtx();
    drawIsoRiver(3016.7);
    // Avant : ~11 rubans complets + 6 jeux de rives par frame (31 × N mesurés en bande
    // 9, davantage en bande 1). Ici, bande 1, berge naturelle TOUT le long : le ruban
    // (2N), le sable et les trois paliers de la laisse (8N), la boîte de la nappe et
    // les centres de l'écume (2N) — 14 × N.
    expect(count.w2s).toBeLessThan(16 * N);
  });
});
