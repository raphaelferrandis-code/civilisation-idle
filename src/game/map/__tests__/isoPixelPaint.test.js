import { describe, it, expect } from "vitest";

import { frameOf, paintBox, alphaAt } from "../iso/isoPixelPaint.js";

// LA COUTURE DES BOÎTES (2026-10-02, « le centre des poteaux est transparent ») :
// les monuments des ponts sont posés à 1,5 px du parapet, leur arête avant tombe
// pile sur un centre de pixel, et les deux faces semi-ouvertes la refusaient
// toutes deux — une colonne vide au milieu de chaque totem, pilier, pylône, borne,
// poteau de portail et tour de suspension.

// Nombre de pixels opaques de chaque colonne, du premier au dernier opaque.
function profile(v, l0, l1, t0, t1, h) {
  const R = frameOf(v, [[l0 - 2, l1 + 2, t0 - 2, t1 + 2, -1, h + 2]]);
  paintBox(R, v, l0, l1, t0, t1, 0, h, () => [200, 100, 50], () => [250, 200, 100]);
  const cols = [];
  for (let i = 0; i < R.w; i += 1) {
    let n = 0;
    for (let j = 0; j < R.h; j += 1) if (alphaAt(R, i, j)) n += 1;
    cols.push(n);
  }
  const a = cols.findIndex((n) => n > 0);
  const b = cols.length - 1 - [...cols].reverse().findIndex((n) => n > 0);
  return cols.slice(a, b + 1);
}

describe("paintBox", () => {
  for (const v of [false, true]) {
    it(`une boîte au coin à une demi-unité est pleine (vertical = ${v})`, () => {
      // Le totem de la bande 0, côté amont : 4 × 4, 25 de haut, à 1,5 du parapet.
      const cols = profile(v, 641, 645, 122.5, 126.5, 25);
      for (const n of cols) expect(n).toBeGreaterThanOrEqual(25);
    });
    it(`une boîte au coin entier ne bouge pas (vertical = ${v})`, () => {
      expect(profile(v, 641, 645, 122, 126, 25)).toEqual([26, 26, 28, 28, 28, 28, 26, 26]);
    });
  }
});
