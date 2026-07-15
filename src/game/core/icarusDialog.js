"use strict";

// Pont UI du Vol d'Icare — mince verbe sémantique qui délègue au pont UNIQUE
// des jeux du temple (templeGames.js). Ouvrir bascule sur l'onglet Régulation
// et monte la scène du crash game (bufferisé si la vue n'est pas encore prête).
// Le moteur (actions/icarus.js) reste autoritaire : rouvrir pendant un vol le
// REPREND en cours (le timer de chute n'a jamais cessé de courir).

import { openTempleGame, closeTempleStage } from './templeGames.js';

export function openIcarusFlight() {
  openTempleGame('icarus');
}

export function closeIcarusFlight() {
  closeTempleStage();
}
