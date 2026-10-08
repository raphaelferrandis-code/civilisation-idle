// LES SONS DES SCÈNES DE LA MAISON DES PLAISIRS (docs/PLAN-AMBIANCE-SONORE.md, lot 11) —
// la SYNTHÈSE, pure, à graine fixe, rendue dans le Worker des sons comme les autres
// (tablesSynth.js la dispatche). Les quatre tables qui se taisaient :
//   · LA ROULETTE (RouletteStage.jsx) : roue-<m>, le tour entier, calé sur l'animation
//     (rouletteArt.spinPose, 3,8 s) : la bille lancée qui court sur la piste en
//     ralentissant, heurte un losange, rebondit de case en case et s'arrête ;
//   · LES COURSES (CoursesStage.jsx) : stalles-<m> (le départ), galop-<m> (une boucle,
//     six coureurs), arrivee-<m> (la cloche), photo (une arrivée serrée). La foule est
//     un enregistrement, la clameur brouillée du paysage (tables.js) ;
//   · LE DUEL (DuelStage.jsx) : les dés des osselets, et manche-gagnee, manche-perdue ;
//   · LE VOL D'ICARE (IcarusStage.jsx) : envol-<f>, vol-<f> (une boucle que la hauteur
//     dose), pose-<f>, brule-<f>, pour chaque aviateur de l'âge (plaisirsMaterial.js,
//     icarusFlyer) : Icare, le ballon, le deltaplane, Icare de lumière.

import { graine, cloche, partiels } from '../synth.js';
import { modes, frappe, MODES } from '../moments/momentsSynth.js';
import { choc, glisse, poids, vide, fini } from './briques.js';

const { CRISTAL, BOIS } = MODES;

// ── Les matières, selon la bande d'âge ──────────────────────────────────────────
export const ROUES = ['bois', 'casino', 'lumiere'];
export const PISTES = ['sabots', 'lumiere'];
export const AVIATEURS = ['icare', 'ballon', 'delta', 'lumiere'];
const borne = (b) => Math.max(0, Math.min(9, b | 0));
// La roue : bille d'ivoire et frettes de laiton, puis la bille de casino du Néon, puis
// la lumière (comme les osselets).
export const matiereRoue = (b) => { const x = borne(b); return x <= 5 ? 'bois' : x === 6 ? 'casino' : 'lumiere'; };
// Les chevaux : de chair jusqu'au Néon, de lumière ensuite (coursesArt.racerPalette).
export const matierePiste = (b) => (borne(b) >= 7 ? 'lumiere' : 'sabots');
// L'aviateur (plaisirsMaterial.icarusFlyer) : Icare jusqu'au Marbre, le ballon à la
// Fonte, le deltaplane au Néon, Icare de lumière ensuite.
export const matiereVol = (b) => { const x = borne(b); return x <= 4 ? 'icare' : x === 5 ? 'ballon' : x === 6 ? 'delta' : 'lumiere'; };

// ── Les briques des scènes ──────────────────────────────────────────────────────
// Un bruit dans une bande qui suit le temps : `bas(q)`, `haut(q)` ses bornes (Hz),
// `env(q)` son gain, q allant de 0 à 1 sur la durée. `boucle` (en échantillons) :
// écrit en boucle, ce qui dépasse revient au début.
function bruit(out, sr, t, duree, bas, haut, env, rnd, boucle = 0) {
  const s0 = Math.round(t * sr), n = Math.round(duree * sr);
  let lp = 0, hp = 0;
  for (let i = 0; i < n; i += 1) {
    const q = i / n;
    const kl = 1 - Math.exp((-2 * Math.PI * haut(q)) / sr), kh = 1 - Math.exp((-2 * Math.PI * bas(q)) / sr);
    lp += kl * ((rnd() * 2 - 1) - lp);
    hp += kh * (lp - hp);
    const j = s0 + i;
    if (boucle) out[j % boucle] += (lp - hp) * env(q);
    else if (j < out.length) out[j] += (lp - hp) * env(q);
  }
}
// Un coup sourd (un sabot, un atterrissage) : une sinusoïde grave qui tombe vite.
function sourd(out, sr, t, f, g, tau, boucle = 0) {
  const s0 = Math.round(t * sr), n = Math.round(tau * 6 * sr);
  let ph = 0;
  for (let i = 0; i < n; i += 1) {
    const tt = i / sr;
    ph += (2 * Math.PI * f * (1 + 0.6 * Math.exp(-tt * 40))) / sr;
    const v = Math.sin(ph) * Math.exp(-tt / tau) * g * Math.min(1, i / (0.0015 * sr));
    const j = s0 + i;
    if (boucle) out[j % boucle] += v;
    else if (j < out.length) out[j] += v;
  }
}
// Une petite note claire (un sabot de lumière, un frisson) : deux partiels qui meurent.
function tinte(out, sr, t, f, g, tau, boucle = 0) {
  const s0 = Math.round(t * sr), n = Math.round(tau * 5 * sr), w = (2 * Math.PI * f) / sr;
  for (let i = 0; i < n; i += 1) {
    const v = (Math.sin(w * i) + 0.3 * Math.sin(2.01 * w * i)) * Math.exp(-i / sr / tau) * g * Math.min(1, i / (0.002 * sr));
    const j = s0 + i;
    if (boucle) out[j % boucle] += v;
    else if (j < out.length) out[j] += v;
  }
}
// Un coup d'aile : un souffle qui s'ouvre puis retombe, les plumes qui frémissent.
function battement(out, sr, t, g, rnd, { fc = 650, duree = 0.32, boucle = 0 } = {}) {
  bruit(out, sr, t, duree,
    () => fc * 0.4,
    (q) => fc * (1 + 0.9 * Math.sin(Math.PI * q)),
    (q) => g * (q < 0.22 ? q / 0.22 : Math.exp(-(q - 0.22) * 4.5)) * (1 + 0.25 * Math.sin(2 * Math.PI * 34 * q * duree)),
    rnd, boucle);
}
// Le brûleur d'une montgolfière : un grondement de flamme qui crépite.
function bruleur(out, sr, t, duree, g, rnd) {
  bruit(out, sr, t, duree, () => 70, (q) => 900 + 300 * Math.sin(Math.PI * q),
    (q) => g * Math.min(1, (q * duree) / 0.06) * Math.min(1, ((1 - q) * duree) / 0.2) * (0.85 + 0.15 * Math.sin(q * duree * 2 * Math.PI * 11)),
    rnd);
  const n = Math.round(duree * 30);
  for (let i = 0; i < n; i += 1) frappe(out, sr, t + rnd() * duree, g * 0.08 * rnd(), rnd, 0.0008);
}
// Une boucle : `x` dure `Ln` échantillons de plus que sa queue ; la queue se fond dans
// la tête, à puissance constante (comme les nappes du paysage).
function boucler(x, Ln) {
  const F = x.length - Ln, out = x.slice(0, Ln);
  for (let i = 0; i < F; i += 1) {
    const th = ((i / F) * Math.PI) / 2;
    out[i] = x[i] * Math.sin(th) + x[Ln + i] * Math.cos(th);
  }
  return out;
}
// LA SONIE, pour égaliser les variantes d'un même son (une bille de lumière qui chante
// sort sinon 4 dB au-dessus d'une bille d'ivoire, à crête égale) : l'énergie pondérée K
// (l'étagère des aigus, +4 dB à 1,7 kHz, et le passe-haut de 38 Hz), en crête sur une
// fenêtre glissante de 100 ms, ou en moyenne (les boucles).
function biquadK(type, f0, q, gainDb, sr) {
  const A = Math.pow(10, gainDb / 40), w = (2 * Math.PI * f0) / sr, c = Math.cos(w), s = Math.sin(w), al = s / (2 * q);
  let b0, b1, b2, a0, a1, a2;
  if (type === 'etagere') {
    const r = 2 * Math.sqrt(A) * al;
    b0 = A * ((A + 1) + (A - 1) * c + r); b1 = -2 * A * ((A - 1) + (A + 1) * c); b2 = A * ((A + 1) + (A - 1) * c - r);
    a0 = (A + 1) - (A - 1) * c + r; a1 = 2 * ((A - 1) - (A + 1) * c); a2 = (A + 1) - (A - 1) * c - r;
  } else {
    b0 = (1 + c) / 2; b1 = -(1 + c); b2 = (1 + c) / 2; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al;
  }
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return (x) => {
    const y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    return y;
  };
}
function sonie(buf, sr, moyenne) {
  const e = biquadK('etagere', 1681, 0.707, 4, sr), h = biquadK('passe-haut', 38, 0.5, 0, sr);
  const n = Math.round(0.1 * sr), carres = new Float64Array(buf.length);
  let s = 0, m = 0, tot = 0;
  for (let i = 0; i < buf.length; i += 1) {
    const y = h(e(buf[i]));
    carres[i] = y * y;
    tot += carres[i];
    s += carres[i];
    if (i >= n) s -= carres[i - n];
    if (s / n > m) m = s / n;
  }
  return 10 * Math.log10((moyenne ? tot / buf.length : m) + 1e-12);
}
// Amène un son à la sonie `cible` (dB), sa crête gardée sous 0,95.
function egaliser(buf, sr, cible, moyenne = false) {
  let k = Math.pow(10, (cible - sonie(buf, sr, moyenne)) / 20), pic = 0;
  for (let i = 0; i < buf.length; i += 1) pic = Math.max(pic, Math.abs(buf[i]) * k);
  if (pic > 0.95) k *= 0.95 / pic;
  for (let i = 0; i < buf.length; i += 1) buf[i] *= k;
  return buf;
}
// Les cibles : un son bref à −10 dB en crête, une boucle à −14 dB en moyenne (avant le
// niveau de lecture, tables.js).
const BREF = -10, BOUCLE = -14;
const fermer = (out, sr) => egaliser(out, sr, BOUCLE, true);
const finir = (out, sr, piece, mouille, fondu, cible = BREF) => egaliser(fini(out, sr, piece, mouille, fondu), sr, cible);

// ── La roulette ─────────────────────────────────────────────────────────────────
const TOUR = 3.8;                 // RouletteStage.SPIN_MS
// La vitesse de la bille sur la piste, d'après spinPose (rouletteArt.js) : la roue
// (7,5 tours d'élan, freinée) et la bille qui court à rebours, de plus en plus lentement.
function vitesseBille(u) {
  const v = Math.min(1, u / 0.88);
  return Math.abs(15 * (1 - u) - (3 * (Math.PI * 10 + 1.3) * (1 - v) * (1 - v)) / 0.88);
}
const V0 = vitesseBille(0);
const ROUE = {
  bois: { bille: 'ivoire', frette: 'bronze', roule: [700, 3400] },
  casino: { bille: 'casino', frette: 'metal', roule: [900, 4200] },
  lumiere: { bille: 'lumiere', frette: 'cristal', roule: null },
};
function rendreRoue(m, sr) {
  const rnd = graine(0x7b100 + ROUES.indexOf(m));
  const R = ROUE[m];
  const out = vide(4.6, sr);
  const tChute = 0.62 * TOUR, tCase = 0.88 * TOUR;
  // Le moyeu de la roue, lancée puis freinée : un ronflement qui descend.
  bruit(out, sr, 0, 4.5, () => 50, (q) => 160 + 200 * Math.max(0, 1 - (q * 4.5) / TOUR),
    (q) => { const u = (q * 4.5) / TOUR; return 0.5 * Math.min(1, q * 40) * (u < 1 ? 0.35 + 0.65 * (1 - u) : 0.35 * Math.max(0, 1 - (u - 1) / 0.18)); }, rnd);
  // La bille lancée : le coup de doigt de la croupière.
  glisse(out, sr, 0, 0.12, 400, 2600, 0.25, rnd);
  choc(out, sr, 0.02, R.bille, 0.7, rnd, 1.1);
  // Elle court sur la piste : un roulement qui tourne avec elle (le battement de son
  // passage), plus grave et plus doux à mesure qu'elle ralentit.
  const s0 = Math.round(0.04 * sr), s1 = Math.round(tChute * sr);
  let lp = 0, hp = 0, ph = 0;
  for (let i = s0; i < s1; i += 1) {
    const t = i / sr, u = t / TOUR;
    const s = vitesseBille(u) / V0;
    ph += (vitesseBille(u) / TOUR) / sr;          // radians de bille par seconde
    const passe = 0.72 + 0.28 * Math.cos(ph);
    const a = 0.55 * Math.pow(s, 0.35) * passe * Math.min(1, (i - s0) / (0.05 * sr)) * Math.min(1, (s1 - i) / (0.12 * sr));
    if (R.roule) {
      const kl = 1 - Math.exp((-2 * Math.PI * R.roule[1] * (0.5 + 0.5 * s)) / sr);
      const kh = 1 - Math.exp((-2 * Math.PI * R.roule[0] * (0.6 + 0.4 * s)) / sr);
      lp += kl * ((rnd() * 2 - 1) - lp);
      hp += kh * (lp - hp);
      out[i] += (lp - hp) * a * 1.6;
    } else {
      // La bille de lumière chante : une quinte qui descend avec elle.
      const f = 700 + 1100 * s;
      out[i] += (Math.sin(2 * Math.PI * f * t) + 0.5 * Math.sin(2 * Math.PI * f * 1.5 * t + 0.7)) * a * 0.6;
    }
  }
  // Les grains de la piste sous la bille : de petits chocs, plus rares quand elle ralentit.
  for (let t = 0.1; t < tChute - 0.05; t += 1 / 40) {
    const s = vitesseBille(t / TOUR) / V0;
    if (rnd() < 0.45 * s) choc(out, sr, t + rnd() / 40, R.bille, 0.05 + 0.05 * s, rnd, 1.4 + 0.3 * rnd());
  }
  // Elle quitte la piste et heurte un losange, puis rebondit de case en case.
  choc(out, sr, tChute, R.bille, 0.9, rnd, 1);
  choc(out, sr, tChute + 0.004, R.frette, 0.55, rnd, 0.9);
  [[0.647, 0.8], [0.74, 0.6], [0.833, 0.42]].forEach(([u, g]) => {
    choc(out, sr, u * TOUR, R.frette, g, rnd, 0.95 + 0.1 * rnd());
    choc(out, sr, u * TOUR + 0.006, R.bille, g * 0.55, rnd, 1.2);
  });
  for (let i = 0; i < 7; i += 1) choc(out, sr, tChute + 0.08 + rnd() * (tCase - tChute - 0.1), R.frette, 0.1 + 0.18 * rnd(), rnd, 1.1 + 0.3 * rnd());
  // Elle se loge : deux petits coups, un frémissement dans la case.
  choc(out, sr, tCase, R.frette, 0.35, rnd, 1.05);
  choc(out, sr, tCase + 0.045, R.bille, 0.2, rnd, 1.3);
  glisse(out, sr, tCase + 0.02, 0.07, 1500, 4000, 0.08, rnd);
  return finir(out, sr, 0.35, 0.1, 0.1);
}

// ── Les courses ─────────────────────────────────────────────────────────────────
function rendreStalles(m, sr) {
  const rnd = graine(0x7b200 + PISTES.indexOf(m));
  const out = vide(1.5, sr);
  if (m === 'sabots') {
    // Les six loquets qui sautent ensemble, la grille qui claque.
    for (let i = 0; i < 6; i += 1) choc(out, sr, 0.01 + i * 0.009 + rnd() * 0.006, 'metal', 0.45 + 0.2 * rnd(), rnd, 0.8 + 0.3 * rnd());
    poids(out, sr, 0.012, 0.7);
    // La sonnette du départ, sonnée vite.
    for (let i = 0; i < 9; i += 1) cloche(out, sr, 0.05 + i * 0.055, 2093, 0.05, 0.22 * (1 - i / 12), { ratio: 2.76, indice: 1.2, tenue: 9 });
  } else {
    // Les stalles de lumière s'ouvrent : trois notes qui montent, un souffle.
    [[0.02, 1319], [0.09, 1760], [0.16, 2637]].forEach(([t, f]) => modes(out, sr, t, f, CRISTAL, 0.45, { duree: 0.5 }));
    glisse(out, sr, 0, 0.4, 800, 6000, 0.3, rnd);
  }
  return finir(out, sr, 0.4, 0.1, 0.1);
}
// Le galop : six coureurs, quatre appuis par foulée (0,42 s), une boucle de six foulées.
const FOULEE = 0.42, APPUIS = [0, 0.055, 0.125, 0.18];
function rendreGalop(m, sr) {
  const rnd = graine(0x7b300 + PISTES.indexOf(m));
  const L = FOULEE * 6, Ln = Math.round(L * sr), F = Math.round(0.25 * sr);
  const x = new Float32Array(Ln + F);
  const dur = (Ln + F) / sr;
  if (m === 'sabots') {
    // La piste qui tremble sous eux : un grondement grave qui respire avec la foulée.
    bruit(x, sr, 0, dur, () => 35, () => 200, (q) => 0.5 * (0.8 + 0.2 * Math.sin((2 * Math.PI * q * dur) / FOULEE)), rnd);
  } else {
    // La traînée de lumière : un souffle clair.
    bruit(x, sr, 0, dur, () => 2500, () => 8000, (q) => 0.35 * (0.8 + 0.2 * Math.sin((2 * Math.PI * 2 * q * dur) / L)), rnd);
  }
  const out = boucler(x, Ln);
  for (let h = 0; h < 6; h += 1) {
    const phase = rnd() * FOULEE, loin = 0.55 + 0.45 * rnd();
    for (let s = 0; s < 6; s += 1) {
      for (let a = 0; a < 4; a += 1) {
        const t = phase + s * FOULEE + APPUIS[a] + (rnd() - 0.5) * 0.012;
        if (m === 'sabots') {
          sourd(out, sr, t, 70 + 40 * rnd(), 0.5 * loin * (a < 2 ? 0.8 : 1), 0.035, Ln);
          bruit(out, sr, t, 0.03, () => 250, () => 1400, (q) => 0.9 * loin * (1 - q) * (1 - q), rnd, Ln);
        } else {
          tinte(out, sr, t, 1800 + 900 * rnd(), 0.12 * loin, 0.06, Ln);
        }
      }
    }
  }
  return fermer(out, sr);
}
function rendreArrivee(m, sr) {
  const rnd = graine(0x7b400 + PISTES.indexOf(m));
  const out = vide(1.8, sr);
  if (m === 'sabots') {
    // La cloche du juge, deux coups.
    frappe(out, sr, 0.01, 0.15, rnd, 0.002);
    cloche(out, sr, 0.01, 1046.5, 1.2, 0.6);
    frappe(out, sr, 0.38, 0.12, rnd, 0.002);
    cloche(out, sr, 0.38, 1046.5, 1.0, 0.45);
  } else {
    [1568, 1976, 2349].forEach((f, i) => modes(out, sr, 0.01 + i * 0.03, f, CRISTAL, 0.4, { duree: 1 }));
    glisse(out, sr, 0.05, 0.6, 2000, 8000, 0.12, rnd);
  }
  return finir(out, sr, 0.5, 0.15, 0.2);
}
// La photo d'arrivée : le déclic de l'obturateur, le flash qui se recharge.
function rendrePhoto(sr) {
  const rnd = graine(0x7b500);
  const out = vide(0.6, sr);
  choc(out, sr, 0.005, 'metal', 0.5, rnd, 1.8);
  choc(out, sr, 0.07, 'metal', 0.35, rnd, 2.1);
  const s0 = Math.round(0.09 * sr), n = Math.round(0.32 * sr);
  let ph = 0;
  for (let i = 0; i < n; i += 1) {
    const q = i / n;
    ph += (2 * Math.PI * (1800 + 3400 * q)) / sr;
    out[s0 + i] += Math.sin(ph) * 0.05 * Math.sin(Math.PI * q);
  }
  return finir(out, sr, 0.2, 0.05, 0.05);
}

// ── Le duel ─────────────────────────────────────────────────────────────────────
function rendreManche(gagnee, sr) {
  const rnd = graine(gagnee ? 0x7b600 : 0x7b700);
  const out = vide(gagnee ? 0.8 : 0.5, sr);
  if (gagnee) {
    frappe(out, sr, 0.005, 0.06, rnd, 0.001);
    modes(out, sr, 0.005, 1568, CRISTAL, 0.6, { duree: 0.4 });
    modes(out, sr, 0.09, 2093, CRISTAL, 0.55, { duree: 0.45 });
    return finir(out, sr, 0.4, 0.15, 0.12);
  }
  frappe(out, sr, 0.004, 0.1, rnd, 0.002);
  modes(out, sr, 0.004, 262, BOIS.map(([r, a, d]) => [r, a, d * 0.9]), 0.6, { duree: 0.3 });
  partiels(out, sr, 0.004, [{ f: 131, a: 1, d: 10 }], 0.25, 0.25, { attaque: 0.004, relache: 0.05 });
  return finir(out, sr, 0.3, 0.1, 0.1, BREF - 4);
}

// ── Le vol d'Icare ──────────────────────────────────────────────────────────────
function rendreEnvol(f, sr) {
  const rnd = graine(0x7b800 + AVIATEURS.indexOf(f));
  const out = vide(1.8, sr);
  if (f === 'icare') {
    battement(out, sr, 0.03, 1, rnd, { fc: 600 });
    battement(out, sr, 0.42, 0.9, rnd, { fc: 650 });
    battement(out, sr, 0.78, 0.8, rnd, { fc: 700 });
    bruit(out, sr, 0.2, 1.5, () => 150, (q) => 500 + 500 * q, (q) => 0.3 * q * Math.sqrt(q) * (1 - Math.max(0, q - 0.85) / 0.15), rnd);
  } else if (f === 'ballon') {
    bruleur(out, sr, 0.05, 1.1, 1, rnd);
    for (let i = 0; i < 3; i += 1) choc(out, sr, 0.5 + 0.15 * i + 0.05 * rnd(), 'bois', 0.15 + 0.1 * rnd(), rnd, 0.7 + 0.3 * rnd());
    poids(out, sr, 0.55, 0.3);
  } else if (f === 'delta') {
    // Quelques pas de course, la toile qui claque, le vent qui prend.
    [0, 0.2, 0.37, 0.52].forEach((t, i) => {
      sourd(out, sr, t, 90, 0.35 + 0.05 * i, 0.04);
      bruit(out, sr, t, 0.04, () => 300, () => 1600, (q) => 0.6 * (1 - q) * (1 - q), rnd);
    });
    glisse(out, sr, 0.68, 0.08, 600, 4000, 0.6, rnd);
    bruit(out, sr, 0.74, 1, () => 350, () => 1500, (q) => 0.35 * (1 - q) * (0.6 + 0.4 * Math.sin(2 * Math.PI * 15 * q)), rnd);
    bruit(out, sr, 0.6, 1.2, () => 150, () => 900, (q) => 0.25 * q, rnd);
  } else {
    [1319, 1760, 2217, 2637].forEach((fr, i) => modes(out, sr, 0.02 + i * 0.12, fr, CRISTAL, 0.4, { duree: 0.6 }));
    glisse(out, sr, 0.3, 0.9, 1000, 7000, 0.2, rnd);
  }
  return finir(out, sr, 0.4, 0.1, 0.15);
}
// Le vol : une boucle de 4 s, que la hauteur dose (tables.js : volume et vitesse).
function rendreVol(f, sr) {
  const rnd = graine(0x7b900 + AVIATEURS.indexOf(f));
  const L = 4, Ln = Math.round(L * sr), F = Math.round(0.3 * sr);
  const x = new Float32Array(Ln + F);
  const dur = (Ln + F) / sr;
  // Le vent, des rafales aux périodes de la boucle.
  const rafale = (q, k = 1) => 0.75 + 0.25 * Math.sin((2 * Math.PI * 2 * q * dur) / L) + 0.1 * k * Math.sin((2 * Math.PI * 3 * q * dur) / L + 1);
  if (f === 'icare') {
    bruit(x, sr, 0, dur, () => 140, (q) => 700 + 250 * rafale(q), (q) => 0.35 * rafale(q), rnd);
  } else if (f === 'ballon') {
    bruit(x, sr, 0, dur, () => 120, () => 600, (q) => 0.25 * rafale(q), rnd);
    bruleur(x, sr, 1.6, 0.55, 0.45, rnd);
  } else if (f === 'delta') {
    bruit(x, sr, 0, dur, () => 1200, () => 2600, (q) => 0.12 * rafale(q), rnd);
    bruit(x, sr, 0, dur, () => 350, () => 1500, (q) => 0.25 * (0.6 + 0.4 * Math.sin(2 * Math.PI * 15 * q * dur)), rnd);
    bruit(x, sr, 0, dur, () => 120, () => 700, (q) => 0.2 * rafale(q), rnd);
  } else {
    bruit(x, sr, 0, dur, () => 3000, () => 9000, (q) => 0.06 * rafale(q), rnd);
  }
  const out = boucler(x, Ln);
  if (f === 'icare') {
    [0.2, 1.25, 2.3, 3.2].forEach((t, i) => battement(out, sr, t, 0.55 + 0.05 * (i % 2), rnd, { fc: 620, boucle: Ln }));
  } else if (f === 'ballon') {
    // Les cordes de la nacelle qui grincent doucement.
    [0.9, 2.7].forEach((t) => {
      const s0 = Math.round(t * sr), n = Math.round(0.25 * sr);
      let ph = 0;
      for (let i = 0; i < n; i += 1) {
        const q = i / n;
        ph += (2 * Math.PI * (720 - 160 * q)) / sr;
        out[(s0 + i) % Ln] += Math.sin(ph) * 0.05 * Math.sin(Math.PI * q) * (0.7 + 0.3 * rnd());
      }
    });
  } else if (f === 'lumiere') {
    // Un accord qui frémit (des battements d'un quart de hertz : un tour par boucle).
    for (const fr of [880, 1108.75, 1318.5, 1760]) {
      const w1 = (2 * Math.PI * fr) / sr, w2 = (2 * Math.PI * (fr + 0.25)) / sr;
      for (let i = 0; i < Ln; i += 1) out[i] += (Math.sin(w1 * i) + Math.sin(w2 * i + 1)) * 0.035;
    }
    [0.5, 2.5].forEach((t) => battement(out, sr, t, 0.3, rnd, { fc: 1400, boucle: Ln }));
  }
  return fermer(out, sr);
}
function rendrePose(f, sr) {
  const rnd = graine(0x7ba00 + AVIATEURS.indexOf(f));
  const out = vide(1.4, sr);
  if (f === 'icare') {
    battement(out, sr, 0.02, 0.7, rnd, { fc: 600, duree: 0.35 });
    battement(out, sr, 0.38, 0.45, rnd, { fc: 520, duree: 0.4 });
    sourd(out, sr, 0.78, 95, 0.6, 0.06);
    bruit(out, sr, 0.78, 0.05, () => 300, () => 1500, (q) => 0.5 * (1 - q), rnd);
    glisse(out, sr, 0.85, 0.25, 1500, 5000, 0.15, rnd);
  } else if (f === 'ballon') {
    sourd(out, sr, 0.1, 80, 0.8, 0.07);
    for (let i = 0; i < 4; i += 1) choc(out, sr, 0.1 + 0.25 * rnd(), 'bois', 0.15 + 0.15 * rnd(), rnd, 0.6 + 0.4 * rnd());
    glisse(out, sr, 0.15, 0.3, 300, 1500, 0.2, rnd);
    sourd(out, sr, 0.45, 75, 0.35, 0.06);
  } else if (f === 'delta') {
    bruit(out, sr, 0.05, 0.45, () => 300, (q) => 2500 - 1500 * q, (q) => 0.5 * (1 - q), rnd);
    sourd(out, sr, 0.05, 90, 0.5, 0.05);
    glisse(out, sr, 0.6, 0.15, 500, 2500, 0.2, rnd);
  } else {
    [2637, 2217, 1760, 1319].forEach((fr, i) => modes(out, sr, 0.02 + i * 0.1, fr, CRISTAL, 0.4, { duree: 0.5 }));
    glisse(out, sr, 0.1, 0.6, 5000, 1200, 0.12, rnd);
  }
  return finir(out, sr, 0.35, 0.1, 0.12);
}
// La chute : le coup de soleil (la cire s'embrase), l'air qui siffle en descendant, la fin.
function rendreBrule(f, sr) {
  const rnd = graine(0x7bb00 + AVIATEURS.indexOf(f));
  const out = vide(2.8, sr);
  if (f === 'lumiere') {
    // La lumière se brise : des éclats de verre, de plus en plus rares.
    for (let i = 0; i < 20; i += 1) {
      const t = 0.06 + 0.75 * Math.pow(rnd(), 1.6);
      choc(out, sr, t, 'cristal', 0.15 + 0.35 * rnd() * (1 - t), rnd, 1 + 1.5 * rnd());
    }
  } else {
    bruit(out, sr, 0, 0.7, () => 200, (q) => 2500 * (1 - 0.5 * q), (q) => 0.9 * (q < 0.05 ? q / 0.05 : Math.pow(1 - q, 2)), rnd);
    for (let i = 0; i < 22; i += 1) {
      const t = 0.05 + 0.85 * Math.pow(rnd(), 1.4);
      frappe(out, sr, t, 0.1 * rnd(), rnd, 0.0008);
      choc(out, sr, t, 'bois', 0.04 + 0.05 * rnd(), rnd, 2 + rnd());
    }
  }
  // L'air qui file en descendant.
  bruit(out, sr, 0.35, 1.7, (q) => 300 - 100 * q, (q) => 2200 - 1500 * q, (q) => 0.45 * Math.sin(Math.PI * Math.min(1, q / 0.7) * 0.5) * (q > 0.85 ? (1 - q) / 0.15 : 1), rnd);
  if (f === 'icare') {
    // La mer : le plouf, quelques bulles.
    sourd(out, sr, 2.05, 70, 0.8, 0.09);
    bruit(out, sr, 2.05, 0.5, () => 300, () => 2600, (q) => 0.7 * (1 - q) * (1 - q), rnd);
    for (let i = 0; i < 4; i += 1) {
      const s0 = Math.round((2.12 + 0.08 * i + 0.03 * rnd()) * sr), n = Math.round(0.04 * sr);
      let ph = 0;
      for (let j = 0; j < n && s0 + j < out.length; j += 1) {
        ph += (2 * Math.PI * (400 + 500 * (j / n))) / sr;
        out[s0 + j] += Math.sin(ph) * 0.12 * Math.sin((Math.PI * j) / n);
      }
    }
  } else if (f === 'ballon') {
    glisse(out, sr, 0.25, 0.35, 800, 6000, 0.5, rnd);
    sourd(out, sr, 2.05, 80, 0.7, 0.08);
    for (let i = 0; i < 5; i += 1) choc(out, sr, 2.05 + 0.15 * rnd(), 'bois', 0.3 + 0.3 * rnd(), rnd, 0.6 + 0.5 * rnd());
  } else if (f === 'delta') {
    frappe(out, sr, 0.3, 0.3, rnd, 0.002);
    choc(out, sr, 0.3, 'bois', 1, rnd, 0.7);
    sourd(out, sr, 2.05, 85, 0.6, 0.07);
    bruit(out, sr, 2.05, 0.3, () => 400, () => 2500, (q) => 0.5 * (1 - q) * (1 - q), rnd);
  } else {
    const s0 = Math.round(0.3 * sr), n = Math.round(1.8 * sr);
    let ph = 0;
    for (let i = 0; i < n; i += 1) {
      const q = i / n;
      ph += (2 * Math.PI * 1760 * Math.pow(0.25, q)) / sr;
      out[s0 + i] += Math.sin(ph) * 0.08 * (1 - q);
    }
  }
  return finir(out, sr, 0.4, 0.12, 0.2);
}

// ── Le catalogue ────────────────────────────────────────────────────────────────
const NOMS = [];
for (const m of ROUES) NOMS.push(`roue-${m}`);
for (const m of PISTES) NOMS.push(`stalles-${m}`, `galop-${m}`, `arrivee-${m}`);
NOMS.push('photo', 'manche-gagnee', 'manche-perdue');
for (const f of AVIATEURS) NOMS.push(`envol-${f}`, `vol-${f}`, `pose-${f}`, `brule-${f}`);
export const SONS_SCENES = NOMS;

export function rendreScene(nom, sr) {
  const m = /^([a-z]+)-([a-z]+)$/.exec(nom);
  if (m) {
    const [, quoi, mat] = m;
    if (quoi === 'roue' && ROUES.includes(mat)) return rendreRoue(mat, sr);
    if (quoi === 'stalles' && PISTES.includes(mat)) return rendreStalles(mat, sr);
    if (quoi === 'galop' && PISTES.includes(mat)) return rendreGalop(mat, sr);
    if (quoi === 'arrivee' && PISTES.includes(mat)) return rendreArrivee(mat, sr);
    if (quoi === 'envol' && AVIATEURS.includes(mat)) return rendreEnvol(mat, sr);
    if (quoi === 'vol' && AVIATEURS.includes(mat)) return rendreVol(mat, sr);
    if (quoi === 'pose' && AVIATEURS.includes(mat)) return rendrePose(mat, sr);
    if (quoi === 'brule' && AVIATEURS.includes(mat)) return rendreBrule(mat, sr);
  }
  if (nom === 'photo') return rendrePhoto(sr);
  if (nom === 'manche-gagnee') return rendreManche(true, sr);
  if (nom === 'manche-perdue') return rendreManche(false, sr);
  return null;
}
