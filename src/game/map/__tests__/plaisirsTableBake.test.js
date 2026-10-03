// LA TABLE DE JEU EN GROS PLAN (2026-10-03, iso/plaisirsTableBake.js) — les dix âges,
// les quatre jeux : le mur couvre le haut du cadre, la table le bas, les places des
// mises tombent sur le tapis et dans le cadre, la croupière se tient derrière le bord.
import { describe, it, expect } from 'vitest';
import { bakeTableScene } from '../iso/plaisirsTableBake.js';

const GAMES = ['cartes', 'des', 'tickets', 'icare'];

describe('la table de jeu en gros plan', () => {
  it('chaque âge, chaque jeu : un mur plein, une table pleine sous lui', () => {
    for (let b = 0; b <= 9; b += 1) for (const g of GAMES) {
      const t = bakeTableScene(b, g, 260, 80, 66);
      expect(t.W).toBe(260);
      // Le mur couvre tout le haut (opaque), la table tout le bas jusqu'au sol.
      for (let x = 0; x < 260; x += 13) {
        expect(t.back.data[(2 * 260 + x) * 4 + 3], `âge ${b} ${g} : mur`).toBe(255);
        expect(t.front.data[((t.surf.y0 + 4) * 260 + x) * 4 + 3], `âge ${b} ${g} : plateau`).toBe(255);
        expect(t.front.data[(79 * 260 + x) * 4 + 3], `âge ${b} ${g} : sol`).toBe(255);
      }
      // La croupière : ses pieds derrière le bord du plateau.
      expect(t.dealer.y).toBeGreaterThan(t.surf.y0);
    }
  });

  it('les places des mises tombent sur le tapis, dans le cadre', () => {
    for (const n of [3, 4]) {
      const t = bakeTableScene(7, 'des', 260, 80, 66, true, n);
      expect(t.spots).toHaveLength(n);
      for (const x of t.spots) { expect(x).toBeGreaterThan(20); expect(x).toBeLessThan(240); }
      expect(t.spotY).toBeGreaterThan(t.surf.y0);
      expect(t.spotY).toBeLessThan(t.surf.y1);
    }
  });
});
