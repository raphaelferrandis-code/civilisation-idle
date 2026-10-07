"use strict";

// Données de nommage procédural : prénoms, épithètes, métiers, maisons, rôles,
// rues et résidences. Extrait de layout.js (Audit Phase 6 / E-02) — pures listes
// de chaînes, aucune dépendance géométrique ; consommées par cmCitizenName /
// cmRoadName / cmResidenceName. Les noms PROPRES (prénoms, maisons, rues,
// résidences) restent français dans les deux langues ; les mots génériques
// (rôles, types d'habitation) sont en { fr, en } (audit I18N-4).

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
// Les mêmes prénoms et épithètes, RANGÉS PAR GENRE, pour les passants (fiche
// d'habitant, 2026-10-03) : la fiche montre leur portrait, et un homme ne peut plus
// s'appeler « Sibylle la Patiente ». (Les métiers rangés par genre, CM_TRADES_M/F,
// sont partis le 2026-10-07 : le métier d'un passant vient de son dessin et de son
// travail, plus d'un tirage — citizenIdentity.js.)
export const CM_GIVEN_M = [
  "Aldric", "Garin", "Renaud", "Tassin", "Doran", "Albin", "Corin", "Estor",
  "Bertran", "Gauvin", "Merin", "Aldis", "Tovan", "Nehm", "Orun", "Khael"
];
export const CM_GIVEN_F = [
  "Sibylle", "Mahaut", "Ysoria", "Oda", "Maelis", "Nessa", "Aveline", "Linnea",
  "Edith", "Soraya", "Talia", "Bruna", "Eda", "Sira", "Ilya", "Solen"
];
// Surnoms des camps. « le Boiteux » et « la Rousse » sont partis (2026-10-07) :
// le boiteux marchait droit, et aucune femme des premiers âges n'est rousse.
// Ce qu'un surnom impose (l'âge de « l'Ancien », le trait du « Taciturne ») est
// dans citizenIdentity.js (EPITHET_RULES).
export const CM_EPITHETS_M = ["le Veilleur", "l'Ancien", "le Taciturne", "le Rieur", "le Cadet", "le Guetteur"];
export const CM_EPITHETS_F = ["la Patiente", "la Vive", "la Rieuse", "la Sage", "l'Aïeule", "la Nomade"];
// Les LIEUX-DITS des villages (« du Moulin », « des Vignes »…) : le nom d'un
// foyer, le même pour l'homme, la femme et les enfants. Vingt, et non plus les
// huit lieux-dits de CM_TRADES : avec seize prénoms, huit noms de foyer faisaient
// trois « Ilya du Four » dans la même rue (2026-10-07).
export const CM_LIEUX = [
  "du Moulin", "des Granges", "du Puits", "des Halles", "du Four", "des Tanneurs", "du Marché", "des Vignes",
  "du Pont", "des Saules", "du Gué", "de la Forge", "des Prés", "du Bois", "de la Tour", "des Mares",
  "du Chêne", "de la Source", "du Mont", "des Ormes"
];
// Nom d'un PASSANT accordé à son genre. Même grammaire par âge que cmCitizenName
// (layout.js) : épithète au temps des camps, lieu-dit au temps des villages, nom
// de maison ensuite. Un enfant ne porte pas d'épithète : son prénom, et le
// lieu-dit de sa famille.
// ⚠ Plus de MÉTIER tiré au hasard (2026-10-07) : « Garin le Forgeron » marchait
// en habit de moine vers le moulin. Le métier d'un passant, et le nom qu'il en
// tire, viennent de son dessin et de son travail (citizenIdentity.js) ; ce repli
// sert aux personnages dont on ne connaît pas le dessin.
export function cmPasserbyName(seed, band, fem, child) {
  const pick = (list, s) => list[s % list.length];
  const given = pick(fem ? CM_GIVEN_F : CM_GIVEN_M, seed);
  if (band <= 1) {
    return !child && seed % 3 === 0 ? `${given} ${pick(fem ? CM_EPITHETS_F : CM_EPITHETS_M, Math.floor(seed / 5))}` : given;
  }
  if (band <= 3) return `${given} ${pick(CM_LIEUX, Math.floor(seed / 7))}`;
  return `${given} ${pick(CM_HOUSES, Math.floor(seed / 7))}`;
}
// Rôles des passants (repli si l'âge n'a pas les siens, cf. ageVisualConfig) :
// des unités { fr, en } que l'infobulle et la fiche lisent via tr(). L'anglais
// est au participe (« tending the fire »), comme les activités de la fiche.
export const CM_ROLES = [
  [{ fr: "veille le feu", en: "tending the fire" }, { fr: "cherche du bois", en: "gathering wood" }, { fr: "rentre au camp", en: "heading back to camp" }],
  [{ fr: "porte un panier", en: "carrying a basket" }, { fr: "revient des champs", en: "back from the fields" }, { fr: "parle au puits", en: "chatting at the well" }],
  [{ fr: "traverse le marché", en: "crossing the market" }, { fr: "livre des sacs", en: "delivering sacks" }, { fr: "suit les remparts", en: "walking the ramparts" }],
  [{ fr: "rejoint l'atelier", en: "off to the workshop" }, { fr: "passe par la halle", en: "passing through the market hall" }, { fr: "porte un message", en: "carrying a message" }],
  [{ fr: "sort d'une avenue", en: "coming off an avenue" }, { fr: "compte les chariots", en: "counting the carts" }, { fr: "file vers les quais", en: "hurrying to the quays" }],
  [{ fr: "prend une ligne rapide", en: "catching an express line" }, { fr: "traverse un quartier haut", en: "crossing an upper district" }, { fr: "sort d'une tour", en: "leaving a tower" }],
  [{ fr: "suit le flux civique", en: "following the civic flow" }, { fr: "rejoint une station", en: "heading for a station" }, { fr: "marche sous les arches", en: "walking under the arches" }]
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

// Habitat COLLECTIF : plusieurs familles sous un toit. Un immeuble ne porte pas le
// nom d'une personne (une « Tour d'habitation de Marc le Tanneur » n'a pas de sens,
// un « Gratte-ciel d'Oda Valmoren » non plus) mais un nom de résidence ; la fiche
// d'habitant y loge un foyer par appartement (citizenIdentity.js). Le logement
// individuel garde le nom de son occupant. Les districts (dense/arcology/grid) sont
// rangés côté collectif.
export const CM_COLLECTIVE_HOMES = new Set([
  "block", "tenement", "tower", "megablock", "arcologyhome",
  "insula", "insula2", "haussmann", "terrace", "skytower", "skytower2", "podstack", "gardentower",
  "dense", "arcology", "grid"
]);

// EN ANGLAIS, le complément d'un nom de lieu (« des Tanneurs », « de l'Aurore »)
// reste un nom propre français, couleur assumée — seul le mot générique suit la
// langue. On retire juste l'article pour le placer devant : « Tanneurs Street »,
// « Aurore Housing Estate », et non « Street des Tanneurs ».
export function cmOfEn(of) {
  return String(of || "").replace(/^(?:de la |de l'|des |du |de |d')/, "");
}

// Noms des types d'habitation et de district, au survol de la carte comme dans
// la fiche d'habitant (son logis). Unités { fr, en } : cmVariantLabel rend
// l'unité, l'appelant la passe à tr() — ou en tire fr/en pour composer un nom
// entier dans chaque langue (« Cabane d'Oda » / « Oda's Hut »).
export const CM_VARIANT_LABELS = {
  tent: { fr: "Tente", en: "Tent" },
  hut: { fr: "Cabane", en: "Hut" },
  longhouse: { fr: "Longue maison", en: "Longhouse" },
  courtyard: { fr: "Maison à cour", en: "Courtyard House" },
  townhouse: { fr: "Maison de ville", en: "Townhouse" },
  crafthouse: { fr: "Logis d'artisan", en: "Artisan's House" },
  towerhouse: { fr: "Maison-tour", en: "Tower House" },
  manor: { fr: "Manoir", en: "Manor" },
  stonehouse: { fr: "Maison de pierre", en: "Stone House" },
  insula: { fr: "Immeuble de rapport", en: "Apartment Block" },
  insula2: { fr: "Immeuble de rapport", en: "Apartment Block" },
  domus: { fr: "Domus", en: "Domus" },
  taberna: { fr: "Taberna", en: "Taberna" },
  villa: { fr: "Villa", en: "Villa" },
  terrace: { fr: "Rangée ouvrière", en: "Workers' Terrace" },
  tenement: { fr: "Immeuble populaire", en: "Tenement" },
  block: { fr: "Bloc résidentiel", en: "Residential Block" },
  tower: { fr: "Tour d'habitation", en: "Apartment Tower" },
  megablock: { fr: "Grand ensemble", en: "Housing Estate" },
  arcologyhome: { fr: "Logement d'arcologie", en: "Arcology Dwelling" },
  haussmann: { fr: "Immeuble haussmannien", en: "Haussmann Building" },
  gardentower: { fr: "Tour-jardin", en: "Garden Tower" },
  domehome: { fr: "Maison-dôme", en: "Dome House" },
  podstack: { fr: "Grappe de capsules", en: "Pod Cluster" },
  skytower: { fr: "Gratte-ciel", en: "Skyscraper" },
  skytower2: { fr: "Gratte-ciel", en: "Skyscraper" },
  // Grands complexes (districts) conservés :
  market: { fr: "Marché", en: "Market" },
  temple: { fr: "Temple", en: "Temple" },
  keep: { fr: "Donjon", en: "Keep" },
  forum: { fr: "Forum", en: "Forum" },
  palace: { fr: "Palais", en: "Palace" },
  station: { fr: "Station civique", en: "Civic Station" },
  spire: { fr: "Flèche administrative", en: "Administrative Spire" },
  archive: { fr: "Archives", en: "Archives" },
  observatory: { fr: "Observatoire", en: "Observatory" },
  dense: { fr: "Quartier dense", en: "Dense Quarter" },
  arcology: { fr: "Arcologie", en: "Arcology" },
  grid: { fr: "Quartier en grille", en: "Grid Quarter" }
};
const CM_HOME_LABEL = { fr: "Logement", en: "Home" };
const CM_BUILDING_LABEL = { fr: "Bâtiment", en: "Building" };
export function cmVariantLabel(type, variant) {
  if (Object.prototype.hasOwnProperty.call(CM_VARIANT_LABELS, variant)) return CM_VARIANT_LABELS[variant];
  return type === "house" ? CM_HOME_LABEL : CM_BUILDING_LABEL;
}
