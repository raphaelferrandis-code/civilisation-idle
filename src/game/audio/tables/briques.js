// LES BRIQUES DES SONS DES TABLES (docs/PLAN-AMBIANCE-SONORE.md, lots 10 et 11) : les
// chocs de petits objets, les glissements, les poids posés sur la table. Partagées par
// la synthèse des jeux de cartes et de dés (tablesSynth.js) et celle des scènes
// (tablesSynthScenes.js : la roue, la piste, le ciel). Pures, à graine fixe.

import { salle, normaliser } from '../synth.js';
import { modes, frappe, MODES } from '../moments/momentsSynth.js';

const { BOIS, PIERRE, FER, CRISTAL } = MODES;

// Le choc d'un petit objet : sa hauteur, ses modes, combien ils durent, la part de bruit.
export const CHOC = {
  os: { f: 1700, liste: BOIS, d: 2.6, bruit: 0.35 },
  bois: { f: 1150, liste: BOIS, d: 2.2, bruit: 0.3 },
  terre: { f: 1500, liste: PIERRE, d: 3, bruit: 0.4 },
  bronze: { f: 2100, liste: FER, d: 1, bruit: 0.25 },
  nacre: { f: 2600, liste: CRISTAL, d: 3, bruit: 0.3 },
  argile: { f: 2200, liste: PIERRE, d: 3.5, bruit: 0.45 },
  plastique: { f: 2400, liste: BOIS, d: 4, bruit: 0.4 },
  lumiere: { f: 3100, liste: CRISTAL, d: 1.6, bruit: 0.15 },
  ivoire: { f: 2300, liste: BOIS, d: 2.8, bruit: 0.3 },
  casino: { f: 1900, liste: BOIS, d: 4.5, bruit: 0.5 },
  metal: { f: 1900, liste: FER, d: 1.4, bruit: 0.3 },
  cristal: { f: 2800, liste: CRISTAL, d: 1.8, bruit: 0.2 },
};

// Un choc dans la matière `m`, au gain `g`, un peu plus haut ou plus bas (`k`).
export function choc(out, sr, t, m, g, rnd, k = 1) {
  const c = CHOC[m] || CHOC.bois;
  frappe(out, sr, t, g * c.bruit, rnd, 0.0012);
  modes(out, sr, t, c.f * k, c.liste.map(([r, a, d]) => [r, a, d * c.d * 4]), g, { duree: 0.25 });
}
// Un glissement : un bruit dont la bande monte de `fBas` à `fHaut` (une carte, une main).
export function glisse(out, sr, t, duree, fBas, fHaut, g, rnd) {
  const s0 = Math.round(t * sr), n = Math.min(out.length - s0, Math.round(duree * sr));
  let lp = 0, hp = 0;
  for (let i = 0; i < n; i += 1) {
    const q = i / n;
    const fc = fBas + (fHaut - fBas) * q;
    const k = 1 - Math.exp((-2 * Math.PI * fc) / sr), kh = 1 - Math.exp((-2 * Math.PI * fc * 0.35) / sr);
    lp += k * ((rnd() * 2 - 1) - lp);
    hp += kh * (lp - hp);
    out[s0 + i] += (lp - hp) * g * 2.4 * Math.sin(Math.PI * q);
  }
}
// Une table qui reçoit un petit poids : un choc grave et bref.
export function poids(out, sr, t, g) {
  const s0 = Math.round(t * sr), n = Math.min(out.length - s0, Math.round(0.08 * sr));
  let ph = 0;
  for (let i = 0; i < n; i += 1) {
    const tt = i / sr;
    ph += (2 * Math.PI * (85 + 60 * Math.exp(-tt * 60))) / sr;
    out[s0 + i] += Math.sin(ph) * Math.exp(-tt * 45) * g;
  }
}
export const vide = (sec, sr) => new Float32Array(Math.round(sec * sr));
export const fini = (out, sr, piece = 0.25, mouille = 0.08, fondu = 0.04) => normaliser(salle(out, sr, piece, mouille), sr, 0.8, fondu);
