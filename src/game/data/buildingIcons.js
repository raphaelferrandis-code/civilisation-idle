"use strict";
// Icônes des rangées d'achat, façon icônes de monstres de Monster Hunter : le
// sujet du bâtiment remplit un carré, en aplats francs. UNE icône par bâtiment,
// la MÊME à toutes les ères (demande de Raph) : elle doit se reconnaître d'un
// coup d'œil dans une vignette de 64 px, ce qu'une icône qui change d'époque
// en époque empêcherait. Elles remplacent les splash-arts (scènes 400 × 240
// devenues illisibles une fois réduites en vignette).
// Fichiers : /pixelart/ui/buildings/<buildingId>.png, 32 × 32, affichés ×2.

// Bâtiments dont l'icône est installée : on n'affiche que ceux-là (zéro 404).
const DONE_BUILDINGS = new Set([
  // Moteurs
  "foragers", "granaries_city", "caravans", "markets", "guilds",
  "irrigated_fields", "river_ports", "water_mills", "mint_houses", "imperial_exchanges",
  // Savoir
  "scribes", "storytellers", "schools", "academies", "observatories",
  "libraries", "ancestral_cult", "universities", "printing_houses", "think_tanks",
  // Infrastructure
  "aqueducts", "roads", "watch", "bureaucracy", "sewers", "courthouses",
  "public_works", "ministries", "archive_grids", "ruin_architects",
]);

// URL de l'icône du bâtiment, ou null s'il n'en a pas (rangée sans vignette).
export function buildingIconSrc(buildingId) {
  return DONE_BUILDINGS.has(buildingId) ? `/pixelart/ui/buildings/${buildingId}.png` : null;
}
