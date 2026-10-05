// LA POSE DES ÉTAGES AU REPOS NE REPASSE PLUS PAR LE CACHE (audit du 05/10, PERF-54).
//
// Au repos, chaque tronçon d'autoroute ou de métro demandait son image à
// elevPaint.getZ, qui reconcaténait deux clés et faisait quatre opérations de Map et un
// Set — et l'appelant rebâtissait d'abord sa clé de forme (géométrie arrondie, bande…)
// à chaque frame. Mesuré : ~0,7 ms par frame pour 650 acteurs d'autoroute, ~0,1 ms pour
// le métro. Désormais la pose de repos de chaque forme est retenue (getZ), et les clés
// de forme sont gardées sur le plan. Ce que ces tests tiennent :
//   · au repos, la même image qu'avant, sans une opération de Map par forme ;
//   · le retour au zoom d'avant, le glissement et la purge rendent ce que rendait le
//     cache (une forme purgée est recuite à sa prochaine pose) ;
//   · une frame d'autoroute au repos ne touche plus à aucune Map.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CM } from '../layout.js';
import { makeBakeCache } from '../iso/elevPaint.js';
import { planHighway } from '../procedural/highwayPlan.js';
import { highwayActors, HWY } from '../iso/isoHighway.js';

const cam0 = { ...CM.cam }, goal0 = CM.zoomGoal, dpr0 = CM.dpr, cap0 = CM.capture;
const restore = () => { CM.cam = { ...cam0 }; CM.zoomGoal = goal0; CM.dpr = dpr0; CM.capture = cap0; };
const pose = (z) => { CM.cam.zoom = z; CM.zoomGoal = z; };

describe('elevPaint.getZ : la pose de repos retenue', () => {
  beforeEach(restore);
  afterEach(() => { vi.restoreAllMocks(); restore(); });

  it('au repos : la même image, et plus aucune opération de Map par forme', () => {
    const C = makeBakeCache(100);
    let n = 0;
    const make = (z) => { n += 1; return { z, n }; };
    pose(1.25);
    const a = C.getZ('forme', 1, make), b = C.getZ('autre', 1, make);
    const set = vi.spyOn(Map.prototype, 'set'), del = vi.spyOn(Map.prototype, 'delete');
    for (let f = 0; f < 10; f += 1) {
      expect(C.getZ('forme', 1, make)).toBe(a);
      expect(C.getZ('autre', 1, make)).toBe(b);
    }
    expect(set).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
    expect(n).toBe(2);
    // Un autre dpr est une autre image.
    expect(C.getZ('forme', 2, make)).not.toBe(a);
  });

  it("retour au zoom d'avant, glissement : ce que rendait le cache", () => {
    const C = makeBakeCache(100);
    const make = (z) => ({ z });
    pose(1);
    const a1 = C.getZ('A', 1, make);
    pose(1.5);
    const a15 = C.getZ('A', 1, make);
    expect(a15.z).toBe(1.5);
    pose(1);                                   // l'avant-dernier zoom de repos est gardé
    expect(C.getZ('A', 1, make)).toBe(a1);
    // Glissement vers 2 : la dernière pose de repos, posée à l'échelle.
    CM.zoomGoal = 2;
    CM.cam.zoom = 1.2;
    expect(C.getZ('A', 1, make)).toBe(a1);
    pose(2);
    expect(C.getZ('A', 1, make).z).toBe(2);
    pose(1);                                   // gardé : l'avant-dernier repos
    expect(C.getZ('A', 1, make)).toBe(a1);
    pose(1.5);                                 // parti (deux zooms de repos) : recuit
    const r = C.getZ('A', 1, make);
    expect(r).not.toBe(a15);
    expect(r.z).toBe(1.5);
  });

  it('au débordement, une forme purgée est recuite à sa prochaine pose', () => {
    const C = makeBakeCache(4);
    const made = [];
    const make = (k) => (z) => { made.push(k); return { z, k }; };
    pose(1);
    const first = {};
    for (const k of ['A', 'B', 'C', 'D']) first[k] = C.getZ(k, 1, make(k));
    for (const k of ['A', 'B', 'C', 'D']) expect(C.getZ(k, 1, make(k))).toBe(first[k]);
    C.getZ('E', 1, make('E'));                 // purge de la moitié la plus ancienne : A, B
    expect(C.getZ('C', 1, make('C'))).toBe(first.C);
    const a2 = C.getZ('A', 1, make('A'));
    expect(a2).not.toBe(first.A);
    expect(a2).toEqual(first.A);               // la même image, recuite
    expect(made).toEqual(['A', 'B', 'C', 'D', 'E', 'A']);
  });
});

describe('autoroute : une frame au repos ne touche plus aux Map', () => {
  afterEach(() => { vi.restoreAllMocks(); restore(); HWY.cars = 1; CM.layout = null; });

  it('ni clé rebâtie ni opération de cache par tronçon', () => {
    const AX = 40, wet = (x, y) => y >= 48 && y <= 52;
    const H = planHighway({ N: 100, ax: AX, isWet: wet, isRoad: (x, y) => !wet(x, y) && (x === AX || x === AX + 1 || y % 5 === 0), inCity: (x, y) => y >= 8 && y <= 92, band: 6 });
    expect(H).toBeTruthy();
    CM.TILE = 32; CM.dpr = 1; CM.cw = 1600; CM.ch = 900; CM.nightF = 0;
    CM.layout = { counts: { eraBand: 6 }, highway: H };
    CM.cam = { x: AX * 32, y: 50 * 32, zoom: 0.8 };
    CM.zoomGoal = 0.8;
    HWY.cars = 0;
    const ctx = { globalAlpha: 1, imageSmoothingEnabled: false, drawImage() {} };
    const frame = (now) => { const out = []; highwayActors(now, out, 0); for (const a of out) a.draw(ctx, now); return out.length; };
    const n = frame(0);
    expect(n).toBeGreaterThan(50);
    const set = vi.spyOn(Map.prototype, 'set'), del = vi.spyOn(Map.prototype, 'delete');
    expect(frame(16)).toBe(n);
    expect(set).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
    vi.restoreAllMocks();
    // Une autre bande : d'autres formes, cuites (et retenues) à leur première pose.
    CM.layout.counts.eraBand = 7;
    const set2 = vi.spyOn(Map.prototype, 'set');
    frame(32);
    expect(set2).toHaveBeenCalled();
  });
});
