import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { CM } from '../layout.js';
import { drawIsoReflections } from '../iso/isoReflect.js';

// LE CALQUE DES REFLETS NE TIENT PAS DE MÉMOIRE QUAND LES REFLETS SONT COUPÉS (audit
// du 05/10, MEM-12). Plein écran × dpr, il pesait 13,7 Mo à 2560×1340 (55 Mo à dpr 2)
// et s'allouait même au palier « perf », où il ne sert jamais — sur les machines
// mêmes qu'on veut soulager. Garde : pas d'allocation tant que les reflets sont
// coupés ; rendu (0 × 0) quand la coupure est durable (palier « perf ») ; gardé tel
// quel pendant une coupure passagère (LOD) pour ne pas le réallouer à chaque cran.

const noop = () => {};
const fakeCtx = () => ({
  setTransform: noop, clearRect: noop, fillRect: noop, drawImage: noop, save: noop,
  restore: noop, clip: noop, beginPath: noop, moveTo: noop, lineTo: noop, fill: noop,
  closePath: noop, imageSmoothingEnabled: true, globalAlpha: 1, globalCompositeOperation: 'source-over',
});
const made = [];
const screen = { width: 2560, height: 1340 };
const ctx = {
  ...fakeCtx(), canvas: screen,
  getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
};
const edges = {
  left: [{ x: 0, y: 600 }, { x: 2560, y: 600 }],
  right: [{ x: 0, y: 800 }, { x: 2560, y: 800 }],
};
const frame = () => drawIsoReflections(ctx, 0, noop, edges, 20, '40,80,120', null);

const saved = {};
beforeAll(() => {
  vi.stubGlobal('document', {
    createElement: () => {
      const cv = { width: 300, height: 150, getContext: () => fakeCtx() };
      made.push(cv);
      return cv;
    },
  });
  for (const k of ['fxOn', 'lodActive', 'collapseAt', 'cw', 'ch']) saved[k] = CM[k];
  saved.cam = CM.cam;
  CM.cam = { x: 0, y: 0, zoom: 1 };
  CM.cw = screen.width; CM.ch = screen.height;
  CM.lodActive = false; CM.collapseAt = 0;
});
afterAll(() => {
  vi.unstubAllGlobals();
  Object.assign(CM, saved);
});

describe('calque des reflets : mémoire', () => {
  it('palier « perf » d\'entrée : aucun calque alloué, même après 50 frames', () => {
    CM.fxOn = false;
    for (let i = 0; i < 50; i += 1) frame();
    expect(made.length).toBe(0);
  });

  it('reflets rallumés : un calque à la taille de l\'écran', () => {
    CM.fxOn = true;
    frame();
    expect(made.length).toBe(1);
    expect([made[0].width, made[0].height]).toEqual([2560, 1340]);
  });

  it('LOD (coupure passagère) : gardé tel quel, ni rendu ni réalloué', () => {
    CM.lodActive = true;
    screen.width = 1280; screen.height = 670;     // l'écran change pendant le LOD
    for (let i = 0; i < 10; i += 1) frame();
    expect(made.length).toBe(1);
    expect([made[0].width, made[0].height]).toEqual([2560, 1340]);
    CM.lodActive = false;
    frame();                                       // ressorti : remis à la taille de l'écran
    expect([made[0].width, made[0].height]).toEqual([1280, 670]);
  });

  it('passage au palier « perf » : le calque est rendu (0 × 0), puis réalloué au retour', () => {
    CM.fxOn = false;
    frame();
    expect([made[0].width, made[0].height]).toEqual([0, 0]);
    for (let i = 0; i < 10; i += 1) frame();
    expect([made[0].width, made[0].height]).toEqual([0, 0]);
    CM.fxOn = true;
    frame();
    expect(made.length).toBe(1);                   // le même canvas, pas un de plus
    expect([made[0].width, made[0].height]).toEqual([1280, 670]);
  });

  it('effondrement : rendu aussi', () => {
    CM.collapseAt = 1234;
    frame();
    expect([made[0].width, made[0].height]).toEqual([0, 0]);
    CM.collapseAt = 0;
  });
});
