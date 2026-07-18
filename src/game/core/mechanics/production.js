"use strict";

// Baril du paquet production (audit G‑18/#10). L'ex-fichier de 977 lignes est
// découpé en 7 sous-modules à DAG acyclique sous ./production/ ; ce baril ne fait
// que réexporter l'API publique HISTORIQUE (exactement les 30 symboles d'avant),
// donc les consommateurs (baril mechanics.js + crisis-cost.js) importent toujours
// depuis ./production.js sans le moindre changement.
//
//   L0  olympusProd       multiplicateur « Abîme » de l'Olympe (rapatrié d'actions)
//       buildingOutput    synergies par bâtiment + sommes par catégorie (+overflow)
//       mythEffects        modificateurs Babel/Héphaïstos/Âge d'Or/Cadmos/épitaphe
//       crisisLevers       pénalités de crise, coûts de politique, croissance Rupture
//   L1  globalMultipliers  pile du multiplicateur global (+ miroirs Decimal, cap infra)
//       pressure           cible de Rupture, subsistance, vitals de la cité
//   L2  rates              orchestrateur : les 5 taux de ressources + instabilité
//
// Réexports NOMMÉS (et non `export *`) : plusieurs helpers sont passés `export`
// pour l'usage inter-modules du paquet (getBuildingSums, crisisProductionMultiplier,
// ruptureGrowthMultiplier, orProdPenaltyMult, …) mais restent HORS de l'API publique,
// exactement comme avant. olympusAbyssProductionMultiplier reste interne au paquet.
import { buildingById } from '../state.js';

// Invariant dev-only (coût nul en prod) : les ids lus en accès DIRECT dans les
// sous-modules (globalMultipliers → bureaucracy ; rates/pressure → markets, guilds)
// doivent exister. Un renommage silencieux donnerait state.buildings.<id> = undefined
// → NaN propagé dans toute la production (cf. revue 0.4 §1.2). Casse au chargement
// en DEV/test.
if (import.meta.env?.DEV) {
  for (const id of ["bureaucracy", "markets", "guilds"]) {
    if (!buildingById[id]) {
      throw new Error(`Bâtiment "${id}" introuvable : lu en direct par le paquet production (globalMultipliers/pressure/rates) → NaN si renommé.`);
    }
  }
}

export {
  ruinMultiplier,
  ruinMultiplierDec,
  unspentRuinsPowerMultiplier,
  unspentRuinsPowerMultiplierDec,
  infraMultiplier,
  infraMultiplierDec,
  nomadInfrastructureCap,
  enforceInfrastructureCap,
  globalMultiplier,
  globalMultiplierDec
} from './production/globalMultipliers.js';

export {
  milestoneStepSize,
  buildingOutputMultiplier,
  buildingOutputMultiplierDec,
  buildingMilestoneInfo
} from './production/buildingOutput.js';

export {
  babelExponentialMult,
  babelExponentialMultDec,
  activeEpitaphLegacy,
  epitaphLegacyDurationMs
} from './production/mythEffects.js';

export {
  addProductionPenalty,
  policyProductionMultiplier,
  policyRiseSlow,
  policyOvershootDamp,
  policyFoyerDamp,
  policyDemesureDamp,
  amplifyRuptureFactor
} from './production/crisisLevers.js';

export {
  scarcityRawInstant,
  pressureBreakdown,
  cityVitals
} from './production/pressure.js';

export { rates } from './production/rates.js';
