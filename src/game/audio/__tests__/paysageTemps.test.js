// LE TEMPS DU PAYSAGE SONORE (lot 5) : la pluie, la neige, la clameur d'une émeute, le chien
// au loin la nuit, les carillons de verre des âges cosmiques (paysage.js). On ne les entend
// pas ici — Raph les juge au banc d'écoute — : on vérifie quand ils sonnent, et quand ils se
// taisent.
import { describe, it, expect } from 'vitest';
import { ciblesNappes, tauxSeme, neigeDe, sonDeNappe, NAPPES, SEMES } from '../paysage/paysage.js';
import { rendrePaysage, SONS_PAYSAGE, PAYSAGE_SR } from '../paysage/paysageSynth.js';

const NATURE = { foret: 0.5, prairie: 0.5, champ: 0, eau: 0, rive: 0, ville: 0, place: 0 };
const VILLE = { foret: 0, prairie: 0, champ: 0, eau: 0, rive: 0, ville: 0.8, place: 0.2 };

describe('la pluie et la neige', () => {
  it("il pleut sur la terre à la campagne, sur la pierre en ville ; sans averse, rien", () => {
    const champs = ciblesNappes(NATURE, { pluie: 1, saison: 1 });
    expect(champs.pluie).toBeGreaterThan(0.5);
    expect(champs.pluieVille).toBe(0);
    const ville = ciblesNappes(VILLE, { pluie: 1, saison: 1 });
    expect(ville.pluieVille).toBeGreaterThan(ville.pluie);
    const sec = ciblesNappes(NATURE, { pluie: 0, saison: 1 });
    expect(sec.pluie + sec.pluieVille).toBe(0);
  });

  it("les rafales gonflent l'averse ; dézoomé, on l'entend encore (elle tombe partout)", () => {
    const calme = ciblesNappes(NATURE, { pluie: 0.8, saison: 2, rafale: 0 }).pluie;
    expect(ciblesNappes(NATURE, { pluie: 0.8, saison: 2, rafale: 1 }).pluie).toBeGreaterThan(calme);
    const loin = ciblesNappes(NATURE, { pluie: 0.8, saison: 2, proche: 0, loin: 1 }).pluie;
    expect(loin).toBeGreaterThan(0.3 * calme);
    expect(loin).toBeLessThan(calme);
  });

  it("l'hiver, la pluie du jeu tombe en neige : plus de pluie, et le monde s'assourdit", () => {
    const hiver = ciblesNappes(NATURE, { pluie: 1, saison: 3 });
    expect(hiver.pluie + hiver.pluieVille).toBe(0);
    expect(neigeDe(3, 0.6)).toBe(1);
    expect(neigeDe(3, 0.3)).toBeCloseTo(0.5, 9);
    expect(neigeDe(3, 0)).toBe(0);
    for (const s of [0, 1, 2]) expect(neigeDe(s, 1), `saison ${s}`).toBe(0);
  });
});

describe("l'émeute, la nuit, les âges cosmiques", () => {
  const cond = { nuit: 0, saison: 1, sec: 1, vivant: 1, cosmique: 0 };

  it('la clameur monte près des émeutiers ; sans émeute, rien', () => {
    expect(ciblesNappes(VILLE, { emeute: 3 }).emeute).toBeGreaterThan(0.5);
    expect(ciblesNappes(VILLE, { emeute: 0 }).emeute).toBe(0);
    expect(ciblesNappes(VILLE, { emeute: 3, proche: 0 }).emeute).toBe(0);
  });

  it("un chien aboie au loin la nuit, du côté des maisons ; jamais de jour ni aux âges cosmiques", () => {
    const P = { ville: 1 };
    expect(tauxSeme(SEMES.chien, P, { ...cond, nuit: 1 })).toBeGreaterThan(0);
    expect(tauxSeme(SEMES.chien, P, cond)).toBe(0);
    expect(tauxSeme(SEMES.chien, P, { ...cond, nuit: 1, vivant: 0 })).toBe(0);
  });

  it("les carillons de verre tintent aux âges cosmiques seulement, clairs et aigus", () => {
    const P = { ville: 1 };
    expect(tauxSeme(SEMES.carillon, P, cond, 1, 1, 4)).toBe(0);
    expect(tauxSeme(SEMES.carillon, P, { ...cond, cosmique: 1 }, 1, 1, 4)).toBeGreaterThan(0);
    for (const n of SEMES.carillon.synth) {
      expect(SONS_PAYSAGE).toContain(n);
      const b = rendrePaysage(n);
      expect(b.length / PAYSAGE_SR, n).toBeGreaterThan(3);
    }
  });

  it("la pluie et la clameur sont enregistrées ; sans fichier, elles se taisent", () => {
    for (const n of ['pluie', 'pluieVille', 'emeute']) {
      expect(NAPPES[n].enregistres, n).toBeTruthy();
      expect(sonDeNappe(n, NAPPES[n], new Set()), n).toBe(null);
    }
  });
});
