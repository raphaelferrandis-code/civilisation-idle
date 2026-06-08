import { upgrades, PRESTIGE_TREE_BRANCHES } from "../src/game/data/upgrades.js";

const upgradeById = Object.fromEntries(upgrades.map(u => [u.id, u]));

console.log("=== VÉRIFICATION DE LA MONOTONICITÉ DES COÛTS DE PRESTIGE ===");

for (const branch of PRESTIGE_TREE_BRANCHES) {
  console.log(`\n🔹 Branche : ${branch.name}`);
  let prevCost = 0;
  let prevId = "";
  
  for (let i = 0; i < branch.ids.length; i++) {
    const id = branch.ids[i];
    const upgrade = upgradeById[id];
    if (!upgrade) {
      console.log(`  [ERREUR] Amélioration inconnue : ${id}`);
      continue;
    }
    const cost = upgrade.cost?.ruins || 0;
    if (cost < prevCost) {
      console.log(`  🚨 ANOMALIE : ${upgrade.name} (${id}) coûte ${cost} ruines, mais est verrouillé derrière ${upgradeById[prevId]?.name || prevId} (${prevId}) qui coûte ${prevCost} ruines !`);
    } else {
      // console.log(`  [OK] ${upgrade.name} : ${cost}`);
    }
    prevCost = cost;
    prevId = id;
  }
}
