"use strict";

// L'AFFLUENCE DE LA MAISON (2026-10-04) : quand la troupe joue (un spectacle payé, ou
// toute la Nuit du Grand Jeu), la salle se remplit et la caisse se remplit
// SPECTACLE_AFFLUENCE fois plus vite. Module FEUILLE (il ne lit que l'état) : la caisse
// (offeringTrunk.js) et la Nuit (nuitGrandJeu.js) le lisent sans s'importer l'une
// l'autre.

import { state } from '../state.js';
import { SPECTACLE_AFFLUENCE } from '../balance.js';

// La fenêtre du spectacle en cours ou passé : [début, fin[ en ms (0 : aucun).
function fenetre() {
  const d = Number(state.spectacleDebut) || 0;
  const f = Number(state.spectacleFin) || 0;
  return f > d ? [d, f] : null;
}

export function spectacleActif(now = Date.now()) {
  const w = fenetre();
  return !!w && now >= w[0] && now < w[1];
}

// Les SECONDES de recettes gagnées EN PLUS entre t0 et t1 (ms) grâce à la salle pleine.
export function affluenceEntre(t0, t1) {
  const w = fenetre();
  if (!w) return 0;
  const a = Math.max(t0, w[0]);
  const b = Math.min(t1, w[1]);
  return b > a ? ((b - a) / 1000) * (SPECTACLE_AFFLUENCE - 1) : 0;
}
