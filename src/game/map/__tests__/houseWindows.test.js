import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { HOUSE_WINDOWS } from '../houseWindowsData.js';

// LES FENÊTRES DES MAISONS, RELEVÉES À LA MAIN (2026-10-03, Raph : « les lumières arrivent
// n'importe où sur les bâtiments, il faut les reprendre une par une »). Une maison
// allume ce qui est relevé dans houseWindowsData.js, et rien d'autre.
describe('fenêtres relevées des maisons', () => {
  const read = (nom) => PNG.sync.read(readFileSync(new URL(`../../../../public/pixelart/houses/${nom}.png`, import.meta.url)));
  const pixelsOf = (win) => {
    const out = [];
    for (let i = 0; i < win.length; i += 4) {
      for (let y = win[i + 1]; y < win[i + 1] + win[i + 3]; y += 1) for (let x = win[i]; x < win[i] + win[i + 2]; x += 1) out.push([x, y]);
    }
    return out;
  };
  for (const [nom, wins] of Object.entries(HOUSE_WINDOWS)) {
    it(`${nom} : chaque fenêtre tombe sur l'encre, sans chevaucher sa voisine`, () => {
      const p = read(nom), owner = new Map();
      expect(wins.length).toBeGreaterThan(0);
      wins.forEach((win, i) => {
        expect(win.length % 4).toBe(0);
        for (const [x, y] of pixelsOf(win)) {
          expect(x >= 0 && y >= 0 && x < p.width && y < p.height).toBe(true);
          expect(p.data[(y * p.width + x) * 4 + 3]).toBeGreaterThan(200);
          expect(owner.has(y * p.width + x)).toBe(false);
          owner.set(y * p.width + x, i);
        }
      });
    });
  }
  // Ce que Raph a refusé d'y voir allumé (« tu allumes des portes et des étals »).
  // 2026-10-09 : les maisons redessinées (reprise des sprites) attendent leur relevé ; les
  // zones éteintes se relèveront avec elles, sur le nouveau dessin.
  const ETEINT = {};
  for (const [nom, zones] of Object.entries(ETEINT)) {
    it(`${nom} : portes, étals et arcades restent éteints`, () => {
      for (const win of HOUSE_WINDOWS[nom]) {
        for (const [x, y] of pixelsOf(win)) {
          for (const [zx, zy, zw, zh] of zones) expect(x >= zx && x < zx + zw && y >= zy && y < zy + zh).toBe(false);
        }
      }
    });
  }
});
