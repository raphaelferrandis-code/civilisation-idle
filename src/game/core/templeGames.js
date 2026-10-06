"use strict";

// Pont UI UNIQUE des jeux du temple (osselets, Vol d'Icare, vingt-et-un,
// tickets à gratter, tables de la Maison…). UN SEUL jeu actif à la fois :
// ouvrir un jeu remplace le précédent dans la scène (RegulationStage, montée
// dans la Maison des Plaisirs par PlaisirsView). Chaque jeu garde sa propre
// forme de requête (`req`) ; la scène lit `game.kind` pour choisir quelle
// scène monter.
//
// Ouvrir depuis n'importe où (boutons de pari de la Cité, barre de crise…)
// bascule sur l'onglet des Plaisirs ; si la scène n'est pas encore montée (vue
// en cours de chargement), la requête est BUFFERISÉE et livrée à
// l'enregistrement.
//
// Les appelants passent par openTempleGame(kind) ; seul le pont des osselets
// (auguryTable.js, openAuguryTable(id)) reste un mince verbe sémantique qui
// délègue ici — c'est CE module qui détient « quel jeu est ouvert ».

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
  // MIGRATION 2026-08-06 : les jeux ont quitté le Temple pour la Maison des
  // Plaisirs. Cette ligne est la SEULE qui décide de l'onglet d'accueil —
  // d'où qu'on ouvre un jeu (hub, barre de crise, panneau des augures), on
  // atterrit désormais dans les Plaisirs.
  openView('plaisirs');
  if (setter) setter(game);
  else pending = game;
}

// Ferme le jeu actif (quel qu'il soit).
export function closeTempleStage() {
  pending = null;
  if (setter) setter(null);
}
