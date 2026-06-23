"use strict";

// Registre des bâtiments pour la carte (moteur / savoir / infrastructure), les
// ensembles d'ids dérivés et les priorités de slot. Extrait de layout.js (Audit
// Phase 6 / E-02) — données pures, aucune dépendance géométrique.

export const CM_ENGINE_BUILDINGS = [
  { id: "foragers",          name: "Cueilleurs",          zone: "outer"   },
  { id: "granaries_city",    name: "Entrepots",            zone: "outer"   },
  { id: "caravans",          name: "Caravanes",            zone: "caravan" },
  { id: "markets",           name: "Marches",              zone: "mid"     },
  { id: "guilds",            name: "Guildes",              zone: "center"  },
  { id: "irrigated_fields",  name: "Champs",               zone: "outer"   },
  { id: "river_ports",       name: "Ports",                zone: "river",   water: "bank" },
  { id: "water_mills",       name: "Moulins",              zone: "river",   water: "bank" },
  { id: "mint_houses",       name: "Hotels des monnaies",  zone: "center"  },
  { id: "imperial_exchanges",name: "Banques Nationnales",  zone: "center"  }
];
export const CM_KNOWLEDGE_BUILDINGS = [
  { id: "storytellers",   name: "Conteurs",              zone: "outer"  },
  { id: "scribes",        name: "Scribes",               zone: "outer"  },
  { id: "schools",        name: "Ecoles",                zone: "mid"    },
  { id: "academies",      name: "Academies",             zone: "center" },
  { id: "ancestral_cult", name: "Culte des ancetres",    zone: "center" },
  { id: "observatories",  name: "Observatoires",         zone: "edge"   },
  { id: "libraries",      name: "Bibliotheques",         zone: "mid"    },
  { id: "universities",   name: "Universites",           zone: "center" },
  { id: "printing_houses",name: "Imprimeries",           zone: "mid"    },
  { id: "think_tanks",    name: "Instituts strategiques",zone: "edge"   }
];
export const CM_INFRA_BUILDINGS = [
  { id: "aqueducts",     name: "Aqueducs",             zone: "outside"   },
  { id: "watch",         name: "Veilleurs",            zone: "edge"      },
  { id: "sewers",        name: "Egouts",               zone: "mid"       },
  { id: "bureaucracy",   name: "Bureaucratie",         zone: "center"    },
  { id: "courthouses",   name: "Tribunaux",            zone: "center"    },
  { id: "public_works",  name: "Grands travaux",       zone: "outer"     },
  { id: "ministries",    name: "Ministeres",           zone: "center"    },
  { id: "archive_grids", name: "Reseaux d'archives",   zone: "knowledge" },
  { id: "ruin_architects",name:"Architectes des ruines",zone: "ruin"     }
];
export const CM_MAP_BUILDINGS = CM_ENGINE_BUILDINGS.concat(CM_KNOWLEDGE_BUILDINGS, CM_INFRA_BUILDINGS);
export const CM_KNOWLEDGE_IDS = new Set(CM_KNOWLEDGE_BUILDINGS.map((b) => b.id));
export const CM_INFRA_IDS     = new Set(CM_INFRA_BUILDINGS.map((b) => b.id));
export const CM_SLOT_PRIORITIES = { aqueducts: 0, infra: 1, knowledge: 2, engine: 3 };
