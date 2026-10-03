"use strict";

/* ============================================================================
 * places.js — QUELS LIEUX SONT OUVERTS.
 *
 * Source unique pour la barre de navigation (App.jsx) et pour les chapitres de
 * l'Aide (Options › Aide) : un chapitre se lit quand son lieu est découvert,
 * jamais avant — l'Aide ne doit pas annoncer ce que le rail cache encore.
 * Deux copies de ces conditions finiraient par diverger ; d'où ce module.
 *
 * Module PUR : il lit l'état qu'on lui passe (sélecteurs de useGameState).
 * ==========================================================================*/

import { uiRevealed } from './uiReveal.js';

const pastFirstFall = (s) => (s?.cycles || 0) >= 1 || (s?.grandResetCount || 0) > 0;

export const PLACE_UNLOCKS = {
  city: () => true,
  // LE JEU QUI SE DÉVOILE (uiReveal.js) : pendant la toute première partie, la
  // Régulation et l'Effondrement arrivent avec la tension, les Plaisirs avec
  // leur premier jeu jouable. Hors première partie, toujours vrai.
  regulation: (s) => uiRevealed(s, 'tension'),
  plaisirs: (s) => uiRevealed(s, 'plaisirs'),
  // Jamais caché pendant une crise terminale : c'est alors le SEUL lieu ouvert.
  prestige: (s) => uiRevealed(s, 'tension') || Boolean(s?.crisisLimitAnnounced),
  ruinsView: pastFirstFall,
  // Boutique : au 1er effondrement — ou dès qu'on détient de la Faveur (gagnable
  // aux jeux du temple dès le cycle 0), sinon elle serait indépensable.
  tech: (s) => pastFirstFall(s) || (s?.faveur || 0) > 0,
  mythView: (s) => (s?.grandResetCount || 0) >= 1,
  // « Le Comptoir » : l'onglet Marchandage, héritage du Mythe de l'Âge d'Or.
  comptoir: (s) => Boolean(s?.orHeritage),
  history: () => true
};

/** Le lieu `id` est-il ouvert ? Un id inconnu est considéré ouvert. */
export function placeUnlocked(s, id) {
  const test = PLACE_UNLOCKS[id];
  return test ? Boolean(test(s)) : true;
}
