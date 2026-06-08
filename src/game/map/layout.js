/* eslint-disable */
import { state } from '../core/state.js';
import { eras } from '../data/world.js';
import { seededRng } from '../core/utils.js';
import { currentEraIndex } from '../core/mechanics.js';
import { chronicle } from '../core/actions.js';
import { setCityMapEngineTileMap, setCaptureVestigeHandler } from './cityMapBridge.js';

/* ---- legacy citymap core\layout.js ---- */


/* ============================================================================
 * citymap-layout.js â€” Code PUR (sans dÃ©pendance navigateur/Canvas).
 *   Contient : constantes, utilitaires, computeCityLayout, et tout ce qui
 *   peut Ãªtre exÃ©cutÃ© en dehors d'un contexte DOM (simulation Node incluse).
 *   ChargÃ© AVANT citymap.js qui contient uniquement initCityMap().
 *
 * DÃ©pendances globales attendues au chargement :
 *   - seededRng()   (utils.js)
 *   - state, eras   (state.js, data-world.js)
 * ============================================================================ */

// â”€â”€ Objet Ã©tat du canvas (partagÃ© avec citymap.js) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const CM = {
  TILE: 32,
  canvas: null, ctx: null, mini: null, mctx: null,
  cam: { x: 0, y: 0, zoom: 1 },
  cw: 0, ch: 0, dpr: 1,
  layout: null, layoutSig: "", layoutCoreSig: "", layoutRecomputeAt: 0, gridN: 20,
  born: {},
  citizens: [],
  roadList: [],
  roadSet: new Set(),
  walkRoadList: [],
  walkRoadSet: new Set(),
  tileGrid: null,
  tooltip: null,
  hover: null,
  dynastyIdx: 0,
  vehicles: [],
  vehicleSig: "",
  ships: [],
  nightF: 0,
  drag: null, dragged: false,
  centered: false,
  inited: false,
  // Lazy-init au besoin dans initCityMap :
  occupied: null,
  riverRow: -999,
  rioters: null,
  riotGoal: null,
  riotGoalAt: 0,
  collapseAt: 0,
  raf: null
};
// â”€â”€ Constantes de routes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const ROAD_N = 1;
const ROAD_E = 2;
const ROAD_S = 4;
const ROAD_W = 8;
const ROAD_RANK_WEIGHT = { path: 0, secondary: 1, avenue: 2, main: 3 };
function cmBetterRoadRank(a, b) {
  return (ROAD_RANK_WEIGHT[b] || 0) > (ROAD_RANK_WEIGHT[a] || 0) ? b : a;
}

// â”€â”€ Palettes et donnÃ©es visuelles â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const CM_TINTS = ["#c9a84c", "#d8a24a", "#caa05a", "#d6b257", "#cf9a4a", "#d1c06a", "#b98f6a", "#cf8a5a"];
const CM_GIVEN = [
  "Aldric", "Sibylle", "Garin", "Mahaut", "Renaud", "Ysoria", "Tassin", "Oda",
  "Doran", "Maelis", "Albin", "Nessa", "Corin", "Aveline", "Estor", "Linnea",
  "Bertran", "Edith", "Gauvin", "Soraya", "Merin", "Talia", "Aldis", "Bruna",
  "Eda", "Tovan", "Sira", "Nehm", "Ilya", "Orun", "Khael", "Solen"
];
const CM_EPITHETS = [
  "le Veilleur", "la Patiente", "l'Ancien", "la Vive", "le Taciturne", "la Rousse",
  "le Boiteux", "la Sage", "le Cadet", "l'Aieule", "le Guetteur", "la Nomade"
];
const CM_TRADES = [
  "du Moulin", "des Granges", "la Potiere", "le Forgeron", "du Puits", "des Halles",
  "le Tisserand", "la Meuniere", "du Four", "des Tanneurs", "le Charpentier", "la Brodeuse",
  "du Marche", "des Vignes", "le Tonnelier", "la Verriere"
];
const CM_HOUSES = [
  "Valmoren", "Castaigne", "des Hauts-Quartiers", "Tessandier", "du Levant", "Brassac",
  "des Ponts", "Aldenne", "Virelane", "Montargis", "de Sorel", "Carrac",
  "des Archives", "Vauquelin", "de Roanne", "Esterlin"
];
const CM_ROLES = [
  ["veille le feu", "cherche du bois", "rentre au camp"],
  ["porte un panier", "revient des champs", "parle au puits"],
  ["traverse le marche", "livre des sacs", "suit les remparts"],
  ["rejoint l'atelier", "passe par la halle", "porte un message"],
  ["sort d'une avenue", "compte les chariots", "file vers les quais"],
  ["prend une ligne rapide", "traverse un quartier haut", "sort d'une tour"],
  ["suit le flux civique", "rejoint une station", "marche sous les arches"]
];
const CM_STREET_OF = [
  "des Tanneurs", "du Levant", "des Halles", "du Puits", "des Granges", "des Forges",
  "du Marche", "des Ponts", "du Vieux Mur", "des Lampes", "du Sillon", "des Cendres",
  "du Fleuve", "des Archives", "du Rempart", "des Greniers", "du Couchant", "des Orfevres"
];

// â”€â”€ BÃ¢timents (registre pour la carte) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const CM_ENGINE_BUILDINGS = [
  { id: "foragers",          name: "Cueilleurs",          zone: "outer"   },
  { id: "granaries_city",    name: "Greniers",             zone: "outer"   },
  { id: "caravans",          name: "Caravanes",            zone: "caravan" },
  { id: "markets",           name: "Marches",              zone: "mid"     },
  { id: "guilds",            name: "Guildes",              zone: "center"  },
  { id: "irrigated_fields",  name: "Champs irrigues",      zone: "outer"   },
  { id: "river_ports",       name: "Ports fluviaux",       zone: "river"   },
  { id: "water_mills",       name: "Moulins hydrauliques", zone: "river"   },
  { id: "mint_houses",       name: "Hotels des monnaies",  zone: "center"  },
  { id: "imperial_exchanges",name: "Bourses imperiales",   zone: "center"  }
];
const CM_KNOWLEDGE_BUILDINGS = [
  { id: "storytellers",   name: "Conteurs",              zone: "outer"  },
  { id: "scribes",        name: "Scribes",               zone: "outer"  },
  { id: "schools",        name: "Ecoles",                zone: "mid"    },
  { id: "academies",      name: "Academies",             zone: "center" },
  { id: "ancestral_cult", name: "Culte des ancetres",    zone: "center" },
  { id: "observatories",  name: "Observatoires",         zone: "edge"   },
  { id: "libraries",      name: "Bibliotheques",         zone: "mid"    },
  { id: "universities",   name: "Universites",           zone: "center" },
  { id: "printing_houses",name: "Maisons d'impression",  zone: "mid"    },
  { id: "think_tanks",    name: "Instituts strategiques",zone: "edge"   }
];
const CM_INFRA_BUILDINGS = [
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
const CM_MAP_BUILDINGS = CM_ENGINE_BUILDINGS.concat(CM_KNOWLEDGE_BUILDINGS, CM_INFRA_BUILDINGS);
const CM_KNOWLEDGE_IDS = new Set(CM_KNOWLEDGE_BUILDINGS.map((b) => b.id));
const CM_INFRA_IDS     = new Set(CM_INFRA_BUILDINGS.map((b) => b.id));
const CM_SLOT_PRIORITIES = { aqueducts: 0, infra: 1, knowledge: 2, engine: 3 };

// â”€â”€ Merveilles â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const CM_WONDERS = [
  { id: "dynasty1",       name: "Le Premier Mausolee",  icon: "obelisk", unlockedBy: "Premiere dynastie fondee.", test: (s) => (s.dynastyCount || 0) >= 1 },
  { id: "pop1m",          name: "La Grande Halle",       icon: "hall",    unlockedBy: "Population d'au moins 1 000 000.", test: (s) => (s.population || 0) >= 1e6 },
  { id: "era_kingdom",    name: "La Couronne de Pierre", icon: "dome",    unlockedBy: "Age du royaume atteint.", test: (s) => cmEraIndexFor(s) >= 9  },
  { id: "era_empire",     name: "Le Forum Imperial",     icon: "hall",    unlockedBy: "Age imperial atteint.", test: (s) => cmEraIndexFor(s) >= 12 },
  { id: "era_mega",       name: "La Spire des Mondes",   icon: "spire",   unlockedBy: "Age megastructurel atteint.", test: (s) => cmEraIndexFor(s) >= 15 },
  { id: "era_singularity",name: "L'Axe Civique",         icon: "obelisk", unlockedBy: "Age de singularite atteint.", test: (s) => cmEraIndexFor(s) >= 19 }
];
const WONDER_CLEAR_R = 4; // rayon libre (tuiles) autour de chaque merveille

// â”€â”€ Utilitaires purs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function cmClamp(v, a, b) { return Math.max(a, Math.min(b, Math.round(v))); }

function cmHash(text) {
  let h = 2166136261;
  for (let i = 0; i < String(text).length; i += 1) {
    h ^= String(text).charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function cmPick(list, seed) { return list[seed % list.length]; }

function cmEraFrac(index) {
  // ProtÃ¨ge contre eras vide ou non dÃ©fini
  const len = (typeof eras !== "undefined" && Array.isArray(eras)) ? eras.length : 0;
  const max = len > 1 ? len - 1 : 19;
  return Math.max(0, Math.min(1, index / max));
}
function cmEraBand(index) {
  return Math.max(0, Math.min(6, Math.floor(cmEraFrac(index) * 6.999)));
}
function cmEraIndexFor(s) {
  if (typeof currentEraIndex === "function") return currentEraIndex();
  if (typeof eras !== "undefined" && Array.isArray(eras) && eras.length > 0) {
    let index = 0;
    const pop = s.population || 0;
    for (let i = 0; i < eras.length; i += 1) {
      if (pop >= eras[i].at) index = i; else break; // early exit (seuils croissants)
    }
    return index;
  }
  return 0;
}

function cmEngineTier(count) {
  if (count >= 64) return 3;
  if (count >= 25) return 2;
  if (count >= 10) return 1;
  return 0;
}
function cmEngineFootprint(id, count) {
  const tier = cmEngineTier(count);
  if (id === "imperial_exchanges") return count >= 64 ? 5 : count >= 25 ? 4 : 3;
  if (id === "ministries")         return count >= 64 ? 5 : count >= 25 ? 4 : 3;
  if (id === "universities")       return count >= 64 ? 4 : count >= 25 ? 3 : 2;
  if (id === "think_tanks")        return count >= 64 ? 4 : count >= 25 ? 3 : 2;
  if (id === "aqueducts")          return tier >= 2 ? 4 : tier >= 1 ? 3 : 2;
  if (id === "mint_houses")        return tier >= 2 ? 3 : 2;
  if (id === "courthouses"  || id === "archive_grids" || id === "ruin_architects") return tier >= 2 ? 3 : 2;
  if (id === "academies"    || id === "libraries"     || id === "ancestral_cult")  return tier >= 2 ? 3 : 2;
  if (id === "bureaucracy"  || id === "public_works") return tier >= 2 ? 3 : tier >= 1 ? 2 : 1;
  if (id === "watch"        || id === "sewers")       return tier >= 2 ? 2 : 1;
  if (id === "printing_houses" || id === "schools")   return tier >= 2 ? 3 : tier >= 1 ? 2 : 1;
  if (id === "observatories")   return tier >= 2 ? 3 : tier >= 1 ? 2 : 1;
  if (id === "storytellers" || id === "scribes")      return tier >= 2 ? 2 : 1;
  if (id === "river_ports"  || id === "water_mills")  return tier >= 2 ? 3 : tier >= 1 ? 2 : 1;
  if (id === "irrigated_fields") return tier >= 1 ? 3 : 2;
  return tier >= 2 ? 3 : tier >= 1 ? 2 : 1;
}
function cmAqueductSpan(level) {
  if (level >= 25) return 10;
  if (level >= 10) return 7;
  if (level >= 5)  return 5;
  return 3;
}
function cmEngineInstances(count, id) {
  if (id === "aqueducts") return count > 0 ? [Math.floor(count)] : [];
  if (count <= 0) return [];
  const out = [], n = Math.floor(count), maxGroups = 6;
  if (n >= 10) out.push(10);
  if (n >= 25) out.push(25);
  if (n >= 64) out.push(64);
  if (n < 10) {
    for (let i = 0; i < n && out.length < maxGroups; i += 1) out.push(1);
    return out;
  }
  const covered = n >= 64 ? 64 : n >= 25 ? 25 : 10;
  let extra = Math.max(0, n - covered);
  while (extra >= 64 && out.length < maxGroups) { out.push(64); extra -= 64; }
  while (extra >= 25 && out.length < maxGroups) { out.push(25); extra -= 25; }
  while (extra >= 10 && out.length < maxGroups) { out.push(10); extra -= 10; }
  while (extra >  0  && out.length < maxGroups) { out.push(1);  extra -= 1;  }
  return out;
}

function cmMapSlotKey(cycle, buildingId, index) { return `${cycle || 0}:${buildingId}:${index}`; }
function cmMapSlotPriority(meta) {
  if (meta.id === "aqueducts")      return CM_SLOT_PRIORITIES.aqueducts;
  if (CM_INFRA_IDS.has(meta.id))    return CM_SLOT_PRIORITIES.infra;
  if (CM_KNOWLEDGE_IDS.has(meta.id))return CM_SLOT_PRIORITIES.knowledge;
  return CM_SLOT_PRIORITIES.engine;
}
function cmCityMapSlotsFor(s) {
  if (s.cityMapSlots && typeof s.cityMapSlots === "object" && !Array.isArray(s.cityMapSlots)) return s.cityMapSlots;
  s.cityMapSlots = {};
  return s.cityMapSlots;
}
function cmCitizenName(seed, band) {
  if (band === undefined) {
    band = (typeof state !== "undefined" && state) ? cmEraBand(cmEraIndexFor(state)) : 3;
  }
  const given = cmPick(CM_GIVEN, seed);
  if (band <= 1) return seed % 3 === 0 ? `${given} ${cmPick(CM_EPITHETS, Math.floor(seed / 5))}` : given;
  if (band <= 3) return `${given} ${cmPick(CM_TRADES, Math.floor(seed / 7))}`;
  return `${given} ${cmPick(CM_HOUSES, Math.floor(seed / 7))}`;
}
function cmRoadName(gx, gy) {
  const L = CM.layout;
  const cx = L ? L.cx : 0, cy = L ? L.cy : 0;
  const band = (L && L.counts) ? L.counts.eraBand : 2;
  const vertical = Math.abs(gx - cx) >= Math.abs(gy - cy);
  const lineId = vertical ? 1000 + gx : 2000 + gy;
  const major = gx === cx || gy === cy;
  const of = cmPick(CM_STREET_OF, cmHash("of" + lineId));
  const kindList = major
    ? (band >= 4 ? ["Avenue", "Boulevard", "Grande Voie"] : ["Grand-Rue", "Grande Voie", "Voie"])
    : (band >= 4 ? ["Rue", "Avenue", "Passage"] : ["Rue", "Ruelle", "Venelle", "Sente"]);
  return `${cmPick(kindList, cmHash("k" + lineId))} ${of}`;
}

// â”€â”€ Merveilles : slots et vÃ©rification â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function cmBaseWonderSlot(idx, gridN, cx, cy) {
  const angle = idx * (Math.PI * 2 / CM_WONDERS.length) - Math.PI / 2;
  const ring = Math.max(WONDER_CLEAR_R + 2, Math.min(Math.round(gridN * 0.28), 30));
  return { gx: Math.round(cx + Math.cos(angle) * ring), gy: Math.round(cy + Math.sin(angle) * ring) };
}

function cmWonderSlot(idx, gridN, cx, cy) {
  const saved = CM.layout && CM.layout.wonderSlots && CM.layout.wonderSlots[idx];
  if (saved && saved.gridN === gridN && saved.cx === cx && saved.cy === cy) return { gx: saved.gx, gy: saved.gy };
  return cmBaseWonderSlot(idx, gridN, cx, cy);
}

function cmDryWonderSlot(idx, gridN, cx, cy, riverSet, bankSet) {
  const base = cmBaseWonderSlot(idx, gridN, cx, cy);
  const waterR = Math.max(2, WONDER_CLEAR_R - 1);
  const blocked = (gx, gy) => {
    if (gx < 2 || gy < 2 || gx > gridN - 3 || gy > gridN - 3) return true;
    for (let dy = -waterR; dy <= waterR; dy += 1) {
      for (let dx = -waterR; dx <= waterR; dx += 1) {
        if (Math.hypot(dx, dy) > waterR) continue;
        const k = (gx + dx) + "," + (gy + dy);
        if ((riverSet && riverSet.has(k)) || (bankSet && bankSet.has(k))) return true;
      }
    }
    return false;
  };
  if (!blocked(base.gx, base.gy)) return { ...base, gridN, cx, cy };

  const angle = idx * (Math.PI * 2 / CM_WONDERS.length) - Math.PI / 2;
  let best = null, bestScore = Infinity;
  for (let radius = 1; radius <= WONDER_CLEAR_R + 8; radius += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const gx = base.gx + dx, gy = base.gy + dy;
        if (blocked(gx, gy)) continue;
        const outward = -((gx - base.gx) * Math.cos(angle) + (gy - base.gy) * Math.sin(angle)) * 0.18;
        const score = Math.hypot(dx, dy) + outward;
        if (score < bestScore) {
          bestScore = score;
          best = { gx, gy, gridN, cx, cy };
        }
      }
    }
    if (best) return best;
  }
  return { ...base, gridN, cx, cy };
}
function cmCheckWonders(now) {
  if (typeof state === "undefined" || !state) return;
  if (!Array.isArray(state.wonders)) state.wonders = [];
  for (const w of CM_WONDERS) {
    if (state.wonders.includes(w.id)) continue;
    let ok = false;
    try { ok = !!w.test(state); } catch (e) { ok = false; }
    if (ok) {
      state.wonders.push(w.id);
      CM.born["wonder:" + w.id] = now;
      if (typeof chronicle === "function") chronicle(`Merveille erigee : ${w.name}. La cite grave son ascension dans la pierre.`);
    }
  }
}

// â”€â”€ Graphe routier â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function cmIsBridgeRoad(layout, gx, gy) {
  const road = layout && layout.roadMap && layout.roadMap.get(gx + "," + gy);
  return !!(road && road.roadSurface === "bridge");
}

function cmBuildRoadGraph(roads, roadSet, roadMeta, river, cx, cy) {
  const key = (gx, gy) => gx + "," + gy;
  const isWater = (gx, gy) => !!(river && river.cells && river.cells.has(key(gx, gy)));
  const buildGraph = (activeSet) => {
    const isCore  = (gx, gy) => activeSet.has(key(gx, gy));
    const metaAt  = (gx, gy) => {
      const meta = roadMeta && roadMeta.get(key(gx, gy));
      return meta || { h: false, v: false, rank: "path" };
    };
    const allows = (gx, gy, dx, dy) => {
      if (!isCore(gx, gy)) return false;
      const meta = metaAt(gx, gy);
      if (dx !== 0) return !!meta.h;
      if (dy !== 0) return !!meta.v;
      return false;
    };
    const shouldConnect = (gx, gy, dx, dy) => {
      const nx = gx + dx, ny = gy + dy;
      if (!isCore(nx, ny)) return false;
      return allows(gx, gy, dx, dy) && allows(nx, ny, -dx, -dy);
    };
    const roadMap = new Map();
    const out = roads.filter((r) => activeSet.has(key(r.gx, r.gy))).map((r) => {
      const meta = metaAt(r.gx, r.gy);
      let mask = 0;
      if (shouldConnect(r.gx, r.gy,  0, -1)) mask |= ROAD_N;
      if (shouldConnect(r.gx, r.gy,  1,  0)) mask |= ROAD_E;
      if (shouldConnect(r.gx, r.gy,  0,  1)) mask |= ROAD_S;
      if (shouldConnect(r.gx, r.gy, -1,  0)) mask |= ROAD_W;
      const degree = (mask & ROAD_N ? 1 : 0) + (mask & ROAD_E ? 1 : 0) + (mask & ROAD_S ? 1 : 0) + (mask & ROAD_W ? 1 : 0);
      const orientation = meta.h && meta.v ? "intersection" : meta.h ? "horizontal" : meta.v ? "vertical" : "isolated";
      const type = orientation === "intersection" ? (degree >= 4 ? "intersection" : "junction") : "roadCore";
      const roadSurface = isWater(r.gx, r.gy) ? "bridge" : "road";
      const rr = { ...r, mask, orientation, roadType: type, roadSurface, rank: meta.rank || "path" };
      roadMap.set(key(r.gx, r.gy), rr);
      return rr;
    });
    return { roads: out, roadMap };
  };

  const activeSet = new Set(roadSet);
  let graph = buildGraph(activeSet);
  const bridgeKeys = graph.roads.filter((r) => r.roadSurface === "bridge").map((r) => key(r.gx, r.gy));
  const seen = new Set(), invalid = new Set();
  const dirInfo = [
    { bit: ROAD_N, dx: 0, dy: -1, name: "n" },
    { bit: ROAD_E, dx: 1, dy:  0, name: "e" },
    { bit: ROAD_S, dx: 0, dy:  1, name: "s" },
    { bit: ROAD_W, dx:-1, dy:  0, name: "w" }
  ];
  const oppositeDir = { n: "s", e: "w", s: "n", w: "e" };
  const hasLandRoadBehindExit = (exit) => {
    if (!exit || !exit.to || exit.to.roadSurface !== "road") return false;
    const backToBridge = oppositeDir[exit.name];
    for (const d of dirInfo) {
      if (d.name === backToBridge) continue;
      if (!(exit.to.mask & d.bit)) continue;
      const nr = graph.roadMap.get(key(exit.to.gx + d.dx, exit.to.gy + d.dy));
      if (nr && nr.roadSurface === "road") return true;
    }
    return false;
  };
  const hasExit = (exits, name, predicate) => exits.some((e) => e.name === name && predicate(e) && hasLandRoadBehindExit(e));
  const isStraightBridgeSegment = (component, exits) => {
    if (!component.length) return false;
    const xs = component.map((r) => r.gx), ys = component.map((r) => r.gy);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    let vertical   = minX === maxX && maxY > minY;
    let horizontal = minY === maxY && maxX > minX;
    if (component.length === 1) {
      const mask = component[0].mask;
      vertical   = !!((mask & ROAD_N) && (mask & ROAD_S) && !(mask & (ROAD_E | ROAD_W)));
      horizontal = !!((mask & ROAD_E) && (mask & ROAD_W) && !(mask & (ROAD_N | ROAD_S)));
    }
    if (vertical === horizontal) return false;
    if (vertical) {
      const innerV = component.filter((r) => r.gy !== minY && r.gy !== maxY);
      if (innerV.some((r) => r.mask & (ROAD_E | ROAD_W))) return false;
      return hasExit(exits, "n", (e) => e.from.gy === minY) && hasExit(exits, "s", (e) => e.from.gy === maxY);
    }
    const innerH = component.filter((r) => r.gx !== minX && r.gx !== maxX);
    if (innerH.some((r) => r.mask & (ROAD_N | ROAD_S))) return false;
    return hasExit(exits, "w", (e) => e.from.gx === minX) && hasExit(exits, "e", (e) => e.from.gx === maxX);
  };

  for (const startKey of bridgeKeys) {
    if (seen.has(startKey)) continue;
    const stack = [startKey], component = [], exits = [];
    seen.add(startKey);
    while (stack.length) {
      const k = stack.pop();
      const r = graph.roadMap.get(k);
      if (!r) continue;
      component.push(r);
      for (const d of dirInfo) {
        if (!(r.mask & d.bit)) continue;
        const nk = key(r.gx + d.dx, r.gy + d.dy);
        const nr = graph.roadMap.get(nk);
        if (nr && nr.roadSurface === "bridge" && !seen.has(nk)) { seen.add(nk); stack.push(nk); }
        else if (nr && nr.roadSurface === "road") exits.push({ name: d.name, from: r, to: nr });
      }
    }
    if (!isStraightBridgeSegment(component, exits)) {
      for (const r of component) invalid.add(key(r.gx, r.gy));
    }
  }
  if (invalid.size) {
    for (const k of invalid) activeSet.delete(k);
    graph = buildGraph(activeSet);
  }
  return { roads: graph.roads, roadMap: graph.roadMap, roadSet: activeSet };
}

function cmIsWalkableRoad(layout, gx, gy) {
  if (!layout || !layout.roadSet || !layout.roadSet.has(gx + "," + gy)) return false;
  const k = gx + "," + gy;
  if (layout.river && layout.river.cells && layout.river.cells.has(k)) return cmIsBridgeRoad(layout, gx, gy);
  if (layout.river && layout.river.banks && layout.river.banks.has(k)) {
    const rm = layout.roadMap;
    return [[1,0],[-1,0],[0,1],[0,-1]].some(([dx, dy]) => {
      const nr = rm && rm.get((gx + dx) + "," + (gy + dy));
      return nr && nr.roadSurface === "bridge";
    });
  }
  return true;
}

// â”€â”€ Compteurs et disposition â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function cityCounts(s) {
  const b = s.buildings || {};
  const get = (id) => b[id] || 0;
  const foodB = get("foragers") + get("granaries_city") + get("irrigated_fields") + get("water_mills") + get("river_ports");
  const lg = (v) => Math.log10(Math.max(0, v) + 1);
  const eraIndex    = cmEraIndexFor(s);
  const eraFrac     = cmEraFrac(eraIndex);
  const eraBand     = cmEraBand(eraIndex);
  const popDepth    = lg(s.population);
  const infraDepth  = lg(s.infrastructure);
  const knowledgeDepth = lg(s.knowledge);
  const urbanTier   = cmClamp(eraBand * 1.8 + Math.max(0, infraDepth - 5) * 0.85, 0, 14);
  const campTier    = cmClamp(popDepth - 1, 0, 3);
  const lateSurge   = Math.pow(Math.max(0, eraIndex - 12), 2.08);
  // Multiplicateur progressif : village compact (×1) → mégalopole étendue (×2.5)
  const lateScale   = 1 + Math.pow(eraFrac, 2) * 1.5;
  const houseCap    = Math.round((8 + Math.pow(eraFrac, 1.72) * 650) * lateScale);
  const farmCap     = Math.round((3 + Math.pow(eraFrac, 1.02) * 190) * Math.sqrt(lateScale));
  const publicCap   = Math.round(Math.max(0, -3 + Math.pow(eraFrac, 1.32) * 180) * lateScale);
  const libCap      = Math.round(Math.max(0, -2 + Math.pow(eraFrac, 1.42) * 140) * lateScale);
  const ringCap     = Math.round(1 + eraFrac * 15);
  const districtCap = Math.round(Math.max(0, Math.pow(Math.max(0, eraFrac - 0.34) / 0.66, 1.25) * 50) * lateScale);
  const monumentCap = Math.round(Math.max(0, Math.pow(Math.max(0, eraFrac - 0.22) / 0.78, 1.14) * 34) * lateScale);
  const houses         = cmClamp(2 + Math.pow(popDepth, 1.48) * 4.7 + Math.pow(eraIndex, 1.62) * 3.05 + lateSurge * 4.5, 1, houseCap);
  const farms          = cmClamp(Math.sqrt(foodB) * 1.4 + eraIndex * 1.75, 0, farmCap);
  const publics        = eraBand < 1 ? 0 : cmClamp(infraDepth * 3.9 + (get("markets") + get("guilds")) / 3.2 + eraIndex * 2.15 + lateSurge * 1.4, 0, publicCap);
  const libs           = eraBand < 1 ? 0 : cmClamp(knowledgeDepth * 3.2 + eraIndex * 1.55 + lateSurge * 1.05, 0, libCap);
  const infraRings     = cmClamp(infraDepth * 0.5 + eraIndex * 0.18, 0, ringCap);
  const megaDistricts  = eraBand < 3 ? 0 : cmClamp(Math.pow(Math.max(0, eraIndex - 7), 1.35) * 1.25 + Math.max(0, popDepth - 6.2) * 2 + Math.max(0, infraDepth - 5.5) * 1.45, 0, districtCap);
  const civicMonuments = eraBand < 2 ? 0 : cmClamp(Math.pow(Math.max(0, eraIndex - 4), 1.18) * 1.05 + Math.max(0, infraDepth - 4.5) * 1.15 + Math.max(0, knowledgeDepth - 4.5) * 1.1, 0, monumentCap);
  return { houses, farms, publics, libs, infraRings, megaDistricts, civicMonuments, urbanTier, campTier, eraIndex, eraBand, eraFrac };
}

// â”€â”€ GÃ©nÃ©ration de la disposition (pure) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function computeCityLayout(s) {
  const c = cityCounts(s);
  const total = c.houses + c.farms + c.publics + c.libs;
  const enginePressure = CM_MAP_BUILDINGS.reduce((sum, meta) => {
    const level = Math.floor((s.buildings && s.buildings[meta.id]) || 0);
    return sum + cmEngineInstances(level).reduce((acc, group) => acc + Math.max(1, cmEngineFootprint(meta.id, group) ** 2), 0);
  }, 0);
  // Facteur de packing : village dense (0.27) → mégalopole diffuse (0.13)
  const packFactor = 0.27 - c.eraFrac * 0.14;
  let N = 20;
  while (N * N * packFactor < total + enginePressure * 1.35 + 10 + c.megaDistricts * 18 && N < 300) N += 2;
  const cx = Math.floor(N / 2), cy = Math.floor(N / 2);

  // RiviÃ¨re fixe â€” stockÃ©e dans state.riverWP, la ville s'Ã©tend autour
  const xStart = cx - N * 1.8, xEnd = cx + N * 1.8;
  const WN = 6;
  let WP;
  if (s.riverWP && s.riverWP.length === WN) {
    WP = s.riverWP.map((p, i) => ({
      x: xStart + (xEnd - xStart) * (i / (WN - 1)),
      y: cy + p.dy
    }));
  } else {
    const rrng = seededRng(cmHash("river:v1") + 7);
    const bandY = cy + N * 0.24;
    WP = [];
    for (let i = 0; i < WN; i += 1) {
      WP.push({ x: xStart + (xEnd - xStart) * (i / (WN - 1)), y: cmClamp(bandY + (rrng() - 0.5) * N * 0.22, cy + N * 0.08, N - 1.5) });
    }
    s.riverWP = WP.map((p) => ({ dy: p.y - cy }));
  }
  const cr = (a, b, c2, d, t) => { const t2 = t * t, t3 = t2 * t; return 0.5 * (2 * b + (-a + c2) * t + (2 * a - 5 * b + 4 * c2 - d) * t2 + (-a + 3 * b - 3 * c2 + d) * t3); };
  const riverSamples = [];
  for (let i = 0; i < WN - 1; i += 1) {
    const p0 = WP[Math.max(0, i - 1)], p1 = WP[i], p2 = WP[i + 1], p3 = WP[Math.min(WN - 1, i + 2)];
    for (let st = 0; st < 12; st += 1) {
      const t = st / 12;
      const x = cr(p0.x, p1.x, p2.x, p3.x, t), y = cr(p0.y, p1.y, p2.y, p3.y, t);
      const u = Math.max(0, Math.min(1, (x - xStart) / (xEnd - xStart)));
      riverSamples.push({ x, y, hw: 1.5 + 0.5 * Math.sin(Math.PI * u) });
    }
  }
  riverSamples.push({ x: WP[WN - 1].x, y: WP[WN - 1].y, hw: 1.5 });
  const riverSet = new Set(), bankSet = new Set(), nearSet = new Set();
  for (const sp of riverSamples) {
    const R = sp.hw;
    for (let gx = Math.floor(sp.x - R - 3); gx <= Math.ceil(sp.x + R + 3); gx += 1) {
      for (let gy = Math.floor(sp.y - R - 3); gy <= Math.ceil(sp.y + R + 3); gy += 1) {
        const d = Math.hypot(gx + 0.5 - sp.x, gy + 0.5 - sp.y);
        const k = gx + "," + gy;
        if (d <= R + 0.5)                               { riverSet.add(k); bankSet.delete(k); nearSet.delete(k); }
        else if (d <= R + 1.4) { if (!riverSet.has(k)) { bankSet.add(k);  nearSet.delete(k); } }
        else if (d <= R + 3.2) { if (!riverSet.has(k) && !bankSet.has(k)) nearSet.add(k); }
      }
    }
  }
  let riverBridge = riverSamples[0], rbd = Infinity;
  for (const sp of riverSamples) { const dd = Math.abs(sp.x - (cx + 0.5)); if (dd < rbd) { rbd = dd; riverBridge = sp; } }
  const riverYByCol = new Array(N);
  for (let gx = 0; gx < N; gx += 1) {
    let by = cy + N, bd = Infinity;
    for (const sp of riverSamples) { const dd = Math.abs(sp.x - (gx + 0.5)); if (dd < bd) { bd = dd; by = sp.y; } }
    riverYByCol[gx] = by;
  }
  const riverYAt = (gx) => riverYByCol[Math.max(0, Math.min(N - 1, Math.round(gx)))];

  const cityReachBase = Math.max(5, Math.min(N * 0.46, N * (0.18 + c.eraFrac * 0.24) + Math.sqrt(total + enginePressure * 1.1) * 0.25));
  const organicReach = (angle) => {
    const h1 = (cmHash("lobe:a:" + Math.round(angle * 1000) + ":" + c.eraIndex) % 1000) / 1000;
    const h2 = (cmHash("lobe:b:" + Math.round(angle * 700)  + ":" + (s.cycles || 0)) % 1000) / 1000;
    const lobes = Math.sin(angle * 3 + c.eraIndex * 0.27) * 0.14 + Math.cos(angle * 5 + h1 * 6.28) * 0.08 + (h2 - 0.5) * 0.08;
    return cityReachBase * (1 + lobes);
  };
  const quarterAnchors = [];
  const addAnchor = (label, angle, distMul, strength = 1) => {
    const reach = organicReach(angle) * distMul;
    quarterAnchors.push({ label, gx: cx + Math.cos(angle) * reach, gy: cy + Math.sin(angle) * reach, r: Math.max(3.2, cityReachBase * (0.14 + strength * 0.05)), strength });
  };
  const b = s.buildings || {};
  addAnchor("halles", -0.18 + (cmHash("halles:" + (s.cycles || 0)) % 50) / 200, 0.55, 1.1);
  if ((b.caravans || 0) + (b.markets || 0) + (b.guilds || 0) > 0) addAnchor("faubourg-marchand", Math.PI * 0.82, 0.92, 1.2);
  if ((b.libraries || 0) + (b.schools || 0) + (b.academies || 0) + (b.observatories || 0) > 0) addAnchor("quartier-savant", -Math.PI * 0.62, 0.82, 1.05);
  if ((b.irrigated_fields || 0) + (b.granaries_city || 0) > 0) addAnchor("ceinture-agricole", Math.PI * 0.12, 0.96, 1.15);
  if ((b.river_ports || 0) + (b.water_mills || 0) > 0 || c.eraBand >= 3) addAnchor("rive-active", Math.PI * 0.42, 0.86, 1.1);
  if ((b.public_works || 0) + (b.aqueducts || 0) + (b.watch || 0) > 0) addAnchor("travaux", -Math.PI * 0.08, 1.02, 1);
  if (c.eraBand >= 4) addAnchor("faubourg-nord", -Math.PI * 0.92, 0.9, 0.9);
  if (c.eraBand >= 5) addAnchor("quartier-haut", Math.PI * 0.02, 1.05, 0.95);
  const axisBoost = (dx, dy) => {
    const adx = Math.abs(dx), ady = Math.abs(dy);
    const major    = Math.min(adx, ady) <= 1 ? 4 + c.infraRings * 0.65 : 0;
    const diagonal = Math.abs(adx - ady) <= 1 && c.eraBand >= 3 ? 2.5 + c.infraRings * 0.35 : 0;
    return Math.max(major, diagonal);
  };
  const organicLimit = (gx, gy, margin = 0) => {
    const dx = gx + 0.5 - cx, dy = gy + 0.5 - cy;
    const dist = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);
    const riverPull = Math.max(0, 5.5 - Math.abs((gy + 0.5) - riverYAt(gx))) * (c.eraBand >= 2 ? 0.55 : 0.2);
    const quarterPull = quarterAnchors.reduce((best, q) => {
      const qd = Math.hypot((gx + 0.5) - q.gx, (gy + 0.5) - q.gy);
      return Math.max(best, Math.max(0, q.r - qd) * q.strength);
    }, 0);
    const hashEdge = ((cmHash("edge:" + gx + ":" + gy + ":" + c.eraIndex) % 1000) / 1000 - 0.5) * 1.8;
    return dist <= organicReach(angle) + axisBoost(dx, dy) + riverPull + quarterPull + hashEdge + margin;
  };
  const organicScore = (cell) => {
    const dx = cell.gx + 0.5 - cx, dy = cell.gy + 0.5 - cy;
    const reach = Math.max(1, organicReach(Math.atan2(dy, dx)) + axisBoost(dx, dy));
    return Math.hypot(dx, dy) / reach;
  };

  const roadKey = new Set(), roadMeta = new Map(), roads = [];
  const addRoad = (x, y, force = false, axis = null, rank = "secondary", allowWater = false) => {
    if (x < 0 || y < 0 || x >= N || y >= N) return;
    const k = x + "," + y;
    if (!allowWater) {
      if (riverSet.has(k) && !(x === cx || y === cy)) return;
      if (bankSet.has(k)  && !(x === cx || y === cy)) return;
    }
    if (!force && !organicLimit(x, y, 2.2)) return;
    if (axis) {
      const meta = roadMeta.get(k) || { h: false, v: false, rank: "path" };
      if (axis === "h") meta.h = true;
      if (axis === "v") meta.v = true;
      meta.rank = cmBetterRoadRank(meta.rank, rank);
      roadMeta.set(k, meta);
    }
    if (roadKey.has(k)) return;
    roadKey.add(k); roads.push({ gx: x, gy: y });
  };
  for (let i = 0; i < N; i += 1) {
    addRoad(i, cy, Math.abs(i - cx) < cityReachBase + 5, "h", "main");
    addRoad(cx, i, Math.abs(i - cy) < cityReachBase + 5 || Math.abs(i - riverBridge.y) < 3, "v", "main");
  }
  for (let ring = 1; ring <= c.infraRings; ring += 1) {
    const r = ring * 4;
    if (r >= N / 2) break;
    for (let d = -r; d <= r; d += 1) {
      addRoad(cx + d, cy - r, false, "h", ring <= 2 ? "avenue" : "secondary");
      addRoad(cx + d, cy + r, false, "h", ring <= 2 ? "avenue" : "secondary");
      addRoad(cx - r, cy + d, false, "v", ring <= 2 ? "avenue" : "secondary");
      addRoad(cx + r, cy + d, false, "v", ring <= 2 ? "avenue" : "secondary");
    }
  }
  if (c.eraBand >= 3) {
    const laneCount = Math.min(5, Math.floor((c.eraBand - 2) + c.urbanTier / 5.5));
    const laneSpan  = Math.min(N, Math.ceil(cityReachBase * 1.25 + 12));
    const minI = Math.max(0, cx - laneSpan), maxI = Math.min(N - 1, cx + laneSpan);
    for (let offset = -laneCount; offset <= laneCount; offset += 1) {
      if (offset === 0) continue;
      const lane     = offset * 7;
      const laneRank = Math.abs(offset) <= 2 ? "avenue" : "secondary";
      for (let i = minI; i <= maxI; i += 1) {
        addRoad(i,        cy + lane, false, "h", laneRank, false); // horizontales : pas de pont
        addRoad(cx + lane, i,        false, "v", laneRank, true);  // verticales   : peuvent ponter
      }
    }
  }
  for (const q of quarterAnchors) {
    // Math.round obligatoire : q.gx/gy sont des flottants (cx + Math.cos*reach).
    // Sans arrondi, les boucles "x !== bendX" ne terminent jamais (float â‰  int)
    // â†’ routes ajoutÃ©es jusqu'au bord de la grille, traversant le fleuve.
    const tx = Math.round(cmClamp(q.gx, 1, N - 2));
    const ty = Math.round(cmClamp(q.gy, 1, N - 2));
    const bendX = Math.round(cmClamp(cx + (tx - cx) * 0.55 + ((cmHash("bendx:" + q.label) % 5) - 2), 1, N - 2));
    const bendY = Math.round(cmClamp(cy + (ty - cy) * 0.35 + ((cmHash("bendy:" + q.label) % 5) - 2), 1, N - 2));
    const sx = Math.sign(bendX - cx) || 1;
    for (let x = cx; x !== bendX; x += sx) addRoad(x, bendY, false, "h", "secondary");
    addRoad(bendX, bendY, false, "h", "secondary");
    const sy = Math.sign(ty - bendY) || 1;
    for (let y = bendY; y !== ty; y += sy) addRoad(bendX, y, false, "v", "secondary");
    addRoad(bendX, ty, false, "v", "secondary");
    const sx2 = Math.sign(tx - bendX) || 1;
    for (let x = bendX; x !== tx; x += sx2) addRoad(x, ty, false, "h", "secondary");
    addRoad(tx, ty, false, "h", "path");
  }

  // Districts (anti-collision merveilles + fleuve)
  const districts = [];
  const occupiedFoot = new Set();
  const builtWonderIds = new Set(Array.isArray(s.wonders) ? s.wonders : []);
  const wonderSlots = CM_WONDERS.map((_, wi) => cmDryWonderSlot(wi, N, cx, cy, riverSet, bankSet));
  for (let wi = 0; wi < CM_WONDERS.length; wi += 1) {
    if (!builtWonderIds.has(CM_WONDERS[wi].id)) continue;
    const slot = wonderSlots[wi];
    for (let dy = -WONDER_CLEAR_R; dy <= WONDER_CLEAR_R; dy += 1)
      for (let dx = -WONDER_CLEAR_R; dx <= WONDER_CLEAR_R; dx += 1)
        if (Math.hypot(dx, dy) <= WONDER_CLEAR_R) occupiedFoot.add((slot.gx + dx) + "," + (slot.gy + dy));
  }
  const footFits = (gx, gy, size) => {
    if (gx < 1 || gy < 1 || gx + size > N - 1 || gy + size > N - 1) return false;
    if (!organicLimit(gx + size / 2, gy + size / 2, 2.8)) return false;
    for (let ax = -1; ax <= size; ax += 1) for (let ay = -1; ay <= size; ay += 1) {
      const tx = gx + ax, ty = gy + ay;
      if (occupiedFoot.has(tx + "," + ty)) return false;
      if (riverSet.has(tx + "," + ty) || bankSet.has(tx + "," + ty)) return false;
      if (ax >= 0 && ax < size && ay >= 0 && ay < size && roadKey.has(tx + "," + ty)) return false;
    }
    return true;
  };
  for (let n = 0; n < c.megaDistricts; n += 1) {
    const civicKinds = c.eraBand >= 6 ? ["spire","archive","observatory"] : c.eraBand >= 5 ? ["tower","station","archive"] : c.eraBand >= 4 ? ["palace","forum","archive"] : ["keep","market","temple"];
    const denseKinds = c.eraBand >= 6 ? ["arcology","grid","tower"]       : c.eraBand >= 5 ? ["tower","station","dense"]   : c.eraBand >= 4 ? ["forum","dense","market"]   : ["keep","market"];
    const kind = n < c.civicMonuments ? civicKinds[n % civicKinds.length] : denseKinds[n % denseKinds.length];
    const size = kind === "spire" || kind === "arcology" ? 4 : kind === "tower" || kind === "station" || kind === "palace" || kind === "archive" ? 3 : 2 + (n % 2);
    const baseAngle = (Math.PI * 2 * n) / Math.max(6, c.megaDistricts) + (n % 2) * 0.28;
    let placed = null;
    for (let attempt = 0; attempt < 10 && !placed; attempt += 1) {
      const ring = 5 + Math.floor(n / 6) * 5 + attempt;
      const angle = baseAngle + attempt * 0.17;
      // Math.floor obligatoire : les clÃ©s de riverSet/bankSet/occupiedFoot sont des entiers.
      // Sans floor, "12.83,5" != "12,5" et le check fleuve ne fonctionne jamais.
      const gx = Math.floor(cmClamp(cx + Math.cos(angle) * ring, 1, N - size - 1));
      const gy = Math.floor(cmClamp(cy + Math.sin(angle) * ring, 1, N - size - 1));
      if (footFits(gx, gy, size)) placed = { gx, gy };
    }
    if (!placed) continue;
    for (let ax = 0; ax < size; ax += 1) for (let ay = 0; ay < size; ay += 1) occupiedFoot.add((placed.gx + ax) + "," + (placed.gy + ay));
    districts.push({ gx: placed.gx, gy: placed.gy, size, kind, key: `district:${placed.gx},${placed.gy}:${kind}` });
  }

  // Zone rÃ©servÃ©e (merveilles + districts)
  const reserved = new Set();
  for (const d of districts) {
    for (let ax = 0; ax < d.size; ax += 1) for (let ay = 0; ay < d.size; ay += 1) reserved.add((d.gx + ax) + "," + (d.gy + ay));
  }
  for (let wi = 0; wi < CM_WONDERS.length; wi += 1) {
    if (!builtWonderIds.has(CM_WONDERS[wi].id)) continue;
    const slot = wonderSlots[wi];
    for (let dy = -WONDER_CLEAR_R; dy <= WONDER_CLEAR_R; dy += 1)
      for (let dx = -WONDER_CLEAR_R; dx <= WONDER_CLEAR_R; dx += 1)
        if (Math.hypot(dx, dy) <= WONDER_CLEAR_R) reserved.add((slot.gx + dx) + "," + (slot.gy + dy));
  }

  // Cellules (bÃ¢tissables + arbres)
  const cells = [];
  const quarterScore = (cell) => quarterAnchors.reduce((best, q) => {
    const qd = Math.hypot((cell.gx + 0.5) - q.gx, (cell.gy + 0.5) - q.gy);
    return Math.max(best, Math.max(0, q.r * 1.35 - qd) / Math.max(1, q.r) * q.strength);
  }, 0);
  for (let gx = 0; gx < N; gx += 1) {
    for (let gy = 0; gy < N; gy += 1) {
      const key = gx + "," + gy;
      if (roadKey.has(key) || riverSet.has(key) || bankSet.has(key) || reserved.has(key)) continue;
      if (!organicLimit(gx, gy, 0.8)) continue;
      const dx = gx - cx, dy = gy - cy;
      const score = organicScore({ gx, gy });
      const noise = (cmHash("green:" + gx + ":" + gy + ":" + c.eraIndex) % 100) / 100;
      const parkChance = Math.max(0.08, Math.min(0.42, 0.08 + Math.max(0, score - 0.58) * 0.42 - c.eraFrac * 0.05));
      cells.push({ gx, gy, d2: dx * dx + dy * dy, score, green: noise < parkChance });
    }
  }
  const buildable = cells
    .filter((cc) => !cc.green)
    .sort((a, b) => (a.score * 100 + a.d2 * 0.012 - quarterScore(a) * 15 + (cmHash("build:" + a.gx + ":" + a.gy) % 17) / 40)
                  - (b.score * 100 + b.d2 * 0.012 - quarterScore(b) * 15 + (cmHash("build:" + b.gx + ":" + b.gy) % 17) / 40));

  const tiles = [], usedKeys = new Set();
  let i = 0;
  const styleFor = (type, n, cell) => {
    if (type === "house") {
      if (c.eraBand <= 0) return "tent";
      if (c.eraBand === 1) return n % 5 === 0 ? "longhouse" : "hut";
      if (c.eraBand === 2) return n % 4 === 0 ? "courtyard" : "townhouse";
      if (c.eraBand === 3) return n % 5 === 0 ? "manor" : "stonehouse";
      if (c.eraBand === 4) return n % 3 === 0 ? "tenement" : "block";
      if (c.eraBand === 5) return n % 5 === 0 ? "tower" : n % 2 === 0 ? "tenement" : "block";
      if (c.eraIndex >= 18) return n % 6 === 0 ? "arcologyhome" : n % 3 === 0 ? "megablock" : "tower";
      return n % 5 === 0 ? "megablock" : n % 3 === 0 ? "tower" : "block";
    }
    if (type === "public") {
      const byEra = [["firepit"],["market","granary"],["temple","market","hall"],["keep","hall","temple"],["forum","palace","market"],["station","tower","forum"],["spire","station","archive"]];
      const list = byEra[Math.min(c.eraBand, byEra.length - 1)];
      return list[(n + cell.gx + cell.gy) % list.length];
    }
    if (type === "library") {
      const byEra = [["shrine"],["shrine"],["school","temple"],["library","scribehall"],["academy","archive"],["university","observatory"],["datavault","observatory"]];
      const list = byEra[Math.min(c.eraBand, byEra.length - 1)];
      return list[(n + cell.gx) % list.length];
    }
    if (type === "farm") return c.eraBand >= 4 ? "industrial" : c.eraBand >= 2 ? "field" : "patch";
    return type;
  };
  const place = (type, n) => {
    for (let k = 0; k < n && i < buildable.length; k += 1, i += 1) {
      while (i < buildable.length && usedKeys.has(buildable[i].gx + "," + buildable[i].gy)) i += 1;
      if (i >= buildable.length) break;
      const cell = buildable[i];
      tiles.push({ gx: cell.gx, gy: cell.gy, type, variant: styleFor(type, k, cell), key: cell.gx + "," + cell.gy, d2: cell.d2 });
      usedKeys.add(cell.gx + "," + cell.gy);
    }
  };

  // Emprises moteur (bÃ¢timents achetÃ©s) â€” rÃ©servÃ©es avant les tuiles dÃ©coratives
  const claimed = new Set(), engineFootprint = new Set();
  for (const d of districts) {
    for (let ax = 0; ax < d.size; ax += 1) for (let ay = 0; ay < d.size; ay += 1) claimed.add((d.gx + ax) + "," + (d.gy + ay));
  }
  const footprintFits = (gx, gy, sizeX, allowBank = false, allowRoad = false, sizeY = sizeX) => {
    if (gx < 0 || gy < 0 || gx + sizeX > N || gy + sizeY > N) return false;
    for (let ax = 0; ax < sizeX; ax += 1) for (let ay = 0; ay < sizeY; ay += 1) {
      const key = (gx + ax) + "," + (gy + ay);
      if (claimed.has(key) || (!allowRoad && roadKey.has(key)) || riverSet.has(key)) return false;
      if (!allowBank && bankSet.has(key)) return false;
    }
    return true;
  };
  const claimFootprint = (gx, gy, sizeX, sizeY = sizeX) => {
    for (let ax = 0; ax < sizeX; ax += 1) for (let ay = 0; ay < sizeY; ay += 1) claimed.add((gx + ax) + "," + (gy + ay));
  };
  const engineCandidates = (zone, size, id, index = 0, total = 1) => {
    const base = zone === "river"
      ? Array.from(new Set([...Array.from(nearSet), ...Array.from(bankSet)])).map((k) => {
          const cma = k.indexOf(",");
          return { gx: +k.slice(0, cma), gy: +k.slice(cma + 1) };
        }).filter((cell) => cell.gx >= 0 && cell.gy >= 0 && cell.gx + size <= N && cell.gy + size <= N)
      : zone === "outside"
        ? cells.filter((cell) => cell.gx >= 0 && cell.gy >= 0 && cell.gx + size <= N && cell.gy + size <= N)
        : buildable.slice();
    const dist     = (cell) => Math.hypot(cell.gx + size / 2 - cx, cell.gy + size / 2 - cy);
    const riverDist= (cell) => Math.abs((cell.gy + size / 2) - riverYAt(cell.gx + size / 2));
    const angleTarget = (Math.PI * 2 * index) / Math.max(1, total) + (cmHash(id) % 628) / 100;
    const angular  = (cell) => {
      const a = Math.atan2(cell.gy + size / 2 - cy, cell.gx + size / 2 - cx);
      let d = Math.abs(a - angleTarget);
      if (d > Math.PI) d = Math.PI * 2 - d;
      return d;
    };
    const jitter   = (cell) => (cmHash(id + ":" + index + ":" + cell.gx + ":" + cell.gy) % 1000) / 1000;
    if (zone === "center")    return base.sort((a, b) => (dist(a) + angular(a)*1.8 + jitter(a)) - (dist(b) + angular(b)*1.8 + jitter(b)));
    if (zone === "mid")       return base.sort((a, b) => (Math.abs(dist(a)-N*0.24) + angular(a)*2.4 + jitter(a)) - (Math.abs(dist(b)-N*0.24) + angular(b)*2.4 + jitter(b)));
    if (zone === "river")     return base.sort((a, b) => (riverDist(a) + Math.abs((a.gx+size/2)-(cx+(index-total/2)*4))*0.22 + jitter(a)) - (riverDist(b) + Math.abs((b.gx+size/2)-(cx+(index-total/2)*4))*0.22 + jitter(b)));
    if (zone === "caravan")   return base.sort((a, b) => (Math.abs(dist(a)-N*0.38) + angular(a)*1.4 + jitter(a)) - (Math.abs(dist(b)-N*0.38) + angular(b)*1.4 + jitter(b)));
    if (zone === "edge")      return base.sort((a, b) => (Math.abs(dist(a)-N*0.44) + angular(a)*2 + Math.max(0,a.gy-cy)*0.02 + jitter(a)) - (Math.abs(dist(b)-N*0.44) + angular(b)*2 + Math.max(0,b.gy-cy)*0.02 + jitter(b)));
    if (zone === "outside")   return base.sort((a, b) => (Math.abs(dist(a)-N*0.48) + Math.max(0,cy-a.gy)*0.025 + angular(a)*1.2 + jitter(a)) - (Math.abs(dist(b)-N*0.48) + Math.max(0,cy-b.gy)*0.025 + angular(b)*1.2 + jitter(b)));
    if (zone === "knowledge") return base.sort((a, b) => (Math.abs(dist(a)-N*0.28) + angular(a)*2 + Math.max(0,a.gy-cy)*0.01 + jitter(a)) - (Math.abs(dist(b)-N*0.28) + angular(b)*2 + Math.max(0,b.gy-cy)*0.01 + jitter(b)));
    if (zone === "ruin")      return base.sort((a, b) => (Math.abs(dist(a)-N*0.4)  + angular(a)*1.5 + Math.max(0,cy-a.gy)*0.018 + jitter(a)) - (Math.abs(dist(b)-N*0.4) + angular(b)*1.5 + Math.max(0,cy-b.gy)*0.018 + jitter(b)));
    return base.sort((a, b) => (Math.abs(dist(a)-N*0.42) + angular(a)*1.8 + jitter(a)) - (Math.abs(dist(b)-N*0.42) + angular(b)*1.8 + jitter(b)));
  };

  const slotStore      = cmCityMapSlotsFor(s);
  const cycleSlotPrefix= `${s.cycles || 0}:`;
  const liveSlotKeys   = new Set();
  const requests       = [];
  for (const meta of CM_MAP_BUILDINGS) {
    const level = Math.floor((s.buildings && s.buildings[meta.id]) || 0);
    if (level <= 0) continue;
    const instances = cmEngineInstances(level, meta.id);
    for (let ei = 0; ei < instances.length; ei += 1) {
      const groupLevel = instances[ei];
      requests.push({ meta, level, groupLevel, groupIndex: ei + 1, groupTotal: instances.length,
        tier: cmEngineTier(groupLevel), size: cmEngineFootprint(meta.id, groupLevel), slotKey: cmMapSlotKey(s.cycles, meta.id, ei) });
    }
  }
  const placedSlotKeys = new Set();
  const placeRequest   = (req, preferSavedSlot) => {
    // â”€â”€ Aqueduc : structure linÃ©aire (spanX tiles Ã— 1 tile) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (req.meta.id === "aqueducts") {
      const spanX = cmAqueductSpan(req.level), spanY = 1;
      let placed = null;
      const slot = slotStore[req.slotKey];
      if (preferSavedSlot && slot) {
        const saved = { gx: cmClamp(cx + (Number(slot.dx) || 0), 0, N - spanX), gy: cmClamp(cy + (Number(slot.dy) || 0), 0, N - spanY) };
        if (footprintFits(saved.gx, saved.gy, spanX, false, false, spanY)) placed = saved;
      }
      if (!placed) {
        const jit = (c2) => (cmHash("aq:" + c2.gx + ":" + c2.gy) % 1000) / 1000;
        const dist2 = (c2) => Math.hypot(c2.gx + spanX / 2 - cx, c2.gy + 0.5 - cy);
        const aqCells = cells.filter((c2) => c2.gx + spanX <= N && c2.gy + spanY <= N)
          .sort((a, b) => (Math.abs(dist2(a) - N * 0.46) + jit(a)) - (Math.abs(dist2(b) - N * 0.46) + jit(b)));
        for (const c2 of aqCells) {
          if (footprintFits(c2.gx, c2.gy, spanX, false, false, spanY)) { placed = c2; break; }
        }
      }
      if (!placed) return false;
      claimFootprint(placed.gx, placed.gy, spanX, spanY);
      for (let ax = 0; ax < spanX; ax += 1) for (let ay = 0; ay < spanY; ay += 1) {
        engineFootprint.add((placed.gx + ax) + "," + (placed.gy + ay));
        usedKeys.add((placed.gx + ax) + "," + (placed.gy + ay));
      }
      const dx = placed.gx + spanX / 2 - cx, dy = placed.gy + 0.5 - cy;
      tiles.push({ gx: placed.gx, gy: placed.gy, type: "engine", variant: "aqueducts", buildingId: "aqueducts",
        buildingName: req.meta.name, level: req.level, groupLevel: req.groupLevel,
        groupIndex: 1, groupTotal: 1, tier: req.tier, size: spanX, spanX, spanY,
        key: `engine:aqueducts:0:${req.slotKey}:${req.tier}`, d2: dx * dx + dy * dy });
      slotStore[req.slotKey] = { dx: placed.gx - cx, dy: placed.gy - cy, zone: req.meta.zone, id: req.meta.id };
      liveSlotKeys.add(req.slotKey);
      placedSlotKeys.add(req.slotKey);
      return true;
    }
    let size = req.size, placed = null;
    const allowBankSaved = req.meta.zone === "river";
    const slot = slotStore[req.slotKey];
    if (preferSavedSlot && slot) {
      const saved = { gx: cmClamp(cx + (Number(slot.dx) || 0), 0, N - size), gy: cmClamp(cy + (Number(slot.dy) || 0), 0, N - size) };
      if (footprintFits(saved.gx, saved.gy, size, allowBankSaved, false)) {
        placed = saved;
      } else {
        const nearby = engineCandidates(req.meta.zone, size, req.meta.id, req.groupIndex - 1, req.groupTotal)
          .sort((a, b) => (Math.hypot(a.gx - saved.gx, a.gy - saved.gy) + (cmHash(req.slotKey + ":" + a.gx + ":" + a.gy) % 100) / 500)
                        - (Math.hypot(b.gx - saved.gx, b.gy - saved.gy) + (cmHash(req.slotKey + ":" + b.gx + ":" + b.gy) % 100) / 500));
        for (const cell of nearby) if (footprintFits(cell.gx, cell.gy, size, allowBankSaved, false)) { placed = cell; break; }
      }
    }
    if (!placed) {
      const candidates = engineCandidates(req.meta.zone, size, req.meta.id, req.groupIndex - 1, req.groupTotal);
      for (const cell of candidates) if (footprintFits(cell.gx, cell.gy, size, req.meta.zone === "river")) { placed = cell; break; }
      if (!placed && req.meta.zone === "river" && size > 1) {
        size = 1;
        for (const cell of engineCandidates(req.meta.zone, 1, req.meta.id, req.groupIndex - 1, req.groupTotal))
          if (footprintFits(cell.gx, cell.gy, 1, true)) { placed = cell; break; }
      }
    }
    if (!placed) return false;
    claimFootprint(placed.gx, placed.gy, size);
    for (let ax = 0; ax < size; ax += 1) for (let ay = 0; ay < size; ay += 1) {
      engineFootprint.add((placed.gx + ax) + "," + (placed.gy + ay));
      usedKeys.add((placed.gx + ax) + "," + (placed.gy + ay));
    }
    const dx = placed.gx + size / 2 - cx, dy = placed.gy + size / 2 - cy;
    tiles.push({ gx: placed.gx, gy: placed.gy, type: "engine", variant: req.meta.id, buildingId: req.meta.id,
      buildingName: req.meta.name, level: req.level, groupLevel: req.groupLevel,
      groupIndex: req.groupIndex, groupTotal: req.groupTotal, tier: req.tier, size,
      key: `engine:${req.meta.id}:${req.groupIndex - 1}:${req.slotKey}:${req.tier}`, d2: dx * dx + dy * dy });
    slotStore[req.slotKey] = { dx: placed.gx - cx, dy: placed.gy - cy, zone: req.meta.zone, id: req.meta.id };
    liveSlotKeys.add(req.slotKey);
    placedSlotKeys.add(req.slotKey);
    return true;
  };
  const savedRequests = requests.slice().sort((a, b) => {
    const pa = cmMapSlotPriority(a.meta), pb = cmMapSlotPriority(b.meta);
    return pa - pb || a.slotKey.localeCompare(b.slotKey);
  });
  for (const req of savedRequests) if (slotStore[req.slotKey]) placeRequest(req, true);
  for (const req of requests)       if (!placedSlotKeys.has(req.slotKey)) placeRequest(req, false);
  for (const key of Object.keys(slotStore)) {
    if (!key.startsWith(cycleSlotPrefix) || !liveSlotKeys.has(key)) delete slotStore[key];
  }

  const placeCentralFirepit = () => {
    if (c.eraBand > 0) return false;
    const preferred = [
      { gx: cx + 3, gy: cy - 1 },
      { gx: cx + 2, gy: cy + 2 },
      { gx: cx - 2, gy: cy + 2 },
      { gx: cx + 2, gy: cy - 2 },
      { gx: cx - 2, gy: cy - 2 },
      { gx: cx + 3, gy: cy + 1 },
      { gx: cx - 3, gy: cy + 1 },
      { gx: cx + 1, gy: cy - 3 },
      { gx: cx - 1, gy: cy - 3 }
    ];
    const canUse = (cell) => {
      const k = cell.gx + "," + cell.gy;
      return cell.gx >= 0 && cell.gy >= 0 && cell.gx < N && cell.gy < N
        && !usedKeys.has(k) && !roadKey.has(k) && !riverSet.has(k) && !bankSet.has(k);
    };
    const cell = preferred.find(canUse) || buildable.find((c2) => !usedKeys.has(c2.gx + "," + c2.gy));
    if (!cell) return false;
    const dx = cell.gx - cx, dy = cell.gy - cy;
    tiles.push({ gx: cell.gx, gy: cell.gy, type: "public", variant: "firepit", key: "firepit:" + cell.gx + "," + cell.gy, d2: cell.d2 ?? dx * dx + dy * dy });
    usedKeys.add(cell.gx + "," + cell.gy);
    return true;
  };
  const centralFirepitPlaced = placeCentralFirepit();

  place("public", Math.max(0, c.publics - (centralFirepitPlaced ? 1 : 0)));
  place("library", c.libs);
  place("house", c.houses);
  let farmLeft = c.farms;
  const pushFarm = (cell) => {
    tiles.push({ gx: cell.gx, gy: cell.gy, type: "farm", variant: styleFor("farm", farmLeft, cell), key: cell.gx + "," + cell.gy, d2: cell.d2 });
    usedKeys.add(cell.gx + "," + cell.gy); farmLeft -= 1;
  };
  for (const cell of buildable) {
    if (farmLeft <= 0) break;
    if (!usedKeys.has(cell.gx + "," + cell.gy) && nearSet.has(cell.gx + "," + cell.gy)) pushFarm(cell);
  }
  for (let j = buildable.length - 1; farmLeft > 0 && j >= 0; j -= 1) {
    const cell = buildable[j];
    if (!usedKeys.has(cell.gx + "," + cell.gy)) pushFarm(cell);
  }

  let maxD2 = 1;
  for (const t of tiles) if (t.d2 > maxD2) maxD2 = t.d2;

  const trees = [];
  const maxR  = Math.max(1, Math.hypot(cx, cy));
  for (const cell of cells) {
    if (usedKeys.has(cell.gx + "," + cell.gy)) continue;
    const norm = Math.sqrt(cell.d2) / maxR;
    const hsh  = cmHash(cell.gx + "x" + cell.gy) % 100;
    const prob = 20 + norm * 50 - c.eraFrac * 16 + (norm > 0.55 ? 22 : 0);
    if (hsh < prob) trees.push({ gx: cell.gx, gy: cell.gy, r: 0.62 + (hsh % 30) / 80 });
  }

  const river = { present: true, samples: riverSamples, cells: riverSet, banks: bankSet, bridge: riverBridge };
  const roadGraph = cmBuildRoadGraph(roads, roadKey, roadMeta, river, cx, cy);
  const engineTileMap = new Map(
    tiles.filter((t) => t.type === "engine" && t.buildingId)
         .map((t) => [t.gx + "," + t.gy, t])
  );
  return { gridN: N, cx, cy, tiles, roads: roadGraph.roads, roadSet: roadGraph.roadSet, roadMap: roadGraph.roadMap, roadMeta, districts, trees, maxD2, counts: c, river, engineTileMap, wonderSlots };
}

// â”€â”€ Vestiges (pur, sans Canvas) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function captureVestige() {
  if (typeof state === "undefined" || !state) return;
  try {
    const L = computeCityLayout(state);
    if (!L.tiles.length) return;
    if (!Array.isArray(state.vestiges)) state.vestiges = [];
    state.vestiges.push({ gridN: L.gridN, ruins: L.tiles.map((t) => ({ x: t.gx, y: t.gy })) });
    while (state.vestiges.length > 3) state.vestiges.shift();
  } catch (e) { /* sans effet */ }
}

setCaptureVestigeHandler(captureVestige);

export {
  CM,
  CM_MAP_BUILDINGS,
  CM_ROLES,
  CM_TINTS,
  CM_WONDERS,
  ROAD_E,
  ROAD_N,
  ROAD_S,
  ROAD_W,
  WONDER_CLEAR_R,
  captureVestige,
  cityCounts,
  cmCitizenName,
  cmCheckWonders,
  cmClamp,
  cmHash,
  cmIsBridgeRoad,
  cmIsWalkableRoad,
  cmPick,
  cmRoadName,
  cmWonderSlot,
  cmDryWonderSlot,
  computeCityLayout
};
