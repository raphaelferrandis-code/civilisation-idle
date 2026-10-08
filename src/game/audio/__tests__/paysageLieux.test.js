// LES PETITS SONS DE LA CARTE (lot 9 du paysage sonore) : les moulins, les cloches des
// lieux de culte, les bêtes qu'on voit (paysage.js, paysageSynthLieux.js). On ne les
// entend pas ici — Raph les juge au banc — : on vérifie qu'ils se rendent, que chaque
// époque a sa cloche, et qu'ils ne se chargent que quand on les voit.
import { describe, it, expect } from 'vitest';
import { rendreLieu, SONS_LIEUX, timbreTemple } from '../paysage/paysageSynthLieux.js';
import { sonsUtiles, joueA, SEMES, EMETTEURS } from '../paysage/paysage.js';
import { SONS_PAYSAGE, PAYSAGE_SR } from '../paysage/paysageSynth.js';

const RIEN = { pluie: false, emeute: false, moulin: false, temple: false, eau: false, betes: false };

describe('les sons des lieux', () => {
  it('chacun se rend, fini, sans écrêtage ; le paysage les connaît', () => {
    for (const nom of SONS_LIEUX) {
      const b = rendreLieu(nom, PAYSAGE_SR);
      expect(b, nom).toBeInstanceOf(Float32Array);
      expect(b.every(Number.isFinite), nom).toBe(true);
      expect(b.reduce((m, v) => Math.max(m, Math.abs(v)), 0), nom).toBeLessThanOrEqual(0.96);
      expect(SONS_PAYSAGE, nom).toContain(nom);
    }
    expect(rendreLieu('inconnu', PAYSAGE_SR)).toBe(null);
  });

  it('à chaque époque, sa cloche de culte : une seule, dans la matière de l’âge', () => {
    const cultes = Object.entries(SEMES).filter(([, d]) => d.sur === 'temple');
    for (let b = 0; b <= 9; b += 1) {
      const la = cultes.filter(([, d]) => joueA(d, b));
      expect(la.length, `bande ${b}`).toBe(1);
      for (const s of la[0][1].synth) expect(s, `bande ${b}`).toMatch(new RegExp(`^temple-${timbreTemple(b)}-`));
    }
  });
});

describe('ils ne se chargent que quand on les voit', () => {
  it('le moulin, la cloche, les bêtes : seulement quand ils passent à l’écran', () => {
    const rien = sonsUtiles(3, undefined, undefined, RIEN);
    expect(rien.synth.has('moulinVent')).toBe(false);
    expect(rien.synth.has('temple-bronze-1')).toBe(false);
    const vus = sonsUtiles(3, undefined, undefined, { ...RIEN, moulin: true, temple: true });
    expect(vus.synth.has('moulinVent')).toBe(true);
    expect(vus.synth.has('eolienne')).toBe(false);                 // l'éolienne, au Néon seulement
    expect(sonsUtiles(6, undefined, undefined, { ...RIEN, moulin: true }).synth.has('eolienne')).toBe(true);
    expect(vus.synth.has('temple-bronze-1')).toBe(true);
    expect(vus.synth.has('temple-cloche-1')).toBe(true);             // la cloche de la Cathédrale
    expect(vus.synth.has('temple-cristal-1')).toBe(false);           // pas l'époque du cristal
    expect(joueA(EMETTEURS.moulinVent, 7)).toBe(false);             // plus de moulins aux âges cosmiques
  });

  it('le chien tout près a ses propres fichiers, clairs ; ils ne se chargent que s’il passe à l’écran', () => {
    const liste = [{ id: 'chien-aboie-1', famille: 'chien' }, { id: 'chienpres-aboie-1', famille: 'chienpres' }];
    const ids = new Set(liste.map((e) => e.id));
    expect(SEMES.chienProche.famille).toBe('chienpres');
    const loin = sonsUtiles(3, liste, ids, { ...RIEN });
    const pres = sonsUtiles(3, liste, ids, { ...RIEN, betes: true });
    expect([...loin.enr]).toEqual(['chien-aboie-1']);                    // le chien au loin, la nuit
    expect([...pres.enr].sort()).toEqual(['chien-aboie-1', 'chienpres-aboie-1']);
    // Sans fichier de cygne, rien à charger pour lui, même au bord de l'eau.
    expect(sonsUtiles(3, liste, ids, { ...RIEN, eau: true }).enr.size).toBe(1);
  });
});
