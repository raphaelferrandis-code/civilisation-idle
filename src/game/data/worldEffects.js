"use strict";
// Pont d'effets : world.js (données) n'importe AUCUN module de core/.
// core/ enregistre ses implémentations ici au démarrage (voir main.js).
export const effects = {
  addProductionPenalty: () => {},
  chronicle: () => {},
  state: null
};
export function registerWorldEffects(impl) { Object.assign(effects, impl); }
