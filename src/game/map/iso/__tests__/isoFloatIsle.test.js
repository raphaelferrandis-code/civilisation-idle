// LE QUARTIER FLOTTANT ET LA CHUTE DES ÉTAGES (lot 4 de docs/PLAN-ETAGES.md).
import { describe, it, expect, afterEach } from 'vitest';
import { CM } from '../../layout.js';
import { floatIsleSite, floatIsleSpan, ISLE } from '../isoFloatIsle.js';
import { elevDecay } from '../isoElevated.js';

// Fleuve horizontal large de 8 (rangées 46-53), pont en x = 60.
const water = (x, y) => y >= 46 && y <= 53;
const L = (band, extra = {}) => ({
  gridN: 120, mapSeed: 12345, counts: { eraBand: band },
  river: { present: true, riverYAt: () => 49.5, isWater: water, bridge: { x: 60, y: 49.5 } },
  ...extra,
});

describe('floatIsleSite', () => {
  it('seulement à la bande 9', () => {
    expect(floatIsleSite(L(8))).toBeNull();
    expect(floatIsleSite(L(9))).not.toBeNull();
  });
  it('au-dessus de l\'eau, à 16-30 cases du pont, au milieu du fleuve', () => {
    const s = floatIsleSite(L(9));
    expect(water(Math.floor(s.x), Math.floor(s.y))).toBe(true);
    expect(Math.abs(s.x - 60)).toBeGreaterThanOrEqual(16);
    expect(Math.abs(s.x - 60)).toBeLessThanOrEqual(31);
    expect(s.y).toBeCloseTo(50, 5);
  });
  it('déterministe, et s\'écarte des Plaisirs', () => {
    const a = floatIsleSite(L(9));
    expect(floatIsleSite(L(9))).toEqual(a);
    const pl = floatIsleSite(L(9, { river: { ...L(9).river, plaisirs: { x: a.x, y: 49.5, clear: 8 } } }));
    expect(pl).not.toBeNull();
    expect(Math.abs(pl.x - a.x)).toBeGreaterThan(8);
  });
  it('pas de fleuve, pas d\'îlot', () => {
    expect(floatIsleSite(L(9, { river: { present: false } }))).toBeNull();
  });
  it('l\'emprise publiée pour le ciel couvre l\'îlot', () => {
    const save = CM.layout;
    try {
      const T = CM.TILE, s = floatIsleSite(L(9));
      const sp = floatIsleSpan(L(9));
      expect(sp.x0).toBeLessThan((s.x - ISLE.R) * T);
      expect(sp.x1).toBeGreaterThan((s.x + ISLE.R) * T);
    } finally { CM.layout = save; }
  });
});

describe('elevDecay — la chute des étages', () => {
  const saved = { c: CM.collapseAt, r: CM.frameRuined };
  afterEach(() => { CM.collapseAt = saved.c; CM.frameRuined = saved.r; });
  it('0 debout, ~0,65 en ruine, 1 pendant l\'effondrement', () => {
    CM.collapseAt = 0; CM.frameRuined = false;
    expect(elevDecay()).toBe(0);
    CM.frameRuined = true;
    expect(elevDecay()).toBeCloseTo(0.65, 5);
    CM.collapseAt = 1234;
    expect(elevDecay()).toBe(1);
  });
});
