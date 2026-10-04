"use strict";
// La dernière mise jouée, par table (lot 1 des gains « vrai casino ») : « Même mise »
// la reprend, et une table rouverte repart de là. Mémoire de module, comme celle de
// la machine à sous. Hors du composant TableMise : un fichier de composant qui
// exporte aussi des fonctions casse le Fast Refresh (react-refresh/only-export-components).
import { tableLimits, chipRack } from '../../../game/core/actions/maisonTable.js';

const lastStakes = {};

export function rememberStake(game, stake) {
  if (stake > 0) lastStakes[game] = stake;
}

export function lastStakeOf(game) {
  return lastStakes[game] || 0;
}

// Les derniers PARIS d'une table à plusieurs cases (la roulette du lot 3) : { clé: mise }.
const lastBets = {};
export function rememberBets(game, bets) {
  if (bets && Object.keys(bets).length) lastBets[game] = { ...bets };
}
export function lastBetsOf(game) {
  return lastBets[game] ? { ...lastBets[game] } : null;
}

// La mise de départ d'une table : la dernière jouée (si la bourse la couvre), sinon
// un jeton raisonnable — l'avant-dernier du râtelier (~1/5 de la limite), et pas plus
// d'un cinquième de la Faveur — toujours ramenée dans les limites du moment (elles
// grandissent avec la ville).
export function initialStake(game, faveur = Infinity) {
  const { min, max } = tableLimits();
  const last = lastStakes[game];
  if (last && last <= faveur) return Math.max(min, Math.min(max, last));
  const rack = chipRack(max);
  const usual = rack.length > 1 ? rack[rack.length - 2] : min;
  const budget = Math.max(min, Math.min(usual, faveur / 5));
  const pick = rack.filter((v) => v <= budget).pop() || min;
  return Math.max(min, Math.min(max, pick));
}

// Une mise s'écrit en ENTIER (« 25 », « 2 500 »), compacte seulement au-delà du
// million : le format général du jeu (« 1.0 », « 5.0 ») fait mauvais effet sur un jeton.
export { fmtHabitants as fmtMise } from '../../../game/core/utils.js';
