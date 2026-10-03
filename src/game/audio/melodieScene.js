// LA PETITE MÉLODIE DE LA SCÈNE (demande de Raph du 2026-10-03 : « il faudrait
// ajouter une petite mélodie quand on clique sur la scène »).
//
// Le jeu n'a pas de banque de sons : la mélodie est JOUÉE PAR LE CODE, échantillon
// par échantillon, comme la coupe est peinte pixel par pixel. Un seul air pour toute
// la Maison — l'air de la troupe, quatre mesures en la mineur pentatonique —, joué
// par l'instrument de l'âge, comme la même salle se meuble autrement d'âge en âge :
//   0 feu        flûte d'os et tambour sur cadre, au fond d'une grotte ;
//   1 bois       lyre et tambour, salle de bois ;
//   2 pierre     lyre plus claire, salle de pierre (plus d'écho) ;
//   3 couronne   luth, bourdon et tambourin ;
//   4 marbre     harpe et arpège final ;
//   5 fonte      piano de bastringue (deux cordes désaccordées), pompe à la main gauche ;
//   6 néon       vibraphone en swing, contrebasse et balais ;
//   7-9 cosmique cloches (jade, astres, cristal) sur une nappe.
// Les fichiers déposés dans `src/assets/musiques/scene/` passent AVANT (musiques.js).
//
// `renderMelodie(band)` est PUR (aucune API du navigateur, aléa à graine) : le test
// vérifie chaque âge, la lecture vit dans `jouerMelodieScene`.
import { MELODIES_SCENE } from './musiques.js';
import { getMusicEnabled, getMusicVolume, duckMusic } from '../core/main.js';

export const MELODIE_SR = 32000;

const NOTES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export function hz(nom, oct = 0) {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(nom);
  const midi = 12 * (Number(m[3]) + 1 + oct) + NOTES[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  return 440 * 2 ** ((midi - 69) / 12);
}

// L'AIR (temps, note, durée en temps) : l'accord de la monte, la retombée, le
// tournant, la résolution.
const AIR = [
  [0, 'E4', 0.5], [0.5, 'A4', 0.5], [1, 'C5', 0.5], [1.5, 'E5', 0.5],
  [2, 'D5', 0.75], [2.75, 'C5', 0.25], [3, 'A4', 1],
  [4, 'G4', 0.5], [4.5, 'E4', 0.5], [5, 'D4', 0.5], [5.5, 'E4', 0.5],
  [6, 'A4', 2]
];
const BASSE = [[0, 'A2', 2], [2, 'D3', 2], [4, 'G2', 1], [5, 'E2', 1], [6, 'A2', 2]];
// Accords sans la sensible (B) pour les âges anciens, avec elle à partir de la fonte.
const ACCORDS_PENTA = [[0, ['A3', 'C4', 'E4']], [2, ['D3', 'A3', 'C4']], [4, ['G3', 'D4']], [5, ['E3', 'G3']], [6, ['A3', 'C4', 'E4']]];
const ACCORDS = [[0, ['A3', 'C4', 'E4']], [2, ['D3', 'F3', 'A3', 'C4']], [4, ['G3', 'B3', 'D4']], [5, ['E3', 'G3', 'B3']], [6, ['A3', 'C4', 'E4']]];
const TEMPS_AIR = 8;

function graine(n) {
  let a = n >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Les instruments : chacun AJOUTE sa note dans `out` (Float32Array), à `t` secondes.

// Corde pincée (Karplus-Strong) : un bruit qui tourne dans une boucle de la longueur
// d'une période et s'adoucit à chaque tour. `clair` : brillance de l'attaque,
// `tenue` : perte par tour (plus près de 1, plus la corde sonne longtemps).
function corde(out, sr, t, f, dur, g, rnd, { clair = 0.5, tenue = 0.996, queue = 0.6 } = {}) {
  const s0 = Math.round(t * sr);
  const n = Math.min(out.length - s0, Math.round((dur + queue) * sr));
  if (n <= 0) return;
  // ⚠ L'ACCORD. La boucle sonne à sr / (N − ½) — on réécrit la moyenne d'un
  // échantillon et du SUIVANT —, et N est entier : jusqu'à un sixième de demi-ton
  // faux dans l'aigu. Un passe-tout ajoute la fraction qui manque (mesuré : la, do,
  // mi justes au dixième de hertz).
  const P = sr / f;
  const N = Math.max(2, Math.floor(P + 0.4));
  const frac = P + 0.5 - N;
  const C = (1 - frac) / (1 + frac);
  let apx = 0, apy = 0;
  const buf = new Float32Array(N);
  let p = 0, moy = 0;
  for (let k = 0; k < N; k++) { p += clair * ((rnd() * 2 - 1) - p); buf[k] = p; moy += p; }
  moy /= N;
  let crete = 1e-6;
  for (let k = 0; k < N; k++) { buf[k] -= moy; crete = Math.max(crete, Math.abs(buf[k])); }
  for (let k = 0; k < N; k++) buf[k] /= crete;
  const finNote = Math.round(dur * sr), fondu = Math.round(0.04 * sr);
  let i0 = 0;
  for (let i = 0; i < n; i++) {
    const i1 = i0 + 1 === N ? 0 : i0 + 1;
    const y = buf[i0];
    // Note relâchée : la corde est étouffée (on la laisse vibrer un peu, pas à vide).
    const moyenne = 0.5 * (y + buf[i1]);
    const ap = C * moyenne + apx - C * apy;
    apx = moyenne; apy = ap;
    buf[i0] = (i < finNote ? tenue : tenue * 0.985) * ap;
    const fe = i > n - fondu ? (n - i) / fondu : 1;
    out[s0 + i] += y * g * fe;
    i0 = i1;
  }
}

// Somme de partiels sinusoïdaux, chacun avec son amortissement (en 1/s) — tournés
// par rotation de phase (deux produits par échantillon, pas de Math.sin).
function partiels(out, sr, t, liste, dur, g, { attaque = 0.004, relache = 0.12, etouffe = 10, mod = null } = {}) {
  const s0 = Math.round(t * sr);
  const n = Math.min(out.length - s0, Math.round((dur + relache + 0.6) * sr));
  if (n <= 0) return;
  const P = liste.length;
  const c = new Float64Array(P), s = new Float64Array(P), cw = new Float64Array(P), sw = new Float64Array(P), a = new Float64Array(P), d = new Float64Array(P);
  for (let k = 0; k < P; k++) {
    const w = (2 * Math.PI * liste[k].f) / sr;
    c[k] = 1; s[k] = 0; cw[k] = Math.cos(w); sw[k] = Math.sin(w);
    a[k] = liste[k].a; d[k] = Math.exp(-liste[k].d / sr);
  }
  const nA = Math.max(1, Math.round(attaque * sr)), finNote = Math.round(dur * sr);
  const dEt = Math.exp(-etouffe / sr);
  let et = 1;
  for (let i = 0; i < n; i++) {
    let v = 0;
    for (let k = 0; k < P; k++) {
      const nc = c[k] * cw[k] - s[k] * sw[k];
      s[k] = c[k] * sw[k] + s[k] * cw[k];
      c[k] = nc;
      v += s[k] * a[k];
      a[k] *= d[k];
    }
    if (i > finNote) et *= dEt;
    const att = i < nA ? i / nA : 1;
    const m = mod ? mod(i / sr) : 1;
    out[s0 + i] += v * g * att * et * m;
  }
}

// Piano : partiels légèrement inharmoniques (la raideur de la corde), les aigus
// meurent vite, un coup de marteau. `desaccord` : la seconde corde, faussée exprès
// pour le piano de bastringue.
function piano(out, sr, t, f, dur, g, rnd, { desaccord = 0, clair = 1 } = {}) {
  const B = 0.00035, liste = [];
  for (let k = 1; k <= 7; k++) {
    const fk = k * f * Math.sqrt(1 + B * k * k);
    if (fk > sr / 2.2) break;
    const a = (k === 1 ? 1 : 0.55 / k ** 0.9) * (k > 2 ? clair : 1);
    liste.push({ f: fk, a, d: 0.7 + 0.55 * k });
    if (desaccord) liste.push({ f: fk * (1 + desaccord), a: a * 0.8, d: 0.7 + 0.55 * k });
  }
  partiels(out, sr, t, liste, dur, g * (desaccord ? 0.6 : 1), { attaque: 0.003, etouffe: 9 });
  const s0 = Math.round(t * sr), nM = Math.round(0.012 * sr);
  for (let i = 0; i < nM && s0 + i < out.length; i++) out[s0 + i] += (rnd() * 2 - 1) * g * 0.18 * (1 - i / nM);
}

// Vibraphone : la lame (fondamentale + 4e partiel) et le trémolo du moteur.
function vibra(out, sr, t, f, dur, g) {
  partiels(out, sr, t, [{ f, a: 1, d: 1.1 }, { f: f * 4, a: 0.22, d: 5 }, { f: f * 9.8, a: 0.04, d: 12 }], dur, g,
    { attaque: 0.002, etouffe: 3, mod: (tt) => 1 + 0.28 * Math.sin(2 * Math.PI * 5.5 * tt) });
}

// Cloche (modulation de fréquence) : `ratio` donne le métal — jade, astre, cristal.
function cloche(out, sr, t, f, dur, g, { ratio = 1.4, indice = 3, tenue = 1.4 } = {}) {
  const s0 = Math.round(t * sr), n = Math.min(out.length - s0, Math.round((dur + 2) * sr));
  const w = (2 * Math.PI * f) / sr, wm = w * ratio;
  for (let i = 0; i < n; i++) {
    const tt = i / sr;
    const I = indice * Math.exp(-tt * 3);
    const a = Math.exp(-tt * tenue) * Math.min(1, i / (0.002 * sr));
    out[s0 + i] += Math.sin(w * i + I * Math.sin(wm * i)) * a * g;
  }
}

// Flûte d'os : le souffle (bruit filtré, plus fort à l'attaque) et un vibrato qui
// arrive après la prise de son.
function flute(out, sr, t, f, dur, g, rnd) {
  const s0 = Math.round(t * sr), rel = 0.09, n = Math.min(out.length - s0, Math.round((dur + rel) * sr));
  let ph = 0, souffle = 0;
  const fin = Math.round(dur * sr);
  for (let i = 0; i < n; i++) {
    const tt = i / sr;
    const vib = tt > 0.14 ? 1 + 0.007 * Math.sin(2 * Math.PI * 5 * (tt - 0.14)) : 1;
    ph += (2 * Math.PI * f * vib) / sr;
    souffle += 0.12 * ((rnd() * 2 - 1) - souffle);
    const a = Math.min(1, tt / 0.045) * (i > fin ? Math.max(0, 1 - (i - fin) / (rel * sr)) : 1);
    const bruit = souffle * (0.5 + 1.6 * Math.exp(-tt * 18));
    out[s0 + i] += (Math.sin(ph) + 0.2 * Math.sin(2 * ph) + 0.06 * Math.sin(3 * ph) + bruit) * a * g;
  }
}

// Tambour sur cadre / tambourin : la peau (hauteur qui tombe) et la frappe.
function tambour(out, sr, t, g, rnd, { haut = 150, bas = 62, sec = 7, frappe = 0.4 } = {}) {
  const s0 = Math.round(t * sr), n = Math.min(out.length - s0, Math.round(0.6 * sr));
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const tt = i / sr;
    ph += (2 * Math.PI * (bas + (haut - bas) * Math.exp(-tt * 28))) / sr;
    out[s0 + i] += (Math.sin(ph) * Math.exp(-tt * sec) + (rnd() * 2 - 1) * frappe * Math.exp(-tt * 70)) * g;
  }
}

// Balais sur la caisse claire (le néon) : un bruit doux, qui traîne.
function balai(out, sr, t, g, rnd) {
  const s0 = Math.round(t * sr), n = Math.min(out.length - s0, Math.round(0.25 * sr));
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const tt = i / sr;
    lp += 0.35 * ((rnd() * 2 - 1) - lp);
    out[s0 + i] += ((rnd() * 2 - 1) - lp) * g * Math.exp(-tt * 14) * Math.min(1, tt / 0.01);
  }
}

// Nappe (les âges cosmiques) et bourdon (la couronne) : des sinus tenus, désaccordés.
function nappe(out, sr, t, freqs, dur, g, { attaque = 0.45, relache = 0.7, brille = 0 } = {}) {
  const liste = [];
  for (const f of freqs) {
    liste.push({ f, a: 1, d: 0 }, { f: f * 1.004, a: 0.6, d: 0 }, { f: f * 0.997, a: 0.5, d: 0 });
    if (brille) liste.push({ f: f * 2, a: brille, d: 0 });
  }
  partiels(out, sr, t, liste, dur, g / freqs.length, { attaque, etouffe: 1 / relache * 3, relache });
}

// Écho de salle (Schroeder) : quatre peignes amortis, deux passe-tout. `piece` :
// la taille de la salle (0 à 1), `mouille` : la part de réverbération.
function salle(sec, sr, piece, mouille) {
  if (mouille <= 0) return sec;
  const k = sr / 44100;
  const out = new Float32Array(sec.length);
  const fb = 0.7 + 0.26 * piece, amort = 0.25;
  for (const L0 of [1557, 1617, 1491, 1422]) {
    const L = Math.round(L0 * k * (0.8 + 0.5 * piece));
    const b = new Float32Array(L);
    let j = 0, lp = 0;
    for (let i = 0; i < sec.length; i++) {
      const y = b[j];
      lp = y * (1 - amort) + lp * amort;
      // Entrée ramenée à (1 − fb) : un peigne qui reboucle à 0,96 amplifie ×25 — sans
      // ça l'écho des grandes salles (grotte, pierre, cosmos) noyait l'air.
      b[j] = sec[i] * (1 - fb) * 2.2 + lp * fb;
      out[i] += y * 0.25;
      j = j + 1 === L ? 0 : j + 1;
    }
  }
  for (const L0 of [556, 225]) {
    const L = Math.round(L0 * k);
    const b = new Float32Array(L);
    let j = 0;
    for (let i = 0; i < out.length; i++) {
      const bv = b[j], x = out[i];
      const y = -x + bv;
      b[j] = x + bv * 0.5;
      out[i] = y;
      j = j + 1 === L ? 0 : j + 1;
    }
  }
  const res = new Float32Array(sec.length);
  for (let i = 0; i < sec.length; i++) res[i] = sec[i] * (1 - mouille * 0.5) + out[i] * mouille;
  return res;
}

// Le pupitre partagé des arrangements (rendu synchrone, un âge à la fois).
const J = { out: null, sr: MELODIE_SR, rnd: Math.random };

// ── Les arrangements, âge par âge.
// `cadence` : battements par minute ; `swing` : croches inégales (le néon) ;
// `piece`/`mouille` : la salle ; `jouer(J)` pose les notes avec les outils de J.
const ARRANGEMENTS = [
  { // 0 — FEU : flûte d'os, tambour sur cadre, la grotte.
    cadence: 108, piece: 0.9, mouille: 0.42,
    jouer: ({ air, frappe }) => {
      air((t, f, d, g, rnd) => flute(J.out, J.sr, t, f * 2, d * 0.92, g * 0.5, rnd));
      for (let b = 0; b < TEMPS_AIR; b += 1) frappe(b, b % 2 === 0 ? 0.55 : 0.3);
      frappe(3.5, 0.22); frappe(5.5, 0.22);
    }
  },
  { // 1 — BOIS : lyre, basse à la lyre, tambour léger.
    cadence: 116, piece: 0.35, mouille: 0.22,
    jouer: ({ air, basse, frappe }) => {
      air((t, f, d, g, rnd) => corde(J.out, J.sr, t, f, d, g * 0.6, rnd, { clair: 0.5, tenue: 0.997 }));
      basse((t, f, d, g, rnd) => corde(J.out, J.sr, t, f, d, g * 0.2, rnd, { clair: 0.18, tenue: 0.994 }));
      frappe(0, 0.3); frappe(4, 0.3);
    }
  },
  { // 2 — PIERRE : lyre plus claire, la salle de pierre résonne.
    cadence: 112, piece: 0.75, mouille: 0.3,
    jouer: ({ air, basse, frappe }) => {
      air((t, f, d, g, rnd) => corde(J.out, J.sr, t, f, d, g * 0.6, rnd, { clair: 0.64, tenue: 0.997 }));
      basse((t, f, d, g, rnd) => corde(J.out, J.sr, t, f, d, g * 0.2, rnd, { clair: 0.18, tenue: 0.994 }));
      frappe(0, 0.24); frappe(2, 0.18); frappe(4, 0.24); frappe(6, 0.18);
    }
  },
  { // 3 — COURONNE : luth, bourdon (la, mi) tenu, tambourin.
    cadence: 124, piece: 0.5, mouille: 0.26,
    jouer: ({ air, frappe, sec }) => {
      air((t, f, d, g, rnd) => corde(J.out, J.sr, t, f, d, g * 0.62, rnd, { clair: 0.78, tenue: 0.9968 }));
      nappe(J.out, J.sr, 0, [hz('A2'), hz('E3')], sec(TEMPS_AIR), 0.06, { attaque: 0.25, brille: 0.2 });
      for (const b of [0, 1.5, 2, 4, 5.5, 6]) frappe(b, b % 2 === 0 ? 0.3 : 0.2, { haut: 260, bas: 160, sec: 14, frappe: 0.7 });
    }
  },
  { // 4 — MARBRE : harpe, basse pincée, arpège roulé pour finir.
    cadence: 112, piece: 0.7, mouille: 0.3,
    jouer: ({ air, basse, at }) => {
      const harpe = (t, f, d, g, rnd) => corde(J.out, J.sr, t, f, d, g, rnd, { clair: 0.42, tenue: 0.998, queue: 1.2 });
      air((t, f, d, g, rnd) => harpe(t, f, d, g * 0.6, rnd));
      basse((t, f, d, g, rnd) => corde(J.out, J.sr, t, f, d, g * 0.18, rnd, { clair: 0.35, tenue: 0.995 }));
      ['A2', 'E3', 'A3', 'C4', 'E4'].forEach((n, k) => harpe(at(6 + 0.15 + k * 0.09), hz(n), 1.6, 0.14, J.rnd));
    }
  },
  { // 5 — FONTE : piano de bastringue, pompe à la main gauche (basse, accord).
    cadence: 132, piece: 0.3, mouille: 0.16,
    jouer: ({ air, at, sec }) => {
      const pno = (t, f, d, g) => piano(J.out, J.sr, t, f, d, g, J.rnd, { desaccord: 0.0035 });
      air((t, f, d, g) => pno(t, f, d, g * 0.55));
      const pompe = [['A2', 0], ['E2', 1], ['D2', 2], ['A2', 3], ['G2', 4], ['E2', 5]];
      for (const [n, b] of pompe) {
        pno(at(b), hz(n), sec(0.45), 0.32);
        const acc = ACCORDS.filter(([b0]) => b0 <= b).pop()[1];
        for (const a of acc) pno(at(b + 0.5), hz(a), sec(0.3), 0.13);
      }
      for (const n of ['A2', 'A3', 'C4', 'E4']) pno(at(6), hz(n), sec(2), 0.2);
    }
  },
  { // 6 — NÉON : vibraphone en swing, contrebasse qui marche, balais sur 2 et 4.
    cadence: 100, swing: true, piece: 0.45, mouille: 0.2,
    jouer: ({ air, at, sec }) => {
      air((t, f, d, g) => vibra(J.out, J.sr, t, f, d, g * 0.5));
      const marche = ['A2', 'C3', 'D3', 'E3', 'G2', 'E2', 'A2'];
      marche.forEach((n, b) => corde(J.out, J.sr, at(b), hz(n), sec(b === 6 ? 1.6 : 0.9), 0.5, J.rnd, { clair: 0.22, tenue: 0.996 }));
      for (const b of [1, 3, 5, 7]) balai(J.out, J.sr, at(b), 0.09, J.rnd);
      for (const b of [0.5, 2.5, 4.5]) balai(J.out, J.sr, at(b), 0.04, J.rnd);
    }
  }
];
// 7-9 — LES ÂGES COSMIQUES : cloches sur une nappe ; seul le métal change.
const COSMIQUE = (ratio, indice, mouille) => ({
  cadence: 92, piece: 1, mouille,
  jouer: ({ air, at, sec }) => {
    air((t, f, d, g) => cloche(J.out, J.sr, t, f * 2, d, g * 0.5, { ratio, indice }));
    for (const [b, acc] of ACCORDS_PENTA) {
      const fin = ACCORDS_PENTA.find(([b0]) => b0 > b);
      nappe(J.out, J.sr, at(b), acc.map((n) => hz(n)), sec((fin ? fin[0] : TEMPS_AIR) - b), 0.07, { attaque: 0.35, relache: 0.9 });
    }
  }
});
// ⚠ L'indice de modulation reste bas : vers 2,4 la fondamentale S'ÉTEINT (J0(2,4) ≈ 0)
// et la cloche ne chante plus l'air — mesuré par l'analyse des hauteurs.
ARRANGEMENTS.push(COSMIQUE(1.4, 1.3, 0.4), COSMIQUE(3.5, 1.1, 0.48), COSMIQUE(2.76, 0.9, 0.55));

export function renderMelodie(band, sr = MELODIE_SR) {
  const A = ARRANGEMENTS[Math.max(0, Math.min(ARRANGEMENTS.length - 1, band | 0))];
  const rnd = graine(0x5ce1e + (band | 0) * 977);
  const temps = 60 / A.cadence;
  const queue = 1.6 + 1.6 * A.mouille;
  const total = Math.round((TEMPS_AIR * temps + queue) * sr);
  J.out = new Float32Array(total); J.sr = sr; J.rnd = rnd;
  // Le temps (en battements) → la seconde, croches inégales au néon, et un souffle
  // d'humanité : quelques millisecondes d'avance ou de retard, à graine.
  const at = (b) => {
    let x = b;
    if (A.swing) {
      const i = Math.floor(b), fr = b - i;
      x = i + (fr <= 0.5 ? fr * 1.28 : 0.64 + (fr - 0.5) * 0.72);
    }
    return 0.02 + x * temps + (rnd() - 0.5) * 0.012;
  };
  const sec = (b) => b * temps;
  const outils = {
    at, sec,
    air: (jouer) => AIR.forEach(([b, n, d], k) => jouer(at(b), hz(n), sec(d), (k === 0 || b % 2 === 0 ? 1 : 0.86) * (0.92 + rnd() * 0.16), rnd)),
    basse: (jouer) => BASSE.forEach(([b, n, d]) => jouer(at(b), hz(n), sec(d), 1, rnd)),
    frappe: (b, g, opts) => tambour(J.out, J.sr, at(b), g, rnd, opts)
  };
  A.jouer(outils);
  let mix = salle(J.out, sr, A.piece, A.mouille);
  // Pas d'écrêtage, jamais : on ramène la crête à 0,8, avec un fondu de sortie.
  let crete = 1e-6;
  for (let i = 0; i < mix.length; i++) crete = Math.max(crete, Math.abs(mix[i]));
  const k = 0.8 / crete, fondu = Math.round(0.25 * sr);
  for (let i = 0; i < mix.length; i++) mix[i] *= k * (i > mix.length - fondu ? (mix.length - i) / fondu : 1);
  J.out = null;
  return mix;
}

// ── La lecture.
let ctx = null;
let enCours = null;
let rang = 0;
const cache = new Map();

export function jouerMelodieScene(band) {
  if (typeof window === 'undefined') return;
  // La mélodie est de la MUSIQUE : coupée avec elle (Options › Son).
  if (!getMusicEnabled()) return;
  const vol = getMusicVolume();
  if (vol <= 0) return;
  arreter();

  // Les mélodies déposées par Raph passent avant celle du jeu, chacune à son tour.
  if (MELODIES_SCENE.length) {
    const m = MELODIES_SCENE[rang++ % MELODIES_SCENE.length];
    const a = new Audio(m.url);
    a.volume = vol;
    a.addEventListener('loadedmetadata', () => duckMusic(Math.max(0, a.duration * 1000 - 500)), { once: true });
    a.play().catch(() => {});
    enCours = { stop: () => a.pause() };
    return;
  }

  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  if (!ctx) ctx = new AC();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  const b = Math.max(0, Math.min(ARRANGEMENTS.length - 1, band | 0));
  if (!cache.has(b)) cache.set(b, renderMelodie(b));
  const data = cache.get(b);
  const buf = ctx.createBuffer(1, data.length, MELODIE_SR);
  buf.copyToChannel(data, 0);
  const src = ctx.createBufferSource();
  const g = ctx.createGain();
  src.buffer = buf;
  g.gain.value = vol * 0.9;
  src.connect(g).connect(ctx.destination);
  src.start();
  enCours = { stop: () => { try { src.stop(); } catch { /* déjà finie */ } } };
  duckMusic(Math.max(0, (data.length / MELODIE_SR) * 1000 - 900));
}

function arreter() {
  if (enCours) enCours.stop();
  enCours = null;
}
