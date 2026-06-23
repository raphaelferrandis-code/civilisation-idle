"use strict";

// Données de nommage procédural : prénoms, épithètes, métiers, maisons, rôles et
// rues. Extrait de layout.js (Audit Phase 6 / E-02) — pures listes de chaînes,
// aucune dépendance géométrique ; consommées par cmCitizenName / cmRoadName.

export const CM_GIVEN = [
  "Aldric", "Sibylle", "Garin", "Mahaut", "Renaud", "Ysoria", "Tassin", "Oda",
  "Doran", "Maelis", "Albin", "Nessa", "Corin", "Aveline", "Estor", "Linnea",
  "Bertran", "Edith", "Gauvin", "Soraya", "Merin", "Talia", "Aldis", "Bruna",
  "Eda", "Tovan", "Sira", "Nehm", "Ilya", "Orun", "Khael", "Solen"
];
export const CM_EPITHETS = [
  "le Veilleur", "la Patiente", "l'Ancien", "la Vive", "le Taciturne", "la Rousse",
  "le Boiteux", "la Sage", "le Cadet", "l'Aieule", "le Guetteur", "la Nomade"
];
export const CM_TRADES = [
  "du Moulin", "des Granges", "la Potiere", "le Forgeron", "du Puits", "des Halles",
  "le Tisserand", "la Meuniere", "du Four", "des Tanneurs", "le Charpentier", "la Brodeuse",
  "du Marche", "des Vignes", "le Tonnelier", "la Verriere"
];
export const CM_HOUSES = [
  "Valmoren", "Castaigne", "des Hauts-Quartiers", "Tessandier", "du Levant", "Brassac",
  "des Ponts", "Aldenne", "Virelane", "Montargis", "de Sorel", "Carrac",
  "des Archives", "Vauquelin", "de Roanne", "Esterlin"
];
export const CM_ROLES = [
  ["veille le feu", "cherche du bois", "rentre au camp"],
  ["porte un panier", "revient des champs", "parle au puits"],
  ["traverse le marche", "livre des sacs", "suit les remparts"],
  ["rejoint l'atelier", "passe par la halle", "porte un message"],
  ["sort d'une avenue", "compte les chariots", "file vers les quais"],
  ["prend une ligne rapide", "traverse un quartier haut", "sort d'une tour"],
  ["suit le flux civique", "rejoint une station", "marche sous les arches"]
];
export const CM_STREET_OF = [
  "des Tanneurs", "du Levant", "des Halles", "du Puits", "des Granges", "des Forges",
  "du Marche", "des Ponts", "du Vieux Mur", "des Lampes", "du Sillon", "des Cendres",
  "du Fleuve", "des Archives", "du Rempart", "des Greniers", "du Couchant", "des Orfevres"
];
