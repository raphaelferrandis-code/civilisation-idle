"use strict";

// ÉCOUTER, PUIS PARLER — le registre (docs/PLAN-ECOUTER-PARLER.md).
//
// SEULE source de mutation de `state.paroles` (même modèle que faitsDivers.js) : la
// carte demande « qu'a-t-il déjà entendu ? » pour choisir un échange neuf
// (map/paroles/pick.js), puis « inscris-le » quand le joueur l'écoute.
import { state } from './state.js';
import { defaultParoles, TOI_MAX } from './parolesState.js';
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
  return s;
}
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
  const cycle = state.cycles | 0;
  if (s.bulles.cycle !== cycle) s.bulles = { cycle, n: 0 };
  s.bulles.n += 1;
}
export function parolesBulles() {
  const b = parolesState().bulles;
  return b.cycle === (state.cycles | 0) ? b.n | 0 : 0;
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
