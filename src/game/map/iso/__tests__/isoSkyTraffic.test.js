// LE CIEL HABITÉ (lot 1 de docs/PLAN-ETAGES.md) — les invariants qui tiennent
// l'illusion : couloirs au-dessus des rues de la ville, pas de croisement à niveau,
// tirages déterministes, ciel vide avant la bande 7.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CM } from '../../layout.js';
import { SKY, SKY_BANDS, roadRuns, pickLanes, laneCars, riverLanes, h01, skyTrafficActors, skyStats } from '../isoSkyTraffic.js';
import { elevatedActors } from '../isoElevated.js';

const T = 32;
const set = (keys) => new Set(keys);
const row = (y, x0, x1) => { const k = []; for (let x = x0; x < x1; x += 1) k.push(x + ',' + y); return k; };
const col = (x, y0, y1) => { const k = []; for (let y = y0; y < y1; y += 1) k.push(x + ',' + y); return k; };

describe('roadRuns — les tronçons de rue droits', () => {
  it('trouve une rangée et une colonne, coupe aux trous, ignore les courts', () => {
    const rs = set([...row(5, 0, 20), ...row(5, 22, 26), ...col(3, 0, 15)]);
    const runs = roadRuns(rs, new Map(), 10);
    expect(runs).toContainEqual({ axis: 'x', c: 5, a: 0, b: 20 });
    expect(runs).toContainEqual({ axis: 'y', c: 3, a: 0, b: 15 });
    expect(runs.some((r) => r.axis === 'x' && r.a === 22)).toBe(false);   // 4 cellules < 10
  });
  it('les places coupent un tronçon', () => {
    const rs = set(row(5, 0, 30));
    const rm = new Map([['15,5', { rank: 'plaza' }]]);
    const runs = roadRuns(rs, rm, 10).filter((r) => r.axis === 'x');
    expect(runs).toEqual([{ axis: 'x', c: 5, a: 0, b: 15 }, { axis: 'x', c: 5, a: 16, b: 30 }]);
  });
  it('hors de la ville, rien : un ciel au-dessus des champs ne raconte rien', () => {
    const rs = set(row(5, 0, 40));
    const urban = set(row(5, 10, 25));
    const runs = roadRuns(rs, new Map(), 10, urban).filter((r) => r.axis === 'x');
    expect(runs).toEqual([{ axis: 'x', c: 5, a: 10, b: 25 }]);
  });
});

describe('pickLanes — les couloirs', () => {
  const runs = [
    { axis: 'x', c: 10, a: 0, b: 60 }, { axis: 'x', c: 12, a: 0, b: 50 },   // trop proche de 10
    { axis: 'x', c: 30, a: 0, b: 40 }, { axis: 'y', c: 20, a: 0, b: 55 },
  ];
  it('deux voies à contresens par rue, écart minimal entre couloirs parallèles', () => {
    const lanes = pickLanes(runs, SKY_BANDS[9], 30, 30, T);
    const xs = [...new Set(lanes.filter((l) => l.axis === 'x').map((l) => Math.round(l.c / T - 0.5)))];
    expect(xs.sort((a, b) => a - b)).toEqual([10, 30]);
    for (const c of [10, 30]) {
      const pair = lanes.filter((l) => l.axis === 'x' && Math.round(l.c / T - 0.5) === c);
      expect(pair.map((l) => l.dir).sort()).toEqual([-1, 1]);
    }
  });
  it('déterministe', () => {
    expect(pickLanes(runs, SKY_BANDS[8], 30, 30, T)).toEqual(pickLanes(runs, SKY_BANDS[8], 30, 30, T));
  });
});

describe('SKY_BANDS — les règles de l\'air', () => {
  it('ciel vide avant la bande 7', () => {
    for (let b = 0; b < 7; b += 1) expect(SKY_BANDS[b]).toBeUndefined();
  });
  it('les couloirs x et y ne volent jamais à la même hauteur', () => {
    for (const b of [7, 8, 9]) {
      const { x, y } = SKY_BANDS[b].tiers;
      for (const h of x) expect(y).not.toContain(h);
    }
  });
  it('le ciel s\'épaissit avec les ères', () => {
    expect(SKY_BANDS[8].cap).toBeGreaterThan(SKY_BANDS[7].cap);
    expect(SKY_BANDS[9].cap).toBeGreaterThan(SKY_BANDS[8].cap);
    expect(SKY_BANDS[9].jets).toBeGreaterThan(SKY_BANDS[8].jets);
  });
});

describe('laneCars — les véhicules d\'un couloir', () => {
  const lane = { id: 4242, axis: 'x', dir: 1, alt: 3 * T, c: 5 * T, a: 10 * T, b: 70 * T, speed: 2 * T, gap: 3 * T, off: 17 * T };
  it('pur : même instant → mêmes véhicules', () => {
    expect(laneCars(lane, 12.5, 0.8, T)).toEqual(laneCars(lane, 12.5, 0.8, T));
  });
  it('restent dans le tronçon, fondus aux bouts', () => {
    for (let t = 0; t < 30; t += 1.7) {
      for (const c of laneCars(lane, t, 1, T)) {
        expect(c.s).toBeGreaterThanOrEqual(lane.a);
        expect(c.s).toBeLessThan(lane.b);
        expect(c.fade).toBeGreaterThanOrEqual(0);
        expect(c.fade).toBeLessThanOrEqual(1);
      }
    }
  });
  it('avancent dans le sens de la voie', () => {
    const a = laneCars(lane, 10, 1, T), b = laneCars(lane, 10.2, 1, T);
    const moved = a.map((c, i) => b[i].s - c.s).filter((d) => Math.abs(d) < lane.gap);
    expect(moved.length).toBeGreaterThan(0);
    for (const d of moved) expect(d).toBeGreaterThan(0);
  });
  it('part gardée à 0 → aucun véhicule', () => {
    expect(laneCars(lane, 5, 0, T)).toEqual([]);
  });
});

describe('riverLanes — au-dessus du fleuve', () => {
  const river = { present: true, riverYAt: (x) => 40 + x * 0.1, isWater: (x) => x >= 5 && x < 95 };
  it('paires de voies sur toute la longueur où l\'eau coule', () => {
    const lanes = riverLanes(river, 100, 2, [2.6], T);
    expect(lanes).toHaveLength(4);
    for (const l of lanes) { expect(l.a).toBe(5 * T); expect(l.b).toBe(95 * T); expect(l.river).toBe(true); }
  });
  it('pas de fleuve, pas de couloir', () => {
    expect(riverLanes({ present: false }, 100, 2, [2.6], T)).toEqual([]);
    expect(riverLanes(null, 100, 2, [2.6], T)).toEqual([]);
  });
});

describe('les acteurs', () => {
  let saved;
  beforeEach(() => {
    saved = { layout: CM.layout, cam: { ...CM.cam }, cw: CM.cw, ch: CM.ch, lod: CM.lodActive };
    CM.cam.x = 40 * T; CM.cam.y = 40 * T; CM.cam.zoom = 1;
    CM.cw = 1200; CM.ch = 800; CM.lodActive = false;
  });
  afterEach(() => {
    CM.layout = saved.layout; Object.assign(CM.cam, saved.cam); CM.cw = saved.cw; CM.ch = saved.ch; CM.lodActive = saved.lod;
    Object.assign(SKY, { on: true, density: 1 });
  });
  const layout = (band) => ({
    gridN: 80, cx: 40, cy: 40, counts: { eraBand: band },
    roadSet: set([...row(38, 10, 70), ...col(42, 10, 70), ...row(50, 10, 70)]),
    roadMap: new Map(), urbanSet: null, river: { present: false },
  });
  it('bande 6 : aucun acteur', () => {
    CM.layout = layout(6);
    const out = [];
    skyTrafficActors(1000, out);
    expect(out).toEqual([]);
  });
  it('bande 9 : des véhicules, chacun avec son ombre, déterministes', () => {
    CM.layout = layout(9);
    const a = [], b = [];
    skyTrafficActors(4000, a);
    const n = skyStats.cars;
    skyTrafficActors(4000, b);
    expect(n).toBeGreaterThan(0);
    expect(a.length).toBe(b.length);
    expect(a.map((x) => [x.wx, x.wy, x.d])).toEqual(b.map((x) => [x.wx, x.wy, x.d]));
    // ombre (au sol, décalée vers +x) + véhicule : au moins 2 acteurs par véhicule
    expect(a.length).toBeGreaterThanOrEqual(2 * n);
  });
  it('molette coupée : rien', () => {
    CM.layout = layout(9);
    SKY.on = false;
    const out = [];
    skyTrafficActors(4000, out);
    expect(out).toEqual([]);
  });
  it('elevatedActors sans layout : liste vide, jamais d\'exception', () => {
    CM.layout = null;
    expect(elevatedActors(0)).toEqual([]);
  });
  it('h01 dans [0, 1)', () => {
    for (let i = -50; i < 50; i += 1) { const v = h01(i * 7919); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); }
  });
});
