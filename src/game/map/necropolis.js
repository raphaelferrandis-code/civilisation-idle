"use strict";

// ── Nécropole (pur, sans Canvas) ─────────────────────────────────────────────
// Géométrie des cités mortes (state.vestiges) posées À L'OUEST de la ville vivante,
// hors les murs, dans un espace de coordonnées MONDE (px) INDÉPENDANT de la gridN.
// Juxtaposées en rangée : la plus RÉCENTE au plus près de la ville, les plus
// ANCIENNES plus loin à l'ouest. Déterministe (seed de la civ morte). Aucun rendu :
// expose seulement une géométrie (bbox monde + tombes) pour la caméra et le hit-test.

import { rngFrom } from './procedural/seedManager.js';

const GAP_TILES = 6;      // écart ville↔nécropole ET entre deux tombes (tuiles)
const SIZE_SCALE = 0.6;   // « version réduite » : la tombe est plus petite que la cité d'origine
const MIN_HALF = 3;       // demi-largeur mini (tuiles) — un campement mort reste lisible
const MAX_HALF = 14;      // demi-largeur maxi (tuiles) — une mégalopole morte reste bornée

function clampInt(v, min, max) { return Math.max(min, Math.min(max, Math.round(v))); }

// Construit la géométrie de la nécropole à partir de state.vestiges + du layout
// courant (résultat de computeCityLayout). `tile` = taille tuile monde (CM.TILE).
// Renvoie { present, tombs, bboxWorld } — tout en coordonnées MONDE (pixels).
export function buildNecropolis(state, layout, tile = 32) {
  const empty = { present: false, tombs: [], bboxWorld: null };
  if (!layout) return empty;
  const vestiges = (state && Array.isArray(state.vestiges)) ? state.vestiges : [];
  if (!vestiges.length) return empty;

  const T = tile || 32;
  const core = (layout.plan && layout.plan.core) ? layout.plan.core : { x: layout.cx, y: layout.cy };
  const coreWx = (Number(core.x) || 0) * T;
  const coreWy = (Number(core.y) || 0) * T;
  // Rayon urbain de la ville VIVANTE (tuiles) → la nécropole démarre juste à l'ouest.
  const cityRadiusTiles = Math.max(6, Math.round(Math.sqrt(layout.maxD2 || 0)) || Math.floor((layout.gridN || 20) / 2));

  const tombs = [];
  // Curseur X (monde) = bord EST de la rangée nécropole (ouest de la ville + écart).
  let cursorWx = coreWx - (cityRadiusTiles + GAP_TILES) * T;
  const lastIdx = vestiges.length - 1;

  // De la plus RÉCENTE (fin du tableau, la plus proche de la ville) à la plus ANCIENNE.
  for (let i = lastIdx; i >= 0; i -= 1) {
    const rec = vestiges[i];
    if (!rec) continue;
    const fp = rec.footprint || {};
    const halfTiles = clampInt((Number(fp.radius) || 5) * SIZE_SCALE, MIN_HALF, MAX_HALF);
    const halfWx = halfTiles * T;
    const seed = (Number(rec.mapSeed) >>> 0) || 1;
    const rng = rngFrom(seed, 'necropolis');
    const jitterY = (rng() - 0.5) * 4 * T; // ±2 tuiles vertical, seedé (jamais aligné au pixel)
    const centerWx = cursorWx - halfWx;
    const centerWy = coreWy + jitterY;
    tombs.push({
      record: rec,
      ageRank: i,                    // 0 = la plus ancienne
      recent: i === lastIdx,         // la plus récente (la plus proche de la ville)
      seed,
      eraBand: Number(rec.eraBand) || 0,
      eraIndex: Number(rec.eraIndex) || 0,
      halfTiles,
      centerWx, centerWy,
      bbox: {
        x0: centerWx - halfWx, y0: centerWy - halfWx,
        x1: centerWx + halfWx, y1: centerWy + halfWx
      }
    });
    // Décale le curseur vers l'ouest pour la tombe suivante (largeur + écart).
    cursorWx -= (halfTiles * 2 + GAP_TILES) * T;
  }

  // Boîte englobante monde (union) — caméra (Phase 4) + hit-test (Phase 6).
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const t of tombs) {
    if (t.bbox.x0 < x0) x0 = t.bbox.x0;
    if (t.bbox.y0 < y0) y0 = t.bbox.y0;
    if (t.bbox.x1 > x1) x1 = t.bbox.x1;
    if (t.bbox.y1 > y1) y1 = t.bbox.y1;
  }
  return { present: tombs.length > 0, tombs, bboxWorld: { x0, y0, x1, y1 } };
}
