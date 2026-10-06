// LES BATEAUX PARTAGENT LEURS CUISSONS, PAS LEURS MARINS (audit du 05/10, PERF-14,
// décision de Raph : vivier de 16 graines, marins tirés du bateau ; coupe des rames de
// métro au pas de 2 px).
//
// La graine visuelle d'un bateau (cargaison, fanion, place des marins) était unique
// par bateau, et sh.id croît sans fin : aucun bateau ne réutilisait les cuissons d'un
// autre (10 à 38 ms chacune), le cache tournait toute la session. Ce que ce test tient :
//   · la graine d'un bateau est tirée d'un vivier de 16 : cinquante marchands du même
//     modèle, au même cap, ne cuisent pas plus de seize fois ;
//   · QUI sont ses marins suit le bateau (son `ident`), pas la cuisson partagée ;
//   · la coupe d'une rame au tunnel tombe au pas de 2 px (moitié moins de clés).
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

const seen = vi.hoisted(() => ({ names: [], bakes: 0 }));
vi.mock('../agents.js', async (importOriginal) => ({
  ...(await importOriginal()),
  agentFrameIso: (name) => { seen.names.push(name); return { img: {}, drawH: 8, feetF: 0.9, fh: 16 }; },
  agentIdleFrameIso: () => ({ img: {}, fh: 16, sx: 0 }),
  agentPoseFrameIso: () => ({ img: {}, fh: 16, sx: 0 }),
}));
vi.mock('../iso/boatBake.js', async (importOriginal) => {
  const m = await importOriginal();
  return { ...m, bakeBoat: (...a) => { seen.bakes += 1; return m.bakeBoat(...a); } };
});

import { boatSpecFor, drawBoat, BOAT_SEED_POOL } from '../iso/boatKit.js';
import { metroCut, CAR } from '../iso/metroCars.js';

const ctx2d = () => new Proxy({ globalAlpha: 1, imageSmoothingEnabled: false }, {
  get(t, k) { if (k in t) return t[k]; return typeof k === 'string' ? () => {} : undefined; },
  set(t, k, v) { t[k] = v; return true; },
});
class FakeImageData {
  constructor(a, b, c) {
    if (a instanceof Uint8ClampedArray) { this.data = a; this.width = b; this.height = c || a.length / 4 / b; }
    else { this.width = a; this.height = b; this.data = new Uint8ClampedArray(a * b * 4); }
  }
}
let saved;
beforeAll(() => {
  saved = { doc: globalThis.document, id: globalThis.ImageData };
  globalThis.document = { createElement: () => { const g = ctx2d(); return { width: 0, height: 0, getContext: () => g }; } };
  globalThis.ImageData = FakeImageData;
});
afterAll(() => { globalThis.document = saved.doc; globalThis.ImageData = saved.id; });

describe('PERF-14 — vivier de graines des bateaux', () => {
  it('la graine vient d’un vivier de 16 ; l’identité, du bateau', () => {
    const seeds = new Set(), idents = new Set();
    for (let id = 1; id <= 400; id += 1) {
      const sp = boatSpecFor({ id, kind: 'trade' }, 4);
      expect(sp.seed).toBeGreaterThanOrEqual(0);
      expect(sp.seed).toBeLessThan(BOAT_SEED_POOL);
      seeds.add(sp.seed); idents.add(sp.ident);
    }
    expect(BOAT_SEED_POOL).toBe(16);
    expect(seeds.size).toBe(16);
    expect(idents.size).toBeGreaterThan(380);           // l'ancienne graine, propre au bateau
  });

  it('cinquante marchands du même modèle au même cap cuisent seize fois au plus', () => {
    const specs = [];
    for (let id = 1; specs.length < 50 && id < 5000; id += 1) {
      const sp = boatSpecFor({ id, kind: 'trade' }, 4);
      if (sp.id === 'corbita') specs.push(sp);
    }
    expect(specs.length).toBe(50);
    seen.bakes = 0;
    for (const sp of specs) drawBoat(ctx2d(), sp, 100, 100, 0.7, 1.5, 0, { state: 'cruise', band: 4, reflect: false });
    expect(seen.bakes).toBeGreaterThan(0);
    expect(seen.bakes).toBeLessThanOrEqual(BOAT_SEED_POOL);
  });

  it('même cuisson, autres marins : l’équipage suit l’identité du bateau', () => {
    // La corbita (bande 4) : ses marins se tirent parmi deux habitants romains.
    const crews = new Set();
    for (const ident of [101, 202, 303, 404, 505, 606, 707, 808]) {
      seen.names.length = 0;
      drawBoat(ctx2d(), { id: 'corbita', seed: 3, ident }, 100, 100, 0.4, 2, 0, { state: 'cruise', band: 4, reflect: false });
      expect(seen.names.length, 'des marins').toBeGreaterThan(0);
      crews.add(seen.names.join(','));
    }
    expect(crews.size).toBeGreaterThan(1);
    // Sans identité (embarcadères, amarres d'avant le vivier), la place cuite seule : stable.
    const once = () => { seen.names.length = 0; drawBoat(ctx2d(), { id: 'corbita', seed: 3 }, 100, 100, 0.4, 2, 0, { state: 'cruise', band: 4, reflect: false }); return seen.names.join(','); };
    expect(once()).toBe(once());
  });
});

describe('PERF-14 — coupe des rames au tunnel, au pas de 2 px', () => {
  it('coupe paire, à 1 px au plus de l’exacte, moitié moins de clés à l’approche d’une bouche', () => {
    const Lh = CAR.iron.Lh, total = 400;
    const exact = new Set(), quant = new Set();
    for (let sig = -Lh - 2; sig <= Lh + 40; sig += 0.25) {
      const c = metroCut(sig, total, Lh);
      if (!c) continue;
      const lo = Math.round(-sig);
      if (lo > -Lh - 2) exact.add(Math.max(-Lh - 3, lo));
      quant.add(c[0]);
      if (c[0] > -Lh - 3) {
        expect(Math.abs(c[0] % 2), `coupe ${c[0]}`).toBe(0);
        expect(Math.abs(c[0] - -sig)).toBeLessThanOrEqual(1 + 1e-9);
      }
    }
    expect(quant.size).toBeLessThanOrEqual(Math.ceil(exact.size / 2) + 1);
    // Une voiture entière n'a pas de coupe.
    expect(metroCut(200, total, Lh)).toBe(null);
  });
});
