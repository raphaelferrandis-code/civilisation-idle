"use strict";

// Disponibilité des upgrades, nœuds de l'arbre de prestige et dogmes. Leaf.
import { upgradeById } from '../state.js';
import { upgrades, dogmaIds, PRESTIGE_TREE, PRESTIGE_DOGMAS } from '../../data/upgrades.js';
import { fmt, labelFor, canPayCost } from '../utils.js';
import { has, isUnlocked } from './shared.js';

export function ownedRuinTreePurchaseCount() {
  return upgrades.filter((upgrade) => upgrade.group === "ruins" && !dogmaIds.has(upgrade.id) && has(upgrade.id)).length;
}

export function ownedRuinBranchPurchaseCount(branchId) {
  return PRESTIGE_TREE.filter((node) => node.branch === branchId && has(node.id)).length;
}

export function upgradeCostText(upgrade) {
  return Object.entries(upgrade.cost).map(([key, value]) => `${fmt(value)} ${labelFor(key)}`).join(" + ");
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
  if (node.requires && !has(node.requires)) return "locked";
  return canPayCost(node.cost) ? "available" : "locked";
}

function dogmaFor(id) {
  return PRESTIGE_DOGMAS.find((dogma) => dogma.id === id);
}

export function checkDogmaAvailability(id) {
  const dogma = dogmaFor(id);
  const upgrade = upgradeById[id];
  if (!dogma || !upgrade) return "locked";
  if (has(id)) return "purchased";
  if (ownedRuinBranchPurchaseCount(dogma.branch) < dogma.requiredPurchases) return "locked";
  return "available";
}
