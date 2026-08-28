// S6 — L'ARRONDI DE POSITION TOMBE SUR LA GRILLE **DEVICE**.
//
// La carte dessine sous un contexte scalé par `dpr`. Un arrondi en px CSS y
// tombe sur `dpr` px device : entier à dpr 1 et 2, mais sur un quart de pixel à
// 1,25 et une demie à 1,5 — les deux échelles Windows les plus répandues. Ces
// gardes verrouillent l'invariant, pas l'implémentation : quelle que soit la
// façon dont on rabat, une position blitée doit atterrir sur un pixel device.
import { describe, it, expect, afterEach } from 'vitest';
import { CM } from '../layout.js';
import { BLIT_SNAP, snapRectForTest } from '../cityEngineSprites.js';

const savedDpr = CM.dpr, savedMode = BLIT_SNAP.mode;
afterEach(() => { CM.dpr = savedDpr; BLIT_SNAP.mode = savedMode; });

// Une position est sur la grille device si v·dpr est entier.
const surGrille = (v, dpr) => Math.abs(v * dpr - Math.round(v * dpr)) < 1e-9;

describe('S6 — snap des sprites sur la grille device', () => {
  it('rabat position ET reste sur la grille aux dpr fractionnaires', () => {
    BLIT_SNAP.mode = 1;
    for (const dpr of [1, 1.25, 1.5, 2]) {
      CM.dpr = dpr;
      for (const [l, t] of [[10.3, 20.7], [0.1, 0.9], [123.456, 78.9], [-4.2, -9.8]]) {
        const [left, top] = snapRectForTest(l, t, 40, 40, 64, 64);
        expect(surGrille(left, dpr), `dpr ${dpr} left ${l}→${left}`).toBe(true);
        expect(surGrille(top, dpr), `dpr ${dpr} top ${t}→${top}`).toBe(true);
        // Et le rabattement reste un RABATTEMENT : jamais plus d'un demi-pixel
        // device de déplacement, sinon le sprite quitterait son lot.
        expect(Math.abs(left - l)).toBeLessThanOrEqual(0.5 / dpr + 1e-9);
        expect(Math.abs(top - t)).toBeLessThanOrEqual(0.5 / dpr + 1e-9);
      }
    }
  });

  it('à dpr 1, c est l arrondi entier historique — les postes nets ne bougent pas', () => {
    BLIT_SNAP.mode = 1;
    CM.dpr = 1;
    const [left, top] = snapRectForTest(10.3, 20.7, 40, 40, 64, 64);
    expect(left).toBe(10);
    expect(top).toBe(21);
  });

  it('mode 0 : aucun rabattement, la valeur passe telle quelle (A/B)', () => {
    BLIT_SNAP.mode = 0;
    CM.dpr = 1.5;
    const [left, top] = snapRectForTest(10.3, 20.7, 40, 40, 64, 64);
    expect(left).toBe(10.3);
    expect(top).toBe(20.7);
  });
});
