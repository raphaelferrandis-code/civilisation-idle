// LE MÉTRO DU QUAI (lot 3 de docs/PLAN-ETAGES.md) — le plan pur.
// Ce que le rendu suppose : la rive opposée au cœur, une ligne au-dessus de la
// berge (jamais bâtie), lissée, avec une rampe à chaque bout, et le monorail à
// partir de la bande 7.
import { describe, it, expect } from 'vitest';
import { METRO, metroSide, bankRowAt, planMetro } from '../procedural/metroPlan.js';

// Fleuve horizontal, eau sur les rangées 40-44 (une marche à la colonne 50 : 40-45),
// berges = la rangée qui suit l'eau de chaque côté.
const N = 120;
const water = (x, y) => y >= 40 && y <= (x >= 50 ? 45 : 44);
const river = { present: true, riverYAt: () => 42, isWater: water };
const builtSouth = (x, y) => y >= 48 && y <= 52 && x >= 20 && x <= 100;

describe('metroSide — la rive opposée au cœur', () => {
  it('cœur au nord → rive sud (+1), et inversement', () => {
    expect(metroSide(river, { x: 60, y: 30 })).toBe(1);
    expect(metroSide(river, { x: 60, y: 55 })).toBe(-1);
  });
  it('pas de fleuve → 0', () => {
    expect(metroSide({ present: false }, { x: 1, y: 1 })).toBe(0);
  });
});

describe('bankRowAt', () => {
  it('première rangée sèche depuis la ligne d\'eau, de chaque côté', () => {
    expect(bankRowAt(river, 10, 1, N)).toBe(45);
    expect(bankRowAt(river, 60, 1, N)).toBe(46);
    expect(bankRowAt(river, 10, -1, N)).toBe(39);
  });
});

describe('planMetro', () => {
  const args = { river, core: { x: 60, y: 30 }, N, band: 5, built: builtSouth };
  it('avant la bande 5 : rien', () => {
    expect(planMetro({ ...args, band: 4 })).toBeNull();
  });
  it('rive sud, sur la longueur où la ville borde le quai', () => {
    const p = planMetro(args);
    expect(p.sign).toBe(1);
    expect(p.x0).toBeGreaterThanOrEqual(19);
    expect(p.x1).toBeLessThanOrEqual(102);
    expect(p.mono).toBe(false);
  });
  it('au-dessus de la berge, jamais de l\'eau, et sans escalier', () => {
    const p = planMetro(args);
    for (const q of p.pts) {
      const row = Math.floor(q.y);
      expect(water(q.x, row) && water(q.x, row + 1)).toBe(false);
      expect(q.y).toBeGreaterThan(44.5);
      expect(q.y).toBeLessThan(47);
    }
    for (let i = 1; i < p.pts.length; i += 1) expect(Math.abs(p.pts[i].y - p.pts[i - 1].y)).toBeLessThan(0.3);
  });
  it('rampe à chaque bout, tablier plein au milieu', () => {
    const p = planMetro(args);
    expect(p.pts[0].z).toBe(0);
    expect(p.pts[p.pts.length - 1].z).toBe(0);
    expect(p.pts[Math.floor(p.pts.length / 2)].z).toBe(METRO.deck);
    for (const q of p.pts) expect(q.z).toBeLessThanOrEqual(METRO.deck);
  });
  it('stations entre les rampes, régulières', () => {
    const p = planMetro(args);
    expect(p.stations.length).toBeGreaterThan(1);
    for (const x of p.stations) { expect(x).toBeGreaterThan(p.x0 + METRO.ramp); expect(x).toBeLessThan(p.x1 - METRO.ramp); }
    for (let i = 1; i < p.stations.length; i += 1) expect(p.stations[i] - p.stations[i - 1]).toBe(METRO.station);
  });
  it('la même ligne devient monorail à la bande 7', () => {
    const a = planMetro(args), b = planMetro({ ...args, band: 7 });
    expect(b.mono).toBe(true);
    expect(b.pts).toEqual(a.pts);
  });
  it('une ville qui ne borde pas le quai : pas de ligne', () => {
    expect(planMetro({ ...args, built: () => false })).toBeNull();
  });
});
