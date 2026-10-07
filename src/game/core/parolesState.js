"use strict";

// ÉCOUTER, PUIS PARLER — la forme sauvegardée (docs/PLAN-ECOUTER-PARLER.md).
//
// MODULE PUR, sans aucun import : state.js l'appelle PENDANT `export let state =
// load()` (piège TDZ, cf. faitsDiversState.js) — rien ici ne doit lire `state` ni un
// module qui le lit.
//
// ÉTERNEL pour le joueur : ce qu'il a entendu survit aux effondrements ET au Grand
// Reset (GR_PERSISTENT_FIELDS). Ce que les habitants SAVENT de lui, en revanche, se
// lit dans la Chronique de leur cité, qui repart à chaque chute (pas ici).
//
//   heard  { [id d'échange]: n } — combien de fois il l'a entendu (règle 5 : jamais
//          deux fois la même chose tant que la réserve n'est pas épuisée)
//   n      combien d'échanges entendus en tout (la confiance de la troisième couche)
//   rev    compteur de révision (l'interface se redessine quand il bouge)

const MAX_ID = 40;
const MAX_HEARD = 4000;

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const int = (v, def = 0, lo = 0, hi = 1e9) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.floor(v))) : def);
const id = (v) => (typeof v === 'string' && v.length > 0 && v.length <= MAX_ID && /^[a-z0-9_:-]+$/i.test(v) ? v : null);

export function defaultParoles() {
  return { heard: {}, n: 0, rev: 0 };
}

export function normalizeParoles(raw) {
  const out = defaultParoles();
  if (!isObj(raw)) return out;
  if (isObj(raw.heard)) {
    let k = 0;
    for (const [key, v] of Object.entries(raw.heard)) {
      const kid = id(key);
      const n = int(v, 0, 0, 1e6);
      if (!kid || n <= 0 || k >= MAX_HEARD) continue;
      out.heard[kid] = n;
      k += 1;
    }
  }
  out.n = int(raw.n, 0, 0, 1e9);
  out.rev = int(raw.rev, 0, 0, 1e9);
  return out;
}
