/* ============================================================================
 * ageVisualConfig.js — AgeVisualConfig
 *   Couche de configuration par âge (eraBand 0..6) : tout ce qui doit changer
 *   visuellement et structurellement quand la civilisation traverse les ères.
 *   Pour ajouter un style d'âge : modifier l'entrée correspondante ici, sans
 *   toucher aux générateurs.
 *
 *   eraBand (calculé depuis les ~35 ères de data/world.js) :
 *     0 primitif (campement)   1 agricole (hameau/village)
 *     2 bourg/cité marchande   3 cité fortifiée / royaume
 *     4 empire                 5 capitale monumentale / métropole
 *     6 mégalopole / singularité
 * ============================================================================ */

// `citizenRoles` : unités { fr, en } (ce que fait le passant), lues via tr() par
// l'infobulle de la carte et la fiche d'habitant. Anglais au participe.
const AGE_CONFIG = [
  { // 0 — primitif : huttes, feux, sentiers de terre
    id: "primitif",
    archetypes: ["scattered"],
    roadRanks: { main: false, avenue: false, secondary: true, path: true },
    order: 0.05,          // 0 = organique total, 1 = grille stricte
    plazaSize: 0,         // pas de place : le feu central tient ce rôle
    parkChance: 0.3,      // espaces vides / nature dans le tissu
    treeDensity: 1.25,
    citizenRoles: [
      { fr: "veille le feu", en: "tending the fire" }, { fr: "cherche du bois", en: "gathering wood" },
      { fr: "rentre au camp", en: "heading back to camp" }, { fr: "écoute les anciens", en: "listening to the elders" },
      { fr: "guette l'horizon", en: "watching the horizon" }
    ],
    vehicles: [{ type: "basket", weight: 1 }],
    decorDensity: 0.2
  },
  { // 1 — agricole : maisons simples, granges, champs, chemins
    id: "agricole",
    archetypes: ["scattered", "crossroads", "linear"],
    roadRanks: { main: true, avenue: false, secondary: true, path: true },
    order: 0.15,
    plazaSize: 0,         // pas encore de place : le puits/feu tient ce rôle (la 1re esplanade dallée arrive au bourg — buildPlazas impose un plancher 4×4, trop massif pour un hameau)
    parkChance: 0.24,
    treeDensity: 1.1,
    citizenRoles: [
      { fr: "porte un panier", en: "carrying a basket" }, { fr: "revient des champs", en: "back from the fields" },
      { fr: "parle au puits", en: "chatting at the well" }, { fr: "mène une chèvre", en: "leading a goat" },
      { fr: "bat le grain", en: "threshing grain" }
    ],
    vehicles: [{ type: "basket", weight: 2 }],   // brouette ET charrette à bras retirées : le hameau ne porte plus qu'à dos d'homme
    decorDensity: 0.35
  },
  { // 2 — bourg : marché, halles, premières rues pavées
    id: "bourg",
    archetypes: ["crossroads", "linear", "radial"],
    roadRanks: { main: true, avenue: true, secondary: true, path: true },
    order: 0.3,
    plazaSize: 2,
    parkChance: 0.18,
    treeDensity: 0.95,
    citizenRoles: [
      { fr: "traverse le marché", en: "crossing the market" }, { fr: "livre des sacs", en: "delivering sacks" },
      { fr: "crie une annonce", en: "calling out the news" }, { fr: "marchande au comptoir", en: "haggling at the counter" },
      { fr: "pousse une brouette", en: "pushing a wheelbarrow" }
    ],
    vehicles: [{ type: "basket", weight: 1 }, { type: "wagon", weight: 2 }],   // brouette ET charrette à bras retirées : panier + attelage à bœuf
    decorDensity: 0.5
  },
  { // 3 — fortifié/royaume : pierre, donjons, voies structurées
    id: "fortifie",
    archetypes: ["radial", "linear", "districts"],
    roadRanks: { main: true, avenue: true, secondary: true, path: true },
    order: 0.45,
    plazaSize: 2,
    parkChance: 0.14,
    treeDensity: 0.85,
    citizenRoles: [
      { fr: "suit les remparts", en: "walking the ramparts" }, { fr: "rejoint l'atelier", en: "off to the workshop" },
      { fr: "porte un message", en: "carrying a message" }, { fr: "monte la garde", en: "standing guard" },
      { fr: "prie au sanctuaire", en: "praying at the shrine" }
    ],
    vehicles: [{ type: "wagon", weight: 2 }, { type: "chariot", weight: 2 }, { type: "caravan", weight: 1 }],
    decorDensity: 0.6
  },
  { // 4 — impérial : avenues, forums, quartiers denses
    id: "imperial",
    archetypes: ["districts", "capital", "radial"],
    roadRanks: { main: true, avenue: true, secondary: true, path: true },
    order: 0.62,
    plazaSize: 3,
    parkChance: 0.12,
    treeDensity: 0.7,
    citizenRoles: [
      { fr: "sort d'une avenue", en: "coming off an avenue" }, { fr: "compte les chariots", en: "counting the carts" },
      { fr: "file vers les quais", en: "hurrying to the quays" }, { fr: "déclame un édit", en: "proclaiming an edict" },
      { fr: "escorte un convoi", en: "escorting a convoy" }
    ],
    vehicles: [{ type: "wagon", weight: 2 }, { type: "chariot", weight: 3 }, { type: "caravan", weight: 2 }],
    decorDensity: 0.75
  },
  { // 5 — capitale monumentale / métropole
    id: "monumental",
    archetypes: ["capital", "districts"],
    roadRanks: { main: true, avenue: true, secondary: true, path: true },
    order: 0.78,
    plazaSize: 3,
    parkChance: 0.1,
    treeDensity: 0.55,
    citizenRoles: [
      { fr: "prend une ligne rapide", en: "catching an express line" }, { fr: "traverse un quartier haut", en: "crossing an upper district" },
      { fr: "sort d'une tour", en: "leaving a tower" }, { fr: "presse le pas sous les arches", en: "hurrying under the arches" },
      { fr: "lit les proclamations", en: "reading the proclamations" }
    ],
    // ⛔ PAS DE FLOTTE MODERNE ICI (Raph 2026-08-05, en voyant sa capitale) : des
    // berlines des années 2000 sur une ville de pierre et de colonnades, « ça ne
    // va pas ». Cette ère garde la vieille automobile sombre ; le pack MinZinn
    // n'entre qu'à la bande 6, avec les tours. Le gel est aussi côté skins
    // (MODERN_FLEET_BAND dans agents.js), sinon la voiture d'ère 5 se repeindrait
    // en berline rouge tout en gardant son nom de type.
    vehicles: [{ type: "car", weight: 3 }, { type: "tram", weight: 2 }, { type: "wagon", weight: 1 }, { type: "caravan", weight: 1 }],
    decorDensity: 0.85
  },
  { // 6 — mégalopole / singularité
    id: "megalopole",
    archetypes: ["megalopolis", "capital"],
    roadRanks: { main: true, avenue: true, secondary: true, path: false },
    order: 0.9,
    plazaSize: 4,
    parkChance: 0.08,
    treeDensity: 0.4,
    citizenRoles: [
      { fr: "suit le flux civique", en: "following the civic flow" }, { fr: "rejoint une station", en: "heading for a station" },
      { fr: "marche sous les arches", en: "walking under the arches" }, { fr: "consulte un terminal", en: "checking a terminal" },
      { fr: "surveille les niveaux", en: "monitoring the levels" }
    ],
    vehicles: [
      { type: "car", weight: 3 }, { type: "tram", weight: 2 }, { type: "drone", weight: 2 },
      { type: "bus", weight: 0.6 }, { type: "van", weight: 0.5 }, { type: "truck", weight: 0.4 },
      { type: "taxi", weight: 0.5 }, { type: "police", weight: 0.25 }, { type: "ambulance", weight: 0.2 },
    ],
    decorDensity: 1
  },
  // ── Époques TRANSCENDANTES (bands 7–9) ──────────────────────────────────────
  // Réutilisent les archétypes/véhicules existants (drones) : seuls le degré
  // d'ordre, la densité, les rôles et l'ambiance (mapThemeForBand) évoluent. Les
  // SPRITES de bâtiments restent ceux de la mégalopole tant que la passe d'art
  // cosmique (Phases B/C) n'est pas faite.
  { // 7 — Noosphère : la planète-cerveau, grille quasi parfaite
    id: "noosphere",
    archetypes: ["megalopolis", "capital"],
    roadRanks: { main: true, avenue: true, secondary: true, path: false },
    order: 0.94,
    plazaSize: 4,
    parkChance: 0.06,
    treeDensity: 0.3,
    citizenRoles: [
      { fr: "dérive entre les tours-mémoire", en: "drifting between the memory towers" }, { fr: "écoute le chœur planétaire", en: "listening to the planetary choir" },
      { fr: "synchronise un nœud", en: "syncing a node" }, { fr: "veille la membrane", en: "watching over the membrane" },
      { fr: "consulte la conscience commune", en: "consulting the common mind" }
    ],
    vehicles: [{ type: "drone", weight: 4 }, { type: "tram", weight: 1 }],
    decorDensity: 1.1
  },
  { // 8 — Âge stellaire : la cité essaime, ordre absolu
    id: "stellaire",
    archetypes: ["megalopolis", "capital"],
    roadRanks: { main: true, avenue: true, secondary: true, path: false },
    order: 0.97,
    plazaSize: 5,
    parkChance: 0.05,
    treeDensity: 0.2,
    citizenRoles: [
      { fr: "guide un essaim d'étoiles", en: "guiding a swarm of stars" }, { fr: "veille un cœur stellaire", en: "tending a stellar core" },
      { fr: "ajuste une orbite", en: "adjusting an orbit" }, { fr: "déploie une voile solaire", en: "unfurling a solar sail" },
      { fr: "écoute l'esprit des étoiles", en: "listening to the spirit of the stars" }
    ],
    vehicles: [{ type: "drone", weight: 5 }, { type: "tram", weight: 1 }],
    decorDensity: 1.2
  },
  { // 9 — Démiurge : la trame du réel, grille parfaite
    id: "demiurge",
    archetypes: ["megalopolis", "capital"],
    roadRanks: { main: true, avenue: true, secondary: true, path: false },
    order: 1,
    plazaSize: 5,
    parkChance: 0.04,
    treeDensity: 0.12,
    citizenRoles: [
      { fr: "réécrit une constante", en: "rewriting a constant" }, { fr: "tisse une portion de vide", en: "weaving a patch of void" },
      { fr: "stabilise l'entropie", en: "stabilizing entropy" }, { fr: "grave une loi nouvelle", en: "engraving a new law" },
      { fr: "contemple le Grand Amas", en: "contemplating the Great Cluster" }
    ],
    vehicles: [{ type: "drone", weight: 6 }],
    decorDensity: 1.3
  }
];

export function ageConfigFor(eraBand) {
  return AGE_CONFIG[Math.max(0, Math.min(AGE_CONFIG.length - 1, eraBand | 0))];
}

export { AGE_CONFIG };
