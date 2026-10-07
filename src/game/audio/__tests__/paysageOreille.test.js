// L'OREILLE DU PAYSAGE SONORE (docs/PLAN-AMBIANCE-SONORE.md § 3.1 et § 3.5) : au-dessus
// du centre de l'écran, à une hauteur que règle le zoom. Ce qu'elle doit garantir, en
// termes de jeu : la libellule s'entend zoomé sur elle et plus du tout dézoomé ; le
// passage du proche au lointain ne creuse pas le volume ; rien n'est dans une seule
// oreille.
import { describe, it, expect } from 'vitest';
import { OREILLE, proximite, hauteur, attenuation, panoramique, fondu, coupure } from '../paysage/oreille.js';

describe("l'oreille du paysage sonore", () => {
  it('la proximité monte avec le zoom : 0 tout dézoomé, 1 de près, ½ à mi-chemin', () => {
    expect(proximite(0.3)).toBe(0);
    expect(proximite(OREILLE.zLoin)).toBe(0);
    expect(proximite(OREILLE.zPres)).toBe(1);
    expect(proximite(3.125)).toBe(1);
    expect(proximite(Math.sqrt(OREILLE.zLoin * OREILLE.zPres))).toBeCloseTo(0.5, 6);
    let avant = -1;
    for (let z = 0.25; z <= 3.2; z += 0.05) {
      const p = proximite(z);
      expect(p).toBeGreaterThanOrEqual(avant);
      avant = p;
    }
  });

  it('le passage du proche au lointain garde la puissance', () => {
    for (let p = 0; p <= 1.0001; p += 0.1) {
      const f = fondu(p);
      expect(f.proche ** 2 + f.loin ** 2).toBeCloseTo(1, 9);
    }
    expect(fondu(1).proche).toBeCloseTo(1, 9);
    expect(fondu(1).loin).toBeCloseTo(0, 9);
    expect(fondu(0).loin).toBeCloseTo(1, 9);
  });

  it("une libellule s'entend zoomé sur elle, à peine au zoom 1, plus du tout dézoomé", () => {
    const lib = { ref: 1.7, max: 6.5 };                 // la portée de paysage.js
    const pres = attenuation(0.5, hauteur(3), lib.ref, lib.max);
    const moyen = attenuation(0.5, hauteur(1), lib.ref, lib.max);
    const loin = attenuation(0.5, hauteur(0.5), lib.ref, lib.max);
    expect(pres).toBeGreaterThan(0.5);
    expect(moyen).toBeLessThan(pres / 2);
    expect(loin).toBe(0);
  });

  it('le gain vaut ½ à la distance de référence, et s’éteint à la portée sans marche', () => {
    expect(attenuation(4, 0, 4, 100)).toBeCloseTo(0.5, 9);
    expect(attenuation(10, 0, 4, 10)).toBe(0);
    expect(attenuation(12, 0, 4, 10)).toBe(0);
    expect(attenuation(9.99, 0, 4, 10)).toBeLessThan(0.01);
    // La hauteur compte comme une distance : monter l'oreille éloigne tout.
    expect(attenuation(2, 5, 4, 100)).toBeLessThan(attenuation(2, 1, 4, 100));
  });

  it("le panoramique suit l'écran, borné : jamais dans une seule oreille", () => {
    expect(panoramique(500, 1000)).toBe(0);
    expect(panoramique(0, 1000)).toBeCloseTo(-OREILLE.panMax, 9);
    expect(panoramique(1000, 1000)).toBeCloseTo(OREILLE.panMax, 9);
    expect(panoramique(-800, 1000)).toBeCloseTo(-OREILLE.panMax, 9);
    expect(Math.abs(panoramique(3000, 1000))).toBeLessThan(1);
  });

  it("le passe-bas du proche se ferme quand on dézoome (l'air mange l'aigu)", () => {
    expect(coupure(1)).toBeCloseTo(OREILLE.fHaut, 6);
    expect(coupure(0)).toBeCloseTo(OREILLE.fBas, 6);
    expect(coupure(0.4)).toBeLessThan(coupure(0.8));
  });
});
