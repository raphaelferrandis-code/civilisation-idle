// LES PETITS OUTILS DE PIXEL PARTAGÉS — modulo réel, canvas de travail, raster →
// canvas, mélange de deux couleurs RVB.
//
// Audit du 05/10 (STRUCT-9) : ces quatre gestes étaient recopiés de module en module
// (le modulo réel dix fois, sous quatre noms). Seules les copies STRICTEMENT identiques
// importent d'ici ; celles qui diffèrent d'un détail restent où elles sont — par
// exemple `mod` d'isoPixelPaint, qui arrondit d'abord à l'entier, ou la fabrique de
// canvas d'isoWildBackdrop, qui rend null sans DOM.
// La boîte d'encre d'une image (mesurée une fois, gardée par image) est inkBox, dans
// iso/isoArt.js.
//
// Module FEUILLE : aucun import, aucun DOM au chargement (les peintres purs, testés
// sous Node, peuvent le lire ; seules mkCanvas et rasterCanvas touchent au DOM, à
// l'appel).

// Modulo RÉEL : toujours dans [0, n), même pour a < 0 (`a % n` garde le signe), et
// SANS arrondi (nervures, vitrages et rayures en fraction de tour en ont besoin).
export const fm = (a, n) => ((a % n) + n) % n;

// Canvas de travail : OffscreenCanvas quand il existe, sinon un canvas du DOM.
export function mkCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}

// Raster RGBA { w, h, data } → canvas du DOM (un monument, un pont, la Maison cuits
// au pixel, prêts à bliter).
export function rasterCanvas(R) {
  const cv = document.createElement('canvas');
  cv.width = R.w; cv.height = R.h;
  cv.getContext('2d').putImageData(new ImageData(R.data, R.w, R.h), 0, 0);
  return cv;
}

// Mélange de deux couleurs [r, g, b] (0-255) → [r, g, b] arrondi. ⚠ Pas un mélange de
// chaînes '#hex' (mix de plaisirsHDKit), ni un mélange de HASH (mixHash).
export const mixRgb = (a, b, t) => [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)];
