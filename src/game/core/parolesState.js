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
//   toi    ce qu'on a dit de lui et qu'il a entendu (lot 2), le plus ancien d'abord,
//          pour le panneau « Ce qu'on dit de toi » : { id, at (temps de jeu à vie, s),
//          band, a, b (prénoms), fa, fb (genres), kid ('a' | 'b' | null, parent et
//          enfant), nom (l'article qui lui donnait son nom, ou null), n ({ conjoint,
//          enfant… } les autres prénoms cités) }. Le texte se relit dans le catalogue.
//   bulles { cycle, n } — les bulles de pensée cueillies dans la cité de ce cycle
//          (les habitants sentent qu'on leur prend des idées)

const MAX_ID = 40;
const MAX_HEARD = 4000;
export const TOI_MAX = 120;
const MAX_NAME = 40;

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const int = (v, def = 0, lo = 0, hi = 1e9) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.floor(v))) : def);
const id = (v) => (typeof v === 'string' && v.length > 0 && v.length <= MAX_ID && /^[a-z0-9_:-]+$/i.test(v) ? v : null);
const name = (v) => (typeof v === 'string' && v.length > 0 ? v.slice(0, MAX_NAME) : null);

export function defaultParoles() {
  return { heard: {}, n: 0, rev: 0, toi: [], bulles: { cycle: 0, n: 0 } };
}

function normalizeToi(raw) {
  if (!isObj(raw)) return null;
  const rid = id(raw.id);
  if (!rid) return null;
  const n = {};
  if (isObj(raw.n)) {
    for (const [k, v] of Object.entries(raw.n)) {
      if (/^[a-z]{1,12}$/i.test(k) && name(v)) n[k] = name(v);
    }
  }
  return {
    id: rid,
    at: Number.isFinite(raw.at) && raw.at >= 0 ? raw.at : 0,
    band: int(raw.band, 0, 0, 9),
    a: name(raw.a),
    b: name(raw.b),
    fa: !!raw.fa,
    fb: !!raw.fb,
    kid: raw.kid === 'a' || raw.kid === 'b' ? raw.kid : null,
    nom: typeof raw.nom === 'string' && raw.nom.length <= 64 && /^[a-z0-9_]+$/i.test(raw.nom) ? raw.nom : null,
    n,
  };
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
  if (Array.isArray(raw.toi)) {
    out.toi = raw.toi.map(normalizeToi).filter(Boolean).slice(-TOI_MAX);
  }
  if (isObj(raw.bulles)) {
    out.bulles = { cycle: int(raw.bulles.cycle, 0, 0, 1e9), n: int(raw.bulles.n, 0, 0, 1e9) };
  }
  return out;
}
