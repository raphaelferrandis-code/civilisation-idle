// LES RAFALES DU VENT, PARTAGÉES ENTRE LE SON ET L'IMAGE. Pur.
//
// Demande de Raph (2026-10-07) : « entendre le vent sans voir les arbres bouger est
// problématique ». Les boucles du souffle et du feuillage (paysageSynth.js) portent
// leurs rafales dans une ENVELOPPE périodique tirée d'une graine : la même graine, ici,
// redonne exactement la même courbe sur le fil principal. Les arbres de la carte
// (iso/isoVie.js, vieTreeSway) se penchent sur l'enveloppe du SOUFFLE et montrent le
// revers pâle de leurs feuilles sur celle du FEUILLAGE : ce qu'on entend enfler, on le
// voit passer.
//
// ⚠ paysageSynth tire ces enveloppes EN PREMIER de sa graine, puis continue d'en tirer
// son bruit : changer une graine, une longueur ou l'ordre des tirages ici change le son.
import { graine } from '../synth.js';

// Une enveloppe PÉRIODIQUE de longueur L (s) : somme de k harmoniques à phases tirées,
// ramenée à 0..1. Elle boucle sans couture avec sa nappe.
export function periodique(rnd, L, k = 6, pente = 0.9) {
  const a = new Float64Array(k), ph = new Float64Array(k);
  for (let i = 0; i < k; i += 1) { a[i] = (0.35 + rnd()) / Math.pow(i + 1, pente); ph[i] = rnd() * 2 * Math.PI; }
  const brut = (t) => {
    let v = 0;
    for (let i = 0; i < k; i += 1) v += a[i] * Math.sin((2 * Math.PI * (i + 1) * t) / L + ph[i]);
    return v;
  };
  let mn = Infinity, mx = -Infinity;
  for (let j = 0; j < 1024; j += 1) { const v = brut((j / 1024) * L); if (v < mn) mn = v; if (v > mx) mx = v; }
  const e = mx - mn || 1;
  return (t) => Math.max(0, Math.min(1, (brut(t) - mn) / e));
}

// Les deux nappes du vent : graine, longueur (s), harmoniques, pente ; et la loi qui
// change l'enveloppe en force (le « g » de la synthèse).
export const SOUFFLE = { graine: 0x50f1e, L: 23, k: 6, pente: 0.8 };
export const FEUILLAGE = { graine: 0xfe11a6e, L: 17, k: 7, pente: 0.7 };
export const forceSouffle = (e) => 0.12 + 0.88 * e * e;              // des accalmies et des rafales
export const forceFeuillage = (e) => 0.08 + 0.92 * Math.pow(e, 1.4);

// L'enveloppe d'une nappe, sur sa propre graine (ce que l'image relit).
export function enveloppe(def) {
  return periodique(graine(def.graine), def.L, def.k, def.pente);
}

// La FORCE d'une nappe tabulée sur `n` points d'une période (l'image la lit par
// arbre et par image : une table, pas douze sinus).
export function tableForce(def, force, n = 1024) {
  const env = enveloppe(def), out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) out[i] = force(env((i / n) * def.L));
  return out;
}
