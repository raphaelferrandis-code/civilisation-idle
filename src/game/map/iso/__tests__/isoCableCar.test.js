// LE TÉLÉPHÉRIQUE DU FLEUVE (dernier lot de docs/PLAN-ETAGES.md).
import { describe, it, expect } from 'vitest';
import { cableSite, cableZ, CABLE } from '../isoCableCar.js';
import { planMetro, METRO } from '../../procedural/metroPlan.js';
import { isleSideOf } from '../isoFloatIsle.js';

const N = 160;
const water = (x, y) => y >= 60 && y <= 67;
const river = { present: true, riverYAt: () => 63.5, isWater: water, bridge: { x: 80, y: 63.5 } };
const built = (x, y) => y >= 70 && y <= 76 && x >= 20 && x <= 140;
const L = (band, extra = {}) => ({ gridN: N, mapSeed: 777, counts: { eraBand: band }, river, plan: { core: { x: 80, y: 50 } }, ...extra });
const metroOf = (band) => planMetro({ river, core: { x: 80, y: 50 }, N, band, built });

describe('cableSite', () => {
  it('avant la bande 5, ou sans métro : rien', () => {
    expect(cableSite(L(4), metroOf(4))).toBeNull();
    expect(cableSite(L(5), null)).toBeNull();
  });
  it('une station du métro, à 10-30 cases du pont, du côté opposé à l\'îlot', () => {
    const m = metroOf(5);
    const s = cableSite(L(5), m);
    expect(s).not.toBeNull();
    const x = Math.floor(s.x);
    expect(m.stations).toContain(x);
    expect(Math.abs(s.x - 80)).toBeGreaterThanOrEqual(10);
    expect(Math.abs(s.x - 80)).toBeLessThanOrEqual(31);
    expect(Math.sign(s.x - 80)).toBe(-isleSideOf(L(5)));
  });
  it('part de la rive du cœur, arrive sur la station (au-dessus du tablier)', () => {
    const m = metroOf(5);
    const s = cableSite(L(5), m);
    expect(s.yN).toBeLessThan(60);            // rive nord = celle du cœur
    expect(s.yS).toBeGreaterThan(67);         // rive sud = celle du métro
    expect(s.baseN).toBe(0);
    expect(s.baseS).toBeGreaterThan(METRO.deck);
  });
  it('s\'écarte du Vieux-Port', () => {
    const m = metroOf(5);
    const a = cableSite(L(5), m);
    const b = cableSite(L(5, { ports: { old: { gx: Math.floor(a.x) - 2, gy: 50, w: 5, h: 7 } } }), m);
    if (b) expect(Math.abs(b.x - a.x)).toBeGreaterThan(4);
  });
});

describe('cableZ', () => {
  it('haut aux deux bouts, le creux au milieu', () => {
    expect(cableZ(0)).toBe(CABLE.top);
    expect(cableZ(1)).toBe(CABLE.top);
    expect(cableZ(0.5)).toBeCloseTo(CABLE.top - CABLE.sag, 6);
  });
  it('toujours au-dessus du métro', () => {
    for (let u = 0; u <= 1; u += 0.05) expect(cableZ(u)).toBeGreaterThan(METRO.deck + 0.6);
  });
});
