// LES SONS DES TABLES DE LA MAISON DES PLAISIRS (docs/PLAN-AMBIANCE-SONORE.md, lot 10) —
// la SYNTHÈSE, pure, à graine fixe (rendue dans le Worker des sons, comme les autres).
// La lecture vit dans tables.js.
//
// Chaque geste sonne dans la MATIÈRE de l'âge, celle que la table dessine :
//   · les JETONS (views/plaisirs/chipsArt.js) : os, bois, terre cuite, bronze, nacre,
//     argile des casinos, plastique, plaques de lumière ;
//   · les OSSELETS (plaisirsMaterial.js, diceSheetFor) : os, ivoire, dés de casino, dés
//     de lumière ;
//   · les CARTES (cardStyleFor) : bois, parchemin, papier, cristal ;
//   · les TICKETS (ticketFace) : tesson d'argile, planchette, parchemin, tessère de
//     bronze, billet imprimé, carte vernie, cristal.
//
//   jeton-<m>-<n>   un jeton posé (deux claquements, jeton contre jeton) ;
//   jetons-<m>      la pile qu'on reprend ou qu'on pousse (Effacer, Tapis) ;
//   des-<m>-lance   les osselets secoués puis lancés ; des-<m>-<n> : l'un retombe ;
//   carte-<m>-<n>   une carte qui glisse et se pose ; retourne-<m> : une carte retournée ;
//   melange-<m>     le battage d'un sabot neuf ;
//   gratte-<m>      le grattage (une boucle, que la vitesse du geste dose) ;
//   ticket-<m>      un ticket neuf posé ; case : une case dégagée ; revele : tout découvert ;
//   gain-petit, perte, egalite : le verdict d'un coup (les gros gains ont leur fanfare,
//                   GrandGain.jsx).
//
// Les briques (chocs, glissements) vivent dans briques.js ; les sons des scènes du lot 11
// (la roue, la piste, le duel, le ciel d'Icare) dans tablesSynthScenes.js.

import { graine, partiels, normaliser } from '../synth.js';
import { modes, frappe, MODES } from '../moments/momentsSynth.js';
import { choc, glisse, poids, vide, fini } from './briques.js';
import { rendreScene, SONS_SCENES } from './tablesSynthScenes.js';

export const TABLES_SR = 32000;
const { BOIS, CRISTAL } = MODES;

// ── Les matières, selon la bande d'âge (data/eraThemes.js) ──────────────────────
export const JETONS = ['os', 'bois', 'terre', 'bronze', 'nacre', 'argile', 'plastique', 'lumiere'];
export const DES = ['os', 'ivoire', 'casino', 'lumiere'];
export const CARTES = ['bois', 'parchemin', 'papier', 'cristal'];
export const TICKETS = ['argile', 'bois', 'papier', 'metal', 'vernis', 'cristal'];
const borne = (b) => Math.max(0, Math.min(9, b | 0));
export const matiereJeton = (b) => JETONS[Math.min(7, borne(b))];
export const matiereDes = (b) => { const x = borne(b); return x <= 3 ? 'os' : x <= 5 ? 'ivoire' : x === 6 ? 'casino' : 'lumiere'; };
export const matiereCartes = (b) => { const x = borne(b); return x <= 2 ? 'bois' : x <= 4 ? 'parchemin' : x <= 6 ? 'papier' : 'cristal'; };
export const matiereTicket = (b) => ['argile', 'bois', 'papier', 'papier', 'metal', 'papier', 'vernis', 'cristal', 'cristal', 'cristal'][borne(b)];

// ── Les jetons ──────────────────────────────────────────────────────────────────
function rendreJeton(m, v, sr) {
  const rnd = graine(0x7a100 + JETONS.indexOf(m) * 7 + v);
  const out = vide(0.3, sr);
  const k = v === 2 ? 1.07 : 1;
  choc(out, sr, 0.004, m, 1, rnd, k);
  choc(out, sr, 0.004 + 0.018 + 0.012 * v, m, 0.55, rnd, k * 1.04);
  return fini(out, sr);
}
function rendreJetons(m, sr) {
  const rnd = graine(0x7a200 + JETONS.indexOf(m));
  const out = vide(0.55, sr);
  glisse(out, sr, 0.01, 0.3, 500, 2600, 0.35, rnd);
  for (let i = 0; i < 8; i += 1) choc(out, sr, 0.02 + 0.3 * Math.pow(rnd(), 0.8), m, 0.4 + 0.5 * rnd(), rnd, 0.92 + 0.16 * rnd());
  return fini(out, sr);
}

// ── Les osselets ────────────────────────────────────────────────────────────────
// Secoués dans la main (de petits chocs serrés), puis lancés (un souffle).
function rendreLance(m, sr) {
  const rnd = graine(0x7a300 + DES.indexOf(m));
  const out = vide(0.5, sr);
  for (let i = 0; i < 11; i += 1) choc(out, sr, 0.01 + 0.26 * rnd(), m, 0.3 + 0.4 * rnd(), rnd, 0.9 + 0.2 * rnd());
  glisse(out, sr, 0.26, 0.16, 400, 1800, 0.25, rnd);
  return fini(out, sr);
}
// L'un retombe : la table, son choc, un ou deux rebonds.
function rendreTombe(m, v, sr) {
  const rnd = graine(0x7a400 + DES.indexOf(m) * 5 + v);
  const out = vide(0.4, sr);
  poids(out, sr, 0.004, m === 'casino' ? 0.55 : 0.4);
  choc(out, sr, 0.004, m, 1, rnd, 0.94 + 0.06 * v);
  choc(out, sr, 0.06 + 0.012 * v, m, 0.4, rnd, 1.05);
  if (v !== 2) choc(out, sr, 0.105 + 0.01 * v, m, 0.16, rnd, 1.1);
  return fini(out, sr);
}

// ── Les cartes ──────────────────────────────────────────────────────────────────
// Le grain du glissement selon la carte : la planchette, le parchemin, le papier, le verre.
const GLISSE = { bois: [400, 2200, 0.5], parchemin: [900, 3800, 0.55], papier: [1500, 6500, 0.6], cristal: [2500, 9000, 0.4] };
function rendreCarte(m, v, sr) {
  const rnd = graine(0x7a500 + CARTES.indexOf(m) * 5 + v);
  const out = vide(0.32, sr);
  const [a, b, g] = GLISSE[m];
  const d = 0.075 + 0.015 * v;
  glisse(out, sr, 0.004, d, a, b, g, rnd);
  choc(out, sr, 0.004 + d, m === 'papier' || m === 'parchemin' ? 'bois' : m, m === 'papier' ? 0.35 : 0.5, rnd, m === 'papier' ? 1.6 : 1);
  return fini(out, sr);
}
function rendreRetourne(m, sr) {
  const rnd = graine(0x7a600 + CARTES.indexOf(m));
  const out = vide(0.25, sr);
  const [, b, g] = GLISSE[m];
  glisse(out, sr, 0.004, 0.045, b * 0.4, b, g, rnd);
  choc(out, sr, 0.05, m === 'papier' || m === 'parchemin' ? 'bois' : m, 0.45, rnd, 1.3);
  return fini(out, sr);
}
// Le battage : un ruban de petits claquements qui s'accélère puis ralentit, et le pont.
function rendreMelange(m, sr) {
  const rnd = graine(0x7a700 + CARTES.indexOf(m));
  const out = vide(0.95, sr);
  const N = 38;
  for (let i = 0; i < N; i += 1) {
    const q = i / (N - 1);
    const t = 0.02 + 0.55 * (q - 0.25 * Math.sin(Math.PI * q) * q);
    const s0 = Math.round(t * sr), n = Math.round(0.006 * sr);
    const [a, b] = GLISSE[m];
    let lp = 0;
    const k = 1 - Math.exp((-2 * Math.PI * (a + (b - a) * rnd())) / sr);
    for (let j = 0; j < n && s0 + j < out.length; j += 1) {
      lp += k * ((rnd() * 2 - 1) - lp);
      out[s0 + j] += lp * (1 - j / n) * (0.4 + 0.6 * rnd()) * 1.6;
    }
    if (m === 'bois' || m === 'cristal') choc(out, sr, t, m, 0.12, rnd, 1.2);
  }
  const [a, b, g] = GLISSE[m];
  glisse(out, sr, 0.62, 0.22, a, b * 0.7, g * 0.8, rnd);
  return fini(out, sr);
}

// ── Les tickets ─────────────────────────────────────────────────────────────────
// Le grattage : une texture qui boucle (1,6 s), dans la matière du ticket.
const GRATTE = {
  argile: { bande: [700, 3000], grains: 70, choc: 'terre' },
  bois: { bande: [600, 2600], grains: 50, choc: 'bois' },
  papier: { bande: [1500, 6000], grains: 25, choc: null },
  metal: { bande: [2000, 7000], grains: 35, choc: 'metal' },
  vernis: { bande: [1200, 5000], grains: 30, choc: 'plastique' },
  cristal: { bande: [3000, 9500], grains: 30, choc: 'cristal' },
};
function rendreGratte(m, sr) {
  const rnd = graine(0x7a800 + TICKETS.indexOf(m));
  const p = GRATTE[m], L = 1.6, Ln = Math.round(L * sr), n = Ln + Math.round(0.2 * sr);
  const x = new Float32Array(n);
  let lp = 0, hp = 0;
  const kl = 1 - Math.exp((-2 * Math.PI * p.bande[1]) / sr), kh = 1 - Math.exp((-2 * Math.PI * p.bande[0]) / sr);
  for (let i = 0; i < n; i += 1) {
    const tt = i / sr;
    lp += kl * ((rnd() * 2 - 1) - lp);
    hp += kh * (lp - hp);
    // Les coups de griffe : l'intensité frémit (des sinus aux périodes de la boucle).
    const am = 0.6 + 0.25 * Math.sin((2 * Math.PI * 7 * tt) / L) + 0.15 * Math.sin((2 * Math.PI * 13 * tt) / L + 1.3);
    x[i] = (lp - hp) * am;
  }
  if (p.choc) for (let i = 0; i < p.grains * L; i += 1) choc(x, sr, (n / sr - 0.05) * rnd(), p.choc, 0.12 + 0.12 * rnd(), rnd, 1.4 + 0.6 * rnd());
  // Bouclée : la queue fondue dans la tête, à puissance constante.
  const out = x.slice(0, Ln), F = n - Ln;
  for (let i = 0; i < F; i += 1) { const th = ((i / F) * Math.PI) / 2; out[i] = x[i] * Math.sin(th) + x[Ln + i] * Math.cos(th); }
  return normaliser(out, sr, 0.8, 0);
}
function rendreTicket(m, sr) {
  const rnd = graine(0x7a900 + TICKETS.indexOf(m));
  const out = vide(0.4, sr);
  if (m === 'papier' || m === 'vernis') {
    glisse(out, sr, 0.004, 0.12, m === 'vernis' ? 1800 : 1200, m === 'vernis' ? 7000 : 5000, 0.5, rnd);
    choc(out, sr, 0.12, 'bois', 0.3, rnd, 1.7);
  } else {
    const c = m === 'argile' ? 'terre' : m;
    glisse(out, sr, 0.004, 0.08, 500, 2500, 0.25, rnd);
    poids(out, sr, 0.08, 0.45);
    choc(out, sr, 0.08, c, 0.8, rnd, 0.85);
  }
  return fini(out, sr);
}
function rendreCase(sr) {
  const rnd = graine(0x7aa00);
  const out = vide(0.6, sr);
  frappe(out, sr, 0.004, 0.06, rnd, 0.001);
  modes(out, sr, 0.004, 1568, CRISTAL.map(([r, a, d]) => [r, a, d * 3]), 0.7, { duree: 0.4 });
  return fini(out, sr, 0.4, 0.15, 0.1);
}
function rendreRevele(sr) {
  const rnd = graine(0x7ab00);
  const out = vide(0.9, sr);
  glisse(out, sr, 0.004, 0.42, 600, 7000, 0.45, rnd);
  modes(out, sr, 0.3, 1175, CRISTAL, 0.3, { duree: 0.5 });
  modes(out, sr, 0.36, 1760, CRISTAL, 0.2, { duree: 0.45 });
  return fini(out, sr, 0.5, 0.2, 0.15);
}

// ── Les verdicts ────────────────────────────────────────────────────────────────
const PIECE = [[1, 1, 11], [1.53, 0.7, 14], [2.27, 0.5, 18], [2.9, 0.35, 24]];
function rendreGainPetit(sr) {
  const rnd = graine(0x7ac00);
  const out = vide(1.1, sr);
  for (const [t, f, g] of [[0.005, 2350, 0.75], [0.085, 2630, 0.6], [0.17, 2210, 0.5]]) {
    frappe(out, sr, t, g * 0.25, rnd, 0.0008);
    modes(out, sr, t, f, PIECE, g, { duree: 0.45 });
  }
  modes(out, sr, 0.2, 1175, CRISTAL, 0.35, { duree: 0.7 });
  return fini(out, sr, 0.4, 0.15, 0.15);
}
function rendrePerte(sr) {
  const rnd = graine(0x7ad00);
  const out = vide(0.5, sr);
  frappe(out, sr, 0.004, 0.12, rnd, 0.002);
  modes(out, sr, 0.004, 330, BOIS.map(([r, a, d]) => [r, a, d * 0.8]), 0.7, { duree: 0.35 });
  partiels(out, sr, 0.004, [{ f: 165, a: 1, d: 9 }], 0.3, 0.3, { attaque: 0.004, relache: 0.05 });
  return fini(out, sr, 0.3, 0.1, 0.12);
}
function rendreEgalite(sr) {
  const rnd = graine(0x7ae00);
  const out = vide(0.7, sr);
  frappe(out, sr, 0.004, 0.08, rnd, 0.001);
  modes(out, sr, 0.004, 880, CRISTAL.map(([r, a, d]) => [r, a, d * 1.6]), 0.6, { duree: 0.4 });
  return fini(out, sr, 0.35, 0.12, 0.12);
}

// ── Le catalogue ────────────────────────────────────────────────────────────────
const NOMS = [];
for (const m of JETONS) NOMS.push(`jeton-${m}-1`, `jeton-${m}-2`, `jetons-${m}`);
for (const m of DES) NOMS.push(`des-${m}-lance`, `des-${m}-1`, `des-${m}-2`, `des-${m}-3`);
for (const m of CARTES) NOMS.push(`carte-${m}-1`, `carte-${m}-2`, `carte-${m}-3`, `retourne-${m}`, `melange-${m}`);
for (const m of TICKETS) NOMS.push(`gratte-${m}`, `ticket-${m}`);
NOMS.push('case', 'revele', 'gain-petit', 'perte', 'egalite');
// Les scènes (lot 11) : la roulette, les courses, le duel, le vol d'Icare.
NOMS.push(...SONS_SCENES);
export const SONS_TABLES = NOMS;

export function rendreTable(nom, sr = TABLES_SR) {
  let m = /^jeton-([a-z]+)-([12])$/.exec(nom);
  if (m && JETONS.includes(m[1])) return rendreJeton(m[1], Number(m[2]), sr);
  m = /^jetons-([a-z]+)$/.exec(nom);
  if (m && JETONS.includes(m[1])) return rendreJetons(m[1], sr);
  m = /^des-([a-z]+)-lance$/.exec(nom);
  if (m && DES.includes(m[1])) return rendreLance(m[1], sr);
  m = /^des-([a-z]+)-([1-3])$/.exec(nom);
  if (m && DES.includes(m[1])) return rendreTombe(m[1], Number(m[2]), sr);
  m = /^carte-([a-z]+)-([1-3])$/.exec(nom);
  if (m && CARTES.includes(m[1])) return rendreCarte(m[1], Number(m[2]), sr);
  m = /^retourne-([a-z]+)$/.exec(nom);
  if (m && CARTES.includes(m[1])) return rendreRetourne(m[1], sr);
  m = /^melange-([a-z]+)$/.exec(nom);
  if (m && CARTES.includes(m[1])) return rendreMelange(m[1], sr);
  m = /^gratte-([a-z]+)$/.exec(nom);
  if (m && TICKETS.includes(m[1])) return rendreGratte(m[1], sr);
  m = /^ticket-([a-z]+)$/.exec(nom);
  if (m && TICKETS.includes(m[1])) return rendreTicket(m[1], sr);
  if (nom === 'case') return rendreCase(sr);
  if (nom === 'revele') return rendreRevele(sr);
  if (nom === 'gain-petit') return rendreGainPetit(sr);
  if (nom === 'perte') return rendrePerte(sr);
  if (nom === 'egalite') return rendreEgalite(sr);
  return rendreScene(nom, sr);
}
