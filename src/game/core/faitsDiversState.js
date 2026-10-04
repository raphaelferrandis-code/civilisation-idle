"use strict";

// LES FAITS DIVERS — la forme sauvegardée (docs/PLAN-FAITS-DIVERS.md).
//
// MODULE PUR, sans aucun import : state.js l'appelle PENDANT `export let state =
// load()` (piège TDZ, cf. la perte de sauvegarde de juillet) — rien ici ne doit lire
// `state` ni un module qui le lit.
//
// ÉTERNEL : survit aux effondrements (aucun reset de cycle n'y touche) ET au Grand
// Reset (GR_PERSISTENT_FIELDS). C'est la mémoire de ce que le joueur a vu de la ville :
// elle ne se perd jamais, c'est elle qui fait la continuité d'un cycle à l'autre.
//
//   seen      { [histoire]: { [chapitre]: { band, at } } } — `at` = temps de jeu à vie (s)
//   curios    { [gag]: { band, at, n } }                    — les curiosités vues
//   firstAt   temps à vie de la toute première découverte (null : rien vu encore)
//   lastNewAt temps à vie de la dernière histoire DÉCOUVERTE (rythme des nouveautés)
//   lovers    le fil de Nancy et William (cf. data/faitsDiversAmoureux.js)
//   rev       compteur de révision (l'interface se redessine quand il bouge)

const MAX_ID = 32;
const MAX_ENTRIES = 64;

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const num = (v, def = 0, lo = 0, hi = 1e12) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def);
const int = (v, def = 0, lo = 0, hi = 1e9) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.floor(v))) : def);
const id = (v) => (typeof v === 'string' && v.length > 0 && v.length <= MAX_ID && /^[a-z0-9_:-]+$/i.test(v) ? v : null);
const optNum = (v) => (v == null ? null : Number.isFinite(v) ? num(v) : null);

export function defaultFaitsDiversLovers() {
  return {
    step: 0,          // rang du PROCHAIN rendez-vous à trouver
    at: null,         // temps à vie du dernier rendez-vous trouvé
    first: null,      // type du bâtiment du tout premier rendez-vous
    firstPlace: null, // … et sa clé (« door:gx,gy ») : « là où tout a commencé »
    next: null,       // type du bâtiment désigné par la dernière piste
    piste: 0,         // variante de la phrase de la dernière piste
    place: null,      // clé de l'endroit du dernier rendez-vous (pour « au même endroit »)
    firstFound: null, // 'nancy' | 'william' : le premier trouvé quand ils sont séparés
    cycle: null,      // cycle (effondrements) du dernier rendez-vous trouvé
  };
}

export function defaultFaitsDivers() {
  return {
    seen: {},
    curios: {},
    firstAt: null,
    lastNewAt: null,
    lovers: defaultFaitsDiversLovers(),
    rev: 0,
  };
}

function normalizeSeenMap(raw) {
  const out = {};
  if (!isObj(raw)) return out;
  let n = 0;
  for (const [story, chapters] of Object.entries(raw)) {
    const sid = id(story);
    if (!sid || !isObj(chapters) || n >= MAX_ENTRIES) continue;
    const chOut = {};
    let m = 0;
    for (const [ch, rec] of Object.entries(chapters)) {
      const cid = id(ch);
      if (!cid || !isObj(rec) || m >= MAX_ENTRIES) continue;
      chOut[cid] = { band: int(rec.band, 0, 0, 99), at: num(rec.at) };
      m += 1;
    }
    out[sid] = chOut;
    n += 1;
  }
  return out;
}

function normalizeCurios(raw) {
  const out = {};
  if (!isObj(raw)) return out;
  let n = 0;
  for (const [gag, rec] of Object.entries(raw)) {
    const gid = id(gag);
    if (!gid || !isObj(rec) || n >= MAX_ENTRIES) continue;
    out[gid] = { band: int(rec.band, 0, 0, 99), at: num(rec.at), n: int(rec.n, 1, 1, 1e6) };
    n += 1;
  }
  return out;
}

export function normalizeFaitsDiversLovers(raw) {
  const def = defaultFaitsDiversLovers();
  if (!isObj(raw)) return def;
  const who = raw.firstFound === 'nancy' || raw.firstFound === 'william' ? raw.firstFound : null;
  return {
    step: int(raw.step, 0, 0, 99),
    at: optNum(raw.at),
    first: id(raw.first),
    firstPlace: typeof raw.firstPlace === 'string' && raw.firstPlace.length <= 64 ? raw.firstPlace : null,
    next: id(raw.next),
    piste: int(raw.piste, 0, 0, 9),
    place: typeof raw.place === 'string' && raw.place.length <= 64 ? raw.place : null,
    firstFound: who,
    cycle: raw.cycle == null ? null : int(raw.cycle, 0, 0, 1e9),
  };
}

export function normalizeFaitsDivers(raw) {
  const def = defaultFaitsDivers();
  if (!isObj(raw)) return def;
  return {
    seen: normalizeSeenMap(raw.seen),
    curios: normalizeCurios(raw.curios),
    firstAt: optNum(raw.firstAt),
    lastNewAt: optNum(raw.lastNewAt),
    lovers: normalizeFaitsDiversLovers(raw.lovers),
    rev: int(raw.rev, 0, 0, 1e9),
  };
}
