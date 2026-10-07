"use strict";

// ÉCOUTER — choisir ce qu'on entend (docs/PLAN-ECOUTER-PARLER.md, lot 1).
//
// PUR : rien ici ne lit l'état du jeu ni la carte. On lui passe la situation (`ctx`,
// bâtie par listen.js), ce que le joueur a déjà entendu (`heard`, { id: n }) et un
// tirage (`rand`, dans [0, 1)). Il rend l'échange et ses répliques, prénoms posés.
//
// ctx = {
//   kind:   'chat' | 'thought',
//   band, night, precip ('rain' | 'snow' | null), riot, wonder, prosper,
//   season: 'spring' | 'summer' | 'autumn' | 'winter',
//   doing:  ce qu'il fait (citizenFocus.doingOf : 'work', 'home', 'errand'…) ou null,
//   cause:  ce qui pèse le plus sur la cité (clé de foyer, 'wear', 'poverty') ou null,
//   a:      { fem, child, old, job, traits, family, kids } — celui qu'on écoute,
//   b:      { fem, child, traits } | null — l'autre, dans une causette,
//   rel:    'couple' | 'parentKid' | null, kidIs: 'a' | 'b' (parent et enfant),
//   names:  { a, b, conjoint, enfant, hote, voisin, voisine } — les prénoms que les
//           répliques citent, tous vrais (listen.js).
// }
import { PAROLES, JOB_GROUP } from '../../data/paroles.js';

const VAR = /\{(\w+)\}/g;
// « de », « que », « jusque » devant un prénom qui commence par une voyelle s'élident.
const ELIDE = /\b(de|De|que|Que|jusque) \{(\w+)\}/g;
const VOWEL = /^[AEIOUYÂÊÎÔÛÉÈËÏÜaeiouyâêîôûéèëïü]/;
const textsOf = (l) => [l.fr, l.m, l.f, l.en].filter(Boolean);

// Un enfant ne dit ni ne pense ce qui est marqué `adult` (la paie, les guichets, le
// dos qui grince) ; le reste de sa vie se lit déjà dans ses conditions (il n'a ni
// métier, ni conjoint).
function childOk(e, ctx) {
  const kidInIt = ctx.a.child || (ctx.kind === 'chat' && ctx.b && ctx.b.child);
  return !kidInIt || !e.adult;
}

export function parolesEligible(e, ctx) {
  if (e.kind !== ctx.kind) return false;
  const [lo, hi] = e.bands || [0, 9];
  if (ctx.band < lo || ctx.band > hi) return false;
  const w = e.when || {};
  const a = ctx.a, b = ctx.b;
  if (w.rel && w.rel !== ctx.rel) return false;
  if (w.family && w.family !== a.family) return false;
  if (w.kids && !(a.kids > 0)) return false;
  if (w.job && !w.job.includes(a.job)) return false;
  if (w.notJob && w.notJob.includes(a.job)) return false;
  if (w.group && !w.group.includes(JOB_GROUP[a.job])) return false;
  if (w.doing && !w.doing.includes(ctx.doing)) return false;
  if (w.season && w.season !== ctx.season) return false;
  if (w.trait && !(a.traits || []).includes(w.trait)) return false;
  if (w.traitB && !(b && (b.traits || []).includes(w.traitB))) return false;
  if (w.old && !a.old) return false;
  if (w.child != null && !!a.child !== w.child) return false;
  if (w.cause && w.cause !== ctx.cause) return false;
  if (w.night != null && !!ctx.night !== w.night) return false;
  if (w.precip && w.precip !== ctx.precip) return false;
  if (w.riot && !ctx.riot) return false;
  if (w.wonder && !ctx.wonder) return false;
  if (w.prosper && !ctx.prosper) return false;
  if (!childOk(e, ctx)) return false;
  // Une causette se joue à deux.
  if (e.kind === 'chat' && !b) return false;
  // Il ne nomme personne qu'il n'a pas (un célibataire ne parle pas de sa femme).
  for (const l of e.lines) {
    for (const t of textsOf(l)) {
      for (const m of t.matchAll(VAR)) if (!ctx.names || !ctx.names[m[1]]) return false;
    }
  }
  return true;
}

// Plus une entrée est précise (sa famille, son métier, la disette…), plus elle a de
// chances : on entend d'abord ce qui LUI ressemble, les répliques de tout le monde en
// dernier. Ce qu'on le voit faire (la ligne « Activité » de la fiche) et son métier
// pèsent le plus : la pensée colle à ce que le joueur a sous les yeux (la plume,
// docs/PLAN-ECOUTER-PARLER.md, règle 7).
const weightOf = (e) => {
  const w = e.when || {};
  // « Pas ce métier-là » (`notJob`) écarte sans rien préciser : il ne compte pas.
  const n = Object.keys(w).filter((k) => k !== 'notJob').length;
  return 1 + 2 * n + (w.doing ? 6 : 0) + (w.job ? 4 : 0);
};

// L'échange choisi, ou null. Jamais une redite tant qu'il reste du neuf (règle 5) ;
// la réserve épuisée, le moins entendu.
export function pickParole(ctx, heard = {}, rand = Math.random, catalog = PAROLES) {
  const ok = catalog.filter((e) => parolesEligible(e, ctx));
  if (!ok.length) return null;
  const least = Math.min(...ok.map((e) => heard[e.id] | 0));
  const pool = ok.filter((e) => (heard[e.id] | 0) === least);
  let total = 0;
  for (const e of pool) total += weightOf(e);
  let x = rand() * total;
  let chosen = pool[pool.length - 1];
  for (const e of pool) { x -= weightOf(e); if (x < 0) { chosen = e; break; } }
  return { id: chosen.id, kind: chosen.kind, layer: chosen.layer, lines: resolveLines(chosen, ctx) };
}

// Les répliques prêtes à lire : qui parle ('a' ou 'b'), en français (accordé au genre de
// qui parle) et en anglais, prénoms posés.
export function resolveLines(e, ctx) {
  const kid = ctx.kidIs || 'b';
  const parent = kid === 'a' ? 'b' : 'a';
  const fill = (t, fr) => {
    let out = t;
    // L'élision devant un prénom à voyelle : « la lampe d'Aldis », « qu'Ilya ».
    if (fr) out = out.replace(ELIDE, (m, w, k) => (ctx.names && VOWEL.test(ctx.names[k] || '') ? `${w.slice(0, -1)}’{${k}}` : m));
    return out.replace(VAR, (m, k) => (ctx.names && ctx.names[k]) || m);
  };
  return e.lines.map((l) => {
    const who = e.kind === 'thought' ? 'a' : l.who === 'kid' ? kid : l.who === 'parent' ? parent : l.who;
    const sp = who === 'b' ? ctx.b : ctx.a;
    const fr = l.fr != null ? l.fr : (sp && sp.fem ? l.f : l.m);
    return { who, fr: fill(fr, true), en: fill(l.en, false) };
  });
}
