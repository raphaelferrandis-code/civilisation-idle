"use strict";
// DÉLAI AVANT ACHAT (B5). Une rangée inabordable ne disait rien : le joueur ne
// pouvait pas savoir s'il attendait trente secondes ou quatre heures. C'est
// pourtant la seule information qui pilote vraiment la durée d'une session idle.
//
// Fonction PURE et hors React : la boutique n'a qu'à l'appeler et à formater.
// Elle vit ici plutôt que dans le composant pour être testable sans DOM — le
// projet n'a ni jsdom ni @testing-library, donc tout ce qui reste dans le JSX
// est, de fait, non couvert.
import { state } from '../state.js';
import { D } from '../num.js';
import { rates } from './production/rates.js';

// Résultats NOMMÉS plutôt qu'un nombre et des sentinelles. Le libellé change du
// tout au tout selon le cas, et « ∞ » ne dit pas la même chose que « pas encore
// de revenu » : le premier décourage, le second explique.
export const ETA_READY = "ready";           // déjà payable
export const ETA_NO_INCOME = "noIncome";    // aucun débit sur une devise manquante
export const ETA_UNREACHABLE = "unreachable"; // hors de portée au rythme actuel
export const ETA_SECONDS = "eta";

// Au-delà, on cesse de chiffrer. « payable dans 61 638 217 j » est exact et
// inutile : à ce régime la réponse n'est pas d'attendre mais de faire grandir
// la production, et la valeur s'effondrera de plusieurs ordres de grandeur au
// prochain palier. Trente jours est très au-delà de la plus longue absence
// créditée (24 h), donc aucun délai réellement tenable n'est masqué.
export const ETA_MAX_SECONDS = 30 * 86400;

// `prices` = le coût déjà calculé par la boutique (buildingBatchCost), pour ne
// pas le recalculer par rangée à chaque tick.
// Renvoie { kind } ou { kind: 'eta', seconds }.
export function purchaseEta(prices) {
  if (!prices) return { kind: ETA_READY };
  const r = rates();
  let pire = 0;
  for (const devise of Object.keys(prices)) {
    const manque = D(prices[devise]).sub(D(state[devise] || 0));
    if (manque.lte(0)) continue; // cette devise est déjà couverte
    // ⚠ TESTER LE DÉBIT AVANT DE DIVISER. break_infinity rend Decimal(0) sur une
    // division par zéro — pas Infinity. Sans ce garde, une devise sans revenu
    // donnerait un délai de 0 seconde, soit « imminent » : exactement l'inverse
    // de la vérité, et sur le chemin NOMINAL (l'Or vaut 0/s tant que le
    // Rayonnement est sous 25, et le Mythe d'Énée dégradé met Or ET Nourriture
    // à 0 d'un coup).
    const debit = D(r[devise] ?? 0);
    if (debit.lte(0)) return { kind: ETA_NO_INCOME, currency: devise };
    const secondes = manque.div(debit).toNumber();
    if (!Number.isFinite(secondes) || secondes > ETA_MAX_SECONDS) return { kind: ETA_UNREACHABLE };
    if (secondes > pire) pire = secondes;
  }
  // On garde le MAXIMUM des devises : on ne peut acheter qu'une fois la
  // dernière réunie, pas à la moyenne.
  return pire > 0 ? { kind: ETA_SECONDS, seconds: pire } : { kind: ETA_READY };
}
