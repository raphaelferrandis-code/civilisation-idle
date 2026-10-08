"use strict";

// ÉCOUTER — tendre l'oreille (docs/PLAN-ECOUTER-PARLER.md, lot 1).
//
// Le passant désigné cause avec quelqu'un : on entend leur échange. Seul, ou si l'on
// préfère : ce qu'il pense (Raph : « dès le début le joueur peut regarder les pensées
// de tout le monde »). Sur la carte, rien qu'une petite marque au-dessus de qui parle
// (citizenFocus.drawCitizenFocusOverlay) ; les répliques s'affichent dans la fiche.
//
// L'écoute en cours vit dans `CM.listening` : { p, q, kind, id, lines, t0, names }.
// Désigner quelqu'un d'autre la coupe.
//
// LOT 5 : la causette de la veillée (Claude et celui qui veille avec lui au feu,
// paroles/veillee.js) ; la première qu'on écoute dans une cité est LE DÉCLIC (« Mais
// quelqu'un écoute. ») ; ensuite, une pensée peut DEMANDER un signe (`request`) : elle
// pose `CM.signRequest` { p, sign, id, t0, until, started, done }, que signs.js mène.
import { CM } from '../layout.js';
import { onCitizenFocus, identityOfPick, cityConcern, doingOf } from '../citizenFocus.js';
import { householdOf, householdSeedOf, memberOf, ageRange, idHash, APARTMENTS } from '../citizenIdentity.js';
import { CM_COLLECTIVE_HOMES } from '../cityNaming.js';
import { WINTER } from '../seasonMode.js';
import { pickParole, resolveLines } from './pick.js';
import { nearestFire } from './nearFire.js';
import {
  parolesHeard, parolesNoteHeard, parolesTotal, parolesBulles, parolesKnown, parolesSignsSeen,
  parolesDeclicHere, parolesDeclics, parolesNoteDeclic,
} from '../../core/paroles.js';
import { state } from '../../core/state.js';
import { getPeriod } from '../../core/chronicleEvaluator.js';
import { lastAbsence } from '../../core/idleReport.js';
import { NOMS_DU_JOUEUR } from '../../data/parolesToi.js';
import { PAROLES } from '../../data/paroles.js';

const PAROLES_BY_ID = new Map(PAROLES.map((e) => [e.id, e]));

// lineMs : le temps d'une réplique (lue, puis la suivante).
export const LISTEN = { lineMs: 2800 };
// Une demande de signe (lot 5) attend `waitMs` après sa réplique : le temps de la lire et
// d'y répondre.
export const REQUEST = { waitMs: 16000 };
if (import.meta.env?.DEV && typeof window !== 'undefined') {
  window.__listen = (o) => { if (o) Object.assign(LISTEN, o); return { ...LISTEN }; };
}

const bandNow = () => ((CM.layout && CM.layout.counts && CM.layout.counts.eraBand) | 0);
const eraNow = () => ((CM.layout && CM.layout.counts && CM.layout.counts.eraIndex) | 0);

// CE QU'ON DIT DE TOI (lot 2) — la confiance : combien d'échanges le joueur a déjà
// entendus (éternel). Au premier palier, il entend ce qu'on PENSE de lui ; au
// deuxième, ce qu'on en DIT, à l'écart ; au troisième, ce qu'on n'ose pas dire.
export const TRUST = [5, 15, 40];
export const trustOf = (n) => TRUST.reduce((t, k) => t + (n >= k ? 1 : 0), 0);
// Là où l'on ne parle pas de ces choses : au milieu de la place, au marché, au travail.
const PUBLIC = ['plaza', 'errand', 'work', 'school'];
// L'absence dont on parle encore : au moins une heure, revenue depuis peu.
const ABSENCE_MIN_SEC = 3600;
const ABSENCE_FRESH_MS = 20 * 60 * 1000;
function absenceFresh() {
  const a = lastAbsence();
  return !!a && a.sec >= ABSENCE_MIN_SEC && Date.now() - a.at < ABSENCE_FRESH_MS;
}
// Il sent qu'on le suit quand la caméra ne le lâche plus depuis un moment.
export const FOLLOW_MS = 30000;
function followedNow(p) {
  const f = CM.focus;
  return !!(f && f.cam && f.p === p && f.since != null && clock() - f.since >= FOLLOW_MS);
}
// Les parties jouées à la Maison des Plaisirs, à vie (chronicleStats).
function gamesPlayed() {
  const g = state.chronicleStats && state.chronicleStats.games;
  if (!g) return 0;
  let n = 0;
  for (const k of Object.keys(g)) n += (g[k] && g[k].plays) | 0;
  return n;
}
const clock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

// L'autre de la causette : le meneur ou le compagnon (ils causent en marchant), le
// partenaire d'un groupe de place ou d'une promenade de quai, ou celui qu'il a salué
// (seulement pendant la causette).
export function talkingPartner(p) {
  if (!p) return null;
  if (p._chatWith) return p.chatT > 0 ? p._chatWith : null;
  return p.lead || (p._f1 && p._f1.lead === p ? p._f1 : null) || p.mate || null;
}

// Ce que les répliques peuvent savoir d'une personne.
function personOf(kind, p, band) {
  const id = identityOfPick(kind, p);
  const line = id.line || null;
  const hh = id.household != null ? householdOf(id.household, band) : null;
  const child = !!id.child || p.charType === 2;
  return {
    id, hh,
    view: {
      fem: !!id.fem,
      child,
      old: id.slot === 'g' || (!child && id.age >= ageRange(band, 'old')[0]),
      job: id.job || null,
      traits: id.traits || [],
      family: line ? line.kind : null,
      kids: line && (line.kind === 'married' || line.kind === 'single') ? line.kids | 0 : 0,
    },
  };
}
// LES VOISINS : de vraies gens, qu'on peut retrouver sur la carte. Les foyers des
// maisons de sa rue (au plus VOISINAGE cases de chez lui, la plus proche d'abord) :
// la maison porte le nom de la tête du foyer (cityMapDescribeTile, même graine) ; on
// la préfère, puis son conjoint. Dans un immeuble, les foyers des autres
// appartements. Rend { voisin, voisine } (un homme, une femme), ou moins.
const VOISINAGE = 4;
export function neighborsOf(p, band) {
  const home = p && p.home && p.home.t;
  if (!home || home.gx == null) return {};
  const cycles = state.cycles || 0;
  const own = p.identity && p.identity.household;
  const ownKey = home.key || `${home.gx},${home.gy}`;
  const salt = (p.seed >>> 0) || 0;
  const near = [];
  if (CM_COLLECTIVE_HOMES.has(home.variant)) {
    for (let a = 0; a < APARTMENTS; a += 1) {
      const hh = householdOf(householdSeedOf(ownKey, cycles, a), band);
      if (hh.seed !== own) near.push({ hh, d: 0, r: idHash(salt, 300 + a) });
    }
  }
  if (CM.tileGrid) {
    const seen = new Set([ownKey]);
    for (let dy = -VOISINAGE; dy <= VOISINAGE; dy += 1) {
      for (let dx = -VOISINAGE; dx <= VOISINAGE; dx += 1) {
        const t = CM.tileGrid.get((home.gx + dx) + ',' + (home.gy + dy));
        if (!t || t.type !== 'house' || CM_COLLECTIVE_HOMES.has(t.variant)) continue;
        const key = t.key || `${t.gx},${t.gy}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const hh = householdOf(householdSeedOf(key, cycles), band);
        if (hh.seed !== own) near.push({ hh, d: Math.max(Math.abs(dx), Math.abs(dy)), r: idHash(salt, dx * 31 + dy) });
      }
    }
  }
  near.sort((x, y) => x.d - y.d || x.r - y.r);
  const pick = (slot) => {
    for (const n of near) if (n.hh.head === slot && n.hh[slot]) return n.hh[slot].given;
    for (const n of near) if (n.hh[slot]) return n.hh[slot].given;
    return null;
  };
  const out = {};
  const m = pick('m'), f = pick('f');
  if (m) out.voisin = m;
  if (f) out.voisine = f;
  return out;
}

// Les prénoms que les répliques citent : les leurs, celui du conjoint, d'un enfant, de
// l'hôte, d'un voisin — les vrais, ceux du foyer de la fiche et de sa rue.
function namesOf(A, B, p, band) {
  const names = { a: A.id.given, ...neighborsOf(p, band) };
  if (B) names.b = B.id.given;
  const line = A.id.line, hh = A.hh;
  if (line && hh) {
    if (line.kind === 'married') names.conjoint = memberOf(hh, line.other) && memberOf(hh, line.other).given;
    if ((line.kind === 'married' || line.kind === 'single') && hh.kids.length) names.enfant = hh.kids[0].given;
    if (line.kind === 'lodger' || line.kind === 'nephew') names.hote = memberOf(hh, line.host) && memberOf(hh, line.host).given;
  }
  // Le voisin n'est ni lui, ni l'autre de la causette.
  for (const k of ['voisin', 'voisine']) if (names[k] && (names[k] === names.a || names[k] === names.b)) delete names[k];
  return names;
}
// Leur lien, s'ils sont du même foyer : le couple, ou un parent et son enfant (l'aïeul
// compte pour un parent).
function relOf(A, B) {
  if (!B || A.id.household == null || A.id.household !== B.id.household || !A.id.slot || !B.id.slot) return { rel: null, kidIs: null };
  const sa = A.id.slot, sb = B.id.slot;
  const grown = (s) => s === 'm' || s === 'f' || s === 'g';
  if ((sa === 'm' && sb === 'f') || (sa === 'f' && sb === 'm')) return { rel: 'couple', kidIs: null };
  if (sa[0] === 'k' && grown(sb)) return { rel: 'parentKid', kidIs: 'a' };
  if (sb[0] === 'k' && grown(sa)) return { rel: 'parentKid', kidIs: 'b' };
  return { rel: null, kidIs: null };
}

// La situation d'une écoute (map/paroles/pick.js).
const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
export function listenContext(kind, p, focusKind) {
  const band = bandNow();
  const q0 = kind === 'chat' ? talkingPartner(p) : null;
  // LA VEILLÉE (lot 5) : Claude y est toujours `a`, celui qu'on écoute ou l'autre (ses
  // répliques sont écrites ainsi) ; startListening les remet dans l'ordre de la fiche.
  const veillee = !!(q0 && p._veille && q0._veille && p._veille.site === q0._veille.site);
  const swapped = veillee && q0._veille.role === 'claude';
  const P = swapped ? q0 : p, q = swapped ? p : q0;
  const A = personOf(swapped ? 'citizen' : focusKind, P, band);
  const B = q ? personOf(q.scene ? 'figure' : focusKind, q, band) : null;
  const wet = (CM.rainF || 0) > 0.15;
  const night = (CM.nightF || 0) > 0.55;
  const doing = doingOf(p);
  const known = parolesKnown();
  const olympus = state.olympus || {};
  const names = namesOf(A, B, P, band);
  const nom = known.nameId ? NOMS_DU_JOUEUR[known.nameId] : null;
  if (nom) { names.nom = { fr: nom.fr, en: nom.en }; names.Nom = { fr: nom.Fr, en: nom.En }; }
  // CE QUE LA CITÉ A VU (lot 4) : le dernier qui a reçu un signe, par geste et par
  // signe (« {temoin} à genoux devant le puits ») — jamais celui qu'on écoute, ni l'autre.
  const seenBy = {};
  for (const ev of parolesSignsSeen()) {
    if (ev.who === names.a || ev.who === names.b) continue;
    seenBy[ev.act] = ev;
    seenBy[ev.sign] = ev;
    // Celui qui avait demandé un signe, et l'a eu (lot 5).
    if (ev.ans) seenBy.answered = ev;
  }
  return {
    kind,
    band,
    night,
    precip: wet ? ((CM.season | 0) === WINTER ? 'snow' : 'rain') : null,
    season: SEASONS[(CM.season | 0) & 3],
    doing,
    riot: Array.isArray(CM.rioters) && CM.rioters.length > 0,
    wonder: !!(CM.wonderGatherCells && CM.wonderGatherCells.length),
    prosper: (CM.healthF ?? 0.6) >= 0.75,
    cause: cityConcern(),
    a: A.view,
    b: B ? B.view : null,
    ...relOf(A, B),
    names,
    partner: q0,
    veillee,
    swapped,
    // Ce qu'on dit de toi (troisième couche, pick.js).
    trust: trustOf(parolesTotal()),
    private: night || !PUBLIC.includes(doing),
    period: getPeriod(eraNow()),
    articles: known.articles,
    nameId: known.nameId,
    followed: followedNow(p),
    collapses: olympus.totalCollapses | 0,
    manual: (olympus.manualCollapses | 0) > 0,
    legacy: state.activeEpitaphLegacy ? state.activeEpitaphLegacy.id : null,
    profile: olympus.unlockedProfile || null,
    away: absenceFresh(),
    plaisirs: gamesPlayed() >= 10,
    bulles: parolesBulles() >= 3,
    seenBy,
    // Le déclic et les demandes (lot 5).
    declic: parolesDeclicHere(),
    declics: parolesDeclics(),
    fire: !!nearestFire(p),
    figure: focusKind === 'figure',
  };
}

// Ce que la fiche propose au passant désigné : sa causette (s'il cause), ses pensées.
export function listenOptions() {
  const f = CM.focus;
  if (!f || (f.kind !== 'citizen' && f.kind !== 'figure')) return null;
  return { chat: !!talkingPartner(f.p), thought: true };
}

// Écouter : `kind` = 'chat' (sa causette) ou 'thought' (ses pensées). Rend vrai si
// quelque chose est entendu.
export function startListening(kind) {
  const f = CM.focus;
  if (!f || (f.kind !== 'citizen' && f.kind !== 'figure')) return false;
  const p = f.p;
  const ctx = listenContext(kind, p, f.kind);
  if (kind === 'chat' && !ctx.b) return false;
  // LE DÉCLIC (lot 5, § 7.1) : la première causette de la veillée qu'on écoute, dans une
  // cité, c'est celle-là. Claude se souvient des autres cités.
  const declic = kind === 'chat' && ctx.veillee && !ctx.declic;
  const de = declic ? PAROLES_BY_ID.get(ctx.declics > 0 ? 'v-declic-encore' : 'v-declic') : null;
  const r = de ? { id: de.id, kind: de.kind, layer: de.layer, act: null, request: null, lines: resolveLines(de, ctx) }
    : pickParole(ctx, parolesHeard());
  if (!r) return false;
  // Ce qu'on dit de toi va au panneau ; ce qu'on te DEMANDE aussi.
  parolesNoteHeard(r.id, r.layer === 3 || r.request ? toiRecord(r, ctx) : null);
  if (declic) parolesNoteDeclic();
  const q = ctx.partner;
  // Ils restent là le temps de l'échange : la causette d'un salut se prolonge. Les
  // compagnons, eux, causent en marchant.
  if (kind === 'chat' && q && p._chatWith === q) {
    const s = (r.lines.length * LISTEN.lineMs + 800) / 1000;
    p.pauseT = Math.max(p.pauseT || 0, s); q.pauseT = Math.max(q.pauseT || 0, s);
    p.chatT = Math.max(p.chatT || 0, s); q.chatT = Math.max(q.chatT || 0, s);
  }
  // Claude est `a` des répliques de la veillée : on les remet dans l'ordre de la fiche,
  // celui qu'on écoute d'abord (la marque de la carte dit qui parle par `p` et `q`).
  let lines = r.lines, names = { a: ctx.names.a, b: ctx.names.b || null };
  if (ctx.swapped) {
    lines = lines.map((l) => ({ ...l, who: l.who === 'a' ? 'b' : 'a' }));
    names = { a: names.b, b: names.a };
  }
  // `lineMs` voyage avec l'écoute : la marque de la carte (citizenFocus) la lit sans
  // importer ce module (il importe citizenFocus : pas de cycle).
  const t0 = clock();
  CM.listening = {
    p, q: kind === 'chat' ? q : null, kind, id: r.id, lines, t0, lineMs: LISTEN.lineMs, names,
    ...(declic ? { declic: true } : {}),
  };
  // UNE DEMANDE (lot 5) : il attend un signe, le temps de lire sa pensée et d'y répondre
  // (signs.js). Seulement un passant de la rue (pick.js).
  if (r.request && kind === 'thought' && f.kind === 'citizen') {
    CM.signRequest = { p, sign: r.request, id: r.id, t0, until: t0 + LISTEN.lineMs + REQUEST.waitMs, started: false, done: false };
  }
  return true;
}
// Ce qu'il faut garder d'un échange sur le joueur pour le relire dans le panneau
// « Ce qu'on dit de toi » (parolesState.js) : les prénoms qu'il cite (le témoin d'un
// signe compris), les genres, le nom que la gazette donnait alors. Le texte se relit dans
// le catalogue. `e` : l'entrée (une pensée de signe n'est pas dans PAROLES).
const VAR = /\{(\w+)\}/g;
export function toiRecord(r, ctx, e = PAROLES_BY_ID.get(r.id)) {
  const n = {};
  if (e) {
    const ev = e.when && e.when.seen && ctx.seenBy ? ctx.seenBy[e.when.seen] : null;
    for (const l of e.lines) {
      for (const t of [l.fr, l.m, l.f].filter(Boolean)) {
        for (const m of t.matchAll(VAR)) {
          const k = m[1];
          if (k === 'temoin' && ev) n.temoin = ev.who;
          else if (k !== 'a' && k !== 'b' && k !== 'nom' && k !== 'Nom' && typeof ctx.names[k] === 'string') n[k] = ctx.names[k];
        }
      }
    }
  }
  return {
    band: ctx.band, a: ctx.names.a || null, b: ctx.names.b || null,
    fa: !!(ctx.a && ctx.a.fem), fb: !!(ctx.b && ctx.b.fem),
    kid: ctx.rel === 'parentKid' ? ctx.kidIs : null, nom: ctx.nameId || null, n,
  };
}

export function stopListening() {
  CM.listening = null;
}

// Ce que la fiche affiche : les répliques déjà dites, avec qui les dit.
export function listenView(now = clock()) {
  const L = CM.listening;
  if (!L || !CM.focus || CM.focus.p !== L.p) return null;
  // La pensée d'un signe vient après le geste (paroles/signs.js) : rien avant.
  if (now < L.t0) return null;
  const n = L.lines.length;
  const shown = Math.max(1, Math.min(n, 1 + Math.floor((now - L.t0) / LISTEN.lineMs)));
  return {
    kind: L.kind,
    id: L.id,
    lines: L.lines.slice(0, shown).map((l) => ({ who: l.who, name: l.who === 'b' ? L.names.b : L.names.a, fr: l.fr, en: l.en })),
    // (Une tolérance : t0 + durée − t0 tombe parfois un cheveu sous la durée.)
    done: now - L.t0 >= n * LISTEN.lineMs - 1e-6,
  };
}

// Désigner quelqu'un d'autre, ou fermer la fiche, coupe l'écoute.
onCitizenFocus((p) => {
  if (CM.listening && CM.listening.p !== p) CM.listening = null;
});
