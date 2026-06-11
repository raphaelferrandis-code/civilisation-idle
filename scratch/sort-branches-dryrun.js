import { upgrades, PRESTIGE_TREE_BRANCHES } from "../src/game/data/upgrades.js";

const upgradeById = Object.fromEntries(upgrades.map(u => [u.id, u]));

console.log("=== APERÇU DU TRI DES BRANCHES DE PRESTIGE ===");

for (const branch of PRESTIGE_TREE_BRANCHES) {
  console.log(`\n🔹 Branche : ${branch.name}`);
  const list = branch.ids.map(id => {
    const u = upgradeById[id];
    return { id, name: u?.name || id, cost: u?.cost?.ruins || 0 };
  });

  // Sort by cost
  list.sort((a, b) => a.cost - b.cost);

  list.forEach((u, i) => {
    console.log(`  ${(i + 1).toString().padStart(2, " ")}. ${u.name.padEnd(30)} : ${u.cost.toLocaleString().padStart(18)} ruines (${u.id})`);
  });
}
