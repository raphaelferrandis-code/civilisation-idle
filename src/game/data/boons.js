"use strict";

import { tr, localizeData } from '../core/i18n.js';

/* ============================================================================
 * boons.js — Aubaines (B2) : petites récompenses positives régulières.
 *
 * Pendant — l'événementiel du jeu était 100 % négatif (CRISIS_POOL). Les
 * aubaines apportent le « peps » : sur un timer doux (cf. BOON_INTERVAL_* dans
 * balance.js), le tick crédite N secondes de PRODUCTION COURANTE de la ressource
 * concernée — donc une récompense qui reste pertinente à toutes les échelles,
 * de l'an 0 à la Singularité. Pas de dialogue, pas de pause : juste un texte
 * flottant doré + une dépêche de Chronique.
 *
 * `resource` = clé de l'état/des taux (population, food, gold, knowledge,
 * infrastructure). `seconds` = nombre de secondes de production créditées.
 * `chronicle(amt)` = dépêche (amt déjà formaté).
 * ========================================================================== */

export const BOONS = [
  {
    id: "caravan",
    resource: "gold",
    seconds: 110,
    icon: "💰",
    label: { fr: "Caravane marchande", en: "Merchant caravan" },
    chronicle: (amt) => tr({ fr: `Une caravane venue d'horizons lointains décharge ses coffres sur nos quais : +${amt} trésor.`, en: `A caravan from distant horizons unloads its coffers on our quays: +${amt} treasury.` })
  },
  {
    id: "harvest",
    resource: "food",
    seconds: 110,
    icon: "🌾",
    label: { fr: "Moisson généreuse", en: "Bountiful harvest" },
    chronicle: (amt) => tr({ fr: `Les saisons nous sourient : les greniers débordent d'une récolte inespérée, +${amt} vivres.`, en: `The seasons smile upon us: the granaries overflow with an unhoped-for harvest, +${amt} food.` })
  },
  {
    id: "discovery",
    resource: "knowledge",
    seconds: 110,
    icon: "📜",
    label: { fr: "Découverte", en: "Discovery" },
    chronicle: (amt) => tr({ fr: `Un érudit perce un secret resté longtemps obscur ; nos archives s'enrichissent de +${amt} savoir.`, en: `A scholar unravels a secret long left obscure; our archives grow richer by +${amt} knowledge.` })
  },
  {
    id: "migrants",
    resource: "population",
    seconds: 150,
    icon: "👥",
    label: { fr: "Vague de migrants", en: "Wave of migrants" },
    chronicle: (amt) => tr({ fr: `Des familles venues d'ailleurs choisissent notre cité pour foyer : +${amt} habitants.`, en: `Families from elsewhere choose our city for their home: +${amt} inhabitants.` })
  },
  {
    id: "builders",
    resource: "infrastructure",
    seconds: 110,
    icon: "🏗️",
    label: { fr: "Corvée volontaire", en: "Volunteer labor" },
    chronicle: (amt) => tr({ fr: `Une corvée enthousiaste consolide nos ouvrages publics : +${amt} infrastructure.`, en: `An eager work-gang shores up our public works: +${amt} infrastructure.` })
  }
];

// Aplatit les `label` { fr, en } en chaînes (cf. i18n.js). Les fonctions
// chronicle() sont déjà résolues via tr() à l'appel.
localizeData(BOONS);
