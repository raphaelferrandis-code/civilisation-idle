"use strict";

import { localizeData } from "../core/i18n.js";

/**
 * eraThemes.js — l'ÉPOQUE d'une ère : bande visuelle 0-9 (eraBandOf), nom de
 * l'époque et position de l'ère dans son époque (getEraTheme).
 *
 * La bande est la source unique lue par la carte (layout.js), l'état, le
 * journal, les Plaisirs et le récit d'absence. Le nom et la position servent
 * au bandeau de transition (App.jsx), à l'infobulle de l'Âge
 * (CityStatusPanel) et à la chronique des faits divers.
 *
 * Plus de palette d'accent ni d'ambiance de carte ici : le chrome n'est plus
 * teinté par l'âge et la carte a ses propres tables par ère. Les ancres HSL
 * des époques vivent dans scripts/buildPalette.mjs (palette pixel-art).
 */

import { eras, eraTier } from "./world.js";

// Bande visuelle d'une ère, calée sur le TIER (palier majeur équivalent) et non
// l'index brut : les ères « factices » partagent ainsi la bande/époque de leur
// palier. Le dénominateur est ANCRÉ sur 34 (longueur d'origine) pour ne pas
// re-mapper les couleurs des ères 0–34 existantes. Au-delà : 3 époques cosmiques.
const ERA_BAND_ANCHOR = 34;
export function eraBandOf(eraIndex) {
  const i = Math.max(0, eraIndex | 0);
  const tier = eraTier(i);
  // Ères 0–34 : bande dérivée du tier (= index ici) → couleurs inchangées.
  // Gating sur l'INDEX (pas le tier) : sinon les ères « factices » 35–44 héritent
  // du tier 34 de la Singularité → resteraient en bande 6 (néon), créant 10 ères
  // de « trou » sans cosmique. Dès l'ère 35, on passe en cosmique.
  if (i <= ERA_BAND_ANCHOR) {
    return Math.max(0, Math.min(6, Math.floor((tier / ERA_BAND_ANCHOR) * 6.999)));
  }
  // Sous-bande cosmique selon le tier du palier majeur (les factices suivent leur
  // palier) : 7 Noosphère (tier ≤38), 8 stellaire (39–42), 9 Démiurge (43+).
  if (tier <= 38) return 7;
  if (tier <= 42) return 8;
  return 9;
}

/* ------------------------------------------------------------------ */
/* Les 10 époques                                                      */
/* ------------------------------------------------------------------ */

export const EPOCHS = [
  { id: "feu", label: { fr: "Âge du Feu", en: "Age of Fire" } },
  { id: "bois", label: { fr: "Âge du Bois", en: "Age of Wood" } },
  { id: "pierre", label: { fr: "Âge de la Pierre taillée", en: "Age of Hewn Stone" } },
  { id: "couronne", label: { fr: "Âge de la Couronne", en: "Age of the Crown" } },
  { id: "marbre", label: { fr: "Âge du Marbre", en: "Age of Marble" } },
  { id: "fonte", label: { fr: "Âge de la Fonte", en: "Age of Iron" } },
  { id: "neon", label: { fr: "Âge du Néon", en: "Age of Neon" } },
  // ── Époques TRANSCENDANTES (bands 7–9, ères 35+) : les ères « factices »
  // héritent de la bande de leur palier majeur (cf. eraBandOf via eraTier).
  { id: "noosphere", label: { fr: "Âge de la Noosphère", en: "Age of the Noosphere" } },
  { id: "stellaire", label: { fr: "Âge stellaire", en: "Stellar Age" } },
  { id: "demiurge", label: { fr: "Âge du Démiurge", en: "Age of the Demiurge" } }
];

/* ------------------------------------------------------------------ */
/* Position dans l'époque                                              */
/* ------------------------------------------------------------------ */

const ROMANS = ["I", "II", "III", "IV", "V"];

// Bornes de chaque époque (première ère, nombre d'ères), calculées une fois sur
// eraBandOf : les époques 0-6 comptent cinq ères, mais les époques cosmiques en
// comptent 54, 44 et 166 — `i % 5` y annonçait « ère V/V » au tout début de
// l'Âge stellaire (audit du 05/10, BUG-102).
let bandRanges = null;
function bandRange(band) {
  if (!bandRanges) {
    bandRanges = new Map();
    for (let k = 0; k < eras.length; k++) {
      const b = eraBandOf(k);
      const r = bandRanges.get(b);
      if (r) r.size += 1; else bandRanges.set(b, { start: k, size: 1 });
    }
  }
  return bandRanges.get(band) || { start: 0, size: 1 };
}

// Cache : un thème immuable par ère, calculé une fois.
const themeCache = new Map();

/** Thème d'une ère : bande, époque et position de l'ère dans son époque. */
export function getEraTheme(eraIndex) {
  const max = eras.length - 1;
  const i = Math.max(0, Math.min(max, eraIndex | 0));
  if (themeCache.has(i)) return themeCache.get(i);

  const band = eraBandOf(i);
  const epoch = EPOCHS[band];
  const stepInEpoch = i % 5;
  const range = bandRange(band);
  const theme = {
    eraIndex: i,
    band,
    epochId: epoch.id,
    epochLabel: epoch.label,
    // Position RÉELLE dans l'époque (1 = première ère) et taille de l'époque.
    epochStep: i - range.start + 1,
    epochSize: range.size,
    // Chiffre romain sur V : seulement pour les époques de cinq ères (0-6) ;
    // null au-delà, où l'appelant écrit la position en clair (BUG-102).
    epochNumeral: band <= 6 ? ROMANS[stepInEpoch] : null
  };
  themeCache.set(i, theme);
  return theme;
}

// Aplatit les `label` { fr, en } des époques en chaînes (cf. i18n.js).
localizeData(EPOCHS);
