/* ============================================================================
 * buildingKinds.js — Axe « type » de la table type × palier (Phase 0).
 *
 *   Les 30 bâtiments du jeu n'ont que 3 catégories de gameplay (city / knowledge
 *   / infra). Pour le rendu, on a besoin de FAMILLES VISUELLES plus fines : c'est
 *   ce que chaque sprite représentera. Mapping explicite (chaque id mappé à la
 *   main, pas de déduction floue) — taxonomie v0, à affiner au manifeste (Phase 5)
 *   mais déjà l'axe « type » des greybox (Phase 4).
 * ========================================================================== */

// 10 familles visuelles → ~10 kinds × 5 paliers ≈ 50 sprites de bâtiments.
export const KINDS = [
  "food", "granary", "farm", "market", "craft",
  "port", "mint", "knowledge", "observatory", "civic"
];

export const KIND_LABELS = {
  food: "Nourriture",
  granary: "Entrepôt",
  farm: "Champs",
  market: "Marché",
  craft: "Atelier",
  port: "Port",
  mint: "Monnaie",
  knowledge: "Savoir",
  observatory: "Observatoire",
  civic: "Civique"
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
  water_mills: "craft",
  river_ports: "port",
  mint_houses: "mint",
  imperial_exchanges: "mint",
  // — Savoir —
  scribes: "knowledge",
  storytellers: "knowledge",
  schools: "knowledge",
  academies: "knowledge",
  libraries: "knowledge",
  universities: "knowledge",
  printing_houses: "knowledge",
  think_tanks: "knowledge",
  ancestral_cult: "knowledge",
  observatories: "observatory",
  // — Infrastructure / civique —
  aqueducts: "civic",
  roads: "civic",
  watch: "civic",
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
