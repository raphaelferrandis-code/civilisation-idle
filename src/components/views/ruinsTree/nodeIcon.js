"use strict";

// Emblème pixel-art par nœud de ruines. `iconFor` renvoie une CLÉ d'emblème
// (fichier /pixelart/ui/ruins/<clé>.png), rendue en <img> par TreeNode.
// Priorité : (1) override par id (nœuds legacy sans effectType + cas spéciaux),
// (2) famille d'effet, (3) variante start*, (4) repli par branche.
// Un emblème = une FAMILLE d'effet (pas 1 par nœud) : l'anneau porte la couleur
// de branche, l'emblème dit l'effet. Set installé dans public/pixelart/ui/ruins/.

// (2) Famille d'effet → emblème.
const EMBLEM_BY_EFFECT = {
  foodMult: "food", foodKeep: "food-keep",
  startFood: "food-start", startFoodPctPeak: "food-start",
  populationMult: "population",
  startPopulation: "population", startPopulationPctPeak: "population",
  timeWearSlow: "time", stability: "stability",
  goldMult: "gold", goldKeep: "gold-keep",
  startGold: "gold-start", startGoldPctPeak: "gold-start",
  cityDiscount: "city-discount",
  infraMult: "infra", infraKeep: "infra-keep", infraDiscount: "infra-discount",
  startInfra: "infra-start",
  knowledgeMult: "knowledge", knowledgeKeep: "knowledge-keep", knowledgeDiscount: "knowledge-discount",
  startKnowledge: "knowledge-start", startKnowledgePctPeak: "knowledge-start",
  globalMult: "global",
  ruinGain: "ruin-gain",
  ruptureHaste: "rupture",
  unspentRuinsPower: "ruins-power",
  chronicleEngine: "chronicle",
};

// (1) Override par id : nœuds legacy sans effectType + dogmes/traits spéciaux.
const EMBLEM_BY_ID = {
  root_cellars: "food",
  granaries: "population",
  fallen_roads: "infra-start",
  oral_tradition: "knowledge-discount",
  recurring_ages: "cycle",
  conseil_de_crise: "decree",
  edit_effondrement: "decree",
  ruin_liturgy: "decree",
  veilleurs_nuit_1: "vigil",
  veilleurs_nuit_4: "vigil",
  trait_nomadism: "population",
  trait_theocracy: "global",
  skill_archaeology: "ruin-gain",
};

// (4) Repli par branche (rarement atteint : tout nœud a une famille ou un override).
const BRANCH_FALLBACK = {
  resilience: "food",
  prosperity: "gold",
  knowledge: "knowledge",
  cycle_crise: "cycle",
};

function startEmblem(effectType) {
  if (/food/i.test(effectType)) return "food-start";
  if (/gold/i.test(effectType)) return "gold-start";
  if (/knowledge/i.test(effectType)) return "knowledge-start";
  if (/infra/i.test(effectType)) return "infra-start";
  if (/population/i.test(effectType)) return "population";
  return null;
}

export function iconFor(upgrade, branchId) {
  const id = upgrade?.id || "";
  if (EMBLEM_BY_ID[id]) return EMBLEM_BY_ID[id];

  const et = upgrade?.effectType;
  if (et) {
    if (EMBLEM_BY_EFFECT[et]) return EMBLEM_BY_EFFECT[et];
    if (/^start/i.test(et)) {
      const s = startEmblem(et);
      if (s) return s;
    }
  }
  return BRANCH_FALLBACK[branchId] || "global";
}
