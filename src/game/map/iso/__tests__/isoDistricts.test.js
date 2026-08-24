// LES REPÈRES CIVIQUES — les invariants du pseudo-tile.
import { describe, it, expect, afterEach } from 'vitest';
import { CM } from '../../layout.js';
import { DISTRICT_MASS, districtMassTiles } from '../isoDistricts.js';

const L = {
  districts: [
    { gx: 10, gy: 12, size: 3, kind: 'palace' },
    { gx: 30, gy: 8, size: 2, kind: 'market' },
    { gx: 50, gy: 40, size: 4, kind: 'arcology' },
    { gx: 5, gy: 5, size: 2, kind: 'genre-inconnu' },
  ],
};

let savedAt;
afterEach(() => { DISTRICT_MASS.on = true; CM.layoutRecomputeAt = savedAt; });

describe('repères civiques', () => {
  it('un pseudo-tile par district, forme de tuile moteur, marqueur __district', () => {
    savedAt = CM.layoutRecomputeAt; CM.layoutRecomputeAt = 424242;
    const ts = districtMassTiles(L);
    expect(ts.length).toBe(4);
    for (let i = 0; i < ts.length; i += 1) {
      const t = ts[i], d = L.districts[i];
      expect(t.gx).toBe(d.gx); expect(t.gy).toBe(d.gy);
      expect(t.spanX).toBe(d.size); expect(t.spanY).toBe(d.size);
      expect(t.type).toBe('engine');
      expect(typeof t.buildingId).toBe('string');
      expect(t.buildingId.length).toBeGreaterThan(0);
      expect(t.__district).toBe(d.kind);
    }
    // Un genre inconnu retombe sur un art par défaut — jamais un pseudo-tile muet.
    expect(ts[3].buildingId).toBe('courthouses');
    // Mémo par layout : même identité d'objets tant que le recompute n'a pas tourné.
    expect(districtMassTiles(L)).toBe(ts);
  });

  it('coupé (__districtMass(false)), la couche rend null — zéro item', () => {
    savedAt = CM.layoutRecomputeAt; CM.layoutRecomputeAt = 424243;
    DISTRICT_MASS.on = false;
    expect(districtMassTiles(L)).toBe(null);
  });
});
