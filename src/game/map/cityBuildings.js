"use strict";

// Registre des bâtiments pour la carte (moteur / savoir / infrastructure), les
// ensembles d'ids dérivés et les priorités de slot. Extrait de layout.js (Audit
// Phase 6 / E-02) — données pures, aucune dépendance géométrique.
// ⚠ PAS DE NOM ICI (audit I18N-4) : le registre recopiait en français seul les
// noms de data/buildings.js, et l'infobulle anglaise affichait « Hôtels des
// monnaies » là où la boutique dit « Mints ». Le titre d'un moteur se lit sur
// buildingById[id].name (déjà dans la langue du joueur), cf. cityMapDescribeTile.

const CM_ENGINE_BUILDINGS = [
  { id: "foragers",          zone: "outer"   },
  { id: "granaries_city",    zone: "outer"   },
  { id: "caravans",          zone: "caravan" },
  { id: "markets",           zone: "mid"     },
  { id: "guilds",            zone: "center"  },
  { id: "irrigated_fields",  zone: "outer"   },
  { id: "river_ports",       zone: "river",   water: "bank" },
  { id: "water_mills",       zone: "outer"   },
  { id: "mint_houses",       zone: "center"  },
  { id: "imperial_exchanges",zone: "center"  }
];
const CM_KNOWLEDGE_BUILDINGS = [
  { id: "storytellers",   zone: "outer"  },
  { id: "scribes",        zone: "outer"  },
  { id: "schools",        zone: "mid"    },
  { id: "academies",      zone: "center" },
  { id: "ancestral_cult", zone: "center" },
  { id: "observatories",  zone: "edge"   },
  { id: "libraries",      zone: "mid"    },
  { id: "universities",   zone: "center" },
  { id: "printing_houses",zone: "mid"    },
  { id: "think_tanks",    zone: "edge"   }
];
const CM_INFRA_BUILDINGS = [
  // Points d'eau semés dans la ville. La zone n'est ici qu'un DÉFAUT : chaque
  // instance reçoit la sienne par cmRequestZone (alternance des trois anneaux),
  // sans quoi elles s'alignent toutes sur le même rayon. « outside » (la berge,
  // du temps de l'aqueduc-conduite) est ce qu'on ne veut PLUS.
  { id: "aqueducts",     zone: "mid"       },
  { id: "watch",         zone: "edge"      },
  { id: "sewers",        zone: "mid"       },
  { id: "bureaucracy",   zone: "center"    },
  { id: "courthouses",   zone: "center"    },
  { id: "public_works",  zone: "outer"     },
  { id: "ministries",    zone: "center"    },
  { id: "archive_grids", zone: "knowledge" },
  { id: "ruin_architects",zone: "ruin"     }
];
export const CM_MAP_BUILDINGS = CM_ENGINE_BUILDINGS.concat(CM_KNOWLEDGE_BUILDINGS, CM_INFRA_BUILDINGS);
export const CM_KNOWLEDGE_IDS = new Set(CM_KNOWLEDGE_BUILDINGS.map((b) => b.id));
export const CM_INFRA_IDS     = new Set(CM_INFRA_BUILDINGS.map((b) => b.id));
// (Les aqueducs avaient leur propre priorité 0 : la conduite devait réserver la
//  berge avant tout le monde. Devenus points d'eau, ils passent avec les infra.)
export const CM_SLOT_PRIORITIES = { infra: 1, knowledge: 2, engine: 3 };

// LES QUARTIERS (docs/PLAN-LISIBILITE.md, Q, 2026-10-06) : la FAMILLE de chaque bâtiment
// de la ville par îlots. Un regard extérieur : « je vois la ville, pas les quartiers de la
// ville » — les halles se posaient par ANNEAU (zone), neuf familles mêlées au cœur. Elles
// se groupent maintenant par secteur autour du forum (ilotLayout.js, `quarterOf`) :
// les marchands vers le fleuve et le pont, le pouvoir et le culte du côté du forum, les
// savants de l'autre côté du cardo, les faubourgs à l'opposé du fleuve. La zone garde
// son rôle d'anneau (près du cœur ou au bord), DANS le secteur. Champs, moulins et ports
// restent hors des îlots ; les points d'eau, semés partout, n'ont pas de quartier.
export const CM_QUARTER_OF = {
  markets: "marchand", guilds: "marchand", caravans: "marchand", mint_houses: "marchand", imperial_exchanges: "marchand",
  storytellers: "savant", scribes: "savant", schools: "savant", academies: "savant", observatories: "savant",
  libraries: "savant", universities: "savant", printing_houses: "savant", think_tanks: "savant", archive_grids: "savant",
  ancestral_cult: "pouvoir", watch: "pouvoir", bureaucracy: "pouvoir", courthouses: "pouvoir", ministries: "pouvoir",
  foragers: "faubourg", granaries_city: "faubourg", sewers: "faubourg", public_works: "faubourg", ruin_architects: "faubourg",
};
