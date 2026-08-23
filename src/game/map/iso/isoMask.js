"use strict";
// MASQUES D'OCCULTATION — « ce pixel de l'écran est-il derrière de la matière ? »
//
// Né de Q11 (2026-08-23). La passe fantôme redessine une unité qu'un bâtiment recouvre,
// et le test de recouvrement se faisait sur la BOÎTE D'ENCRE du bâtiment. Or une boîte
// est un RECTANGLE autour d'une silhouette isométrique : ses coins sont vides. Une
// unité qui tombe dans un coin — mesuré : un attelage sur le pont, sous la boîte d'une
// maison de la rive — passait pour cachée et se faisait redessiner sur elle-même.
//
// ⚠⚠ LE MASQUE NE COÛTE AUCUNE RASTÉRISATION. Les deux peintres qui publient une boîte
// mesurent DÉJÀ l'encre de leur sprite, donc lisent déjà un `getImageData` :
// `pixelHouses` pour cadrer l'habitation, `isoEngineScene.engineInkFrac` pour rogner la
// scène moteur. Le masque sort de CETTE lecture-là, et se mémoïse sur la même clé.
//
// Le masque est exprimé DANS L'ESPACE DE LA BOÎTE (0..1 sur chaque axe), pas dans
// celui du sprite : le consommateur n'a donc rien à savoir du rectangle source, de
// l'échelle de dessin ni du recadrage. Il donne un point écran, on répond.

// Résolution du masque : au-delà, on paie de la mémoire pour une précision que
// personne ne regarde — on tranche « caché / pas caché », pas un contour.
const MASK_MAX = 48;

// Construit un masque depuis un `getImageData` déjà lu.
//   data/dw/dh : le tampon source et ses dimensions
//   x0,y0,w,h  : le sous-rectangle qui correspond EXACTEMENT à la boîte publiée
// Renvoie { w, h, a: Uint8Array } — 1 = matière, 0 = vide.
export function maskFromImageData(data, dw, dh, x0, y0, w, h) {
  if (!data || !(w > 0) || !(h > 0)) return null;
  const mw = Math.max(1, Math.min(MASK_MAX, Math.round(w)));
  const mh = Math.max(1, Math.min(MASK_MAX, Math.round(h)));
  const a = new Uint8Array(mw * mh);
  for (let my = 0; my < mh; my += 1) {
    // Centre de la case, pas son coin : sur un masque grossier, échantillonner le
    // coin décale la silhouette d'un demi-pas vers le haut-gauche.
    const sy = Math.min(dh - 1, Math.max(0, Math.floor(y0 + ((my + 0.5) / mh) * h)));
    for (let mx = 0; mx < mw; mx += 1) {
      const sx = Math.min(dw - 1, Math.max(0, Math.floor(x0 + ((mx + 0.5) / mw) * w)));
      // Seuil bas : une ombre portée translucide CACHE quand même ce qu'il y a
      // derrière. On cherche « y a-t-il de la matière », pas « est-ce opaque ».
      if (data[(sy * dw + sx) * 4 + 3] >= 16) a[my * mw + mx] = 1;
    }
  }
  return { w: mw, h: mh, a };
}

// Le point écran (px, py) tombe-t-il sur de la matière de cette boîte ?
// `box` = { dx, dy, dw, dh, mask } tel que publié par les peintres. Sans masque, on
// retombe sur le rectangle — le comportement d'avant Q11, jamais pire.
export function maskHit(box, px, py) {
  if (px < box.dx || px > box.dx + box.dw || py < box.dy || py > box.dy + box.dh) return false;
  const m = box.mask;
  if (!m) return true;
  const mx = Math.min(m.w - 1, Math.max(0, Math.floor(((px - box.dx) / box.dw) * m.w)));
  const my = Math.min(m.h - 1, Math.max(0, Math.floor(((py - box.dy) / box.dh) * m.h)));
  return m.a[my * m.w + mx] === 1;
}
