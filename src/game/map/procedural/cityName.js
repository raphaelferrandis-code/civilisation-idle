/* ============================================================================
 * cityName.js — Générateur de noms de cité procéduraux
 *   Dérive un nom de ville plausible et déterministe depuis une seed (en
 *   pratique state.mapSeed). Même seed → même nom, stable d'un rechargement à
 *   l'autre ; mais chaque nouvelle civilisation reçoit le sien, façon
 *   toponymie antique / intemporelle.
 * ============================================================================ */
import { rngFrom } from "./seedManager.js";

// Racines initiales — sonorités antiques, déjà capitalisées.
const PREFIXES = [
  "Val", "Mont", "Thal", "Aur", "Bel", "Cor", "Dun", "Eld", "Far", "Gal",
  "Hel", "Iri", "Kael", "Lor", "Mor", "Nor", "Oss", "Pyr", "Sol", "Tyr",
  "Yor", "Zan", "Brae", "Cael", "Vel", "Ast", "Carth", "Eber", "Fenn", "Garn",
  "Lys", "Mel", "Nar", "Oren", "Ser", "Tor", "Ulm", "Ver", "Wyn", "Xer",
  "Andre", "Cyr", "Drav", "Esca", "Faro", "Helle", "Ithos", "Lume", "Numa", "Ravel",
];

// Finales — donnent le « grain » toponymique.
const SUFFIXES = [
  "dor", "mor", "vale", "gard", "heim", "thys", "wyn", "reth", "mira", "ovia",
  "ria", "anor", "mere", "vora", "lys", "anth", "drim", "essa", "andre", "ond",
  "wick", "fell", "grad", "stad", "polis", "ira", "une", "ane", "oire", "agne",
  "thune", "mont", "court", "val", "burg", "thel", "syne", "andra", "esse", "embre",
];

const VOWELS = "aeiouy";

// Tire un nom déterministe pour une seed donnée. Le flux RNG est dédié
// ("cityname") pour ne pas corréler le nom au plan de la ville.
export function generateCityName(seed) {
  const rng = rngFrom((seed >>> 0) || 1, "cityname");
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];

  const pre = pick(PREFIXES);
  let suf = pick(SUFFIXES);

  // Lissage de la jonction : deux voyelles qui se touchent, ou une lettre
  // doublée, donnent un rendu disgracieux → on retire la 1re lettre du suffixe.
  const lastPre = pre[pre.length - 1].toLowerCase();
  const firstSuf = suf[0].toLowerCase();
  if (lastPre === firstSuf || (VOWELS.includes(lastPre) && VOWELS.includes(firstSuf))) {
    if (suf.length > 2) suf = suf.slice(1);
  }

  const raw = pre + suf;
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}
