// EMPRISES SERRÉES DU CALQUE DE LUMIÈRE (audit du 2026-10-05, PERF-2). Le calque fait
// payer une découpe à tout sprite qui passe sur une case « allumée » : de jour, l'emprise
// de NUIT d'un réverbère (deux tuiles de large) en faisait payer 604 par image sur une
// mégapole, pour quelques cœurs de flamme de 6 px. Deux règles tiennent l'image
// identique au pixel (vérifié en jeu, logiciel ET GPU, avant de les écrire ici) :
//   1. la grille FINE n'épargne une découpe que LOIN de toute lumière déposée ;
//   2. l'emprise d'un mât CONTIENT tout ce que paintLampGlow peint — sinon un sprite
//      peint devant ne découperait pas la lumière qui déborde, et elle le traverserait.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { CM } from '../layout.js';
import {
  LIGHT_LAYER, beginLightLayer, endLightLayer, suspendLightLayer, lightCtx, lightCutImage,
  paintLightLayer, lightLayerStats, litBox,
} from '../lightLayer.js';
import { lampGlowBox, paintLampGlow } from '../iso/isoStreet.js';
import { drawHouseWindows } from '../houseWindows.js';

// Faux contexte qui journalise la GÉOMÉTRIE de ce qui est peint.
function recCtx(log) {
  return {
    globalAlpha: 1, globalCompositeOperation: 'source-over', imageSmoothingEnabled: true, fillStyle: '#000',
    _el: null,
    save() {}, restore() {}, setTransform() {}, clearRect() {},
    beginPath() { this._el = null; }, closePath() {}, moveTo() {}, lineTo() {}, fill() { if (this._el) log.push(this._el); },
    ellipse(x, y, rx, ry) { this._el = { x0: x - rx, y0: y - ry, x1: x + rx, y1: y + ry }; },
    fillRect(x, y, w, h) { log.push({ x0: x, y0: y, x1: x + w, y1: y + h }); },
    drawImage(img, ...a) { const d = a.length >= 8 ? a.slice(4) : a; log.push({ x0: d[0], y0: d[1], x1: d[0] + d[2], y1: d[1] + d[3] }); },
    createRadialGradient() { return { addColorStop() {} }; },
  };
}
// Les canevas créés par les modules (calque, masques) journalisent leurs blits ici.
const blits = [];
const fakeCanvas = () => {
  const cv = { width: 0, height: 0 };
  const cx = {
    ...recCtx([]),
    drawImage(img, ...a) { const d = a.length >= 8 ? a.slice(4) : a; blits.push({ on: cv, img, dx: d[0], dy: d[1], dw: d[2], dh: d[3] }); },
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    putImageData() {},
  };
  cv.getContext = () => cx;
  return cv;
};

let prev;
beforeEach(() => {
  prev = { cw: CM.cw, ch: CM.ch, dpr: CM.dpr, cam: CM.cam, doc: globalThis.document, nightF: CM.nightF, ctx: CM.ctx, lod: CM.lodActive };
  CM.cw = 640; CM.ch = 384; CM.dpr = 1; CM.cam = { x: 0, y: 0, zoom: 1 };
  blits.length = 0;
  globalThis.document = { createElement: () => fakeCanvas() };
  Object.assign(LIGHT_LAYER, { on: true, cell: 64, fine: 16, tight: true });
  suspendLightLayer(false);
  beginLightLayer(); endLightLayer(); paintLightLayer(null);
});
afterEach(() => {
  endLightLayer(); paintLightLayer(null);
  Object.assign(LIGHT_LAYER, { on: true, cell: 64, fine: 16, tight: true });
  CM.cw = prev.cw; CM.ch = prev.ch; CM.dpr = prev.dpr; CM.cam = prev.cam;
  CM.nightF = prev.nightF; CM.ctx = prev.ctx; CM.lodActive = prev.lod;
  if (prev.doc === undefined) delete globalThis.document; else globalThis.document = prev.doc;
});

const IMG = { naturalWidth: 16, naturalHeight: 16, width: 16, height: 16 };

describe('grille fine des découpes', () => {
  it('épargne le sprite qui partage la case de 64 sans approcher la lumière', () => {
    beginLightLayer();
    lightCtx(4, 4, 10, 10);                               // un cœur de flamme dans le coin
    expect(lightCutImage(IMG, 40, 40, 20, 20)).toBe(false);   // même case de 64, loin
    expect(lightLayerStats().spared).toBe(1);
    expect(lightCutImage(IMG, 8, 8, 20, 20)).toBe(true);      // sur la lumière : découpé
  });

  it('garde une marge autour de l’emprise déclarée (débord des halos au pixel)', () => {
    beginLightLayer();
    lightCtx(4, 4, 10, 10);
    expect(lightCutImage(IMG, 16, 4, 6, 6)).toBe(true);       // à 6 px du bord : découpé
  });

  it('molette fine: 0 — la case de 64 décide seule, comme avant', () => {
    LIGHT_LAYER.fine = 0;
    beginLightLayer();
    lightCtx(4, 4, 10, 10);
    expect(lightCutImage(IMG, 40, 40, 20, 20)).toBe(true);
  });
});

describe('emprise d’un masque allumé en partie (litBox)', () => {
  it('épouse les texels allumés, calée sur la grille device avec un pixel de marge', () => {
    CM.dpr = 1.5;
    // Masque de 40×40 posé à l'échelle 2 en (100, 50) ; texels allumés [10, 20[ × [4, 8[.
    const b = litBox(100, 50, 2, 2, 10, 4, 20, 8);
    expect(b.x0).toBeLessThanOrEqual(120); expect(b.x1).toBeGreaterThanOrEqual(140);
    expect(b.y0).toBeLessThanOrEqual(58); expect(b.y1).toBeGreaterThanOrEqual(66);
    expect(b.x1 - b.x0).toBeLessThan(20 + 2.5);              // bien plus serrée que 80 px
    for (const v of [b.x0, b.y0, b.x1, b.y1]) expect(Math.abs(v * 1.5 - Math.round(v * 1.5))).toBeLessThan(1e-9);
  });
});

describe('fenêtres d’une maison : emprise serrée, blit inchangé', () => {
  // La maison artisane n'a qu'un volet allumable : 3 × 5 texels en (51, 43) de 64 × 64.
  // Tuile (0, 0) : phase 0, le volet s'allume.
  const g = { key: 'crafthouse', bb: { x0: 0, y0: 0, w: 64, h: 64 }, dx: 100, dy: 100, dw: 64, dh: 64 };
  const t = { gx: 0, gy: 0 };
  const deposit = () => {
    CM.nightF = 1; CM.lodActive = false; CM.ctx = { globalAlpha: 1 };
    beginLightLayer();
    blits.length = 0;
    drawHouseWindows(t, g);
    return blits.filter((b) => b.img && b.img.width === 64);
  };

  it('le masque se pose toujours sur toute la maison (mêmes texels, même rectangle)', () => {
    const d = deposit();
    expect(d).toHaveLength(1);
    expect([d[0].dx, d[0].dy, d[0].dw, d[0].dh]).toEqual([100, 100, 64, 64]);
  });

  it('un sprite devant le TOIT, loin du volet, ne paie plus de découpe', () => {
    deposit();
    expect(lightCutImage(IMG, 100, 100, 16, 16)).toBe(false);
    expect(lightCutImage(IMG, 148, 140, 10, 10)).toBe(true);   // devant le volet : découpé
  });

  it('molette tight: false — l’emprise redevient la maison entière', () => {
    Object.assign(LIGHT_LAYER, { tight: false, fine: 0 });
    deposit();
    expect(lightCutImage(IMG, 100, 100, 16, 16)).toBe(true);
  });
});

describe('emprise d’un réverbère : elle contient tout ce qu’il peint', () => {
  // Les quatre styles de lumière que portent les réverbères du kit (`lig`,
  // streetKits.js : feu, gaz, électrique, pulsé), dont le gaz à deux cœurs. Valeurs
  // reprises de l'ancienne table LAMP_LIGHTS d'isoStreet (retirée, audit MORT-13).
  const LIGS = [
    { style: 'fire', col: '255,186,84', day: 0.5, hx: 0.49, hy: 0.13, em: [{ fx: 0.49, fy: 0.12, r: 0.30 }] },
    { style: 'gas', col: '255,201,120', day: 0.12, hx: 0.48, hy: 0.20, em: [{ fx: 0.32, fy: 0.20, r: 0.20 }, { fx: 0.635, fy: 0.20, r: 0.20 }] },
    { style: 'steady', col: '240,246,232', day: 0.14, hx: 0.64, hy: 0.19, em: [{ fx: 0.64, fy: 0.19, r: 0.24 }] },
    { style: 'pulse', col: '150,230,255', day: 0.45, hx: 0.50, hy: 0.17, em: [{ fx: 0.50, fy: 0.17, r: 0.30 }] },
  ];
  const frame = (lig, zoom, n) => {
    const unit = 32 * zoom;
    return { lig, m: { footXf: 0.5, footYf: 0.94 }, hpx: unit * 1.6, wpx: unit * 0.5, vis: lig.day + (1 - lig.day) * n, n, unit, gain: 1, stride: 1 };
  };
  for (const zoom of [0.5, 1, 2.5]) {
    for (const n of [0, 1]) {
      it(`zoom ${zoom}, ${n ? 'nuit' : 'jour'} : aucun pixel peint hors de l’emprise`, () => {
        CM.cam.zoom = zoom;
        for (const lig of LIGS) {
          const K = frame(lig, zoom, n), p = { x: 300.37, y: 200.81 };
          const b = lampGlowBox(p, K);
          for (let now = 0; now < 4000; now += 37) {
            const log = [];
            paintLampGlow(recCtx(log), { gx: 7, gy: 11 }, p, K, now);
            expect(log.length).toBeGreaterThan(0);
            for (const r of log) {
              expect(r.x0).toBeGreaterThanOrEqual(b.x0); expect(r.y0).toBeGreaterThanOrEqual(b.y0);
              expect(r.x1).toBeLessThanOrEqual(b.x1); expect(r.y1).toBeLessThanOrEqual(b.y1);
            }
          }
        }
      });
    }
  }

  it('de jour, l’emprise ne garde que les cœurs : bien plus petite que celle de nuit', () => {
    const lig = LIGS[0];
    const day = lampGlowBox({ x: 300, y: 200 }, frame(lig, 1, 0));
    LIGHT_LAYER.tight = false;
    const old = lampGlowBox({ x: 300, y: 200 }, frame(lig, 1, 0));
    const area = (b) => (b.x1 - b.x0) * (b.y1 - b.y0);
    expect(area(day)).toBeLessThan(area(old) * 0.25);
  });
});
