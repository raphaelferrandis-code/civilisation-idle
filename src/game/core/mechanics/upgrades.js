"use strict";

// Disponibilité des upgrades, nœuds de l'arbre de prestige et dogmes. Leaf.
import { upgradeById } from '../state.js';
import { upgrades, dogmaIds, PRESTIGE_TREE, PRESTIGE_DOGMAS } from '../../data/upgrades.js';
import { canPayCost } from '../utils.js';
import { has, isUnlocked, ruinEffectSum } from './shared.js';

// Coût EFFECTIF en ruines d'un nœud de l'arbre : coût nominal × remise
// « Grammaire des ruines » (ruinShopDiscount, plancher −50 %). Source unique —
// consommée par checkNodeAvailability, buyUpgrade (paiement), l'auto-achat
// conservateurs_ruines et l'affichage (RuinsTreePixel).
export function ruinNodeCost(upgrade) {
  const raw = upgrade?.cost?.ruins || 0;
  if (raw <= 0) return 0;
  return Math.ceil(raw * Math.max(0.5, 1 - ruinEffectSum("ruinShopDiscount")));
}

export function ownedRuinTreePurchaseCount() {
  return upgrades.filter((upgrade) => upgrade.group === "ruins" && !dogmaIds.has(upgrade.id) && has(upgrade.id)).length;
}

export function ownedRuinBranchPurchaseCount(branchId) {
  return PRESTIGE_TREE.filter((node) => node.branch === branchId && has(node.id)).length;
}

// Nombre de nœuds possédés dans une branche, parmi les paliers STRICTEMENT
// inférieurs à `tier` : c'est le compteur qui ouvre le palier suivant (gating à
// choix). Un nœud bloqué (conflictsWith) ne compte pas, mais comme chaque palier
// a plus de nœuds que le seuil, l'aval reste toujours atteignable (anti-softlock).
export function ownedInBranchBelowTier(branchId, tier) {
  return PRESTIGE_TREE.filter((node) => node.branch === branchId && node.tier < tier && has(node.id)).length;
}

export function canBuyUpgrade(upgrade) {
  if (dogmaIds.has(upgrade.id)) return checkDogmaAvailability(upgrade.id) === "available";
  if (upgrade.group === "ruins") return checkNodeAvailability(upgrade.id) === "available";
  return !has(upgrade.id) && canPayCost(upgrade.cost);
}

function prestigeNodeFor(id) {
  return PRESTIGE_TREE.find((node) => node.id === id);
}

export function checkNodeAvailability(id) {
  const node = prestigeNodeFor(id);
  const upgrade = upgradeById[id];
  if (!node || !upgrade) return "locked";
  if (has(id)) return "purchased";
  if (upgrade.conflictsWith && has(upgrade.conflictsWith)) return "blocked";
  if (!isUnlocked(upgrade)) return "locked";
  // Palier ouvert ? On compte les nœuds possédés dans les paliers inférieurs.
  if (ownedInBranchBelowTier(node.branch, node.tier) < node.unlock) return "locked";
  // Palier ouvert + débloqué mais Ruines insuffisantes → "cost" (≠ "locked" gaté) :
  // le nœud reste non cliquable, mais la fresque peut le distinguer en ambre au
  // lieu du gris « verrouillé ». Les seuls consommateurs gatent sur === "available".
  return canPayCost({ ruins: ruinNodeCost(upgrade) }) ? "available" : "cost";
}

function dogmaFor(id) {
  return PRESTIGE_DOGMAS.find((dogma) => dogma.id === id);
}

export function checkDogmaAvailability(id) {
  const dogma = dogmaFor(id);
  const upgrade = upgradeById[id];
  if (!dogma || !upgrade) return "locked";
  if (has(id)) return "purchased";
  // Paires de choix exclusifs : adopter un dogme bloque son jumeau.
  if (upgrade.conflictsWith && has(upgrade.conflictsWith)) return "blocked";
  if (ownedRuinBranchPurchaseCount(dogma.branch) < dogma.requiredPurchases) return "locked";
  return "available";
}
