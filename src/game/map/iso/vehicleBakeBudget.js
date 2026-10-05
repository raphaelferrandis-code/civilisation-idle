"use strict";
// ── LE BUDGET DE CUISSON DES VÉHICULES, EN MILLISECONDES (audit du 05/10, PERF-14) ──
//
// Les bateaux de la flotte, les bateaux à quai et les voitures du métro se cuisent à la
// demande, à chaque nouveau cap ou nouvelle pose : 10 à 38 ms pour un marchand, 4 à 8 ms
// pour une voiture. Le budget se comptait EN NOMBRE (3 bateaux et 4 voitures par frame),
// et la première image de chacun passait outre : une flotte qui vire, un changement
// d'ère ou la première vue du port enchaînaient les cuissons dans la même frame (+45 à
// +115 ms, plusieurs centaines au port).
//
// Désormais UN budget en temps, partagé par les trois : une cuisson part tant que la
// frame n'a pas dépensé `ms` — la première toujours (un gros porteur ne tiendrait
// jamais dans 3 ms). Ce qui ne passe pas garde sa dernière image (le cap d'avant, l'ère
// d'avant) ou attend une frame de plus : un cap de retard ne se voit pas, un hoquet si.
//
// Molette : __boatKit({ budgetMs }) (boatKit.js).
export const VEHICLE_BAKE = { ms: 3 };

const clock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
let _frame = NaN, _wall = 0, _spent = 0;

// Une cuisson peut-elle partir cette frame ? `now` = l'horloge de la FRAME, la même
// pour tous les véhicules d'une frame. Une horloge figée (capture `{ now }`) repart à
// neuf au bout d'une demi-seconde de vrai temps : sinon, la capture suivante ne
// cuirait plus rien.
export function vehicleBakeOpen(now) {
  const t = clock();
  if (now !== _frame || t - _wall > 500) { _frame = now; _wall = t; _spent = 0; }
  return _spent < VEHICLE_BAKE.ms;
}

// Cuit (fn) en portant sa durée au budget de la frame.
export function vehicleBakeTimed(fn) {
  const t0 = clock();
  try { return fn(); } finally { _spent += clock() - t0; }
}
