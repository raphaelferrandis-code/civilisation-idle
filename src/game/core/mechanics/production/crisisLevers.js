"use strict";

// Leviers de crise et de politique agissant sur la production et sur la montée de
// la Rupture (pénalités de crise, coûts continus des politiques, croissance de la
// Rupture sous théocratie). Feuille du DAG production : dépend de state/data/shared.
// `crisisProductionMultiplier`, `ruptureGrowthMultiplier` et `theocracyKnowledgeRate`
// sont consommés par pressure.js/rates.js (exportés, hors API publique du baril).
import { state } from '../../state.js';
import { POLICY_BY_ID } from '../../../data/regulationActions.js';
import { ATLAS_LEGIT_MAX_REDUCTION } from '../../../data/myths.js';
import { toNum } from '../../num.js';
import { has, ruinEffectSum } from '../shared.js';

export function addProductionPenalty(type, amount) {
  let effectiveAmount = amount;
  // Héritage Atlas — Légitimité haute atténue les effets négatifs des crises
  if (state.atlasHeritage && (state.atlasLegitimite || 0) > 50) {
    const legBonus = ((state.atlasLegitimite || 50) - 50) / 50; // 0→1
    effectiveAmount *= (1 - legBonus * ATLAS_LEGIT_MAX_REDUCTION);
  }
  const current = state.crisisProduction[type] ?? 1;
  state.crisisProduction[type] = Math.max(0.1, current * (1 - effectiveAmount));
}

export function crisisProductionMultiplier(type) {
  const global = state.crisisProduction.global ?? 1;
  return global * (state.crisisProduction[type] ?? 1) * policyProductionMultiplier(type);
}

// Levier C — coût de production CONTINU et RÉCUPÉRABLE des politiques actives
// (revient à 1 dès qu'on les désactive, contrairement à crisisProduction qui ne
// se rétablit jamais). Replié dans crisisProductionMultiplier → s'applique à
// toutes les ressources, chemins float et Decimal. Plancher 0.1 (max 90 % malus).
export function policyProductionMultiplier(type) {
  const policies = state.activePolicies;
  if (!policies || !policies.length) return 1;
  // « Loi des témoins » (policyCostHalf) : le coût de production continu des
  // politiques permanentes est réduit de moitié.
  const soften = 1 - Math.min(0.75, ruinEffectSum("policyCostHalf"));
  let m = 1;
  for (const id of policies) {
    const cost = POLICY_BY_ID[id]?.cost;
    if (!cost) continue;
    if (cost.global) m *= (1 - cost.global * soften);
    if (cost[type]) m *= (1 - cost[type] * soften);
  }
  return Math.max(0.1, m);
}

// Levier C — ralentissement de la MONTÉE de la Rupture par les politiques actives
// (ajouté à orderSlow dans tick.js, plafonné en commun à 0.8 → jamais un gel).
export function policyRiseSlow() {
  const policies = state.activePolicies;
  if (!policies || !policies.length) return 0;
  let s = 0;
  for (const id of policies) s += POLICY_BY_ID[id]?.riseSlow || 0;
  return s;
}

// Levier C — atténuation de la SURCHARGE par les politiques actives (plafond 0.8).
// La surcharge accélère la montée quand la cible dépasse 100 % ; la réduire ne fait
// que gagner du temps (la cible ne bouge pas) → sûr.
export function policyOvershootDamp() {
  const policies = state.activePolicies;
  if (!policies || !policies.length) return 0;
  let s = 0;
  for (const id of policies) s += POLICY_BY_ID[id]?.overshootDamp || 0;
  return Math.min(0.8, s);
}

// Levier C — étouffement CONTINU d'un foyer par les politiques actives (entre dans
// le plafond partagé foyerCut → jamais d'immortalité). Récupérable à l'extinction.
export function policyFoyerDamp(foyer) {
  const policies = state.activePolicies;
  if (!policies || !policies.length) return 0;
  let s = 0;
  for (const id of policies) s += POLICY_BY_ID[id]?.foyerDamp?.[foyer] || 0;
  return s;
}

// Rework cadence late-game — réduction CONTINUE de la Démesure par les politiques
// actives (« Gouvernance impériale »). Entre dans le demesureCut plafonné à
// DEMESURE_CUT_CAP → la Démesure n'est jamais totalement effacée par les leviers
// seuls. Récupérable à l'extinction de la politique (comme les autres damps).
export function policyDemesureDamp() {
  const policies = state.activePolicies;
  if (!policies || !policies.length) return 0;
  let s = 0;
  for (const id of policies) s += POLICY_BY_ID[id]?.demesureDamp || 0;
  return s;
}

export function theocracyKnowledgeRate() {
  return has("trait_theocracy") ? toNum(state.gold) * 0.01 : 0;
}

export function ruptureGrowthMultiplier() {
  return has("trait_theocracy") ? 1.25 : 1;
}

export function amplifyRuptureFactor(factor) {
  if (factor <= 1 || !has("trait_theocracy")) return factor;
  return 1 + (factor - 1) * ruptureGrowthMultiplier();
}
