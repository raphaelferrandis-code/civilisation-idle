"use strict";

// Métadonnées de PRÉSENTATION par branche (couleur, glyphe, ordre angulaire).
// Purement visuel : ne touche jamais aux données de gameplay (upgrades.js).
// Ordre angulaire figé (réf. image #3), sens horaire depuis le haut :
// knowledge (haut) → prosperity (droite) → cycle_crise (bas-droite) →
// veille (bas-gauche) → resilience (haut-gauche).
export const BRANCH_ORDER = ["knowledge", "prosperity", "cycle_crise", "veille", "resilience"];

export const BRANCH_THEME = {
  knowledge:   { label: "Connaissance",  color: "var(--blue)",  rgb: "76, 157, 232",  glyph: "fa-book-open" },
  prosperity:  { label: "Prospérité",    color: "var(--gold)",  rgb: "201, 169, 104", glyph: "fa-coins" },
  cycle_crise: { label: "Cycle & Crise", color: "#c86464",      rgb: "200, 100, 100", glyph: "fa-arrows-spin" },
  veille:      { label: "Veille",        color: "#aeb6da",      rgb: "174, 182, 218", glyph: "fa-moon" },
  resilience:  { label: "Résilience",    color: "var(--green)", rgb: "54, 179, 126",  glyph: "fa-seedling" },
};

export function branchTheme(branchId) {
  return BRANCH_THEME[branchId] || { label: branchId, color: "var(--gold)", rgb: "201, 169, 104", glyph: "fa-landmark" };
}
