"use strict";

// Effets des ARTEFACTS du Temple (Phase 4) — helpers de LECTURE lus par les
// moteurs (augures.js, icarus.js…). Module FEUILLE volontaire : n'importe QUE
// state → aucun cycle avec les moteurs qui l'importent. La logique d'ACHAT
// (buyTempleArtifact) vit dans faveurShop.js, l'arbre/dispatcher dans
// templeAutomation.js (qui ont besoin des gardes d'ère → évite le cycle ici).
// (Le dé d'ivoire, qui déformait les chances des osselets, a disparu au lot 1.)

import { state } from '../state.js';

// Possession d'un artefact booléen (osselet du noyé, plumes, solaires…).
export function hasTempleArtifact(id) {
  return Boolean(state.templeArtifacts && state.templeArtifacts[id]);
}
