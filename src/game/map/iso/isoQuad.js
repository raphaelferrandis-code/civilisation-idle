// LES CHEMINS DU REPÈRE MONDE — trois primitifs, et rien de plus.
//
// Extraits d'isoRenderer.js le 2026-08-23 (Q10). Le losange d'une cellule depuis
// son coin nord projeté, et le quad monde → écran, en version « remplis » et en
// version « ajoute un sous-chemin » (pour unir plusieurs quads avant un clip).
//
// ⚠ Petit module EXPRÈS. Il ne dépend que de la projection, donc tout le monde peut
// le lire : c'est ce qui débloque le PONT, le CHAMP et le PORT, dont `fillWorldQuad`
// était l'une des seules dépendances entrantes vers le peintre.
//
// ⚠ La projection est LINÉAIRE — un rectangle monde reste un parallélogramme écran.
// C'est ce qui autorise ces raccourcis ; ils tomberaient sous une projection qui ne
// l'est pas.
import { worldToScreen } from './projection.js';

// Losange d'une cellule à partir de son coin NORD projeté (évite 4 worldToScreen :
// les 4 sommets se déduisent du pas de grille, constant à zoom fixe).
export function diamondPath(ctx, nx, ny, hw, hh) {
  ctx.beginPath();
  ctx.moveTo(nx, ny);
  ctx.lineTo(nx + hw, ny + hh);
  ctx.lineTo(nx, ny + hh * 2);
  ctx.lineTo(nx - hw, ny + hh);
  ctx.closePath();
}

// Quad monde → écran (la projection est linéaire : un rectangle monde reste un
// parallélogramme écran). Sert aux rubans de chaussée.
export function fillWorldQuad(ctx, x0, y0, x1, y1) {
  const a = worldToScreen(x0, y0), b = worldToScreen(x1, y0);
  const c = worldToScreen(x1, y1), d = worldToScreen(x0, y1);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y);
  ctx.closePath();
  ctx.fill();
}
// Ajoute un quad monde comme SOUS-CHEMIN (sans beginPath/fill) → union de quads
// clippable (ruban de chaussée : pavé central + bras) puis clip + blit de la tuile.
export function pathWorldQuad(ctx, x0, y0, x1, y1) {
  const a = worldToScreen(x0, y0), b = worldToScreen(x1, y0);
  const c = worldToScreen(x1, y1), d = worldToScreen(x0, y1);
  ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y);
  ctx.closePath();
}

