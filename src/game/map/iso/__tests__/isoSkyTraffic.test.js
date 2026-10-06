// LE CIEL HABITÉ (lot 1 de docs/PLAN-ETAGES.md) — les invariants qui tiennent
// l'illusion : couloirs au-dessus des rues de la ville, pas de croisement à niveau,
// tirages déterministes, ciel vide avant la bande 7.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CM } from '../../layout.js';
import { SKY, SKY_BANDS, roadRuns, pickLanes, laneCars, riverLanes, h01, skyTrafficActors, skyStats, streetKey, gateEnds, GATE_FADE,
  CROSS, crossWater, laneAlt, laneY, ISLE_SKIRT, skyLanesOf } from '../isoSkyTraffic.js';
import { elevatedActors } from '../isoElevated.js';
import { floatIsleSpan, ISLE } from '../isoFloatIsle.js';
import { depthOf } from '../projection.js';
import { state } from '../../../core/state.js';
import { growCity } from '../../../../test/city.js';

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
    expect(SKY_BANDS[8].keep).toBeGreaterThan(SKY_BANDS[7].keep);
    expect(SKY_BANDS[9].keep).toBeGreaterThanOrEqual(SKY_BANDS[8].keep);
    expect(SKY_BANDS[9].sep).toBeLessThan(SKY_BANDS[7].sep);
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

describe('profondeur et portes de couloir', () => {
  it("au-dessus d'une rue en x : après les voisins du nord, avant ceux du sud", () => {
    const r = 10, x = 20.4;                       // rue sur la rangée 10, véhicule en x = 20,4
    const k = streetKey('x', r, x * T, T) / T;
    // voisin nord sur 2 cases de large qui déborde le long de la rue : coin sud (x1, r)
    expect(k).toBeGreaterThan((x + 1.5) + r);
    // voisin sud juste en face : coin sud (x1, r + 2)
    expect(k).toBeLessThan(Math.ceil(x) + (r + 2));
    // et après le sol de la rue qu'il survole
    expect(k).toBeGreaterThan(x + r + 1);
  });
  it('une porte par couloir et par bout, jamais au-dessus du fleuve', () => {
    const lanes = [
      { id: 1, axis: 'x', dir: 1, c: 5.28 * T, row: 5, a: 10 * T, b: 40 * T, alt: 3 * T },
      { id: 2, axis: 'x', dir: -1, c: 5.72 * T, row: 5, a: 10 * T, b: 40 * T, alt: 3 * T },
      { id: 3, axis: 'x', dir: 1, c: 50 * T, river: true, a: 0, b: 90 * T, alt: 3 * T },
    ];
    const g = gateEnds(lanes);
    expect(g).toHaveLength(2);
    expect(g.map((q) => q.along / T).sort((p, q) => p - q)).toEqual([10, 40]);
  });
  it("un véhicule s'efface DANS la porte, pas au milieu du couloir", () => {
    const lane = { id: 77, axis: 'x', dir: 1, alt: 3 * T, c: 5 * T, a: 10 * T, b: 60 * T, speed: 2 * T, gap: 2 * T, off: 0 };
    for (let t = 0; t < 20; t += 0.37) {
      for (const c of laneCars(lane, t, 1, T)) {
        const dEnd = Math.min(c.s - lane.a, lane.b - c.s);
        if (dEnd > GATE_FADE * T) expect(c.fade).toBe(1);
      }
    }
  });
});

// RETOUR RAPH (2026-10-06) : les voitures volantes « ne passent pas au-dessus du
// fleuve, elles disparaissent ». Les rues qui descendent au fleuve s'arrêtent au quai
// (l'eau n'est pas la ville) : leur couloir finissait dans une porte sur la berge, et
// chaque voiture s'y effaçait au bord de l'eau. Le couloir franchit maintenant l'eau.
describe('le fleuve ne coupe plus un couloir (crossWater)', () => {
  // fleuve horizontal : rangées 20 à 27 (8 cases d'eau)
  const wet = (x, y) => y >= 20 && y <= 27;
  const N = 60;
  const run = (c, a, b) => ({ axis: 'y', c, a, b });
  it('une rue qui bute sur le quai franchit l\'eau ; sa porte va sur la première case de l\'autre rive', () => {
    // la rue s'arrête 2 cases avant l'eau (la promenade du quai)
    expect(crossWater([run(10, 2, 18)], wet, null, N)).toEqual([run(10, 2, 29)]);
    // depuis la rive sud, dans l'autre sens
    expect(crossWater([run(10, 30, 50)], wet, null, N)).toEqual([run(10, 19, 50)]);
  });
  it('retrouve la rue de la même colonne sur l\'autre rive : un seul couloir, liste alignée', () => {
    const out = crossWater([run(10, 2, 18), run(30, 2, 18), run(10, 29, 45)], wet, null, N);
    expect(out[0]).toEqual(run(10, 2, 45));
    expect(out[1]).toEqual(run(30, 2, 29));
    expect(out[2]).toBeNull();                    // fusionnée : même rang, même hauteur pour les autres
  });
  it('rien ne change loin de l\'eau, sur un fleuve trop large, ou quand un obstacle se dresse sur le trajet', () => {
    expect(crossWater([run(10, 2, 15)], wet, null, N)).toEqual([run(10, 2, 15)]);   // 5 cases de quai
    const wide = (x, y) => y >= 20 && y < 20 + CROSS.water + 2;
    expect(crossWater([run(10, 2, 18)], wide, null, N)).toEqual([run(10, 2, 18)]);
    const isle = (x, y) => x === 10 && y === 23;                                    // l'île d'une merveille
    expect(crossWater([run(10, 2, 18)], wet, isle, N)).toEqual([run(10, 2, 18)]);
    const bank = (x, y) => x === 10 && y === 28;                                    // un bâtiment sur la berge
    expect(crossWater([run(10, 2, 18)], wet, bank, N)).toEqual([run(10, 2, 18)]);
    expect(crossWater([run(10, 2, 58)], wet, null, N)[0]).toEqual(run(10, 2, 58));  // pas d'eau au bout
  });
  it('le métro du quai d\'en face se survole, on ne s\'y pose pas ; la bande 7 l\'enjambe d\'une bosse', () => {
    const metro = (x, y) => y === 28 || y === 29;
    const [r] = crossWater([run(10, 2, 18)], wet, null, N, metro);
    expect(r.b).toBe(31);                       // porte sur la case 30, derrière la ligne
    expect(r.over).toEqual([[28, 30]]);
    const lanes7 = pickLanes([run(10, 2, 18)], SKY_BANDS[7], 30, 30, T, (l) => crossWater(l, wet, null, N, metro));
    const ln = lanes7[0];
    expect(ln.alt).toBeLessThan(CROSS.over * T);
    expect(laneAlt(ln, 29 * T)).toBeCloseTo(CROSS.over * T, 6);   // au-dessus de la ligne
    expect(laneAlt(ln, 10 * T)).toBe(ln.alt);                    // ailleurs, sa hauteur
    // la montée est continue (pas de saut d'une frame à l'autre)
    for (let s = 20 * T; s < 31 * T; s += 0.1 * T) expect(Math.abs(laneAlt(ln, s + 0.1 * T) - laneAlt(ln, s))).toBeLessThan(0.1 * T);
    // la porte d'arrivée est à la hauteur de la voie à ce bout
    expect(gateEnds(lanes7).find((g) => !g.isStart).alt).toBeCloseTo(laneAlt(ln, ln.b), 6);
    // bandes 8-9 : assez haut, pas de bosse
    expect(pickLanes([run(10, 2, 18)], SKY_BANDS[9], 30, 30, T, (l) => crossWater(l, wet, null, N, metro))[0].humps).toBeNull();
  });
  it('sans franchissement, les couloirs restent ceux des rues (même choix, mêmes hauteurs)', () => {
    const runs = [run(10, 2, 18), run(40, 0, 60), { axis: 'x', c: 5, a: 0, b: 50 }];
    const plain = pickLanes(runs, SKY_BANDS[9], 30, 30, T);
    const crossed = pickLanes(runs, SKY_BANDS[9], 30, 30, T, (l) => crossWater(l, wet, null, N));
    expect(crossed.map((l) => [l.id, l.alt])).toEqual(plain.map((l) => [l.id, l.alt]));
  });
});

describe('la ville des tests à la bande 7 : aucun couloir ne finit au bord de l\'eau', () => {
  beforeEach(() => {
    state.cityRoads = null; state.cityCore = null; state.cityMapSlots = {}; state.cityArchetype = null; state.cityPersonality = null; state.riverWP = null;
    state.wonders = [];
  });
  it('les rues qui descendent au fleuve le franchissent, portes au sec', () => {
    const L = growCity(40, 60);
    expect(L.counts.eraBand).toBe(7);
    const R = L.river, Tt = CM.TILE;
    const lanes = skyLanesOf(L, 7).filter((l) => !l.river && l.axis === 'y' && l.dir === 1);
    let crossing = 0;
    for (const l of lanes) {
      const a = Math.round(l.a / Tt - 0.3), b = Math.round(l.b / Tt + 0.3);
      // aucune porte à 3 cases ou moins de l'eau, côté eau (dans cette ville, rien ne
      // barre le passage) ; les portes au sec
      for (let k = 0; k < CROSS.reach; k += 1) {
        expect(R.isWater(l.row, b + k), `couloir ${l.row} : porte au bord de l'eau (bout sud)`).toBe(false);
        expect(R.isWater(l.row, a - 1 - k), `couloir ${l.row} : porte au bord de l'eau (bout nord)`).toBe(false);
      }
      expect(R.isWater(l.row, a) || R.isWater(l.row, b - 1)).toBe(false);
      let w = false; for (let y = a; y < b; y += 1) if (R.isWater(l.row, y)) w = true;
      if (w) crossing += 1;
    }
    expect(crossing, 'couloirs au-dessus du fleuve').toBeGreaterThan(0);
  });
});

// Au-dessus du fleuve, l'îlot flottant (bande 9) coupait net les voies : la voiture
// disparaissait dans son emprise et reparaissait 7 cases plus loin.
describe('les voies du fleuve contournent le quartier flottant', () => {
  const water = (x, y) => y >= 46 && y <= 53;
  const river = { present: true, riverYAt: () => 49.5, isWater: water, bridge: { x: 60, y: 49.5 } };
  const layout = () => ({ gridN: 120, mapSeed: 12345, cx: 60, cy: 60, counts: { eraBand: 9 }, roadSet: new Set(), roadMap: new Map(), urbanSet: null, river });
  let saved;
  beforeEach(() => { saved = { layout: CM.layout, cam: { ...CM.cam }, cw: CM.cw, ch: CM.ch, lod: CM.lodActive }; });
  afterEach(() => { CM.layout = saved.layout; Object.assign(CM.cam, saved.cam); CM.cw = saved.cw; CM.ch = saved.ch; CM.lodActive = saved.lod; });
  it('s\'écartent de l\'îlot, chacune de son côté, sans saut', () => {
    const isle = floatIsleSpan(layout());
    expect(isle).not.toBeNull();
    const xc = (isle.x0 + isle.x1) / 2;
    for (const ln of riverLanes(river, 120, 2, [2.6, 5.2], T, isle)) {
      const off = (wx) => laneY(ln, wx, river, T) - 49.5 * T;
      // au droit de l'îlot : hors de son rayon, du côté de la voie
      expect(Math.abs(off(xc))).toBeGreaterThanOrEqual((ISLE.R + ISLE_SKIRT.margin - 0.01) * T);
      expect(Math.sign(off(xc))).toBe(Math.sign(ln.cOff));
      // loin de lui : la voie d'origine
      expect(off(xc + 20 * T)).toBeCloseTo(ln.cOff, 6);
      for (let wx = xc - 12 * T; wx < xc + 12 * T; wx += 0.1 * T) expect(Math.abs(off(wx + 0.1 * T) - off(wx))).toBeLessThan(0.1 * T);
    }
  });
  it('des voitures passent au droit de l\'îlot (elles y étaient coupées)', () => {
    const L = layout();
    CM.layout = L; CM.lodActive = false; CM.cw = 1200; CM.ch = 800;
    const isle = floatIsleSpan(L);
    CM.cam.x = (isle.x0 + isle.x1) / 2; CM.cam.y = 49.5 * T; CM.cam.zoom = 1;
    let inSpan = 0;
    for (let t = 0; t < 40000; t += 500) {
      const out = [];
      skyTrafficActors(t, out);
      // véhicules du fleuve : clé à l'aplomb + 0,05 tuile
      inSpan += out.filter((a) => a.wx > isle.x0 && a.wx < isle.x1 && Math.abs(a.d - (depthOf(a.wx, a.wy) + 0.05 * T)) < 1e-6).length;
    }
    expect(inSpan).toBeGreaterThan(0);
  });
});
