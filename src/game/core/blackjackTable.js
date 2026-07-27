"use strict";

// Pont UI du Vingt-et-un — mince verbe sémantique qui délègue au pont UNIQUE des
// jeux du temple (templeGames.js). Ouvrir bascule sur l'onglet Régulation et
// monte la scène du blackjack (bufferisé si la vue n'est pas encore prête).
// Le moteur (actions/blackjack.js) reste autoritaire : rouvrir la scène pendant
// une main la REPREND en cours (l'état module n'a pas bougé).

import { openTempleGame } from './templeGames.js';

export function openBlackjack() {
  openTempleGame('blackjack');
}
