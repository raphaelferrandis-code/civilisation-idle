/**
 * CUISSON D'UNE ICÔNE D'UI À UNE TAILLE NATIVE — l'algorithme de
 * scripts/bakeUiIcons.cjs (qui REMPLACE une icône par sa version à la taille
 * d'écran) et de scripts/bakeUiIconSizes.cjs (qui pose des variantes @16/@24/…
 * à côté du maître). Les deux en tenaient une copie identique ; elle vit ici
 * (audit 2026-10-05, SCRIPT-11).
 *
 * MÉTHODE (pensée pour le pixel art, pas pour la photo) :
 *   1. boîte englobante des pixels opaques, mise à l'échelle `contain` vers la
 *      cible, centrée sur un canevas carré — même cadrage que `object-fit:
 *      contain` en CSS ;
 *   2. par pixel de sortie : moyenne de zone PONDÉRÉE PAR L'ALPHA du bloc source ;
 *   3. alpha binarisé au seuil de couverture — le pixel art veut des bords
 *      francs, pas une frange semi-transparente ;
 *   4. couleur = celle DU BLOC la plus proche de sa moyenne en OKLab. On ne
 *      fabrique donc jamais de teinte nouvelle : une moyenne brute ferait de la
 *      boue entre le rouge du sceau et la crème du parchemin.
 */
'use strict';

const { PNG } = require('pngjs');
const { oklab, labD2 } = require('./oklab.cjs');

const at = (img, x, y) => { const i = (img.width * y + x) << 2; return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]]; };

function bbox(img) {
  let x0 = img.width, y0 = img.height, x1 = -1, y1 = -1;
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
    if (at(img, x, y)[3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  return x1 < 0 ? { x0: 0, y0: 0, w: img.width, h: img.height } : { x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

// img : PNG (pngjs) ; size : côté du canevas de sortie ; alphaT : seuil de
// couverture (0..1) pour qu'un pixel existe. Rend { out, dw, dh } (dw×dh = la
// taille du contenu dans le canevas).
function bakeIcon(img, size, alphaT) {
  const bb = bbox(img);
  const s = Math.min(size / bb.w, size / bb.h);
  const dw = Math.max(1, Math.round(bb.w * s)), dh = Math.max(1, Math.round(bb.h * s));
  const ox = (size - dw) >> 1, oy = (size - dh) >> 1;

  const out = new PNG({ width: size, height: size });
  out.data.fill(0);

  for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
    const sx0 = bb.x0 + Math.floor(x * bb.w / dw);
    const sx1 = bb.x0 + Math.max(Math.floor(x * bb.w / dw) + 1, Math.floor((x + 1) * bb.w / dw));
    const sy0 = bb.y0 + Math.floor(y * bb.h / dh);
    const sy1 = bb.y0 + Math.max(Math.floor(y * bb.h / dh) + 1, Math.floor((y + 1) * bb.h / dh));

    let wr = 0, wg = 0, wb = 0, wa = 0, n = 0;
    const bloc = [];
    for (let sy = sy0; sy < sy1; sy++) for (let sx = sx0; sx < sx1; sx++) {
      const p = at(img, sx, sy);
      n++;
      if (p[3] > 8) { wr += p[0] * p[3]; wg += p[1] * p[3]; wb += p[2] * p[3]; wa += p[3]; bloc.push(p); }
    }
    if (!bloc.length || (n ? wa / (n * 255) : 0) < alphaT) continue; // bord franc

    const moy = oklab(Math.round(wr / wa), Math.round(wg / wa), Math.round(wb / wa));
    let best = bloc[0], bd = Infinity;
    for (const p of bloc) { const d = labD2(oklab(p[0], p[1], p[2]), moy); if (d < bd) { bd = d; best = p; } }

    const i = (size * (oy + y) + ox + x) << 2;
    out.data[i] = best[0]; out.data[i + 1] = best[1]; out.data[i + 2] = best[2]; out.data[i + 3] = 255;
  }
  return { out, dw, dh };
}

module.exports = { bbox, bakeIcon };
