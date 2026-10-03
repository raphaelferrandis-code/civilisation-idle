"use strict";

import { localizeData } from "../../../game/core/i18n.js";
import { SAP_COLORS } from "./sapMaterials.js";

// Métadonnées de PRÉSENTATION par branche (couleur, glyphe).
// Purement visuel : ne touche jamais aux données de gameplay (upgrades.js).
// Couleur = celle de la MATIÈRE de la branche sur l'Arbre de la Mémoire (la sève
// qui y coule) : runes bleues, sève verte, braise rouge, lave orangée. L'or reste
// réservé à ce qui s'achète maintenant.
const rgbOf = (branch) => SAP_COLORS[branch].mid.join(", ");
const glowOf = (branch) => SAP_COLORS[branch].glow.join(", ");

export const BRANCH_THEME = {
  knowledge:   { label: { fr: "L'Écorce gravée", en: "The Graven Bark" }, color: `rgb(${rgbOf("knowledge")})`, rgb: rgbOf("knowledge"), glow: glowOf("knowledge"), glyph: "fa-book-open" },
  prosperity:  { label: { fr: "La Sève", en: "The Sap" },                 color: `rgb(${rgbOf("prosperity")})`, rgb: rgbOf("prosperity"), glow: glowOf("prosperity"), glyph: "fa-coins" },
  cycle_crise: { label: { fr: "La Cendre", en: "The Ash" },               color: `rgb(${rgbOf("cycle_crise")})`, rgb: rgbOf("cycle_crise"), glow: glowOf("cycle_crise"), glyph: "fa-arrows-spin" },
  resilience:  { label: { fr: "Les Racines", en: "The Roots" },           color: `rgb(${rgbOf("resilience")})`, rgb: rgbOf("resilience"), glow: glowOf("resilience"), glyph: "fa-seedling" },
};

// Aplatit les `label` { fr, en } en chaînes de la langue courante (cf. i18n.js).
localizeData(BRANCH_THEME);

export function branchTheme(branchId) {
  return BRANCH_THEME[branchId] || { label: branchId, color: "var(--gold)", rgb: "201, 169, 104", glow: "90, 70, 40", glyph: "fa-landmark" };
}
