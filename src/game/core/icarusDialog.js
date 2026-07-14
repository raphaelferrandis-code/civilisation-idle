"use strict";

// Pont UI du Vol d'Icare — même pattern que auguryTable.js : la scène vit en
// bas de la page Régulation (RegulationStage, plus de modale). Requête
// bufferisée si la vue n'est pas encore montée.

import { openView } from './state.js';

let setter = null;
let pending = null;

export function registerIcarusFlight(fn) {
  setter = fn;
  if (pending) {
    fn(pending);
    pending = null;
  }
  return () => {
    if (setter === fn) setter = null;
  };
}

export function openIcarusFlight() {
  const req = { openedAt: Date.now() };
  openView('regulation');
  if (setter) setter(req);
  else pending = req;
}

export function closeIcarusFlight() {
  pending = null;
  if (setter) setter(null);
}
