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
import { hz, graine, corde, piano, vibra, cloche, flute, tambour, balai, nappe, salle, audioCtx } from './synth.js';

export { hz };

export const MELODIE_SR = 32000;

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

// ── La lecture (le contexte audio est celui du jeu : synth.js).
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

  const ctx = audioCtx();
  if (!ctx) return;
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
