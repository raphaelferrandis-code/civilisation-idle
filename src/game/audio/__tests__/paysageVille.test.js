// LA VILLE DU PAYSAGE SONORE (lot 3) : les pigeons et la fontaine (paysageSynth.js), les
// voix enregistrées (src/assets/sons/, rendues sans langue par scripts/importSons.mjs), et
// ce qui les dose (milieux.js, paysage.js). On ne les entend pas ici — Raph les juge au
// banc d'écoute — : on les MESURE. Une rue vide se tait ; l'enfant qu'on voit crie, le
// pigeon qu'on voit roucoule ; une nappe sans fichier se tait.
import { describe, it, expect } from 'vitest';
import { CM } from '../../map/layout.js';
import { figuresBeginFrame, noteFig, FIG } from '../../map/figures.js';
import { rendrePaysage, PAYSAGE_SR } from '../paysage/paysageSynth.js';
import { mesurerFoule, nouvelleMesure } from '../paysage/milieux.js';
import { ciblesNappes, voixDeFoule, tauxSeme, presenceSeme, sonDeNappe, NAPPES, EMETTEURS, SEMES } from '../paysage/paysage.js';

const SR = PAYSAGE_SR;
const rendus = new Map();
const son = (nom) => { if (!rendus.has(nom)) rendus.set(nom, rendrePaysage(nom)); return rendus.get(nom); };

// L'énergie d'un son entre f0 et f1 Hz (passe-bande d'un octave environ), divisée par
// l'énergie totale.
function partBande(b, f0, f1) {
  const fc = Math.sqrt(f0 * f1), Q = fc / (f1 - f0);
  const w0 = (2 * Math.PI * fc) / SR, al = Math.sin(w0) / (2 * Q), a0 = 1 + al;
  const c = { b0: al / a0, b2: -al / a0, a1: (-2 * Math.cos(w0)) / a0, a2: (1 - al) / a0 };
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0, dans = 0, tot = 0;
  for (let i = 0; i < b.length; i += 1) {
    const y = c.b0 * b[i] + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
    x2 = x1; x1 = b[i]; y2 = y1; y1 = y;
    dans += y * y; tot += b[i] * b[i];
  }
  return dans / tot;
}
// L'enveloppe (valeur absolue lissée à 30 Hz), échantillonnée à 1 kHz.
function enveloppe(b) {
  const a = 1 - Math.exp((-2 * Math.PI * 30) / SR), pas = SR / 1000;
  const e = new Float64Array(Math.floor(b.length / pas));
  let l = 0;
  for (let i = 0; i < b.length; i += 1) { l += a * (Math.abs(b[i]) - l); if (i % pas === 0 && i / pas < e.length) e[i / pas] = l; }
  return e;
}
// L'amplitude de la modulation de l'enveloppe sur une bande de f0 à f1 Hz (par quarts de
// hertz), rapportée à sa moyenne.
function modBande(e, f0, f1) {
  let moy = 0;
  for (const v of e) moy += v;
  moy /= e.length;
  let s = 0;
  for (let f = f0; f <= f1 + 1e-9; f += 0.25) {
    let re = 0, im = 0;
    for (let i = 0; i < e.length; i += 1) {
      const v = e[i] - moy, ph = (2 * Math.PI * f * i) / 1000;
      re += v * Math.cos(ph); im += v * Math.sin(ph);
    }
    s += (Math.hypot(re, im) / e.length / moy) ** 2;
  }
  return Math.sqrt(s);
}

describe('les pigeons et la fontaine', () => {
  it('le roucoulement est grave et doux : presque tout sous 1,2 kHz', () => {
    for (let v = 1; v <= 6; v += 1) {
      const b = son('roucoul' + v);
      expect(partBande(b, 220, 1200), `roucoul${v}`).toBeGreaterThan(0.7);
      expect(b.length / SR).toBeLessThan(2);
    }
  });

  it("l'envol bat des ailes : des coups séparés, 8 à 11 par seconde, qui s'éloignent", () => {
    const e = enveloppe(son('envol1'));
    expect(modBande(e, 7, 12)).toBeGreaterThan(modBande(e, 2, 5) * 3);
    // La fin (l'oiseau parti) est plus faible que le début.
    const debut = e.slice(0, 400).reduce((s, v) => s + v, 0), fin = e.slice(1200, 1600).reduce((s, v) => s + v, 0);
    expect(fin).toBeLessThan(debut / 3);
  });

  it("la fontaine est de l'eau qui retombe : de l'aigu, pas une note", () => {
    const b = son('fontaine');
    expect(partBande(b, 1000, 6000)).toBeGreaterThan(0.4);
    expect(b.length / SR).toBeCloseTo(9, 1);
  });
});

describe('ce qui dose la ville', () => {
  const P = { foret: 0, prairie: 0, champ: 0, eau: 0, rive: 0, ville: 1, place: 0 };

  it('une rue vide se tait ; une avenue pleine ne crie pas cent fois plus fort qu’un passant', () => {
    const vide = ciblesNappes(P, { rue: 0, place: 0 });
    expect(vide.brouhaha).toBe(0);
    expect(vide.causerie).toBe(0);
    expect(vide.jeux).toBe(0);
    // Un passant sous l'oreille (une énergie de ¼) ne fait pas une foule ; cent, presque.
    expect(voixDeFoule(0.25, 1.2)).toBeLessThan(0.15);
    expect(voixDeFoule(25, 1.2)).toBeGreaterThan(0.9);
    expect(voixDeFoule(25, 1.2)).toBeLessThan(1);
    // La causerie suit les places, le brouhaha la rue (et un peu les places).
    const place = ciblesNappes(P, { rue: 0, place: 2 });
    expect(place.causerie).toBeGreaterThan(place.brouhaha);
    const rue = ciblesNappes(P, { rue: 2, place: 0 });
    expect(rue.causerie).toBe(0);
    expect(rue.brouhaha).toBeGreaterThan(0.4);
    // Dézoomé, les voix s'effacent.
    expect(ciblesNappes(P, { rue: 2, proche: 0 }).brouhaha).toBe(0);
  });

  it("les enfants jouent près des places, de jour ; la nuit et sous l'averse, ils rentrent", () => {
    expect(ciblesNappes(P, { place: 2, nuit: 0 }).jeux).toBeGreaterThan(0.4);
    expect(ciblesNappes(P, { place: 2, nuit: 1 }).jeux).toBe(0);
    expect(ciblesNappes(P, { place: 2, pluie: 1 }).jeux).toBe(0);
    expect(ciblesNappes(P, { rue: 3, place: 0 }).jeux).toBe(0);
  });

  it("les voix proches : un passant sous l'oreille compte, un passant loin presque pas, les champs pas du tout", () => {
    CM.cw = 1000; CM.ch = 600; CM.cam.x = 3200; CM.cam.y = 3200; CM.cam.zoom = 1.5;
    const T = CM.TILE, oreille = { x: 3200, y: 3200, h: 2.9 };
    const mesure = (poser) => { figuresBeginFrame(); poser(); figuresBeginFrame(); return mesurerFoule(nouvelleMesure(), oreille); };
    const pres = mesure(() => noteFig(3200, 3200, FIG.STREET | FIG.MOVING));
    const loin = mesure(() => noteFig(3200 + 10 * T, 3200, FIG.STREET | FIG.MOVING));
    expect(pres.voixRue).toBeGreaterThan(0.2);
    expect(loin.voixRue).toBeLessThan(pres.voixRue / 8);
    const champ = mesure(() => noteFig(3200, 3200, FIG.SCENE | FIG.MOVING));
    expect(champ.voixRue + champ.voixPlace).toBe(0);
    const place = mesure(() => noteFig(3200, 3200, FIG.PLAZA));
    expect(place.voixPlace).toBeCloseTo(pres.voixRue, 6);
    expect(place.voixRue).toBe(0);
    // À droite de l'écran, on l'entend à droite.
    const droite = mesure(() => noteFig(3200 + 4 * T, 3200, FIG.STREET));
    expect(droite.panRue).toBeGreaterThan(0.2);
  });

  it("l'enfant qu'on voit crie, le pigeon qu'on voit roucoule ; sans eux, rien ; la nuit, rien", () => {
    const cond = { nuit: 0, saison: 1, sec: 1, vivant: 1 };
    expect(presenceSeme(SEMES.enfant, {}, 0)).toBe(0);
    expect(presenceSeme(SEMES.enfant, {}, 1.5)).toBeCloseTo(0.5, 6);
    expect(presenceSeme(SEMES.enfant, {}, 9)).toBe(1);
    expect(tauxSeme(SEMES.enfant, {}, cond, 1, 1, 8, 0)).toBe(0);
    expect(tauxSeme(SEMES.enfant, {}, cond, 1, 1, 8, 3)).toBeGreaterThan(0);
    expect(tauxSeme(SEMES.enfant, {}, { ...cond, nuit: 1 }, 1, 1, 8, 3)).toBe(0);
    expect(tauxSeme(SEMES.pigeon, {}, cond, 1, 1, 6, 4)).toBeGreaterThan(0);
    expect(tauxSeme(SEMES.pigeon, {}, { ...cond, nuit: 1 }, 1, 1, 6, 4)).toBe(0);
    // Les enfants n'ont pas de voix synthétisée (refusée à l'écoute) ; le pigeon, si.
    expect(SEMES.enfant.synth).toBeUndefined();
    for (const n of SEMES.pigeon.synth) expect(son(n).length, n).toBeGreaterThan(0);
  });

  it("la rue selon l'âge : des pas jusqu'au Néon, la circulation au Néon seulement", () => {
    const pas = (bande) => ciblesNappes(P, { marche: 3, bande }).pas;
    expect(pas(0)).toBeGreaterThan(0.5);
    expect(pas(3)).toBeCloseTo(pas(0), 9);
    expect(pas(6)).toBeLessThan(pas(3));
    expect(pas(6)).toBeGreaterThan(0);
    expect(pas(8)).toBe(0);
    expect(ciblesNappes(P, { marche: 0, bande: 2 }).pas).toBe(0);
    const circ = (bande, moteurs = 3) => ciblesNappes(P, { moteurs, bande }).circulation;
    expect(circ(6)).toBeGreaterThan(0.5);
    expect(circ(6, 0)).toBe(0);
    expect(circ(5)).toBe(0);
    expect(circ(7)).toBe(0);
  });

  it("au loin, la ville a la rumeur de son âge : une foule de cité, puis la circulation, puis le bourdon", () => {
    const loin = (bande) => ciblesNappes(P, { loin: 1, proche: 0, taille: 1, bande });
    expect(loin(0).lointainFoule + loin(0).lointainTrafic + loin(0).lointainCosmique).toBe(0);
    expect(loin(3).lointainFoule).toBe(1);
    expect(loin(3).lointainTrafic).toBe(0);
    expect(loin(5).lointainTrafic).toBeGreaterThan(0);
    expect(loin(5).lointainTrafic).toBeLessThan(loin(6).lointainTrafic);
    expect(loin(6).lointainTrafic).toBe(1);
    expect(loin(8).lointainCosmique).toBe(1);
    expect(loin(8).lointainFoule).toBe(0);
    // Zoomé, plus rien du lointain ; une petite ville, moins.
    expect(ciblesNappes(P, { loin: 0, proche: 1, taille: 1, bande: 3 }).lointainFoule).toBe(0);
    expect(ciblesNappes(P, { loin: 1, proche: 0, taille: 0.3, bande: 3 }).lointainFoule).toBeCloseTo(0.3, 9);
  });

  it('la roue grince sur un attelage qu’on voit ; sans attelage, rien', () => {
    const cond = { nuit: 0, saison: 1, sec: 1, vivant: 1 };
    expect(tauxSeme(SEMES.roue, {}, cond, 1, 1, 4, 0)).toBe(0);
    expect(tauxSeme(SEMES.roue, {}, cond, 1, 1, 4, 2)).toBeGreaterThan(0);
  });

  it('une nappe de voix joue le premier de ses fichiers qui existe ; sans fichier, elle se tait', () => {
    const def = NAPPES.causerie;
    expect(sonDeNappe('causerie', def, new Set())).toBe(null);
    expect(sonDeNappe('causerie', def, new Set(['causerie-groupe-1']))).toBe('causerie-groupe-1');
    expect(sonDeNappe('causerie', def, new Set(['causerie-groupe-1', 'causerie-place-1']))).toBe('causerie-place-1');
    // Une nappe synthétisée joue son propre son.
    expect(sonDeNappe('souffle', NAPPES.souffle, new Set())).toBe('souffle');
    expect(sonDeNappe('altitude', NAPPES.altitude, new Set())).toBe('souffle');
    // Les voix sont toutes enregistrées.
    for (const n of ['brouhaha', 'causerie', 'jeux', 'pas', 'circulation']) expect(NAPPES[n].enregistres, n).toBeTruthy();
    // Les émetteurs aussi : l'attelage est enregistré, le drone synthétisé.
    expect(sonDeNappe('attelage', EMETTEURS.attelage, new Set())).toBe(null);
    expect(sonDeNappe('drone', EMETTEURS.drone, new Set())).toBe('drone');
  });
});
