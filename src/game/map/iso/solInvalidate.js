"use strict";
// ── LA FAÇADE D'INVALIDATION DU SOL — une porte, trois clés ─────────────────
//
// Lot 0 de PLAN-SOL-PYRAMIDE (2026-09-14). Jusqu'ici, dix-neuf sites du code
// invalidaient le sol EN ÉCRIVANT DIRECTEMENT l'état du bake :
// `CM._isoGroundBake = null` (dure : on recuit tout) ou `.soft = true`
// (douce : un sprite décodé en retard, le contenu reste valable, on recuit
// coalescé). Ça marchait parce qu'il n'y avait qu'UN cache. La pyramide de
// tuiles en ajoute un second, avec ses propres règles (tout / par cellules /
// doux par tuile) — dix-neuf sites à mettre à jour deux fois, c'est dix-neuf
// occasions d'en oublier un, et une invalidation oubliée est une panne MUETTE
// (le sol reste périmé jusqu'au prochain geste). D'où cette façade : les sites
// disent CE QUI a changé, les caches décident quoi jeter.
//
//   solInvalidate('all')           saison, bande d'ère, plage, relief, molettes,
//                                  canvas réalloué : tout est périmé
//   solInvalidate('soft')          décodage tardif (art, tuile, place) : le
//                                  contenu reste valable, recuisson coalescée
//   solInvalidate('cells', set)    (lot 3) recompute de layout : seules les
//                                  cellules de `set` ont changé. Tant que la
//                                  pyramide ne sait pas les cibler, vaut 'all'.
//
// ⚠ L'ancien cache (`CM._isoGroundBake`, isoGroundBake.js) reste le SEUL à
// écrire son propre état pendant la cuisson ; ici on ne fait que l'invalider,
// exactement comme les sites le faisaient — byte-identique en comportement.
// Garde : solInvalidate.test.js refuse toute écriture directe ailleurs.
//
// La pyramide s'abonne par `setSolPyramideInvalidator(fn)` (pas d'import de
// solPyramide.js ici : ce module est importé par projection.js et les modules
// de sol, un import croisé fermerait un cycle).
import { CM } from '../layout.js';
// Import d'EFFET : solPyramide.js pose la molette `__solPyramide` et le relevé
// `__solPyramideStats` — sans cet import, personne ne le charge et la molette
// n'existe pas en prod (vu au lot 0 : « __solPyramide is not a function »).
import './solPyramide.js';

let pyramidHook = null;

export function setSolPyramideInvalidator(fn) { pyramidHook = typeof fn === 'function' ? fn : null; }

export function solInvalidate(kind, cells = null) {
  if (kind === 'soft') {
    if (CM._isoGroundBake) CM._isoGroundBake.soft = true;
  } else {
    // 'all' et, jusqu'au lot 3, 'cells' : invalidation dure de l'ancien cache.
    CM._isoGroundBake = null;
  }
  if (pyramidHook) pyramidHook(kind, cells);
}
