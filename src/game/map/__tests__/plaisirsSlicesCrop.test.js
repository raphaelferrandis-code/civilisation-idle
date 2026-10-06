// LES TRANCHES DE LA MAISON DES PLAISIRS NE POSENT QUE LEURS RANGÉES OCCUPÉES, ET
// L'IMAGE NE BOUGE PAS D'UN PIXEL (audit du 05/10, PERF-29).
//
// Chaque tranche de 8 colonnes se posait sur toute la hauteur du cadre, vide aux trois
// quarts. Elle est désormais recadrée sur ses rangées occupées — mais SEULEMENT à une
// échelle device entière (rowCrop.js : ailleurs, une pose rognée décale des rangées
// d'un texel, mesuré au banc headless en logiciel et sur GPU). Gardes :
//   · au zoom 2 et 3 (dpr 1), les poses sont rognées et l'image obtenue — rendue ici au
//     nearest, centre de pixel par centre de pixel — est IDENTIQUE à celle des poses
//     pleine hauteur ;
//   · au zoom 1,375, aucune pose n'est rognée ;
//   · le calque vivant (âge 5, la fonte) n'est pas posé sur une tranche où il est vide.
// Un faux navigateur cuit le vrai habillage (lu dans public/), comme plaisirsMem.test.js.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { CM } from '../layout.js';
import { pushIsoPlaisirsItems, drawIsoPlaisirsSeg } from '../iso/isoPlaisirs.js';

const pending = [];
const pngOf = (src) => {
  const png = PNG.sync.read(fs.readFileSync(path.join(process.cwd(), 'public', src)));
  return { width: png.width, height: png.height, data: new Uint8ClampedArray(png.data) };
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
        drawImage(im) { last = im; }, putImageData() {}, clearRect() {}, fillRect() {},
        createImageData: (w, h) => new FakeImageData(w, h),
        getImageData: () => pngOf(last._src),
      };
      return { width: 0, height: 0, getContext: () => g };
    },
  };
  saved.CM = { layout: CM.layout, TILE: CM.TILE, cam: CM.cam, cw: CM.cw, ch: CM.ch, dpr: CM.dpr, nightF: CM.nightF };
  CM.TILE = 16; CM.cw = 1600; CM.ch = 1200; CM.dpr = 1; CM.nightF = 0;
});
afterAll(() => {
  for (const k of ['Image', 'document', 'ImageData']) globalThis[k] = saved[k];
  Object.assign(CM, saved.CM);
});

const PL = { x: 40, y: 40, tx: 1, ty: 0 };
const collect = (band, zoom) => {
  CM.layout = { counts: { eraBand: band, eraIndex: band * 3 } };
  CM.cam = { x: PL.x * CM.TILE + 3.3, y: PL.y * CM.TILE - 7.7, zoom };
  const items = [];
  pushIsoPlaisirsItems(items, PL, 1000);
  return items;
};
// Les poses d'une frame, tranche par tranche. `aligned` : la cible se dit calée sur la
// grille device (sinon, une demi-unité de translation : la pose rognée est refusée).
function poses(items, aligned) {
  const calls = [];
  const ctx = {
    imageSmoothingEnabled: false, globalAlpha: 1,
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: aligned ? 0 : 0.5 }),
    drawImage: (img, sx, sy, sw, sh, dx, dy, dw, dh) => calls.push({ img, sx, sy, sw, sh, dx, dy, dw, dh }),
  };
  for (const it of items) if (it.part === 'slice') drawIsoPlaisirsSeg(ctx, it, 1000);
  return calls;
}
// Rendu au nearest sur la grille des pixels (dpr 1) : pour chaque pixel, le texel de la
// matière qu'il montre (−1 : transparent). Les tranches ne se chevauchent pas.
function render(calls, cv, R, W, H) {
  const out = new Int32Array(W * H).fill(-1);
  for (const c of calls) {
    if (c.img !== cv) continue;
    const px0 = Math.max(0, Math.ceil(c.dx - 0.5)), px1 = Math.min(W, Math.ceil(c.dx + c.dw - 0.5));
    const py0 = Math.max(0, Math.ceil(c.dy - 0.5)), py1 = Math.min(H, Math.ceil(c.dy + c.dh - 0.5));
    for (let py = py0; py < py1; py += 1) {
      const v = Math.floor(c.sy + (py + 0.5 - c.dy) * c.sh / c.dh);
      for (let px = px0; px < px1; px += 1) {
        const u = Math.floor(c.sx + (px + 0.5 - c.dx) * c.sw / c.dw);
        const k = v * R.w + u;
        if (R.data[k * 4 + 3]) out[py * W + px] = k;
      }
    }
  }
  return out;
}

describe('Plaisirs : tranches recadrées sur leurs rangées, image identique (PERF-29)', () => {
  beforeAll(() => { collect(5, 2); deliverAll(); collect(5, 2); });

  for (const zoom of [2, 3]) {
    it(`zoom ${zoom} : poses rognées, même image qu en pleine hauteur`, () => {
      const items = collect(5, zoom);
      const m = items.find((it) => it.part === 'slice').m, R = m.bk.R, cv = m.bk.cv;
      const crop = poses(items, true), full = poses(items, false);
      const main = crop.filter((c) => c.img === cv), ref = full.filter((c) => c.img === cv);
      expect(main.length).toBeGreaterThan(10);
      expect(main.length).toBe(ref.length);
      expect(ref.every((c) => c.sy === 0 && c.sh === R.h)).toBe(true);
      // Rognées : la surface posée tombe d'au moins moitié.
      const area = (cs) => cs.reduce((s, c) => s + c.dw * c.dh, 0);
      expect(area(main)).toBeLessThan(area(ref) * 0.5);
      const W = CM.cw, H = CM.ch;
      const a = render(main, cv, R, W, H), b = render(ref, cv, R, W, H);
      let diff = 0, lit = 0;
      for (let k = 0; k < a.length; k += 1) { if (a[k] !== b[k]) diff += 1; if (b[k] >= 0) lit += 1; }
      expect(lit).toBeGreaterThan(1000);
      expect(diff).toBe(0);
    });
  }

  it('zoom 1,375 : rien n est rogné (la pose pleine hauteur reste)', () => {
    const items = collect(5, 1.375);
    const m = items.find((it) => it.part === 'slice').m, R = m.bk.R;
    const main = poses(items, true).filter((c) => c.img === m.bk.cv);
    expect(main.length).toBeGreaterThan(10);
    expect(main.every((c) => c.sy === 0 && c.sh === R.h)).toBe(true);
  });

  it('le calque vivant n est pas posé sur les tranches où il est vide', () => {
    const items = collect(5, 2);
    const m = items.find((it) => it.part === 'slice').m;
    expect(m.bk.live).toBeTruthy();
    const calls = poses(items, true);
    const slices = items.filter((it) => it.part === 'slice').length;
    const live = calls.filter((c) => c.img === m.bk.live.cv).length;
    expect(live).toBeGreaterThan(0);
    expect(live).toBeLessThan(slices);
  });
});
