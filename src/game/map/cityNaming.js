"use strict";

// Données de nommage procédural : prénoms, épithètes, métiers, maisons, rôles,
// rues et résidences. Extrait de layout.js (Audit Phase 6 / E-02) — pures listes
// de chaînes, aucune dépendance géométrique ; consommées par cmCitizenName /
// cmRoadName / cmResidenceName.

export const CM_GIVEN = [
  "Aldric", "Sibylle", "Garin", "Mahaut", "Renaud", "Ysoria", "Tassin", "Oda",
  "Doran", "Maelis", "Albin", "Nessa", "Corin", "Aveline", "Estor", "Linnea",
  "Bertran", "Edith", "Gauvin", "Soraya", "Merin", "Talia", "Aldis", "Bruna",
  "Eda", "Tovan", "Sira", "Nehm", "Ilya", "Orun", "Khael", "Solen"
];
export const CM_EPITHETS = [
  "le Veilleur", "la Patiente", "l'Ancien", "la Vive", "le Taciturne", "la Rousse",
  "le Boiteux", "la Sage", "le Cadet", "l'Aïeule", "le Guetteur", "la Nomade"
];
export const CM_TRADES = [
  "du Moulin", "des Granges", "la Potière", "le Forgeron", "du Puits", "des Halles",
  "le Tisserand", "la Meunière", "du Four", "des Tanneurs", "le Charpentier", "la Brodeuse",
  "du Marché", "des Vignes", "le Tonnelier", "la Verrière"
];
export const CM_HOUSES = [
  "Valmoren", "Castaigne", "des Hauts-Quartiers", "Tessandier", "du Levant", "Brassac",
  "des Ponts", "Aldenne", "Virelane", "Montargis", "de Sorel", "Carrac",
  "des Archives", "Vauquelin", "de Roanne", "Esterlin"
];
export const CM_ROLES = [
  ["veille le feu", "cherche du bois", "rentre au camp"],
  ["porte un panier", "revient des champs", "parle au puits"],
  ["traverse le marché", "livre des sacs", "suit les remparts"],
  ["rejoint l'atelier", "passe par la halle", "porte un message"],
  ["sort d'une avenue", "compte les chariots", "file vers les quais"],
  ["prend une ligne rapide", "traverse un quartier haut", "sort d'une tour"],
  ["suit le flux civique", "rejoint une station", "marche sous les arches"]
];
export const CM_STREET_OF = [
  "des Tanneurs", "du Levant", "des Halles", "du Puits", "des Granges", "des Forges",
  "du Marché", "des Ponts", "du Vieux Mur", "des Lampes", "du Sillon", "des Cendres",
  "du Fleuve", "des Archives", "du Rempart", "des Entrepôts", "du Couchant", "des Orfèvres"
];
// Noms de résidences pour l'habitat COLLECTIF (immeubles, tours, grands
// ensembles…) : un immeuble ne porte pas le nom d'une personne mais un nom de
// résidence, comme dans la vraie tradition française (« les Tilleuls »). Liste
// volontairement large : en mégalopole des centaines de tours tirent dedans,
// chaque nom de plus réduit les doublons visibles à l'écran.
export const CM_RESIDENCES = [
  "des Tilleuls", "des Glycines", "des Peupliers", "des Amandiers", "des Mimosas",
  "des Fontaines", "des Terrasses", "du Belvédère", "du Grand Parc", "de la Colline",
  "de l'Aurore", "du Zénith", "du Méridien", "des Étoiles", "de l'Horizon",
  "des Jardins Hauts", "du Beffroi", "des Quatre Vents",
  "des Cèdres", "des Acacias", "des Charmilles", "des Magnolias", "des Oliviers",
  "du Clair Matin", "des Grands Saules", "de la Roseraie", "du Panorama",
  "des Coteaux", "de l'Estuaire", "du Cadran Solaire", "des Lauriers",
  "de la Palmeraie", "du Ciel Ouvert", "de la Comète", "des Deux Rives", "du Signal"
];
