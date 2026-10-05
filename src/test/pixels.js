// Mesures de pixels des tests d'art (audit 2026-10-05, TEST-9). Aucun import.
//
// UNE luminance. Elle existait en six copies avec DEUX formules — Rec.709 (groundTileDose,
// isoSurfaceBible, meadowFlowers, waterSansEcailles) et Rec.601 (isoGroundTileAssets,
// isoWinterTreeAssets) : deux seuils de contraste se comparaient sur des échelles
// différentes. Rec.709 est retenue (celle des scripts de cuisson récents : vegetationDose,
// packBake, bakeWaterTiles…). Réétalonnage des deux fichiers en Rec.601, mesuré sur les
// PNG livrés : écart de luminance entre variantes de tuile de sol changé de 0,6 au plus
// (herbe d'hiver 65,9 → 65,3), assombrissement des arbres d'hiver de 13,7 % au moins
// dans les deux formules — leurs seuils (60/75, « plus sombre ») tiennent tels quels.
export const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
// La même, sur un triplet [r, g, b] (tableau, ou vue d'un tampon RGBA).
export const lumOf = (c) => lum(c[0], c[1], c[2]);

// Nombre de pixels non transparents d'une image RGBA ({ data }).
export function opaqueCount(img) {
  let n = 0;
  for (let i = 3; i < img.data.length; i += 4) if (img.data[i]) n += 1;
  return n;
}
