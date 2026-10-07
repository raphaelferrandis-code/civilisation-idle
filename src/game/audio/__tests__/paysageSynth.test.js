// LES SONS DU PAYSAGE (paysage/paysageSynth.js), joués par le code. On ne les entend pas
// ici — Raph les juge au banc d'écoute — : on les MESURE. Chacun sonne sans valeur
// fausse ni écrêtage ; les nappes bouclent sans couture audible ; la libellule
// bourdonne sans faire l'hélicoptère ; le ressac clapote sans faire la tempête ; le
// plouf frappe puis s'éteint ; tout est rendu à l'identique.
import { describe, it, expect } from 'vitest';
import { rendrePaysage, SONS_PAYSAGE, PAYSAGE_SR, LIBELLULE_HZ, LIBELLULE_NOTE } from '../paysage/paysageSynth.js';

const BOUCLES = ['souffle', 'feuillage', 'courant', 'ressac', 'lointain', 'libellule', 'grillons', 'stridulations', 'cigales', 'fontaine', 'drone', 'electrique'];
const NAPPES = ['souffle', 'feuillage', 'courant', 'ressac', 'lointain', 'grillons', 'stridulations', 'cigales'];
const rendus = new Map();
const son = (nom) => { if (!rendus.has(nom)) rendus.set(nom, rendrePaysage(nom)); return rendus.get(nom); };

function mesure(b, i0 = 0, i1 = b.length) {
  let crete = 0, e = 0, faux = 0;
  for (let i = i0; i < i1; i += 1) {
    if (!Number.isFinite(b[i])) faux += 1;
    crete = Math.max(crete, Math.abs(b[i]));
    e += b[i] * b[i];
  }
  return { crete, rms: Math.sqrt(e / Math.max(1, i1 - i0)), faux };
}
// Le saut entre deux échantillons voisins que le son ne dépasse qu'une fois sur mille.
function sautOrdinaire(b) {
  const d = new Float64Array(b.length - 1);
  for (let i = 1; i < b.length; i += 1) d[i - 1] = Math.abs(b[i] - b[i - 1]);
  d.sort();
  return d[Math.floor(d.length * 0.999)];
}

describe('les sons du paysage', () => {
  it('chacun se rend sans valeur fausse ni écrêtage, et sonne', () => {
    for (const nom of SONS_PAYSAGE) {
      const m = mesure(son(nom));
      expect(m.faux, nom).toBe(0);
      expect(m.crete, nom).toBeLessThanOrEqual(0.951);
      // Il sonne : des crêtes nettes, et de l'énergie (le clapotis, clairsemé exprès,
      // en a peu entre deux claques).
      expect(m.crete, `${nom} : muet`).toBeGreaterThan(0.25);
      expect(m.rms, `${nom} : muet`).toBeGreaterThan(0.01);
    }
  });

  it('les nappes et la libellule bouclent sans couture : la fin rejoint le début comme deux voisins', () => {
    for (const nom of BOUCLES) {
      const b = son(nom);
      expect(b.length / PAYSAGE_SR, nom).toBeGreaterThanOrEqual(3);
      const couture = Math.abs(b[0] - b[b.length - 1]);
      expect(couture, `${nom} : la couture saute`).toBeLessThanOrEqual(sautOrdinaire(b));
    }
  });

  it('deux nappes jouées ensemble ont des longueurs différentes (leur motif ne revient pas ensemble)', () => {
    const d = NAPPES.map((n) => Math.round(son(n).length / PAYSAGE_SR));
    expect(new Set(d).size).toBe(d.length);
  });

  // La part d'énergie d'un son entre `f0` et `f1` Hz (deux passe-bandes en cascade).
  function partBande(b, f0, f1) {
    const fc = Math.sqrt(f0 * f1), Q = fc / (f1 - f0);
    const w0 = (2 * Math.PI * fc) / PAYSAGE_SR, al = Math.sin(w0) / (2 * Q), a0 = 1 + al;
    const c = { b0: al / a0, b2: -al / a0, a1: (-2 * Math.cos(w0)) / a0, a2: (1 - al) / a0 };
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0, dans = 0, tot = 0;
    for (let i = 0; i < b.length; i += 1) {
      const y = c.b0 * b[i] + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
      x2 = x1; x1 = b[i]; y2 = y1; y1 = y;
      dans += y * y; tot += b[i] * b[i];
    }
    return dans / tot;
  }

  it('les grillons chantent autour de 4,4 kHz, les cigales et les sauterelles plus haut, pas dans le grave', () => {
    expect(partBande(son('grillons'), 3700, 5200)).toBeGreaterThan(0.6);
    expect(partBande(son('cigales'), 4000, 8000)).toBeGreaterThan(0.5);
    expect(partBande(son('stridulations'), 6000, 13000)).toBeGreaterThan(0.5);
    for (const n of ['grillons', 'cigales', 'stridulations']) expect(partBande(son(n), 40, 800), n).toBeLessThan(0.05);
  });

  it("le plip du gobage est une goutte : bref, et il s'éteint", () => {
    for (let v = 1; v <= 4; v += 1) {
      const b = son('plip' + v);
      expect(b.length / PAYSAGE_SR).toBeLessThanOrEqual(0.25);
      const debut = mesure(b, 0, Math.round(0.03 * PAYSAGE_SR)).rms;
      const fin = mesure(b, b.length - Math.round(0.1 * PAYSAGE_SR)).rms;
      expect(debut, `plip${v}`).toBeGreaterThan(fin * 8);
    }
  });

  // L'enveloppe d'un son : sa valeur absolue lissée par deux pôles à `fc` Hz.
  function enveloppe(b, fc) {
    const a = 1 - Math.exp((-2 * Math.PI * fc) / PAYSAGE_SR);
    const e = new Float64Array(b.length);
    let l1 = 0, l2 = 0;
    // Un tour à vide d'abord : une boucle n'a pas de début.
    for (let tour = 0; tour < 2; tour += 1) {
      for (let i = 0; i < b.length; i += 1) { l1 += a * (Math.abs(b[i]) - l1); l2 += a * (l1 - l2); e[i] = l2; }
    }
    return e;
  }
  const autocorr = (x, lag) => {
    let moy = 0;
    for (let i = 0; i < x.length; i += 1) moy += x[i];
    moy /= x.length;
    let num = 0, den = 0;
    for (let i = 0; i + lag < x.length; i += 1) { num += (x[i] - moy) * (x[i + lag] - moy); den += (x[i] - moy) ** 2; }
    return num / den;
  };

  it(`la libellule bourdonne : une note de ${LIBELLULE_NOTE} Hz, voilée par ${LIBELLULE_HZ} battements d'ailes par seconde`, () => {
    const b = son('libellule');
    // Une NOTE : le son revient sur lui-même à chaque période de 200 Hz.
    expect(autocorr(b, Math.round(PAYSAGE_SR / LIBELLULE_NOTE))).toBeGreaterThan(0.6);
    // Les battements : l'enveloppe revient à chaque battement, et pas entre deux.
    const e = enveloppe(b, 70);
    const periode = Math.round(PAYSAGE_SR / LIBELLULE_HZ);
    expect(autocorr(e, periode)).toBeGreaterThan(0.5);
    expect(autocorr(e, Math.round(periode / 2))).toBeLessThan(0);
  });

  it("la libellule ne fait pas l'hélicoptère : jamais de silence entre deux battements", () => {
    // La première version (« un hélicoptère », Raph, 2026-10-07) hachait un bruit grave en
    // coups séparés de silences : son enveloppe tombait presque à zéro à chaque battement.
    const e = enveloppe(son('libellule'), 70);
    let moy = 0, min = Infinity;
    for (let i = 0; i < e.length; i += 1) { moy += e[i]; min = Math.min(min, e[i]); }
    moy /= e.length;
    expect(min).toBeGreaterThan(0.6 * moy);
  });

  it("le ressac clapote sans faire la tempête : des clapotis espacés, de l'eau calme entre", () => {
    // La première version (« la tempête ») faisait monter et mourir une vague toutes les
    // deux à quatre secondes : son enveloppe restait haute la moitié du temps.
    const b = son('ressac');
    const e = enveloppe(b, 25);
    let max = 0;
    for (let i = 0; i < e.length; i += 1) max = Math.max(max, e[i]);
    let fort = 0, clapotis = 0, dernier = -Infinity;
    for (let i = 0; i < e.length; i += 1) {
      if (e[i] > 0.3 * max) {
        fort += 1;
        if (i - dernier > PAYSAGE_SR) clapotis += 1;     // un nouveau clapotis : plus d'une seconde après le dernier
        dernier = i;
      }
    }
    expect(fort / e.length).toBeLessThan(0.12);
    const parMinute = (clapotis / (b.length / PAYSAGE_SR)) * 60;
    expect(parMinute).toBeGreaterThan(6);
    expect(parMinute).toBeLessThan(26);
  });

  it("le plouf frappe puis s'éteint, sans clic de fin", () => {
    for (let v = 1; v <= 6; v += 1) {
      const b = son('plouf' + v);
      const debut = mesure(b, 0, Math.round(0.1 * PAYSAGE_SR)).rms;
      const fin = mesure(b, b.length - Math.round(0.3 * PAYSAGE_SR)).rms;
      expect(debut, `plouf${v}`).toBeGreaterThan(fin * 5);
      expect(Math.abs(b[b.length - 1]), `plouf${v} : clic de fin`).toBeLessThan(0.01);
      expect(b.length / PAYSAGE_SR).toBeLessThan(1);
    }
  });

  it('les sons sont rendus à l’identique (aléa à graine), et chaque plouf est différent', () => {
    for (const nom of ['courant', 'plouf3', 'libellule']) {
      const a = rendrePaysage(nom), b = son(nom);
      for (let i = 0; i < a.length; i += 997) expect(a[i]).toBe(b[i]);
    }
    expect(son('plouf1')[200]).not.toBe(son('plouf2')[200]);
  });

  it('un nom inconnu est refusé', () => {
    expect(() => rendrePaysage('tonnerre')).toThrow();
  });
});
