"use strict";
// ── TRANCHES DE SOL ADAPTATIVES — la hauteur suit le coût MESURÉ ─────────────
//
// Mesuré chez Raph le 2026-09-14 (trace du sol, mégapole, zoom 0,5) : le plein
// « en tranches » se découpait en DEUX tranches de 837 px à 65-80 ms chacune, et
// la pré-cuisson du plancher posait des tranches à 29 ms pour un budget affiché
// de 8. Cause commune : le NOMBRE de tranches était fixé d'avance d'après une
// estimation (dernier plein mesuré, à un autre zoom, plafonné à 8 tranches) —
// et une estimation fausse d'un facteur 4 donne des tranches 4× trop hautes,
// sans jamais se corriger en cours de route.
//
// Ici, la hauteur de la tranche SUIVANTE se déduit du coût de la tranche qui
// vient d'être cuite : ms par pixel de hauteur → hauteur qui tient dans le
// budget. Auto-correctif à la deuxième tranche, quel que soit le zoom, la ville
// ou la machine. Deux garde-fous : jamais moins de STRIP_MIN_PX (le coût fixe
// d'une tranche — clip, fond, calque de voirie — finirait par dominer), et
// jamais plus du double de la précédente (une tranche VIDE — ciel, hors-monde —
// coûte presque rien et autoriserait sinon une tranche géante juste après).
//
// Fonctions PURES, testées (solStrips.test.js). Consommées par
// runGroundSliceStep (plein en tranches, écran) et par la pré-cuisson (canvas
// tiers) dans isoGroundBake.js.

export const STRIP_BUDGET_MS = 8;   // une tranche par frame, à côté du reste de la frame
export const STRIP_MIN_PX = 16;
export const STRIP_MAX_N = 200;     // borne de la PREMIÈRE estimation seulement
// ⚠ La PREMIÈRE tranche est plafonnée : l'estimation vient d'un plein mesuré à
// un autre zoom et se trompe d'un facteur 4 sans prévenir (mesuré chez Raph au
// plancher 0,25 : premières tranches de 168-189 px à 53-55 ms, alors que les
// suivantes, adaptées, tenaient le budget). 64 px, c'est au plus ~4 rangées de
// cellules au zoom de jeu : une petite ville y perd une frame, une mégapole y
// gagne 45 ms de gel. L'adaptation fait grandir la tranche suivante (×2 max).
export const STRIP_FIRST_MAX_PX = 64;

// Hauteur de la première tranche, d'après une estimation du coût TOTAL (ms).
export function firstStripH(estMs, fullH, budgetMs = STRIP_BUDGET_MS, minPx = STRIP_MIN_PX, maxPx = STRIP_FIRST_MAX_PX) {
  if (!(fullH > 0)) return 0;
  const n = Math.max(1, Math.min(STRIP_MAX_N, Math.ceil((estMs > 0 ? estMs : budgetMs) / budgetMs)));
  return Math.max(minPx, Math.min(fullH, maxPx, Math.ceil(fullH / n)));
}

// Hauteur de la tranche suivante, d'après la précédente (hLast px → msLast ms).
export function nextStripH(msLast, hLast, budgetMs, remainingPx, minPx = STRIP_MIN_PX) {
  if (!(remainingPx > 0)) return 0;
  if (!(hLast > 0)) return Math.max(minPx, Math.min(remainingPx, minPx));
  let h;
  if (!(msLast > 0)) h = hLast * 2;                 // tranche gratuite : on grandit, mais pas plus que ×2
  else h = Math.min(hLast * 2, (budgetMs / (msLast / hLast)));
  return Math.max(minPx, Math.min(remainingPx, Math.round(h)));
}
