// Emprise des merveilles indexée sur le RANG (cmWonderExtent / cmForEachWonderCell).
//
// Régression 2026-07-24 (« la zone autour des merveilles, là c'est direct de la
// taille rang max ») : l'emprise se dérivait des dimensions du sprite de rang V
// quel que soit le rang atteint. Une Couronne de Pierre rang I fait 128×88 px et
// trônait au milieu d'un parvis taillé pour 400×256 : la place naissait finie.
//
// Le premier test est l'ANCRAGE EXTERNE de la fiche. Il confrontait la table aux
// en-têtes PNG des sprites « de face » ; depuis la refonte du 2026-10-02 les
// merveilles sont CUITES par le code (iso/wonderBake.js) dans le socle et la
// hauteur que cette table leur donne — l'ancrage vérifie donc que chaque monument
// cuit, à chaque rang, tient dans l'emprise réservée. Sans lui, tout le reste ne
// ferait que comparer le calcul à sa propre table.
import { describe, it, expect } from 'vitest';
import {
  cmWonderExtent, cmWonderSpriteDims, cmWonderCoreR, cmForEachWonderCell, CM_WONDERS,
} from '../layout.js';
import { wonderKitForBand } from '../iso/wonderKits.js';
import * as WB from '../iso/wonderBake.js';
// La constante de layout.js elle-même, pas une recopie à synchroniser (audit
// 2026-10-05, TEST-12).
import { WONDER_PPT } from '../spriteScale.js';

const T = 32;
const DRY = CM_WONDERS.map((w) => w.id).filter((id) => id !== 'era_mega');
const RECIPE = {
  dynasty1: 'bakeMausoleum', pop1m: 'bakeColumn', era_kingdom: 'bakePalace',
  era_empire: 'bakeCathedral', era_mega: 'bakeNeedle', era_singularity: 'bakeEye',
};
// Boîte d'encre d'un raster cuit, en coordonnées écran zoom 1 autour de l'origine.
function inkBox(R) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let j = 0; j < R.h; j += 1) {
    for (let i = 0; i < R.w; i += 1) {
      if (!R.data[(j * R.w + i) * 4 + 3]) continue;
      x0 = Math.min(x0, R.ox + i); x1 = Math.max(x1, R.ox + i + 1);
      y0 = Math.min(y0, R.oy + j); y1 = Math.max(y1, R.oy + j + 1);
    }
  }
  return { x0, x1, y0, y1 };
}

const cellsAt = (id, tier) => {
  const seen = new Set();
  cmForEachWonderCell({ gx: 40, gy: 40 }, id, 200, (gx, gy, k) => seen.add(k), tier);
  return seen.size;
};

describe('emprise des merveilles : la zone grandit avec le rang', () => {
  it('chaque merveille cuite tient dans son emprise, à chaque rang (ancrage)', () => {
    for (const id of DRY) {
      for (let t = 1; t <= 5; t += 1) {
        const d = cmWonderSpriteDims(id, t);
        const out = WB[RECIPE[id]](wonderKitForBand(4), t, (d.nw / (2 * WONDER_PPT)) * T, (d.nh / WONDER_PPT) * T);
        const b = inkBox(out.R), r = (cmWonderExtent(id, t).halfW + 0.5) * T;
        // Le losange de l'emprise : 2r de part et d'autre en X, son coin avant à +r.
        expect(b.x0, `${id} rang ${t} déborde à gauche`).toBeGreaterThanOrEqual(-2 * r);
        expect(b.x1, `${id} rang ${t} déborde à droite`).toBeLessThanOrEqual(2 * r);
        expect(b.y1, `${id} rang ${t} déborde devant`).toBeLessThanOrEqual(r);
      }
    }
  });

  it('le rang I est strictement plus petit que le rang V', () => {
    for (const id of DRY) {
      const e1 = cmWonderExtent(id, 1), e5 = cmWonderExtent(id, 5);
      expect(e1.halfW, id).toBeLessThan(e5.halfW);
      expect(cellsAt(id, 1), id).toBeLessThan(cellsAt(id, 5));
    }
  });

  it('ne rétrécit jamais d un rang au suivant (la pierre ne recule pas)', () => {
    for (const id of DRY) {
      for (let t = 2; t <= 5; t += 1) {
        expect(cmWonderExtent(id, t).halfW, `${id} rang ${t}`)
          .toBeGreaterThanOrEqual(cmWonderExtent(id, t - 1).halfW);
      }
    }
  });

  it('le parvis contient toujours la largeur du monument de son rang', () => {
    // Le vrai risque en rétrécissant : un sprite qui déborde de son propre
    // parvis. Le sprite est dessiné à ~34 px par tuile (WONDER_PPT), largeur
    // nw/34 tuiles, centré sur le slot → il faut halfW >= nw/68.
    for (const id of DRY) {
      for (let t = 1; t <= 5; t += 1) {
        const d = cmWonderSpriteDims(id, t);
        expect(cmWonderExtent(id, t).halfW, `${id} rang ${t}`)
          .toBeGreaterThanOrEqual(d.nw / (2 * WONDER_PPT));
      }
    }
  });

  it('le socle non-marchable suit le rang et reste dans le parvis', () => {
    for (const id of DRY) {
      expect(cmWonderCoreR(id, 1), id).toBeLessThanOrEqual(cmWonderCoreR(id, 5));
      for (let t = 1; t <= 5; t += 1) {
        // Un socle plus large que l'emprise fermerait tout le parvis à la marche.
        expect(cmWonderCoreR(id, t), `${id} rang ${t}`).toBeLessThan(cmWonderExtent(id, t).halfW);
      }
    }
  });

  it('sans rang, on garde le rang V — les appelants non migrés ne bougent pas', () => {
    for (const id of DRY) {
      expect(cmWonderExtent(id)).toEqual(cmWonderExtent(id, 5));
      expect(cmWonderCoreR(id)).toBe(cmWonderCoreR(id, 5));
      expect(cellsAt(id, undefined)).toBe(cellsAt(id, 5));
    }
  });

  it('un rang hors bornes est ramené dans 1..5 au lieu de rendre une emprise vide', () => {
    for (const id of DRY) {
      expect(cmWonderExtent(id, 0)).toEqual(cmWonderExtent(id, 1));
      expect(cmWonderExtent(id, 9)).toEqual(cmWonderExtent(id, 5));
    }
  });
});
