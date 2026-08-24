"use strict";
// ── LE CHAMP DE TERRAIN — la forme pure, sans dépendance ─────────────────────
//
// Extrait d'iso/isoTerrain.js le 2026-08-24 pour le lot « routes sillonnantes » :
// le traceur de routes (roadGraph) tourne PENDANT la fabrication du layout, avant
// que CM.layout existe — il ne peut pas lire le module de rendu. La forme du
// terrain vit donc ici, PURE (aucun import), consommée par les deux mondes :
//   · le RENDU (isoTerrain) la lit via un contexte bâti depuis CM.layout ;
//   · la GÉNÉRATION (layout → roadGraph) la lit via un contexte bâti depuis ses
//     propres locales (graine, riverYAt, cœur du plan) — les routes voient le
//     MÊME monde que le sol dessinera.
//
// LE MODÈLE (v2 « fini la houle », retour Raph) — un vrai paysage concentre ses
// pentes : plaine alluviale PLATE (`bench`), montée FRANCHE (`coteau`), plateau ;
// des MASSIFS DISCRETS au-dessus du seuil `hillCut` du bruit large, la plaine
// VRAIMENT plate entre eux, le détail fin ne sculptant que les flancs.
//
// ⚠ `TERRAIN` est L'OBJET PARTAGÉ des réglages de forme : isoTerrain l'étend de
// ses boutons d'ombrage et l'expose à la molette __terrain. Le muter à chaud
// change le rendu immédiatement (clé de bake) mais les ROUTES, tracées au
// layout, ne suivent qu'au prochain recompute (__cityRecompute).

// amp est le MAÎTRE (0 = plat historique). Échelle accordée à la capture le
// 2026-08-24 (2e passe) : valley/hills en unités U = T/4, bench/coteau/big/det
// en tuiles, cityK = fraction des collines EN ville, riverPad = bande à 0 le
// long de l'eau.
// « Accentue un peu » (Raph, 2026-08-24, 3e passe) : massifs plus couvrants
// (hillCut 0,52 → 0,46) et plus hauts (9 → 12 U), vallée plus creuse (8 → 9),
// un peu plus de sculpture EN ville (cityK 0,45 → 0,5). Toujours des massifs
// DISCRETS — l'accent porte sur leur présence, pas un retour de la houle.
export const TERRAIN = {
  amp: 1, valley: 9, bench: 6, coteau: 4, hills: 12, hillCut: 0.46,
  cityK: 0.5, big: 20, det: 7, riverPad: 3,
};

// Bruit de valeur (hérité du prototype legacy cityMapDrawTerrain). Hash entier
// sans allocation, lissage smoothstep.
function trHash2(ix, iy, seed) {
  let h = (Math.imul(ix | 0, 73856093) ^ Math.imul(iy | 0, 19349663) ^ (seed | 0)) >>> 0;
  h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995) >>> 0; h ^= h >>> 15;
  return (h >>> 0) / 4294967295;
}
function trNoise(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = trHash2(xi, yi, seed), b = trHash2(xi + 1, yi, seed);
  const c = trHash2(xi, yi + 1, seed), d = trHash2(xi + 1, yi + 1, seed);
  const ab = a + (b - a) * u, cd = c + (d - c) * u;
  return ab + (cd - ab) * v;                          // 0..1
}
export const ss01 = (e0, e1, x) => {
  const t = Math.max(0, Math.min(1, (x - e0) / Math.max(1e-4, e1 - e0)));
  return t * t * (3 - 2 * t);
};

// La lisière urbaine du prototype legacy : la ville « apprivoise » le relief —
// les collines pleines ne vivent qu'au-delà de ce rayon, qui grandit avec les
// ères. Formule PARTAGÉE : rendu et routes doivent lire le même rayon.
export function terrainFlatR(counts) {
  const eraIndex = (counts && counts.eraIndex) || 0;
  const urbanTier = (counts && counts.urbanTier) || 0;
  return 6 + eraIndex * 3.8 + urbanTier * 7;
}

// LE CHAMP, en unités U au point (gx, gy) en TUILES — vallée + massifs, AVANT
// socles et quantification (le rendu les ajoute ; les routes n'en veulent pas :
// un socle est la conséquence d'un bâtiment, pas du terrain).
// ctx = { seed, riverYAt (fn gx→gy | null), cx, cy, flatR } — bâti une fois par
// layout, jamais par appel.
export function terrainFieldU(gx, gy, ctx) {
  if (!TERRAIN.amp || !ctx) return 0;
  const dr = ctx.riverYAt ? Math.abs(gy - ctx.riverYAt(gx)) : 1e9;
  // VALLÉE EN COTEAU : plaine alluviale plate, montée franche, plateau.
  const valley = TERRAIN.valley * ss01(TERRAIN.bench, TERRAIN.bench + TERRAIN.coteau, dr);
  // MASSIFS DISCRETS : colline seulement au-dessus du seuil du bruit large ;
  // le détail fin ne vit que DANS un massif.
  const bigN = trNoise(gx / TERRAIN.big, gy / TERRAIN.big, ctx.seed);
  const mass = ss01(TERRAIN.hillCut, 0.95, bigN);
  let hills = 0;
  if (mass > 0) {
    const detN = trNoise(gx / TERRAIN.det, gy / TERRAIN.det, ctx.seed + 101);
    hills = TERRAIN.hills * mass * (0.8 + 0.4 * detN);
  }
  const wildK = ss01(ctx.flatR, ctx.flatR + 8, Math.hypot(gx - ctx.cx, gy - ctx.cy));
  hills *= TERRAIN.cityK + (1 - TERRAIN.cityK) * wildK;
  // Rien sous le niveau de l'eau, et le bord de l'eau reste à 0.
  const h = Math.max(0, valley + hills) * ss01(TERRAIN.riverPad, TERRAIN.riverPad + 4, dr);
  return h * TERRAIN.amp;
}
