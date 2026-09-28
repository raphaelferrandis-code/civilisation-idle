"use strict";
// ── L'OMBRE DU SOLEIL ────────────────────────────────────────────────────────
//
// Lot 1 de docs/PLAN-LUMIERE-RELIEF.md (2026-09-14). La scène n'a aucun modèle
// de lumière : chaque sprite porte la sienne, cuite, et rien ne les relie au sol.
// Ici, la SILHOUETTE d'un sprite est couchée sur le plan du sol vers le
// bas-droite (soleil haut-gauche, la DA figée) : chaque point du sprite est
// décalé proportionnellement à sa hauteur au-dessus du pied — c'est une
// PROJECTION, pas une translation (celle du pont marche parce que le pont est
// plat). Une tour projette loin, une hutte tout près : la hauteur des masses
// devient visible sans un sprite de plus.
//
// ⚠ CE N'EST PAS UNE MARQUE DE CONTACT. Les trois refus de Raph (ellipse, socle,
// dalle) portaient sur une tache SOUS l'objet qui dit « il touche le sol ». L'ombre
// solaire dit « il y a un soleil et cet objet a une hauteur ». Activée lors de
// la reprise visuelle du 21 septembre, avec une portée et une intensité réduites.
//
// Approximation 2D : la silhouette est couchée dans le plan de l'écran juste
// avant son item ; les sprites suivants l'occultent. Ce n'est pas un calcul
// d'ombre 3D sur les façades ou les différentes terrasses.
// Elle s'efface avec la nuit (pas de soleil ; les lampes ne projettent rien) et
// se saute en LOD (au dézoom elle ferait un pixel de bruit par objet).
//
// Molette : __sunShadow({ on, kx, ky, alpha, col, mode })
//   kx, ky = décalage du SOMMET par pixel de hauteur, vers la droite et vers le
//            bas. Une portée courte garde les rues lisibles ; la composante
//            verticale plus faible suit l'écrasement du plan isométrique.
//   alpha  = dose ; col = teinte (froide : le ciel dans l'ombre, jamais du noir).
import { CM } from '../layout.js';

// mode 'multiply' : l'ombre ASSOMBRIT le sol en gardant sa texture (pavé, herbe) —
// un voile posé par-dessus (source-over) la lisait comme de la peinture. En
// multiply la couleur EST le facteur d'assombrissement (0,55-0,7 par canal,
// froid) ; alpha reste la dose.
export const SUN_SHADOW = { on: true, kx: 0.32, ky: 0.20, alpha: 0.52, col: '#8e96ad', mode: 'multiply' };
if (typeof window !== 'undefined') {
  window.__sunShadow = (o) => {
    if (o === false) SUN_SHADOW.on = false;
    else if (o === true) SUN_SHADOW.on = true;
    else if (o) { Object.assign(SUN_SHADOW, o); if (o.col) _sil = new WeakMap(); }
    return { ...SUN_SHADOW };
  };
}

// Silhouettes teintées, une par (image, recadrage source) — même recette que
// bridgeSilhouette : le sprite peint en aplat via 'source-in', une fois pour
// toutes. WeakMap sur l'image : un canvas de teinte ou de saison qui meurt
// emporte sa silhouette.
let _sil = new WeakMap();
function silhouette(img, sx, sy, sw, sh) {
  let m = _sil.get(img);
  if (!m) { m = new Map(); _sil.set(img, m); }
  const k = sx + ':' + sy + ':' + sw + ':' + sh;
  let c = m.get(k);
  if (c !== undefined) return c;
  c = null;
  try {
    if (typeof document !== 'undefined' && sw > 0 && sh > 0) {
      const cv = document.createElement('canvas');
      cv.width = sw; cv.height = sh;
      const cx = cv.getContext('2d');
      cx.imageSmoothingEnabled = false;
      cx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      cx.globalCompositeOperation = 'source-in';
      cx.fillStyle = SUN_SHADOW.col;
      cx.fillRect(0, 0, sw, sh);
      c = cv;
    }
  } catch { c = null; }                    // image pas décodée, pas de DOM : pas d'ombre
  // Une image en cours de décodage doit pouvoir réessayer à la frame suivante.
  if (c) m.set(k, c);
  return c;
}

// Alpha effectif de la frame : nul la nuit, en LOD, ou molette éteinte.
export function sunShadowAlpha() {
  if (!SUN_SHADOW.on || CM.lodActive) return 0;
  const n = CM.nightF || 0;
  return SUN_SHADOW.alpha * Math.max(0, 1 - n * 1.6);
}

// Couche l'ombre du sprite dont la boîte ÉCRAN dessinée est (dx, dy, dw, dh)
// (source (sx, sy, sw, sh) dans `img`, par défaut l'image entière). La rangée
// du BAS de la boîte reste sur place (c'est le pied) ; le haut part en bas à
// droite de (kx·dh, ky·dh). À appeler juste AVANT le blit du sprite.
export function drawSunShadow(ctx, img, dx, dy, dw, dh, sx = 0, sy = 0, sw = 0, sh = 0, footY = 1) {
  const a = sunShadowAlpha();
  if (a <= 0 || !img || dw <= 0 || dh <= 0) return;
  if (!sw) sw = img.naturalWidth || img.width || 0;
  if (!sh) sh = img.naturalHeight || img.height || 0;
  const sil = silhouette(img, sx, sy, sw, sh);
  if (!sil) return;
  const { kx, ky } = SUN_SHADOW;
  ctx.save();
  // Conserve les fondus de naissance et de visibilité du peintre appelant.
  ctx.globalAlpha *= a;
  if (SUN_SHADOW.mode) ctx.globalCompositeOperation = SUN_SHADOW.mode;
  ctx.imageSmoothingEnabled = false;
  // Repère local (u, v) de la boîte : v = dh au pied → (dx + u, dy + dh) ;
  // v = 0 au sommet → (dx + u + kx·dh, dy + dh + ky·dh). `transform` compose
  // avec l'échelle dpr du contexte, `setTransform` l'écraserait.
  const ground = dh * footY;
  ctx.transform(1, 0, -kx, -ky, dx + kx * ground, dy + ground + ky * ground);
  ctx.drawImage(sil, 0, 0, sw, sh, 0, 0, dw, dh);
  ctx.restore();
}
