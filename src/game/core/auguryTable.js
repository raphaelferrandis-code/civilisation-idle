"use strict";

// Pont UI de la Table des augures — mince verbe sémantique qui délègue au pont
// UNIQUE des jeux du temple (templeGames.js), lequel détient « quel jeu est
// ouvert ». Ouvrir depuis n'importe où (boutons de pari de la Cité, barre de
// crise…) bascule sur l'onglet Régulation et monte la scène des osselets ;
// bufferisé si la vue n'est pas encore prête (cf. templeGames.js).

import { openTempleGame, closeTempleStage } from './templeGames.js';

export function openAuguryTable(id) {
  openTempleGame('augury', { id });
}

export function closeAuguryTable() {
  closeTempleStage();
}
