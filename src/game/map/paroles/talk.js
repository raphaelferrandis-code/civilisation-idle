"use strict";

// PARLER (docs/PLAN-ECOUTER-PARLER.md, lot 6).
//
// Dès la période 3 de la gazette, la fiche propose « Parler » au passant désigné. Il entend
// une voix : il s'arrête, lève les yeux vers toi et le dit (sa première réplique) ; la
// fiche propose deux ou trois réponses courtes, et « Se taire ». Il répond à ce que tu as
// dit, selon son caractère, et fait ce que dit sa réponse (s'agenouiller, chercher des
// yeux, rentrer, repartir…, les gestes du lot 4 bis). Rien choisi au bout de `chooseMs` :
// c'est le silence qui répond. Une fois par passant : il a entendu la voix, il a dit ce
// qu'il avait à dire. La cité retient à qui tu as parlé et ta manière (core/paroles.js).
// L'échange en cours vit dans `CM.talking` ; la fiche le lit (talkView), le choix y revient
// (talkChoose). talkTick avance le tout à chaque frame (iso/isoSignes.js).
import { CM } from '../layout.js';
import { onCitizenFocus } from '../citizenFocus.js';
import { listenContext, toiRecord, stopListening, LISTEN } from './listen.js';
import { pickTalk, pickReply, resolveYou } from './pick.js';
import { reactTo, endReaction, signActs } from './signs.js';
import { parolesHeard, parolesNoteTalk } from '../../core/paroles.js';
import { getPeriod } from '../../core/chronicleEvaluator.js';

// fromPeriod : la période de la gazette où viennent les mots (§ 7.2). chooseMs : le temps
// laissé pour répondre, après sa première réplique (le temps de lire les réponses ;
// au-delà, il n'attend plus : il n'a entendu que le silence).
export const TALK = { fromPeriod: 3, chooseMs: 30000 };
if (import.meta.env?.DEV && typeof window !== 'undefined') {
  window.__talk = (o) => { if (o) Object.assign(TALK, o); return { ...TALK, on: !!CM.talking }; };
}

const clock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const eraNow = () => ((CM.layout && CM.layout.counts && CM.layout.counts.eraIndex) | 0);
const lineMs = () => LISTEN.lineMs;

// À qui l'on peut parler : un passant de la rue, qu'on voit, dehors, qui n'a pas encore
// entendu la voix, et qui ne réagit pas déjà à autre chose (un signe, sa demande).
function speakable(f) {
  if (!f || f.kind !== 'citizen') return false;
  const p = f.p;
  if (!p || p._talked || p._nightHidden || p._dead || p._riot || p._vanish !== undefined || p._enter || p.leaving) return false;
  if ((p.fade ?? 1) < 0.5) return false;
  if (p._react && p._react.act !== 'veille') return false;
  return true;
}
// Ce que la fiche propose : « Parler », ou rien. (Un échange possible se cherche une fois
// par passant et par seconde : le relevé de la fiche tourne dix fois par seconde.)
export function talkOffered(now = clock()) {
  if (CM.talking || getPeriod(eraNow()) < TALK.fromPeriod) return false;
  const f = CM.focus;
  if (!speakable(f)) return false;
  const p = f.p;
  const c = p._talkAvail;
  if (c && now - c.at < 1000) return c.ok;
  const ctx = talkContext(p);
  const ok = !!pickTalk(ctx, parolesHeard(), () => 0);
  p._talkAvail = { at: now, ok };
  return ok;
}
function talkContext(p) {
  const ctx = listenContext('thought', p, 'citizen');
  ctx.kind = 'talk';
  ctx.acts = signActs(p, false);
  return ctx;
}

// Lui parler. Rend vrai si l'échange commence.
export function startTalk(now = clock()) {
  if (!talkOffered(now)) return false;
  const p = CM.focus.p;
  const ctx = talkContext(p);
  const r = pickTalk(ctx, parolesHeard());
  if (!r) return false;
  stopListening();
  p._talked = true;
  const choices = r.entry.choices
    .map((c) => (pickReply(c.replies, ctx) ? { key: c.key, ...resolveYou(c.you, ctx) } : null))
    .filter(Boolean);
  // Sa première réplique, une à une ; puis les réponses.
  const lines = r.lines.map((l, i) => ({ who: 'a', fr: l.fr, en: l.en, at: now + i * lineMs() }));
  const chooseAt = now + Math.max(0, r.lines.length - 1) * lineMs() + 600;
  CM.talking = {
    p, id: r.id, entry: r.entry, ctx, name: ctx.names.a, lines, choices,
    chooseAt, until: chooseAt + TALK.chooseMs, said: null, act: null, actAt: 0, acted: false, doneAt: 0,
  };
  // Il s'arrête et lève les yeux vers toi, le temps de l'échange.
  reactTo(p, 'talk', { now, holdMs: CM.talking.until - now + 4 * lineMs() });
  return true;
}

// Ta réponse : `key` (une des réponses proposées) ou null (se taire).
export function talkChoose(key, now = clock()) {
  const T = CM.talking;
  if (!T || T.said || now < T.chooseAt - 600) return false;
  const c = key ? T.entry.choices.find((x) => x.key === key) : null;
  if (key && (!c || !T.choices.some((x) => x.key === key))) return false;
  const reply = pickReply(c ? c.replies : T.entry.silence, T.ctx);
  if (!reply) return false;
  T.said = { key: c ? c.key : 'silence', tone: c ? c.tone : 'muet', belief: (c && c.belief) || null };
  T.lines.push(c ? { who: 'you', ...resolveYou(c.you, T.ctx), at: now } : { who: 'you', silent: true, at: now });
  reply.lines.forEach((l, i) => T.lines.push({ who: 'a', fr: l.fr, en: l.en, at: now + (i + 1) * lineMs() }));
  T.act = reply.act;
  T.actAt = now + lineMs();
  T.doneAt = now + reply.lines.length * lineMs();
  // La cité retient à qui tu as parlé et ta manière ; le panneau garde l'échange (avec
  // les prénoms que citent sa première réplique, la tienne et sa réponse).
  const raw = (c ? c.replies : T.entry.silence)[reply.ri];
  const toi = toiRecord({ id: T.id }, T.ctx, { when: T.entry.when, lines: [...T.entry.lines, ...(c ? [c.you] : []), ...raw.lines] });
  parolesNoteTalk(T.id, { ...T.said, who: T.name, fem: !!(T.ctx.a && T.ctx.a.fem) }, { ...toi, talk: { key: T.said.key, ri: reply.ri } });
  return true;
}

// À chaque frame (iso/isoSignes.js) : le silence quand le temps de répondre est passé, et
// son geste quand sa réponse commence. L'échange fini, il reste lisible dans la fiche
// jusqu'à ce qu'on la referme ou qu'on désigne quelqu'un d'autre.
export function talkTick(now = clock()) {
  const T = CM.talking;
  if (!T) return null;
  const p = T.p;
  if (!p || p._dead || (CM.citizens && CM.citizens.indexOf(p) < 0)) { CM.talking = null; return null; }
  if (!T.said && now >= T.until) talkChoose(null, now);
  if (T.act && !T.acted && now >= T.actAt) {
    T.acted = true;
    reactTo(p, T.act, { now });
  }
  return T;
}

// Ce que la fiche affiche : les répliques déjà dites (lui, avec son prénom ; toi), les
// réponses quand c'est à toi, et si c'est fini.
export function talkView(now = clock()) {
  const T = CM.talking;
  if (!T || !CM.focus || CM.focus.p !== T.p) return null;
  return {
    lines: T.lines.filter((l) => l.at <= now).map((l) => ({ who: l.who, name: l.who === 'a' ? T.name : null, fr: l.fr || null, en: l.en || null, silent: !!l.silent })),
    choices: !T.said && now >= T.chooseAt ? T.choices.map((c) => ({ key: c.key, fr: c.fr, en: c.en })) : null,
    done: !!T.said && now >= T.doneAt,
  };
}

// On referme la fiche, ou l'on désigne quelqu'un d'autre : l'échange s'arrête là. S'il
// attendait ta réponse, il n'a entendu que le silence, et il reprend sa route.
export function stopTalk(now = clock()) {
  const T = CM.talking;
  if (!T) return;
  if (!T.said) {
    talkChoose(null, now);
    endReaction(T.p);
    T.p.pauseT = 0;
  } else if (!T.acted) {
    T.acted = true;
    reactTo(T.p, T.act, { now });
  }
  CM.talking = null;
}
onCitizenFocus((p) => {
  if (CM.talking && CM.talking.p !== p) stopTalk();
});
