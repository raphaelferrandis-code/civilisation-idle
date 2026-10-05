"use strict";

// ── FILET D'EXCEPTION DE LA CARTE (audit du 2026-10-05, BUG-32) ──────────────
// La boucle de la carte ré-arme son rAF AVANT de travailler (cityMapRuntime,
// `frame`) : une exception dans une passe ne l'arrête donc pas, elle se REJOUE à
// chaque image — 30 à 60 fois par seconde dans la console, carte figée sur une
// image partielle. Tombée entre un save() et son restore(), elle laissait en plus
// sur le contexte principal un clip, une transformation ou un mode de composition
// qu'aucune frame ne relevait, et la pile d'états grossissait d'une frame à
// l'autre. Ce module porte les deux gestes du filet : journaliser sans inonder,
// et rendre au contexte son état de base.
//
// Feuille SANS dépendance (comme framePerf.js) : testable sans monter la carte.

// Un même poste ne journalise pas plus d'une fois par fenêtre ; les occurrences
// tues entre-temps sont comptées dans le message suivant.
export const MAP_ERROR_LOG_MS = 5000;
// Délai avant de retenter un calcul du plan qui a levé : un essai coûte 130 à
// 560 ms — le rejouer à chaque frame faisait tomber toute l'interface à quelques
// images par seconde.
export const LAYOUT_RETRY_MS = 5000;

const _seen = new Map();   // poste → { at, muted }

// Journalise l'exception `e` du poste `where` — au plus une fois par
// MAP_ERROR_LOG_MS. On passe l'Error ELLE-MÊME à la console : la pile s'y affiche,
// et l'outil de développement la ramène aux sources. `now` : horloge MONOTONE
// (performance.now), pas l'horodatage de frame — une capture passe le sien.
// Renvoie true quand le message est parti.
export function reportMapError(where, e, now = performance.now(), log = console.error) {
  const st = _seen.get(where);
  if (st && now >= st.at && now - st.at < MAP_ERROR_LOG_MS) { st.muted += 1; return false; }
  const muted = st ? st.muted : 0;
  _seen.set(where, { at: now, muted: 0 });
  log('[carte] ' + where + ' : exception' + (muted ? ' (+' + muted + ' tue(s) depuis le dernier message)' : '') + ' —', e);
  return true;
}

// Rend au contexte principal l'état où le laisse un redimensionnement
// (cityMapResizeCanvas) : pile dépilée, transformation dpr, composition normale.
// ⚠ PAS ctx.reset() : il viderait aussi le BITMAP. Sur une erreur fugace, la carte
// clignoterait à vide ; sur une erreur qui se répète, elle resterait vide au lieu
// de garder son image. On dépile donc (restore() sur une pile vide ne fait rien),
// puis on repose à la main ce qu'une passe a pu changer HORS d'une paire
// save/restore (les ombres de nuages passent en multiply et reviennent à la main).
const UNWIND_MAX = 64;
export function resetMapCtx(ctx, dpr = 1) {
  if (!ctx) return;
  for (let i = 0; i < UNWIND_MAX; i += 1) ctx.restore();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  // ⚠ TRUE, et non false : c'est la valeur d'un canvas fraîchement alloué, donc
  // celle de CHAQUE frame normale. Le pixel net se règle site par site (chaque
  // blit pose false puis rend la valeur précédente) ; plusieurs blits héritent
  // de l'état courant. Poser false ici aurait changé leur rendu après la
  // première erreur, jusqu'au prochain redimensionnement.
  ctx.imageSmoothingEnabled = true;
  if ('filter' in ctx) ctx.filter = 'none';
}

// Recouvrement d'une frame interrompue : le message (limité), puis le contexte.
// Ne lève jamais — un contexte perdu ne doit pas faire tomber le filet lui-même.
export function recoverMapFrame(e, ctx, dpr, log) {
  reportMapError('frame', e, performance.now(), log);
  try { resetMapCtx(ctx, dpr); } catch { /* contexte perdu : rien de plus à faire */ }
}
