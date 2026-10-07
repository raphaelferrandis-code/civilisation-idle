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
import { CM } from '../layout.js';
import { onCitizenFocus, identityOfPick, cityConcern } from '../citizenFocus.js';
import { householdOf, memberOf, ageRange } from '../citizenIdentity.js';
import { WINTER } from '../seasonMode.js';
import { pickParole } from './pick.js';
import { parolesHeard, parolesNoteHeard } from '../../core/paroles.js';

// lineMs : le temps d'une réplique (lue, puis la suivante).
export const LISTEN = { lineMs: 2800 };
if (import.meta.env?.DEV && typeof window !== 'undefined') {
  window.__listen = (o) => { if (o) Object.assign(LISTEN, o); return { ...LISTEN }; };
}

const bandNow = () => ((CM.layout && CM.layout.counts && CM.layout.counts.eraBand) | 0);
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
// Les prénoms que les répliques citent : les leurs, celui du conjoint, d'un enfant, de
// l'hôte — les vrais, ceux du foyer de la fiche.
function namesOf(A, B) {
  const names = { a: A.id.given };
  if (B) names.b = B.id.given;
  const line = A.id.line, hh = A.hh;
  if (line && hh) {
    if (line.kind === 'married') names.conjoint = memberOf(hh, line.other) && memberOf(hh, line.other).given;
    if ((line.kind === 'married' || line.kind === 'single') && hh.kids.length) names.enfant = hh.kids[0].given;
    if (line.kind === 'lodger' || line.kind === 'nephew') names.hote = memberOf(hh, line.host) && memberOf(hh, line.host).given;
  }
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
export function listenContext(kind, p, focusKind) {
  const band = bandNow();
  const A = personOf(focusKind, p, band);
  const q = kind === 'chat' ? talkingPartner(p) : null;
  const B = q ? personOf(q.scene ? 'figure' : focusKind, q, band) : null;
  const wet = (CM.rainF || 0) > 0.15;
  return {
    kind,
    band,
    night: (CM.nightF || 0) > 0.55,
    precip: wet ? ((CM.season | 0) === WINTER ? 'snow' : 'rain') : null,
    riot: Array.isArray(CM.rioters) && CM.rioters.length > 0,
    wonder: !!(CM.wonderGatherCells && CM.wonderGatherCells.length),
    prosper: (CM.healthF ?? 0.6) >= 0.75,
    cause: cityConcern(),
    a: A.view,
    b: B ? B.view : null,
    ...relOf(A, B),
    names: namesOf(A, B),
    partner: q,
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
  const r = pickParole(ctx, parolesHeard());
  if (!r) return false;
  parolesNoteHeard(r.id);
  const q = ctx.partner;
  // Ils restent là le temps de l'échange : la causette d'un salut se prolonge. Les
  // compagnons, eux, causent en marchant.
  if (kind === 'chat' && q && p._chatWith === q) {
    const s = (r.lines.length * LISTEN.lineMs + 800) / 1000;
    p.pauseT = Math.max(p.pauseT || 0, s); q.pauseT = Math.max(q.pauseT || 0, s);
    p.chatT = Math.max(p.chatT || 0, s); q.chatT = Math.max(q.chatT || 0, s);
  }
  // `lineMs` voyage avec l'écoute : la marque de la carte (citizenFocus) la lit sans
  // importer ce module (il importe citizenFocus : pas de cycle).
  CM.listening = {
    p, q: kind === 'chat' ? q : null, kind, id: r.id, lines: r.lines, t0: clock(), lineMs: LISTEN.lineMs,
    names: { a: ctx.names.a, b: ctx.names.b || null },
  };
  return true;
}
export function stopListening() {
  CM.listening = null;
}

// Ce que la fiche affiche : les répliques déjà dites, avec qui les dit.
export function listenView(now = clock()) {
  const L = CM.listening;
  if (!L || !CM.focus || CM.focus.p !== L.p) return null;
  const n = L.lines.length;
  const shown = Math.max(1, Math.min(n, 1 + Math.floor((now - L.t0) / LISTEN.lineMs)));
  return {
    kind: L.kind,
    id: L.id,
    lines: L.lines.slice(0, shown).map((l) => ({ who: l.who, name: l.who === 'b' ? L.names.b : L.names.a, fr: l.fr, en: l.en })),
    done: now - L.t0 >= n * LISTEN.lineMs,
  };
}

// Désigner quelqu'un d'autre, ou fermer la fiche, coupe l'écoute.
onCitizenFocus((p) => {
  if (CM.listening && CM.listening.p !== p) CM.listening = null;
});
