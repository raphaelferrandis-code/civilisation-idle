"use strict";

/* ============================================================================
 * uiPrefs.js — préférences d'INTERFACE, persistées hors sauvegarde (E4).
 *
 * Même statut que dayNightMode, qualityMode et ambianceMode : un réglage
 * d'affichage vit en localStorage, survit au Grand Reset et ne voyage pas avec
 * l'export. Module-FEUILLE, aucun import, utilisable depuis l'UI comme depuis
 * le rendu.
 *
 * ⚠ LE MOUVEMENT N'EST PAS ICI. Il reste piloté par le cran « Vie de la carte »
 * d'ambianceMode.js — arbitrage explicite : UN SEUL contrôle de mouvement.
 * Poser ici une seconde clé pour la même intention donnerait deux réglages à
 * tenir synchronisés derrière un bouton unique, et c'est précisément la
 * divergence silencieuse qu'on veut éviter.
 * ==========================================================================*/

const DENSITY_KEY = "civ-opt-density";
const DENSITY_MODES = ["aere", "normale", "compacte"];

export let densityMode = (() => {
  try {
    const saved = localStorage.getItem(DENSITY_KEY);
    return DENSITY_MODES.includes(saved) ? saved : "normale";
  } catch {
    return "normale";
  }
})();

export function setDensityMode(mode) {
  densityMode = DENSITY_MODES.includes(mode) ? mode : "normale";
  try {
    localStorage.setItem(DENSITY_KEY, densityMode);
  } catch { /* stockage indisponible : le réglage vaut pour la session */ }
  applyDensityAttribute();
}

// Posé sur <html> et non sur `.app`, pour la même raison que data-motion : les
// modales <dialog> vivent dans le top layer et ne descendent pas de `.app`.
export function applyDensityAttribute() {
  try {
    document.documentElement.setAttribute("data-density", densityMode);
  } catch { /* pas de DOM (tests, worker) : rien à poser */ }
}

/* ── CONTRASTE RENFORCÉ (E12) ───────────────────────────────────────────────
 * Deux états seulement : normal, ou renforcé. Un curseur à crans n'aurait rien
 * apporté — soit les textes secondaires passent le seuil de lisibilité, soit
 * ils ne le passent pas.
 *
 * La PASSE de contraste, elle, est déjà dans variables.css et ne s'active pas :
 * un ton mesuré illisible se répare pour tout le monde, il ne s'offre pas en
 * option. Ce réglage est le cran AU-DESSUS.
 */
const CONTRAST_KEY = "civ-opt-contrast";
const CONTRAST_MODES = ["normal", "high"];

export let contrastMode = (() => {
  try {
    const saved = localStorage.getItem(CONTRAST_KEY);
    return CONTRAST_MODES.includes(saved) ? saved : "normal";
  } catch {
    return "normal";
  }
})();

export function setContrastMode(mode) {
  contrastMode = CONTRAST_MODES.includes(mode) ? mode : "normal";
  try {
    localStorage.setItem(CONTRAST_KEY, contrastMode);
  } catch { /* stockage indisponible : le réglage vaut pour la session */ }
  applyContrastAttribute();
}

export function applyContrastAttribute() {
  try {
    // L'attribut n'est posé QUE dans le mode renforcé : un `data-contrast="normal"`
    // inerte dans le DOM ferait croire à un état particulier là où il n'y en a pas.
    const el = document.documentElement;
    if (contrastMode === "high") el.setAttribute("data-contrast", "high");
    else el.removeAttribute("data-contrast");
  } catch { /* pas de DOM (tests, worker) : rien à poser */ }
}
