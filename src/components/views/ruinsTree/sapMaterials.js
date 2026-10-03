"use strict";

// Les QUATRE MATIÈRES de l'Arbre de la Mémoire et leur lumière (illustration
// public/pixelart/ruins-tree/memoire.png, PixelLab Pro 688×384 — une scène,
// rangée hors des familles d'icônes de ui/). Module PUR, partagé par le rendu
// en jeu (sapRenderer.js) et par le générateur des veines
// (scripts/buildRuinsSap.mjs) : les deux classent les pixels de la même façon.
//
//   L'Écorce gravée (knowledge)   → les runes bleues de la couronne d'argent
//   La Sève         (prosperity)  → les gouttes d'ambre et le vert des feuilles
//   La Cendre       (cycle_crise) → les braises du bois calciné
//   Les Racines     (resilience)  → la lave des racines et des fissures du tronc
//
// Au départ toutes ces lumières sont ÉTEINTES (runes ternes, feuilles sèches,
// braises froides, lave figée) ; la sève les rallume autour de son chemin, du
// cœur de braise jusqu'à chaque nœud acquis.

export const SAP_ART = {
  w: 688,
  h: 384,
  ground: 259,      // ligne du sol : en dessous, la terre et les cités enfouies
  hub: [340, 192],  // le cœur de braise, d'où part toute la sève
};

// Classe de lumière d'un pixel de l'illustration d'origine (ou null).
// « prosperity-leaf » = le feuillage, rallumé par la Sève mais qui n'est pas du bois.
export function lightClass(r, g, b, x, y) {
  if (y < 212 && x > 180 && x < 520 && b >= 165 && b > r + 50) return "knowledge";
  if (x < 335 && y < 240 && r >= 165 && g >= 80 && b < 110 && r > b + 90) return "prosperity";
  if (x < 335 && y < 240 && g > r + 8 && g > b + 8 && g > 60) return "prosperity-leaf";
  if (x > 362 && y < 250 && r >= 150 && r > g + 30 && r > b + 90) return "cycle_crise";
  if (y >= 204 && r >= 140 && r > b + 80 && Math.hypot(x - SAP_ART.hub[0], y - SAP_ART.hub[1]) > 21) return "resilience";
  return null;
}

export const branchOfLight = (cls) => (cls === "prosperity-leaf" ? "prosperity" : cls);

// La même lumière, éteinte.
export function dimLight(cls, r, g, b) {
  const L = (r + g + b) / 3;
  switch (cls) {
    case "knowledge": return [0.36 * L + 46, 0.4 * L + 50, 0.46 * L + 58];
    case "prosperity": return [r * 0.36 + 18, g * 0.3 + 12, b * 0.3 + 10];
    case "prosperity-leaf": return [0.5 * L + 34, 0.47 * L + 30, 0.36 * L + 24];
    case "cycle_crise": return [0.22 * r + 26, 0.2 * g + 22, 0.2 * b + 24];
    case "resilience": {
      const t = Math.min(1, (r * 0.5 + g * 0.4 + b * 0.1) / 190);
      return [40 + 44 * t, 20 + 16 * t, 18 + 9 * t];
    }
    default: return [r, g, b];
  }
}

// Où la sève peut passer : 0 = vide (ciel, lune, feuillage), 1 = bois ou lave,
// 2 = terre (franchissable, la sève y creuserait une fissure).
// La lune est reconnue à ses 3 tons relevés au pixel (227,249,251 · 194,225,236 ·
// 171,206,226) : un simple seuil de luminance la confondait avec l'écorce d'argent.
export function walkClass(r, g, b, x, y, cls) {
  if (y >= SAP_ART.ground) return cls === "resilience" ? 1 : 2;
  const L = (r + g + b) / 3;
  const sat = Math.max(r, g, b) - Math.min(r, g, b);
  const navy = b > r + 14 && L < 92;
  const moon = !cls && ((L >= 195 && b >= r + 15) || (r === 171 && g === 206 && b === 226) || (L > 215 && sat < 40));
  return navy || moon || cls === "prosperity-leaf" ? 0 : 1;
}

// Rayon (px source) autour du chemin où la matière se rallume : large pour la
// Sève (le feuillage pousse autour des rameaux), serré ailleurs.
export const REVEAL_R = { knowledge: 3, prosperity: 7, cycle_crise: 4, resilience: 3 };

// Couleurs de la sève par matière (cœur, corps, lueur) — aussi l'anneau des
// médaillons acquis (branchTheme.js).
export const SAP_COLORS = {
  knowledge: { core: [214, 238, 255], mid: [118, 182, 240], glow: [52, 92, 140] },
  prosperity: { core: [232, 246, 168], mid: [156, 206, 92], glow: [62, 96, 36] },
  cycle_crise: { core: [255, 184, 140], mid: [232, 92, 62], glow: [110, 34, 26] },
  resilience: { core: [255, 226, 156], mid: [242, 140, 54], glow: [120, 56, 20] },
};
