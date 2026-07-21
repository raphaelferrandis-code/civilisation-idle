"use strict";

import { D } from './num.js';
import { eras } from '../data/world.js';

/* ============================================================================
 * demographics.js — Compteur « Habitants » PUREMENT COSMÉTIQUE.
 *
 * La ressource-moteur `state.population` (renommée « Rayonnement » à l'écran)
 * est exponentielle : elle vise 10³⁵ et alimente TOUS les calculs (production,
 * seuils d'ère, synergies). On n'y touche pas. Mais lue comme un nombre
 * d'habitants, elle devient absurde dès l'ère 3 (un « Clan » à 56 000, un
 * « Hameau » à 8,7 millions).
 *
 * Ce module dérive un nombre d'HABITANTS crédible, calé sur la fiction de
 * chaque ère, à afficher À CÔTÉ du moteur. Aucun effet de jeu : rien ici
 * n'est relu par la simulation.
 *
 * Méthode : à chaque seuil d'ère on ancre une population humaine plausible
 * (HAB_ANCHORS). Entre deux ères, on interpole GÉOMÉTRIQUEMENT selon la
 * progression LOG de `population` dans l'ère courante (même mesure que
 * nextEraProgress) → courbe continue aux frontières d'ère, monotone.
 * ========================================================================== */

// Habitants plausibles au SEUIL D'ENTRÉE de chaque ère (index 0 → 34).
// Départ calé sur 10 (= population initiale) ; ~×2 à ×2,5 par ère. Le « monde
// humain » (campement → empire) reste crédible ; les dernières ères assument
// l'échelle planétaire/cosmique que leur texte revendique (« titan de métal »).
export const HAB_ANCHORS = [
  10,        // 0  Campement
  24,        // 1  Grand Feu
  52,        // 2  Abris
  120,       // 3  Clans
  280,       // 4  Maîtrise du bois
  620,       // 5  Hameau
  1350,      // 6  Hameau protégé
  3000,      // 7  Village
  6500,      // 8  Les Entrepôts
  14000,     // 9  Bourg agricole
  30000,     // 10 Bourg des artisans
  63000,     // 11 Bourg marchand
  130000,    // 12 Cité marchande
  270000,    // 13 Cité commerciale
  560000,    // 14 Cité portuaire
  1.15e6,    // 15 Cité fortifiée
  2.3e6,     // 16 Cité administrative
  4.6e6,     // 17 Principauté
  9e6,       // 18 Principauté marchande
  1.8e7,     // 19 Royaume
  3.6e7,     // 20 Royaume diplomate
  7e7,       // 21 Royaume savant
  1.4e8,     // 22 Royaume conquérant
  2.8e8,     // 23 Empire naissant
  5.5e8,     // 24 Empire provincial
  1.1e9,     // 25 Empire
  2.2e9,     // 26 Capitale impériale
  4.4e9,     // 27 Capitale monumentale
  8.5e9,     // 28 Agglomération impériale
  1.7e10,    // 29 Métropole
  3.5e10,    // 30 Mégalopole
  7e10,      // 31 Mégalopole stratifiée
  1.5e11,    // 32 Réseau continental
  3e11,      // 33 Machination
  6e11       // 34 Singularité
];

// Au-delà de la Singularité (ères transcendantes), on prolonge la courbe
// géométriquement plutôt que de plafonner sec.
const TRANSCEND_MULT = 2.2;

function anchorAt(i) {
  const last = HAB_ANCHORS.length - 1;
  if (i <= 0) return HAB_ANCHORS[0];
  if (i <= last) return HAB_ANCHORS[i];
  return HAB_ANCHORS[last] * Math.pow(TRANSCEND_MULT, i - last);
}

/**
 * Nombre d'habitants crédible dérivé de la ressource-moteur.
 * @param {import('break_infinity.js').default|number|string} population
 * @returns {number} habitants affichables (≥ 1), jamais Infinity/NaN.
 */
export function crediblePopulation(population) {
  const pop = D(population);

  // Ère courante : plus grand i tel que population ≥ eras[i].at (comparaison
  // Decimal, jamais de coercion native). Early-exit (seuils croissants).
  let e = 0;
  for (let i = 0; i < eras.length; i += 1) {
    if (pop.gte(eras[i].at)) e = i; else break;
  }

  // Progression LOG dans l'ère (identique à nextEraProgress, mais sans lire
  // l'état global : on reste pur pour la testabilité). log10() renvoie un
  // number même pour les seuils Decimal des ères transcendantes.
  const l0 = D(eras[e].at).max(1).log10();
  const next = eras[e + 1];
  const l1 = next ? D(next.at).max(1).log10() : l0 + 1;
  const lp = pop.max(1).log10();
  const frac = l1 > l0 ? Math.max(0, Math.min(1, (lp - l0) / (l1 - l0))) : 0;

  // Interpolation géométrique entre les deux ancres.
  const a0 = anchorAt(e);
  const a1 = anchorAt(e + 1);
  const result = a0 * Math.pow(a1 / a0, frac);
  return Number.isFinite(result) ? Math.max(1, result) : a0;
}
