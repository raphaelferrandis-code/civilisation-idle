// INVARIANT : le moulin est un moteur TERRESTRE (moulin à vent).
//
// Refonte 2026-07-28 demandée par Raph : le moulin à eau posé sur le fleuve était
// compliqué à placer, rendait mal et trouait les quais sur les deux rives. Il
// devient un champ de moulins à vent en périphérie : tours à hélice, multi
//-instances halle + ateliers, plus aucune cellule d'emprise sur l'eau ni la berge.
//
// ⚠ Ces gardes ont été vérifiées ROUGES sur le moulin riverain (1 seule tuile,
// emprise dans river.cells par construction, waterSide:"S", slot zone:"river").
import { describe, it, expect } from 'vitest';
import { computeCityLayout } from '../layout.js';
import { defaultState } from '../../core/state.js';
import { D } from '../../core/num.js';

function city(perType) {
  const s = defaultState();
  s.cycles = 1;
  s.mapSeed = 0x51a7c0de;
  s.population = D('1e18');
  s.infrastructure = D('1e12');
  s.knowledge = D('1e12');
  for (const k of Object.keys(s.buildings)) s.buildings[k] = perType;
  return s;
}

const millTiles = (L) => L.tiles.filter((t) => t.buildingId === 'water_mills');

// Layouts denses complets à froid : frôlent le testTimeout vitest par défaut
// (5 s) sous contention de suite. Gardes d'invariant, pas de perf : marge.
const SLOW = 20000;

describe('moulins à vent — des moteurs terrestres comme les autres', () => {
  it('aucune cellule d\'emprise sur l\'eau ni la berge, pas de bord mouillé', () => {
    const L = computeCityLayout(city(60));
    // Sans fleuve, la garde passerait pour de mauvaises raisons.
    expect(L.river && L.river.present, 'pas de fleuve : scénario vide').toBe(true);

    const mills = millTiles(L);
    expect(mills.length, 'le champ de moulins suit les achats').toBeGreaterThanOrEqual(2);
    for (const t of mills) {
      expect(t.waterSide, `moulin @${t.gx},${t.gy} : bord mouillé`).toBeUndefined();
      const sx = t.spanX || t.size || 1, sy = t.spanY || t.size || 1;
      for (let ax = 0; ax < sx; ax += 1) {
        for (let ay = 0; ay < sy; ay += 1) {
          const k = (t.gx + ax) + ',' + (t.gy + ay);
          expect(L.river.cells.has(k), `moulin @${k} : dans le fleuve`).toBe(false);
          expect(L.river.banks.has(k), `moulin @${k} : sur la berge`).toBe(false);
        }
      }
    }
  }, SLOW);

  it('un vieux slot riverain est ignoré et réécrit au format terrestre', () => {
    // Les saves d'avant la refonte gardent un slot de moulin RELATIF AU FLEUVE
    // (dy pointé sur la rangée sud = centre du fleuve, zone:"river") sous la
    // même clé que la nouvelle halle. Il doit être écarté, la halle posée sur
    // terre, et le slot réécrit par le chemin générique.
    const s = city(60);
    s.cityMapSlots['1:water_mills:0'] = { dx: 0, dy: 12, sy: 4, zone: 'river', id: 'water_mills' };
    const L = computeCityLayout(s);

    const mills = millTiles(L);
    expect(mills.length).toBeGreaterThanOrEqual(2);
    for (const t of mills) {
      const sx = t.spanX || t.size || 1, sy = t.spanY || t.size || 1;
      for (let ax = 0; ax < sx; ax += 1) for (let ay = 0; ay < sy; ay += 1) {
        expect(L.river.cells.has((t.gx + ax) + ',' + (t.gy + ay))).toBe(false);
      }
    }
    const slot = s.cityMapSlots['1:water_mills:0'];
    expect(slot, 'slot de halle non réécrit').toBeTruthy();
    expect(slot.zone).not.toBe('river');
  }, SLOW);
});
