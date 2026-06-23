/* ============================================================================
 * eraTiers.js — Paliers visuels de la refonte isométrique (Phase 0).
 *
 *   Le jeu connaît ~45 ères (index) regroupées en 10 « bandes » visuelles
 *   (eraThemes.eraBandOf : 0 primitif → 9 démiurge). Pour le pixel art, dessiner
 *   un jeu de sprites par bande = ~100 sprites de bâtiments. On regroupe donc les
 *   10 bandes en 5 PALIERS VISUELS — un seul jeu d'art par palier (~50 sprites).
 *
 *   ⚠ Ne pas confondre avec world.js `eraTier(index)` qui désigne le PALIER
 *   MAJEUR d'ère (échelle 0..44). Ici, « tier visuel » = T1..T5 pour l'habillage.
 *
 *   C'est l'axe « époque » de la future table type × palier (Phase 4).
 * ========================================================================== */

import { eraBandOf } from "../data/eraThemes.js";

// Découpage figé en Phase 0 (cf. plan-refonte-iso-CE.md). `bands` = bandes
// eraBandOf (0..9) couvertes par le palier. `source` documente la stratégie d'art
// hybride : « packs » (assets prêts antique→moderne) vs « sur-mesure » (primitif
// et cosmique, qu'aucun pack ne couvre).
export const VISUAL_TIERS = [
  { index: 1, id: "primitif",   label: "Primitif",                bands: [0, 1],    source: "sur-mesure" },
  { index: 2, id: "antique",    label: "Antique / marchand",      bands: [2, 3],    source: "packs" },
  { index: 3, id: "imperial",   label: "Impérial / monumental",   bands: [4, 5],    source: "packs" },
  { index: 4, id: "industriel", label: "Industriel / mégalopole", bands: [6],       source: "packs" },
  { index: 5, id: "cosmique",   label: "Cosmique",                bands: [7, 8, 9], source: "sur-mesure" }
];

// Index inverse bande (0..9) → palier, construit une fois.
const TIER_BY_BAND = (() => {
  const map = new Array(10);
  for (const tier of VISUAL_TIERS) {
    for (const b of tier.bands) map[b] = tier;
  }
  return map;
})();

/** Palier visuel (objet de VISUAL_TIERS) pour une bande d'ère 0..9. */
export function visualTierOf(band) {
  const b = Math.max(0, Math.min(9, band | 0));
  return TIER_BY_BAND[b] || VISUAL_TIERS[0];
}

/** Palier visuel directement depuis un index d'ère brut (raccourci). */
export function visualTierOfEra(eraIndex) {
  return visualTierOf(eraBandOf(eraIndex));
}
