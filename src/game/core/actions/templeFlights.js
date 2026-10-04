"use strict";

// LES VOLS OFFERTS — file partagée des billets pour Icare (state.icarusFreeFlights).
// Module FEUILLE volontaire, comme templeArtifacts.js et templePot.js : n'importe
// QUE state + balance + la table → aucun cycle avec les moteurs qui l'écrivent
// (augures, scratch, machine) ni celui qui la consomme (icarus, templeAutomation).
//
// FORME : une FILE de MONTANTS (la mise de chaque vol, en Faveur), plafonnée à
// ICARUS_FREE_FLIGHTS_MAX. Depuis le lot 1 (2026-10-04, mise libre), un vol se joue
// à la mise du coup qui l'a gagné (le Coup de Vénus, la roue, la Vénus des tickets),
// bornée par la limite haute de la table. Avant : une file d'ids de mise ('plume',
// 'aile', 'hecatombe'), et un entier encore avant ; les deux migrent dans state.js.

import { state } from '../state.js';
import { ICARUS_FREE_FLIGHTS_MAX, FLIGHTS_MAX_COLOMBIER } from '../balance.js';
import { hasTempleArtifact } from './templeArtifacts.js';
import { clampStake } from './maisonTable.js';

// Plafond de la file : le colombier (artefact) l'élargit de 5 à 8, pour que les
// billets gagnés ne se perdent plus quand la file est pleine.
export function freeFlightCap() {
  return hasTempleArtifact("colombier") ? FLIGHTS_MAX_COLOMBIER : ICARUS_FREE_FLIGHTS_MAX;
}

// La file brute (montants).
export function freeFlightQueue() {
  return Array.isArray(state.icarusFreeFlights) ? state.icarusFreeFlights : [];
}

// Nombre de vols en attente.
export function freeFlightCount() {
  return freeFlightQueue().length;
}

export function hasFreeFlight() {
  return freeFlightCount() > 0;
}

// Le prochain vol offert (son montant), ou 0.
export function nextFreeFlight() {
  const q = freeFlightQueue();
  return q.length ? q[0] : 0;
}

// Ajoute un billet à la mise donnée (bornée par la table). false si la file est
// pleine ou la mise invalide.
export function grantFreeFlight(stake) {
  const amount = clampStake(stake);
  if (amount <= 0) return false;
  const q = freeFlightQueue();
  if (q.length >= freeFlightCap()) return false;
  state.icarusFreeFlights = [...q, amount];
  return true;
}

// Retire le prochain billet et rend son montant (0 si la file est vide). Le montant
// est re-borné par la limite courante (une save trafiquée ne vole pas plus haut).
export function consumeFreeFlight() {
  const q = freeFlightQueue();
  if (!q.length) return 0;
  state.icarusFreeFlights = q.slice(1);
  return clampStake(q[0]);
}
