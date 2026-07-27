"use strict";

// Effets des ARTEFACTS du Temple (Phase 4) — helpers de LECTURE lus par les
// moteurs (augures.js, icarus.js). Module FEUILLE volontaire : n'importe QUE
// state + balance → aucun cycle avec augures/icarus qui l'importent. La logique
// d'ACHAT (buyTempleArtifact) vit dans faveurShop.js, l'arbre/dispatcher dans
// templeAutomation.js (qui ont besoin des gardes d'ère → évite le cycle ici).

import { state } from '../state.js';
import { IVORY_DOG_CUT, IVORY_VENUS_BONUS } from '../balance.js';

// Possession d'un artefact booléen (dé d'ivoire, osselet du noyé, plumes, solaires).
export function hasTempleArtifact(id) {
  return Boolean(state.templeArtifacts && state.templeArtifacts[id]);
}

// Dé d'ivoire — refonte de VARIANCE des osselets (lue dans auguryTierOdds) :
//  - coupe la part du Chien DANS les pertes (moitié moins de catastrophes) ;
//  - relève la part de Vénus DANS les gains.
// pEff (taux de victoire) reste INCHANGÉ — c'est un profil de risque, pas un boost.
export function ivoryDogCut() {
  return hasTempleArtifact("ivoire") ? IVORY_DOG_CUT : 0;
}
export function ivoryVenusBonus() {
  return hasTempleArtifact("ivoire") ? IVORY_VENUS_BONUS : 0;
}
