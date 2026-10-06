"use strict";
// ── LA FAÇADE D'INVALIDATION DU SOL — une porte, trois clés ─────────────────
//
// Lot 0 de PLAN-SOL-PYRAMIDE (2026-09-14). Dix-neuf sites du code invalident le
// sol : saison, ère, plage, relief, molettes de dev, canvas réalloués, décodage
// tardif d'un sprite. Avant, chacun écrivait l'état de l'ancien cache à la main
// — une invalidation oubliée est une panne MUETTE (le sol reste périmé jusqu'au
// prochain geste). Ici les sites disent CE QUI a changé ; le cache décide.
// Depuis le lot 4, le seul cache est la pyramide de tuiles (solPyramideFrame.js),
// abonnée par `setSolPyramideInvalidator`.
//
//   solInvalidate('all')           saison, bande d'ère, plage, relief, molettes,
//                                  canvas réalloués : tout est périmé
//   solInvalidate('soft')          décodage tardif (art, tuile, place) : périme
//                                  tout comme 'all', mais coalescé (une époque par
//                                  fenêtre de 250 ms) ; les tuiles périmées restent
//                                  affichées jusqu'à leur recuisson
//   solInvalidate('cells', set)    recompute de layout — la pyramide n'en a pas
//                                  besoin : elle re-juge chaque tuile sur la
//                                  signature de ses cellules (lot 3)
//
// Garde : solInvalidate.test.js — aucun autre module n'écrit d'état de sol.
// ⚠ Pas d'import de solPyramide.js ici (cycle : projection → façade → pyramide
// → projection) ; la pyramide vient s'abonner, c'est elle qui importe la façade.

let pyramidHook = null;

export function setSolPyramideInvalidator(fn) { pyramidHook = typeof fn === 'function' ? fn : null; }

export function solInvalidate(kind, cells = null) {
  if (pyramidHook) pyramidHook(kind, cells);
}
