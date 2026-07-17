"use strict";

// LES VOLS OFFERTS — file partagée des billets pour Icare (state.icarusFreeFlights).
// Module FEUILLE volontaire, comme templeArtifacts.js et templePot.js : n'importe
// QUE state + balance → aucun cycle avec les moteurs qui l'écrivent (augures,
// scratch) ni celui qui la consomme (icarus, templeAutomation).
//
// FORME : une FILE d'ids de mise (['plume', 'hecatombe', …]), plafonnée à
// ICARUS_FREE_FLIGHTS_MAX. C'était un ENTIER avant le 2026-07-17 (donc un compteur
// de vols « Plume » implicites) : le Soleil du gratteux offre désormais un vol À LA
// HAUTEUR DU TICKET (obole → plume, talent → hécatombe), ce qu'un simple compteur
// ne peut pas porter. La migration de l'entier vit dans hydrateState (state.js).

import { state } from '../state.js';
import { ICARUS_FREE_FLIGHTS_MAX, FLIGHTS_MAX_COLOMBIER, ICARUS_STAKES } from '../balance.js';
import { hasTempleArtifact } from './templeArtifacts.js';

const VALID_IDS = ICARUS_STAKES.map((s) => s.id);

// Plafond de la file : le colombier (artefact) l'élargit de 5 à 8, pour que les
// billets gagnés (Vénus, Soleils) ne se perdent plus quand la file est pleine.
export function freeFlightCap() {
  return hasTempleArtifact("colombier") ? FLIGHTS_MAX_COLOMBIER : ICARUS_FREE_FLIGHTS_MAX;
}

// Id de mise reconnu ? (garde-fou d'hydratation ET de don : une save trafiquée ou
// un mapping cassé ne doit jamais injecter un vol à une mise qui n'existe pas.)
export function isFlightStakeId(id) {
  return VALID_IDS.includes(id);
}

// La file, toujours un tableau (défensif : une save d'avant la migration, ou
// corrompue, ne doit pas faire planter les moteurs).
export function freeFlightIds() {
  return Array.isArray(state.icarusFreeFlights) ? state.icarusFreeFlights : [];
}

// Combien de vols offerts, au total ou pour une mise donnée.
export function freeFlightCount(stakeId = null) {
  const q = freeFlightIds();
  return stakeId === null ? q.length : q.filter((id) => id === stakeId).length;
}

export function hasFreeFlight(stakeId) {
  return freeFlightCount(stakeId) > 0;
}

// Offre un vol à `stakeId`. Retourne false si l'id est inconnu ou si la file est
// pleine (le plafond porte sur le TOTAL, comme l'ancien compteur entier).
export function grantFreeFlight(stakeId) {
  if (!isFlightStakeId(stakeId)) return false;
  const q = freeFlightIds();
  if (q.length >= freeFlightCap()) return false;
  state.icarusFreeFlights = [...q, stakeId];
  return true;
}

// Consomme UN vol à `stakeId` (le premier de la file : premier offert, premier
// parti). Retourne false s'il n'y en a pas — le caller doit alors débiter la mise.
export function consumeFreeFlight(stakeId) {
  const q = freeFlightIds();
  const i = q.indexOf(stakeId);
  if (i < 0) return false;
  state.icarusFreeFlights = [...q.slice(0, i), ...q.slice(i + 1)];
  return true;
}
