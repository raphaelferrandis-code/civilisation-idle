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
