/**
 * Mode d'interface : « light » (dé-boxé — prototype issu de la recherche UI
 * 2026-07-10) vs « classic » (cadre or universel sur panneaux ET contrôles).
 * Préférence d'affichage pure : persistée hors sauvegarde de jeu, comme la
 * langue ou le format des nombres. Consommé par App.jsx (attribut data-ui sur
 * .app) ; frames.css et ui-light.css font le reste en CSS.
 */
const KEY = 'ui:mode';

export function getUiLight() {
  try {
    return localStorage.getItem(KEY) !== 'classic';
  } catch {
    return true;
  }
}

export function setUiLight(light) {
  try {
    localStorage.setItem(KEY, light ? 'light' : 'classic');
  } catch {
    // localStorage indisponible : préférence non persistée, tant pis.
  }
}
