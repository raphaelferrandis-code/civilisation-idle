// LES REPÈRES CIVIQUES — les invariants de la sélection et du pseudo-tile.
//
// La règle est née d'un retour de Raph sur la v1 (« ça alourdit beaucoup le
// rendu ») : UNE masse par GENRE, celle la plus proche du cœur — la hiérarchie
// est rare par définition. Le reste des emprises reste du tissu réservé.
import { describe, it, expect, afterEach } from 'vitest';
import { CM } from '../../layout.js';
import { DISTRICT_MASS, districtLandmarks, districtMassTiles } from '../isoDistricts.js';

const L = {
  plan: { core: { x: 50, y: 50 } }, cx: 50, cy: 50,
  districts: [
    { gx: 60, gy: 60, size: 3, kind: 'palace', civic: true },   // loin
    { gx: 52, gy: 48, size: 3, kind: 'palace', civic: true },   // LE plus proche → élu
    { gx: 30, gy: 50, size: 2, kind: 'market', civic: true },
    { gx: 44, gy: 52, size: 4, kind: 'genre-inconnu', civic: true },
    { gx: 40, gy: 40, size: 3, kind: 'forum', civic: false },   // dense : jamais
  ],
};

let savedAt;
afterEach(() => { DISTRICT_MASS.on = true; CM.layoutRecomputeAt = savedAt; });

describe('repères civiques', () => {
  it('UN par genre, le plus proche du cœur — jamais le tissu dense', () => {
    savedAt = CM.layoutRecomputeAt; CM.layoutRecomputeAt = 424242;
    const picks = districtLandmarks(L);
    expect(picks.length).toBe(3);                       // palace, market, genre-inconnu
    const palace = picks.find((d) => d.kind === 'palace');
    expect(palace.gx).toBe(52);                          // le proche a gagné
    expect(picks.some((d) => d.kind === 'forum')).toBe(false);   // dense écarté
  });

  it('le pseudo-tile a la forme d une tuile moteur, marqueur __district', () => {
    savedAt = CM.layoutRecomputeAt; CM.layoutRecomputeAt = 424243;
    const ts = districtMassTiles(L);
    expect(ts.length).toBe(3);
    for (const t of ts) {
      expect(t.type).toBe('engine');
      expect(typeof t.buildingId).toBe('string');
      expect(t.buildingId.length).toBeGreaterThan(0);
      expect(typeof t.__district).toBe('string');
      expect(t.spanX).toBe(t.spanY);
    }
    // Un genre inconnu retombe sur un art par défaut — jamais un pseudo-tile muet.
    expect(ts.find((t) => t.__district === 'genre-inconnu').buildingId).toBe('courthouses');
    // Mémo par layout : même identité d'objets tant que le recompute n'a pas tourné.
    expect(districtMassTiles(L)).toBe(ts);
  });

  it('coupé (__districtMass(false)), la couche rend null — zéro item', () => {
    savedAt = CM.layoutRecomputeAt; CM.layoutRecomputeAt = 424244;
    DISTRICT_MASS.on = false;
    expect(districtLandmarks(L)).toBe(null);
    expect(districtMassTiles(L)).toBe(null);
  });
});
