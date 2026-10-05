// LES ÉTAGES NE RECUISENT PLUS À CHAQUE FRAME D'UN ZOOM (audit du 05/10, PERF-15).
//
// Métro, autoroute, téléphérique, ciel habité et îlot flottant cuisaient leurs images
// au zoom BRUT de la caméra, qui glisse vers sa cible pendant 7 à 19 frames par cran
// de molette : tout ce qui était visible se recuisait à chaque frame. elevPaint.getZ
// ne cuit plus qu'au zoom de REPOS ; pendant le glissement, la dernière cuisson de la
// forme est posée à l'échelle. Ce que ces tests tiennent :
//   · au repos, la cuisson est celle d'avant (zoom exact, pixel d'art du zoom courant),
//     et blitBaked la pose exactement comme avant ;
//   · pendant le glissement, aucune forme déjà cuite n'est recuite ; une forme neuve
//     l'est une fois, au zoom cible, et ne prend pas la place de la cuisson de repos ;
//   · le cache ne garde que les deux derniers zooms de repos.
import { describe, it, expect, beforeEach } from 'vitest';
import { CM } from '../layout.js';
import { makeBakeCache, blitBaked, artKdAt } from '../iso/elevPaint.js';
import { vieK } from '../iso/isoVie.js';

const cam0 = { ...CM.cam }, goal0 = CM.zoomGoal, dpr0 = CM.dpr, cap0 = CM.capture;
const restore = () => { CM.cam = { ...cam0 }; CM.zoomGoal = goal0; CM.dpr = dpr0; CM.capture = cap0; };

describe('elevPaint.getZ : cuire au zoom de repos', () => {
  beforeEach(restore);

  it('au repos : une cuisson au zoom exact, gardée', () => {
    const C = makeBakeCache(100);
    let n = 0;
    const make = (z) => { n += 1; return { z, n }; };
    CM.cam.zoom = 1.25; CM.zoomGoal = 1.25;
    const a = C.getZ('forme', 1, make);
    expect(a.z).toBe(1.25);
    expect(C.getZ('forme', 1, make)).toBe(a);
    expect(n).toBe(1);
    restore();
  });

  it("pendant un glissement : rien n'est recuit, une forme neuve l'est une fois au zoom cible", () => {
    const C = makeBakeCache(100);
    const made = [];
    const make = (k) => (z) => { made.push([k, z]); return { z, k }; };
    CM.cam.zoom = 1; CM.zoomGoal = 1;
    const a = C.getZ('A', 1, make('A'));
    // Un cran de molette : le zoom glisse de 1 vers 1,5 en dix frames.
    CM.zoomGoal = 1.5;
    let b = null;
    for (let f = 1; f <= 10; f += 1) {
      CM.cam.zoom = 1 + 0.5 * (1 - Math.pow(0.6, f));
      expect(C.getZ('A', 1, make('A'))).toBe(a);
      b = C.getZ('B', 1, make('B'));
    }
    expect(made).toEqual([['A', 1], ['B', 1.5]]);
    // Posé : chacun recuit UNE fois au zoom exact — B aussi (sa cuisson du glissement
    // n'est pas celle du repos).
    CM.cam.zoom = 1.5;
    const a2 = C.getZ('A', 1, make('A')), b2 = C.getZ('B', 1, make('B'));
    expect(a2.z).toBe(1.5);
    expect(b2).not.toBe(b);
    expect(made).toEqual([['A', 1], ['B', 1.5], ['A', 1.5], ['B', 1.5]]);
    // Une capture (frames déterministes) n'est jamais un glissement.
    CM.capture = true; CM.zoomGoal = 2;
    expect(C.getZ('A', 1, make('A'))).toBe(a2);
    restore();
  });

  it('le cache ne garde que les deux derniers zooms de repos', () => {
    const C = makeBakeCache(1000);
    const make = (z) => ({ z });
    for (const z of [1, 1.25, 1.5]) {
      CM.cam.zoom = z; CM.zoomGoal = z;
      for (let i = 0; i < 20; i += 1) C.getZ('f' + i, 1, make);
    }
    expect(C.size).toBe(40);
    restore();
  });

  it("le pixel d'art de la cuisson est celui de vieK() au même zoom", () => {
    for (const d of [1, 1.25, 1.5, 2, 2.5, 3]) {
      for (let z = 0.35; z <= 3.2; z += 0.0371) {
        CM.dpr = d; CM.cam.zoom = z;
        expect(artKdAt(z, d), `z ${z} dpr ${d}`).toBe(Math.max(1, Math.round(vieK() * d)));
      }
    }
    restore();
  });
});

describe('blitBaked', () => {
  beforeEach(restore);
  const rec = () => {
    const calls = [];
    return { calls, globalAlpha: 1, imageSmoothingEnabled: true, drawImage(...a) { calls.push(a.slice(1)); } };
  };
  it("au repos : la pose d'origine ; pendant un glissement : à l'échelle z / zCuit", () => {
    const bk = { cv: {}, ox: 13, oy: 21, w: 40, h: 36, z: 1.25 };
    CM.cam.zoom = 1.25;
    const g = rec();
    blitBaked(g, bk, 100.4, 50.6, 2);
    const X = Math.round(100.4 * 2) - 13, Y = Math.round(50.6 * 2) - 21;
    expect(g.calls[0]).toEqual([X / 2, Y / 2, 40 / 2, 36 / 2]);
    CM.cam.zoom = 2.5;
    blitBaked(g, bk, 100.4, 50.6, 2);
    expect(g.calls[1][2]).toBeCloseTo(40, 9);
    expect(g.calls[1][3]).toBeCloseTo(36, 9);
    restore();
  });
});
