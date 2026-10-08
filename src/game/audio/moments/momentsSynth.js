// LES SONS DES GRANDS MOMENTS (docs/PLAN-AMBIANCE-SONORE.md, lot 7) — la SYNTHÈSE,
// pure : chaque son est rendu par le code, à graine fixe (le même son à chaque rendu,
// dans le Worker des sons comme sur la page). La lecture vit dans moments.js.
//
//   · `grondement`               la boucle sourde sous la chute (6 s) ;
//   · `effondrement-<m>-<n>`     un bâtiment qui s'écroule, selon la MATIÈRE de l'âge :
//                                bois (Feu, Bois), pierre (Pierre taillée à Marbre),
//                                metal (Fonte, Néon : fer, verre, gravats), cosmique ;
//   · `gravats-<n>`              les pierres qui roulent encore après la vague ;
//   · `glas`                     un coup de grosse cloche, au deuil ;
//   · `age-<b>`, `epoque-<b>`    le passage à un nouvel âge, à une nouvelle époque : la
//                                frappe de l'époque (tambour, bois, pierre, bronze, gong,
//                                fer, carillon électrique, cristal) ;
//   · `merveille-<b>`, `rang-<b>` une merveille érigée, une merveille qui monte d'un rang :
//                                la pierre posée, puis la frappe de l'âge (de la famille
//                                du nouvel âge) ;
//   · `batiment-<m>-<n>`         une maison qui sort de terre (achat à la main) ;
//   · `sceau`, `renouveau`       le Grand Reset réclamé, puis la cité neuve ;
//   · L'INTERFACE (lot 8) : `achat-<m>-<n>` un achat à la main, `bulle-<or|savoir|
//     nourriture>` la bulle d'un passant cueillie, `succes` un succès, `crise-<1|2>`
//     la Rupture qui franchit 75 %, puis 90 %.
//
// Aucune voix, aucun mot ; rien d'emprunté : du bruit filtré, des partiels, des cloches.

import { graine, partiels, tambour, cloche, salle, normaliser } from '../synth.js';

export const MOMENTS_SR = 32000;

// La matière qui tombe ou qui se bâtit, selon la bande d'âge (data/eraThemes.js).
export function matiereDe(bande) {
  const b = bande | 0;
  return b <= 1 ? 'bois' : b <= 4 ? 'pierre' : b <= 6 ? 'metal' : 'cosmique';
}
export const MATIERES = ['bois', 'pierre', 'metal', 'cosmique'];

// ── Les briques ─────────────────────────────────────────────────────────────────

// Un résonateur à deux pôles (un mode d'un objet qui sonne) appliqué à un signal
// d'excitation `x` (Float32Array), ajouté dans `out` à partir de s0. `f` en Hz, `amort`
// en 1/s (plus grand, plus court).
function resonner(out, sr, s0, x, f, amort, g) {
  const r = Math.exp(-amort / sr), w = (2 * Math.PI * f) / sr;
  const a1 = 2 * r * Math.cos(w), a2 = -r * r;
  // Gain ramené à 1 à sa fréquence (≈ 1 / (2 (1 − r) sin w)) : sinon un mode grave
  // sonnerait vingt fois plus fort qu'un aigu.
  const k = g * (1 - r) * 2 * Math.max(0.03, Math.sin(w));
  let y1 = 0, y2 = 0;
  const n = Math.min(out.length - s0, x.length);
  for (let i = 0; i < n; i += 1) {
    const y = x[i] + a1 * y1 + a2 * y2;
    y2 = y1; y1 = y;
    out[s0 + i] += y * k;
  }
}

// Un grain : un souffle de bruit très court qui fait sonner un petit objet (un
// caillou, un éclat de bois, un tesson) à `f`.
function grain(out, sr, t, f, g, rnd, { long = 0.012, amort = 90 } = {}) {
  const s0 = Math.round(t * sr);
  if (s0 >= out.length) return;
  const nx = Math.max(8, Math.round(long * sr)), nr = Math.round(Math.min(0.25, 6 / amort) * sr);
  const x = new Float32Array(nx + nr);
  for (let i = 0; i < nx; i += 1) x[i] = (rnd() * 2 - 1) * (1 - i / nx);
  resonner(out, sr, s0, x, f, amort, g);
}

// Une pluie de grains dont la densité s'éteint (exponentielle de constante `tau`) :
// les débris qui suivent un choc. Fréquences tirées en log entre fMin et fMax.
function debris(out, sr, t, dur, g, rnd, { fMin = 400, fMax = 3200, densite = 120, tau = 0.4, amort = 80, long = 0.01 } = {}) {
  const lmin = Math.log(fMin), lmax = Math.log(fMax);
  let tt = 0;
  while (tt < dur) {
    const taux = densite * Math.exp(-tt / tau) + 2;
    tt += -Math.log(1 - rnd() * 0.999) / taux;
    if (tt >= dur) break;
    const f = Math.exp(lmin + (lmax - lmin) * rnd());
    const a = g * (0.25 + 0.75 * rnd()) * Math.exp(-tt / (tau * 2.5));
    grain(out, sr, t + tt, f, a, rnd, { amort: amort * (0.7 + 0.6 * rnd()), long: long * (0.5 + rnd()) });
  }
}

// Le choc sourd d'une masse qui tombe : un sinus qui plonge (de `haut` à `bas` Hz) et
// un bruit grave qui s'éteint, son filtre se refermant.
function impact(out, sr, t, g, rnd, { haut = 90, bas = 38, duree = 0.45, bruit = 0.8, ouvert = 1800 } = {}) {
  const s0 = Math.round(t * sr), n = Math.min(out.length - s0, Math.round(duree * sr));
  let ph = 0, lp = 0;
  for (let i = 0; i < n; i += 1) {
    const tt = i / sr;
    ph += (2 * Math.PI * (bas + (haut - bas) * Math.exp(-tt * 14))) / sr;
    const fc = 120 + ouvert * Math.exp(-tt * 18);
    const k = 1 - Math.exp((-2 * Math.PI * fc) / sr);
    lp += k * ((rnd() * 2 - 1) - lp);
    const att = Math.min(1, i / (0.002 * sr));
    out[s0 + i] += (Math.sin(ph) * Math.exp(-tt * 7) + lp * bruit * 1.6 * Math.exp(-tt * 9)) * g * att;
  }
}

// Le craquement du bois : une grappe de claquements secs, chacun faisant sonner la
// fibre entre 700 Hz et 2,6 kHz.
function craquement(out, sr, t, g, rnd, { nombre = 9, etale = 0.09 } = {}) {
  for (let k = 0; k < nombre; k += 1) {
    const tk = t + etale * Math.pow(rnd(), 1.6);
    const f = 700 + 1900 * rnd();
    grain(out, sr, tk, f, g * (0.4 + 0.6 * rnd()), rnd, { long: 0.0015, amort: 160 + 120 * rnd() });
  }
}

// Des partiels qui sonnent ensemble : `liste` = [ratio, amplitude, amortissement 1/s].
export function modes(out, sr, t, f, liste, g, { duree = 1.5, attaque = 0.002 } = {}) {
  partiels(out, sr, t, liste.map(([r, a, d]) => ({ f: f * r, a, d })).filter((p) => p.f < sr / 2.3), duree, g, { attaque, relache: 0.05, etouffe: 2 });
}

// Le métal frappé (fer, tôle) : des modes inharmoniques.
const FER = [[1, 1, 3.5], [1.59, 0.7, 4.5], [2.14, 0.55, 5.5], [2.65, 0.45, 7], [3.38, 0.35, 8], [4.21, 0.25, 11], [5.4, 0.15, 14]];
// La grosse cloche d'église : le bourdon (½), la fondamentale, la tierce mineure, la
// quinte, la nominale, puis des partiels aigus qui meurent vite.
const BRONZE = [[0.5, 0.55, 0.28], [1, 1, 0.55], [1.19, 0.6, 0.8], [1.5, 0.35, 1.1], [2, 0.7, 0.9], [2.51, 0.3, 1.8], [2.66, 0.25, 2.2], [3.01, 0.22, 2.6], [4.17, 0.15, 3.8], [5.43, 0.1, 5]];
// Le gong : des partiels serrés, qui s'épanouissent.
const GONG = [[1, 1, 0.5], [1.48, 0.7, 0.7], [2.16, 0.55, 0.9], [2.84, 0.45, 1.2], [3.6, 0.3, 1.6], [4.1, 0.25, 2], [5.3, 0.15, 3]];
// Une barre de bois (le tambour à fente), une dalle de pierre (le lithophone).
const BOIS = [[1, 1, 9], [2.76, 0.45, 18], [5.4, 0.2, 30]];
const PIERRE = [[1, 1, 3.2], [2.32, 0.5, 6], [4.25, 0.25, 10], [6.1, 0.12, 16]];
// Le verre, le cristal : presque harmoniques, longs.
const CRISTAL = [[1, 1, 0.9], [2.0, 0.35, 1.4], [3.01, 0.2, 2], [4.07, 0.12, 2.8], [5.15, 0.07, 3.6]];
// Les modes partagés avec les cloches de temple du paysage (paysage/paysageSynthLieux.js).
export const MODES = { FER, BRONZE, GONG, BOIS, PIERRE, CRISTAL };

// Le clic de la frappe (maillet, battant).
export function frappe(out, sr, t, g, rnd, longS = 0.003) {
  const s0 = Math.round(t * sr), n = Math.min(out.length - s0, Math.max(4, Math.round(longS * sr)));
  for (let i = 0; i < n; i += 1) out[s0 + i] += (rnd() * 2 - 1) * g * (1 - i / n);
}

// Le verre qui éclate : des tessons aigus, de plus en plus rares.
function tessons(out, sr, t, dur, g, rnd, { fMin = 2600, fMax = 8500, densite = 70 } = {}) {
  debris(out, sr, t, dur, g, rnd, { fMin, fMax, densite, tau: 0.25, amort: 28, long: 0.003 });
}

// Une montée de bruit filtré (un souffle qui enfle, `duree` s), son filtre s'ouvrant.
function souffleMontant(out, sr, t, duree, g, rnd, { fBas = 150, fHaut = 1400 } = {}) {
  const s0 = Math.round(t * sr), n = Math.min(out.length - s0, Math.round(duree * sr));
  let lp = 0, lp2 = 0;
  for (let i = 0; i < n; i += 1) {
    const q = i / n;
    const fc = fBas + (fHaut - fBas) * q * q;
    const k = 1 - Math.exp((-2 * Math.PI * fc) / sr);
    lp += k * ((rnd() * 2 - 1) - lp);
    lp2 += k * (lp - lp2);
    out[s0 + i] += lp2 * g * q * q * 2.2;
  }
}

const vide = (sec, sr) => new Float32Array(Math.round(sec * sr));

// ── La chute ────────────────────────────────────────────────────────────────────

// Le grondement : une boucle de 6 s, un bruit grave qui roule (des houles lentes), en
// deux bandes : le fond, de 35 à 110 Hz, et le CORPS, de 110 à 400 Hz — celui que les
// haut-parleurs d'un portable rendent encore. Bouclé en fondu croisé d'une demi-seconde.
const coef = (fc, sr) => 1 - Math.exp((-2 * Math.PI * fc) / sr);
function rendreGrondement(sr) {
  const duree = 6, fondu = 0.5, n = Math.round((duree + fondu) * sr);
  const rnd = graine(7001);
  const x = new Float32Array(n);
  const k110 = coef(110, sr), k35 = coef(35, sr), k400 = coef(400, sr);
  let a1 = 0, a2 = 0, ah = 0, b1 = 0, b2 = 0, bh = 0;
  // Des houles lentes : une somme de sinus aux périodes de 1,3 à 4,2 s.
  const houles = [[0.24, rnd()], [0.43, rnd()], [0.77, rnd()]];
  for (let i = 0; i < n; i += 1) {
    const tt = i / sr, w = rnd() * 2 - 1;
    // Le fond : deux passe-bas à 110 Hz, puis on retire ce qui est sous 35 Hz.
    a1 += k110 * (w - a1); a2 += k110 * (a1 - a2); ah += k35 * (a2 - ah);
    // Le corps : deux passe-bas à 400 Hz, moins ce qui est sous 110 Hz.
    b1 += k400 * (w - b1); b2 += k400 * (b1 - b2); bh += k110 * (b2 - bh);
    let h = 0;
    for (const [f, p] of houles) h += Math.sin(2 * Math.PI * (f * tt + p));
    const roule = 0.6 + 0.4 * (h / houles.length);
    x[i] = ((a2 - ah) * 2 + (b2 - bh)) * roule;
  }
  // Fondu croisé : la queue revient sur la tête, la boucle ne claque pas.
  const nb = Math.round(duree * sr), nf = Math.round(fondu * sr);
  const out = new Float32Array(nb);
  for (let i = 0; i < nb; i += 1) out[i] = x[i];
  for (let i = 0; i < nf; i += 1) {
    const a = i / nf;
    out[i] = x[i] * Math.sqrt(a) + x[nb + i] * Math.sqrt(1 - a);
  }
  return normaliser(out, sr, 0.8, 0);
}

// Un effondrement, selon la matière. `v` (1 à 3) : la variante (graine, durées).
function rendreEffondrement(m, v, sr) {
  const rnd = graine(7100 + MATIERES.indexOf(m) * 17 + v * 3);
  const out = vide(2.6, sr);
  const t0 = 0.04;
  if (m === 'bois') {
    // Le craquement des poutres, puis la chute, puis le bois qui rebondit.
    craquement(out, sr, t0, 0.9, rnd, { nombre: 7 + v * 2, etale: 0.12 });
    impact(out, sr, t0 + 0.13, 0.75, rnd, { haut: 120, bas: 55, duree: 0.35, bruit: 0.6, ouvert: 1400 });
    debris(out, sr, t0 + 0.15, 1.3, 0.5, rnd, { fMin: 180, fMax: 900, densite: 55, tau: 0.3, amort: 45, long: 0.012 });
    craquement(out, sr, t0 + 0.35 + 0.1 * v, 0.4, rnd, { nombre: 4, etale: 0.2 });
  } else if (m === 'pierre') {
    // Un premier lâcher de pierres, le gros choc, les gravats qui coulent.
    debris(out, sr, t0, 0.12, 0.25, rnd, { fMin: 600, fMax: 2400, densite: 140, tau: 0.08 });
    impact(out, sr, t0 + 0.08, 1, rnd, { haut: 85, bas: 36, duree: 0.6, bruit: 1, ouvert: 1500 });
    debris(out, sr, t0 + 0.1, 1.9, 0.55, rnd, { fMin: 300, fMax: 3200, densite: 170, tau: 0.42, amort: 70 });
    impact(out, sr, t0 + 0.32 + 0.12 * v, 0.45, rnd, { haut: 70, bas: 40, duree: 0.4, bruit: 0.8, ouvert: 900 });
  } else if (m === 'metal') {
    // La charpente de fer qui cède, le verre des fenêtres, le béton.
    impact(out, sr, t0, 0.9, rnd, { haut: 95, bas: 40, duree: 0.5, bruit: 0.9, ouvert: 2000 });
    modes(out, sr, t0 + 0.02, 230 + 70 * v, FER, 0.32, { duree: 1.8 });
    tessons(out, sr, t0 + 0.05, 1.2, 0.35, rnd);
    debris(out, sr, t0 + 0.1, 1.6, 0.4, rnd, { fMin: 350, fMax: 2800, densite: 120, tau: 0.38 });
    modes(out, sr, t0 + 0.45 + 0.08 * v, 410 + 40 * v, FER, 0.14, { duree: 1 });
  } else {
    // L'âge cosmique : un choc mat, des éclats de cristal, l'énergie qui s'éteint.
    impact(out, sr, t0, 0.55, rnd, { haut: 110, bas: 50, duree: 0.4, bruit: 0.4, ouvert: 1200 });
    tessons(out, sr, t0 + 0.02, 1.5, 0.45, rnd, { fMin: 1800, fMax: 7000, densite: 90 });
    const s0 = Math.round((t0 + 0.05) * sr), n = Math.min(out.length - s0, Math.round(0.9 * sr));
    let ph = 0;
    for (let i = 0; i < n; i += 1) {
      const q = i / n;
      ph += (2 * Math.PI * (900 * Math.pow(0.13, q))) / sr;
      out[s0 + i] += Math.sin(ph) * 0.18 * (1 - q) * Math.min(1, i / (0.01 * sr));
    }
    modes(out, sr, t0 + 0.08, 660 + 110 * v, CRISTAL, 0.12, { duree: 1.6 });
  }
  return normaliser(salle(out, sr, 0.35, 0.18), sr, 0.8, 0.12);
}

// Les gravats après la vague : des pierres qui roulent encore, éparses, et un dernier
// petit choc.
function rendreGravats(v, sr) {
  const rnd = graine(7300 + v * 11);
  const out = vide(2.4, sr);
  debris(out, sr, 0.02, 2.1, 0.6, rnd, { fMin: 350, fMax: 2600, densite: 26 + 6 * v, tau: 0.9, amort: 60, long: 0.008 });
  impact(out, sr, 0.5 + 0.35 * v, 0.25, rnd, { haut: 70, bas: 45, duree: 0.25, bruit: 0.6, ouvert: 700 });
  return normaliser(out, sr, 0.8, 0.15);
}

// Le glas : un coup de grosse cloche (la au grave), son bourdon long.
function rendreGlas(sr) {
  const rnd = graine(7400);
  const out = vide(7, sr);
  frappe(out, sr, 0.01, 0.35, rnd, 0.004);
  modes(out, sr, 0.01, 110, BRONZE, 0.5, { duree: 6.5 });
  return normaliser(salle(out, sr, 0.8, 0.28), sr, 0.8, 0.6);
}

// ── Le passage à un nouvel âge ──────────────────────────────────────────────────
// La frappe de chaque époque, et sa hauteur (les époques montent doucement : ré, la).
const FRAPPES = [
  // 0 Feu : deux coups de grand tambour.
  (out, sr, t, g, rnd) => { tambour(out, sr, t, g, rnd, { haut: 120, bas: 52, sec: 6, frappe: 0.35 }); tambour(out, sr, t + 0.22, g * 0.6, rnd, { haut: 110, bas: 50, sec: 7, frappe: 0.3 }); },
  // 1 Bois : le tambour à fente, deux notes.
  (out, sr, t, g, rnd) => { frappe(out, sr, t, g * 0.25, rnd); modes(out, sr, t, 196, BOIS, g); frappe(out, sr, t + 0.16, g * 0.2, rnd); modes(out, sr, t + 0.16, 294, BOIS, g * 0.75); },
  // 2 Pierre taillée : le lithophone.
  (out, sr, t, g, rnd) => { frappe(out, sr, t, g * 0.2, rnd); modes(out, sr, t, 294, PIERRE, g, { duree: 1.8 }); modes(out, sr, t + 0.2, 440, PIERRE, g * 0.6, { duree: 1.6 }); },
  // 3 Couronne : une cloche de bronze.
  (out, sr, t, g, rnd) => { frappe(out, sr, t, g * 0.2, rnd); modes(out, sr, t, 294, BRONZE, g, { duree: 2.4 }); },
  // 4 Marbre : un gong de temple, qui s'épanouit.
  (out, sr, t, g) => { modes(out, sr, t, 147, GONG, g, { duree: 2.8, attaque: 0.06 }); },
  // 5 Fonte : la cloche de fer d'une fabrique.
  (out, sr, t, g, rnd) => { frappe(out, sr, t, g * 0.3, rnd); modes(out, sr, t, 330, FER, g * 0.8, { duree: 2 }); },
  // 6 Néon : un carillon électrique, deux tons.
  (out, sr, t, g) => { cloche(out, sr, t, 587, 0.8, g * 0.6, { ratio: 2.0, indice: 1.6, tenue: 2.2 }); cloche(out, sr, t + 0.2, 440, 1, g * 0.6, { ratio: 2.0, indice: 1.6, tenue: 1.8 }); },
  // 7 Noosphère, 8 stellaire, 9 Démiurge : le cristal, de plus en plus haut et clair.
  (out, sr, t, g) => { modes(out, sr, t, 587, CRISTAL, g, { duree: 2.6 }); modes(out, sr, t + 0.18, 880, CRISTAL, g * 0.5, { duree: 2.4 }); },
  (out, sr, t, g) => { modes(out, sr, t, 659, CRISTAL, g, { duree: 2.8 }); modes(out, sr, t + 0.16, 988, CRISTAL, g * 0.5, { duree: 2.6 }); },
  (out, sr, t, g) => { modes(out, sr, t, 740, CRISTAL, g, { duree: 3 }); modes(out, sr, t + 0.14, 1109, CRISTAL, g * 0.5, { duree: 2.8 }); },
];
const SALLE_AGE = [0.5, 0.4, 0.55, 0.6, 0.75, 0.45, 0.4, 0.9, 0.95, 1];

// Un nouvel âge : une frappe, discrète.
function rendreAge(b, sr) {
  const rnd = graine(7500 + b);
  const out = vide(3.2, sr);
  FRAPPES[b](out, sr, 0.01, 0.7, rnd);
  return normaliser(salle(out, sr, SALLE_AGE[b], 0.22), sr, 0.8, 0.5);
}
// Une nouvelle époque : un bourdon qui monte, puis trois frappes qui s'élèvent.
function rendreEpoque(b, sr) {
  const rnd = graine(7600 + b);
  const out = vide(5.6, sr);
  const f0 = [73.4, 73.4, 98, 110, 73.4, 110, 146.8, 146.8, 164.8, 185][b];
  partiels(out, sr, 0, [{ f: f0, a: 1, d: 0 }, { f: f0 * 1.5, a: 0.4, d: 0 }, { f: f0 * 2.003, a: 0.3, d: 0 }], 3.4, 0.22,
    { attaque: 1.2, relache: 1.2, etouffe: 2.2 });
  for (const [t, g] of [[0.55, 0.55], [1.15, 0.7], [1.8, 0.9]]) FRAPPES[b](out, sr, t, g, rnd);
  return normaliser(salle(out, sr, Math.min(1, SALLE_AGE[b] + 0.15), 0.3), sr, 0.8, 0.8);
}

// ── Les merveilles ──────────────────────────────────────────────────────────────
// De la famille du nouvel âge (Raph, 2026-10-08) : la frappe de l'âge, après la pierre
// qu'on pose (un choc sourd et grave, le grain de la pierre).
function pierrePosee(out, sr, t, g, rnd) {
  impact(out, sr, t, g, rnd, { haut: 85, bas: 42, duree: 0.5, bruit: 0.55, ouvert: 900 });
}
// Une merveille ÉRIGÉE : la pierre posée, un bourdon qui monte, deux frappes de l'âge.
function rendreMerveille(b, sr) {
  const rnd = graine(7650 + b);
  const out = vide(5.2, sr);
  const f0 = [73.4, 73.4, 98, 110, 73.4, 110, 146.8, 146.8, 164.8, 185][b];
  pierrePosee(out, sr, 0.01, 0.75, rnd);
  partiels(out, sr, 0.15, [{ f: f0, a: 1, d: 0 }, { f: f0 * 1.5, a: 0.35, d: 0 }, { f: f0 * 2.003, a: 0.3, d: 0 }], 2.6, 0.2,
    { attaque: 0.9, relache: 1.1, etouffe: 2.2 });
  FRAPPES[b](out, sr, 0.5, 0.7, rnd);
  FRAPPES[b](out, sr, 1.15, 0.9, rnd);
  return normaliser(salle(out, sr, Math.min(1, SALLE_AGE[b] + 0.15), 0.3), sr, 0.8, 0.8);
}
// Une merveille qui monte d'un RANG : la pierre, une frappe.
function rendreRang(b, sr) {
  const rnd = graine(7680 + b);
  const out = vide(3.2, sr);
  pierrePosee(out, sr, 0.01, 0.55, rnd);
  FRAPPES[b](out, sr, 0.16, 0.75, rnd);
  return normaliser(salle(out, sr, SALLE_AGE[b], 0.22), sr, 0.8, 0.5);
}

// ── La maison qui sort de terre ─────────────────────────────────────────────────
function rendreBatiment(m, v, sr) {
  const rnd = graine(7700 + MATIERES.indexOf(m) * 13 + v);
  const out = vide(0.9, sr);
  if (m === 'bois') {
    // Le maillet sur le bois : toc, ou toc-toc.
    frappe(out, sr, 0.005, 0.5, rnd, 0.002);
    modes(out, sr, 0.005, 210 + 25 * v, BOIS, 0.8, { duree: 0.4 });
    if (v === 2) { frappe(out, sr, 0.13, 0.35, rnd, 0.002); modes(out, sr, 0.13, 250, BOIS, 0.55, { duree: 0.35 }); }
  } else if (m === 'pierre') {
    // Un bloc posé : un choc mat, et le grain de la pierre.
    impact(out, sr, 0.005, 0.8, rnd, { haut: 150, bas: 80, duree: 0.2, bruit: 0.7, ouvert: 1600 });
    debris(out, sr, 0.02, 0.18, 0.35, rnd, { fMin: 700, fMax: 2600, densite: 90, tau: 0.06, amort: 110 });
    modes(out, sr, 0.01, 520 + 60 * v, PIERRE, 0.12, { duree: 0.4 });
  } else if (m === 'metal') {
    // Le marteau sur le fer.
    frappe(out, sr, 0.005, 0.5, rnd, 0.0015);
    modes(out, sr, 0.005, 520 + 90 * v, FER.map(([r, a, d]) => [r, a, d * 3]), 0.5, { duree: 0.6 });
  } else {
    // L'âge cosmique : une note de cristal qui se pose, après un souffle qui monte.
    const s0 = 0, n = Math.round(0.14 * sr);
    let ph = 0;
    for (let i = 0; i < n; i += 1) {
      const q = i / n;
      ph += (2 * Math.PI * (420 + 780 * q)) / sr;
      out[s0 + i] += Math.sin(ph) * 0.12 * q;
    }
    modes(out, sr, 0.13, v === 2 ? 1175 : 988, CRISTAL, 0.5, { duree: 0.7 });
  }
  return normaliser(salle(out, sr, 0.3, 0.12), sr, 0.8, 0.08);
}

// ── Le Grand Reset ──────────────────────────────────────────────────────────────
// Le sceau réclamé : un souffle qui enfle, puis le grand gong, très grave.
function rendreSceau(sr) {
  const rnd = graine(7800);
  const out = vide(6.5, sr);
  souffleMontant(out, sr, 0, 0.95, 0.5, rnd);
  frappe(out, sr, 0.95, 0.25, rnd, 0.006);
  modes(out, sr, 0.95, 61.7, GONG, 1, { duree: 5.2, attaque: 0.08 });
  return normaliser(salle(out, sr, 0.95, 0.32), sr, 0.8, 0.8);
}
// La cité neuve : trois notes claires qui montent, sur un léger bourdon.
function rendreRenouveau(sr) {
  const rnd = graine(7900);
  const out = vide(4.2, sr);
  partiels(out, sr, 0, [{ f: 146.8, a: 1, d: 0 }, { f: 220, a: 0.5, d: 0 }], 2.6, 0.12, { attaque: 0.8, relache: 1, etouffe: 2.5 });
  for (const [t, f, g] of [[0.2, 294, 0.45], [0.55, 440, 0.4], [0.95, 587, 0.35]]) {
    frappe(out, sr, t, g * 0.15, rnd, 0.002);
    modes(out, sr, t, f, CRISTAL, g, { duree: 2.2 });
  }
  return normaliser(salle(out, sr, 0.8, 0.3), sr, 0.7, 0.6);
}

// ── L'interface (lot 8) ─────────────────────────────────────────────────────────
// Un achat à la main : un « toc » léger, plus petit que la maison qui sort de terre.
function rendreAchat(m, v, sr) {
  const rnd = graine(8100 + MATIERES.indexOf(m) * 7 + v);
  const out = vide(0.45, sr);
  const plus = (liste, k) => liste.map(([r, a, d]) => [r, a, d * k]);
  if (m === 'bois') {
    frappe(out, sr, 0.004, 0.45, rnd, 0.001);
    modes(out, sr, 0.004, 430 + 50 * v, plus(BOIS, 1.4), 0.8, { duree: 0.25 });
  } else if (m === 'pierre') {
    impact(out, sr, 0.004, 0.5, rnd, { haut: 230, bas: 150, duree: 0.08, bruit: 0.5, ouvert: 2600 });
    modes(out, sr, 0.006, 760 + 70 * v, plus(PIERRE, 2.5), 0.4, { duree: 0.25 });
  } else if (m === 'metal') {
    frappe(out, sr, 0.004, 0.4, rnd, 0.001);
    modes(out, sr, 0.004, 930 + 110 * v, plus(FER, 5), 0.45, { duree: 0.3 });
  } else {
    modes(out, sr, 0.004, v === 2 ? 1760 : 1568, plus(CRISTAL, 2.2), 0.6, { duree: 0.35 });
  }
  return normaliser(salle(out, sr, 0.2, 0.08), sr, 0.8, 0.05);
}
// La bulle d'un passant, cueillie : des pièces (l'or), un parchemin (le savoir), du
// grain (la nourriture). On en cueille souvent : un geste BREF, ~0,3 s, presque sans
// écho (Raph, 2026-10-08 : « trop longs, plus court et moins fort »).
const PIECE = [[1, 1, 11], [1.53, 0.7, 14], [2.27, 0.5, 18], [2.9, 0.35, 24]];
const vite = (liste, k) => liste.map(([r, a, d]) => [r, a, d * k]);
function rendreBulle(type, sr) {
  const rnd = graine(8200 + ['or', 'savoir', 'nourriture'].indexOf(type));
  const out = vide(0.36, sr);
  if (type === 'or') {
    // Deux pièces qui se touchent.
    for (const [t, f, g] of [[0.005, 2350, 0.8], [0.06, 2490, 0.55]]) {
      frappe(out, sr, t, g * 0.3, rnd, 0.0008);
      modes(out, sr, t, f, vite(PIECE, 2.5), g, { duree: 0.12 });
    }
  } else if (type === 'savoir') {
    // Le parchemin qu'on effleure, une petite note claire.
    debris(out, sr, 0.005, 0.1, 0.5, rnd, { fMin: 1500, fMax: 6500, densite: 260, tau: 0.05, amort: 220, long: 0.003 });
    modes(out, sr, 0.07, 1175, vite(CRISTAL, 9), 0.4, { duree: 0.12 });
  } else {
    // Une poignée de grain, le sac qu'on pose.
    debris(out, sr, 0.005, 0.16, 0.55, rnd, { fMin: 2200, fMax: 7500, densite: 420, tau: 0.07, amort: 180, long: 0.002 });
    impact(out, sr, 0.14, 0.35, rnd, { haut: 170, bas: 95, duree: 0.1, bruit: 0.35, ouvert: 900 });
  }
  return normaliser(salle(out, sr, 0.15, 0.04), sr, 0.8, 0.08);
}
// Un succès : quatre notes claires qui montent (ré, fa dièse, la, ré).
function rendreSucces(sr) {
  const rnd = graine(8300);
  const out = vide(2.4, sr);
  for (const [t, f, g] of [[0.005, 587, 0.7], [0.115, 740, 0.7], [0.23, 880, 0.75], [0.37, 1175, 0.55]]) {
    frappe(out, sr, t, g * 0.12, rnd, 0.001);
    modes(out, sr, t, f, CRISTAL, g, { duree: 1.4 });
    modes(out, sr, t, f, BRONZE.slice(1, 5), g * 0.25, { duree: 1 });
  }
  return normaliser(salle(out, sr, 0.6, 0.25), sr, 0.8, 0.5);
}
// L'alerte de crise : 1, la Rupture à 75 % (un coup de cloche grave) ; 2, à 90 %
// (deux coups, le second un triton plus bas, sur un grondement qui enfle).
function rendreCrise(n, sr) {
  const rnd = graine(8400 + n);
  const out = vide(n === 1 ? 4.2 : 5.4, sr);
  if (n === 2) souffleMontant(out, sr, 0, 1.2, 0.35, rnd, { fBas: 60, fHaut: 420 });
  const t0 = n === 2 ? 1.1 : 0.01;
  frappe(out, sr, t0, 0.25, rnd, 0.004);
  modes(out, sr, t0, 82.4, BRONZE, 0.9, { duree: 3.6 });
  if (n === 2) {
    frappe(out, sr, t0 + 1.15, 0.2, rnd, 0.004);
    modes(out, sr, t0 + 1.15, 58.3, BRONZE, 0.8, { duree: 3 });
  }
  return normaliser(salle(out, sr, 0.85, 0.3), sr, 0.8, 0.6);
}

// ── Le catalogue ────────────────────────────────────────────────────────────────
const NOMS = ['grondement', 'glas', 'sceau', 'renouveau'];
for (const m of MATIERES) for (const v of [1, 2, 3]) NOMS.push(`effondrement-${m}-${v}`);
for (const v of [1, 2, 3]) NOMS.push(`gravats-${v}`);
for (let b = 0; b <= 9; b += 1) NOMS.push(`age-${b}`, `epoque-${b}`);
for (let b = 0; b <= 9; b += 1) NOMS.push(`merveille-${b}`, `rang-${b}`);
for (const m of MATIERES) for (const v of [1, 2]) NOMS.push(`batiment-${m}-${v}`);
for (const m of MATIERES) for (const v of [1, 2]) NOMS.push(`achat-${m}-${v}`);
NOMS.push('bulle-or', 'bulle-savoir', 'bulle-nourriture', 'succes', 'crise-1', 'crise-2');
export const SONS_MOMENTS = NOMS;

export function rendreMoment(nom, sr = MOMENTS_SR) {
  if (nom === 'grondement') return rendreGrondement(sr);
  if (nom === 'glas') return rendreGlas(sr);
  if (nom === 'sceau') return rendreSceau(sr);
  if (nom === 'renouveau') return rendreRenouveau(sr);
  let m = /^effondrement-(bois|pierre|metal|cosmique)-([1-3])$/.exec(nom);
  if (m) return rendreEffondrement(m[1], Number(m[2]), sr);
  m = /^gravats-([1-3])$/.exec(nom);
  if (m) return rendreGravats(Number(m[1]), sr);
  m = /^(age|epoque)-([0-9])$/.exec(nom);
  if (m) return m[1] === 'age' ? rendreAge(Number(m[2]), sr) : rendreEpoque(Number(m[2]), sr);
  m = /^(merveille|rang)-([0-9])$/.exec(nom);
  if (m) return m[1] === 'merveille' ? rendreMerveille(Number(m[2]), sr) : rendreRang(Number(m[2]), sr);
  m = /^batiment-(bois|pierre|metal|cosmique)-([12])$/.exec(nom);
  if (m) return rendreBatiment(m[1], Number(m[2]), sr);
  m = /^achat-(bois|pierre|metal|cosmique)-([12])$/.exec(nom);
  if (m) return rendreAchat(m[1], Number(m[2]), sr);
  m = /^bulle-(or|savoir|nourriture)$/.exec(nom);
  if (m) return rendreBulle(m[1], sr);
  if (nom === 'succes') return rendreSucces(sr);
  m = /^crise-([12])$/.exec(nom);
  if (m) return rendreCrise(Number(m[1]), sr);
  return null;
}
