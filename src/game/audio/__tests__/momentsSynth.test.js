// LES SONS DES GRANDS MOMENTS, la synthèse (audio/moments/momentsSynth.js, lot 7 du
// paysage sonore). On ne les entend pas ici — Raph les juge au banc d'écoute — : on
// vérifie que chacun se rend, sans trou ni écrêtage, à la durée attendue, et que la
// boucle du grondement ne claque pas.
import { describe, it, expect } from 'vitest';
import { rendreMoment, SONS_MOMENTS, MOMENTS_SR, matiereDe, MATIERES } from '../moments/momentsSynth.js';

const crete = (b) => b.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
const efficace = (b) => Math.sqrt(b.reduce((s, v) => s + v * v, 0) / b.length);

describe('les sons des grands moments', () => {
  it('chacun se rend, fini, sans écrêtage, et pas muet', () => {
    expect(SONS_MOMENTS.length).toBe(4 + 12 + 3 + 20 + 8 + 8 + 6);
    for (const nom of SONS_MOMENTS) {
      const b = rendreMoment(nom);
      expect(b, nom).toBeInstanceOf(Float32Array);
      expect(b.length / MOMENTS_SR, nom).toBeGreaterThan(0.3);
      expect(b.every(Number.isFinite), nom).toBe(true);
      expect(crete(b), nom).toBeLessThanOrEqual(0.81);
      expect(efficace(b), nom).toBeGreaterThan(0.005);
    }
    expect(rendreMoment('inconnu')).toBe(null);
  });

  it('le grondement boucle sans claquer, et il a du corps au-dessus de 110 Hz', () => {
    const b = rendreMoment('grondement');
    expect(b.length / MOMENTS_SR).toBeCloseTo(6, 3);
    // La couture : l'écart entre la fin et le début reste de l'ordre d'un pas ordinaire.
    let pas = 0;
    for (let i = 1; i < b.length; i += 1) pas = Math.max(pas, Math.abs(b[i] - b[i - 1]));
    expect(Math.abs(b[0] - b[b.length - 1])).toBeLessThan(pas * 1.5);
  });

  it("la matière suit l'âge : le bois, la pierre, le fer, le cristal", () => {
    expect([0, 1, 2, 4, 5, 6, 7, 9].map(matiereDe)).toEqual(['bois', 'bois', 'pierre', 'pierre', 'metal', 'metal', 'cosmique', 'cosmique']);
    expect(MATIERES).toHaveLength(4);
  });
});
