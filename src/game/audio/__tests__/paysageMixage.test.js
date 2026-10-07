// LE MIXAGE FINAL DU PAYSAGE SONORE (lot 6) : ce qui se charge, et combien ça pèse. Chaque
// son synthétisé est joué par au moins une définition, chaque fichier attendu existe ; à
// chaque âge, la mémoire des sons décodés tient dans le budget (plan, § 3.9) — un son de
// trop qui ferait déborder un âge se voit ici, pas sur la machine d'un joueur.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { sonsUtiles, joueA, NAPPES, EMETTEURS, SEMES } from '../paysage/paysage.js';
import { rendrePaysage, SONS_PAYSAGE, PAYSAGE_SR } from '../paysage/paysageSynth.js';
import { ENREGISTRES } from '../paysage/enregistrements.js';

const ROOT = path.resolve(__dirname, '../../../..');
const CATALOGUE = JSON.parse(readFileSync(path.join(ROOT, 'scripts/sons/catalogue.json'), 'utf8'));
const OCTETS = 4 * PAYSAGE_SR;          // un tampon mono décodé à 32 kHz : 128 ko par seconde
// La durée d'un son importé, d'après son entrée du catalogue.
const dureeDe = (e) => (e.brouiller ? e.brouiller.duree : e.boucler ? e.fin - e.debut - e.boucler.fondu : e.fin - e.debut);
const DUREES = new Map(CATALOGUE.sons.map((e) => [e.id, dureeDe(e)]));
let _synth = null;
const synthMo = () => {
  if (!_synth) _synth = new Map(SONS_PAYSAGE.map((n) => [n, (rendrePaysage(n).length * 4) / 1e6]));
  return _synth;
};
function memoire(u) {
  let mo = 0;
  for (const n of u.synth) mo += synthMo().get(n) || 0;
  for (const id of u.enr) mo += ((DUREES.get(id) || 0) * OCTETS) / 1e6;
  return mo;
}
const SANS = { pluie: false, emeute: false }, AVEC = { pluie: true, emeute: true };

describe('ce qui se charge', () => {
  it('chaque son synthétisé est joué par une définition, chaque définition renvoie à un son qui existe', () => {
    const tous = sonsUtiles(null);
    expect(SONS_PAYSAGE.filter((n) => !tous.synth.has(n))).toEqual([]);
    for (const n of tous.synth) expect(SONS_PAYSAGE, n).toContain(n);
    const ids = new Set(ENREGISTRES.map((e) => e.id));
    for (const id of tous.enr) expect(ids.has(id), id).toBe(true);
  });

  it("un âge ne charge que ses sons : pas de circulation au Moyen Âge, pas d'oiseaux aux âges cosmiques", () => {
    const couronne = sonsUtiles(3, undefined, undefined, SANS), cosmique = sonsUtiles(8, undefined, undefined, SANS);
    expect(couronne.enr.has('circulation-carrefour-1')).toBe(false);
    expect(couronne.enr.has('sabots-rue-1')).toBe(true);
    expect([...cosmique.enr].some((id) => id.startsWith('oiseau-'))).toBe(false);
    expect(cosmique.synth.has('carillon1')).toBe(true);
    expect(couronne.synth.has('carillon1')).toBe(false);
    expect(joueA(EMETTEURS.vapeur, 5)).toBe(true);
    expect(joueA(EMETTEURS.vapeur, 4)).toBe(false);
    expect(joueA(NAPPES.souffle, 9)).toBe(true);       // sans `ages`, tous les âges
  });

  it("la pluie ne se charge que quand il pleut, la clameur quand une émeute gronde", () => {
    const sec = sonsUtiles(3, undefined, undefined, SANS), averse = sonsUtiles(3, undefined, undefined, { pluie: true, emeute: false });
    expect(sec.enr.has('pluie-flaques-1')).toBe(false);
    expect(averse.enr.has('pluie-flaques-1')).toBe(true);
    expect(averse.enr.has('emeute-clameur-1')).toBe(false);
    expect(SEMES.chien.charge).toBeUndefined();          // un chien pèse trop peu pour qu'on attende
  });
});

describe('le budget de mémoire (plan, § 3.9)', () => {
  it("à chaque âge, les sons décodés tiennent sous 70 Mo, et sous 76 Mo sous l'averse d'une émeute", () => {
    for (let b = 0; b <= 9; b += 1) {
      expect(memoire(sonsUtiles(b, undefined, undefined, SANS)), `bande ${b}`).toBeLessThan(70);
      expect(memoire(sonsUtiles(b, undefined, undefined, AVEC)), `bande ${b}, averse et émeute`).toBeLessThan(76);
    }
    // Tout charger d'un coup, comme avant le lot 6, débordait.
    expect(memoire(sonsUtiles(null))).toBeGreaterThan(80);
  });
});
