// LES BRUITAGES DE LA MACHINE À SOUS (2026-10-03) : joués par le code, trois habits.
// On ne les entend pas ici — on les MESURE : chacun sonne, sans écrêter ni claquer.
import { describe, it, expect } from 'vitest';
import { rendreSon, rendreRonron, SONS_SLOTS, SFX_SR } from '../slotsSound.js';

const LOOKS = ['fonte', 'neon', 'cosmic'];
function mesure(buf) {
  let crete = 0, e = 0, faux = 0;
  for (let i = 0; i < buf.length; i += 1) {
    if (!Number.isFinite(buf[i])) faux += 1;
    crete = Math.max(crete, Math.abs(buf[i]));
    e += buf[i] * buf[i];
  }
  return { crete, rms: Math.sqrt(e / buf.length), faux };
}

describe('les bruitages de la machine à sous', () => {
  it('chaque son, dans chaque habit, sonne sans écrêter et finit dans le silence', () => {
    for (const look of LOOKS) for (const nom of SONS_SLOTS) {
      const b = rendreSon(nom, look);
      const m = mesure(b);
      expect(m.faux, `${nom} ${look}`).toBe(0);
      expect(m.crete, `${nom} ${look}`).toBeLessThanOrEqual(0.81);
      expect(m.rms, `${nom} ${look} : muet`).toBeGreaterThan(0.004);
      expect(Math.abs(b[b.length - 1]), `${nom} ${look} : clic de fin`).toBeLessThan(0.02);
      expect(b.length / SFX_SR, `${nom} ${look}`).toBeLessThan(4.5);
    }
  });

  it('le ronron des rouleaux est une boucle propre (pas de saut à la couture)', () => {
    for (const look of LOOKS) {
      const b = rendreRonron(look);
      const m = mesure(b);
      expect(m.faux).toBe(0);
      expect(m.rms, look).toBeGreaterThan(0.01);
      // La couture : la fin rejoint le début sans marche.
      expect(Math.abs(b[b.length - 1] - b[0]), look).toBeLessThan(0.25);
    }
  });

  it('les sons sont rendus à l’identique (aléa à graine)', () => {
    const a = rendreSon('gain3', 'neon'), b = rendreSon('gain3', 'neon');
    for (let i = 0; i < a.length; i += 509) expect(a[i]).toBe(b[i]);
  });
});
