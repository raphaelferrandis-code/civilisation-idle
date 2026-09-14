"use strict";
// ── LE SOL EN PYRAMIDE DE TUILES — l'interrupteur (lot 0) ────────────────────
//
// docs/PLAN-SOL-PYRAMIDE.md fait foi. Ce module reçoit la pyramide lot par
// lot : au lot 0 il ne porte que la MOLETTE d'A/B et le relevé de statistiques
// que la sonde de geste (scripts/sondeGeste.js, section `tuiles`) sait déjà
// lire. Tant que `SOL_PYRAMIDE.on` est faux — le défaut jusqu'au lot 4 — rien
// ne change pour le joueur : l'ancien cache (isoGroundBake.js) rend le sol.
//
//   __solPyramide(true)     allume la pyramide (rendu par tuiles, dès le lot 2)
//   __solPyramide(false)    l'ancien chemin — l'A/B en une frame
//   __solPyramideStats      cuites, ms par tuile, hits, replis étirés, sales

export const SOL_PYRAMIDE = { on: false };

// Relevé vivant, remis à zéro par la sonde ; rempli à partir du lot 2.
export const solPyramideStats = {
  cuites: 0, cuissonMs: 0, hits: 0, replis: 0, sales: 0, tuilesVisibles: 0, memoMo: 0,
};

if (typeof globalThis !== 'undefined') {
  globalThis.__solPyramide = (v) => { if (v != null) SOL_PYRAMIDE.on = v !== false; return SOL_PYRAMIDE.on; };
  globalThis.__solPyramideStats = solPyramideStats;
}
