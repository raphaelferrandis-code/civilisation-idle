// LES SONS DES LIEUX DE LA CARTE (docs/PLAN-AMBIANCE-SONORE.md, lot 9) — la SYNTHÈSE,
// pure, à graine fixe, rendue dans le Worker des sons comme les autres sons du paysage
// (paysageSynth.js la consulte pour les noms qu'il ne connaît pas).
//
//   · moulinVent   le moulin à vent : quatre ailes qui passent (un souffle par aile),
//                  le bois qui grince une fois par tour, le choc sourd du mécanisme ;
//   · eolienne     l'éolienne du Néon : trois pales qui fendent l'air, la nacelle qui
//                  ronronne ;
//   · temple-<t>-<v> la cloche d'un lieu de culte, selon l'époque (rare, au loin) :
//                  le tambour rituel (Feu), le tambour à fente (Bois), la pierre qui
//                  sonne (Pierre taillée), le bronze (Couronne, Marbre), la cloche de
//                  l'église (Fonte, Néon), le cristal (âges cosmiques).
//
// LES BOUCLES NE CLAQUENT PAS : rendues un peu plus longues, la queue fondue dans la tête
// (boucler) ; leurs rythmes (les ailes, les pales) tombent juste sur la longueur.

import { graine, tambour, salle, normaliser } from '../synth.js';
import { modes, frappe, MODES } from '../moments/momentsSynth.js';

// ── Petits outils (comme paysageSynth.js) ───────────────────────────────────────
function biquad(type, f, Q, sr) {
  const w0 = (2 * Math.PI * Math.min(f, sr * 0.45)) / sr;
  const c = Math.cos(w0), al = Math.sin(w0) / (2 * Q);
  let b0, b1, b2;
  if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0; }
  else if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; }
  else { b0 = al; b1 = 0; b2 = -al; }
  const a0 = 1 + al;
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: (-2 * c) / a0, a2: (1 - al) / a0, x1: 0, x2: 0, y1: 0, y2: 0 };
}
function bq(F, x) {
  const y = F.b0 * x + F.b1 * F.x1 + F.b2 * F.x2 - F.a1 * F.y1 - F.a2 * F.y2;
  F.x2 = F.x1; F.x1 = x; F.y2 = F.y1; F.y1 = y;
  return y;
}
function boucler(src, Ln) {
  const F = src.length - Ln;
  const out = src.slice(0, Ln);
  for (let i = 0; i < F; i += 1) {
    const th = ((i / F) * Math.PI) / 2;
    out[i] = src[i] * Math.sin(th) + src[Ln + i] * Math.cos(th);
  }
  return out;
}
function auNiveau(buf, rms = 0.12, crete = 0.95) {
  let e = 0, m = 1e-9;
  for (let i = 0; i < buf.length; i += 1) { const v = buf[i]; e += v * v; if (Math.abs(v) > m) m = Math.abs(v); }
  const r = Math.sqrt(e / Math.max(1, buf.length));
  let k = rms / Math.max(r, 1e-9);
  if (m * k > crete) k = crete / m;
  for (let i = 0; i < buf.length; i += 1) buf[i] *= k;
  return buf;
}

// Le GRINCEMENT du bois (un frottement) : une suite d'à-coups dont la cadence glisse
// (de `f0` à `f1` à-coups par seconde), qui font sonner le bois à trois hauteurs.
function grincement(out, sr, t, duree, g, rnd, { f0 = 90, f1 = 140 } = {}) {
  const s0 = Math.round(t * sr), n = Math.min(out.length - s0, Math.round(duree * sr));
  if (n <= 0) return;
  const x = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i += 1) {
    const q = i / n;
    ph += (f0 + (f1 - f0) * q + 12 * Math.sin(2 * Math.PI * 3.1 * q)) / sr;
    if (ph >= 1) { ph -= 1; x[i] = (0.6 + 0.4 * rnd()) * Math.sin(Math.PI * q); }
  }
  for (const [f, Q, a] of [[380, 9, 1], [920, 12, 0.6], [1750, 14, 0.35]]) {
    const F = biquad('bp', f * (0.95 + 0.1 * rnd()), Q, sr);
    for (let i = 0; i < n; i += 1) out[s0 + i] += bq(F, x[i]) * a * g * 6;
  }
}

// ── Le moulin à vent ────────────────────────────────────────────────────────────
// Un tour en 6,8 s, quatre ailes : un passage toutes les 1,7 s (isoMill.js). Chaque aile qui passe
// pousse un souffle (un bruit filtré qui enfle et retombe) ; une fois par tour, le bois
// de l'arbre grince ; le mécanisme cogne sourdement.
function rendreMoulinVent(sr) {
  const rnd = graine(0x6d0071), L = 6.8, Ln = Math.round(L * sr), n = Ln + Math.round(0.6 * sr);
  const souffle = new Float32Array(n), corps = new Float32Array(n), bois = new Float32Array(n);
  const bp = biquad('bp', 520, 0.8, sr), bpC = biquad('bp', 190, 0.9, sr);
  const passe = 1.7;
  for (let i = 0; i < n; i += 1) {
    const tt = i / sr;
    // La bosse d'une aile qui passe (cosinus surélevé, une demi-seconde de large).
    const q = ((tt % passe) / passe) - 0.5;
    const bosse = Math.abs(q) < 0.22 ? 0.5 + 0.5 * Math.cos((Math.PI * q) / 0.22) : 0;
    const w = rnd() * 2 - 1;
    souffle[i] = bq(bp, w) * (0.15 + 0.85 * bosse);
    corps[i] = bq(bpC, w) * (0.3 + 0.7 * bosse);
  }
  for (let k = 0; k * L < n / sr; k += 1) {
    grincement(bois, sr, k * L + 3.1, 0.6, 1, rnd, { f0: 85, f1: 150 });
    const s0 = Math.round((k * L + 0.08) * sr), m = Math.min(n - s0, Math.round(0.18 * sr));
    let ph = 0;
    for (let i = 0; i < m; i += 1) {
      const tt = i / sr;
      ph += (2 * Math.PI * (60 + 40 * Math.exp(-tt * 30))) / sr;
      bois[s0 + i] += Math.sin(ph) * Math.exp(-tt * 22) * 0.6;
    }
  }
  auNiveau(souffle, 1, 1e9); auNiveau(corps, 1, 1e9); auNiveau(bois, 1, 1e9);
  const mix = new Float32Array(n);
  for (let i = 0; i < n; i += 1) mix[i] = souffle[i] * 0.7 + corps[i] * 0.45 + bois[i] * 0.35;
  return auNiveau(boucler(mix, Ln), 0.1);
}

// ── L'éolienne (l'âge du Néon) ──────────────────────────────────────────────────
// Trois pales, une toutes les 1,7 s (un tour en 5,1 s, isoMill.js) : un souffle plus
// lisse et plus aigu que l'aile de toile (le bout de pale qui fend l'air), le
// ronronnement de la nacelle ; pas de bois qui grince.
function rendreEolienne(sr) {
  const rnd = graine(0xe0119e), passe = 1.7, Lb = 3 * passe, Ln = Math.round(Lb * sr), n = Ln + Math.round(0.6 * sr);
  const souffle = new Float32Array(n), nacelle = new Float32Array(n);
  const bp = biquad('bp', 900, 0.7, sr), bpB = biquad('bp', 260, 0.8, sr);
  for (let i = 0; i < n; i += 1) {
    const tt = i / sr;
    const q = ((tt % passe) / passe) - 0.5;
    const bosse = Math.abs(q) < 0.3 ? 0.5 + 0.5 * Math.cos((Math.PI * q) / 0.3) : 0;
    const w = rnd() * 2 - 1;
    souffle[i] = (bq(bp, w) * 0.8 + bq(bpB, w) * 0.5) * (0.2 + 0.8 * bosse);
    // La nacelle : une boîte de vitesses qui ronronne (des multiples de 1/Lb, la boucle tombe juste).
    const f0 = Math.round(47 * Lb) / Lb;
    nacelle[i] = Math.sin(2 * Math.PI * f0 * tt) * 0.6 + Math.sin(2 * Math.PI * 2 * f0 * tt) * 0.3 + Math.sin(2 * Math.PI * 3 * f0 * tt) * 0.12;
  }
  auNiveau(souffle, 1, 1e9); auNiveau(nacelle, 1, 1e9);
  const mix = new Float32Array(n);
  for (let i = 0; i < n; i += 1) mix[i] = souffle[i] * 0.85 + nacelle[i] * 0.18;
  return auNiveau(boucler(mix, Ln), 0.1);
}

// ── Les cloches des lieux de culte ──────────────────────────────────────────────
export const TIMBRES_TEMPLE = ['tambour', 'bois', 'pierre', 'bronze', 'cloche', 'cristal'];
// La matière de la cloche selon la bande d'âge (data/eraThemes.js).
export function timbreTemple(bande) {
  const b = bande | 0;
  return b <= 0 ? 'tambour' : b === 1 ? 'bois' : b === 2 ? 'pierre' : b <= 4 ? 'bronze' : b <= 6 ? 'cloche' : 'cristal';
}
function rendreTemple(timbre, v, sr) {
  const rnd = graine(0x7e3010 + TIMBRES_TEMPLE.indexOf(timbre) * 7 + v);
  const out = new Float32Array(Math.round(5.5 * sr));
  const { BOIS, PIERRE, BRONZE, GONG, CRISTAL } = MODES;
  if (timbre === 'tambour') {
    // Le tambour rituel : trois coups lents, le dernier plus fort.
    for (const [t, g] of [[0.01, 0.6], [0.62, 0.7], [1.3, 1]]) tambour(out, sr, t, g, rnd, { haut: 105 + 8 * v, bas: 48, sec: 5, frappe: 0.3 });
  } else if (timbre === 'bois') {
    for (const [t, f, g] of [[0.01, 175, 1], [0.32, 233, 0.8], [0.62, 175, 0.9]]) { frappe(out, sr, t, g * 0.2, rnd); modes(out, sr, t, f * (v === 2 ? 1.12 : 1), BOIS, g); }
  } else if (timbre === 'pierre') {
    frappe(out, sr, 0.01, 0.2, rnd); modes(out, sr, 0.01, v === 2 ? 330 : 262, PIERRE, 1, { duree: 2.2 });
    modes(out, sr, 0.5, v === 2 ? 440 : 392, PIERRE, 0.6, { duree: 2 });
  } else if (timbre === 'bronze') {
    frappe(out, sr, 0.01, 0.25, rnd, 0.004); modes(out, sr, 0.01, v === 2 ? 247 : 220, BRONZE, 1, { duree: 4.5 });
    if (v === 2) modes(out, sr, 0.01, 110, GONG, 0.25, { duree: 4, attaque: 0.05 });
  } else if (timbre === 'cloche') {
    // La cloche de l'église : deux coups, grave.
    for (const t of [0.01, 1.6]) { frappe(out, sr, t, 0.3, rnd, 0.005); modes(out, sr, t, v === 2 ? 165 : 147, BRONZE, 1, { duree: 3.6 }); }
  } else {
    modes(out, sr, 0.01, v === 2 ? 880 : 784, CRISTAL, 1, { duree: 4 });
    modes(out, sr, 0.2, v === 2 ? 1319 : 1175, CRISTAL, 0.45, { duree: 3.6 });
  }
  return normaliser(salle(out, sr, 0.95, 0.35), sr, 0.8, 0.8);
}

// ── Le catalogue ────────────────────────────────────────────────────────────────
const NOMS = ['moulinVent', 'eolienne'];
for (const t of TIMBRES_TEMPLE) NOMS.push(`temple-${t}-1`, `temple-${t}-2`);
export const SONS_LIEUX = NOMS;

// Rend un son des lieux, ou null si le nom n'en est pas un.
export function rendreLieu(nom, sr) {
  if (nom === 'moulinVent') return rendreMoulinVent(sr);
  if (nom === 'eolienne') return rendreEolienne(sr);
  const m = /^temple-(tambour|bois|pierre|bronze|cloche|cristal)-([12])$/.exec(nom);
  if (m) return rendreTemple(m[1], Number(m[2]), sr);
  return null;
}
