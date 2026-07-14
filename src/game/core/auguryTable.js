"use strict";

// Pont UI de la Table des augures — la scène vit désormais EN BAS de la page
// Régulation (RegulationStage, plus de modale — retour Raph 2026-07-14).
// Ouvrir depuis n'importe où (boutons de pari de la Cité compris) bascule sur
// l'onglet Régulation ; si la scène n'est pas encore montée (vue en cours de
// chargement), la requête est BUFFERISÉE et livrée à l'enregistrement.

import { openView } from './state.js';

let setter = null;
let pending = null;

export function registerAuguryTable(fn) {
  setter = fn;
  if (pending) {
    fn(pending);
    pending = null;
  }
  return () => {
    if (setter === fn) setter = null;
  };
}

export function openAuguryTable(id) {
  const req = { id, openedAt: Date.now() };
  openView('regulation');
  if (setter) setter(req);
  else pending = req;
}

export function closeAuguryTable() {
  pending = null;
  if (setter) setter(null);
}
