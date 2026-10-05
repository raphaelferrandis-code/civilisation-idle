import { afterEach, beforeEach, expect, it } from "vitest";

import { CM } from "../../layout.js";
import { rippleField, noteRipples, ripplesShown } from "../waterRipples.js";
import { drawIsoRipples } from "../waterRipplesPass.js";

// LA PASSE DES REMOUS NE DÉCOUPE PLUS POUR RIEN (audit du 05/10, PERF-56 point 1). Les
// ouvrages notent leurs remous à chaque image, port hors champ compris ; la passe
// traçait le ruban du fleuve et posait son clip avant de savoir s'il restait un champ
// à poser. Elle ne le fait plus que si un champ passe le test de drawRipples.

const saved = {};
beforeEach(() => {
  saved.document = globalThis.document;
  globalThis.document = {
    createElement: () => ({
      width: 0, height: 0,
      getContext: () => ({
        createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
        putImageData() {},
      }),
    }),
  };
  CM.cam = { x: 0, y: 0, zoom: 1 }; CM.cw = 800; CM.ch = 600;
  CM.lodActive = false; CM.collapseAt = 0;
  // Un fleuve droit le long de x, à hauteur y = 4 tuiles.
  const samples = [];
  for (let i = -20; i <= 60; i += 1) samples.push({ x: i, y: 4, hw: 2 });
  CM.layout = { river: { present: true, samples }, gridN: 40 };
});
afterEach(() => { globalThis.document = saved.document; });

function fakeCtx() {
  const calls = { clip: 0, save: 0, restore: 0, draw: 0 };
  return {
    calls, imageSmoothingEnabled: true,
    save() { calls.save += 1; }, restore() { calls.restore += 1; }, clip() { calls.clip += 1; },
    beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, rect() {},
    drawImage() { calls.draw += 1; },
  };
}
// Un ponton au bord du fleuve, à (wx, wy) px monde : son champ de remous est local.
function notePier(key, wx, wy) {
  const F = rippleField({ posts: [[0, 0, 0.4], [3, 0, 0.4]], seed: 7 });
  expect(F).toBeTruthy();
  noteRipples(key, () => [{ F, clip: "river", wx, wy, h: 0 }]);
  return F;
}

it("port hors champ : ni tracé ni clip", () => {
  const F = notePier("pier-loin", 40000, 40000);
  const c = fakeCtx();
  drawIsoRipples(c, 1000);
  expect(c.calls).toEqual({ clip: 0, save: 0, restore: 0, draw: 0 });
  expect(ripplesShown(F, 1e5, 1e5, 1, 0.7, { w: 800, h: 600 })).toBe(false);
});

it("zoom trop large : rien non plus", () => {
  notePier("pier-dezoom", 0, 4 * 32);
  CM.cam.zoom = 0.5;
  const c = fakeCtx();
  drawIsoRipples(c, 1000);
  expect(c.calls.clip).toBe(0);
});

it("port à l'écran : découpé au ruban et posé, comme avant", () => {
  notePier("pier-ici", 0, 4 * 32);
  notePier("pier-loin-2", 40000, 40000);
  const c = fakeCtx();
  drawIsoRipples(c, 1000);
  expect(c.calls.clip).toBe(1);
  expect(c.calls.save).toBe(1);
  expect(c.calls.restore).toBe(1);
  expect(c.calls.draw).toBe(1);                  // le champ visible seulement
});
