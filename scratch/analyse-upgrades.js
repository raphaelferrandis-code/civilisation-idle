import { upgrades, PRESTIGE_TREE_BRANCHES } from "../src/game/data/upgrades.js";

// Filter only ruins upgrades
const ruinsUpgrades = upgrades.filter(u => u.group === "ruins");

console.log(`Nombre total d'améliorations de ruines : ${ruinsUpgrades.length}`);

// Group by branch from PRESTIGE_TREE_BRANCHES
const branchMapping = {};
for (const branch of PRESTIGE_TREE_BRANCHES) {
  for (const id of branch.ids) {
    branchMapping[id] = branch.name;
  }
}

const upgradesByBranch = {};
const costDistribution = {
  "1-10": [],
  "11-100": [],
  "101-1000": [],
  "1001-10k": [],
  "10k-100k": [],
  "100k-1M": [],
  "1M-10M": [],
  "10M-100M": [],
  "100M-1B": [],
  "1B-10B": [],
  "10B+": []
};

const effectTypes = {};

for (const upgrade of ruinsUpgrades) {
  const branchName = branchMapping[upgrade.id] || "Hors-branche / Autre";
  if (!upgradesByBranch[branchName]) {
    upgradesByBranch[branchName] = [];
  }
  upgradesByBranch[branchName].push(upgrade);

  // Cost distribution
  const cost = upgrade.cost?.ruins || 0;
  if (cost <= 10) costDistribution["1-10"].push(upgrade);
  else if (cost <= 100) costDistribution["11-100"].push(upgrade);
  else if (cost <= 1000) costDistribution["101-1000"].push(upgrade);
  else if (cost <= 10000) costDistribution["1001-10k"].push(upgrade);
  else if (cost <= 100000) costDistribution["10k-100k"].push(upgrade);
  else if (cost <= 1000000) costDistribution["100k-1M"].push(upgrade);
  else if (cost <= 10000000) costDistribution["1M-10M"].push(upgrade);
  else if (cost <= 100000000) costDistribution["10M-100M"].push(upgrade);
  else if (cost <= 1000000000) costDistribution["100M-1B"].push(upgrade);
  else if (cost <= 10000000000) costDistribution["1B-10B"].push(upgrade);
  else costDistribution["10B+"].push(upgrade);

  // Effect types
  const effectType = upgrade.effectType || "Autre (Bouton/Mécanique)";
  effectTypes[effectType] = (effectTypes[effectType] || 0) + 1;
}

console.log("\n=== RÉPARTITION PAR BRANCHE ===");
for (const [branch, list] of Object.entries(upgradesByBranch)) {
  const minCost = Math.min(...list.map(u => u.cost?.ruins || 0));
  const maxCost = Math.max(...list.map(u => u.cost?.ruins || 0));
  console.log(`• ${branch} : ${list.length} améliorations (Coût min: ${minCost}, max: ${maxCost})`);
}

console.log("\n=== RÉPARTITION PAR TRANCHE DE COÛT ===");
for (const [range, list] of Object.entries(costDistribution)) {
  console.log(`• [${range} ruines] : ${list.length} améliorations`);
}

console.log("\n=== TYPES D'EFFETS LES PLUS FRÉQUENTS ===");
const sortedEffects = Object.entries(effectTypes).sort((a, b) => b[1] - a[1]);
for (const [type, count] of sortedEffects) {
  console.log(`• ${type} : ${count} améliorations`);
}

// Find conflicting upgrades
console.log("\n=== AMÉLIORATIONS EN CONFLIT (EXCLUSIVES) ===");
const conflicts = upgrades.filter(u => u.conflictsWith);
for (const u of conflicts) {
  const other = upgrades.find(o => o.id === u.conflictsWith);
  console.log(`• ${u.name} (branche ${branchMapping[u.id]}) ⚡ en conflit avec ${other?.name || u.conflictsWith} (branche ${branchMapping[u.conflictsWith]})`);
}
