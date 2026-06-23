/* ============================================================================
 * buildingKinds.js — Axe « type » de la table type × palier.
 *
 *   Les 30 bâtiments du jeu n'ont que 3 catégories de gameplay (city / knowledge
 *   / infra). Pour le rendu, on a besoin de FAMILLES VISUELLES plus fines : c'est
 *   ce que chaque sprite représentera. Mapping explicite (chaque id mappé à la
 *   main). Taxonomie figée en Phase 5 (cf. manifeste-sprites-iso-CE.md) :
 *   15 familles, après les splits demandés (mill, bank, temple, aqueduct,
 *   watchtower). C'est l'axe « type » des greybox et des futurs sprites.
 * ========================================================================== */

// 15 familles visuelles → 15 kinds × 5 paliers = 75 sprites de bâtiments.
export const KINDS = [
  "food", "granary", "farm", "market", "craft", "mill", "port", "mint", "bank",
  "knowledge", "temple", "observatory", "civic", "aqueduct", "watchtower"
];

export const KIND_LABELS = {
  food: "Nourriture",
  granary: "Entrepôt",
  farm: "Champs",
  market: "Marché",
  craft: "Atelier",
  mill: "Moulin",
  port: "Port",
  mint: "Monnaie",
  bank: "Banque",
  knowledge: "Savoir",
  temple: "Temple",
  observatory: "Observatoire",
  civic: "Civique",
  aqueduct: "Aqueduc",
  watchtower: "Tour de guet"
};

// id de bâtiment → famille visuelle. Couvre les 30 bâtiments de data/buildings.js.
export const BUILDING_KIND = {
  // — Économie / cité —
  foragers: "food",
  granaries_city: "granary",
  irrigated_fields: "farm",
  caravans: "market",
  markets: "market",
  guilds: "craft",
  water_mills: "mill",
  river_ports: "port",
  mint_houses: "mint",
  imperial_exchanges: "bank",
  // — Savoir —
  scribes: "knowledge",
  storytellers: "knowledge",
  schools: "knowledge",
  academies: "knowledge",
  libraries: "knowledge",
  universities: "knowledge",
  printing_houses: "knowledge",
  think_tanks: "knowledge",
  ancestral_cult: "temple",
  observatories: "observatory",
  // — Infrastructure / civique —
  aqueducts: "aqueduct",
  roads: "civic",
  watch: "watchtower",
  bureaucracy: "civic",
  sewers: "civic",
  courthouses: "civic",
  public_works: "civic",
  ministries: "civic",
  archive_grids: "civic",
  ruin_architects: "civic"
};

// Filet de sécurité si un bâtiment est ajouté sans entrée ci-dessus : on retombe
// sur sa catégorie de gameplay plutôt que de planter.
const CATEGORY_FALLBACK = { city: "market", knowledge: "knowledge", infra: "civic" };

/** Famille visuelle d'un bâtiment (id + sa catégorie de secours éventuelle). */
export function kindOf(buildingId, category) {
  return BUILDING_KIND[buildingId] || CATEGORY_FALLBACK[category] || "civic";
}
