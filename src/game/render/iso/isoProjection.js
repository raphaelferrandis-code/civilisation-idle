/* ============================================================================
 * isoProjection.js — Conversion grille ↔ écran (cœur du placement iso).
 *
 *   Projection isométrique « 2:1 » classique (losange large 2× sa hauteur).
 *   Repère grille : (col, row) entiers ; repère écran local au conteneur monde :
 *   (x, y) en pixels. gridToScreen renvoie le CENTRE de la tuile (col,row).
 *
 *   Fonctions PURES (aucune dépendance Pixi) → testables et réutilisables par le
 *   placement (Phase 3) et le picking souris (clic → tuile).
 * ========================================================================== */

// Taille de tuile de référence. Définitive figée au manifeste (Phase 5).
export const TILE_W = 128;
export const TILE_H = 64;

/** (col,row) grille → centre (x,y) écran local. */
export function gridToScreen(col, row, tileW = TILE_W, tileH = TILE_H) {
  return {
    x: (col - row) * (tileW / 2),
    y: (col + row) * (tileH / 2)
  };
}

/** (x,y) écran local → (col,row) grille (fractionnaire ; arrondir pour la case). */
export function screenToGrid(x, y, tileW = TILE_W, tileH = TILE_H) {
  const a = x / (tileW / 2);
  const b = y / (tileH / 2);
  return {
    col: (a + b) / 2,
    row: (b - a) / 2
  };
}
