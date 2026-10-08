"use strict";

// ÉCOUTER, PUIS PARLER — le registre (docs/PLAN-ECOUTER-PARLER.md).
//
// SEULE source de mutation de `state.paroles` (même modèle que faitsDivers.js) : la
// carte demande « qu'a-t-il déjà entendu ? » pour choisir un échange neuf
// (map/paroles/pick.js), puis « inscris-le » quand le joueur l'écoute.
import { state } from './state.js';
import { defaultParoles, defaultSigns, defaultDeclic, defaultMots, cityKey, TOI_MAX, SEEN_MAX, SAID_MAX, SIGN_KINDS, TALK_TONES } from './parolesState.js';
import { NOMS_DU_JOUEUR } from '../data/parolesToi.js';

const listeners = new Set();
export function onParoles(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function emit() {
  for (const fn of listeners) {
    try { fn(); } catch { /* abonné démonté entre-temps */ }
  }
}

export function parolesState() {
  if (!state.paroles) state.paroles = defaultParoles();
  const s = state.paroles;
  if (!Array.isArray(s.toi)) s.toi = [];
  if (!s.bulles) s.bulles = { cycle: 0, n: 0 };
  if (!s.signs) s.signs = defaultSigns();
  if (!Array.isArray(s.signs.seen)) s.signs.seen = [];
  if (!s.declic) s.declic = defaultDeclic();
  if (!s.mots) s.mots = defaultMots();
  return s;
}
// LA CITÉ de ce cycle (parolesState.cityKey : `cycles` repart à 0 au Grand Reset).
const cityNow = () => cityKey(state);
// Ce qui a déjà été entendu : { [id]: n } (lecture seule pour le choix).
export const parolesHeard = () => parolesState().heard;
// Combien d'échanges entendus en tout : la confiance de la troisième couche.
export const parolesTotal = () => parolesState().n | 0;
// Ce qu'on a dit du joueur et qu'il a entendu, le plus ancien d'abord (le panneau).
export const parolesToi = () => parolesState().toi;

// Le temps de jeu à vie, la même horloge que les faits divers et les frises.
const lifeSec = () => (state.chronicleStats && state.chronicleStats.lifetimePlaySec) || 0;

// Le joueur vient d'écouter cet échange. `toi` : s'il parlait de lui (troisième
// couche), ce qu'il faut pour le relire plus tard dans le panneau (parolesState.js).
export function parolesNoteHeard(id, toi = null) {
  if (typeof id !== 'string' || !id) return;
  const s = parolesState();
  s.heard[id] = (s.heard[id] | 0) + 1;
  s.n = (s.n | 0) + 1;
  if (toi) {
    s.toi.push({ id, at: lifeSec(), ...toi });
    if (s.toi.length > TOI_MAX) s.toi.splice(0, s.toi.length - TOI_MAX);
  }
  s.rev = (s.rev | 0) + 1;
  emit();
}

// Une bulle de pensée vient d'être cueillie sur la carte : la cité de ce cycle le
// sent (« j'avais une idée, elle est partie »).
export function parolesNoteBubble() {
  const s = parolesState();
  const cycle = cityNow();
  if (s.bulles.cycle !== cycle) s.bulles = { cycle, n: 0 };
  s.bulles.n += 1;
}
export function parolesBulles() {
  const b = parolesState().bulles;
  return b.cycle === cityNow() ? b.n | 0 : 0;
}

// LES SIGNES (lot 4) : le joueur vient d'en faire un. `id` : la pensée qu'il a fait
// naître, gardée avec ce qui a été entendu (jamais deux fois la même) ; elle ne compte
// pas dans la confiance (`n`), qui ne vient que de l'écoute. `seen` { act, who, fem } :
// ce que la cité en a vu, qui et ce qu'il a fait (elle en parlera en le nommant ; `ans` :
// il l'avait demandé et l'a eu, lot 5) ; `toi` : si sa pensée parlait du joueur, de quoi
// la relire dans le panneau.
export function parolesNoteSign(kind, id = null, { seen = null, toi = null } = {}) {
  if (!SIGN_KINDS.includes(kind)) return;
  const s = parolesState();
  const g = s.signs;
  const cycle = cityNow();
  if (g.cycle !== cycle) { g.cycle = cycle; g.here = {}; g.seen = []; }
  g.n = (g.n | 0) + 1;
  g.by[kind] = (g.by[kind] | 0) + 1;
  g.here[kind] = (g.here[kind] | 0) + 1;
  if (typeof id === 'string' && id) s.heard[id] = (s.heard[id] | 0) + 1;
  if (seen && seen.who && seen.act) {
    g.seen.push({ sign: kind, act: seen.act, who: seen.who, fem: !!seen.fem, at: lifeSec(), ...(seen.ans ? { ans: true } : {}) });
    if (g.seen.length > SEEN_MAX) g.seen.splice(0, g.seen.length - SEEN_MAX);
  }
  if (toi && typeof id === 'string' && id) {
    s.toi.push({ id, at: lifeSec(), ...toi });
    if (s.toi.length > TOI_MAX) s.toi.splice(0, s.toi.length - TOI_MAX);
  }
  s.rev = (s.rev | 0) + 1;
  emit();
}
// Ce que la cité de ce cycle a vu : { wind: n, … } (elle en parle).
export function parolesSignsHere() {
  const g = parolesState().signs;
  return g.cycle === cityNow() ? g.here : {};
}
// Qui elle a vu réagir, le plus ancien d'abord : [{ sign, act, who, fem, at }].
export function parolesSignsSeen() {
  const g = parolesState().signs;
  return g.cycle === cityNow() ? g.seen : [];
}

// LE DÉCLIC (lot 5) : le soir où Claude a dit « Mais quelqu'un écoute. ». Une fois par
// cité (chaque cité refait le chemin) ; le compte est éternel : Claude, lui, se souvient.
// Rend vrai s'il vient d'avoir lieu.
export function parolesNoteDeclic() {
  const s = parolesState();
  const city = cityNow();
  if (s.declic.city === city) return false;
  s.declic = { n: (s.declic.n | 0) + 1, city };
  s.rev = (s.rev | 0) + 1;
  emit();
  return true;
}
// A-t-il eu lieu dans cette cité ? Dans combien de cités en tout ?
export const parolesDeclicHere = () => parolesState().declic.city === cityNow();
export const parolesDeclics = () => parolesState().declic.n | 0;

// LES MOTS (lot 6) : le joueur vient de parler à un passant. `id` : l'échange (jamais
// deux fois le même, comme ce qu'on entend ; il ne compte pas dans la confiance, qui ne
// vient que de l'écoute). `said` { key, tone, belief, who, fem, voix } : sa réponse, sa
// voix (`tone`), ce qu'elle dit de lui, et à qui (la cité en parlera) ; `voix` : la
// réponse du répertoire qu'il a prise (comptée, elle ne revient qu'après les autres) ;
// `toi` : de quoi le relire dans le panneau « Ce qu'on dit de toi ».
export function parolesNoteTalk(id, said, toi = null) {
  if (typeof id !== 'string' || !id || !said || !TALK_TONES.includes(said.tone)) return;
  const s = parolesState();
  const m = s.mots;
  const city = cityNow();
  if (m.city !== city) { m.city = city; m.said = []; m.tones = {}; }
  s.heard[id] = (s.heard[id] | 0) + 1;
  if (typeof said.voix === 'string' && said.voix) s.heard[said.voix] = (s.heard[said.voix] | 0) + 1;
  m.n = (m.n | 0) + 1;
  m.tones[said.tone] = (m.tones[said.tone] | 0) + 1;
  if (said.who) {
    m.said.push({
      id, key: said.key, tone: said.tone, who: said.who, fem: !!said.fem, at: lifeSec(),
      ...(said.belief ? { belief: said.belief } : {}),
    });
    if (m.said.length > SAID_MAX) m.said.splice(0, m.said.length - SAID_MAX);
  }
  if (toi) {
    s.toi.push({ id, at: lifeSec(), ...toi });
    if (s.toi.length > TOI_MAX) s.toi.splice(0, s.toi.length - TOI_MAX);
  }
  s.rev = (s.rev | 0) + 1;
  emit();
}
// Ce que le joueur a dit dans cette cité : [{ id, key, tone, belief, who, fem, at }].
export function parolesSaid() {
  const m = parolesState().mots;
  return m.city === cityNow() ? m.said : [];
}
// Combien d'échanges en tout (éternel).
export const parolesTalks = () => parolesState().mots.n | 0;
// De quelle voix il a parlé dans cette cité : { joueur, dieu, indifferent, vie, muet }.
export function parolesTones() {
  const m = parolesState().mots;
  return m.city === cityNow() ? m.tones : {};
}

// CE QUE LA GAZETTE A DIT, dans ce cycle : les articles parus, et le dernier qui
// donne un nom au joueur (NOMS_DU_JOUEUR). Les habitants n'en savent jamais plus.
export function parolesKnown() {
  const entries = state.chronicleEntries || [];
  const articles = new Set();
  let nameId = null;
  // Du plus récent au plus ancien (chronicleEvaluator ajoute en tête).
  for (const e of entries) {
    const art = (e && (e.articleId || e.id)) || null;
    if (!art) continue;
    articles.add(art);
    if (!nameId && NOMS_DU_JOUEUR[art]) nameId = art;
  }
  return { articles, nameId };
}
// Le nom qu'ils te donnent aujourd'hui, { fr, Fr, en, En }, ou null.
export const parolesNameNow = () => {
  const { nameId } = parolesKnown();
  return nameId ? NOMS_DU_JOUEUR[nameId] : null;
};
