// LE CALQUE DE LUMIÈRE NE SURVIT PAS À LA CARTE (audit du 2026-10-05, MEM-8).
// Le calque (lightLayer.js) est un canvas plein écran de cw × ch × dpr², singleton
// de module : 12 Mo à dpr 1 sur ~2 400 × 1 300, 28 Mo à 1,5. resetCityMapRuntime
// (carte démontée : le joueur passe sur un autre onglet) ne le libérait jamais,
// alors qu'il est effacé et repeint à chaque frame — rien d'utile n'y reste.
//
// Pas de canvas sous Node : un faux document compte les canvases créés et un faux
// contexte journalise les effacements et les blits.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Le runtime de la carte entier (et ses centaines de modules) n'est pas en jeu : seul
// resetCityMapRuntime l'est, qui ne lit que CM — celui de layout.js, le même objet.
vi.mock('../cityMapRuntime.js', async () => ({ CM: (await import('../layout.js')).CM, initCityMap: () => {} }));

import { CM } from '../layout.js';
import {
  LIGHT_LAYER, beginLightLayer, endLightLayer, lightCtx, paintLightLayer, releaseLightLayer, lightLayerStats,
} from '../lightLayer.js';
import { resetCityMapRuntime } from '../loadCityMapScripts.js';

let log, made;
function makeCtx() {
  return {
    globalAlpha: 1, globalCompositeOperation: 'source-over', imageSmoothingEnabled: true, fillStyle: '#000',
    setTransform() {},
    clearRect(x, y, w, h) { log.push({ op: 'clear', x, y, w, h }); },
    fillRect() {},
    drawImage(img, ...a) { log.push({ op: 'draw', img, n: a.length }); },
  };
}

let prev;
beforeEach(() => {
  log = []; made = [];
  prev = { cw: CM.cw, ch: CM.ch, dpr: CM.dpr, doc: globalThis.document, cleanup: CM.cleanup };
  CM.cw = 640; CM.ch = 384; CM.dpr = 1;
  globalThis.document = {
    createElement: () => {
      const ctx = makeCtx();
      const c = { width: 300, height: 150, getContext: () => ctx };
      made.push(c);
      return c;
    },
  };
  LIGHT_LAYER.on = true;
  releaseLightLayer();       // le module est un singleton : on part d'un calque libéré
  made.length = 0;
});
afterEach(() => {
  endLightLayer(); paintLightLayer(null); releaseLightLayer();
  CM.cw = prev.cw; CM.ch = prev.ch; CM.dpr = prev.dpr; CM.cleanup = prev.cleanup;
  if (prev.doc === undefined) delete globalThis.document; else globalThis.document = prev.doc;
});

// Une frame complète : armement, une lumière déposée en (x, y), blit de nuit.
function frameWithLight(x, y) {
  beginLightLayer();
  const lc = lightCtx(x - 20, y - 20, x + 20, y + 20);
  endLightLayer();
  paintLightLayer(makeCtx());
  return lc;
}

describe('calque de lumière — libéré au démontage de la carte (MEM-8)', () => {
  it('releaseLightLayer rend la mémoire du canvas plein écran et désarme le calque', () => {
    expect(frameWithLight(100, 100)).not.toBeNull();
    expect(made).toHaveLength(1);
    const buf = made[0];
    expect([buf.width, buf.height]).toEqual([640, 384]);
    releaseLightLayer();
    expect([buf.width, buf.height]).toEqual([0, 0]);   // mémoire rendue sans attendre le GC
    expect(lightLayerStats().armed).toBe(false);
    // Une passe de nuit égarée après le démontage reprend le dessin direct.
    expect(paintLightLayer(makeCtx())).toBe(false);
  });

  it('au remontage le calque renaît à la taille de l écran, grilles vides : rien à effacer', () => {
    frameWithLight(100, 100);
    releaseLightLayer();
    CM.cw = 800; CM.ch = 500; CM.dpr = 1.5;
    log = [];
    beginLightLayer();
    expect(made).toHaveLength(2);
    expect([made[1].width, made[1].height]).toEqual([1200, 750]);
    // Premier dépôt : l'effacement ciblé ne trouve aucune case héritée du calque libéré.
    expect(lightCtx(300, 300, 340, 340)).not.toBeNull();
    expect(log.filter((e) => e.op === 'clear')).toHaveLength(0);
    endLightLayer();
    const out = makeCtx();
    log = [];
    expect(paintLightLayer(out)).toBe(true);
    const blits = log.filter((e) => e.op === 'draw');
    expect(blits.length).toBeGreaterThan(0);
    expect(blits.every((e) => e.img === made[1])).toBe(true);
  });

  it('resetCityMapRuntime libère le calque', () => {
    frameWithLight(200, 150);
    const buf = made[0];
    expect(buf.width).toBeGreaterThan(0);
    CM.cleanup = null;
    resetCityMapRuntime();
    expect([buf.width, buf.height]).toEqual([0, 0]);
    // Plusieurs montages/démontages : jamais plus d'un calque vivant à la fois.
    for (let i = 0; i < 5; i += 1) { frameWithLight(200, 150); resetCityMapRuntime(); }
    expect(made.filter((c) => c.width > 0 || c.height > 0)).toHaveLength(0);
  });
});
