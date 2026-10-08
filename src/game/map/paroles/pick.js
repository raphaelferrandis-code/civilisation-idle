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
//   names:  { a, b, conjoint, enfant, hote, voisin, voisine, gamin, gamine } — les
//           prénoms que les répliques citent, tous vrais (listen.js) ; { nom, Nom } :
//           le nom que la gazette donne au joueur, { fr, en } ;
//   et pour ce qu'on dit de toi (troisième couche) : trust (0 à 3), private,
//   period, articles (Set des articles parus dans ce cycle), followed, collapses,
//   manual, legacy, profile, away, plaisirs, bulles ;
//   et pour un signe (kind 'sign', lot 4) : sign ('wind' | 'light' | 'fire' |
//   'beast'), stage (1, 2, 3 : la fois), beast (la bête qui le fixe : 'dog'…) ; les
//   prénoms gagnent { bete, Bete } ({ fr, en }) et maitre ;
//   et pour la veillée et les demandes (lot 5, data/parolesVeillee.js) : veillee (la
//   causette de Claude au feu : Claude y est `a`), declic (il a eu lieu dans cette cité),
//   declics (dans combien de cités), fire (un feu près de lui), figure (un personnage de
//   scène) ; pour la réponse à une demande : answer ('yes' | 'other' | 'none') et asked
//   (le signe qu'il avait demandé).
// }
import { PAROLES, JOB_GROUP } from '../../data/paroles.js';
import { PAROLES_SIGNES } from '../../data/parolesSignes.js';
import { VEILLEE_JOB } from '../../data/parolesVeillee.js';

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

// Ceux qui n'ont que LEURS pensées : Claude, le gardien du feu (lot 5), ne pense pas
// comme un passant.
const OWN_ONLY = new Set([VEILLEE_JOB]);

export function parolesEligible(e, ctx) {
  if (e.kind !== ctx.kind) return false;
  // Le déclic ne se tire pas : il vient, à la première écoute de la veillée (listen.js).
  if (e.forced) return false;
  // Un signe (lot 4) : la pensée de CE signe (ou de l'un d'eux, ou de n'importe lequel), à
  // cette fois-ci, et dont il peut faire le geste (`ctx.acts` : pas « je rentre » pour qui
  // n'a pas de logis, pas « je vais au temple » sans temple, lot 4 bis). La réponse à une
  // demande (lot 5) : celle de ce qui s'est passé, quelle que soit la fois.
  if (e.kind === 'sign') {
    if (ctx.answer || e.answer) {
      if (e.answer !== ctx.answer) return false;
    } else if (e.stage !== ctx.stage) return false;
    if (e.sign && (Array.isArray(e.sign) ? !e.sign.includes(ctx.sign) : e.sign !== ctx.sign)) return false;
    if (ctx.acts && !ctx.acts.includes(e.act)) return false;
  }
  const [lo, hi] = e.bands || [0, 9];
  if (ctx.band < lo || ctx.band > hi) return false;
  const w = e.when || {};
  const a = ctx.a, b = ctx.b;
  if (w.beast && !w.beast.includes(ctx.beast)) return false;
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
  // CE QU'ON DIT DE TOI (troisième couche, lot 2) : on y pense avant d'en parler
  // (§ 4.3). Une pensée sur le joueur demande un peu de confiance, une causette
  // davantage, et à l'écart (la nuit, hors de la place, du marché et du travail) ;
  // le taciturne n'en parle jamais.
  if (e.layer === 3) {
    if ((ctx.trust | 0) < Math.max(e.kind === 'chat' ? 2 : 1, w.trust | 0)) return false;
    if (e.kind === 'chat' && (!ctx.private || (a.traits || []).includes('quiet'))) return false;
  } else if (w.trust && (ctx.trust | 0) < w.trust) return false;
  if (w.period && ((ctx.period | 0) < w.period[0] || (ctx.period | 0) > w.period[1])) return false;
  if (w.article && !w.article.some((id) => ctx.articles && ctx.articles.has(id))) return false;
  if (w.followed && !ctx.followed) return false;
  if (w.collapses && (ctx.collapses | 0) < w.collapses) return false;
  if (w.manual && !ctx.manual) return false;
  if (w.legacy && w.legacy !== ctx.legacy) return false;
  if (w.profile && w.profile !== ctx.profile) return false;
  if (w.away && !ctx.away) return false;
  if (w.plaisirs && !ctx.plaisirs) return false;
  if (w.bulles && !ctx.bulles) return false;
  // LA VEILLÉE (lot 5) : Claude et celui qui veille avec lui ont leurs causettes à eux, et
  // elles ne se disent qu'au feu ; Claude ne pense que ses pensées de gardien du feu.
  if (e.kind === 'chat' && !!w.veillee !== !!ctx.veillee) return false;
  if (OWN_ONLY.has(a.job) && e.kind !== 'chat' && !(w.job && w.job.includes(a.job))) return false;
  if (w.declic != null && !!ctx.declic !== w.declic) return false;
  if (w.declics && (ctx.declics | 0) < w.declics) return false;
  if (w.fire && !ctx.fire) return false;
  if (w.dry && ctx.precip) return false;
  if (w.asked && w.asked !== ctx.asked) return false;
  // On demande un signe en s'arrêtant pour l'attendre : un passant de la rue, pas un
  // personnage de scène (il ne quitte pas sa scène).
  if (e.request && ctx.figure) return false;
  // Ce que la cité a vu (lot 4) : un signe, un geste, et qui l'a reçu ({temoin}).
  const ev = w.seen ? ctx.seenBy && ctx.seenBy[w.seen] : null;
  if (w.seen && !ev) return false;
  if (!childOk(e, ctx)) return false;
  // Une causette se joue à deux.
  if (e.kind === 'chat' && !b) return false;
  // Il ne nomme personne qu'il n'a pas (un célibataire ne parle pas de sa femme).
  for (const l of e.lines) {
    for (const t of textsOf(l)) {
      for (const m of t.matchAll(VAR)) {
        if (m[1] === 'temoin' && ev) continue;
        if (!ctx.names || !ctx.names[m[1]]) return false;
      }
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
  // Ce qu'on dit de toi est rare (la confiance, l'écart) : quand ça vient, ça passe.
  // La pensée écrite pour CE signe passe devant celle qui vaut pour tous.
  // Une demande de signe (lot 5) vient assez souvent pour qu'on y réponde.
  return 1 + 2 * n + (w.doing ? 6 : 0) + (w.job ? 4 : 0) + (e.layer === 3 ? 4 : 0) + (e.sign ? 3 : 0) + (e.request ? 6 : 0);
};

// L'échange choisi, ou null. Jamais une redite tant qu'il reste du neuf (règle 5) ;
// la réserve épuisée, le moins entendu.
export function pickParole(ctx, heard = {}, rand = Math.random, catalog = PAROLES) {
  const ok = catalog.filter((e) => parolesEligible(e, ctx));
  if (!ok.length) return null;
  return chooseFrom(ok, ctx, heard, rand);
}

// LES SIGNES (lot 4) : la pensée qu'un signe fait naître. Les règles de l'écoute (pas
// de redite tant qu'il reste du neuf, la précision l'emporte), et deux de plus (§ 5.3) :
// le caractère fait la lecture, ce qui est écrit pour SON caractère (ou pour un enfant)
// passe d'abord tant qu'il en reste de neuf ; et le taciturne regarde et ne dit rien,
// il n'a que ses mots à lui.
export function pickSign(ctx, heard = {}, rand = Math.random, catalog = PAROLES_SIGNES) {
  let ok = catalog.filter((e) => parolesEligible(e, ctx));
  if ((ctx.a.traits || []).includes('quiet')) {
    const own = ok.filter((e) => e.when && e.when.trait === 'quiet');
    if (own.length) ok = own;
  }
  if (!ok.length) return null;
  const mine = ok.filter((e) => e.when && (e.when.trait || e.when.child === true) && !(heard[e.id] | 0));
  return chooseFrom(mine.length ? mine : ok, ctx, heard, rand);
}

function chooseFrom(ok, ctx, heard, rand) {
  const least = Math.min(...ok.map((e) => heard[e.id] | 0));
  const pool = ok.filter((e) => (heard[e.id] | 0) === least);
  let total = 0;
  for (const e of pool) total += weightOf(e);
  let x = rand() * total;
  let chosen = pool[pool.length - 1];
  for (const e of pool) { x -= weightOf(e); if (x < 0) { chosen = e; break; } }
  return {
    id: chosen.id, kind: chosen.kind, layer: chosen.layer, act: chosen.act || null, request: chosen.request || null,
    lines: resolveLines(chosen, ctx),
  };
}

// Les répliques prêtes à lire : qui parle ('a' ou 'b'), en français (accordé au genre de
// qui parle) et en anglais, prénoms posés.
export function resolveLines(e, ctx) {
  const kid = ctx.kidIs || 'b';
  const parent = kid === 'a' ? 'b' : 'a';
  // Un prénom est le même dans les deux langues ; le nom que la gazette te donne
  // ({nom}, {Nom}) s'écrit dans chacune : { fr, en }.
  const nameOf = (k, fr) => {
    // Le témoin d'un signe : celui que la cité a vu (lot 4), sinon le prénom gardé.
    if (k === 'temoin') {
      const ev = e.when && e.when.seen && ctx.seenBy ? ctx.seenBy[e.when.seen] : null;
      if (ev) return ev.who;
    }
    const v = ctx.names && ctx.names[k];
    return v && typeof v === 'object' ? (fr ? v.fr : v.en) : v;
  };
  const fill = (t, fr) => {
    let out = t;
    // L'élision devant un prénom à voyelle : « la lampe d'Aldis », « qu'Ilya ».
    if (fr) out = out.replace(ELIDE, (m, w, k) => (VOWEL.test(nameOf(k, true) || '') ? `${w.slice(0, -1)}’{${k}}` : m));
    return out.replace(VAR, (m, k) => nameOf(k, fr) || m);
  };
  return e.lines.map((l) => {
    const who = e.kind === 'thought' ? 'a' : l.who === 'kid' ? kid : l.who === 'parent' ? parent : l.who;
    const sp = who === 'b' ? ctx.b : ctx.a;
    const fr = l.fr != null ? l.fr : (sp && sp.fem ? l.f : l.m);
    return { who, fr: fill(fr, true), en: fill(l.en, false) };
  });
}
