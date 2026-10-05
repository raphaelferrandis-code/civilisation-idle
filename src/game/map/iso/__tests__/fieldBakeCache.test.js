import { afterEach, beforeEach, expect, it } from "vitest";

import { CM } from "../../layout.js";
import { drawIsoFieldPixel } from "../isoField.js";
import { BAKE_BUDGET } from "../bakeBudget.js";

// LE CACHE DES CHAMPS CUITS (audit du 05/10, PERF-49 point 6 et PERF-50) :
//   1. une entrée par PARCELLE : changer de saison recuit en place, les saisons passées
//      ne restent pas en mémoire ;
//   2. au-delà du budget de l'image, une parcelle déjà montrée garde son image d'avant
//      (l'ancienne saison) et recuit à une image suivante ; une parcelle jamais montrée
//      cuit tout de suite ;
//   3. les haies et la clé d'une parcelle ne se recalculent plus à chaque frame.

let made = 0;
const saved = {};
beforeEach(() => {
  saved.document = globalThis.document;
  saved.ImageData = globalThis.ImageData;
  made = 0;
  globalThis.document = {
    createElement: () => { made += 1; return { width: 0, height: 0, getContext: () => ({ putImageData() {} }) }; },
  };
  globalThis.ImageData = class { constructor(data, w, h) { this.data = data; this.width = w; this.height = h; } };
  CM.cam = { x: 0, y: 0, zoom: 1 }; CM.cw = 800; CM.ch = 600;
  CM._wonderBoxes = null; CM.capture = false; CM.nightF = 0;
});
afterEach(() => {
  globalThis.document = saved.document;
  globalThis.ImageData = saved.ImageData;
  CM._wonderBoxes = null;
  BAKE_BUDGET.ms = 8;
});

function fakeCtx() {
  const drawn = [];
  return {
    drawn, imageSmoothingEnabled: true,
    drawImage(cv) { drawn.push(cv); },
    save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
  };
}
// Deux parcelles voisines du terroir (une haie partagée), ère des pierres.
function terroir(at) {
  const tiles = [
    { type: "engine", buildingId: "irrigated_fields", gx: 4, gy: 4, spanX: 3, spanY: 2 },
    { type: "engine", buildingId: "irrigated_fields", gx: 4, gy: 6, spanX: 2, spanY: 2 },
  ];
  CM.layout = { tiles };
  CM.layoutRecomputeAt = at;
  return tiles;
}
const frame = (tiles, ctx) => { for (const t of tiles) expect(drawIsoFieldPixel(ctx, t, t.spanX, t.spanY, 3, 0)).toBe(true); };

it("une saison chasse l'autre : une entrée par parcelle", () => {
  const tiles = terroir(7001);
  for (let round = 0; round < 2; round += 1) {
    for (let s = 0; s < 4; s += 1) { CM.season = s; frame(tiles, fakeCtx()); }
  }
  // Deux parcelles × huit saisons montrées : 16 cuissons (un canvas chacune, pas de
  // canvas de nuit à cette ère). Au second tour, les saisons déjà vues RECUISENT :
  // elles n'étaient plus gardées (l'ancien cache en aurait gardé huit, 8 cuissons).
  expect(made).toBe(16);
  for (const t of tiles) {
    expect(t._fieldP).toBeTruthy();
    expect(t._fieldP.key).toContain(t.gx + "," + t.gy + ":");
  }
  // Une frame de plus, même saison : rien ne recuit, la clé reste la même.
  const P = tiles.map((t) => t._fieldP);
  frame(tiles, fakeCtx());
  expect(made).toBe(16);
  for (let i = 0; i < 2; i += 1) expect(tiles[i]._fieldP).toBe(P[i]);
});

it("budget pris : l'ancienne saison reste affichée, puis la parcelle recuit", () => {
  const tiles = terroir(7002);
  CM.season = 0;
  const c0 = fakeCtx();
  frame(tiles, c0);
  expect(made).toBe(2);
  const old = c0.drawn.slice();
  // Changement de saison dans une image dont le budget est épuisé.
  CM.season = 1;
  CM._wonderBoxes = [];
  BAKE_BUDGET.ms = 0;
  const c1 = fakeCtx();
  frame(tiles, c1);
  expect(made).toBe(2);                        // rien de cuit
  expect(c1.drawn).toEqual(old);               // l'image d'avant, telle quelle
  // Une parcelle JAMAIS montrée cuit quand même tout de suite.
  const neuve = { type: "engine", buildingId: "irrigated_fields", gx: 20, gy: 20, spanX: 2, spanY: 2 };
  expect(drawIsoFieldPixel(fakeCtx(), neuve, 2, 2, 3, 0)).toBe(true);
  expect(made).toBe(3);
  // Image suivante, budget rendu : les deux parcelles passent à la nouvelle saison.
  BAKE_BUDGET.ms = 1e9;
  CM._wonderBoxes = [];
  const c2 = fakeCtx();
  frame(tiles, c2);
  expect(made).toBe(5);
  expect(c2.drawn.some((cv) => old.includes(cv))).toBe(false);
});

it("un plan recalculé refait les haies de la parcelle", () => {
  const tiles = terroir(7003);
  CM.season = 2;
  frame(tiles, fakeCtx());
  const p0 = tiles[0]._fieldP;
  frame(tiles, fakeCtx());
  expect(tiles[0]._fieldP).toBe(p0);
  CM.layout = { tiles };
  CM.layoutRecomputeAt = 7004;
  frame(tiles, fakeCtx());
  expect(tiles[0]._fieldP).not.toBe(p0);
  expect(tiles[0]._fieldP.key).toBe(p0.key);   // même parcelle : même entrée, rien à recuire
});
