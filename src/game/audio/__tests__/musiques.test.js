// LES MUSIQUES DU JEU (2026-10-03) : le dossier src/assets/musiques/ fait la liste,
// et la petite mélodie de la scène se joue par le code, âge par âge.
import { describe, it, expect } from 'vitest';
import { titreDe, listeDe, MUSIQUES } from '../musiques.js';
import { renderMelodie, MELODIE_SR, hz } from '../melodieScene.js';

describe('les musiques du dossier', () => {
  it('le titre est le nom du fichier, sans numéro ni extension', () => {
    expect(titreDe('../../assets/musiques/01 - Track 5 (Abstraction).ogg')).toBe('Track 5 (Abstraction)');
    expect(titreDe('x/02_la-taverne_du_port.mp3')).toBe('La taverne du port');
    expect(titreDe('x/Valse - Ré mineur.m4a')).toBe('Valse - Ré mineur');
  });

  it("l'ordre suit les numéros, 10 après 9", () => {
    const l = listeDe({ 'a/10 - Z.ogg': 'u10', 'a/9 - Y.ogg': 'u9', 'a/01 - X.ogg': 'u1' });
    expect(l.map((m) => m.title)).toEqual(['X', 'Y', 'Z']);
    expect(l[0]).toEqual({ id: '01 - X.ogg', title: 'X', url: 'u1' });
  });

  it('la musique de toujours est dans le dossier, en tête', () => {
    expect(MUSIQUES.length).toBeGreaterThan(0);
    expect(MUSIQUES[0].title).toBe('Track 5 (Abstraction)');
  });
});

describe('la petite mélodie de la scène', () => {
  it('le la est à 440', () => {
    expect(hz('A4')).toBeCloseTo(440, 6);
    expect(hz('A2')).toBeCloseTo(110, 6);
  });

  it('chaque âge joue, sans écrêter ni se taire', () => {
    for (let band = 0; band <= 9; band += 1) {
      const m = renderMelodie(band);
      const sec = m.length / MELODIE_SR;
      expect(sec, `âge ${band}`).toBeGreaterThan(4);
      expect(sec, `âge ${band}`).toBeLessThan(9);
      let crete = 0, e = 0, faux = 0;
      for (let i = 0; i < m.length; i++) {
        if (!Number.isFinite(m[i])) faux += 1;
        crete = Math.max(crete, Math.abs(m[i]));
        e += m[i] * m[i];
      }
      expect(faux, `âge ${band}`).toBe(0);
      expect(crete, `âge ${band}`).toBeLessThanOrEqual(0.81);
      expect(Math.sqrt(e / m.length), `âge ${band} : trop bas`).toBeGreaterThan(0.04);
      // Elle finit dans le silence (fondu de sortie), sans clic.
      expect(Math.abs(m[m.length - 1])).toBeLessThan(1e-3);
    }
  });

  it('le même âge rend toujours la même mélodie (aléa à graine)', () => {
    const a = renderMelodie(5), b = renderMelodie(5);
    expect(a.length).toBe(b.length);
    for (let i = 0; i < a.length; i += 997) expect(a[i]).toBe(b[i]);
  });
});
