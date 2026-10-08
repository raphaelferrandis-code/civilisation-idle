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
//   signs  les signes donnés (lot 4) : { n (en tout, éternel), by { wind, light, fire,
//          beast } (éternel), cycle, here { … } (dans la cité de ce cycle : ce qu'elle
//          a vu), seen [{ sign, act, who, fem, at, ans }] (dans cette cité : qui l'a reçu
//          et ce qu'il a fait, SEEN_MAX au plus — on en parle en le nommant ; `ans` : il
//          l'avait demandé, et l'a eu, lot 5) }
//   declic { n (dans combien de cités, éternel : Claude s'en souvient), city (la cité du
//          dernier, -1 : jamais) } — le soir où Claude a dit « Mais quelqu'un écoute. »
//          (lot 5). Une cité : `cycles + 1000 × grandResetCount` (core/paroles.js).
//   mots   ce que le joueur a DIT (lot 6) : { n (combien d'échanges, éternel), city, said
//          [{ id, key, tone, belief, who, fem, at }] (dans cette cité : à qui il a parlé et
//          ce qu'il a répondu, SAID_MAX au plus), tones { joueur, dieu, indifferent, vie,
//          muet } (dans cette cité : de quelle voix il a parlé) }. Un souvenir du panneau
//          peut être un échange : `toi.talk` { key (sa réponse), ri (la réplique qui a
//          suivi) }.
//   promesse « Je reviendrai te voir. » (lot 6, § 7.5) : { who, fem, city, at (l'heure
//          murale, ms) }, la dernière ; ou null. S'il revient après trois jours d'absence
//          au moins, dans cette cité, on s'en souvient (paroles/listen.js).
//   figures les figures de la Chronique à qui il a parlé (lot 6, § 7.4) : { [clé]: { n
//          (combien d'échanges, éternel), city (la cité du dernier), before (il y en a eu
//          dans une cité d'avant) } } ; Claude s'en souvient d'une cité à l'autre.

const MAX_ID = 40;
const MAX_HEARD = 4000;
export const TOI_MAX = 120;
export const SEEN_MAX = 12;
export const SAID_MAX = 12;
const MAX_NAME = 40;
const FIGURES_MAX = 16;

export const SIGN_KINDS = ['wind', 'light', 'fire', 'beast'];
// LA CITÉ : `cycles` repart à 0 au Grand Reset, d'où le compte des Grands Resets (la même
// clé que les faits divers). Ce que les habitants savent ou ont vu s'y rattache.
export const cityKey = (s) => ((s && s.cycles) | 0) + 1000 * ((s && s.grandResetCount) | 0);
// LA VOIX QUI DOMINE dans une cité (lot 6) : celle dont il a le plus parlé, dès trois
// échanges (le silence ne compte pas). `tones` : { joueur, dieu, indifferent, vie, muet }.
// Les rumeurs (paroles/listen.js) et la gazette (chronicleEvaluator.js) la lisent.
export function dominantTone(tones) {
  let best = null, most = 0, total = 0;
  for (const [t, n] of Object.entries(tones || {})) {
    if (t === 'muet' || !(n > 0)) continue;
    total += n;
    if (n > most) { most = n; best = t; }
  }
  return total >= 3 ? best : null;
}
// LE MONDE REFAIT (lot 7) : la première cité après un Grand Reset (`cycles` y repart à 0,
// il faut une chute pour en sortir). On y rêve de l'ancienne ville (paroles/listen.js) ;
// la gazette en parle (chronicleEvaluator.js, « reve »).
export const afterGrandReset = (s) => !!s && (s.cycles | 0) === 0 && (s.grandResetCount | 0) > 0;
// La voix du joueur quand il parle (data/parolesMots.js, TALK_ORIENTATIONS), et son silence.
export const TALK_TONES = ['joueur', 'dieu', 'indifferent', 'vie', 'muet'];

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const int = (v, def = 0, lo = 0, hi = 1e9) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.floor(v))) : def);
const id = (v) => (typeof v === 'string' && v.length > 0 && v.length <= MAX_ID && /^[a-z0-9_:-]+$/i.test(v) ? v : null);
const name = (v) => (typeof v === 'string' && v.length > 0 ? v.slice(0, MAX_NAME) : null);

export function defaultSigns() {
  return { n: 0, by: {}, cycle: 0, here: {}, seen: [] };
}
export function defaultDeclic() {
  return { n: 0, city: -1 };
}
export function defaultMots() {
  return { n: 0, city: -1, said: [], tones: {} };
}
export function defaultParoles() {
  return {
    heard: {}, n: 0, rev: 0, toi: [], bulles: { cycle: 0, n: 0 }, signs: defaultSigns(), declic: defaultDeclic(),
    mots: defaultMots(), promesse: null, figures: {},
  };
}

// { wind: n, … } : seulement les signes connus, seulement des comptes positifs.
function signCounts(raw) {
  const out = {};
  if (!isObj(raw)) return out;
  for (const k of SIGN_KINDS) {
    const n = int(raw[k], 0, 0, 1e9);
    if (n > 0) out[k] = n;
  }
  return out;
}
// Ce que la cité a vu : le signe, le geste (une clé courte), qui (un prénom), son genre.
function normalizeSeen(raw) {
  if (!isObj(raw) || !SIGN_KINDS.includes(raw.sign)) return null;
  const act = typeof raw.act === 'string' && /^[a-z]{1,10}$/.test(raw.act) ? raw.act : null;
  const who = name(raw.who);
  if (!act || !who) return null;
  const out = { sign: raw.sign, act, who, fem: !!raw.fem, at: Number.isFinite(raw.at) && raw.at >= 0 ? raw.at : 0 };
  if (raw.ans) out.ans = true;
  return out;
}
function normalizeSigns(raw) {
  if (!isObj(raw)) return defaultSigns();
  return {
    n: int(raw.n, 0, 0, 1e9), by: signCounts(raw.by), cycle: int(raw.cycle, 0, 0, 1e9), here: signCounts(raw.here),
    seen: Array.isArray(raw.seen) ? raw.seen.map(normalizeSeen).filter(Boolean).slice(-SEEN_MAX) : [],
  };
}

// Ce que le joueur a dit, et à qui (lot 6).
const key = (v) => (typeof v === 'string' && /^[a-z0-9:-]{1,32}$/.test(v) ? v : null);
function normalizeSaid(raw) {
  if (!isObj(raw)) return null;
  const rid = id(raw.id), k = key(raw.key), who = name(raw.who);
  if (!rid || !k || !who || !TALK_TONES.includes(raw.tone)) return null;
  const out = { id: rid, key: k, tone: raw.tone, who, fem: !!raw.fem, at: Number.isFinite(raw.at) && raw.at >= 0 ? raw.at : 0 };
  if (key(raw.belief)) out.belief = raw.belief;
  return out;
}
function normalizeMots(raw) {
  if (!isObj(raw)) return defaultMots();
  const tones = {};
  if (isObj(raw.tones)) {
    for (const t of TALK_TONES) {
      const n = int(raw.tones[t], 0, 0, 1e9);
      if (n > 0) tones[t] = n;
    }
  }
  return {
    n: int(raw.n, 0, 0, 1e9), city: int(raw.city, -1, -1, 1e9),
    said: Array.isArray(raw.said) ? raw.said.map(normalizeSaid).filter(Boolean).slice(-SAID_MAX) : [],
    tones,
  };
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
    // Un échange avec le joueur (lot 6) : sa réponse et la réplique qui a suivi.
    ...(isObj(raw.talk) && key(raw.talk.key) ? { talk: { key: raw.talk.key, ri: int(raw.talk.ri, 0, 0, 20) } } : {}),
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
  out.signs = normalizeSigns(raw.signs);
  if (isObj(raw.declic)) out.declic = { n: int(raw.declic.n, 0, 0, 1e6), city: int(raw.declic.city, -1, -1, 1e9) };
  out.mots = normalizeMots(raw.mots);
  const pr = raw.promesse;
  if (isObj(pr) && name(pr.who) && Number.isFinite(pr.at) && pr.at > 0) {
    out.promesse = { who: name(pr.who), fem: !!pr.fem, city: int(pr.city, 0, 0, 1e9), at: pr.at };
  }
  if (isObj(raw.figures)) {
    for (const [k, v] of Object.entries(raw.figures)) {
      if (Object.keys(out.figures).length >= FIGURES_MAX || !/^[a-z]{1,16}$/.test(k) || !isObj(v)) continue;
      const n = int(v.n, 0, 0, 1e9);
      if (n > 0) out.figures[k] = { n, city: int(v.city, -1, -1, 1e9), before: !!v.before };
    }
  }
  return out;
}
