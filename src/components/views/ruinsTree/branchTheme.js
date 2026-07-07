"use strict";

import { localizeData } from "../../../game/core/i18n.js";

// Métadonnées de PRÉSENTATION par branche (couleur, glyphe, ordre angulaire).
// Purement visuel : ne touche jamais aux données de gameplay (upgrades.js).
// Ordre angulaire figé, sens horaire depuis le haut (4 branches à 90°) :
// knowledge (haut) → prosperity (droite) → cycle_crise (bas) → resilience (gauche).
export const BRANCH_ORDER = ["knowledge", "prosperity", "cycle_crise", "resilience"];

export const BRANCH_THEME = {
  knowledge:   { label: { fr: "Connaissance", en: "Knowledge" },     color: "var(--blue)",  rgb: "76, 157, 232",  glyph: "fa-book-open" },
  prosperity:  { label: { fr: "Prospérité", en: "Prosperity" },      color: "var(--gold)",  rgb: "201, 169, 104", glyph: "fa-coins" },
  cycle_crise: { label: { fr: "Cycle & Crise", en: "Cycle & Crisis" }, color: "#c86464",     rgb: "200, 100, 100", glyph: "fa-arrows-spin" },
  resilience:  { label: { fr: "Résilience", en: "Resilience" },      color: "var(--green)", rgb: "54, 179, 126",  glyph: "fa-seedling" },
};

// Aplatit les `label` { fr, en } en chaînes de la langue courante (cf. i18n.js).
localizeData(BRANCH_THEME);

export function branchTheme(branchId) {
  return BRANCH_THEME[branchId] || { label: branchId, color: "var(--gold)", rgb: "201, 169, 104", glyph: "fa-landmark" };
}
