"use strict";
// ── POSER UNE TRANCHE SUR SES SEULES RANGÉES OCCUPÉES ────────────────────────
//
// Les gros sprites découpés en TRANCHES verticales pour le tri peintre (la Maison
// des Plaisirs, les ponts) posaient chaque tranche sur toute la hauteur de leur
// cadre : aux trois quarts du vide transparent, que le moteur Canvas compose quand
// même, pixel par pixel en rendu logiciel (audit du 2026-10-05, PERF-29 et PERF-35).
//
// ⚠ RECADRER UNE POSE N'EST PAS ANODIN. drawImage(src rognée → dest recalculée)
// est la même transformation SUR LE PAPIER, pas dans le moteur : la nouvelle
// matrice (ou, sur GPU, le quad et ses coordonnées de texture) s'arrondit
// autrement, et aux échelles non entières des centres de pixel tombent PILE sur
// une couture entre deux rangées source — un arrondi différent, et c'est toute une
// rangée qui glisse d'un texel. Mesuré le 2026-10-05 (banc headless, 3 rasters,
// 23 crans de zoom × 4 positions × dpr 1 / 2 / 1,25 × source-over et
// destination-out) : rognée « à la main » à un cran non entier, la pose différait
// dans 40 à 54 % des cas en rendu logiciel quand la hauteur du raster est paire,
// et dans 95 à 100 % des cas sur GPU (D3D11), quelle que soit la hauteur. Même
// constat au lot 4 sur les vitres (cf. lightLayer.litBox) et pour un CLIP.
//
// La seule pose rognée PROUVÉE identique : échelle device ENTIÈRE et haut de la
// tranche calé sur la grille device (rowCropExact). Chaque rangée source couvre
// alors pile k rangées device, les coins du quad sont des entiers exacts, et aucun
// centre de pixel n'approche une couture à moins d'un demi-pixel / k. Mesuré sur
// le même banc : 0 écart sur 1 656 cas (dont 192 rognés), logiciel ET GPU. Ailleurs
// la tranche reste posée pleine hauteur ; ce qui ne change jamais l'image, en
// revanche, s'applique partout : sauter une couche VIDE sur la tranche et serrer
// les EMPRISES déclarées à la couche de lumière (lightLayer.litBox).
//
// ⚠ Au NEAREST seulement (imageSmoothingEnabled = false) : un lissage irait
// chercher la rangée voisine, que la pose rognée n'a plus.

// Les rangées occupées (alpha > 0) de chaque colonne d'un raster { w, h, data } :
// [top, bot[ (vide : top ≥ bot). Par colonne et non par tranche : la largeur des
// tranches se règle à la molette.
export function colRows(R) {
  const top = new Int16Array(R.w).fill(R.h), bot = new Int16Array(R.w);
  for (let j = 0; j < R.h; j += 1) {
    for (let i = 0; i < R.w; i += 1) {
      if (!R.data[(j * R.w + i) * 4 + 3]) continue;
      if (j < top[i]) top[i] = j;
      bot[i] = j + 1;
    }
  }
  return { top, bot };
}

// Les rangées occupées des colonnes [c0, c1[, écrites dans `out` ([a, b[) ; false
// si elles sont toutes vides. L'appelant élargit [c0, c1[ d'une colonne de chaque
// côté : un échantillon de bord ne peut rien aller chercher hors de la plage.
export function sliceRows(cr, c0, c1, out) {
  let a = 0x7fff, b = 0;
  for (let i = c0; i < c1; i += 1) { if (cr.top[i] < a) a = cr.top[i]; if (cr.bot[i] > b) b = cr.bot[i]; }
  out[0] = a; out[1] = b;
  return a < b;
}

// Une tranche de `h` rangées posée pleine hauteur de y0 à y1 (px CSS) sur `g` :
// sa pose rognée est-elle identique au pixel ? (cf. l'en-tête). Lit la vraie
// transformation de la cible quand elle est lisible, sinon le dpr.
export function rowCropExact(g, y0, y1, h, dpr = 1) {
  return cropExact(g, y0, y1, h, dpr, true);
}
// Pareil en largeur : `w` colonnes posées de x0 à x1 (le tablier d'un pont, posé
// d'un bloc, se découpe alors en bandes de colonnes).
export function colCropExact(g, x0, x1, w, dpr = 1) {
  return cropExact(g, x0, x1, w, dpr, false);
}
function cropExact(g, a0, a1, n, dpr, rows) {
  let s = dpr, t = 0;
  if (g && typeof g.getTransform === 'function') {
    const m = g.getTransform();
    if (m.b !== 0 || m.c !== 0) return false;
    s = rows ? m.d : m.a; t = rows ? m.f : m.e;
  }
  return Number.isInteger(a0 * s + t) && Number.isInteger((a1 - a0) * s / n);
}
