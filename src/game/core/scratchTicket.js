"use strict";

// Pont UI des tickets à gratter — mince verbe sémantique qui délègue au pont
// UNIQUE des jeux du temple (templeGames.js). Ouvrir bascule sur l'onglet
// Régulation et monte la scène de grattage (bufferisé si la vue n'est pas encore
// prête). Cf. auguryTable.js / icarusDialog.js — même patron.

import { openTempleGame, closeTempleStage } from './templeGames.js';

export function openScratch() {
  openTempleGame('scratch');
}

export function closeScratch() {
  closeTempleStage();
}
