"use strict";
// ── BUDGET DE CUISSON PAR IMAGE (audit 2026-10-05, PERF-9) ───────────────────
//
// Au passage d'une bande d'ère, au premier hiver, à un changement de rang, TOUT ce
// qui se cuit à la demande (merveilles, îlot de l'Aiguille, lieux, moulins…) partait
// dans la même image : 0,2 à 0,4 s de cuissons empilées sur le recalcul de la ville,
// au moment précis où le joueur regarde sa ville.
//
// Le principe, partagé par ces peintres : au plus BAKE_BUDGET.ms de cuisson de
// variantes NEUVES par image. Au-delà, un objet qui a DÉJÀ une variante affichée (la
// bande, la saison ou le rang d'avant) la garde encore une image ou deux ; un objet
// qui n'a jamais été montré cuit tout de suite, comme avant. Au repos, le rendu est
// donc identique au pixel : seul le moment de la bascule s'étale.
//
// ⚠ Une cuisson ne se coupe pas en morceaux : une variante chère (l'îlot, ~0,1 s)
// prend son image à elle. Le budget ne fait qu'éviter que tout tombe dans la même.
//
// ⚠ En capture (CM.capture) et hors du peintre (tests, outils), le budget est
// illimité : un cliché est complet et déterministe.
import { CM } from '../layout.js';

export const BAKE_BUDGET = { ms: 8 };

// L'HORLOGE D'IMAGES : drawIsoWorld pose un tableau NEUF dans CM._wonderBoxes en
// tête de chaque image (isoRenderer, drawIsoWorldInner — jamais null, même en LOD).
// Son identité suffit à savoir qu'une nouvelle image a commencé, sans rien ajouter
// au peintre.
let _stamp = null, _spent = 0;
function sync() {
  const s = CM._wonderBoxes;
  if (s !== _stamp) { _stamp = s; _spent = 0; }
}

// Reste-t-il du budget pour cuire une variante neuve dans cette image ?
export function bakeBudgetOk() {
  if (CM.capture || !CM._wonderBoxes) return true;
  sync();
  return _spent < BAKE_BUDGET.ms;
}

// Cuisson chronométrée, imputée au budget de l'image en cours.
export function bakeTimed(fn) {
  sync();
  const t0 = performance.now();
  try { return fn(); } finally { _spent += performance.now() - t0; }
}
