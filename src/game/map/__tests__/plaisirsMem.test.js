// LA MAISON DES PLAISIRS NE GARDE PAS TOUS LES ÂGES EN MÉMOIRE (audit du 05/10, MEM-3,
// MEM-11) ET N'EMPILE PAS SES TRANCHES HORS ÉCRAN (PERF-51).
//
// · Les cuissons (2,6 à 15 Mo chacune) : seuls l'âge cuit et le précédent restent ; un
//   âge revisité se recuit.
// · Les images décodées : l'âge affiché et le suivant (préchargé) ; un âge quitté se
//   recharge, le suivant ne se recharge pas.
// · Hors écran, ni tranche : la base (cerne, ombre, reflet, remous) et les filles
//   restent empilées (la caméra qui en suit une l'attend au tournant).
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

vi.mock('../iso/plaisirsBake.js', async (importOriginal) => {
  const m = await importOriginal();
  return { ...m, bakePlaisirs: vi.fn(m.bakePlaisirs) };
});

import { CM } from '../layout.js';
import { TERRAIN } from '../iso/isoTerrain.js';
import { bakePlaisirs } from '../iso/plaisirsBake.js';
import { pushIsoPlaisirsItems } from '../iso/isoPlaisirs.js';
import { plaisirsSkin, plaisirsSkinSpec } from '../iso/plaisirsSkin.js';

// Un faux navigateur : les images attendent qu'on les livre (lues dans public/).
const pending = [];
const pngs = new Map();          // décodées une fois (le module ne les modifie pas)
const pngOf = (src) => {
  if (!pngs.has(src)) {
    const png = PNG.sync.read(fs.readFileSync(path.join(process.cwd(), 'public', src)));
    pngs.set(src, { width: png.width, height: png.height, data: new Uint8ClampedArray(png.data) });
  }
  return pngs.get(src);
};
const deliverAll = () => {
  while (pending.length) {
    const im = pending.shift();
    if (!fs.existsSync(path.join(process.cwd(), 'public', im._src))) { im.onerror(); continue; }
    const p = pngOf(im._src);
    im.naturalWidth = p.width; im.naturalHeight = p.height;
    im.onload();
  }
};
class FakeImageData {
  constructor(a, b, c) {
    if (typeof a === 'number') { this.width = a; this.height = b; this.data = new Uint8ClampedArray(a * b * 4); }
    else { this.data = a; this.width = b; this.height = c ?? a.length / 4 / b; }
  }
}
const saved = {};
beforeAll(() => {
  for (const k of ['Image', 'document', 'ImageData']) saved[k] = globalThis[k];
  globalThis.Image = class { set src(s) { this._src = s; pending.push(this); } get src() { return this._src; } };
  globalThis.ImageData = FakeImageData;
  globalThis.document = {
    createElement: () => {
      let last = null;
      const g = {
        drawImage(im) { last = im; }, putImageData() {}, clearRect() {},
        createImageData: (w, h) => new FakeImageData(w, h),
        getImageData: () => pngOf(last._src),
      };
      return { width: 0, height: 0, getContext: () => g };
    },
  };
  saved.amp = TERRAIN.amp; TERRAIN.amp = 0;
  saved.CM = { layout: CM.layout, TILE: CM.TILE, cam: CM.cam, cw: CM.cw, ch: CM.ch };
  CM.TILE = 16; CM.cw = 800; CM.ch = 600;
});
afterAll(() => {
  for (const k of ['Image', 'document', 'ImageData']) globalThis[k] = saved[k];
  TERRAIN.amp = saved.amp;
  Object.assign(CM, saved.CM);
});

const PL = { x: 40, y: 40, tx: 1, ty: 0 };
// Une frame de collecte, caméra sur le lieu (ou loin de lui).
const frame = (band, away = 0) => {
  CM.layout = { counts: { eraBand: band, eraIndex: band * 3 } };
  CM.cam = { x: PL.x * CM.TILE + away, y: PL.y * CM.TILE, zoom: 1 };
  const items = [];
  pushIsoPlaisirsItems(items, PL, 1000);
  return items;
};
// L'âge affiché : ses images livrées, la frame d'après le cuit.
const visit = (band) => { frame(band); deliverAll(); return frame(band); };
const srcs = () => pending.map((im) => im._src);

describe('Maison des Plaisirs : mémoire bornée', () => {
  it("ne garde que les cuissons de l'âge cuit et du précédent", () => {
    const n0 = bakePlaisirs.mock.calls.length;
    const baked = () => bakePlaisirs.mock.calls.length - n0;
    visit(0); visit(1); visit(2);
    expect(baked()).toBe(3);
    visit(1);                          // l'âge précédent : gardé
    expect(baked()).toBe(3);
    visit(0);                          // deux âges plus tôt : rendu, il se recuit
    expect(baked()).toBe(4);
    visit(2);                          // et les autres sont partis avec lui
    expect(baked()).toBe(5);
  });

  it("ne garde que les images de l'âge affiché et du suivant", () => {
    visit(3);
    // L'âge suivant (4) est préchargé : à son tour, il ne se recharge pas.
    frame(4);
    expect(srcs()).not.toContain(plaisirsSkinSpec(4).src);
    deliverAll(); frame(4);
    // Un âge quitté (3) a rendu ses images : y revenir les recharge.
    frame(3);
    expect(srcs()).toContain(plaisirsSkinSpec(3).src);
    deliverAll();
  });

  it("rend le même objet habillage d'une frame à l'autre, refait si la fiche change", () => {
    const b = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].find((k) => plaisirsSkinSpec(k) && plaisirsSkinSpec(k).balcony);
    expect(b).toBeDefined();
    visit(b);
    const a = plaisirsSkin(b);
    expect(a).toBeTruthy();
    expect(plaisirsSkin(b)).toBe(a);                     // pas d'objet neuf par frame (PERF-51)
    // La molette `__plaisirsSkins[b].balcony = { … }` puis `__plaisirsBakes()` : la
    // recuisson doit lire la NOUVELLE fiche, pas la copie gardée.
    const spec = plaisirsSkinSpec(b), old = spec.balcony;
    try {
      spec.balcony = { ...old, h: old.h + 1 };
      const c = plaisirsSkin(b);
      expect(c).not.toBe(a);
      expect(c.balcony).toBe(spec.balcony);
      expect(c.img).toBe(a.img);
    } finally { spec.balcony = old; }
  });
});

describe('Maison des Plaisirs : rien d empilé hors écran (PERF-51)', () => {
  it('hors écran : la base et les filles, aucune tranche', () => {
    const on = visit(5);
    const parts = (items) => items.map((it) => it.part);
    expect(parts(on).filter((p) => p === 'slice').length).toBeGreaterThan(10);
    const off = frame(5, 9000);
    expect(parts(off)).toContain('base');
    expect(parts(off).filter((p) => p === 'slice')).toEqual([]);
    expect(parts(off).filter((p) => p === 'girl').length).toBe(parts(on).filter((p) => p === 'girl').length);
    // À moitié à l'écran : seules les tranches qui y tombent.
    const half = frame(5, 300);
    const nHalf = parts(half).filter((p) => p === 'slice').length;
    expect(nHalf).toBeGreaterThan(0);
    expect(nHalf).toBeLessThan(parts(on).filter((p) => p === 'slice').length);
  });
});
