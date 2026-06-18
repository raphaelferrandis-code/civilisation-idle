/* ============================================================================
 * tileStyle.js — LA table type × palier (cœur du concept « la ville vieillit »).
 *
 *   Donne l'apparence d'un bâtiment selon sa famille visuelle (`kind`, l'identité)
 *   ET le palier d'ère courant (`tier` 1..5, l'âge). En greybox = couleur + taille
 *   + hauteur. C'est l'objet le plus important de la refonte : en Phase 7 on
 *   remplacera simplement `tileStyle(...)` par `tileKey(kind, tier)` → clé de sprite,
 *   tout le reste du moteur ne bougera pas.
 *
 *   Principe : le KIND porte la teinte d'identité (un marché reste orangé à toutes
 *   les époques) ; le PALIER fait vieillir — la ville monte en hauteur, s'agrandit,
 *   et glisse d'une ambiance terreuse (primitif) vers lumineuse (cosmique).
 * ========================================================================== */

// Teinte d'identité par famille (l'axe « type »). 15 familles (cf. manifeste).
export const KIND_BASE_COLOR = {
  food: 0x6fae5a, granary: 0xc8a24a, farm: 0x8a9a3a, market: 0xd98a3a, craft: 0x9a6a3a,
  mill: 0x6f8f7a, port: 0x3a9aa0, mint: 0xd6b84b, bank: 0xc9c19a, knowledge: 0x5a7fb0,
  temple: 0xc79ad2, observatory: 0x7a6ab0, civic: 0x8a8f99, aqueduct: 0x86b3c0, watchtower: 0x9a7d6a
};
// Hauteur de référence (palier 3) par famille : silhouette variée.
export const KIND_BASE_HEIGHT = {
  food: 22, granary: 34, farm: 12, market: 30, craft: 30,
  mill: 38, port: 26, mint: 40, bank: 48, knowledge: 46,
  temple: 52, observatory: 56, civic: 34, aqueduct: 36, watchtower: 58
};

// Glissement d'ambiance par palier (l'axe « âge ») : terre → pierre → marbre →
// acier → lumière. On y mélange la teinte d'identité.
const TIER_TINT = { 1: 0x5a3c22, 2: 0x8a8170, 3: 0xd8cfae, 4: 0x707b8a, 5: 0xb29cf0 };
// La ville monte en hauteur et s'élargit avec les âges.
const TIER_HEIGHT_MULT = { 1: 0.5, 2: 0.8, 3: 1.0, 4: 1.35, 5: 1.8 };
const TIER_FOOT = { 1: 0.36, 2: 0.40, 3: 0.42, 4: 0.45, 5: 0.48 };
const TINT_AMOUNT = 0.35;

function mix(a, b, t) {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

const clampTier = (tier) => Math.max(1, Math.min(5, tier | 0));

/** Clé logique type × palier — future clé de sprite (Phase 7). */
export function tileKey(kind, tier) {
  return `${kind}_t${clampTier(tier)}`;
}

/** Apparence greybox d'un bâtiment (couleur, hauteur, empreinte) à un palier. */
export function tileStyle(kind, tier) {
  const t = clampTier(tier);
  const base = KIND_BASE_COLOR[kind] ?? 0x8a8f99;
  const baseH = KIND_BASE_HEIGHT[kind] ?? 32;
  return {
    color: mix(base, TIER_TINT[t], TINT_AMOUNT),
    height: Math.round(baseH * TIER_HEIGHT_MULT[t]),
    foot: TIER_FOOT[t]
  };
}
