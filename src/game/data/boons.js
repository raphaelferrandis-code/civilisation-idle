"use strict";

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
    label: "Caravane marchande",
    chronicle: (amt) => `Une caravane venue d'horizons lointains décharge ses coffres sur nos quais : +${amt} trésor.`
  },
  {
    id: "harvest",
    resource: "food",
    seconds: 110,
    icon: "🌾",
    label: "Moisson généreuse",
    chronicle: (amt) => `Les saisons nous sourient : les greniers débordent d'une récolte inespérée, +${amt} vivres.`
  },
  {
    id: "discovery",
    resource: "knowledge",
    seconds: 110,
    icon: "📜",
    label: "Découverte",
    chronicle: (amt) => `Un érudit perce un secret resté longtemps obscur ; nos archives s'enrichissent de +${amt} savoir.`
  },
  {
    id: "migrants",
    resource: "population",
    seconds: 150,
    icon: "👥",
    label: "Vague de migrants",
    chronicle: (amt) => `Des familles venues d'ailleurs choisissent notre cité pour foyer : +${amt} habitants.`
  },
  {
    id: "builders",
    resource: "infrastructure",
    seconds: 110,
    icon: "🏗️",
    label: "Corvée volontaire",
    chronicle: (amt) => `Une corvée enthousiaste consolide nos ouvrages publics : +${amt} infrastructure.`
  }
];
