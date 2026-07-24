// Emprise des merveilles indexée sur le RANG (cmWonderExtent / cmForEachWonderCell).
//
// Régression 2026-07-24 (« la zone autour des merveilles, là c'est direct de la
// taille rang max ») : l'emprise se dérivait des dimensions du sprite de rang V
// quel que soit le rang atteint. Une Couronne de Pierre rang I fait 128×88 px et
// trônait au milieu d'un parvis taillé pour 400×256 : la place naissait finie.
//
// Le premier test est le seul ANCRAGE EXTERNE de la fiche : la table de
// dimensions est confrontée aux en-têtes PNG des sprites réellement livrés. Sans
// lui, tout le reste ne ferait que comparer le calcul à sa propre table — si un
// sprite est regénéré à une autre taille, c'est ce test qui doit le dire.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  cmWonderExtent, cmWonderSpriteDims, cmWonderCoreR, cmForEachWonderCell, CM_WONDERS,
} from '../layout.js';

const WONDER_PPT = 34;          // doit rester synchronisé avec layout.js / renderBuildings.js
const DRY = CM_WONDERS.map((w) => w.id).filter((id) => id !== 'era_mega');

// En-tête PNG : largeur/hauteur en big-endian aux octets 16 et 20 (IHDR).
function pngSize(id, tier) {
  const b = readFileSync(join(process.cwd(), 'public/pixelart/wonders', `${id}-t${tier}.png`));
  return { nw: b.readUInt32BE(16), nh: b.readUInt32BE(20) };
}

const cellsAt = (id, tier) => {
  const seen = new Set();
  cmForEachWonderCell({ gx: 40, gy: 40 }, id, 200, (gx, gy, k) => seen.add(k), tier);
  return seen.size;
};

describe('emprise des merveilles : la zone grandit avec le rang', () => {
  it('la table de dimensions colle aux sprites livrés (ancrage sur les PNG)', () => {
    for (const w of CM_WONDERS) {
      for (let t = 1; t <= 5; t += 1) {
        expect(cmWonderSpriteDims(w.id, t), `${w.id}-t${t}`).toEqual(pngSize(w.id, t));
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
