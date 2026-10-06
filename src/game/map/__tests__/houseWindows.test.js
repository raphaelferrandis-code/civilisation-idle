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
  const ETEINT = {
    towerhouse: [[14, 60, 9, 13]],   // la porte cintrée
    townhouse: [[17, 38, 6, 11]],    // la porte
    taberna: [[0, 34, 32, 30]],      // l'étal sous l'auvent
    courtyard: [[36, 26, 14, 14]],   // le porche
    insula: [[0, 48, 64, 28]],       // les arcades du rez
    stonehouse: [[13, 35, 4, 8]],    // la porte
    // Les romaines tournées (2026-10-04) : portes, porche, portes cintrées, rambarde.
    // 2026-10-06 : « fr » est la domus retournée — son portique et sa porte, en miroir ;
    // « bl » est le dos de la domus, sans porte.
    'domus-fr': [[33, 33, 15, 15]],
    'insula2-fr': [[33, 33, 22, 5], [33, 54, 21, 16]],
    // Les rangées mitoyennes (2026-10-04) : étals, comptoirs, portiques, portes, balcon.
    'row-taberna-fl': [[18, 57, 33, 24]],
    'row-taberna-fr': [[50, 46, 25, 30]],
    'row-domus-fl': [[26, 53, 14, 20]],
    'row-domus-fr': [[56, 52, 16, 20]],
    'row-popina-fl': [[24, 46, 28, 30]],
    'row-popina-fr': [[50, 46, 27, 30]],
    'row-insula-fl': [[8, 57, 34, 26], [24, 45, 9, 14]],
    'row-insula-fr': [[55, 64, 6, 14]],
    'row-insula-br': [[55, 64, 6, 14]],
    'row-insula-bl': [[20, 63, 6, 12]],
    // Fonte (2026-10-04) : boutiques du rez des vues haussmanniennes.
    'haussmann-fr': [[32, 63, 30, 17]],
    'row-haussmann-fl': [[18, 80, 40, 22]],
    'row-haussmann-fr': [[50, 80, 32, 22]],
  };
  for (const [nom, zones] of Object.entries(ETEINT)) {
    it(`${nom} : portes, étals et arcades restent éteints`, () => {
      for (const win of HOUSE_WINDOWS[nom]) {
        for (const [x, y] of pixelsOf(win)) {
          for (const [zx, zy, zw, zh] of zones) expect(x >= zx && x < zx + zw && y >= zy && y < zy + zh).toBe(false);
        }
      }
    });
  }
  it('la maison artisane n a aucune vitre : seul son volet de bois s allume', () => {
    expect(HOUSE_WINDOWS.crafthouse).toEqual([[51, 43, 3, 5]]);
  });
});
