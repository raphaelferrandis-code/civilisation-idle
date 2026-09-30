import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { windowPixels } from '../houseWindows.js';

function facade() {
  const data = new Uint8ClampedArray(20 * 30 * 4);
  for (let i = 0; i < data.length; i += 4) data.set([180, 160, 130, 255], i);
  const rect = (x, y, w, h, alpha = 255) => {
    for (let yy = y; yy < y + h; yy += 1) for (let xx = x; xx < x + w; xx += 1) {
      data.set([30, 25, 20, alpha], (yy * 20 + xx) * 4);
    }
  };
  return { data, rect };
}
describe('ouvertures éclairées des habitations', () => {
  it('repère deux petites fenêtres indépendantes dans une façade opaque', () => {
    const { data, rect } = facade();
    rect(4, 13, 2, 4); rect(12, 15, 3, 5);
    expect(windowPixels(data, 20, 30).map(p => p.length)).toEqual([8, 15]);
  });
  it('ne transforme ni un bord transparent ni une toiture ni une porte en lampe', () => {
    const { data, rect } = facade();
    rect(3, 2, 3, 4); rect(10, 22, 5, 8);
    rect(3, 14, 2, 4); rect(2, 14, 1, 4, 0);
    expect(windowPixels(data, 20, 30)).toEqual([]);
  });
  it('écarte les grandes masses sombres et conserve les vitres non rectangulaires', () => {
    const { data, rect } = facade();
    rect(1, 11, 9, 9); rect(14, 15, 1, 4); rect(15, 16, 1, 3);
    expect(windowPixels(data, 20, 30).map(p => p.length)).toEqual([7]);
  });
});

// Seuil par dessin (nuit du 2026-10-01) : la maison de ville et la tour de verre peignent
// leurs vitres un cran plus clair que les autres — au seuil commun (68) elles n'en
// livraient AUCUNE, et la moitié des maisons de la bande 2 restaient noires la nuit.
describe('ouvertures des dessins aux vitres claires', () => {
  const read = (nom) => {
    const buf = readFileSync(new URL(`../../../../public/pixelart/houses/${nom}.png`, import.meta.url));
    return PNG.sync.read(buf);
  };
  for (const nom of ['townhouse', 'tower']) {
    it(`${nom} : aucune au seuil commun, des vraies au seuil 80`, () => {
      const p = read(nom);
      expect(windowPixels(p.data, p.width, p.height).length).toBe(0);
      expect(windowPixels(p.data, p.width, p.height, 80).length).toBeGreaterThanOrEqual(5);
    });
  }
});
