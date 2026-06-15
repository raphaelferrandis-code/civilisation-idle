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

const AGE_CONFIG = [
  { // 0 — primitif : huttes, feux, sentiers de terre
    id: "primitif",
    archetypes: ["scattered"],
    roadRanks: { main: false, avenue: false, secondary: true, path: true },
    order: 0.05,          // 0 = organique total, 1 = grille stricte
    plazaSize: 0,         // pas de place : le feu central tient ce rôle
    parkChance: 0.3,      // espaces vides / nature dans le tissu
    treeDensity: 1.25,
    wallTier: 0,
    citizenRoles: ["veille le feu", "cherche du bois", "rentre au camp", "écoute les anciens", "guette l'horizon"],
    vehicles: [{ type: "basket", weight: 1 }],
    decorDensity: 0.2
  },
  { // 1 — agricole : maisons simples, granges, champs, chemins
    id: "agricole",
    archetypes: ["scattered", "crossroads", "linear"],
    roadRanks: { main: true, avenue: false, secondary: true, path: true },
    order: 0.15,
    plazaSize: 1,
    parkChance: 0.24,
    treeDensity: 1.1,
    wallTier: 0,
    citizenRoles: ["porte un panier", "revient des champs", "parle au puits", "mène une chèvre", "bat le grain"],
    vehicles: [{ type: "basket", weight: 2 }, { type: "barrow", weight: 2 }, { type: "cart", weight: 1 }],
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
    wallTier: 0,
    citizenRoles: ["traverse le marché", "livre des sacs", "crie une annonce", "marchande au comptoir", "pousse une brouette"],
    vehicles: [{ type: "cart", weight: 3 }, { type: "barrow", weight: 2 }, { type: "wagon", weight: 1 }],
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
    wallTier: 1,
    citizenRoles: ["suit les remparts", "rejoint l'atelier", "porte un message", "monte la garde", "prie au sanctuaire"],
    vehicles: [{ type: "cart", weight: 2 }, { type: "wagon", weight: 2 }, { type: "chariot", weight: 2 }, { type: "caravan", weight: 1 }],
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
    wallTier: 2,
    citizenRoles: ["sort d'une avenue", "compte les chariots", "file vers les quais", "déclame un édit", "escorte un convoi"],
    vehicles: [{ type: "wagon", weight: 2 }, { type: "chariot", weight: 3 }, { type: "caravan", weight: 2 }, { type: "cart", weight: 1 }],
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
    wallTier: 2,
    citizenRoles: ["prend une ligne rapide", "traverse un quartier haut", "sort d'une tour", "presse le pas sous les arches", "lit les proclamations"],
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
    // La mégalopole garde l'enceinte de son vieux centre intra-muros : la
    // muraille (rayon figé dans state.wallRadius) reste un repère historique.
    wallTier: 2,
    citizenRoles: ["suit le flux civique", "rejoint une station", "marche sous les arches", "consulte un terminal", "surveille les niveaux"],
    vehicles: [{ type: "car", weight: 3 }, { type: "tram", weight: 2 }, { type: "drone", weight: 2 }],
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
    wallTier: 2,
    citizenRoles: ["dérive entre les tours-mémoire", "écoute le chœur planétaire", "synchronise un nœud", "veille la membrane", "consulte la conscience commune"],
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
    wallTier: 2,
    citizenRoles: ["guide un essaim d'étoiles", "veille un cœur stellaire", "ajuste une orbite", "déploie une voile solaire", "écoute l'esprit des étoiles"],
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
    wallTier: 2,
    citizenRoles: ["réécrit une constante", "tisse une portion de vide", "stabilise l'entropie", "grave une loi nouvelle", "contemple le Grand Amas"],
    vehicles: [{ type: "drone", weight: 6 }],
    decorDensity: 1.3
  }
];

export function ageConfigFor(eraBand) {
  return AGE_CONFIG[Math.max(0, Math.min(AGE_CONFIG.length - 1, eraBand | 0))];
}

export { AGE_CONFIG };
