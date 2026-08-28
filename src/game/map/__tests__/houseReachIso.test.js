// LA PORTÉE ISO D'UN SPRITE D'HABITATION — le reste vivant de S3.
//
// `houseSpriteHeightTiles` compte les tuiles à la façon du rendu top-down
// (retiré depuis) ; `houseSpriteReachTilesIso` compte les RANGS que le sprite
// recouvre tel que le peintre iso le dessine. L'écart est un facteur ~3, et
// c'est lui qui décidait où la pluie a le droit de rebondir.
import { describe, it, expect } from 'vitest';
import { HOUSE_UNIT, HOUSE_LOT_WF, houseScaleK } from '../spriteScale.js';
import { ISO_Y } from '../iso/projection.js';

// Reproduit les deux formules sur une encre synthétique — pas de PNG, pas de
// canvas : c'est l'ALGÈBRE qu'on verrouille, la seule chose qui puisse dériver.
const legacyTiles = (inkH, sx, sy) => (inkH / HOUSE_UNIT) * ((2 * sx) / (sx + sy));
const isoTiles = (inkW, inkH, sx, sy, T = 32) => {
  const w = (sx + sy) * T * HOUSE_LOT_WF;
  return (inkH * houseScaleK(sx, w, inkW, sy)) / (T * ISO_Y);
};

describe('portée iso d une habitation', () => {
  it('vaut ~3× le compte top-down sur un lot carré (le défaut mesuré de S3)', () => {
    // Encre étroite : le clamp au lot ne mord pas, on lit l'algèbre pure.
    const r = isoTiles(30, 49, 1, 1) / legacyTiles(49, 1, 1);
    expect(r).toBeGreaterThan(3.0);
    expect(r).toBeLessThan(3.3);
  });

  it('croît avec la hauteur d encre, et jamais avec la seule profondeur du lot', () => {
    expect(isoTiles(30, 80, 1, 1)).toBeGreaterThan(isoTiles(30, 40, 1, 1));
    // 1×2 : le peintre alloue plus large, mais l'unité honnête (G1) compense —
    // la portée ne doit pas s'envoler parce que le lot est profond.
    const carre = isoTiles(30, 60, 1, 1), profond = isoTiles(30, 60, 1, 2);
    expect(Math.abs(profond - carre)).toBeLessThan(carre * 0.02);
  });

  it('reste positive et bornée pour toutes les encres plausibles', () => {
    for (const inkH of [20, 40, 60, 80, 110]) {
      for (const sx of [1, 2, 3]) {
        const v = isoTiles(Math.round(inkH * 0.7), inkH, sx, sx);
        expect(v).toBeGreaterThan(0);
        expect(v).toBeLessThan(12);
      }
    }
  });
});
