// LE VENT DANS LES ARBRES ET LE CALQUE DE LUMIÈRE (audit du 2026-10-05, PERF-73).
// Au vent, la couronne d'un arbre (ou le feuillage d'un buisson) se pose en trois
// bandes décalées d'un à trois texels (vieTreeSway). Ce qui passe DEVANT une lampe
// découpe son halo dans le calque de lumière (lightLayer.js) — mais la découpe
// reprenait la silhouette DE REPOS : la nuit, par vent, une frange de halo de 1 à
// 3 texels traversait la couronne qui bouge, et un liseré s'éteignait de l'autre
// côté. La découpe doit suivre les bandes, au même rectangle que le sprite.
//
// Le buisson sauvage (wildShrubActor, isoStreet.js) est dessiné ici pour de vrai, sur
// un faux canvas qui journalise ; l'arbre du peintre (isoLivePaint.js, qui demande un
// plan et un bake entiers) est gardé par la lecture de sa source.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// L'ombre du soleil cuit ses masques dans de vrais canvases : hors sujet.
vi.mock('../iso/isoSunShadow.js', async (orig) => ({ ...(await orig()), drawSunShadow: () => false }));

import { CM } from '../layout.js';
import { LIGHT_LAYER, beginLightLayer, endLightLayer, lightCtx, paintLightLayer, releaseLightLayer } from '../lightLayer.js';
import { VIE } from '../iso/isoVie.js';
import { wildShrubActor } from '../iso/isoStreet.js';

function journal(log) {
  return {
    globalAlpha: 1, globalCompositeOperation: 'source-over', imageSmoothingEnabled: true, fillStyle: '#000',
    _st: [],
    save() { this._st.push([this.globalCompositeOperation, this.imageSmoothingEnabled]); },
    restore() { const s = this._st.pop(); if (s) { this.globalCompositeOperation = s[0]; this.imageSmoothingEnabled = s[1]; } },
    setTransform() {}, clearRect() {}, fillRect() {}, putImageData() {},
    drawImage(img, ...a) {
      const d = a.length >= 8 ? a.slice(4) : a;
      log.push({ gco: this.globalCompositeOperation, img, d: d.map((v) => +v.toFixed(6)) });
    },
  };
}

let prev, lightLog;
beforeEach(() => {
  lightLog = [];
  prev = { doc: globalThis.document, imgData: globalThis.ImageData, cw: CM.cw, ch: CM.ch, dpr: CM.dpr, cam: { ...CM.cam }, vie: { ...VIE }, lod: CM.lodActive };
  globalThis.ImageData = globalThis.ImageData || class { constructor(data, w, h) { this.data = data; this.width = w; this.height = h; } };
  let n = 0;
  globalThis.document = {
    createElement: () => {
      n += 1;
      const ctx = n === 1 ? journal(lightLog) : journal([]);    // le premier canvas = le calque de lumière
      return { width: 0, height: 0, getContext: () => ctx };
    },
  };
  releaseLightLayer();
  CM.cw = 800; CM.ch = 600; CM.dpr = 1; CM.lodActive = false;
  CM.cam.x = 0; CM.cam.y = 0; CM.cam.zoom = 2;
  LIGHT_LAYER.on = true;
  Object.assign(VIE, { on: true, vent: 1, ventForce: 2.5 });   // grand vent : la couronne bouge franchement
});
afterEach(() => {
  endLightLayer(); paintLightLayer(null); releaseLightLayer();
  CM.cw = prev.cw; CM.ch = prev.ch; CM.dpr = prev.dpr; CM.lodActive = prev.lod;
  Object.assign(CM.cam, prev.cam);
  for (const k of Object.keys(VIE)) delete VIE[k];
  Object.assign(VIE, prev.vie);
  if (prev.doc === undefined) delete globalThis.document; else globalThis.document = prev.doc;
  if (prev.imgData === undefined) delete globalThis.ImageData; else globalThis.ImageData = prev.imgData;
});

describe('vent dans le feuillage — la découpe du halo suit les bandes posées', () => {
  it('buisson sauvage au vent, devant une lampe : mêmes rectangles que le sprite, décalages compris', () => {
    const shrub = wildShrubActor(0, 0, 3, 2);
    let decales = 0;
    for (const now of [0, 700, 1400, 2100, 2800]) {
      lightLog.length = 0;
      beginLightLayer();
      // Une lampe juste derrière le buisson : son halo couvre l'écran autour du pied.
      expect(lightCtx(300, 200, 500, 400)).not.toBeNull();
      const scene = [];
      shrub.draw(journal(scene), now);
      endLightLayer();
      const sprite = scene.map((e) => e.d);
      const cut = lightLog.filter((e) => e.gco === 'destination-out').map((e) => e.d);
      expect(sprite.length).toBe(3);                         // trois bandes : il y a du vent
      expect(cut).toEqual(sprite);
      const x0 = Math.min(...sprite.map((r) => r[0]));
      if (sprite.some((r) => r[0] !== x0)) decales += 1;
      paintLightLayer(null);
    }
    expect(decales).toBeGreaterThan(0);                      // au moins une pose où la couronne a bougé
  });

  it('sans vent : une seule silhouette, découpée telle quelle (comme avant)', () => {
    VIE.vent = 0;
    beginLightLayer();
    lightCtx(300, 200, 500, 400);
    const scene = [];
    wildShrubActor(0, 0, 3, 2).draw(journal(scene), 0);
    endLightLayer();
    const cut = lightLog.filter((e) => e.gco === 'destination-out').map((e) => e.d);
    expect(scene.length).toBe(1);
    expect(cut).toEqual(scene.map((e) => e.d));
  });

  it('arbre du peintre (isoLivePaint) : la découpe au vent rejoue la ligne du blit des bandes', () => {
    const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'iso', 'isoLivePaint.js'), 'utf8');
    const blit = 'drawImage(tImg, 0, y0, tsw, y1 - y0, tdx + o * tu, bandY(y0), hpx, bandY(y1) - bandY(y0))';
    expect(src).toContain('else for (const [y0, y1, o] of sway) ctx.' + blit);
    expect(src).toContain('for (const [y0, y1, o] of sway) lc.' + blit);
    expect(src).toMatch(/if \(!sway\) lightCutImage\(tImg, tdx, tdy, hpx, hpx\);\s*else if \(lightCutLive\(\)\)/);
  });
});
