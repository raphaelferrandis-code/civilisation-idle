// LE SON DES SIGNES (docs/PLAN-ECOUTER-PARLER.md, lot 8) : le vent, la lumière, le feu et la
// bête s'entendent. On ne les entend pas ici (Raph les juge au banc d'écoute, section « Les
// signes ») : on vérifie qu'à chaque âge chaque signe a son son, qui s'y charge, et on
// MESURE les sons synthétisés : la rafale arrive sur lui puis s'en va, le chœur chante son
// accord sur la voyelle a, le feu monte d'un coup.
import { describe, it, expect } from 'vitest';
import { PONCTUELS_SIGNES, sonDuSigne } from '../paysage/sonsSignes.js';
import { rendreSigne, SONS_SIGNES, MONDES_VENT, MONDES_FEU } from '../paysage/paysageSynthSignes.js';
import { PONCTUELS, joueA, sonsUtiles } from '../paysage/paysage.js';
import { SONS_PAYSAGE, PAYSAGE_SR } from '../paysage/paysageSynth.js';
import { ENREGISTRES } from '../paysage/enregistrements.js';
import { SIGN_KINDS } from '../../core/parolesState.js';

const SR = PAYSAGE_SR;
const BETES = ['dog', 'cat', 'goat', 'sheep', 'cow'];
const SANS = { pluie: false, emeute: false };
// Un passant désigné : on peut lui faire un signe, ses sons se chargent.
const DESIGNE = { ...SANS, signe: true };
const rendus = new Map();
const son = (nom) => { if (!rendus.has(nom)) rendus.set(nom, rendreSigne(nom, SR)); return rendus.get(nom); };

// L'énergie moyenne (carré moyen) entre t0 et t1 s.
function energie(b, t0, t1) {
  const i0 = Math.round(t0 * SR), i1 = Math.min(b.length, Math.round(t1 * SR));
  let e = 0;
  for (let i = i0; i < i1; i += 1) e += b[i] * b[i];
  return e / Math.max(1, i1 - i0);
}
// Le spectre de puissance de `n` échantillons pris à t0 s (fenêtre de Hann), par FFT.
function spectre(b, t0, n = 16384) {
  const re = new Float64Array(n), im = new Float64Array(n), s0 = Math.round(t0 * SR);
  for (let i = 0; i < n; i += 1) re[i] = (b[s0 + i] || 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)));
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = (-2 * Math.PI) / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let j = 0; j < len / 2; j += 1) {
        const k = i + j + len / 2;
        const vr = re[k] * cr - im[k] * ci, vi = re[k] * ci + im[k] * cr;
        re[k] = re[i + j] - vr; im[k] = im[i + j] - vi;
        re[i + j] += vr; im[i + j] += vi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
  const p = new Float64Array(n / 2);
  for (let k = 0; k < n / 2; k += 1) p[k] = re[k] * re[k] + im[k] * im[k];
  return p;
}
// Le spectre moyen sur la tenue d'un son (plusieurs fenêtres, de t0 à t1 s) : des voix un
// peu désaccordées battent entre elles, une seule fenêtre tomberait sur un creux.
function spectreMoyen(b, t0, t1, n = 16384) {
  const p = new Float64Array(n / 2);
  for (let t = t0; t + n / SR <= t1 + 1e-9; t += 0.15) {
    const q = spectre(b, t, n);
    for (let k = 0; k < p.length; k += 1) p[k] += q[k];
  }
  return p;
}
// La part de la puissance entre f0 et f1 Hz.
function part(p, f0, f1, n = 16384) {
  let dans = 0, tot = 0;
  for (let k = 1; k < p.length; k += 1) {
    const f = (k * SR) / n;
    tot += p[k];
    if (f >= f0 && f < f1) dans += p[k];
  }
  return dans / tot;
}

describe('quel son pour quel signe', () => {
  it("à chaque âge, chaque signe qu'on peut y faire a son son, qui joue à cet âge ; aux âges 7 à 9, ni feu ni bête", () => {
    for (let b = 0; b <= 9; b += 1) {
      for (const kind of SIGN_KINDS) {
        for (const bete of kind === 'beast' ? BETES : [null]) {
          const nom = sonDuSigne(kind, b, bete);
          if (b >= 7 && (kind === 'fire' || kind === 'beast')) { expect(nom).toBe(null); continue; }
          expect(PONCTUELS[nom], `${kind} ${bete || ''} à la bande ${b}`).toBeTruthy();
          expect(joueA(PONCTUELS[nom], b), `${nom} à la bande ${b}`).toBe(true);
        }
      }
    }
  });

  it('le vent et le feu sont ceux du monde ; la lumière, la même partout ; la parole, aucun son', () => {
    expect([0, 1, 2, 4, 5, 6, 7, 9].map((b) => sonDuSigne('wind', b))).toEqual([
      'signeVentCamp', 'signeVentCamp', 'signeVentVille', 'signeVentVille', 'signeVentFonte', 'signeVentFonte', 'signeVentCosmos', 'signeVentCosmos',
    ]);
    expect([0, 1, 2, 4, 5, 6].map((b) => sonDuSigne('fire', b))).toEqual([
      'signeFeuBois', 'signeFeuBois', 'signeFeuBrasero', 'signeFeuBrasero', 'signeFeuFourneau', 'signeFeuFourneau',
    ]);
    expect(sonDuSigne('light', 0)).toBe('signeLumiere');
    expect(sonDuSigne('light', 9)).toBe('signeLumiere');
    expect(BETES.map((b) => sonDuSigne('beast', 3, b))).toEqual(['signeChien', 'signeChat', 'signeChevre', 'signeMouton', 'signeVache']);
    expect(sonDuSigne('beast', 3, 'duck')).toBe(null);
    expect(sonDuSigne('voice', 3)).toBe(null);
  });

  it('ce sont des ponctuels du paysage, rangés à part au banc ; leurs sons existent', () => {
    const ids = new Set(ENREGISTRES.map((e) => e.id));
    for (const [nom, def] of Object.entries(PONCTUELS_SIGNES)) {
      expect(PONCTUELS[nom]).toBe(def);
      expect(def.signe, nom).toBe(true);
      expect(!!def.sons !== !!def.enregistres, `${nom} : synthétisé OU enregistré`).toBe(true);
      for (const s of def.sons || []) expect(SONS_PAYSAGE, nom).toContain(s);
      for (const s of def.enregistres || []) expect(ids.has(s), `${nom} : ${s}`).toBe(true);
    }
    for (const nom of SONS_SIGNES) expect(Object.values(PONCTUELS_SIGNES).some((d) => (d.sons || []).includes(nom)), nom).toBe(true);
  });

  it("un passant désigné, l'âge charge les sons de ses signes, pas ceux des autres mondes ; sans passant désigné, aucun", () => {
    const ville = sonsUtiles(3, undefined, undefined, DESIGNE), cosmos = sonsUtiles(8, undefined, undefined, DESIGNE);
    expect(ville.synth.has('signe-vent-ville-1')).toBe(true);
    expect(ville.synth.has('signe-vent-camp-1')).toBe(false);
    expect(ville.synth.has('signe-feu-brasero-2')).toBe(true);
    expect(ville.synth.has('signe-lumiere-1')).toBe(true);
    expect(ville.enr.has('chienpres-jappe-1')).toBe(true);
    expect(ville.enr.has('chat-miaule-2')).toBe(true);
    expect(cosmos.synth.has('signe-vent-cosmos-2')).toBe(true);
    expect(cosmos.synth.has('signe-lumiere-2')).toBe(true);
    expect([...cosmos.synth].some((s) => s.startsWith('signe-feu'))).toBe(false);
    expect([...cosmos.enr].some((s) => s.startsWith('chienpres') || s.startsWith('chat-'))).toBe(false);
    // Personne à qui faire un signe : rien en mémoire (le budget de chaque âge, § 3.9).
    const libre = sonsUtiles(3, undefined, undefined, SANS);
    expect([...libre.synth].some((s) => s.startsWith('signe-'))).toBe(false);
    expect(libre.enr.has('chienpres-jappe-1')).toBe(false);
    for (const def of Object.values(PONCTUELS_SIGNES)) expect(def.charge).toBe('signe');
  });
});

describe('les sons des signes, mesurés', () => {
  it("chacun se rend sans valeur fausse ni écrêtage, et finit dans le silence ; à l'identique d'un rendu à l'autre", () => {
    // À l'identique (graine fixe) : un son de chaque famille, rendu deux fois.
    for (const nom of ['signe-vent-ville-1', 'signe-lumiere-2', 'signe-feu-bois-1']) {
      const a = rendreSigne(nom, SR), b = son(nom);
      let ecarts = a.length === b.length ? 0 : 1;
      for (let i = 0; i < a.length && !ecarts; i += 1) if (a[i] !== b[i]) ecarts += 1;
      expect(ecarts, nom).toBe(0);
    }
    for (const nom of SONS_SIGNES) {
      const b = son(nom);
      let crete = 0, faux = 0;
      for (const v of b) { if (!Number.isFinite(v)) faux += 1; crete = Math.max(crete, Math.abs(v)); }
      expect(faux, nom).toBe(0);
      expect(crete, nom).toBeLessThanOrEqual(0.801);
      expect(Math.sqrt(energie(b, b.length / SR - 0.02, b.length / SR)), `${nom} : la fin claque`).toBeLessThan(0.01);
    }
    expect(rendreSigne('signe-pluie-1', SR)).toBe(null);
  });

  it("la rafale arrive sur lui vers la première seconde, puis s'en va : passée à 2,6 s", () => {
    for (const m of MONDES_VENT) {
      for (const v of [1, 2]) {
        const b = son(`signe-vent-${m}-${v}`);
        const pic = energie(b, 0.7, 1.3);
        expect(pic, `${m} ${v} : elle arrive`).toBeGreaterThan(4 * energie(b, 0, 0.25));
        expect(pic, `${m} ${v} : elle s'en va`).toBeGreaterThan(8 * energie(b, 2.6, 2.8));
      }
    }
  });

  it('le vent de chaque monde a sa couleur : les feuilles craquent dans l’aigu, les câbles sifflent, le souffle cosmique est sourd', () => {
    const p = (m) => spectre(son(`signe-vent-${m}-1`), 0.6, 16384);
    expect(part(p('camp'), 3000, 8000)).toBeGreaterThan(part(p('fonte'), 3000, 8000) * 3);
    expect(part(p('fonte'), 500, 1000)).toBeGreaterThan(part(p('ville'), 500, 1000));
    expect(part(p('cosmos'), 0, 600)).toBeGreaterThan(0.8);
    expect(part(p('cosmos'), 2000, 16000)).toBeLessThan(0.01);
  });

  it("le chœur chante son accord sur la voyelle a, et se tait avant la fin du rayon (2,6 s), sa salle à peine après", () => {
    const ACCORDS = [[329.63, 440, 554.37, 659.26], [369.99, 440, 587.33, 739.99]];
    for (const v of [1, 2]) {
      const b = son(`signe-lumiere-${v}`);
      const p = spectreMoyen(b, 0.6, 1.8);
      // Ses quatre notes (à 2 % près : le vibrato, les chanteurs un peu à côté), chacune
      // bien au-dessus d'un trou de l'accord.
      const trou = part(p, 395, 405) / 10;
      for (const f of ACCORDS[v - 1]) expect(part(p, f * 0.98, f * 1.02) / (f * 0.04), `${v} : ${f} Hz`).toBeGreaterThan(20 * trou);
      // La voyelle a : l'énergie entre 250 et 1 300 Hz (les notes, les deux premiers
      // formants), plus forte vers 700-1 300 Hz qu'au-dessus ; un peu d'éclat au-dessus de
      // 2 kHz, rien dans le grave.
      expect(part(p, 250, 1300), `${v} : la voyelle`).toBeGreaterThan(0.85);
      expect(part(p, 700, 1300), `${v} : les formants`).toBeGreaterThan(2 * part(p, 1300, 2600));
      expect(part(p, 2000, 5000), `${v} : l'éclat`).toBeGreaterThan(0.0003);
      expect(part(p, 0, 250), `${v} : le grave`).toBeLessThan(0.01);
      // Il enfle avec le rayon (monté en 0,3 s), et ne traîne pas.
      expect(energie(b, 0.5, 1.5)).toBeGreaterThan(30 * energie(b, 0, 0.05));
      expect(energie(b, 0.5, 1.5)).toBeGreaterThan(100 * energie(b, 3.6, 4.0));
    }
  });

  it("le feu monte d'un coup : fort dès le premier dixième de seconde, retombé à 3,3 s ; le fourneau gronde plus grave que le bois", () => {
    for (const m of MONDES_FEU) {
      for (const v of [1, 2]) {
        const b = son(`signe-feu-${m}-${v}`);
        expect(energie(b, 0.03, 0.15), `${m} ${v}`).toBeGreaterThan(0.5 * energie(b, 0.5, 2));
        expect(energie(b, 0.5, 2), `${m} ${v}`).toBeGreaterThan(30 * energie(b, 3.25, 3.4));
      }
    }
    const grave = (m) => part(spectre(son(`signe-feu-${m}-1`), 0.5, 16384), 0, 300);
    expect(grave('fourneau')).toBeGreaterThan(grave('bois'));
  });
});
