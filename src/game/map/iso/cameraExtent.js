import { ISO_X, ISO_Y } from './projection.js';

// L'écran rectangulaire voit un losange en coordonnées monde. Borner seulement
// le centre expose les extrémités du fleuve, même avec quelques cases de marge.
export function cameraExtent(cw, ch, x0, x1, relief = 0) {
  const halfAtOne = cw / (4 * ISO_X) + ch / (4 * ISO_Y);
  const pad = relief / (2 * ISO_Y);
  const span = Math.max(1, x1 - x0 - 2 * pad);
  return {
    minZoom: 2 * halfAtOne / span,
    clampX(x, zoom) {
      const half = halfAtOne / zoom + pad;
      const lo = x0 + half, hi = x1 - half;
      return lo > hi ? (x0 + x1) / 2 : Math.max(lo, Math.min(hi, x));
    },
  };
}
