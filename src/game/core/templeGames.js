"use strict";

// Pont UI UNIQUE des jeux du temple (osselets, Vol d'Icare, et les jeux à
// venir — blackjack, tickets à gratter…). UN SEUL jeu actif à la fois : ouvrir
// un jeu remplace le précédent dans la scène (RegulationStage, en bas de la
// page Régulation). Chaque jeu garde sa propre forme de requête (`req`) ; la
// scène lit `game.kind` pour choisir quelle scène monter.
//
// Ouvrir depuis n'importe où (boutons de pari de la Cité, barre de crise…)
// bascule sur l'onglet Régulation ; si la scène n'est pas encore montée (vue en
// cours de chargement), la requête est BUFFERISÉE et livrée à l'enregistrement.
//
// Les ponts par jeu (auguryTable.js, icarusDialog.js, …) ne sont plus que de
// minces verbes sémantiques (openAuguryTable(id), openIcarusFlight()) qui
// délèguent ici — c'est CE module qui détient « quel jeu est ouvert ».

import { openView } from './state.js';

let setter = null;
let pending = null;

// La scène (RegulationStage) s'enregistre au montage et reçoit le jeu actif
// (l'objet { kind, openedAt, …req }) ou null à la fermeture. Retourne un
// désabonnement pour le démontage.
export function registerTempleStage(fn) {
  setter = fn;
  if (pending) {
    fn(pending);
    pending = null;
  }
  return () => {
    if (setter === fn) setter = null;
  };
}

// Ouvre un jeu du temple. `kind` : 'augury' | 'icarus' | … ; `req` : charge
// utile propre au jeu (ex. { id } pour la table d'osselets). `openedAt` sert de
// clé de réinitialisation aux scènes (une réouverture repart à zéro).
export function openTempleGame(kind, req = {}) {
  const game = { kind, openedAt: Date.now(), ...req };
  openView('regulation');
  if (setter) setter(game);
  else pending = game;
}

// Ferme le jeu actif (quel qu'il soit).
export function closeTempleStage() {
  pending = null;
  if (setter) setter(null);
}
