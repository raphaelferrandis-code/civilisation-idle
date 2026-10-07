"use strict";

// ÉCOUTER, PUIS PARLER — le registre (docs/PLAN-ECOUTER-PARLER.md).
//
// SEULE source de mutation de `state.paroles` (même modèle que faitsDivers.js) : la
// carte demande « qu'a-t-il déjà entendu ? » pour choisir un échange neuf
// (map/paroles/pick.js), puis « inscris-le » quand le joueur l'écoute.
import { state } from './state.js';
import { defaultParoles } from './parolesState.js';

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
  return state.paroles;
}
// Ce qui a déjà été entendu : { [id]: n } (lecture seule pour le choix).
export const parolesHeard = () => parolesState().heard;
// Combien d'échanges entendus en tout : la confiance de la troisième couche (lot 2).
export const parolesTotal = () => parolesState().n | 0;

// Le joueur vient d'écouter cet échange.
export function parolesNoteHeard(id) {
  if (typeof id !== 'string' || !id) return;
  const s = parolesState();
  s.heard[id] = (s.heard[id] | 0) + 1;
  s.n = (s.n | 0) + 1;
  s.rev = (s.rev | 0) + 1;
  emit();
}
