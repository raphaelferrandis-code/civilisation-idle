"use strict";

// Baril mechanics (revue 0.4 §2.1) — la logique vit désormais dans ./mechanics/,
// découpée en 6 sous-modules à dépendances acycliques. Ce fichier ne fait que
// réexporter : l'API publique reste IDENTIQUE aux exports historiques, donc les
// ~28 consommateurs (+ simulate-ce.js) importent toujours depuis ./mechanics.js
// sans aucun changement.
//
//   shared      primitives transverses (leaf)
//   production  pipeline de production (multiplicateurs, pression, vitals, rates)
//   cost        coûts des bâtiments + archéologie
//   upgrades    disponibilité upgrades / nœuds prestige / dogmes
//   prestige    gain de ruines, seuils dynastie/GR, légitimité, usure, héritage
//   crisis-cost coûts de crise, prép. terminales, contexte/déblocage régulation

// shared : re-export NOMMÉ du sous-ensemble public. ownedRuinUpgradeCount (utilisé
// par production.js) reste un helper interne au paquet → volontairement non exposé,
// pour que l'API publique soit exactement celle d'avant.
export {
  isUnlocked,
  totalBuildingCount,
  has,
  hasDoctrine,
  ruinEffectSum,
  ruinEffectMultiplier,
  computeStartFloor,
  crisisOpen,
  currentEraIndex,
  nextEraProgress,
  mapStage
} from './mechanics/shared.js';

export * from './mechanics/production.js';
export * from './mechanics/cost.js';
export * from './mechanics/upgrades.js';
export * from './mechanics/prestige.js';
export * from './mechanics/crisis-cost.js';
