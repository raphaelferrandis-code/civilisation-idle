// BRUITS DE LA VÉGÉTATION (docs/PLAN-VEGETATION.md) — module feuille, sans import :
// la forêt (isoWildForest), le sous-bois et les prés (isoForestFloor, isoMeadow) et
// les colonies de fleurs (isoGroundDetail) lisent les MÊMES champs, et isoGroundDetail
// ne peut pas importer la forêt sans boucle.

// Hachage entier (bien plus rapide que cmHash sur une chaîne) → 0..1.
export function vegHash(x, y, s) {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(s | 0, 0x9e3779b9);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Bruit de valeur LISSÉ (interpolation bilinéaire en easing cubique), 0..1, sans couture
// de bloc : `sc` cellules entre deux nœuds, `s` le sel du champ.
export function vegNoise(gx, gy, sc, s) {
  const fx = gx / sc, fy = gy / sc, x0 = Math.floor(fx), y0 = Math.floor(fy);
  let tx = fx - x0, ty = fy - y0;
  tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
  const a = vegHash(x0, y0, s), b = vegHash(x0 + 1, y0, s), c = vegHash(x0, y0 + 1, s), d = vegHash(x0 + 1, y0 + 1, s);
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}
