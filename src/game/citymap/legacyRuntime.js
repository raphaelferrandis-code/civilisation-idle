/* eslint-disable */
import { state, collapseInProgress, buildingById } from '../core/state.js';
import { eras } from '../data/world.js';
import { seededRng } from '../core/utils.js';
import { currentEraIndex } from '../core/mechanics.js';
import { chronicle } from '../core/actions.js';
import { setCaptureVestigeHandler, setCityMapEngineTileMap } from './cityMapBridge.js';


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
  layout: null, layoutSig: "", gridN: 20,
  born: {},
  citizens: [],
  roadList: [],
  roadSet: new Set(),
  walkRoadList: [],
  walkRoadSet: new Set(),
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
  { id: "dynasty1",       name: "Le Premier Mausolee",  icon: "obelisk", test: (s) => (s.dynastyCount || 0) >= 1 },
  { id: "pop1m",          name: "La Grande Halle",       icon: "hall",    test: (s) => (s.population || 0) >= 1e6 },
  { id: "era_kingdom",    name: "La Couronne de Pierre", icon: "dome",    test: (s) => cmEraIndexFor(s) >= 9  },
  { id: "era_empire",     name: "Le Forum Imperial",     icon: "hall",    test: (s) => cmEraIndexFor(s) >= 12 },
  { id: "era_mega",       name: "La Spire des Mondes",   icon: "spire",   test: (s) => cmEraIndexFor(s) >= 15 },
  { id: "era_singularity",name: "L'Axe Civique",         icon: "obelisk", test: (s) => cmEraIndexFor(s) >= 19 }
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
function cmWonderSlot(idx, gridN, cx, cy) {
  const angle = idx * (Math.PI * 2 / CM_WONDERS.length) - Math.PI / 2;
  const ring = Math.max(WONDER_CLEAR_R + 2, Math.min(Math.round(gridN * 0.28), 30));
  return { gx: Math.round(cx + Math.cos(angle) * ring), gy: Math.round(cy + Math.sin(angle) * ring) };
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
  const houseCap    = Math.round(8 + Math.pow(eraFrac, 1.72) * 650);
  const farmCap     = Math.round(3 + Math.pow(eraFrac, 1.02) * 190);
  const publicCap   = Math.round(Math.max(0, -3 + Math.pow(eraFrac, 1.32) * 180));
  const libCap      = Math.round(Math.max(0, -2 + Math.pow(eraFrac, 1.42) * 140));
  const ringCap     = Math.round(1 + eraFrac * 15);
  const districtCap = Math.round(Math.max(0, Math.pow(Math.max(0, eraFrac - 0.34) / 0.66, 1.25) * 50));
  const monumentCap = Math.round(Math.max(0, Math.pow(Math.max(0, eraFrac - 0.22) / 0.78, 1.14) * 34));
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
  let N = 20;
  while (N * N * 0.23 < total + enginePressure * 1.35 + 10 + c.megaDistricts * 18 && N < 280) N += 2;
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
  for (let wi = 0; wi < CM_WONDERS.length; wi += 1) {
    if (!builtWonderIds.has(CM_WONDERS[wi].id)) continue;
    const slot = cmWonderSlot(wi, N, cx, cy);
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
    const slot = cmWonderSlot(wi, N, cx, cy);
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
  return { gridN: N, cx, cy, tiles, roads: roadGraph.roads, roadSet: roadGraph.roadSet, roadMap: roadGraph.roadMap, roadMeta, districts, trees, maxD2, counts: c, river, engineTileMap };
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

/* ---- legacy citymap core\camera.js ---- */


/* ============================================================================
 * citymap-camera.js - Helpers camera/projection pour la carte Canvas.
 *   Depend de CM (citymap-layout.js) et reste sans listeners DOM.
 * ============================================================================ */

function cityMapResizeCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || (canvas.parentElement && canvas.parentElement.clientWidth) || 600;
  const h = canvas.clientHeight || 320;
  CM.dpr = dpr;
  CM.cw = w;
  CM.ch = h;
  canvas.width = Math.max(1, Math.round(w * dpr));
  canvas.height = Math.max(1, Math.round(h * dpr));
  CM.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function cityMapWorldAtScreen(sx, sy) {
  return {
    x: (sx - CM.cw / 2) / CM.cam.zoom + CM.cam.x,
    y: (sy - CM.ch / 2) / CM.cam.zoom + CM.cam.y
  };
}

function cityMapScreenFromWorld(wx, wy) {
  return {
    x: (wx - CM.cam.x) * CM.cam.zoom + CM.cw / 2,
    y: (wy - CM.cam.y) * CM.cam.zoom + CM.ch / 2
  };
}

function cityMapTileScreen(gx, gy, span = 1) {
  const s = CM.TILE * CM.cam.zoom;
  return {
    s,
    x: (gx * CM.TILE - CM.cam.x) * CM.cam.zoom + CM.cw / 2,
    y: (gy * CM.TILE - CM.cam.y) * CM.cam.zoom + CM.ch / 2,
    w: s * span,
    h: s * span
  };
}

function cityMapCenterCamera(layout) {
  if (!layout) return;
  CM.cam.x = layout.gridN * CM.TILE / 2;
  CM.cam.y = layout.gridN * CM.TILE / 2;
  CM.cam.zoom = Math.max(0.5, Math.min(1.6, CM.cw / (24 * CM.TILE)));
}

/* ---- legacy citymap core\hit-test.js ---- */


/* ============================================================================
 * citymap-hit-test.js - Detection sous souris et infobulles de la carte.
 *   Depend de CM, state, citymap-layout.js et citymap-camera.js.
 * ============================================================================ */

function cityMapEnsureTooltip(mapRoot, tooltipElement = null) {
  CM.tooltip = tooltipElement || mapRoot?.querySelector(".city-map-tooltip") || null;
}

function cityMapVariantLabel(type, variant) {
  const labels = {
    firepit: "Foyer commun",
    tent: "Tente",
    hut: "Cabane",
    longhouse: "Longue maison",
    courtyard: "Maison a cour",
    townhouse: "Maison de ville",
    manor: "Manoir",
    stonehouse: "Maison de pierre",
    tenement: "Immeuble populaire",
    block: "Bloc residentiel",
    tower: "Tour d'habitation",
    megablock: "Grand ensemble",
    arcologyhome: "Logement d'arcologie",
    patch: "Lopin cultive",
    field: "Champ organise",
    industrial: "Ferme mecanisee",
    market: "Marche",
    granary: "Grenier public",
    temple: "Temple",
    hall: "Halle civique",
    keep: "Donjon",
    forum: "Forum",
    palace: "Palais",
    station: "Station civique",
    spire: "Fleche administrative",
    shrine: "Sanctuaire",
    school: "Ecole de scribes",
    library: "Bibliotheque",
    scribehall: "Salle des scribes",
    academy: "Academie",
    archive: "Archives",
    university: "Universite",
    observatory: "Observatoire",
    datavault: "Coffre de donnees",
    dense: "Quartier dense",
    arcology: "Arcologie",
    grid: "Quartier en grille"
  };
  if (labels[variant]) return labels[variant];
  if (type === "house") return "Logement";
  if (type === "farm") return "Zone agricole";
  if (type === "library") return "Lieu de savoir";
  if (type === "public") return "Batiment public";
  return "Batiment";
}

function cityMapDescribeTile(t) {
  if (t.type === "engine") {
    const density = t.tier >= 3 ? "quartier dense" : t.tier >= 2 ? "complexe" : t.tier >= 1 ? "groupe" : "unite";
    const spread = t.groupTotal > 1 ? ` | groupe ${t.groupIndex}/${t.groupTotal} (${t.groupLevel})` : "";
    return { title: t.buildingName || cityMapVariantLabel(t.type, t.variant), body: `Niveau total ${t.level || 1}${spread} - ${density}` };
  }
  const seed = cmHash(`${t.key}:${state.cycles || 0}`);
  const band = (CM.layout && CM.layout.counts) ? CM.layout.counts.eraBand : 2;
  const title = t.type === "house"
    ? `${cityMapVariantLabel(t.type, t.variant)} de ${cmCitizenName(seed, band)}`
    : cityMapVariantLabel(t.type, t.variant);
  return { title };
}

function cityMapHitTest(sx, sy) {
  if (!CM.layout) return null;
  const world = cityMapWorldAtScreen(sx, sy);
  const gx = Math.floor(world.x / CM.TILE);
  const gy = Math.floor(world.y / CM.TILE);
  let bestCitizen = null;
  let bestDist = Infinity;
  const citizenRadius = Math.max(8, 7 * CM.cam.zoom);
  for (const p of CM.citizens) {
    const sp = cityMapScreenFromWorld(p.x, p.y);
    const dist = Math.hypot(sp.x - sx, sp.y - sy);
    if (dist < citizenRadius && dist < bestDist) {
      bestCitizen = p;
      bestDist = dist;
    }
  }
  if (bestCitizen) {
    return { title: bestCitizen.name, body: bestCitizen.role, kind: "Habitant" };
  }
  if (Array.isArray(state.wonders)) {
    for (let wi = 0; wi < CM_WONDERS.length; wi += 1) {
      const w = CM_WONDERS[wi];
      if (!state.wonders.includes(w.id)) continue;
      const slot = cmWonderSlot(wi, CM.layout.gridN, CM.layout.cx, CM.layout.cy);
      const wsx = (slot.gx * CM.TILE + CM.TILE / 2 - CM.cam.x) * CM.cam.zoom + CM.cw / 2;
      const wsy = (slot.gy * CM.TILE + CM.TILE - CM.cam.y) * CM.cam.zoom + CM.ch / 2;
      if (Math.hypot(wsx - sx, wsy - sy) < Math.max(32, CM.TILE * CM.cam.zoom * 2.5)) return { title: w.name, kind: "Merveille" };
    }
  }
  const tile = CM.layout.tiles.find((t) => t.type === "engine" && gx >= t.gx && gy >= t.gy && gx < t.gx + (t.size || 1) && gy < t.gy + (t.size || 1))
    || CM.layout.tiles.find((t) => gx >= t.gx && gy >= t.gy && gx < t.gx + (t.size || 1) && gy < t.gy + (t.size || 1));
  if (tile) {
    const info = cityMapDescribeTile(tile);
    return { ...info, kind: tile.type === "house" ? "Logement" : "Batiment" };
  }
  if (CM.roadSet.has(`${gx},${gy}`)) return { title: cmRoadName(gx, gy), kind: "Voie" };
  return null;
}

function cityMapShowTooltip(hit, sx, sy) {
  if (!CM.tooltip) return;
  if (!hit) {
    CM.tooltip.classList.remove("visible");
    CM.hover = null;
    return;
  }
  CM.hover = hit;
  const kindEl = CM.tooltip.querySelector("[data-citymap-tooltip-kind]");
  const titleEl = CM.tooltip.querySelector("[data-citymap-tooltip-title]");
  const bodyEl = CM.tooltip.querySelector("[data-citymap-tooltip-body]");
  if (kindEl) kindEl.textContent = hit.kind || "";
  if (titleEl) titleEl.textContent = hit.title || "";
  if (bodyEl) {
    bodyEl.textContent = hit.body || "";
    bodyEl.hidden = !hit.body;
  }
  CM.tooltip.style.left = `${Math.min(CM.cw - 18, sx + 14)}px`;
  CM.tooltip.style.top = `${Math.max(12, sy - 8)}px`;
  CM.tooltip.classList.add("visible");
}

/* ---- legacy citymap core\input.js ---- */


/* ============================================================================
 * citymap-input.js - Interactions souris de la carte Canvas.
 *   Depend de CM et des helpers camera/projection.
 * ============================================================================ */

function bindCityMapInput(canvas, mapRoot, callbacks = {}) {
  const showHover = callbacks.showHover || function () {};
  const clearHover = callbacks.clearHover || function () {};
  const controller = new AbortController();
  const { signal } = controller;

  // Zoom molette autour du curseur.
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const before = cityMapWorldAtScreen(mx, my);
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    CM.cam.zoom = Math.max(0.35, Math.min(3.2, CM.cam.zoom * factor));
    const after = cityMapWorldAtScreen(mx, my);
    CM.cam.x += before.x - after.x;
    CM.cam.y += before.y - after.y;
  }, { passive: false, signal });

  canvas.addEventListener("mousemove", (e) => {
    if (CM.drag) {
      clearHover();
      return;
    }
    const rect = canvas.getBoundingClientRect();
    showHover(e.clientX - rect.left, e.clientY - rect.top);
  }, { signal });
  canvas.addEventListener("mouseleave", clearHover, { signal });

  // Glisser pour se deplacer (et distinguer du clic -> gather).
  canvas.addEventListener("mousedown", (e) => {
    CM.drag = { x: e.clientX, y: e.clientY, camx: CM.cam.x, camy: CM.cam.y, moved: 0 };
  }, { signal });
  window.addEventListener("mousemove", (e) => {
    if (!CM.drag) return;
    const dx = e.clientX - CM.drag.x;
    const dy = e.clientY - CM.drag.y;
    CM.drag.moved += Math.abs(dx) + Math.abs(dy);
    CM.cam.x = CM.drag.camx - dx / CM.cam.zoom;
    CM.cam.y = CM.drag.camy - dy / CM.cam.zoom;
    canvas.style.cursor = "grabbing";
  }, { signal });
  window.addEventListener("mouseup", () => {
    if (CM.drag && CM.drag.moved > 6) CM.dragged = true;
    CM.drag = null;
    canvas.style.cursor = "grab";
  }, { signal });

  // Annule le clic -> gather si on vient de glisser.
  if (mapRoot) mapRoot.addEventListener("click", (e) => {
    if (CM.dragged) {
      e.stopImmediatePropagation();
      CM.dragged = false;
    }
  }, { capture: true, signal });

  return () => controller.abort();
}

/* ---- legacy citymap core\runtime.js ---- */


/* ============================================================================
 * citymap-runtime.js - Preparation runtime du layout Canvas.
 *   Transforme computeCityLayout(state) en listes pretes a dessiner/animer.
 * ============================================================================ */

function cityMapEnsureLayout(now, deps = {}) {
  const getVehicleDensity = deps.getVehicleDensity || function () { return 0; };
  const chooseRoadVehicleType = deps.chooseRoadVehicleType || function () { return "cart"; };

  const engineSig = CM_MAP_BUILDINGS.map((meta) => `${meta.id}:${Math.floor((state.buildings && state.buildings[meta.id]) || 0)}`).join("|");
  const sig = JSON.stringify(cityCounts(state)) + "|" + (state.cycles || 0) + "|" + engineSig;
  if (sig === CM.layoutSig && CM.layout) return;
  CM.layoutSig = sig;
  const L = computeCityLayout(state);

  // Naissance des nouvelles tuiles (anim de construction 0.5s).
  const seen = {};
  for (const t of L.tiles) {
    seen[t.key] = true;
    if (!CM.born[t.key]) CM.born[t.key] = now;
  }
  for (const d of L.districts || []) {
    seen[d.key] = true;
    if (!CM.born[d.key]) CM.born[d.key] = now;
  }
  for (const k in CM.born) if (!seen[k]) delete CM.born[k];

  CM.layout = L;
  setCityMapEngineTileMap(L.engineTileMap);
  CM.gridN = L.gridN;

  // Filtre : on ne dessine que les routes valides et les jonctions de pont.
  const validRoadSet = L.roadSet || new Set(L.roads.map((r) => `${r.gx},${r.gy}`));
  CM.roadList = L.roads.filter((r) => {
    const k = r.gx + "," + r.gy;
    if (!validRoadSet.has(k)) return false;
    const inWater = L.river && L.river.cells && L.river.cells.has(k);
    if (inWater && r.roadSurface !== "bridge") return false;
    const onBank = L.river && L.river.banks && L.river.banks.has(k);
    if (onBank && r.roadSurface !== "bridge") {
      const adjBridge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
        const nr = L.roadMap && L.roadMap.get((r.gx + dx) + "," + (r.gy + dy));
        return nr && nr.roadSurface === "bridge";
      });
      if (!adjBridge) return false;
    }
    return true;
  });
  CM.roadSet = validRoadSet;
  CM.walkRoadList = L.roads.filter((r) => cmIsWalkableRoad(L, r.gx, r.gy));
  // ClÃ©s numÃ©riques : Ã©vite les allocations string Ã  chaque lookup dans les boucles agents
  CM.walkRoadSet = new Set(CM.walkRoadList.map((r) => r.gx * 10000 + r.gy));
  // Ponts prÃ©calculÃ©s : Ã©vite Array.filter Ã  chaque frame dans cityMapDrawBridges
  CM.bridgeList = CM.roadList.filter((r) => r.roadSurface === "bridge");

  // Cellules "ville" : la foret (infinie) ne pousse pas dessus.
  const occ = new Set(L.roadSet ? Array.from(L.roadSet) : L.roads.map((r) => `${r.gx},${r.gy}`));
  for (const t of L.tiles) {
    const span = t.size || 1;
    for (let ax = 0; ax < span; ax += 1) for (let ay = 0; ay < span; ay += 1) occ.add((t.gx + ax) + "," + (t.gy + ay));
  }
  for (const d of (L.districts || [])) {
    for (let ax = 0; ax < d.size; ax += 1) for (let ay = 0; ay < d.size; ay += 1) occ.add((d.gx + ax) + "," + (d.gy + ay));
  }
  for (let wi = 0; wi < CM_WONDERS.length; wi += 1) {
    const slot = cmWonderSlot(wi, L.gridN, L.cx, L.cy);
    for (let dy = -WONDER_CLEAR_R; dy <= WONDER_CLEAR_R; dy += 1)
      for (let dx = -WONDER_CLEAR_R; dx <= WONDER_CLEAR_R; dx += 1)
        if (Math.hypot(dx, dy) <= WONDER_CLEAR_R) occ.add((slot.gx + dx) + "," + (slot.gy + dy));
  }
  if (L.river && L.river.cells) {
    for (const k of L.river.cells) occ.add(k);
    for (const k of L.river.banks) occ.add(k);
  }
  CM.occupied = occ;
  CM.riverRow = -999;

  if (!CM.centered) {
    cityMapCenterCamera(L);
    CM.centered = true;
  }

  // (Re)cree les citoyens sur les routes.
  const lateCrowd = Math.max(0, (L.counts.eraIndex || 0) - 11);
  const citizenCap = Math.round(8 + Math.pow(L.counts.eraFrac || 0, 0.74) * 650);
  const want = cmClamp(2 + L.counts.houses / 3.7 + (L.counts.eraIndex || 0) * 5.8 + L.counts.megaDistricts * 6.6 + lateCrowd * lateCrowd * 2.1, 2, citizenCap);
  if (CM.citizens.length !== want || !CM.walkRoadList.length) {
    CM.citizens = [];
    for (let n = 0; n < want && CM.walkRoadList.length; n += 1) {
      const r = CM.walkRoadList[(n * 37) % CM.walkRoadList.length];
      const seed = cmHash(`${state.cycles || 0}:${n}:${r.gx},${r.gy}`);
      const roleList = CM_ROLES[Math.min(L.counts.eraBand || 0, CM_ROLES.length - 1)];
      CM.citizens.push({
        gx: r.gx, gy: r.gy,
        x: (r.gx + 0.5) * CM.TILE, y: (r.gy + 0.5) * CM.TILE,
        tx: (r.gx + 0.5) * CM.TILE, ty: (r.gy + 0.5) * CM.TILE,
        dir: -1, goal: null, pauseT: (seed % 5) * 0.2, phase: (seed % 628) / 100,
        speed: 22 + (n % 7) * 4 + L.counts.urbanTier * 1.8,
        col: ["#e8d2a0", "#cda36a", "#b58aa8", "#8fb8cf", "#c8b27a", "#9fb0c0"][n % 6],
        name: cmCitizenName(seed, L.counts.eraBand),
        role: cmPick(roleList, Math.floor(seed / 13))
      });
    }
  }

  // Trafic evolutif : paniers -> charrettes -> chars/convois -> voitures -> drones.
  const trafficBase = getVehicleDensity(L.counts.eraIndex, "main") * Math.max(1, L.counts.eraIndex) * 2.45 + L.counts.houses / 38 + lateCrowd * lateCrowd * 1.05;
  const wantVeh = cmClamp(trafficBase, 0, L.counts.eraIndex >= 18 ? 210 : L.counts.eraIndex >= 14 ? 150 : L.counts.eraIndex >= 8 ? 72 : 20);
  const trafficSig = `${L.counts.eraIndex}:${wantVeh}:${L.roads.length}:${L.roads.map((r) => r.rank).join("").length}`;
  if (CM.vehicles.length !== wantVeh || CM.vehicleSig !== trafficSig || !CM.walkRoadList.length) {
    CM.vehicleSig = trafficSig;
    CM.vehicles = [];
    const ranked = CM.walkRoadList.filter((r) => getVehicleDensity(L.counts.eraIndex, r.rank || "secondary") > 0.08);
    const weighted = [];
    for (const r of (ranked.length ? ranked : CM.walkRoadList)) {
      const weight = r.rank === "main" ? 11 : r.rank === "avenue" ? 7 : r.rank === "secondary" ? 3 : 0;
      for (let w = 0; w < Math.max(1, weight); w += 1) weighted.push(r);
    }
    const pool = weighted.length ? weighted : CM.walkRoadList;
    for (let n = 0; n < wantVeh && pool.length; n += 1) {
      const r = pool[(n * 53) % pool.length];
      const vehicleType = chooseRoadVehicleType(L.counts.eraIndex, r.rank || "secondary", n);
      CM.vehicles.push({
        gx: r.gx, gy: r.gy, x: (r.gx + 0.5) * CM.TILE, y: (r.gy + 0.5) * CM.TILE,
        tx: (r.gx + 0.5) * CM.TILE, ty: (r.gy + 0.5) * CM.TILE,
        dir: -1, goal: null, pauseT: 0,
        type: vehicleType,
        speed: vehicleType === "drone" ? 58 + (n % 5) * 7 : vehicleType === "car" || vehicleType === "tram" ? 34 + (n % 6) * 4 : vehicleType === "basket" ? 11 + (n % 3) * 2 : vehicleType === "chariot" ? 24 + (n % 4) * 3 : vehicleType === "caravan" ? 16 + (n % 4) * 2 : 14 + (n % 4) * 2,
        col: vehicleType === "car" || vehicleType === "tram" ? ["#9b4d38", "#c0a85d", "#6f8490", "#a8a092", "#5f6f7c", "#8f6544"][n % 6] : ["#8f6534", "#b08a4a", "#7b5b35", "#c0a46a", "#6f5636", "#9a7440"][n % 6]
      });
    }
  }

  const wantShips = (L.river && L.river.present && L.counts.eraBand >= 3) ? cmClamp(2 + L.counts.eraIndex * 0.5, 2, 10) : 0;
  if (CM.ships.length !== wantShips) {
    CM.ships = [];
    for (let n = 0; n < wantShips; n += 1) {
      CM.ships.push({ t: (n / Math.max(1, wantShips)), dir: n % 2 ? 1 : -1, speed: 0.008 + (n % 4) * 0.003 });
    }
  }
}

/* ---- legacy citymap rendering\draw-utils.js ---- */


/* ============================================================================
 * citymap-draw-utils.js - Petits helpers visuels partages par les renderers.
 *   Pas de boucle, pas de listeners, pas de gros rendu de scene.
 * ============================================================================ */

function baseColor(type, variant) {
  return type === "house" ? "#8b6914"
    : type === "farm" ? (variant === "industrial" ? "#6b7b33" : "#4a7a2a")
    : type === "public" ? "#c9a84c"
    : type === "library" ? "#b58f3a"
    : "#8b6914";
}

function cmLitColor(band) {
  const n = CM.nightF || 0;
  const a = (0.32 + 0.62 * n);
  const g = Math.round(204 + (1 - n) * 28);
  const b = Math.round(68 + (1 - n) * 64);
  return `rgba(255,${g},${b},${a.toFixed(2)})`;
}

function cmRoadPalette(eraIndex, major, ruined) {
  if (ruined) {
    return {
      base: major ? "#29251c" : "#242119",
      core: major ? "#5d5646" : "#4d4739",
      edge: "rgba(32,24,16,0.45)",
      line: "rgba(115,104,82,0.38)",
      detail: "rgba(83,105,58,0.5)",
      track: "rgba(28,22,15,0.65)"
    };
  }
  if (eraIndex >= 18) {
    return {
      base: major ? "#4c4638" : "#443f34",
      core: major ? "#706852" : "#625b49",
      edge: "rgba(34,30,22,0.42)",
      line: "rgba(224,205,142,0.34)",
      detail: "rgba(230,214,160,0.24)",
      track: "rgba(55,43,25,0.35)"
    };
  }
  if (eraIndex >= 14) {
    return {
      base: major ? "#514936" : "#463f31",
      core: major ? "#786b4c" : "#695d45",
      edge: "rgba(43,34,22,0.42)",
      line: "rgba(220,202,120,0.34)",
      detail: "rgba(210,190,130,0.22)",
      track: "rgba(55,43,25,0.38)"
    };
  }
  if (eraIndex >= 11) {
    return {
      base: major ? "#6b5f43" : "#5b5038",
      core: major ? "#817354" : "#706449",
      edge: "rgba(54,43,27,0.38)",
      line: "rgba(218,190,105,0.42)",
      detail: "rgba(228,207,151,0.22)",
      track: "rgba(72,56,34,0.34)"
    };
  }
  if (eraIndex >= 7) {
    return {
      base: major ? "#5c5037" : "#51442e",
      core: major ? "#746342" : "#66573a",
      edge: "rgba(58,47,31,0.36)",
      line: "rgba(185,155,82,0.36)",
      detail: "rgba(214,190,132,0.2)",
      track: "rgba(64,48,29,0.34)"
    };
  }
  if (eraIndex >= 3) {
    return {
      base: major ? "#5a4728" : "#4c3b24",
      core: major ? "#795f38" : "#684f30",
      edge: "rgba(47,37,24,0.34)",
      line: "rgba(132,96,48,0.34)",
      detail: "rgba(176,136,72,0.2)",
      track: "rgba(58,42,23,0.34)"
    };
  }
  return {
    base: "#334020",
    core: major ? "#7a6035" : "#6c5531",
    edge: "rgba(31,39,18,0.34)",
    line: "rgba(125,96,50,0.45)",
    detail: "rgba(108,135,58,0.35)",
    track: "rgba(62,45,24,0.34)"
  };
}

function getRoadVisualStyle(eraIndex, rank, ruined, major) {
  const palette = cmRoadPalette(eraIndex, major || rank === "main", ruined);
  const widthByRank = {
    path: eraIndex >= 7 ? 0.24 : 0.2,
    secondary: eraIndex >= 12 ? 0.34 : eraIndex >= 7 ? 0.31 : 0.26,
    avenue: eraIndex >= 12 ? 0.4 : eraIndex >= 7 ? 0.36 : 0.3,
    main: eraIndex >= 12 ? 0.46 : eraIndex >= 7 ? 0.42 : 0.36
  };
  const detailRate = rank === "main" ? 5 : rank === "avenue" ? 7 : rank === "secondary" ? 9 : 13;
  return {
    palette,
    width: widthByRank[rank] || widthByRank.secondary,
    detailRate,
    borderStrength: rank === "main" ? 1 : rank === "avenue" ? 0.8 : rank === "secondary" ? 0.55 : 0.35
  };
}

/* ---- legacy citymap rendering\ground.js ---- */


/* ============================================================================
 * citymap-render-ground.js - Rendu du fond de carte Canvas.
 *   Sol, masse urbaine, fleuve, foret, vestiges et voile nocturne.
 * ============================================================================ */

const CITY_MAP_GREENS = ["#2d5a1b", "#3a6b22", "#4a7a2a", "#255018", "#1e4010", "#3d7220", "#5a8c2e", "#223d14"];

function cityMapDrawUrbanMass(layout) {
  if (!layout || layout.counts.eraBand < 2) return;
  const ctx = CM.ctx;
  const worldCx = layout.cx * CM.TILE;
  const worldCy = layout.cy * CM.TILE;
  const rx = Math.min(layout.gridN * CM.TILE * 0.49, (6 + layout.counts.eraIndex * 3.8 + layout.counts.urbanTier * 7) * CM.TILE);
  const ry = rx * 0.78;
  const sx = (worldCx - CM.cam.x) * CM.cam.zoom + CM.cw / 2;
  const sy = (worldCy - CM.cam.y) * CM.cam.zoom + CM.ch / 2;
  const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, Math.max(1, rx * CM.cam.zoom));
  g.addColorStop(0, "rgba(54,42,24,0.68)");
  g.addColorStop(0.58, "rgba(42,33,20,0.42)");
  g.addColorStop(1, "rgba(42,33,20,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(sx, sy, rx * CM.cam.zoom, ry * CM.cam.zoom, 0, 0, Math.PI * 2);
  ctx.fill();
}

function cityMapDrawGround(layout) {
  const ctx = CM.ctx;
  const tier = layout?.counts?.eraIndex || 0;
  ctx.fillStyle = "#2d3a1e";
  ctx.fillRect(0, 0, CM.cw, CM.ch);
  if (!layout || layout.counts.eraBand <= 1) return;
  const sx = (layout.cx * CM.TILE - CM.cam.x) * CM.cam.zoom + CM.cw / 2;
  const sy = (layout.cy * CM.TILE - CM.cam.y) * CM.cam.zoom + CM.ch / 2;
  const radius = (10 + tier * 12) * CM.TILE * CM.cam.zoom;
  const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, Math.max(1, radius));
  g.addColorStop(0, "rgba(72,58,33,0.58)");
  g.addColorStop(0.45, "rgba(54,44,28,0.36)");
  g.addColorStop(1, "rgba(45,58,30,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CM.cw, CM.ch);
}

function cityMapDrawVestiges() {
  if (!Array.isArray(state.vestiges) || !state.vestiges.length) return;
  const ctx = CM.ctx, s = CM.TILE * CM.cam.zoom;
  for (let v = 0; v < state.vestiges.length; v += 1) {
    const ves = state.vestiges[v];
    if (!ves || !ves.ruins) continue;
    const off = (CM.gridN - (ves.gridN || CM.gridN)) / 2;
    ctx.globalAlpha = 0.16 + v * 0.05;
    ctx.fillStyle = "#1a1510";
    for (const c of ves.ruins) {
      const gx = c.x + off, gy = c.y + off;
      const sx = (gx * CM.TILE - CM.cam.x) * CM.cam.zoom + CM.cw / 2;
      const sy = (gy * CM.TILE - CM.cam.y) * CM.cam.zoom + CM.ch / 2;
      if (sx < -s || sy < -s || sx > CM.cw + s || sy > CM.ch + s) continue;
      ctx.fillRect(sx + s * 0.2, sy + s * 0.2, s * 0.6, s * 0.6);
    }
  }
  ctx.globalAlpha = 1;
}

function cityMapDrawRiver(now) {
  const L = CM.layout;
  if (!L || !L.river || !L.river.present || !L.river.samples) return;
  const ctx = CM.ctx, z = CM.cam.zoom, T = CM.TILE;
  const sm = L.river.samples;
  const SX = (gx) => (gx * T - CM.cam.x) * z + CM.cw / 2;
  const SY = (gy) => (gy * T - CM.cam.y) * z + CM.ch / 2;

  const tw = state.timeWear || 0;
  const collapsed = CM.collapseAt ? true : false;
  let edge, mid, refA;
  if (collapsed) { edge = "#0a1a0a"; mid = "#0a1a0a"; refA = 0; }
  else if (tw > 0.7) { edge = "#142a1e"; mid = "#1a3a2a"; refA = 0.05; }
  else { edge = "#1a3a5c"; mid = "#2a5a8b"; refA = 0.16; }

  const normalAt = (i) => {
    const a = sm[Math.max(0, i - 1)], b = sm[Math.min(sm.length - 1, i + 1)];
    let tx = b.x - a.x, ty = b.y - a.y; const tl = Math.hypot(tx, ty) || 1;
    return { nx: -ty / tl, ny: tx / tl };
  };
  const ribbon = (mult, col) => {
    ctx.fillStyle = col; ctx.beginPath();
    for (let i = 0; i < sm.length; i += 1) { const n = normalAt(i); const x = SX(sm[i].x + n.nx * sm[i].hw * mult), y = SY(sm[i].y + n.ny * sm[i].hw * mult); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
    for (let i = sm.length - 1; i >= 0; i -= 1) { const n = normalAt(i); ctx.lineTo(SX(sm[i].x - n.nx * sm[i].hw * mult), SY(sm[i].y - n.ny * sm[i].hw * mult)); }
    ctx.closePath(); ctx.fill();
  };
  ribbon(1, edge);
  ribbon(0.55, mid);

  if (!collapsed) {
    ctx.strokeStyle = `rgba(255,255,255,${(refA * 0.6).toFixed(3)})`; ctx.lineWidth = 1;
    for (let w2 = 0; w2 < 3; w2 += 1) {
      ctx.beginPath();
      for (let i = 0; i < sm.length; i += 1) {
        const n = normalAt(i);
        const off = (w2 - 1) * sm[i].hw * 0.45 + Math.sin(i * 0.5 + (now || 0) / 650 + w2 * 2) * sm[i].hw * 0.25;
        const x = SX(sm[i].x + n.nx * off), y = SY(sm[i].y + n.ny * off);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    for (let i = 0; i < 9; i += 1) {
      const t = (((now || 0) / 1000 * (0.03 + (i % 3) * 0.015)) + i * 0.11) % 1;
      const idx = Math.floor(t * (sm.length - 1));
      const flick = 0.4 + 0.6 * Math.abs(Math.sin((now || 0) / 320 + i * 1.7));
      ctx.fillStyle = `rgba(255,255,255,${(refA * flick).toFixed(3)})`;
      ctx.fillRect(SX(sm[idx].x) - 1, SY(sm[idx].y) - 1, Math.max(2, 2.6 * z), Math.max(2, 2.6 * z));
    }
  }

  const reedOk = tw < 0.7 && !collapsed;
  for (const k of L.river.banks) {
    const c = k.indexOf(","); const bgx = +k.slice(0, c), bgy = +k.slice(c + 1);
    const px = SX(bgx), py = SY(bgy), ts = T * z;
    if (px < -ts || px > CM.cw || py < -ts || py > CM.ch) continue;
    if (reedOk && (bgx * 7 + bgy * 13) % 3 === 0) {
      const waterBelow = L.river.cells.has(bgx + "," + (bgy + 1));
      const waterAbove = L.river.cells.has(bgx + "," + (bgy - 1));
      const baseY = waterBelow ? py + ts * 0.28 : waterAbove ? py + ts * 0.78 : py + ts * 0.54;
      const tipY = waterBelow ? py + ts * 0.08 : waterAbove ? py + ts * 0.96 : py + ts * 0.38;
      ctx.strokeStyle = "rgba(90,138,42,0.72)";
      ctx.lineWidth = Math.max(1, z * 0.75);
      for (let rd = 0; rd < 2; rd += 1) {
        const rx = px + ts * (0.38 + rd * 0.2);
        ctx.beginPath(); ctx.moveTo(rx, baseY); ctx.lineTo(rx + (rd ? 1 : -1) * z, tipY); ctx.stroke();
      }
    }
  }

  if (tw > 0.7 && !collapsed) {
    ctx.fillStyle = "rgba(96,72,32,0.28)";
    for (let i = 0; i < 6; i += 1) { const s0 = sm[Math.floor((i / 6) * (sm.length - 1))]; ctx.beginPath(); ctx.arc(SX(s0.x), SY(s0.y), Math.max(2, 3 * z), 0, Math.PI * 2); ctx.fill(); }
  }
}

function cityMapDrawTrees() {
  const ctx = CM.ctx, z = CM.cam.zoom, s = CM.TILE * z;
  const occ = CM.occupied || new Set();
  const rr = CM.riverRow;
  const pad = 2;
  const gx0 = Math.floor((CM.cam.x - CM.cw / 2 / z) / CM.TILE) - pad;
  const gx1 = Math.ceil((CM.cam.x + CM.cw / 2 / z) / CM.TILE) + pad;
  const gy0 = Math.floor((CM.cam.y - CM.ch / 2 / z) / CM.TILE) - pad;
  const gy1 = Math.ceil((CM.cam.y + CM.ch / 2 / z) / CM.TILE) + pad;

  const isRiver = (gx, gy) => gy === rr || gy === rr + 1;
  const nearCity = (gx, gy) =>
    occ.has((gx - 1) + "," + gy) || occ.has((gx + 1) + "," + gy) ||
    occ.has(gx + "," + (gy - 1)) || occ.has(gx + "," + (gy + 1));

  const hasTree = (gx, gy) => {
    if (isRiver(gx, gy) || occ.has(gx + "," + gy)) return false;
    const h = cmHash(gx + "f" + gy) % 100;
    return h < 68 || nearCity(gx, gy);
  };

  // Parametres par arbre (stables, calculÃ©s une fois)
  const trees = [];
  for (let gy = gy0; gy <= gy1; gy += 1) {
    for (let gx = gx0; gx <= gx1; gx += 1) {
      if (!hasTree(gx, gy)) continue;
      const h = cmHash(gx + "f" + gy) % 100;
      const edge = nearCity(gx, gy);
      // LÃ©ger dÃ©calage pseudo-alÃ©atoire dans la case pour casser la grille
      const jx = ((h * 17 + gx * 3) % 30 - 15) / 100;
      const jy = ((h * 13 + gy * 7) % 30 - 15) / 100;
      const cx = (gx * CM.TILE + CM.TILE / 2 - CM.cam.x) * z + CM.cw / 2 + jx * s;
      const cy = (gy * CM.TILE + CM.TILE / 2 - CM.cam.y) * z + CM.ch / 2 + jy * s;
      // Rayon: lisiÃ¨re = petit, intÃ©rieur = grand (chevauche les voisins)
      const r = edge
        ? s * (0.20 + (h % 4) * 0.025)
        : s * (0.36 + (h % 5) * 0.04);
      // Couleurs: base sombre, canopÃ©e, surbrillance
      const colBase  = CITY_MAP_GREENS[(h % 4) + 4];      // verts sombres index 4-7
      const colTop   = CITY_MAP_GREENS[h % 4];             // verts moyens  index 0-3
      trees.push({ cx, cy, r, colBase, colTop, h, edge });
    }
  }

  // Passe 1 â€” ombres portÃ©es sous chaque arbre
  for (const t of trees) {
    // L'ombre se place sous le pied du tronc, dÃ©calÃ©e Ã  droite
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.beginPath();
    ctx.ellipse(
      t.cx + t.r * 0.18, t.cy + t.r * 0.80,
      t.r * 0.90, t.r * 0.32,
      0, 0, Math.PI * 2
    );
    ctx.fill();
  }

  // Passe 2 â€” troncs + couronnes
  // GÃ©omÃ©trie : couronne centrÃ©e Ã  cy - r*0.50  â†’  bas de la couronne = cy + r*0.50
  //             tronc descend jusqu'Ã  cy + r*0.90  â†’  r*0.40 de tronc visible en bas
  for (const t of trees) {
    // --- Tronc ---
    const tw = Math.max(1.5, t.r * (t.edge ? 0.11 : 0.16));
    const trunkTop = t.cy - t.r * 0.15;   // part juste sous la couronne (sera cachÃ©)
    const trunkBot = t.cy + t.r * (t.edge ? 0.72 : 0.90); // dÃ©passe sous la couronne
    ctx.fillStyle = "#3a1e06";
    ctx.fillRect(t.cx - tw / 2, trunkTop, tw, trunkBot - trunkTop);
    // Face gauche plus claire pour donner du volume cylindrique
    ctx.fillStyle = "rgba(100,55,15,0.55)";
    ctx.fillRect(t.cx - tw / 2, trunkTop, tw * 0.42, trunkBot - trunkTop);

    // --- Couronne : montÃ©e haut pour laisser le tronc visible en bas ---
    // Cercle sombre (bord de la couronne)
    ctx.fillStyle = t.colBase;
    ctx.beginPath();
    ctx.arc(t.cx, t.cy - t.r * 0.50, t.r, 0, Math.PI * 2);
    ctx.fill();

    // Cercle principal (couleur vive), lÃ©gÃ¨rement dÃ©calÃ© haut-gauche
    ctx.fillStyle = t.colTop;
    ctx.beginPath();
    ctx.arc(t.cx - t.r * 0.09, t.cy - t.r * 0.60, t.r * 0.82, 0, Math.PI * 2);
    ctx.fill();

    // Reflet solaire haut-gauche
    ctx.fillStyle = "rgba(210,255,140,0.15)";
    ctx.beginPath();
    ctx.arc(t.cx - t.r * 0.28, t.cy - t.r * 0.72, t.r * 0.40, 0, Math.PI * 2);
    ctx.fill();
  }
}

function cityMapDrawNight(now) {
  const n = CM.nightF;
  if (n < 0.05) return;
  const ctx = CM.ctx;
  ctx.fillStyle = `rgba(10,16,34,${(n * 0.5).toFixed(3)})`;
  ctx.fillRect(0, 0, CM.cw, CM.ch);
  if (CM.layout && CM.layout.counts.eraBand >= 2) {
    const sx = (CM.layout.cx * CM.TILE - CM.cam.x) * CM.cam.zoom + CM.cw / 2;
    const sy = (CM.layout.cy * CM.TILE - CM.cam.y) * CM.cam.zoom + CM.ch / 2;
    const r = (8 + CM.layout.counts.eraIndex * 2.4) * CM.TILE * CM.cam.zoom;
    const warm = CM.layout.counts.eraBand >= 5 ? "255,215,150" : "255,200,120";
    const prev = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = "lighter";
    const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, Math.max(1, r));
    g.addColorStop(0, `rgba(${warm},${(n * 0.16).toFixed(3)})`);
    g.addColorStop(1, `rgba(${warm},0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy, Math.max(1, r), 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = prev;
  }
}

/* ---- legacy citymap rendering\roads.js ---- */


/* ============================================================================
 * citymap-render-roads.js - Rendu des routes, ponts et lampadaires.
 * ============================================================================ */

function cmRoadConnects(layout, gx, gy) {
  if (!layout || !layout.roadSet || !layout.roadSet.has(gx + "," + gy)) return false;
  if (layout.river && layout.river.cells && layout.river.cells.has(gx + "," + gy)) {
    return cmIsBridgeRoad(layout, gx, gy);
  }
  return true;
}

function cmRoadMask(layout, gx, gy) {
  const road = layout && layout.roadMap && layout.roadMap.get(gx + "," + gy);
  if (road) {
    return {
      n: !!(road.mask & ROAD_N),
      e: !!(road.mask & ROAD_E),
      s: !!(road.mask & ROAD_S),
      w: !!(road.mask & ROAD_W)
    };
  }
  return {
    n: cmRoadConnects(layout, gx, gy - 1),
    e: cmRoadConnects(layout, gx + 1, gy),
    s: cmRoadConnects(layout, gx, gy + 1),
    w: cmRoadConnects(layout, gx - 1, gy)
  };
}

function cityMapDrawRoad(r) {
  const s = CM.TILE * CM.cam.zoom;
  const sx = (r.gx * CM.TILE - CM.cam.x) * CM.cam.zoom + CM.cw / 2;
  const sy = (r.gy * CM.TILE - CM.cam.y) * CM.cam.zoom + CM.ch / 2;
  if (sx < -s || sy < -s || sx > CM.cw + s || sy > CM.ch + s) return;
  const ctx = CM.ctx;
  const layout = CM.layout;
  const eraIndex = layout && layout.counts ? layout.counts.eraIndex : 0;
  const major = layout && (r.gx === layout.cx || r.gy === layout.cy);
  const ruined = (state.timeWear || 0) > 0.88 || (state.instability || 0) >= 1;
  const roadRank = r.rank || "secondary";
  const roadStyle = getRoadVisualStyle(eraIndex, roadRank, ruined, major);
  const pal = roadStyle.palette;
  const rk = r.gx + "," + r.gy;
  if (r.roadSurface === "bridge") return;
  if (layout.river && layout.river.cells && layout.river.cells.has(rk)) return;
  if (layout.river && layout.river.banks && layout.river.banks.has(rk)) {
    const rm = layout.roadMap;
    const adjBridge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
      const nr = rm && rm.get((r.gx + dx) + "," + (r.gy + dy));
      return nr && nr.roadSurface === "bridge";
    });
    if (!adjBridge) return;
  }

  const mask = cmRoadMask(layout, r.gx, r.gy);
  const degree = (mask.n ? 1 : 0) + (mask.e ? 1 : 0) + (mask.s ? 1 : 0) + (mask.w ? 1 : 0);
  const pathWidth = roadStyle.width;
  const half = s * pathWidth * 0.5;
  const cxp = sx + s / 2, cyp = sy + s / 2;
  const seed = cmHash(`road:${r.gx}:${r.gy}:${eraIndex}`);

  const shoulder = Math.max(1, s * 0.018 * roadStyle.borderStrength);
  const drawAxis = (color, width, cap = "square") => {
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, width);
    ctx.lineCap = cap;
    ctx.lineJoin = "round";
    ctx.beginPath();
    if (degree === 0) {
      ctx.moveTo(cxp - half * 0.35, cyp);
      ctx.lineTo(cxp + half * 0.35, cyp);
    } else {
      if (mask.n) { ctx.moveTo(cxp, cyp); ctx.lineTo(cxp, sy); }
      if (mask.s) { ctx.moveTo(cxp, cyp); ctx.lineTo(cxp, sy + s); }
      if (mask.w) { ctx.moveTo(cxp, cyp); ctx.lineTo(sx, cyp); }
      if (mask.e) { ctx.moveTo(cxp, cyp); ctx.lineTo(sx + s, cyp); }
    }
    ctx.stroke();
  };

  ctx.save();
  drawAxis(pal.edge, half * 2 + shoulder);
  drawAxis(pal.core, half * 2);

  const drawPebble = (px, py, rScale, color) => {
    const r = s * rScale;
    if (r < 0.5) return;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  };
  const horizontal = mask.e || mask.w;
  const vertical = mask.n || mask.s;
  const sideSign = seed % 2 ? 1 : -1;
  if (seed % Math.max(3, roadStyle.detailRate - 2) === 0) {
    const px = horizontal ? sx + s * (0.22 + ((seed >> 4) % 44) / 100) : cxp + sideSign * half * (0.62 + ((seed >> 7) % 20) / 100);
    const py = vertical ? sy + s * (0.22 + ((seed >> 5) % 44) / 100) : cyp + sideSign * half * (0.62 + ((seed >> 8) % 20) / 100);
    drawPebble(px, py, 0.018, "rgba(226,200,142,0.32)");
  }
  if (seed % roadStyle.detailRate === 0) {
    ctx.strokeStyle = "rgba(38,30,18,0.18)";
    ctx.lineWidth = Math.max(1, s * 0.012);
    ctx.beginPath();
    if (horizontal) {
      const y = cyp + sideSign * (half + s * 0.035);
      ctx.moveTo(sx + s * 0.18, y);
      ctx.lineTo(sx + s * 0.34, y + sideSign * s * 0.012);
    } else if (vertical) {
      const x = cxp + sideSign * (half + s * 0.035);
      ctx.moveTo(x, sy + s * 0.18);
      ctx.lineTo(x + sideSign * s * 0.012, sy + s * 0.34);
    }
    ctx.stroke();
  }

  ctx.lineWidth = Math.max(1, s * 0.016);
  if (eraIndex < 7) {
    ctx.strokeStyle = pal.track;
    if (mask.e || mask.w) {
      ctx.beginPath(); ctx.moveTo(sx + s * 0.22, cyp - half * 0.28); ctx.lineTo(sx + s * 0.46, cyp - half * 0.24); ctx.stroke();
    }
    if (mask.n || mask.s) {
      ctx.beginPath(); ctx.moveTo(cxp - half * 0.28, sy + s * 0.22); ctx.lineTo(cxp - half * 0.24, sy + s * 0.46); ctx.stroke();
    }
  } else if (eraIndex < 14) {
    if (seed % roadStyle.detailRate === 0) {
      ctx.strokeStyle = pal.detail;
      ctx.beginPath();
      if (mask.e || mask.w) {
        ctx.moveTo(sx + s * 0.28, cyp + ((seed % 2) ? 1 : -1) * half * 0.22);
        ctx.lineTo(sx + s * 0.4, cyp + ((seed % 2) ? 1 : -1) * half * 0.22);
      } else if (mask.n || mask.s) {
        ctx.moveTo(cxp + ((seed % 2) ? 1 : -1) * half * 0.22, sy + s * 0.28);
        ctx.lineTo(cxp + ((seed % 2) ? 1 : -1) * half * 0.22, sy + s * 0.4);
      }
      ctx.stroke();
    }
  } else {
    ctx.strokeStyle = pal.line;
    ctx.lineWidth = Math.max(1, s * 0.014);
    if ((mask.e || mask.w) && major) { ctx.beginPath(); ctx.moveTo(sx + s * 0.26, cyp); ctx.lineTo(sx + s * 0.5, cyp); ctx.stroke(); }
    if ((mask.n || mask.s) && major) { ctx.beginPath(); ctx.moveTo(cxp, sy + s * 0.26); ctx.lineTo(cxp, sy + s * 0.5); ctx.stroke(); }
  }
  ctx.restore();
  ctx.lineJoin = "miter"; // reset explicite â€” drawAxis pose "round" dans le save block

  if (ruined && seed % 2 === 0) {
    ctx.strokeStyle = "rgba(20,14,9,0.72)";
    ctx.lineWidth = Math.max(1, s * 0.035);
    ctx.beginPath();
    ctx.moveTo(sx + s * 0.2, sy + s * 0.25);
    ctx.lineTo(sx + s * 0.45, sy + s * 0.48);
    ctx.lineTo(sx + s * 0.36, sy + s * 0.8);
    ctx.stroke();
  }

  if (CM.debugRoads) {
    ctx.save();
    ctx.strokeStyle = "rgba(80,220,255,0.9)";
    ctx.lineWidth = Math.max(1, s * 0.04);
    ctx.beginPath();
    if (mask.n) { ctx.moveTo(cxp, cyp); ctx.lineTo(cxp, sy + s * 0.12); }
    if (mask.e) { ctx.moveTo(cxp, cyp); ctx.lineTo(sx + s * 0.88, cyp); }
    if (mask.s) { ctx.moveTo(cxp, cyp); ctx.lineTo(cxp, sy + s * 0.88); }
    if (mask.w) { ctx.moveTo(cxp, cyp); ctx.lineTo(sx + s * 0.12, cyp); }
    ctx.stroke();
    ctx.fillStyle = r.roadType === "intersection" ? "rgba(255,90,90,0.9)" : r.roadType === "junction" ? "rgba(255,210,80,0.9)" : "rgba(80,220,255,0.9)";
    ctx.fillRect(cxp - Math.max(1, s * 0.045), cyp - Math.max(1, s * 0.045), Math.max(2, s * 0.09), Math.max(2, s * 0.09));
    ctx.restore();
  }
}

function cityMapDrawBridgeSpan(component, exits) {
  const layout = CM.layout;
  if (!layout || !component || !component.length) return;
  const xs = component.map((r) => r.gx);
  const ys = component.map((r) => r.gy);
  const gx0 = Math.min(...xs), gx1 = Math.max(...xs);
  const gy0 = Math.min(...ys), gy1 = Math.max(...ys);
  const vertical = (gy1 - gy0) >= (gx1 - gx0);
  let drawGx0 = gx0, drawGx1 = gx1, drawGy0 = gy0, drawGy1 = gy1;
  if (exits && exits.length) {
    const exXs = exits.map((r) => r.gx), exYs = exits.map((r) => r.gy);
    if (vertical) { drawGy0 = Math.min(gy0, ...exYs); drawGy1 = Math.max(gy1, ...exYs); }
    else           { drawGx0 = Math.min(gx0, ...exXs); drawGx1 = Math.max(gx1, ...exXs); }
  }
  const s = CM.TILE * CM.cam.zoom;
  const sx = (drawGx0 * CM.TILE - CM.cam.x) * CM.cam.zoom + CM.cw / 2;
  const sy = (drawGy0 * CM.TILE - CM.cam.y) * CM.cam.zoom + CM.ch / 2;
  const totalW = (drawGx1 - drawGx0 + 1) * s;
  const totalH = (drawGy1 - drawGy0 + 1) * s;
  if (sx < -totalW - s || sy < -totalH - s || sx > CM.cw + s || sy > CM.ch + s) return;
  const ctx = CM.ctx;
  const eraIndex = layout.counts ? layout.counts.eraIndex : 0;

  const deckFrac = 0.54;
  const bw = s * deckFrac;
  const bx = vertical ? sx + (totalW - bw) / 2 : sx;
  const by = vertical ? sy : sy + (totalH - bw) / 2;
  const deckW = vertical ? bw : totalW;
  const deckH = vertical ? totalH : bw;

  ctx.fillStyle = "rgba(0,0,0,0.28)";
  const shOff = s * 0.06;
  ctx.fillRect(bx + shOff, by + shOff, deckW, deckH);

  const woodMain = eraIndex >= 16 ? "#6b6050" : eraIndex >= 10 ? "#9a7428" : "#a07830";
  ctx.fillStyle = woodMain;
  ctx.fillRect(bx, by, deckW, deckH);

  const plankColor = eraIndex >= 16 ? "rgba(40,34,28,0.65)" : "rgba(74,44,12,0.6)";
  ctx.strokeStyle = plankColor;
  ctx.lineWidth = Math.max(1, s * 0.04);
  const plankSpacing = s * 0.18;
  if (vertical) {
    const plankStart = by + plankSpacing * 0.5;
    for (let p = plankStart; p < by + deckH; p += plankSpacing) {
      ctx.beginPath(); ctx.moveTo(bx, p); ctx.lineTo(bx + deckW, p); ctx.stroke();
    }
  } else {
    const plankStart = bx + plankSpacing * 0.5;
    for (let p = plankStart; p < bx + deckW; p += plankSpacing) {
      ctx.beginPath(); ctx.moveTo(p, by); ctx.lineTo(p, by + deckH); ctx.stroke();
    }
  }

  const railW = Math.max(2, s * 0.085);
  const railColor = eraIndex >= 16 ? "#504844" : eraIndex >= 10 ? "#7a5a1a" : "#6a4a10";
  ctx.fillStyle = railColor;
  if (vertical) {
    ctx.fillRect(bx, by, railW, deckH);
    ctx.fillRect(bx + deckW - railW, by, railW, deckH);
  } else {
    ctx.fillRect(bx, by, deckW, railW);
    ctx.fillRect(bx, by + deckH - railW, deckW, railW);
  }

  ctx.fillStyle = "rgba(20,14,8,0.30)";
  const jointW = Math.max(1, s * 0.028);
  if (vertical) ctx.fillRect(bx + (deckW - jointW) / 2, by, jointW, deckH);
  else ctx.fillRect(bx, by + (deckH - jointW) / 2, deckW, jointW);

  ctx.fillStyle = "rgba(255,220,150,0.28)";
  const hilW = Math.max(1, s * 0.022);
  if (vertical) {
    ctx.fillRect(bx + railW, by, hilW, deckH);
    ctx.fillRect(bx + deckW - railW - hilW, by, hilW, deckH);
  } else {
    ctx.fillRect(bx, by + railW, deckW, hilW);
    ctx.fillRect(bx, by + deckH - railW - hilW, deckW, hilW);
  }

  if (component.length > 1) {
    const postColor = eraIndex >= 14 ? "#3a3230" : "#5a3a10";
    const postSize = Math.max(2, s * 0.11);
    ctx.fillStyle = postColor;
    ctx.fillRect(bx, by, postSize, postSize);
    ctx.fillRect(bx + deckW - postSize, by, postSize, postSize);
    ctx.fillRect(bx, by + deckH - postSize, postSize, postSize);
    ctx.fillRect(bx + deckW - postSize, by + deckH - postSize, postSize, postSize);
  }
}

function cityMapDrawBridges() {
  if (!CM.layout || !CM.roadList.length) return;
  const bridges = CM.bridgeList || CM.roadList.filter((r) => r.roadSurface === "bridge");
  const seen = new Set();
  const key = (r) => r.gx + "," + r.gy;
  const dirs = [
    { bit: ROAD_N, dx: 0, dy: -1 },
    { bit: ROAD_E, dx: 1, dy: 0 },
    { bit: ROAD_S, dx: 0, dy: 1 },
    { bit: ROAD_W, dx: -1, dy: 0 }
  ];
  for (const start of bridges) {
    const sk = key(start);
    if (seen.has(sk)) continue;
    const stack = [start], component = [];
    seen.add(sk);
    const exits = [];
    while (stack.length) {
      const r = stack.pop();
      component.push(r);
      for (const d of dirs) {
        if (!(r.mask & d.bit)) continue;
        const nr = CM.layout.roadMap.get((r.gx + d.dx) + "," + (r.gy + d.dy));
        if (nr && nr.roadSurface === "bridge") {
          const nk = key(nr);
          if (!seen.has(nk)) { seen.add(nk); stack.push(nr); }
        } else if (nr) {
          exits.push(nr);
        }
      }
    }
    cityMapDrawBridgeSpan(component, exits);
  }
}

function cityMapDrawStreetLights(now) {
  const L = CM.layout;
  if (!L || !L.counts) return;
  const ei = L.counts.eraIndex;
  if (ei < 7) return;
  const ctx = CM.ctx, z = CM.cam.zoom, s = CM.TILE * z;
  const night = CM.nightF || 0;
  const glowA = 0.45 + 0.55 * night;
  const cyberpunk = ei >= 13;
  const futuristic = ei >= 9;

  for (const r of CM.roadList) {
    if (r.rank !== "main" && r.rank !== "avenue") continue;
    const seed = cmHash(`lamp:${r.gx}:${r.gy}`);
    if (seed % 3 !== 0) continue;
    const mask = cmRoadMask(L, r.gx, r.gy);
    const degree = (mask.n ? 1 : 0) + (mask.e ? 1 : 0) + (mask.s ? 1 : 0) + (mask.w ? 1 : 0);
    if (degree >= 3) continue;
    const cxs = (r.gx * CM.TILE + CM.TILE * 0.5 - CM.cam.x) * z + CM.cw / 2;
    const cys = (r.gy * CM.TILE + CM.TILE * 0.5 - CM.cam.y) * z + CM.ch / 2;
    if (cxs < -s * 2 || cys < -s * 2 || cxs > CM.cw + s * 2 || cys > CM.ch + s * 2) continue;
    const isVert = (mask.n || mask.s) && !(mask.e || mask.w);
    const off = s * 0.34;

    for (let side = -1; side <= 1; side += 2) {
      const lx = cxs + (isVert ? side * off : 0);
      const ly = cys + (isVert ? 0 : side * off);
      const t2 = now || 0;

      if (cyberpunk) {
        const hue = seed % 2 === 0 ? [50, 210, 255] : [255, 50, 200];
        const pulse = 0.65 + 0.25 * Math.sin(t2 / 500 + r.gx * 0.3 + r.gy * 0.4);
        ctx.strokeStyle = "#28303a"; ctx.lineWidth = Math.max(1, s * 0.018);
        ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx, ly - s * 0.38); ctx.stroke();
        const nAlpha = (pulse * glowA).toFixed(2);
        ctx.strokeStyle = `rgba(${hue[0]},${hue[1]},${hue[2]},${nAlpha})`; ctx.lineWidth = Math.max(1.5, s * 0.03);
        ctx.beginPath(); ctx.moveTo(lx - s * 0.09, ly - s * 0.38); ctx.lineTo(lx + s * 0.09, ly - s * 0.38); ctx.stroke();
        if (night > 0.15) {
          const hg = ctx.createRadialGradient(lx, ly - s * 0.38, 0, lx, ly - s * 0.38, s * 0.24);
          hg.addColorStop(0, `rgba(${hue[0]},${hue[1]},${hue[2]},${(0.30 * night * pulse).toFixed(2)})`);
          hg.addColorStop(1, `rgba(${hue[0]},${hue[1]},${hue[2]},0)`);
          ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(lx, ly - s * 0.38, s * 0.24, 0, Math.PI * 2); ctx.fill();
        }
      } else if (futuristic) {
        ctx.strokeStyle = "#545e6a"; ctx.lineWidth = Math.max(1, s * 0.02);
        ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx, ly - s * 0.34); ctx.stroke();
        ctx.strokeStyle = "#606a78"; ctx.lineWidth = Math.max(0.5, s * 0.013);
        ctx.beginPath(); ctx.moveTo(lx, ly - s * 0.34); ctx.lineTo(lx + s * 0.07, ly - s * 0.39); ctx.stroke();
        const gc = `rgba(200,230,255,${glowA.toFixed(2)})`;
        ctx.fillStyle = gc; ctx.beginPath(); ctx.arc(lx + s * 0.07, ly - s * 0.39, Math.max(1, s * 0.036), 0, Math.PI * 2); ctx.fill();
        if (night > 0.25) {
          const hg = ctx.createRadialGradient(lx + s * 0.07, ly - s * 0.39, 0, lx + s * 0.07, ly - s * 0.39, s * 0.19);
          hg.addColorStop(0, `rgba(200,230,255,${(0.22 * night).toFixed(2)})`);
          hg.addColorStop(1, "rgba(200,230,255,0)");
          ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(lx + s * 0.07, ly - s * 0.39, s * 0.19, 0, Math.PI * 2); ctx.fill();
        }
      } else {
        ctx.strokeStyle = "#302820"; ctx.lineWidth = Math.max(1, s * 0.018);
        ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx, ly - s * 0.3); ctx.lineTo(lx + s * 0.07, ly - s * 0.36); ctx.stroke();
        const gc = `rgba(255,210,80,${glowA.toFixed(2)})`;
        ctx.fillStyle = gc; ctx.beginPath(); ctx.arc(lx + s * 0.07, ly - s * 0.36, Math.max(1, s * 0.04), 0, Math.PI * 2); ctx.fill();
        if (night > 0.25) {
          const hg = ctx.createRadialGradient(lx + s * 0.07, ly - s * 0.36, 0, lx + s * 0.07, ly - s * 0.36, s * 0.17);
          hg.addColorStop(0, `rgba(255,200,50,${(0.2 * night).toFixed(2)})`);
          hg.addColorStop(1, "rgba(255,200,50,0)");
          ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(lx + s * 0.07, ly - s * 0.36, s * 0.17, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
  }
}

/* ---- legacy citymap rendering\agents.js ---- */


/* ============================================================================
 * citymap-render-agents.js - Pietons, vehicules et bateaux de la carte.
 * ============================================================================ */

function getVehicleDensity(eraIndex, rank) {
  const rankBase = rank === "main" ? 1.15 : rank === "avenue" ? 0.78 : rank === "secondary" ? 0.35 : 0.05;
  const ageBase = eraIndex < 3 ? 0.02 : eraIndex < 7 ? 0.22 : eraIndex < 11 ? 0.42 : eraIndex < 13 ? 0.72 : eraIndex < 18 ? 0.98 : 1.12;
  const ruined = (state.timeWear || 0) > 0.88 || (state.instability || 0) >= 1;
  return ruined ? rankBase * 0.08 : rankBase * ageBase;
}

function chooseRoadVehicleType(eraIndex, rank, seed) {
  const ruined = (state.timeWear || 0) > 0.88 || (state.instability || 0) >= 1;
  if (ruined) return seed % 2 ? "broken_cart" : "wheel";
  if (eraIndex < 3) return "basket";
  if (eraIndex < 6) return seed % 3 === 0 ? "barrow" : "cart";
  if (eraIndex < 9) return seed % 3 === 0 ? "chariot" : seed % 3 === 1 ? "wagon" : "cart";
  if (eraIndex < 11) return seed % 3 === 0 ? "caravan" : seed % 3 === 1 ? "wagon" : "chariot";
  if (eraIndex >= 13 && seed % 4 === 0) return "drone";
  if (eraIndex >= 11 && (rank === "main" || rank === "avenue")) return seed % 3 === 0 ? "tram" : "car";
  if (eraIndex >= 11) return seed % 2 === 0 ? "car" : "wagon";
  if (rank === "main" && seed % 4 === 0) return "chariot";
  if ((rank === "main" || rank === "avenue") && seed % 3 === 0) return "caravan";
  return "wagon";
}

const CM_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function cityMapWalkRoadKey(gx, gy) {
  return gx * 10000 + gy;
}

function cityMapDirBit(dirIndex) {
  return dirIndex === 0 ? ROAD_E : dirIndex === 1 ? ROAD_W : dirIndex === 2 ? ROAD_S : ROAD_N;
}

function roadStepAllowed(gx, gy, dirIndex) {
  const road = CM.layout && CM.layout.roadMap && CM.layout.roadMap.get(gx + "," + gy);
  if (road) return !!(road.mask & cityMapDirBit(dirIndex));
  const nx = gx + CM_DIRS[dirIndex][0], ny = gy + CM_DIRS[dirIndex][1];
  return CM.walkRoadSet.has(cityMapWalkRoadKey(nx, ny));
}

function citizenChooseNext(p) {
  if (!CM.walkRoadList.length) return;
  if (Math.random() < 0.12) {
    p.pauseT = 0.3 + Math.random() * 1.5;
    return;
  }
  if (!p.goal || Math.random() < 0.05 || (p.goal.gx === p.gx && p.goal.gy === p.gy)) {
    const r = CM.walkRoadList[Math.floor(Math.random() * CM.walkRoadList.length)];
    p.goal = { gx: r.gx, gy: r.gy };
  }
  const rev = p.dir >= 0 ? (p.dir ^ 1) : -1;
  const opts = [];
  for (let i = 0; i < 4; i += 1) {
    const nx = p.gx + CM_DIRS[i][0], ny = p.gy + CM_DIRS[i][1];
    if (CM.walkRoadSet.has(cityMapWalkRoadKey(nx, ny)) && roadStepAllowed(p.gx, p.gy, i)) opts.push({ i, nx, ny });
  }
  if (!opts.length) return;
  const forward = opts.filter((o) => o.i !== rev);
  const pool = forward.length ? forward : opts;
  let best = pool[0], bestScore = -Infinity;
  for (const o of pool) {
    let score = -(Math.abs(p.goal.gx - o.nx) + Math.abs(p.goal.gy - o.ny));
    if (o.i === p.dir) score += 1.6;
    score += Math.random() * 2.4;
    if (score > bestScore) {
      bestScore = score;
      best = o;
    }
  }
  p.gx = best.nx;
  p.gy = best.ny;
  p.dir = best.i;
  p.tx = (p.gx + 0.5) * CM.TILE;
  p.ty = (p.gy + 0.5) * CM.TILE;
}

function drawCitizens(dt, now) {
  if (!CM.walkRoadList.length) return;
  const ctx = CM.ctx, z = CM.cam.zoom;
  const eraI = CM.layout?.counts?.eraIndex ?? 0; // extrait une fois hors boucle
  for (const p of CM.citizens) {
    if (!CM.walkRoadSet.has(cityMapWalkRoadKey(p.gx, p.gy))) {
      const r = CM.walkRoadList[Math.floor(Math.random() * CM.walkRoadList.length)];
      p.gx = r.gx;
      p.gy = r.gy;
      p.x = (r.gx + 0.5) * CM.TILE;
      p.y = (r.gy + 0.5) * CM.TILE;
      p.tx = p.x;
      p.ty = p.y;
      p.dir = -1;
    }
    if (p.pauseT > 0) {
      p.pauseT -= dt;
    } else {
      const dx = p.tx - p.x, dy = p.ty - p.y, dist = Math.hypot(dx, dy);
      if (dist < 2.4) {
        citizenChooseNext(p);
      } else {
        const sp = p.speed * dt;
        p.x += dx / dist * sp;
        p.y += dy / dist * sp;
      }
    }
    const wob = p.pauseT > 0 ? 0 : Math.sin((now || 0) / 240 + (p.phase || 0)) * 1.1;
    const perpX = (p.dir === 2 || p.dir === 3) ? 1 : 0;
    const perpY = perpX ? 0 : 1;
    const swSign = (p.phase > Math.PI) ? 1 : -1;
    const swOff = eraI >= 5 ? swSign * 0.27 * CM.TILE * z : 0;
    const sx = (p.x - CM.cam.x) * z + CM.cw / 2 + wob * perpX * z + swOff * perpX;
    const sy = (p.y - CM.cam.y) * z + CM.ch / 2 + wob * perpY * z + swOff * perpY;
    if (sx < 0 || sy < 0 || sx > CM.cw || sy > CM.ch) continue;
    ctx.fillStyle = p.col;
    ctx.beginPath();
    ctx.arc(sx, sy, Math.max(1.1, 1.9 * z), 0, Math.PI * 2);
    ctx.fill();
  }
}

function updateVehicles(dt) {
  for (const v of CM.vehicles) {
    if (v.pauseT > 0) {
      v.pauseT -= dt;
      continue;
    }
    const dx = v.tx - v.x, dy = v.ty - v.y, d = Math.hypot(dx, dy);
    if (d < 2.4) {
      citizenChooseNext(v);
    } else {
      const sp = v.speed * dt;
      v.x += dx / d * sp;
      v.y += dy / d * sp;
    }
  }
}

function drawVehicles(now, pass) {
  const ctx = CM.ctx, z = CM.cam.zoom, s = CM.TILE * z;
  const ei = CM.layout?.counts?.eraIndex ?? 13; // extrait une fois hors boucle
  for (const v of CM.vehicles) {
    if (pass === "ground" && v.type === "drone") continue;
    if (pass === "air" && v.type !== "drone") continue;
    const sx = (v.x - CM.cam.x) * z + CM.cw / 2;
    let sy = (v.y - CM.cam.y) * z + CM.ch / 2;
    if (sx < -s || sy < -s || sx > CM.cw + s || sy > CM.ch + s) continue;
    if (v.type === "drone") {
      sy -= s * 0.5;
      const t2 = now || 0;
      const hover = Math.sin(t2 / 380 + v.x * 0.04) * s * 0.04;
      const pulse = 0.5 + 0.5 * Math.sin(t2 / 180 + v.x * 0.05);
      ctx.fillStyle = `rgba(0,0,0,${(0.1 + 0.06 * Math.sin(t2 / 380)).toFixed(2)})`;
      ctx.beginPath();
      ctx.ellipse(sx, sy + s * 0.55 + hover, s * 0.18, s * 0.06, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#3a4050";
      ctx.beginPath();
      ctx.arc(sx, sy + hover, Math.max(1.5, s * 0.08), 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(80,200,255,0.7)";
      ctx.beginPath();
      ctx.arc(sx, sy + hover, Math.max(1, s * 0.04), 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#505868";
      ctx.lineWidth = Math.max(1, s * 0.022);
      for (let arm = 0; arm < 4; arm += 1) {
        const aa = arm * Math.PI / 2 + Math.PI / 4;
        ctx.beginPath();
        ctx.moveTo(sx, sy + hover);
        ctx.lineTo(sx + Math.cos(aa) * s * 0.14, sy + hover + Math.sin(aa) * s * 0.1);
        ctx.stroke();
      }
      const rotA = `rgba(200,220,255,${(0.25 + pulse * 0.2).toFixed(2)})`;
      ctx.strokeStyle = rotA;
      ctx.lineWidth = Math.max(0.5, s * 0.014);
      for (let arm = 0; arm < 4; arm += 1) {
        const aa = arm * Math.PI / 2 + Math.PI / 4;
        ctx.beginPath();
        ctx.arc(sx + Math.cos(aa) * s * 0.14, sy + hover + Math.sin(aa) * s * 0.1, Math.max(1, s * 0.06), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = `rgba(80,255,100,${(0.7 + 0.3 * Math.sin(t2 / 200)).toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(sx + s * 0.1, sy + hover - s * 0.04, Math.max(1, s * 0.025), 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(255,60,60,${(0.7 + 0.3 * Math.sin(t2 / 200 + Math.PI)).toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(sx - s * 0.1, sy + hover + s * 0.06, Math.max(1, s * 0.025), 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    ctx.save();
    ctx.translate(sx, sy);
    const vdx = v.tx - v.x, vdy = v.ty - v.y;
    const vAngle = (Math.abs(vdx) > 0.5 || Math.abs(vdy) > 0.5)
      ? Math.atan2(vdy, vdx)
      : v.dir === 0 ? 0 : v.dir === 1 ? Math.PI : v.dir === 2 ? Math.PI / 2 : -Math.PI / 2;
    ctx.rotate(vAngle);
    ctx.fillStyle = "rgba(20,14,8,0.28)";
    ctx.fillRect(-s * 0.18, s * 0.08, s * 0.36, Math.max(1, s * 0.035));
    if (v.type === "car") {
      if (ei >= 14) {
        const t2 = now || 0;
        const gCol = v.col || "#4a6080";
        ctx.fillStyle = gCol;
        ctx.beginPath();
        ctx.ellipse(0, 0, s * 0.22, s * 0.078, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(140,210,255,0.55)";
        ctx.beginPath();
        ctx.ellipse(-s * 0.02, -s * 0.02, s * 0.1, s * 0.045, 0, 0, Math.PI * 2);
        ctx.fill();
        const glow = 0.5 + 0.3 * Math.sin(t2 / 300 + v.x * 0.02);
        ctx.strokeStyle = `rgba(60,200,255,${glow.toFixed(2)})`;
        ctx.lineWidth = Math.max(1, s * 0.02);
        ctx.beginPath();
        ctx.ellipse(0, s * 0.055, s * 0.2, s * 0.025, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = `rgba(80,230,255,${(0.8 + 0.2 * Math.sin(t2 / 200)).toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(s * 0.18, -s * 0.02, Math.max(1, s * 0.022), 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(s * 0.18, s * 0.03, Math.max(1, s * 0.022), 0, Math.PI * 2);
        ctx.fill();
      } else if (ei >= 11) {
        ctx.fillStyle = v.col || "#5a6878";
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(-s * 0.2, -s * 0.07, s * 0.4, s * 0.13, s * 0.04) : ctx.fillRect(-s * 0.2, -s * 0.07, s * 0.4, s * 0.13);
        ctx.fill();
        ctx.fillStyle = "rgba(0,0,0,0.25)";
        ctx.fillRect(-s * 0.1, -s * 0.07, s * 0.22, s * 0.06);
        ctx.fillStyle = "rgba(160,220,240,0.55)";
        ctx.fillRect(-s * 0.08, -s * 0.065, s * 0.18, s * 0.05);
        ctx.fillStyle = "rgba(220,230,240,0.9)";
        ctx.fillRect(s * 0.15, -s * 0.05, s * 0.05, s * 0.02);
        ctx.fillRect(s * 0.15, s * 0.025, s * 0.05, s * 0.02);
        ctx.fillStyle = "#1a1a20";
        ctx.beginPath();
        ctx.arc(-s * 0.12, s * 0.075, Math.max(1, s * 0.034), 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(s * 0.12, s * 0.075, Math.max(1, s * 0.034), 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(100,120,160,0.6)";
        ctx.lineWidth = Math.max(0.5, s * 0.012);
        ctx.beginPath();
        ctx.arc(-s * 0.12, s * 0.075, Math.max(1, s * 0.022), 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(s * 0.12, s * 0.075, Math.max(1, s * 0.022), 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = v.col || "#9b4d38";
        ctx.fillRect(-s * 0.18, -s * 0.075, s * 0.36, s * 0.15);
        ctx.fillStyle = "rgba(0,0,0,0.28)";
        ctx.fillRect(-s * 0.1, -s * 0.075, s * 0.2, s * 0.065);
        ctx.fillStyle = "rgba(185,220,225,0.62)";
        ctx.fillRect(-s * 0.07, -s * 0.065, s * 0.14, s * 0.055);
        ctx.fillStyle = "rgba(255,240,180,0.9)";
        ctx.beginPath();
        ctx.arc(s * 0.14, -s * 0.04, Math.max(1, s * 0.022), 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(s * 0.14, s * 0.02, Math.max(1, s * 0.022), 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#21170f";
        ctx.beginPath();
        ctx.arc(-s * 0.11, s * 0.075, Math.max(1, s * 0.032), 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(s * 0.11, s * 0.075, Math.max(1, s * 0.032), 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (v.type === "tram") {
      if (ei >= 13) {
        const t2 = now || 0;
        ctx.fillStyle = "#e0e8f0";
        ctx.beginPath();
        ctx.ellipse(0, -s * 0.01, s * 0.28, s * 0.065, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(100,180,255,0.5)";
        ctx.fillRect(-s * 0.2, -s * 0.06, s * 0.4, s * 0.055);
        ctx.strokeStyle = `rgba(40,200,255,${(0.5 + 0.3 * Math.sin(t2 / 250)).toFixed(2)})`;
        ctx.lineWidth = Math.max(1.5, s * 0.03);
        ctx.beginPath();
        ctx.moveTo(-s * 0.26, s * 0.06);
        ctx.lineTo(s * 0.26, s * 0.06);
        ctx.stroke();
        ctx.fillStyle = "rgba(60,220,255,0.7)";
        ctx.fillRect(-s * 0.24, s * 0.04, s * 0.48, s * 0.025);
      } else {
        ctx.fillStyle = v.col || "#a8a092";
        ctx.fillRect(-s * 0.24, -s * 0.075, s * 0.48, s * 0.15);
        ctx.fillStyle = "rgba(210,225,210,0.5)";
        ctx.fillRect(-s * 0.14, -s * 0.045, s * 0.08, s * 0.08);
        ctx.fillRect(s * 0.04, -s * 0.045, s * 0.08, s * 0.08);
        ctx.strokeStyle = "rgba(40,32,24,0.45)";
        ctx.lineWidth = Math.max(1, s * 0.014);
        ctx.beginPath();
        ctx.moveTo(-s * 0.24, s * 0.09);
        ctx.lineTo(s * 0.24, s * 0.09);
        ctx.stroke();
      }
    } else if (v.type === "basket") {
      ctx.fillStyle = "#b08a4a";
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(1, s * 0.075), 0, Math.PI * 2);
      ctx.fill();
    } else if (v.type === "barrow") {
      ctx.fillStyle = "#8f6534";
      ctx.fillRect(-s * 0.11, -s * 0.07, s * 0.22, s * 0.12);
      ctx.fillStyle = "#2a1a0c";
      ctx.beginPath();
      ctx.arc(s * 0.13, s * 0.05, Math.max(1, s * 0.035), 0, Math.PI * 2);
      ctx.fill();
    } else if (v.type === "chariot") {
      ctx.fillStyle = "#9a7440";
      ctx.fillRect(-s * 0.18, -s * 0.08, s * 0.3, s * 0.16);
      ctx.fillStyle = "#c0a46a";
      ctx.fillRect(s * 0.08, -s * 0.12, s * 0.1, s * 0.24);
      ctx.fillStyle = "#2a1a0c";
      ctx.beginPath();
      ctx.arc(-s * 0.12, s * 0.08, Math.max(1, s * 0.04), 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(s * 0.1, s * 0.08, Math.max(1, s * 0.04), 0, Math.PI * 2);
      ctx.fill();
    } else if (v.type === "caravan") {
      ctx.fillStyle = "#7b5b35";
      ctx.fillRect(-s * 0.22, -s * 0.08, s * 0.18, s * 0.16);
      ctx.fillRect(s * 0.02, -s * 0.08, s * 0.18, s * 0.16);
      ctx.fillStyle = "#2a1a0c";
      for (const wx of [-0.16, -0.02, 0.08, 0.22]) {
        ctx.beginPath();
        ctx.arc(s * wx, s * 0.08, Math.max(1, s * 0.032), 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (v.type === "broken_cart" || v.type === "wheel") {
      ctx.strokeStyle = "rgba(52,35,20,0.65)";
      ctx.lineWidth = Math.max(1, s * 0.025);
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(1, s * 0.085), 0, Math.PI * 1.5);
      ctx.stroke();
    } else {
      ctx.fillStyle = v.col || "#8f6534";
      ctx.fillRect(-s * 0.17, -s * 0.08, s * 0.34, s * 0.16);
      ctx.fillStyle = "#2a1a0c";
      ctx.beginPath();
      ctx.arc(-s * 0.1, s * 0.08, Math.max(1, s * 0.04), 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(s * 0.1, s * 0.08, Math.max(1, s * 0.04), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

function drawShips(dt) {
  if (!CM.layout || !CM.layout.river || !CM.layout.river.present) return;
  const ctx = CM.ctx, z = CM.cam.zoom, s = CM.TILE * z, T = CM.TILE;
  const sm = CM.layout.river.samples;
  const band = (CM.layout && CM.layout.counts) ? CM.layout.counts.eraBand : 2;
  const ei = (CM.layout && CM.layout.counts) ? CM.layout.counts.eraIndex : 5;
  const now = performance.now();
  for (const sh of CM.ships) {
    sh.t += sh.dir * sh.speed * dt;
    if (sh.t > 1) sh.t = 0;
    if (sh.t < 0) sh.t = 1;
    const fi = sh.t * (sm.length - 1);
    const i0 = Math.max(0, Math.min(sm.length - 1, Math.floor(fi)));
    const i1 = Math.min(sm.length - 1, i0 + 1);
    const f = fi - i0;
    const wx = (sm[i0].x + (sm[i1].x - sm[i0].x) * f) * T;
    const wy = (sm[i0].y + (sm[i1].y - sm[i0].y) * f) * T;
    const sx = (wx - CM.cam.x) * z + CM.cw / 2;
    const sy = (wy - CM.cam.y) * z + CM.ch / 2;
    if (sx < -s || sx > CM.cw + s || sy < -s || sy > CM.ch + s) continue;
    ctx.save();
    ctx.translate(sx, sy);
    if (sh.dir < 0) ctx.scale(-1, 1);

    ctx.fillStyle = "rgba(10,25,35,0.20)";
    ctx.beginPath();
    ctx.ellipse(0, s * 0.1, s * 0.22, s * 0.07, 0, 0, Math.PI * 2);
    ctx.fill();

    if (ei >= 11) {
      const pulse = 0.5 + 0.3 * Math.sin(now / 400 + sh.t * 8);
      ctx.fillStyle = ei >= 14 ? "#2a3848" : "#4a5060";
      ctx.beginPath();
      ctx.moveTo(-s * 0.28, s * 0.05);
      ctx.lineTo(-s * 0.32, s * 0.14);
      ctx.lineTo(s * 0.32, s * 0.14);
      ctx.lineTo(s * 0.28, s * 0.05);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = ei >= 14 ? "#1e2838" : "#38424e";
      ctx.fillRect(-s * 0.12, -s * 0.06, s * 0.28, s * 0.12);
      ctx.fillStyle = `rgba(100,200,255,${(0.5 + pulse * 0.3).toFixed(2)})`;
      for (let i = 0; i < 3; i += 1) ctx.fillRect(-s * 0.08 + i * s * 0.09, -s * 0.03, s * 0.05, s * 0.04);
      ctx.fillStyle = "#606878";
      ctx.fillRect(s * 0.08, -s * 0.18, s * 0.04, s * 0.14);
      if (ei >= 14) {
        ctx.strokeStyle = `rgba(60,200,255,${pulse.toFixed(2)})`;
        ctx.lineWidth = Math.max(1.5, s * 0.025);
        ctx.beginPath();
        ctx.moveTo(-s * 0.3, s * 0.10);
        ctx.lineTo(-s * 0.5, s * 0.10);
        ctx.stroke();
        ctx.strokeStyle = `rgba(80,160,255,${(pulse * 0.5).toFixed(2)})`;
        ctx.lineWidth = Math.max(1, s * 0.016);
        ctx.beginPath();
        ctx.moveTo(-s * 0.28, s * 0.14);
        ctx.lineTo(s * 0.28, s * 0.14);
        ctx.stroke();
      } else {
        const smk = (now / 600) % 1;
        ctx.fillStyle = `rgba(160,150,140,${((1 - smk) * 0.28).toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(s * 0.10, -s * (0.18 + smk * 0.18), s * (0.04 + smk * 0.07), 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (band >= 4) {
      ctx.fillStyle = "#5a4838";
      ctx.beginPath();
      ctx.moveTo(-s * 0.26, s * 0.02);
      ctx.quadraticCurveTo(0, s * 0.20, s * 0.26, s * 0.02);
      ctx.lineTo(s * 0.18, s * 0.12);
      ctx.quadraticCurveTo(0, s * 0.24, -s * 0.18, s * 0.12);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#7a6050";
      ctx.fillRect(-s * 0.10, -s * 0.06, s * 0.22, s * 0.10);
      ctx.strokeStyle = "#6a4a2a";
      ctx.lineWidth = Math.max(1, s * 0.022);
      const wRot = (now / 600) % (Math.PI * 2);
      for (let i = 0; i < 6; i += 1) {
        const wa = wRot + i * Math.PI / 3;
        ctx.beginPath();
        ctx.moveTo(s * 0.22, s * 0.08);
        ctx.lineTo(s * (0.22 + Math.cos(wa) * 0.10), s * (0.08 + Math.sin(wa) * 0.07));
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(s * 0.22, s * 0.08, s * 0.10, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "#3a2818";
      ctx.fillRect(s * 0.04, -s * 0.22, s * 0.06, s * 0.18);
      const smk = (now / 700) % 1;
      ctx.fillStyle = `rgba(100,90,80,${((1 - smk) * 0.30).toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(s * 0.07, -s * (0.22 + smk * 0.20), s * (0.04 + smk * 0.08), 0, Math.PI * 2);
      ctx.fill();
    } else if (band >= 2) {
      ctx.fillStyle = "#4a3320";
      ctx.beginPath();
      ctx.moveTo(-s * 0.24, s * 0.02);
      ctx.quadraticCurveTo(0, s * 0.19, s * 0.24, s * 0.02);
      ctx.lineTo(s * 0.16, s * 0.12);
      ctx.quadraticCurveTo(0, s * 0.22, -s * 0.16, s * 0.12);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(28,18,10,0.55)";
      ctx.lineWidth = Math.max(1, s * 0.018);
      ctx.beginPath();
      ctx.moveTo(-s * 0.12, s * 0.08);
      ctx.lineTo(s * 0.13, s * 0.08);
      ctx.stroke();
      ctx.fillStyle = "#d8cdb0";
      ctx.fillRect(-s * 0.01, -s * 0.24, Math.max(1, s * 0.022), s * 0.28);
      ctx.fillStyle = `rgba(230,215,180,${(0.7 + 0.2 * Math.sin(now / 900 + sh.t * 5)).toFixed(2)})`;
      ctx.beginPath();
      ctx.moveTo(s * 0.015, -s * 0.22);
      ctx.lineTo(s * 0.15, -s * 0.08);
      ctx.lineTo(s * 0.015, -s * 0.02);
      ctx.closePath();
      ctx.fill();
      if (band >= 3) {
        ctx.fillStyle = "rgba(210,195,158,0.65)";
        ctx.beginPath();
        ctx.moveTo(s * 0.015, -s * 0.22);
        ctx.lineTo(-s * 0.12, -s * 0.10);
        ctx.lineTo(s * 0.015, -s * 0.04);
        ctx.closePath();
        ctx.fill();
      }
    } else {
      ctx.fillStyle = "#6a4a22";
      ctx.beginPath();
      ctx.moveTo(-s * 0.20, s * 0.04);
      ctx.quadraticCurveTo(0, s * 0.16, s * 0.20, s * 0.04);
      ctx.lineTo(s * 0.14, s * 0.12);
      ctx.quadraticCurveTo(0, s * 0.20, -s * 0.14, s * 0.12);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#5a3818";
      ctx.lineWidth = Math.max(1, s * 0.022);
      ctx.lineCap = "round";
      const padA = Math.sin(now / 500 + sh.t * 6) * 0.4;
      ctx.beginPath();
      ctx.moveTo(s * 0.08, s * 0.06);
      ctx.lineTo(s * (0.20 + Math.cos(padA) * 0.12), s * (0.10 + Math.sin(padA) * 0.08));
      ctx.stroke();
      ctx.lineCap = "square";
      ctx.fillStyle = "#7a5828";
      ctx.fillRect(-s * 0.01, -s * 0.16, Math.max(1, s * 0.018), s * 0.20);
      ctx.fillStyle = "rgba(200,170,110,0.6)";
      ctx.beginPath();
      ctx.moveTo(s * 0.010, -s * 0.14);
      ctx.lineTo(s * 0.10, -s * 0.06);
      ctx.lineTo(s * 0.010, -s * 0.01);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
}

/* ---- legacy citymap rendering\crisis.js ---- */


/* ============================================================================
 * citymap-render-crisis.js - Evenements visuels lies a l'instabilite.
 * ============================================================================ */

function cityMapPickRiotRoadNear(origin, radius) {
  if (!CM.walkRoadList.length) return null;
  if (!origin) return CM.walkRoadList[Math.floor(Math.random() * CM.walkRoadList.length)];

  const near = [];
  for (const r of CM.walkRoadList) {
    const dist = Math.abs(r.gx - origin.gx) + Math.abs(r.gy - origin.gy);
    if (dist <= radius) near.push(r);
  }
  const pool = near.length ? near : CM.walkRoadList;
  return pool[Math.floor(Math.random() * pool.length)];
}

function cityMapRiotGroupCenter(rioters) {
  if (!rioters || !rioters.length) return null;
  let gx = 0, gy = 0;
  for (const p of rioters) {
    gx += p.x / CM.TILE - 0.5;
    gy += p.y / CM.TILE - 0.5;
  }
  return { gx: gx / rioters.length, gy: gy / rioters.length };
}

function drawCrisis(dt, now) {
  if (!CM.layout) return;
  const ctx = CM.ctx, z = CM.cam.zoom;
  const inst = state.instability || 0;
  const cs = (wx, wy) => ({ x: (wx - CM.cam.x) * z + CM.cw / 2, y: (wy - CM.cam.y) * z + CM.ch / 2 });

  if (!CM.rioters) CM.rioters = [];
  const want = inst > 0.55 && CM.walkRoadList.length ? Math.floor((inst - 0.55) / 0.45 * 36) + 8 : 0;
  if (want === 0) {
    CM.rioters.length = 0;
    CM.riotGoal = null;
  } else {
    const isRoad = (x, y) => CM.walkRoadSet.has(cityMapWalkRoadKey(x, y));
    const groupCenter = cityMapRiotGroupCenter(CM.rioters);
    if (!CM.riotGoal || !isRoad(CM.riotGoal.gx, CM.riotGoal.gy) || (now - (CM.riotGoalAt || 0)) > 5000) {
      CM.riotGoal = cityMapPickRiotRoadNear(groupCenter || CM.rioters[0], 6 + Math.round(inst * 8));
      CM.riotGoalAt = now;
    }
    const spawnAnchor = groupCenter || CM.riotGoal;
    while (CM.rioters.length < want) {
      const r = cityMapPickRiotRoadNear(spawnAnchor, 2 + Math.round(inst));
      if (!r) break;
      CM.rioters.push({
        gx: r.gx,
        gy: r.gy,
        x: (r.gx + 0.5) * CM.TILE,
        y: (r.gy + 0.5) * CM.TILE,
        tx: (r.gx + 0.5) * CM.TILE,
        ty: (r.gy + 0.5) * CM.TILE,
        dir: -1,
        pauseT: 0,
        speed: 24 + Math.random() * 10,
        phase: Math.random() * Math.PI * 2,
        lane: (Math.random() - 0.5) * CM.TILE * 0.38
      });
    }
    if (CM.rioters.length > want) CM.rioters.length = want;
    const goal = CM.riotGoal;
    const cohesion = cityMapRiotGroupCenter(CM.rioters) || goal;
    let mx = 0, my = 0;
    const pts = [];
    for (const p of CM.rioters) {
      if (!isRoad(p.gx, p.gy)) {
        const r = cityMapPickRiotRoadNear(cohesion, 6 + Math.round(inst * 4));
        if (!r) continue;
        p.gx = r.gx;
        p.gy = r.gy;
        p.x = (r.gx + 0.5) * CM.TILE;
        p.y = (r.gy + 0.5) * CM.TILE;
        p.tx = p.x;
        p.ty = p.y;
        p.dir = -1;
      }
      if (p.pauseT > 0) {
        p.pauseT -= dt;
      } else {
        const ddx = p.tx - p.x, ddy = p.ty - p.y, dd = Math.hypot(ddx, ddy);
        if (dd < 2.4) {
          if (Math.random() < 0.035) {
            p.pauseT = 0.12 + Math.random() * 0.35;
          } else {
            const rev = p.dir >= 0 ? (p.dir ^ 1) : -1;
            const opts = [];
            for (let i = 0; i < 4; i += 1) {
              const nx = p.gx + CM_DIRS[i][0], ny = p.gy + CM_DIRS[i][1];
              if (isRoad(nx, ny) && roadStepAllowed(p.gx, p.gy, i)) opts.push({ i, nx, ny });
            }
            const pool = opts.filter((o) => o.i !== rev);
            const use = pool.length ? pool : opts;
            let best = use[0], bs = -Infinity;
            const groupDistNow = Math.abs(cohesion.gx - p.gx) + Math.abs(cohesion.gy - p.gy);
            const personalGoal = groupDistNow > 4.5 ? cohesion : goal;
            for (const o of use) {
              const groupDistNext = Math.abs(cohesion.gx - o.nx) + Math.abs(cohesion.gy - o.ny);
              let sc = -(Math.abs(personalGoal.gx - o.nx) + Math.abs(personalGoal.gy - o.ny));
              sc -= groupDistNext * (personalGoal === cohesion ? 0.25 : 0.85);
              if (o.i === p.dir) sc += 1.25;
              sc += Math.random() * 0.9;
              if (sc > bs) {
                bs = sc;
                best = o;
              }
            }
            if (best) {
              p.gx = best.nx;
              p.gy = best.ny;
              p.dir = best.i;
              p.tx = (p.gx + 0.5) * CM.TILE;
              p.ty = (p.gy + 0.5) * CM.TILE;
            }
          }
        } else {
          const sp = p.speed * dt;
          p.x += ddx / dd * sp;
          p.y += ddy / dd * sp;
        }
      }
      mx += p.x;
      my += p.y;
      pts.push(p);
    }
    if (pts.length) {
      mx /= pts.length;
      my /= pts.length;
      const c = cs(mx, my);
      const pulse = 0.5 + 0.5 * Math.sin(now / 320);
      const R = (1.6 + inst * 1.4) * CM.TILE * z;
      const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, Math.max(1, R));
      g.addColorStop(0, `rgba(200,40,30,${(0.16 + 0.12 * pulse).toFixed(2)})`);
      g.addColorStop(1, "rgba(200,40,30,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(c.x, c.y, Math.max(1, R), 0, Math.PI * 2);
      ctx.fill();
      for (let i = 0; i < pts.length; i += 1) {
        const p = pts[i];
        const laneX = (p.dir === 2 || p.dir === 3) ? (p.lane || 0) : 0;
        const laneY = (p.dir === 0 || p.dir === 1) ? (p.lane || 0) : 0;
        const wob = Math.sin(now / 170 + (p.phase || 0)) * 0.8;
        const sx = (p.x + laneX - CM.cam.x) * z + CM.cw / 2;
        const sy = (p.y + laneY - CM.cam.y) * z + CM.ch / 2 + wob * z;
        if (sx < -4 || sy < -4 || sx > CM.cw + 4 || sy > CM.ch + 4) continue;
        ctx.fillStyle = "rgba(205,45,35,0.92)";
        ctx.beginPath();
        ctx.arc(sx, sy, Math.max(1.4, 2.1 * z), 0, Math.PI * 2);
        ctx.fill();
        if (i % 5 === 0) {
          ctx.fillStyle = `rgba(255,150,40,${(0.7 + 0.3 * pulse).toFixed(2)})`;
          ctx.beginPath();
          ctx.arc(sx, sy - 3 * z, Math.max(1, 1.3 * z), 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  const famine = (state.population || 0) > 60 && (state.food || 0) < (state.population || 0) * 1.1;
  if (famine) {
    const target = CM.layout.tiles.find((t) => t.type === "public") || CM.layout.tiles.find((t) => t.type === "house");
    if (target) {
      for (let i = 0; i < 10; i += 1) {
        const p = cs((target.gx + 0.5) * CM.TILE + (i + 1) * CM.TILE * 0.5, (target.gy + 0.5) * CM.TILE + Math.sin(i * 1.3) * 3);
        ctx.fillStyle = "rgba(220,200,150,0.85)";
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(1, 1.6 * z), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

/* ---- legacy citymap rendering\buildings.js ---- */


/* ============================================================================
 * citymap-render-buildings.js - Rendu des tuiles, batiments, districts et merveilles.
 *   drawDistrict, drawTile et helpers de forme (drawHouseShape, drawPublicShape,
 *   drawEngineSprite, drawTinyCamp). Depend de CM, citymap-camera et citymap-draw-utils.
 * ============================================================================ */

// Constantes module — allouées une fois, jamais à chaque frame
const CM_DISTRICT_PALETTE = {
  dense:      ["#5c4521", "#2f2110"],
  market:     ["#8a6622", "#e8c96a"],
  monument:   ["#c9a84c", "#fff1bd"],
  archive:    ["#6a5a34", "#e8dcae"],
  temple:     ["#a58a3f", "#f0d98d"],
  keep:       ["#77715d", "#d8cfb0"],
  forum:      ["#9f7b2a", "#f0d98d"],
  palace:     ["#b19042", "#fff1bd"],
  tower:      ["#60594c", "#e8dcae"],
  station:    ["#5e5746", "#e8dcae"],
  spire:      ["#625a49", "#f0d98d"],
  observatory:["#534a34", "#e8dcae"],
  arcology:   ["#5e5746", "#e8dcae"],
  grid:       ["#544e3e", "#e8dcae"]
};
const CM_DISTRICT_PALETTE_DEFAULT = ["#5c4521", "#2f2110"];
const CM_FREESTANDING_KINDS = new Set(["tower", "spire", "arcology", "station", "grid", "observatory"]);

function drawDistrict(d, now, timeWear) {
  const span = d.size;
  const box = cityMapTileScreen(d.gx, d.gy, span);
  if (box.x < -box.w || box.y < -box.h || box.x > CM.cw + box.w || box.y > CM.ch + box.h) return;
  const ctx = CM.ctx;
  const pad = box.s * 0.12;
  const born = CM.born[d.key] || now;
  const prog = Math.max(0, Math.min(1, (now - born) / 650));
  const e = prog * prog * (3 - 2 * prog);
  const inset = (1 - e) * Math.min(box.w, box.h) * 0.35;
  const x = box.x + inset, y = box.y + inset, w = box.w - inset * 2, h = box.h - inset * 2;
  if (w <= 1 || h <= 1) return;
  const palette = CM_DISTRICT_PALETTE[d.kind] || CM_DISTRICT_PALETTE_DEFAULT;

  ctx.globalAlpha = e;
  ctx.fillStyle = "rgba(8,5,2,0.28)";
  ctx.beginPath();
  ctx.ellipse(x + w / 2, y + h * 0.76, w * 0.43, h * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
  const bx = x + pad, by = y + pad, bw = w - pad * 2, bh = h - pad * 2;
  const freestanding = CM_FREESTANDING_KINDS.has(d.kind);
  if (!freestanding) {
    // Masse batie avec ombrage lateral + bandeau de toit (plus de cadre carre dur).
    ctx.fillStyle = palette[0];
    ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = "rgba(255,235,190,0.07)";
    ctx.fillRect(bx, by, bw * 0.24, bh);
    ctx.fillStyle = "rgba(0,0,0,0.24)";
    ctx.fillRect(bx + bw * 0.76, by, bw * 0.24, bh);
    ctx.fillStyle = "rgba(18,11,4,0.55)";
    ctx.fillRect(bx, by, bw, bh * 0.13);
  }

  if (d.kind === "spire" || d.kind === "tower" || d.kind === "arcology") {
    const towers = d.kind === "arcology" ? 5 : d.kind === "spire" ? 3 : 4;
    for (let twr = 0; twr < towers; twr += 1) {
      const ratio = towers === 1 ? 0.5 : twr / (towers - 1);
      const tw = bw * (d.kind === "arcology" ? 0.18 : 0.16);
      const th = bh * (0.46 + ((twr * 37) % 5) * 0.08 + (d.kind === "spire" ? 0.2 : 0));
      const tx = bx + bw * (0.18 + ratio * 0.64) - tw / 2;
      const ty = by + bh * 0.88 - th;
      ctx.fillStyle = palette[0];
      ctx.fillRect(tx, ty, tw, th);
      ctx.strokeStyle = "rgba(215,243,255,0.48)";
      ctx.lineWidth = Math.max(1, box.s * 0.035);
      ctx.strokeRect(tx, ty, tw, th);
      ctx.fillStyle = palette[1];
      for (let row = 0; row < 5; row += 1) {
        const wy = ty + th * (0.18 + row * 0.14);
        if (wy > ty + th * 0.84) continue;
        ctx.fillRect(tx + tw * 0.28, wy, tw * 0.16, Math.max(1, th * 0.045));
        ctx.fillRect(tx + tw * 0.58, wy, tw * 0.16, Math.max(1, th * 0.045));
      }
    }
    ctx.fillStyle = "rgba(20,12,5,0.32)";
    ctx.fillRect(bx + bw * 0.18, by + bh * 0.78, bw * 0.64, bh * 0.12);
    ctx.fillStyle = palette[1];
    if (d.kind === "spire") {
      ctx.beginPath();
      ctx.moveTo(bx + bw * 0.42, by + bh * 0.2);
      ctx.lineTo(bx + bw * 0.5, by - bh * 0.06);
      ctx.lineTo(bx + bw * 0.58, by + bh * 0.2);
      ctx.closePath();
      ctx.fill();
    }
  } else if (d.kind === "station" || d.kind === "grid") {
    ctx.fillStyle = palette[0];
    ctx.beginPath();
    ctx.moveTo(bx + bw * 0.16, by + bh * 0.32);
    ctx.lineTo(bx + bw * 0.84, by + bh * 0.22);
    ctx.lineTo(bx + bw * 0.92, by + bh * 0.7);
    ctx.lineTo(bx + bw * 0.28, by + bh * 0.88);
    ctx.lineTo(bx + bw * 0.1, by + bh * 0.62);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = palette[1];
    ctx.lineWidth = Math.max(1, box.s * 0.05);
    for (let i = 1; i < 4; i += 1) {
      const lx = bx + bw * i / 4;
      const ly = by + bh * i / 4;
      ctx.beginPath(); ctx.moveTo(lx, by + bh * 0.12); ctx.lineTo(lx, by + bh * 0.88); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(bx + bw * 0.12, ly); ctx.lineTo(bx + bw * 0.88, ly); ctx.stroke();
    }
  } else if (d.kind === "dense" || d.kind === "market" || d.kind === "forum") {
    ctx.fillStyle = "rgba(20,12,5,0.32)";
    ctx.fillRect(bx + bw * 0.18, by + bh * 0.18, bw * 0.64, bh * 0.64);
    ctx.fillStyle = "rgba(255,232,180,0.24)";
    const cols = Math.max(3, Math.floor(span * 2.2));
    for (let i = 1; i < cols; i += 1) {
      const lx = bx + bw * i / cols;
      ctx.fillRect(lx, by + bh * 0.08, Math.max(1, box.s * 0.045), bh * 0.84);
    }
    if (d.kind === "market" || d.kind === "forum") {
      ctx.fillStyle = "rgba(232,201,106,0.55)";
      ctx.fillRect(bx + bw * 0.28, by + bh * 0.36, bw * 0.44, bh * 0.28);
    }
  } else {
    if (freestanding) {
      ctx.fillStyle = palette[0];
      ctx.beginPath();
      ctx.ellipse(bx + bw * 0.5, by + bh * 0.52, bw * 0.36, bh * 0.28, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = "rgba(18,10,4,0.28)";
      ctx.fillRect(bx + bw * 0.22, by + bh * 0.22, bw * 0.56, bh * 0.56);
    }
    ctx.fillStyle = palette[1];
    if (d.kind === "archive" || d.kind === "observatory") {
      ctx.fillRect(bx + bw * 0.18, by + bh * 0.2, bw * 0.64, bh * 0.16);
      ctx.fillRect(bx + bw * 0.18, by + bh * 0.64, bw * 0.64, bh * 0.16);
      for (let ci = 0; ci < 4; ci += 1) ctx.fillRect(bx + bw * (0.24 + ci * 0.14), by + bh * 0.28, bw * 0.045, bh * 0.34);
      if (d.kind === "observatory") {
        ctx.beginPath();
        ctx.arc(bx + bw * 0.5, by + bh * 0.2, bw * 0.18, Math.PI, Math.PI * 2);
        ctx.stroke();
      }
    } else {
      ctx.beginPath();
      ctx.arc(x + w / 2, y + h / 2, Math.max(2, Math.min(w, h) * 0.18), 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,241,189,0.45)";
      ctx.beginPath();
      ctx.arc(x + w / 2, y + h / 2, Math.max(4, Math.min(w, h) * 0.32), 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillRect(bx + bw * 0.45, by + bh * 0.08, bw * 0.1, bh * 0.84);
    }
  }

  // Banniere aux couleurs de la dynastie au sommet du grand batiment.
  const tint = CM_TINTS[CM.dynastyIdx % CM_TINTS.length];
  ctx.strokeStyle = "#2a1c0c"; ctx.lineWidth = Math.max(1, box.s * 0.04);
  ctx.beginPath(); ctx.moveTo(x + w * 0.5, by); ctx.lineTo(x + w * 0.5, by - box.s * 0.55); ctx.stroke();
  ctx.fillStyle = tint;
  ctx.beginPath();
  ctx.moveTo(x + w * 0.5, by - box.s * 0.55);
  ctx.lineTo(x + w * 0.5 + box.s * 0.42, by - box.s * 0.46);
  ctx.lineTo(x + w * 0.5, by - box.s * 0.37);
  ctx.closePath(); ctx.fill();

  if (timeWear > 0.65) {
    ctx.fillStyle = `rgba(20,14,8,${Math.min(0.36, (timeWear - 0.65) * 0.9)})`;
    ctx.fillRect(x + pad, y + pad, w - pad * 2, h - pad * 2);
  }
  ctx.globalAlpha = 1;
}

function drawTinyCamp(x, y, w, h, pad, seed, variant, now) {
  const ctx = CM.ctx;
  const t = now || 0;
  if (variant === "firepit") {
    // Grand feu central — halo, bûches, braises, 3 flammes animées
    const cx = x + w * 0.5, cy = y + h * 0.5;
    // Halo rayonnant (grand, en premier pour rester derrière)
    const halo = 0.20 + 0.10 * Math.abs(Math.sin(t / 520));
    const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, w * 0.46);
    rg.addColorStop(0, `rgba(255,160,30,${halo.toFixed(2)})`);
    rg.addColorStop(1, "rgba(255,80,5,0)");
    ctx.fillStyle = rg;
    ctx.beginPath(); ctx.arc(cx, cy, w * 0.46, 0, Math.PI * 2); ctx.fill();
    // Cercle de pierres
    ctx.fillStyle = "#5a4830";
    for (let i = 0; i < 7; i++) {
      const a = i * Math.PI * 2 / 7;
      ctx.beginPath(); ctx.arc(cx + Math.cos(a) * w * 0.22, cy + Math.sin(a) * h * 0.18, w * 0.044, 0, Math.PI * 2); ctx.fill();
    }
    // Bûches en croix
    ctx.lineWidth = Math.max(2, w * 0.06); ctx.lineCap = "round";
    ctx.strokeStyle = "#6a3c0c";
    ctx.beginPath(); ctx.moveTo(cx - w*0.18, cy + h*0.06); ctx.lineTo(cx + w*0.18, cy - h*0.06); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + w*0.18, cy + h*0.06); ctx.lineTo(cx - w*0.18, cy - h*0.06); ctx.stroke();
    ctx.lineCap = "square";
    // Braises
    ctx.fillStyle = "rgba(200,60,5,0.8)";
    ctx.beginPath(); ctx.ellipse(cx, cy + h*0.02, w*0.13, h*0.09, 0, 0, Math.PI*2); ctx.fill();
    // 3 flammes animées
    const f1 = 0.5+0.5*Math.sin(t/170), f2 = 0.5+0.5*Math.sin(t/140+1.3), f3 = 0.5+0.5*Math.sin(t/200+2.7);
    ctx.fillStyle = `rgba(255,85,8,${(0.78+f1*0.22).toFixed(2)})`;
    ctx.beginPath(); ctx.moveTo(cx-w*0.1,cy+h*0.04); ctx.quadraticCurveTo(cx-w*0.16,cy-h*(0.18+f1*0.08),cx,cy-h*(0.26+f1*0.07)); ctx.quadraticCurveTo(cx+w*0.16,cy-h*(0.18+f2*0.06),cx+w*0.1,cy+h*0.04); ctx.closePath(); ctx.fill();
    ctx.fillStyle = `rgba(255,195,20,${(0.82+f2*0.18).toFixed(2)})`;
    ctx.beginPath(); ctx.moveTo(cx-w*0.07,cy+h*0.04); ctx.quadraticCurveTo(cx-w*0.04,cy-h*(0.22+f2*0.1),cx,cy-h*(0.32+f2*0.08)); ctx.quadraticCurveTo(cx+w*0.04,cy-h*(0.22+f3*0.07),cx+w*0.07,cy+h*0.04); ctx.closePath(); ctx.fill();
    // Étincelle centrale
    ctx.fillStyle = `rgba(255,250,200,${(0.7+f3*0.3).toFixed(2)})`;
    ctx.beginPath(); ctx.arc(cx, cy - h*(0.3+f2*0.07), Math.max(1, w*0.04), 0, Math.PI*2); ctx.fill();
  } else {
    // TENTE — vue de dessus : polygone avec coutures
    ctx.fillStyle = "#c89a3a";
    ctx.beginPath();
    ctx.moveTo(x+w*0.5, y+h*0.18); ctx.lineTo(x+w*0.82, y+h*0.66);
    ctx.lineTo(x+w*0.5, y+h*0.74); ctx.lineTo(x+w*0.18, y+h*0.66);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = "rgba(80,48,10,0.28)";
    ctx.beginPath(); ctx.moveTo(x+w*0.5,y+h*0.18); ctx.lineTo(x+w*0.82,y+h*0.66); ctx.lineTo(x+w*0.5,y+h*0.46); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(90,55,10,0.45)"; ctx.lineWidth = Math.max(0.5,w*0.022);
    ctx.beginPath(); ctx.moveTo(x+w*0.5,y+h*0.18); ctx.lineTo(x+w*0.5,y+h*0.74); ctx.stroke();
    ctx.fillStyle = "rgba(30,16,4,0.6)";
    ctx.beginPath(); ctx.moveTo(x+w*0.43,y+h*0.66); ctx.lineTo(x+w*0.5,y+h*0.58); ctx.lineTo(x+w*0.57,y+h*0.66); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#7a4e10"; ctx.fillRect(x+w*0.483,y+h*0.14,w*0.034,h*0.1);
  }
}

function drawHouseShape(x, y, w, h, pad, tier, seed, variant, now) {
  const ctx = CM.ctx;
  const band = (CM.layout && CM.layout.counts) ? CM.layout.counts.eraBand : 0;
  const lit = cmLitColor(band);
  const s = (seed || 0) % 100;
  const t = now || 0;

  if (variant === "tent" || variant === "firepit") {
    drawTinyCamp(x, y, w, h, pad, seed, variant, now); return;
  }

  if (variant === "hut") {
    // ── CABANE RONDE — vue de dessus, toit de chaume conique ──────────
    ctx.fillStyle = "#9a6e2a";
    ctx.beginPath(); ctx.ellipse(x+w*0.5,y+h*0.56,w*0.36,h*0.32,0,0,Math.PI*2); ctx.fill();
    // Anneaux de chaume (du bord vers le centre = de clair à foncé)
    const thatch = ["#8a5c18","#7a4e12","#6a400c","#522e08"];
    for (let ri=0; ri<4; ri++) {
      ctx.fillStyle = thatch[ri];
      ctx.beginPath(); ctx.ellipse(x+w*0.5,y+h*0.54,w*(0.32-ri*0.07),h*(0.29-ri*0.06),0,0,Math.PI*2); ctx.fill();
    }
    // Pointe centrale
    ctx.fillStyle = "#3a2008"; ctx.beginPath(); ctx.arc(x+w*0.5,y+h*0.52,w*0.055,0,Math.PI*2); ctx.fill();
    // Entrée
    ctx.fillStyle = "rgba(25,12,3,0.65)"; ctx.beginPath(); ctx.arc(x+w*0.5,y+h*0.76,w*0.065,Math.PI,0); ctx.fill();
    return;
  }

  if (variant === "longhouse") {
    // ── LONGUE MAISON — rectangle allongé, toit en bâtière ───────────
    ctx.fillStyle = "#8a6020";
    ctx.fillRect(x+w*0.1,y+h*0.36,w*0.8,h*0.46);
    // Arête faîtière
    ctx.fillStyle = "#5a3a0e"; ctx.fillRect(x+w*0.1,y+h*0.36,w*0.8,h*0.07);
    // Stries de chaume transversales
    ctx.strokeStyle = "rgba(40,22,6,0.32)"; ctx.lineWidth = Math.max(0.5,w*0.018);
    for (let i=1; i<6; i++) { ctx.beginPath(); ctx.moveTo(x+w*(0.12+i*0.13),y+h*0.36); ctx.lineTo(x+w*(0.12+i*0.13),y+h*0.82); ctx.stroke(); }
    // Pignons triangulaires (bout gauche + droit)
    ctx.fillStyle = "#7a5016";
    ctx.beginPath(); ctx.moveTo(x+w*0.1,y+h*0.36); ctx.lineTo(x+w*0.18,y+h*0.22); ctx.lineTo(x+w*0.26,y+h*0.36); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x+w*0.74,y+h*0.36); ctx.lineTo(x+w*0.82,y+h*0.22); ctx.lineTo(x+w*0.9,y+h*0.36); ctx.closePath(); ctx.fill();
    // Porte
    ctx.fillStyle = "rgba(28,14,4,0.7)"; ctx.fillRect(x+w*0.45,y+h*0.62,w*0.1,h*0.2);
    return;
  }

  if (variant === "townhouse") {
    // ── MAISON À COLOMBAGES — torchis + pans de bois ─────────────────
    ctx.fillStyle = "#c8a060"; ctx.fillRect(x+w*0.17,y+h*0.4,w*0.66,h*0.44);
    // Colombages (croisillons)
    ctx.strokeStyle = "#5a3610"; ctx.lineWidth = Math.max(1,w*0.032);
    ctx.beginPath(); ctx.moveTo(x+w*0.17,y+h*0.4); ctx.lineTo(x+w*0.5,y+h*0.52); ctx.lineTo(x+w*0.83,y+h*0.4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x+w*0.17,y+h*0.58); ctx.lineTo(x+w*0.83,y+h*0.58); ctx.stroke();
    // Toit à deux versants (face avant visible)
    ctx.fillStyle = "#8c3c1a";
    ctx.beginPath(); ctx.moveTo(x+w*0.13,y+h*0.43); ctx.lineTo(x+w*0.5,y+h*0.14); ctx.lineTo(x+w*0.87,y+h*0.43); ctx.lineTo(x+w*0.83,y+h*0.4); ctx.lineTo(x+w*0.5,y+h*0.18); ctx.lineTo(x+w*0.17,y+h*0.4); ctx.closePath(); ctx.fill();
    // Faîtage
    ctx.fillStyle = "#6a2a0e"; ctx.fillRect(x+w*0.47,y+h*0.13,w*0.06,h*0.05);
    // Fenêtres
    ctx.fillStyle = lit; ctx.fillRect(x+w*0.22,y+h*0.5,w*0.12,h*0.08); ctx.fillRect(x+w*0.66,y+h*0.5,w*0.12,h*0.08);
    // Porte
    ctx.fillStyle = "rgba(24,12,4,0.7)"; ctx.fillRect(x+w*0.44,y+h*0.66,w*0.12,h*0.18);
    return;
  }

  if (variant === "courtyard") {
    // ── MAISON À COUR — U visible depuis le ciel ─────────────────────
    ctx.fillStyle = "#c0a058"; ctx.fillRect(x+w*0.12,y+h*0.28,w*0.76,h*0.58);
    // Cour intérieure
    ctx.fillStyle = "#c4a462"; ctx.fillRect(x+w*0.3,y+h*0.44,w*0.4,h*0.3);
    // Toit des ailes (ardoise rouge)
    ctx.fillStyle = "#8c3820";
    ctx.fillRect(x+w*0.12,y+h*0.28,w*0.76,h*0.09);
    ctx.fillRect(x+w*0.12,y+h*0.28,w*0.11,h*0.58); ctx.fillRect(x+w*0.77,y+h*0.28,w*0.11,h*0.58);
    // Tuiles (lignes)
    ctx.strokeStyle = "rgba(55,18,6,0.3)"; ctx.lineWidth = Math.max(0.5,w*0.016);
    for (let i=1; i<4; i++) ctx.strokeRect(x+w*(0.14+i*0.05),y+h*0.3,w*(0.72-i*0.1),h*(0.54-i*0.05));
    // Fenêtres
    ctx.fillStyle = lit; ctx.fillRect(x+w*0.18,y+h*0.46,w*0.08,h*0.07); ctx.fillRect(x+w*0.74,y+h*0.46,w*0.08,h*0.07);
    return;
  }

  if (variant === "stonehouse") {
    // ── MAISON DE PIERRE — murs en moellon, toit ardoise ─────────────
    ctx.fillStyle = "#9a8c78"; ctx.fillRect(x+w*0.15,y+h*0.38,w*0.7,h*0.46);
    // Joints de maçonnerie
    ctx.strokeStyle = "rgba(55,45,30,0.38)"; ctx.lineWidth = Math.max(0.5,w*0.018);
    for (let r=1; r<3; r++) { ctx.beginPath(); ctx.moveTo(x+w*0.15,y+h*(0.38+r*0.15)); ctx.lineTo(x+w*0.85,y+h*(0.38+r*0.15)); ctx.stroke(); }
    for (let c=1; c<4; c++) { ctx.beginPath(); ctx.moveTo(x+w*(0.15+c*0.17),y+h*0.38); ctx.lineTo(x+w*(0.15+c*0.17),y+h*0.84); ctx.stroke(); }
    // Toit ardoise (2 versants)
    ctx.fillStyle = "#58534a";
    ctx.beginPath(); ctx.moveTo(x+w*0.11,y+h*0.42); ctx.lineTo(x+w*0.5,y+h*0.14); ctx.lineTo(x+w*0.89,y+h*0.42); ctx.lineTo(x+w*0.84,y+h*0.38); ctx.lineTo(x+w*0.5,y+h*0.18); ctx.lineTo(x+w*0.16,y+h*0.38); ctx.closePath(); ctx.fill();
    // Cheminée
    ctx.fillStyle = "#78685a"; ctx.fillRect(x+w*0.62,y+h*0.18,w*0.09,h*0.12);
    ctx.fillStyle = "rgba(60,50,38,0.65)"; ctx.fillRect(x+w*0.61,y+h*0.16,w*0.11,h*0.04);
    // Porte en arc brisé
    ctx.fillStyle = "rgba(18,10,4,0.72)";
    ctx.beginPath(); ctx.arc(x+w*0.5,y+h*0.68,w*0.065,Math.PI,0); ctx.fill();
    ctx.fillRect(x+w*0.435,y+h*0.68,w*0.13,h*0.16);
    // Fenêtres à croisée
    ctx.fillStyle = lit; ctx.fillRect(x+w*0.22,y+h*0.52,w*0.11,h*0.09); ctx.fillRect(x+w*0.67,y+h*0.52,w*0.11,h*0.09);
    ctx.strokeStyle = "rgba(80,60,30,0.5)"; ctx.lineWidth = Math.max(0.5,w*0.016);
    for (const wx of [0.22, 0.67]) { ctx.beginPath(); ctx.moveTo(x+w*(wx+0.055),y+h*0.52); ctx.lineTo(x+w*(wx+0.055),y+h*0.61); ctx.stroke(); }
    return;
  }

  if (variant === "manor") {
    // ── MANOIR — corps principal + aile + tour d'angle ───────────────
    ctx.fillStyle = "#8a7860"; ctx.fillRect(x+w*0.08,y+h*0.28,w*0.84,h*0.6);
    // Toit central ardoise foncée
    ctx.fillStyle = "#484440";
    ctx.beginPath(); ctx.moveTo(x+w*0.08,y+h*0.3); ctx.lineTo(x+w*0.5,y+h*0.1); ctx.lineTo(x+w*0.92,y+h*0.3); ctx.lineTo(x+w*0.88,y+h*0.26); ctx.lineTo(x+w*0.5,y+h*0.14); ctx.lineTo(x+w*0.12,y+h*0.26); ctx.closePath(); ctx.fill();
    // Tour d'angle (coin supérieur gauche)
    ctx.fillStyle = "#7a6858"; ctx.fillRect(x+w*0.08,y+h*0.2,w*0.22,h*0.28);
    ctx.fillStyle = "#404038"; ctx.fillRect(x+w*0.06,y+h*0.16,w*0.26,h*0.07);
    ctx.fillRect(x+w*0.1,y+h*0.1,w*0.06,h*0.09); ctx.fillRect(x+w*0.22,y+h*0.1,w*0.06,h*0.09);
    // Rangée de fenêtres
    ctx.fillStyle = lit;
    for (let i=0; i<4; i++) ctx.fillRect(x+w*(0.24+i*0.16),y+h*0.46,w*0.1,h*0.08);
    // Porte d'entrée
    ctx.fillStyle = "#3a2610"; ctx.fillRect(x+w*0.44,y+h*0.68,w*0.12,h*0.2);
    ctx.fillStyle = "rgba(210,170,80,0.5)"; ctx.fillRect(x+w*0.47,y+h*0.73,w*0.02,h*0.04);
    return;
  }

  if (variant === "block" || variant === "tenement") {
    // ── IMMEUBLE — brique, toit plat, grille de fenêtres ─────────────
    const tall = variant === "tenement";
    ctx.fillStyle = tall ? "#7a5028" : (band>=5 ? "#686448" : "#7a5820");
    ctx.fillRect(x+pad,y+h*(tall?0.12:0.18),w-pad*2,h*(tall?0.74:0.68));
    // Toit plat + rebord
    ctx.fillStyle = tall ? "#523210" : (band>=5 ? "#504830" : "#503810");
    ctx.fillRect(x+pad*0.6,y+h*(tall?0.08:0.14),w-pad*1.2,h*0.06);
    // Cheminées
    ctx.fillStyle = "#3c2a10";
    ctx.fillRect(x+w*0.28,y+h*(tall?0.04:0.09),w*0.07,h*0.07); ctx.fillRect(x+w*0.64,y+h*(tall?0.04:0.09),w*0.07,h*0.07);
    // Grille de fenêtres
    ctx.fillStyle = lit;
    const rows=tall?4:3, cols=3;
    for (let r=0; r<rows; r++) for (let c=0; c<cols; c++)
      if ((c+r+s)%3!==0) ctx.fillRect(x+w*(0.22+c*0.22),y+h*(tall?0.2:0.26)+r*h*0.15,w*0.1,Math.max(1,h*0.08));
    // Porte
    ctx.fillStyle = "rgba(18,10,3,0.7)"; ctx.fillRect(x+w*0.43,y+h*(tall?0.78:0.74),w*0.14,h*0.08);
    // Ombre côté droit
    ctx.fillStyle = "rgba(0,0,0,0.14)"; ctx.fillRect(x+w*0.72,y+h*(tall?0.12:0.18),w*0.12,h*(tall?0.74:0.68));
    return;
  }

  if (variant === "tower") {
    // ── TOUR RÉSIDENTIELLE — moderniste, bandes vitrées ───────────────
    const cBody = band>=6 ? "#585855" : band>=5 ? "#5e5a4e" : "#646058";
    ctx.fillStyle = cBody; ctx.fillRect(x+w*0.24,y+h*0.1,w*0.52,h*0.82);
    // Couronnement
    ctx.fillStyle = band>=6 ? "rgba(100,190,255,0.55)" : "#323028";
    ctx.fillRect(x+w*0.2,y+h*0.04,w*0.6,h*0.08);
    if (band>=6) { ctx.strokeStyle = "rgba(90,190,255,0.75)"; ctx.lineWidth = Math.max(1,w*0.028); ctx.beginPath(); ctx.moveTo(x+w*0.5,y+h*0.04); ctx.lineTo(x+w*0.5,y-h*0.04); ctx.stroke(); }
    // Bandes vitrées horizontales (nuit = éclairées)
    ctx.fillStyle = lit;
    const rows = band>=5 ? 8 : 5;
    for (let r=0; r<rows; r++) ctx.fillRect(x+w*0.28,y+h*(0.16+r*(0.64/rows)),w*0.44,Math.max(1,h*0.038));
    // Reflet / ombre latérale
    ctx.fillStyle = "rgba(0,0,0,0.18)"; ctx.fillRect(x+w*0.64,y+h*0.1,w*0.12,h*0.82);
    ctx.fillStyle = "rgba(255,255,255,0.07)"; ctx.fillRect(x+w*0.24,y+h*0.1,w*0.1,h*0.82);
    return;
  }

  if (variant === "megablock" || variant === "arcologyhome") {
    // ── MEGABLOCK / ARCO-HOME — haute densité futuriste ───────────────
    const tech = variant === "arcologyhome";
    ctx.fillStyle = tech ? "#485060" : "#525046";
    ctx.fillRect(x+w*0.08,y+h*0.16,w*0.84,h*0.74);
    // Retraits progressifs (setbacks)
    ctx.fillStyle = tech ? "#384050" : "#424038";
    ctx.fillRect(x+w*0.14,y+h*0.08,w*0.72,h*0.1);
    ctx.fillRect(x+w*0.2,y+h*0.02,w*0.6,h*0.08);
    // Grille de fenêtres
    ctx.fillStyle = tech ? `rgba(70,190,255,${(0.45+(CM.nightF||0)*0.45).toFixed(2)})` : lit;
    const rows2=tech?6:5, cols2=tech?5:4;
    for (let r=0; r<rows2; r++) for (let c=0; c<cols2; c++)
      if (tech||(r+c+s)%4!==0) ctx.fillRect(x+w*(0.16+c*(0.68/Math.max(1,cols2-1))),y+h*(0.22+r*0.1),w*0.07,Math.max(1,h*0.04));
    if (tech) {
      ctx.strokeStyle = `rgba(50,175,240,${(0.28+(CM.nightF||0)*0.42).toFixed(2)})`; ctx.lineWidth = Math.max(0.5,w*0.018);
      ctx.beginPath(); ctx.moveTo(x+w*0.12,y+h*0.82); ctx.lineTo(x+w*0.5,y+h*0.1); ctx.lineTo(x+w*0.88,y+h*0.82); ctx.stroke();
    }
    ctx.fillStyle = "rgba(0,0,0,0.16)"; ctx.fillRect(x+w*0.74,y+h*0.16,w*0.18,h*0.74);
    return;
  }

  // fallback
  ctx.fillStyle = "#9a7426"; ctx.fillRect(x+pad,y+pad,w-pad*2,h-pad*2);
}

function drawPublicShape(type, x, y, w, h, pad, tier, variant, now) {
  const ctx = CM.ctx;
  const band = (CM.layout && CM.layout.counts) ? CM.layout.counts.eraBand : 0;
  const library = type === "library";
  const gold = library ? "#e8dcae" : "#e8c96a";
  const lit = cmLitColor(band);
  const body = library ? "#5a4a2e"
    : variant === "palace" ? "#a8893e"
    : variant === "keep" ? "#77715d"
    : band >= 5 ? "#5e5746"
    : "#9f7b2a";
  if (variant === "shrine" || variant === "firepit") {
    ctx.fillStyle = gold;
    ctx.beginPath();
    ctx.arc(x + w * 0.5, y + h * 0.52, w * 0.24, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(30,18,7,0.45)";
    ctx.fillRect(x + w * 0.38, y + h * 0.52, w * 0.24, h * 0.18);
    return;
  }
  if (variant === "keep") {
    ctx.fillStyle = body;
    ctx.fillRect(x + w * 0.2, y + h * 0.22, w * 0.6, h * 0.62);
    ctx.fillStyle = "#4a4639";
    ctx.fillRect(x + w * 0.14, y + h * 0.16, w * 0.18, h * 0.18);
    ctx.fillRect(x + w * 0.68, y + h * 0.16, w * 0.18, h * 0.18);
    return;
  }
  if (variant === "station") {
    // ── STATION CIVIQUE FUTURISTE — quai courbe, rail magnétique, écrans ──
    const t2 = now || 0;
    // Corps aérodynamique (profil en arc)
    ctx.fillStyle = "#303848";
    ctx.beginPath(); ctx.moveTo(x+w*0.08,y+h*0.72); ctx.quadraticCurveTo(x+w*0.5,y+h*0.24,x+w*0.92,y+h*0.72); ctx.lineTo(x+w*0.92,y+h*0.84); ctx.quadraticCurveTo(x+w*0.5,y+h*0.54,x+w*0.08,y+h*0.84); ctx.closePath(); ctx.fill();
    // Verrière vitrée
    ctx.fillStyle = "rgba(80,160,255,0.18)";
    ctx.beginPath(); ctx.moveTo(x+w*0.16,y+h*0.68); ctx.quadraticCurveTo(x+w*0.5,y+h*0.3,x+w*0.84,y+h*0.68); ctx.lineTo(x+w*0.84,y+h*0.74); ctx.quadraticCurveTo(x+w*0.5,y+h*0.42,x+w*0.16,y+h*0.74); ctx.closePath(); ctx.fill();
    // Rail magnétique lumineux
    const rPulse = 0.6+0.3*Math.sin(t2/350);
    ctx.strokeStyle = `rgba(60,200,255,${rPulse.toFixed(2)})`; ctx.lineWidth = Math.max(2,w*0.045); ctx.lineCap="round";
    ctx.beginPath(); ctx.moveTo(x+w*0.06,y+h*0.78); ctx.lineTo(x+w*0.94,y+h*0.78); ctx.stroke();
    ctx.lineCap="square";
    // Panneaux d'info animés
    const scA = 0.4+0.25*Math.sin(t2/500);
    ctx.fillStyle = `rgba(40,180,255,${scA.toFixed(2)})`;
    ctx.fillRect(x+w*0.2,y+h*0.32,w*0.16,h*0.1);
    ctx.fillRect(x+w*0.64,y+h*0.32,w*0.16,h*0.1);
    ctx.fillStyle = `rgba(255,200,40,${(scA*0.8).toFixed(2)})`;
    ctx.fillRect(x+w*0.42,y+h*0.3,w*0.16,h*0.12);
    // Pylônes
    ctx.fillStyle = "#5a6070";
    ctx.fillRect(x+w*0.48,y+h*0.1,w*0.04,h*0.2);
    ctx.fillStyle = `rgba(60,200,255,${(0.5+0.4*Math.sin(t2/400)).toFixed(2)})`;
    ctx.beginPath(); ctx.arc(x+w*0.5,y+h*0.1,Math.max(1.5,w*0.05),0,Math.PI*2); ctx.fill();
    return;
  }
  if (variant === "datavault") {
    // ── COFFRE DE DONNÉES — cylindre serveur, flux de données circulaires ──
    const t2 = now || 0;
    const flowA = (t2/700)%(Math.PI*2);
    // Tour cylindrique
    ctx.fillStyle = "#1e2830";
    ctx.beginPath(); ctx.arc(x+w*0.5,y+h*0.52,w*0.35,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle = "rgba(0,220,150,0.45)"; ctx.lineWidth = Math.max(1,w*0.022);
    ctx.beginPath(); ctx.arc(x+w*0.5,y+h*0.52,w*0.35,0,Math.PI*2); ctx.stroke();
    // Anneaux de données animés
    for (let ri = 0; ri < 4; ri++) {
      const alpha = 0.3+0.3*Math.sin(flowA+ri*0.8);
      ctx.strokeStyle = `rgba(0,${200+ri*15},${130+ri*20},${alpha.toFixed(2)})`; ctx.lineWidth = Math.max(0.5,w*0.016);
      ctx.beginPath(); ctx.ellipse(x+w*0.5,y+h*(0.34+ri*0.1),w*(0.26-ri*0.02),h*0.034,0,0,Math.PI*2); ctx.stroke();
    }
    // Particules de données en orbite
    const dotA = 0.7+0.3*Math.abs(Math.sin(flowA));
    ctx.fillStyle = `rgba(0,255,160,${dotA.toFixed(2)})`;
    for (let di = 0; di < 5; di++) {
      const da = flowA + di*Math.PI*2/5;
      ctx.beginPath(); ctx.arc(x+w*(0.5+Math.cos(da)*0.26),y+h*(0.52+Math.sin(da)*0.18),Math.max(1.5,w*0.032),0,Math.PI*2); ctx.fill();
    }
    // Noyau central pulsant
    ctx.fillStyle = `rgba(0,200,140,${(0.5+0.35*Math.sin(flowA*2)).toFixed(2)})`;
    ctx.beginPath(); ctx.arc(x+w*0.5,y+h*0.52,w*0.1,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = `rgba(180,255,230,${(0.7+0.3*Math.sin(flowA*3)).toFixed(2)})`;
    ctx.beginPath(); ctx.arc(x+w*0.5,y+h*0.52,w*0.04,0,Math.PI*2); ctx.fill();
    return;
  }
  if (variant === "observatory") {
    // ── OBSERVATOIRE FUTURISTE — dôme, antenne scan rotative ──────────────
    const t2 = now || 0;
    const scanA = (t2/2200)%(Math.PI*2);
    // Base hexagonale
    ctx.fillStyle = "#2e3544";
    ctx.beginPath();
    for (let i=0; i<6; i++) { const a=i*Math.PI/3; const px2=x+w*(0.5+Math.cos(a)*0.42),py2=y+h*(0.62+Math.sin(a)*0.3); if(i===0)ctx.moveTo(px2,py2);else ctx.lineTo(px2,py2); }
    ctx.closePath(); ctx.fill();
    // Dôme vitré
    ctx.fillStyle = "rgba(80,110,200,0.28)";
    ctx.beginPath(); ctx.arc(x+w*0.5,y+h*0.52,w*0.3,Math.PI,0); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(140,180,255,0.65)"; ctx.lineWidth = Math.max(0.5,w*0.022);
    ctx.beginPath(); ctx.arc(x+w*0.5,y+h*0.52,w*0.3,Math.PI,0); ctx.stroke();
    // Nervures du dôme
    for (let ni=1; ni<4; ni++) { const na=Math.PI*(ni/4);
      ctx.strokeStyle = "rgba(100,150,220,0.35)"; ctx.lineWidth = Math.max(0.5,w*0.014);
      ctx.beginPath(); ctx.moveTo(x+w*0.5,y+h*0.52); ctx.lineTo(x+w*(0.5+Math.cos(na)*0.3),y+h*(0.52-Math.sin(na)*0.22)); ctx.stroke();
    }
    // Bras d'antenne rotatif
    const armX = x+w*(0.5+Math.cos(scanA-Math.PI/2)*0.22), armY = y+h*(0.52+Math.sin(scanA-Math.PI/2)*0.16);
    ctx.strokeStyle = "#7088a0"; ctx.lineWidth = Math.max(1,w*0.03); ctx.lineCap="round";
    ctx.beginPath(); ctx.moveTo(x+w*0.5,y+h*0.52); ctx.lineTo(armX,armY); ctx.stroke();
    ctx.lineCap="square";
    // Capteur parabolique
    ctx.fillStyle = "#a0b8cc";
    ctx.beginPath(); ctx.arc(armX,armY,Math.max(2,w*0.08),0,Math.PI*2); ctx.fill();
    // Faisceau de scan
    ctx.fillStyle = `rgba(100,200,255,${(0.5+0.4*Math.abs(Math.sin(scanA))).toFixed(2)})`;
    ctx.beginPath(); ctx.arc(armX,armY,Math.max(1.5,w*0.05),0,Math.PI*2); ctx.fill();
    return;
  }
  if (variant === "spire" || variant === "archive") {
    // ── FLÈCHE ADMIN / ARCHIVES — tour élancée cyberpunk ─────────────────
    const t2 = now || 0;
    const isArchive = variant === "archive";
    // Corps principal à setbacks
    const bCol = isArchive ? "#2a3848" : "#3a4050";
    ctx.fillStyle = bCol; ctx.fillRect(x+w*0.36,y+h*0.18,w*0.28,h*0.72);
    ctx.fillStyle = isArchive ? "#242f3c" : "#303848";
    ctx.fillRect(x+w*0.28,y+h*0.32,w*0.44,h*0.56);
    ctx.fillRect(x+w*0.2,y+h*0.5,w*0.6,h*0.38);
    // Ombre latérale
    ctx.fillStyle = "rgba(0,0,0,0.2)"; ctx.fillRect(x+w*0.64,y+h*0.18,w*0.12,h*0.72);
    // Bandes LED horizontales
    const ledCol = isArchive ? "rgba(255,160,40," : "rgba(60,180,255,";
    for (let li=0; li<5; li++) {
      const lAlpha = 0.4+0.3*Math.sin(t2/400+li*0.7);
      ctx.fillStyle = ledCol+lAlpha.toFixed(2)+")";
      ctx.fillRect(x+w*0.22,y+h*(0.52+li*0.07),w*0.56,Math.max(1,h*0.022));
    }
    // Fenêtres grille
    ctx.fillStyle = lit;
    for (let ri=0; ri<4; ri++) for (let ci=0; ci<2; ci++)
      ctx.fillRect(x+w*(0.3+ci*0.22),y+h*(0.22+ri*0.07),w*0.1,Math.max(1,h*0.042));
    if (isArchive) {
      // Disques de stockage (hologramme)
      ctx.strokeStyle = `rgba(255,180,60,${(0.45+0.3*Math.sin(t2/600)).toFixed(2)})`; ctx.lineWidth = Math.max(0.5,w*0.018);
      ctx.beginPath(); ctx.ellipse(x+w*0.5,y+h*0.75,w*0.2,h*0.06,0,0,Math.PI*2); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(x+w*0.5,y+h*0.75,w*0.12,h*0.036,0,0,Math.PI*2); ctx.stroke();
    } else {
      // Spire pointue avec clignotant
      ctx.fillStyle = "#c0d0e0";
      ctx.beginPath(); ctx.moveTo(x+w*0.44,y+h*0.18); ctx.lineTo(x+w*0.5,y+h*0.04); ctx.lineTo(x+w*0.56,y+h*0.18); ctx.closePath(); ctx.fill();
      ctx.fillStyle = `rgba(255,80,80,${(0.5+0.5*Math.abs(Math.sin(t2/700))).toFixed(2)})`;
      ctx.beginPath(); ctx.arc(x+w*0.5,y+h*0.04,Math.max(1.5,w*0.04),0,Math.PI*2); ctx.fill();
    }
    return;
  }
  // Batiment a colonnes (temple / marche / forum / hall / academie / palais)
  ctx.fillStyle = body;
  ctx.fillRect(x + pad, y + h * 0.26, w - pad * 2, h * 0.6);
  ctx.fillStyle = gold;                           // fronton triangulaire
  ctx.beginPath();
  ctx.moveTo(x + pad * 0.7, y + h * 0.26);
  ctx.lineTo(x + w * 0.5, y + h * 0.1);
  ctx.lineTo(x + w - pad * 0.7, y + h * 0.26);
  ctx.closePath();
  ctx.fill();
  const columns = tier >= 5 || variant === "palace" ? 5 : 3;
  ctx.fillStyle = "rgba(20,12,5,0.62)";
  for (let ci = 0; ci < columns; ci += 1) {
    const cx = x + w * (0.22 + ci * (0.56 / Math.max(1, columns - 1)));
    ctx.fillRect(cx - w * 0.025, y + h * 0.36, w * 0.05, h * 0.42);
  }
  if (variant === "palace" || variant === "temple" || variant === "forum" || band >= 4) {
    ctx.fillStyle = library ? "#e8dcae" : "#c0402f"; // banniere
    ctx.fillRect(x + w * 0.46, y + h * 0.28, w * 0.08, h * 0.3);
  }
  if (variant === "palace" || variant === "academy" || tier >= 6) {
    ctx.strokeStyle = gold;
    ctx.lineWidth = Math.max(1, w * 0.04);
    ctx.strokeRect(x + w * 0.16, y + h * 0.22, w * 0.68, h * 0.62);
  }
}

function drawEngineSprite(t, x, y, w, h, now) {
  const ctx = CM.ctx;
  const id = t.buildingId || t.variant;
  const tier = t.tier || 0;
  const night = CM.nightF || 0;
  const litWarm = `rgba(255,204,68,${(0.25 + night * 0.65).toFixed(2)})`;
  const litGold = `rgba(255,220,120,${(0.35 + night * 0.6).toFixed(2)})`;
  const ox = x, oy = y, sw = w, sh = h;
  const px = (rx, ry, rw, rh, col) => { ctx.fillStyle = col; ctx.fillRect(ox + sw * rx, oy + sh * ry, sw * rw, sh * rh); };
  const strokeRect = (rx, ry, rw, rh, col) => { ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, sw * 0.025); ctx.strokeRect(ox + sw * rx, oy + sh * ry, sw * rw, sh * rh); };
  ctx.fillStyle = "rgba(0,0,0,0.26)";
  ctx.beginPath();
  ctx.ellipse(x + w * 0.5, y + h * 0.84, w * 0.42, h * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();

  if (id === "storytellers") {
    // Sol
    px(0.0, 0.58, 1.0, 0.42, "#16100a");

    // === FEU DE CAMP (droite) ===
    const fx = 0.66, fy = 0.66;
    // Pierres du foyer
    ctx.fillStyle = "#3a2e20";
    for (const [da, dr] of [[0,0.09],[ 1.0,0.09],[ 2.1,0.085],[ 3.2,0.09],[ 4.3,0.085],[ 5.4,0.09]]) {
      ctx.beginPath(); ctx.arc(ox + sw*(fx + Math.cos(da)*0.1), oy + sh*(fy + Math.sin(da)*0.065), sw*dr*0.38, 0, Math.PI*2); ctx.fill();
    }
    // Bûches en croix
    ctx.lineWidth = Math.max(1.5, sw * 0.05); ctx.lineCap = "round";
    ctx.strokeStyle = "#6a3c10";
    ctx.beginPath(); ctx.moveTo(ox+sw*(fx-0.14), oy+sh*(fy+0.04)); ctx.lineTo(ox+sw*(fx+0.14), oy+sh*(fy-0.04)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ox+sw*(fx+0.14), oy+sh*(fy+0.04)); ctx.lineTo(ox+sw*(fx-0.14), oy+sh*(fy-0.04)); ctx.stroke();
    ctx.lineCap = "square";
    // Braises
    ctx.fillStyle = "rgba(210,70,5,0.75)";
    ctx.beginPath(); ctx.ellipse(ox+sw*fx, oy+sh*(fy-0.01), sw*0.11, sh*0.04, 0, 0, Math.PI*2); ctx.fill();
    // Flammes (3 langues animées)
    const f1 = 0.5+0.5*Math.sin(now/190), f2 = 0.5+0.5*Math.sin(now/160+1.5), f3 = 0.5+0.5*Math.sin(now/220+2.9);
    ctx.fillStyle = `rgba(255,90,8,${(0.72+f1*0.28).toFixed(2)})`;
    ctx.beginPath(); ctx.moveTo(ox+sw*(fx-0.08), oy+sh*(fy-0.02)); ctx.quadraticCurveTo(ox+sw*(fx-0.14), oy+sh*(fy-0.14-f1*0.07), ox+sw*(fx-0.04), oy+sh*(fy-0.19-f1*0.05)); ctx.quadraticCurveTo(ox+sw*(fx+0.01), oy+sh*(fy-0.08), ox+sw*(fx+0.04), oy+sh*(fy-0.02)); ctx.closePath(); ctx.fill();
    ctx.fillStyle = `rgba(255,195,15,${(0.78+f2*0.22).toFixed(2)})`;
    ctx.beginPath(); ctx.moveTo(ox+sw*(fx-0.06), oy+sh*(fy-0.02)); ctx.quadraticCurveTo(ox+sw*(fx-0.01), oy+sh*(fy-0.2-f2*0.1), ox+sw*fx, oy+sh*(fy-0.25-f2*0.07)); ctx.quadraticCurveTo(ox+sw*(fx+0.01), oy+sh*(fy-0.12), ox+sw*(fx+0.06), oy+sh*(fy-0.02)); ctx.closePath(); ctx.fill();
    ctx.fillStyle = `rgba(255,130,15,${(0.7+f3*0.3).toFixed(2)})`;
    ctx.beginPath(); ctx.moveTo(ox+sw*(fx+0.04), oy+sh*(fy-0.02)); ctx.quadraticCurveTo(ox+sw*(fx+0.12), oy+sh*(fy-0.12-f3*0.06), ox+sw*(fx+0.06), oy+sh*(fy-0.17-f3*0.05)); ctx.quadraticCurveTo(ox+sw*(fx+0.01), oy+sh*(fy-0.07), ox+sw*(fx-0.03), oy+sh*(fy-0.02)); ctx.closePath(); ctx.fill();
    // Halo rayonnant
    const halo = 0.28 + 0.18*Math.abs(Math.sin(now/520));
    const rg = ctx.createRadialGradient(ox+sw*fx, oy+sh*fy, 0, ox+sw*fx, oy+sh*fy, sw*0.36);
    rg.addColorStop(0, `rgba(255,170,40,${halo.toFixed(2)})`); rg.addColorStop(1, "rgba(255,90,10,0)");
    ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(ox+sw*fx, oy+sh*fy, sw*0.36, 0, Math.PI*2); ctx.fill();

    // === LIVRE OUVERT (gauche) ===
    const bx = 0.1, by = 0.58, bw = 0.32, bh = 0.22;
    ctx.fillStyle = "rgba(0,0,0,0.28)"; ctx.beginPath(); ctx.ellipse(ox+sw*(bx+bw*0.5), oy+sh*(by+bh+0.025), sw*bw*0.52, sh*0.04, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = "#5a2e06"; ctx.fillRect(ox+sw*(bx-0.012), oy+sh*(by-0.01), sw*(bw+0.024), sh*(bh+0.02));
    ctx.fillStyle = "#e8daaa"; ctx.fillRect(ox+sw*bx, oy+sh*by, sw*(bw*0.47), sh*bh);
    const pglo = 0.06+0.07*Math.sin(now/520);
    ctx.fillStyle = `rgba(255,155,35,${pglo.toFixed(2)})`; ctx.fillRect(ox+sw*bx, oy+sh*by, sw*(bw*0.47), sh*bh);
    ctx.fillStyle = "#f0dfc0"; ctx.fillRect(ox+sw*(bx+bw*0.53), oy+sh*by, sw*(bw*0.47), sh*bh);
    ctx.fillStyle = `rgba(255,180,60,${(pglo*1.6).toFixed(2)})`; ctx.fillRect(ox+sw*(bx+bw*0.53), oy+sh*by, sw*(bw*0.47), sh*bh);
    ctx.fillStyle = "#3a1a04"; ctx.fillRect(ox+sw*(bx+bw*0.487), oy+sh*by, sw*0.02, sh*bh);
    ctx.fillStyle = "rgba(70,45,15,0.5)";
    for (let li = 0; li < 4; li++) {
      ctx.fillRect(ox+sw*(bx+0.024), oy+sh*(by+0.038+li*0.044), sw*0.105, sh*0.014);
      ctx.fillRect(ox+sw*(bx+bw*0.555), oy+sh*(by+0.038+li*0.044), sw*0.105, sh*0.014);
    }

    // === PERSONNAGE ASSIS (centre) ===
    const cx2 = 0.46, cy2 = 0.54;
    ctx.fillStyle = "#2c1c0c"; ctx.fillRect(ox+sw*(cx2-0.032), oy+sh*(cy2+0.04), sw*0.064, sh*0.09);
    ctx.fillStyle = `rgba(190,130,70,${(0.7+halo*0.6).toFixed(2)})`;
    ctx.beginPath(); ctx.arc(ox+sw*cx2, oy+sh*cy2, sw*0.048, 0, Math.PI*2); ctx.fill();

    // Tier 1+ : auditeurs
    if (tier >= 1) {
      const nb = tier >= 2 ? 4 : 2;
      for (let i = 0; i < nb; i++) {
        const ang = Math.PI*0.7 + (Math.PI*0.9)*(i/Math.max(1,nb-1));
        const px2 = fx + Math.cos(ang)*0.28, py2 = fy + Math.sin(ang)*0.2;
        if (px2 < 0.04 || px2 > 0.96) continue;
        ctx.fillStyle = "#1e140a"; ctx.fillRect(ox+sw*(px2-0.028), oy+sh*(py2+0.025), sw*0.056, sh*0.075);
        ctx.fillStyle = `rgba(170,110,55,${(0.6+halo*0.5).toFixed(2)})`;
        ctx.beginPath(); ctx.arc(ox+sw*px2, oy+sh*py2, sw*0.038, 0, Math.PI*2); ctx.fill();
      }
    }
    return;
  }
  if (id === "scribes") {
    // Scriptorium : salle voûtée médiévale, scribes à la lueur des bougies
    px(0.08, 0.34, 0.84, 0.48, "#705230");
    ctx.fillStyle = "#4a3218";
    ctx.beginPath(); ctx.moveTo(ox+sw*0.06, oy+sh*0.36); ctx.lineTo(ox+sw*0.5, oy+sh*0.14); ctx.lineTo(ox+sw*0.94, oy+sh*0.36); ctx.closePath(); ctx.fill();
    px(0.06, 0.33, 0.88, 0.05, "#382410");
    const nWin = 2 + Math.min(tier, 2);
    for (let i = 0; i < nWin; i++) {
      const wx = 0.17 + i * (0.66 / Math.max(1, nWin - 1));
      ctx.fillStyle = "rgba(0,0,0,0.55)"; ctx.fillRect(ox+sw*(wx-0.036), oy+sh*0.40, sw*0.072, sh*0.16);
      ctx.fillStyle = "#1a1008"; ctx.beginPath(); ctx.arc(ox+sw*wx, oy+sh*0.40, sw*0.036, Math.PI, 0); ctx.fill();
      ctx.fillStyle = litWarm; ctx.beginPath(); ctx.arc(ox+sw*wx, oy+sh*0.40, sw*0.020, Math.PI, 0); ctx.fill();
      ctx.fillRect(ox+sw*(wx-0.016), oy+sh*0.40, sw*0.032, sh*0.12);
    }
    const nT = 2 + tier;
    for (let i = 0; i < nT && i < 4; i++) {
      const tx = 0.14 + (i % 2) * 0.44, ty = 0.56 + Math.floor(i / 2) * 0.10;
      px(tx, ty, 0.22, 0.07, "#c8b882");
      ctx.fillStyle = "rgba(40,22,6,0.55)"; ctx.beginPath(); ctx.arc(ox+sw*(tx+0.11), oy+sh*(ty-0.025), sw*0.022, 0, Math.PI*2); ctx.fill();
    }
    px(0.44, 0.64, 0.12, 0.18, "#1e1006");
    return;
  }
  if (id === "schools") {
    // École : cour à colonnades, rangées d'élèves, maître à l'avant
    px(0.08, 0.26, 0.84, 0.50, "#b8944a");
    ctx.fillStyle = "#6a4a10";
    ctx.beginPath(); ctx.moveTo(ox+sw*0.06, oy+sh*0.28); ctx.lineTo(ox+sw*0.5, oy+sh*0.08); ctx.lineTo(ox+sw*0.94, oy+sh*0.28); ctx.closePath(); ctx.fill();
    px(0.20, 0.38, 0.60, 0.26, "#d4b86a");
    px(0.36, 0.34, 0.28, 0.06, "#c8a85a");
    const nRows = 1 + Math.min(tier, 2);
    for (let row = 0; row < nRows; row++) {
      for (let c = 0; c < 4; c++) {
        ctx.fillStyle = "rgba(60,38,14,0.6)";
        ctx.beginPath(); ctx.arc(ox+sw*(0.26+c*0.14), oy+sh*(0.50+row*0.08), sw*0.018, 0, Math.PI*2); ctx.fill();
      }
    }
    ctx.fillStyle = "#2a1408"; ctx.beginPath(); ctx.arc(ox+sw*0.5, oy+sh*0.43, sw*0.026, 0, Math.PI*2); ctx.fill();
    const nCol = 3 + Math.min(tier, 2);
    for (let i = 0; i < nCol; i++) px(0.14 + i * (0.72 / Math.max(1, nCol - 1)) - 0.014, 0.28, 0.028, 0.14, "rgba(30,20,8,0.42)");
    px(0.44, 0.62, 0.12, 0.16, "#1e1006");
    return;
  }
  if (id === "academies") {
    // Académie : péristyle, jardin, philosophes en cercle de discussion
    px(0.06, 0.28, 0.88, 0.52, "#d4c5a0");
    ctx.fillStyle = "#b8a882";
    ctx.beginPath(); ctx.moveTo(ox+sw*0.04, oy+sh*0.30); ctx.lineTo(ox+sw*0.5, oy+sh*0.08); ctx.lineTo(ox+sw*0.96, oy+sh*0.30); ctx.closePath(); ctx.fill();
    px(0.06, 0.27, 0.88, 0.05, "#9a8860");
    const nCol = 4 + Math.min(tier, 2);
    for (let i = 0; i < nCol; i++) px(0.12 + i * (0.76 / Math.max(1, nCol - 1)) - 0.014, 0.32, 0.028, 0.42, "rgba(30,20,8,0.38)");
    px(0.22, 0.44, 0.56, 0.22, "#c4b890");
    const nPhil = 4 + tier;
    for (let i = 0; i < nPhil; i++) {
      const a = (i / nPhil) * Math.PI * 2;
      ctx.fillStyle = "rgba(50,32,10,0.65)";
      ctx.beginPath(); ctx.arc(ox+sw*(0.5+Math.cos(a)*0.14), oy+sh*(0.56+Math.sin(a)*0.075), sw*0.022, 0, Math.PI*2); ctx.fill();
    }
    px(0.46, 0.48, 0.08, 0.10, "#b0a070");
    px(0.44, 0.66, 0.12, 0.14, "#1e1408");
    strokeRect(0.06, 0.28, 0.88, 0.52, "#c0b090");
    return;
  }
  if (id === "ancestral_cult") {
    // Culte des ancêtres : mégalithes en cercle, autel central, flamme rituelle
    px(0.0, 0.48, 1.0, 0.52, "#2e2416");
    const nStones = 5 + Math.min(tier, 3);
    for (let i = 0; i < nStones; i++) {
      const a = (i / nStones) * Math.PI * 2;
      const sx2 = 0.5 + Math.cos(a) * 0.34, sy2 = 0.62 + Math.sin(a) * 0.20;
      const sth = 0.10 + (i * 37 % 3) * 0.04;
      ctx.fillStyle = "#6a5a48"; ctx.fillRect(ox+sw*(sx2-0.024), oy+sh*(sy2-sth), sw*0.048, sh*sth);
      ctx.fillStyle = "rgba(180,160,120,0.38)"; ctx.fillRect(ox+sw*(sx2-0.022), oy+sh*(sy2-sth), sw*0.020, sh*sth);
    }
    px(0.46, 0.54, 0.08, 0.46, "#4a3c2a");
    px(0.40, 0.60, 0.20, 0.08, "#786040");
    const af1 = 0.5 + 0.5 * Math.sin(now / 180), af2 = 0.5 + 0.5 * Math.sin(now / 150 + 1.2);
    ctx.fillStyle = `rgba(255,120,10,${(0.7+af1*0.3).toFixed(2)})`;
    ctx.beginPath(); ctx.moveTo(ox+sw*0.46, oy+sh*0.62); ctx.quadraticCurveTo(ox+sw*0.42, oy+sh*(0.46-af1*0.06), ox+sw*0.50, oy+sh*(0.40-af1*0.05)); ctx.quadraticCurveTo(ox+sw*0.58, oy+sh*(0.46-af2*0.05), ox+sw*0.54, oy+sh*0.62); ctx.closePath(); ctx.fill();
    ctx.fillStyle = `rgba(255,210,40,${(0.65+af2*0.25).toFixed(2)})`;
    ctx.beginPath(); ctx.moveTo(ox+sw*0.48, oy+sh*0.62); ctx.quadraticCurveTo(ox+sw*0.45, oy+sh*(0.50-af2*0.08), ox+sw*0.50, oy+sh*(0.44-af2*0.06)); ctx.quadraticCurveTo(ox+sw*0.55, oy+sh*(0.50-af1*0.05), ox+sw*0.52, oy+sh*0.62); ctx.closePath(); ctx.fill();
    if (night > 0.2) {
      const hg = ctx.createRadialGradient(ox+sw*0.5, oy+sh*0.60, 0, ox+sw*0.5, oy+sh*0.60, sw*0.36);
      hg.addColorStop(0, `rgba(255,155,30,${(0.22*night).toFixed(2)})`); hg.addColorStop(1, "rgba(255,90,5,0)");
      ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(ox+sw*0.5, oy+sh*0.60, sw*0.36, 0, Math.PI*2); ctx.fill();
    }
    if (tier >= 1) {
      for (let i = 0; i < 2 + tier; i++) {
        const a = -Math.PI / 2 + (i / (1 + tier)) * Math.PI;
        ctx.fillStyle = "#d4c8a0"; ctx.beginPath(); ctx.arc(ox+sw*(0.5+Math.cos(a)*0.18), oy+sh*(0.61+Math.sin(a)*0.04), sw*0.022, 0, Math.PI*2); ctx.fill();
      }
    }
    return;
  }
  if (id === "observatories") {
    // Observatoire : dôme avec fente animée, bras de télescope pivotant, rose des vents
    ctx.fillStyle = "#3a3050"; ctx.beginPath(); ctx.ellipse(ox+sw*0.5, oy+sh*0.64, sw*0.42, sh*0.18, 0, 0, Math.PI*2); ctx.fill();
    px(0.36, 0.24, 0.28, 0.40, "#2a2840");
    ctx.fillStyle = "#3c3860"; ctx.beginPath(); ctx.arc(ox+sw*0.5, oy+sh*0.24, sw*0.18, Math.PI, 0); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(150,160,220,0.6)"; ctx.lineWidth = Math.max(1, sw*0.022);
    ctx.beginPath(); ctx.arc(ox+sw*0.5, oy+sh*0.24, sw*0.18, Math.PI, 0); ctx.stroke();
    const slitA = (now / 3200) % Math.PI;
    ctx.strokeStyle = "#0a0818"; ctx.lineWidth = Math.max(2, sw*0.030);
    ctx.beginPath(); ctx.arc(ox+sw*0.5, oy+sh*0.24, sw*0.18, Math.PI + slitA, Math.PI + slitA + 0.38); ctx.stroke();
    const telA = slitA - Math.PI / 2;
    ctx.strokeStyle = "#8090a0"; ctx.lineWidth = Math.max(1.5, sw*0.028); ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(ox+sw*0.5, oy+sh*0.24); ctx.lineTo(ox+sw*(0.5+Math.cos(telA)*0.15), oy+sh*(0.24+Math.sin(telA)*0.11)); ctx.stroke();
    ctx.lineCap = "square";
    ctx.fillStyle = "#a0b0c0"; ctx.beginPath(); ctx.arc(ox+sw*(0.5+Math.cos(telA)*0.16), oy+sh*(0.24+Math.sin(telA)*0.12), Math.max(1.5, sw*0.036), 0, Math.PI*2); ctx.fill();
    const pulse = 0.4 + Math.abs(Math.sin(now / 800)) * 0.5;
    ctx.fillStyle = `rgba(107,182,255,${pulse.toFixed(2)})`; ctx.beginPath(); ctx.arc(ox+sw*0.5, oy+sh*0.22, sw*0.055, 0, Math.PI*2); ctx.fill();
    if (tier >= 1) {
      ctx.strokeStyle = "rgba(140,160,200,0.32)"; ctx.lineWidth = Math.max(0.5, sw*0.013);
      for (let i = 0; i < 4; i++) {
        const a2 = i * Math.PI / 2;
        ctx.beginPath(); ctx.moveTo(ox+sw*0.5, oy+sh*0.64); ctx.lineTo(ox+sw*(0.5+Math.cos(a2)*0.36), oy+sh*(0.64+Math.sin(a2)*0.14)); ctx.stroke();
      }
    }
    if (tier >= 2) { px(0.68, 0.38, 0.18, 0.24, "#2a2840"); px(0.68, 0.32, 0.18, 0.08, "#3c3860"); }
    return;
  }
  if (id === "libraries") {
    // Bibliothèque : hall néoclassique, rayonnages colorés par rangées, lecteurs aux tables
    px(0.08, 0.26, 0.84, 0.54, "#c8b882");
    ctx.fillStyle = "#b0a070";
    ctx.beginPath(); ctx.moveTo(ox+sw*0.06, oy+sh*0.28); ctx.lineTo(ox+sw*0.5, oy+sh*0.08); ctx.lineTo(ox+sw*0.94, oy+sh*0.28); ctx.closePath(); ctx.fill();
    px(0.06, 0.25, 0.88, 0.05, "#7a6434");
    const lCols = 4 + Math.min(tier, 2);
    for (let i = 0; i < lCols; i++) px(0.13 + i * (0.74 / Math.max(1, lCols - 1)) - 0.014, 0.30, 0.028, 0.42, "rgba(30,20,8,0.42)");
    const spines = ["#9c3b2f", "#7a5c2a", "#3a6a3a", "#b58f3a", "#8a4a6a", "#4a5a8a", "#c07a30"];
    const nShelves = 2 + Math.min(tier, 2);
    for (let row = 0; row < nShelves; row++) {
      for (let i = 0; i < 6; i++) px(0.18 + i * 0.108, 0.36 + row * 0.10, 0.088, 0.07, spines[(i + row) % spines.length]);
    }
    for (let i = 0; i < 1 + tier; i++) {
      px(0.22 + i * 0.22, 0.66, 0.14, 0.06, "#d8c898");
      ctx.fillStyle = "rgba(40,24,8,0.55)"; ctx.beginPath(); ctx.arc(ox+sw*(0.29+i*0.22), oy+sh*0.64, sw*0.018, 0, Math.PI*2); ctx.fill();
    }
    px(0.44, 0.60, 0.12, 0.20, "#2e1e0a");
    return;
  }
  if (id === "universities") {
    const band = CM.layout?.counts?.eraBand ?? 0;
    const t2 = now || 0;

    if (band <= 3) {
      // ── ÈRE MÉDIÉVALE/RENAISSANCE — quadrangle gothique, clocher, cour herbeuse ──
      // Pelouse de la cour
      px(0.0, 0.0, 1.0, 1.0, band >= 2 ? "#a89a60" : "#9a8e58");
      // Corps principal (4 ailes autour de la cour)
      const wallCol = band >= 2 ? "#c0a870" : "#b09860";
      px(0.06, 0.12, 0.88, 0.12, wallCol); // aile nord
      px(0.06, 0.76, 0.88, 0.12, wallCol); // aile sud
      px(0.06, 0.12, 0.12, 0.76, wallCol); // aile ouest
      px(0.82, 0.12, 0.12, 0.76, wallCol); // aile est
      // Cour intérieure (herbe)
      px(0.18, 0.24, 0.64, 0.52, band >= 2 ? "#5a7830" : "#4a6a28");
      // Allées en croix dans la cour
      px(0.18, 0.48, 0.64, 0.04, "#a89460"); px(0.48, 0.24, 0.04, 0.52, "#a89460");
      // Arbre central
      ctx.fillStyle = band >= 2 ? "#2a6018" : "#1e5014";
      ctx.beginPath(); ctx.arc(ox+sw*0.5, oy+sh*0.50, sw*0.078, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = band >= 2 ? "#1c4a10" : "#163c0c";
      ctx.beginPath(); ctx.arc(ox+sw*0.5, oy+sh*0.50, sw*0.038, 0, Math.PI*2); ctx.fill();
      // Clocher (nord-centre)
      const towerCol = band >= 2 ? "#8a7040" : "#7a6038";
      px(0.44, 0.0, 0.12, 0.16, towerCol);
      px(0.42, 0.0, 0.16, 0.04, "#5a4020");
      // Aiguille du clocher
      ctx.fillStyle = band >= 2 ? "#c8a850" : "#a88840";
      ctx.beginPath(); ctx.moveTo(ox+sw*0.5, oy-sh*0.04); ctx.lineTo(ox+sw*0.46, oy+sh*0.03); ctx.lineTo(ox+sw*0.54, oy+sh*0.03); ctx.closePath(); ctx.fill();
      // Cloche (point lumineux)
      ctx.fillStyle = litGold; ctx.beginPath(); ctx.arc(ox+sw*0.5, oy+sh*0.08, sw*0.028, 0, Math.PI*2); ctx.fill();
      // Fenêtres gothiques dans les ailes (en arc brisé)
      ctx.fillStyle = litWarm;
      const winY = [0.14, 0.14, 0.14]; const winX = [0.22, 0.38, 0.54, 0.70];
      for (const wx of winX) { ctx.fillRect(ox+sw*wx, oy+sh*0.14, sw*0.06, sh*0.06); ctx.beginPath(); ctx.arc(ox+sw*(wx+0.03), oy+sh*0.14, sw*0.03, Math.PI, 0); ctx.fill(); }
      // Portail principal (sud)
      px(0.44, 0.76, 0.12, 0.09, "#3a2810");
      ctx.beginPath(); ctx.arc(ox+sw*0.5, oy+sh*0.76, sw*0.06, Math.PI, 0); ctx.fillStyle="#3a2810"; ctx.fill();
      // Tier 1 : chapelle annexe (est)
      if (tier >= 1) {
        px(0.80, 0.28, 0.14, 0.44, "#b8a260");
        ctx.fillStyle = "#7a6030";
        ctx.beginPath(); ctx.moveTo(ox+sw*0.87, oy+sh*0.22); ctx.lineTo(ox+sw*0.94, oy+sh*0.28); ctx.lineTo(ox+sw*0.80, oy+sh*0.28); ctx.closePath(); ctx.fill();
        ctx.fillStyle = litWarm; ctx.fillRect(ox+sw*0.84, oy+sh*0.36, sw*0.06, sh*0.08);
      }
      // Tier 2 : salle de lecture avec verrière bleue (ouest)
      if (tier >= 2) {
        px(0.06, 0.28, 0.14, 0.44, "#9a8258");
        ctx.fillStyle = "rgba(100,140,200,0.38)"; ctx.fillRect(ox+sw*0.08, oy+sh*0.30, sw*0.10, sh*0.40);
        ctx.strokeStyle = "rgba(160,200,255,0.55)"; ctx.lineWidth = Math.max(0.5, sw*0.012);
        for (let li = 1; li < 4; li++) { ctx.beginPath(); ctx.moveTo(ox+sw*0.08, oy+sh*(0.30+li*0.10)); ctx.lineTo(ox+sw*0.18, oy+sh*(0.30+li*0.10)); ctx.stroke(); }
        // Lueur chaude la nuit (lampes dans la bibliothèque)
        if (night > 0.3) {
          ctx.fillStyle = `rgba(255,200,80,${(night*0.22).toFixed(2)})`;
          ctx.fillRect(ox+sw*0.08, oy+sh*0.30, sw*0.10, sh*0.40);
        }
      }

    } else if (band <= 5) {
      // ── ÈRE INDUSTRIELLE/MODERNE — campus néoclassique, bâtiments en brique ──
      const brickCol = band >= 5 ? "#8a7058" : "#9a7848";
      // Sol du campus (gris-vert)
      px(0.0, 0.0, 1.0, 1.0, band >= 5 ? "#6a7058" : "#786838");
      // Bâtiment principal (façade néoclassique)
      px(0.08, 0.16, 0.84, 0.58, brickCol);
      ctx.fillStyle = "#5a4a38"; ctx.fillRect(ox+sw*0.06, oy+sh*0.10, sw*0.88, sh*0.08);
      // Fronton triangulaire
      ctx.fillStyle = band >= 5 ? "#7a8868" : "#b89050";
      ctx.beginPath(); ctx.moveTo(ox+sw*0.08, oy+sh*0.18); ctx.lineTo(ox+sw*0.5, oy+sh*0.04); ctx.lineTo(ox+sw*0.92, oy+sh*0.18); ctx.closePath(); ctx.fill();
      // Colonnes
      ctx.fillStyle = band >= 5 ? "#c8c8b0" : "#d4c080";
      const nCols = 4 + tier;
      for (let ci = 0; ci < nCols; ci++) { ctx.fillRect(ox+sw*(0.14+ci*(0.72/(nCols-1)))-sw*0.022, oy+sh*0.18, sw*0.044, sh*0.56); }
      // Escalier d'entrée
      for (let si = 0; si < 3; si++) { px(0.28+si*0.04, 0.74-si*0.02, 0.44-si*0.08, 0.04, band>=5?"#b0a888":"#c8aa60"); }
      // Portail central
      px(0.44, 0.54, 0.12, 0.22, "#2a1e0e");
      ctx.beginPath(); ctx.arc(ox+sw*0.5, oy+sh*0.54, sw*0.06, Math.PI, 0); ctx.fillStyle="#2a1e0e"; ctx.fill();
      // Grilles de fenêtres
      ctx.fillStyle = litWarm;
      const fRows = tier >= 1 ? 3 : 2;
      for (let r = 0; r < fRows; r++) for (let c = 0; c < 5; c++) {
        if (c === 2 && r === fRows-1) continue; // porte centrale
        ctx.fillRect(ox+sw*(0.16+c*0.14), oy+sh*(0.22+r*0.10), sw*0.08, sh*0.07);
        ctx.beginPath(); ctx.arc(ox+sw*(0.16+c*0.14+0.04), oy+sh*(0.22+r*0.10), sw*0.04, Math.PI, 0); ctx.fill();
      }
      // Tier 1 : aile de laboratoire (droite)
      if (tier >= 1) {
        px(0.78, 0.28, 0.22, 0.46, band>=5?"#7a8060":"#8a7048");
        ctx.fillStyle = litWarm;
        for (let ri = 0; ri < 3; ri++) ctx.fillRect(ox+sw*0.82, oy+sh*(0.30+ri*0.12), sw*0.12, sh*0.08);
        // Cheminée de labo
        px(0.84, 0.14, 0.06, 0.16, "#504838");
        const smoke2 = ((t2/1100) % 1);
        ctx.fillStyle = `rgba(100,90,75,${((1-smoke2)*0.3).toFixed(2)})`;
        ctx.beginPath(); ctx.arc(ox+sw*0.87, oy+sh*(0.12-smoke2*0.12), sw*(0.03+smoke2*0.04), 0, Math.PI*2); ctx.fill();
      }
      // Tier 2 : coupole d'observatoire (toit)
      if (tier >= 2) {
        ctx.fillStyle = band >= 5 ? "#7890a8" : "#9090b8";
        ctx.beginPath(); ctx.arc(ox+sw*0.5, oy+sh*0.04, sw*0.14, Math.PI, 0); ctx.fill();
        const domeGlow = 0.4 + 0.25*Math.abs(Math.sin(t2/900));
        ctx.strokeStyle = `rgba(160,200,255,${domeGlow.toFixed(2)})`; ctx.lineWidth = Math.max(1, sw*0.022);
        ctx.beginPath(); ctx.arc(ox+sw*0.5, oy+sh*0.04, sw*0.14, Math.PI, 0); ctx.stroke();
      }
      // Lueur nocturne
      if (night > 0.25) {
        ctx.fillStyle = `rgba(255,200,100,${(night*0.18).toFixed(2)})`;
        ctx.fillRect(ox+sw*0.08, oy+sh*0.16, sw*0.84, sh*0.58);
      }

    } else {
      // ── ÈRE FUTURISTE — campus technologique, verre et lumière ──
      const techPulse = 0.5 + 0.35*Math.abs(Math.sin(t2/800));
      // Dalle du campus (gris-bleu)
      px(0.0, 0.0, 1.0, 1.0, "#424850");
      // Grille de sol
      ctx.strokeStyle = "rgba(80,120,160,0.22)"; ctx.lineWidth = Math.max(0.5, sw*0.010);
      for (let gi = 1; gi < 5; gi++) { ctx.beginPath(); ctx.moveTo(ox+sw*gi*0.2, oy); ctx.lineTo(ox+sw*gi*0.2, oy+sh); ctx.stroke(); ctx.beginPath(); ctx.moveTo(ox, oy+sh*gi*0.2); ctx.lineTo(ox+sw, oy+sh*gi*0.2); ctx.stroke(); }
      // Tour centrale de recherche (verre bleu-gris)
      px(0.32, 0.04, 0.36, 0.78, "#2a3848");
      ctx.fillStyle = `rgba(60,130,220,${(0.12+night*0.18).toFixed(2)})`;
      ctx.fillRect(ox+sw*0.32, oy+sh*0.04, sw*0.36, sh*0.78);
      // Reflet de façade
      ctx.fillStyle = "rgba(180,210,255,0.10)"; ctx.fillRect(ox+sw*0.33, oy+sh*0.04, sw*0.08, sh*0.78);
      ctx.fillStyle = "rgba(0,0,0,0.20)"; ctx.fillRect(ox+sw*0.60, oy+sh*0.04, sw*0.08, sh*0.78);
      // Bandes vitrées horizontales (fenêtres panoramiques)
      const fRows2 = 5 + Math.min(tier, 3);
      ctx.fillStyle = litWarm;
      for (let r = 0; r < fRows2; r++) ctx.fillRect(ox+sw*0.34, oy+sh*(0.08+r*(0.64/fRows2)), sw*0.32, Math.max(1, sh*0.038));
      // Bâtiments annexes (gauche et droite)
      for (const side of [-1, 1]) {
        const bx2 = side > 0 ? 0.72 : 0.06, bw2 = 0.22;
        px(bx2, 0.32, bw2, 0.50, "#303a48");
        ctx.fillStyle = `rgba(60,120,200,${(0.08+night*0.15).toFixed(2)})`;
        ctx.fillRect(ox+sw*bx2, oy+sh*0.32, sw*bw2, sh*0.50);
        ctx.fillStyle = litWarm;
        for (let ri = 0; ri < 3; ri++) ctx.fillRect(ox+sw*(bx2+0.03), oy+sh*(0.36+ri*0.13), sw*(bw2-0.06), sh*0.07);
      }
      // Bandes LED de façade (animées)
      for (let li = 0; li < 4; li++) {
        const lAlpha = 0.3+0.35*Math.abs(Math.sin(t2/500+li*0.9));
        ctx.fillStyle = li%2===0?`rgba(60,200,255,${lAlpha.toFixed(2)})`:`rgba(100,160,255,${(lAlpha*0.7).toFixed(2)})`;
        ctx.fillRect(ox+sw*0.32, oy+sh*(0.16+li*0.16), sw*0.36, Math.max(1.5, sh*0.018));
      }
      // Antenne / pylône de recherche (sommet)
      px(0.48, 0.0, 0.04, 0.08, "#4a5870");
      ctx.fillStyle = `rgba(60,200,255,${(0.55+0.45*Math.abs(Math.sin(t2/600))).toFixed(2)})`;
      ctx.beginPath(); ctx.arc(ox+sw*0.5, oy, Math.max(2, sw*0.05), 0, Math.PI*2); ctx.fill();
      // Tier 1 : antennes latérales
      if (tier >= 1) {
        for (const ax2 of [0.28, 0.72]) {
          px(ax2, 0.24, 0.04, 0.10, "#3a4858");
          ctx.fillStyle = `rgba(100,220,255,${(0.4+techPulse*0.4).toFixed(2)})`;
          ctx.beginPath(); ctx.arc(ox+sw*ax2, oy+sh*0.24, Math.max(1.5, sw*0.034), 0, Math.PI*2); ctx.fill();
        }
      }
      // Tier 2 : hologramme / anneau flottant
      if (tier >= 2) {
        ctx.strokeStyle = `rgba(60,220,255,${(techPulse*0.8).toFixed(2)})`; ctx.lineWidth = Math.max(1.5, sw*0.030);
        ctx.beginPath(); ctx.ellipse(ox+sw*0.5, oy+sh*0.50, sw*0.15, sh*0.055, 0, 0, Math.PI*2); ctx.stroke();
        const orbA = t2/1400;
        ctx.fillStyle = `rgba(140,240,255,${(0.55+techPulse*0.35).toFixed(2)})`;
        ctx.beginPath(); ctx.arc(ox+sw*(0.5+Math.cos(orbA)*0.14), oy+sh*(0.50+Math.sin(orbA)*0.052), Math.max(2, sw*0.04), 0, Math.PI*2); ctx.fill();
      }
    }
    return;
  }
  if (id === "printing_houses") {
    // Imprimerie : grande presse mécanique animée, feuilles, encriers, cheminée industrielle
    px(0.06, 0.24, 0.88, 0.56, "#6a5030");
    ctx.fillStyle = "#3a2818";
    ctx.beginPath(); ctx.moveTo(ox+sw*0.04, oy+sh*0.26); ctx.lineTo(ox+sw*0.5, oy+sh*0.06); ctx.lineTo(ox+sw*0.96, oy+sh*0.26); ctx.closePath(); ctx.fill();
    px(0.04, 0.22, 0.92, 0.06, "#4a3420");
    px(0.26, 0.34, 0.48, 0.30, "#3a2e20");
    px(0.32, 0.38, 0.36, 0.22, "#8a7458");
    ctx.strokeStyle = "#c0a060"; ctx.lineWidth = Math.max(2, sw*0.032);
    ctx.beginPath(); ctx.moveTo(ox+sw*0.5, oy+sh*0.34); ctx.lineTo(ox+sw*0.5, oy+sh*0.64); ctx.stroke();
    ctx.fillStyle = "#c0a060"; ctx.beginPath(); ctx.arc(ox+sw*0.5, oy+sh*0.34, sw*0.040, 0, Math.PI*2); ctx.fill();
    const pressRot = (now / 1200) % (Math.PI * 2);
    ctx.strokeStyle = "#b09050"; ctx.lineWidth = Math.max(1.5, sw*0.024);
    ctx.beginPath(); ctx.moveTo(ox+sw*(0.5+Math.cos(pressRot)*0.15), oy+sh*(0.34+Math.sin(pressRot)*0.06)); ctx.lineTo(ox+sw*(0.5-Math.cos(pressRot)*0.15), oy+sh*(0.34-Math.sin(pressRot)*0.06)); ctx.stroke();
    const nSheets = 2 + tier;
    for (let i = 0; i < nSheets && i < 4; i++) {
      const sx2 = 0.10 + i * 0.09, sy2 = 0.54 + i * 0.04;
      px(sx2, sy2, 0.13, 0.08, "#f0e8d0");
      ctx.fillStyle = "rgba(40,28,12,0.32)";
      for (let l = 0; l < 2; l++) ctx.fillRect(ox+sw*(sx2+0.014), oy+sh*(sy2+0.016+l*0.030), sw*0.10, sh*0.010);
    }
    px(0.76, 0.38, 0.08, 0.08, "#1a0c04"); px(0.76, 0.50, 0.08, 0.08, "#1a0c04");
    if (tier >= 1) px(0.64, 0.34, 0.08, 0.14, litWarm);
    if (tier >= 2) {
      px(0.80, 0.10, 0.08, 0.20, "#3a2a18");
      const smoke = (now / 900) % 1;
      ctx.fillStyle = `rgba(80,70,58,${((1 - smoke) * 0.28).toFixed(2)})`;
      ctx.beginPath(); ctx.arc(ox+sw*0.84, oy+sh*(0.08 - smoke * 0.16), sw*(0.04 + smoke * 0.06), 0, Math.PI*2); ctx.fill();
    }
    return;
  }
  if (id === "think_tanks") {
    // Institut stratégique : verre et acier, écrans holographiques, antennes, hologramme
    px(0.08, 0.18, 0.84, 0.64, "#1e2434");
    px(0.06, 0.12, 0.88, 0.08, "#2a3248");
    ctx.fillStyle = "rgba(80,140,220,0.13)"; ctx.fillRect(ox+sw*0.12, oy+sh*0.22, sw*0.76, sh*0.55);
    ctx.strokeStyle = "rgba(60,100,180,0.25)"; ctx.lineWidth = Math.max(0.5, sw*0.013);
    for (let i = 1; i < 5; i++) {
      ctx.beginPath(); ctx.moveTo(ox+sw*(0.12+i*0.152), oy+sh*0.22); ctx.lineTo(ox+sw*(0.12+i*0.152), oy+sh*0.77); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ox+sw*0.12, oy+sh*(0.22+i*0.11)); ctx.lineTo(ox+sw*0.88, oy+sh*(0.22+i*0.11)); ctx.stroke();
    }
    const pulse = 0.35 + Math.abs(Math.sin(now / 700)) * 0.45;
    const pStr = pulse.toFixed(2);
    for (let row = 0; row < 3 + tier; row++) {
      for (let col = 0; col < 4; col++) {
        const hue = (row + col) % 3 === 0 ? `rgba(60,200,255,${pStr})` : (row + col) % 3 === 1 ? `rgba(80,255,160,${(pulse*0.7).toFixed(2)})` : `rgba(255,180,40,${(pulse*0.5).toFixed(2)})`;
        px(0.18 + col * 0.16, 0.28 + row * 0.11, 0.10, 0.06, hue);
      }
    }
    ctx.strokeStyle = "#4a5870"; ctx.lineWidth = Math.max(1, sw*0.016);
    ctx.beginPath(); ctx.moveTo(ox+sw*0.5, oy+sh*0.12); ctx.lineTo(ox+sw*0.5, oy+sh*0.0); ctx.stroke();
    ctx.strokeStyle = `rgba(107,182,255,${(0.5+Math.abs(Math.sin(now/600))*0.4).toFixed(2)})`; ctx.lineWidth = Math.max(1, sw*0.022);
    ctx.beginPath(); ctx.arc(ox+sw*0.5, oy+sh*0.0, sw*0.050, 0, Math.PI*2); ctx.stroke();
    if (tier >= 1) {
      ctx.strokeStyle = "#4a5870"; ctx.lineWidth = Math.max(0.5, sw*0.013);
      for (const ax2 of [0.28, 0.72]) {
        ctx.beginPath(); ctx.moveTo(ox+sw*ax2, oy+sh*0.12); ctx.lineTo(ox+sw*ax2, oy+sh*0.04); ctx.stroke();
        ctx.fillStyle = `rgba(107,182,255,${(0.4+pulse*0.4).toFixed(2)})`;
        ctx.beginPath(); ctx.arc(ox+sw*ax2, oy+sh*0.04, Math.max(1, sw*0.028), 0, Math.PI*2); ctx.fill();
      }
    }
    if (tier >= 2) {
      ctx.strokeStyle = `rgba(60,200,255,${(pulse*0.6).toFixed(2)})`; ctx.lineWidth = Math.max(1, sw*0.022);
      ctx.beginPath(); ctx.arc(ox+sw*0.5, oy+sh*0.50, sw*0.12, 0, Math.PI*2); ctx.stroke();
      ctx.beginPath(); ctx.arc(ox+sw*0.5, oy+sh*0.50, sw*0.06, 0, Math.PI*2); ctx.stroke();
      ctx.strokeStyle = `rgba(80,255,200,${(pulse*0.5).toFixed(2)})`;
      for (let i = 0; i < 3; i++) {
        const a = now / 1000 + i * Math.PI * 2 / 3;
        ctx.beginPath(); ctx.moveTo(ox+sw*0.5, oy+sh*0.50); ctx.lineTo(ox+sw*(0.5+Math.cos(a)*0.11), oy+sh*(0.50+Math.sin(a)*0.07)); ctx.stroke();
      }
    }
    return;
  }
  if (id === "aqueducts") {
    // Structure linéaire : spanX arches, 1 tile de haut. sw = largeur totale.
    const spanX = t.spanX || 3;
    const aw = 1 / spanX;          // fraction de sw par travée
    const pw = Math.max(0.008, aw * 0.20); // largeur relative d'un pilier

    // Soubassement
    px(0, 0.80, 1, 0.20, "#7a6a50");
    px(0, 0.78, 1, 0.04, "rgba(255,240,200,0.12)");

    // Piliers (spanX+1 piliers : un de chaque côté + un entre chaque travée)
    for (let i = 0; i <= spanX; i++) {
      const pxL = i * aw - pw / 2;
      const pxLc = Math.max(0, Math.min(1 - pw, pxL));
      px(pxLc, 0.32, pw, 0.48, "#c0aa80");
      px(pxLc, 0.32, pw * 0.30, 0.48, "rgba(255,240,200,0.22)"); // reflet
      px(pxLc, 0.78, pw, 0.04, "#d4c090");                        // chapiteau
      // Joints de maçonnerie
      ctx.fillStyle = "rgba(75,60,35,0.25)";
      for (let ji = 1; ji < 4; ji++) ctx.fillRect(ox + sw * pxLc, oy + sh * (0.32 + ji * 0.12), sw * pw, Math.max(1, sh * 0.012));
    }

    // Arches (entre chaque paire de piliers)
    for (let i = 0; i < spanX; i++) {
      const cx2 = ox + sw * ((i + 0.5) * aw);
      const archR = sw * aw * 0.44;
      const archY = oy + sh * 0.80;
      ctx.strokeStyle = "#9a8060"; ctx.lineWidth = Math.max(1, sw * aw * 0.06);
      ctx.beginPath(); ctx.arc(cx2, archY, archR, Math.PI, 0); ctx.stroke();
      // Archivolte (bordure de l'arc)
      ctx.strokeStyle = "rgba(200,180,130,0.35)"; ctx.lineWidth = Math.max(0.5, sw * aw * 0.025);
      ctx.beginPath(); ctx.arc(cx2, archY, archR * 0.82, Math.PI, 0); ctx.stroke();
    }

    // Canal sur le dessus (toute la longueur)
    px(0, 0.16, 1, 0.18, "#c8b490");  // couronnement pierre
    px(0, 0.12, 1, 0.06, "#6a5a38"); // bandeau supérieur
    px(0.015, 0.185, 0.97, 0.10, "#1e4a6e"); // eau dans le canal

    // Eau animée (deux vagues qui coulent)
    const stream = (now / 900) % 1;
    const ww = Math.min(0.35, 0.7 / spanX);
    px(0.015 + stream * (0.97 - ww), 0.200, ww, 0.065, "rgba(107,182,255,0.75)");
    px(0.015 + ((stream + 0.5) % 1) * (0.97 - ww * 0.7), 0.200, ww * 0.7, 0.065, "rgba(160,220,255,0.45)");

    // Reflets dans l'eau (scintillements statiques)
    ctx.fillStyle = `rgba(200,240,255,${(0.25 + 0.15 * Math.sin(now / 400)).toFixed(2)})`;
    for (let i = 0; i < spanX; i++) ctx.fillRect(ox + sw * ((i + 0.3) * aw + 0.015), oy + sh * 0.205, Math.max(1, sw * aw * 0.1), Math.max(1, sh * 0.025));

    return;
  }
  if (id === "watch") {
    // Veilleurs : tour de guet qui évolue du poste de feu primitif à la tourelle de surveillance
    const ei2 = (CM.layout && CM.layout.counts) ? CM.layout.counts.eraIndex : 5;
    if (ei2 >= 11) {
      // Tourelle de surveillance moderne
      px(0.38, 0.68, 0.24, 0.22, "#2a3040"); // base
      px(0.30, 0.20, 0.40, 0.50, "#3a4050"); // corps
      px(0.26, 0.16, 0.48, 0.06, "#2a3040"); // toit plat
      ctx.fillStyle = `rgba(80,180,255,${(0.35+night*0.5).toFixed(2)})`;
      ctx.fillRect(ox+sw*0.34, oy+sh*0.24, sw*0.32, sh*0.26); // vitre
      const camA = (now/2200)%(Math.PI*2);
      ctx.strokeStyle = "#8a9090"; ctx.lineWidth = Math.max(1,sw*0.028);
      ctx.beginPath(); ctx.moveTo(ox+sw*0.5, oy+sh*0.18); ctx.lineTo(ox+sw*(0.5+Math.cos(camA)*0.15), oy+sh*(0.18+Math.sin(camA)*0.06)); ctx.stroke();
      ctx.fillStyle = "#4a5a6a"; ctx.beginPath(); ctx.arc(ox+sw*(0.5+Math.cos(camA)*0.15), oy+sh*(0.18+Math.sin(camA)*0.06), Math.max(2,sw*0.042), 0, Math.PI*2); ctx.fill();
      const sA = 0.4+0.3*Math.sin(now/400);
      px(0.36, 0.27, 0.12, 0.07, `rgba(60,200,255,${sA.toFixed(2)})`);
      px(0.52, 0.27, 0.12, 0.07, `rgba(80,255,120,${(sA*0.8).toFixed(2)})`);
      px(0.36, 0.38, 0.28, 0.08, `rgba(255,180,40,${(sA*0.6).toFixed(2)})`);
      if (night > 0.3) {
        ctx.strokeStyle = `rgba(255,255,200,${(night*0.32).toFixed(2)})`; ctx.lineWidth = Math.max(1,sw*0.04);
        ctx.beginPath(); ctx.moveTo(ox+sw*0.5, oy+sh*0.16); ctx.lineTo(ox+sw*(0.5+Math.cos(camA)*0.55), oy+sh*(0.16+Math.sin(camA)*0.38)); ctx.stroke();
      }
    } else if (tier >= 1) {
      // Tour de pierre fortifiée avec créneaux
      px(0.30, 0.22, 0.40, 0.56, "#8a8070");
      px(0.26, 0.58, 0.48, 0.22, "#7a7060");
      for (let i=0; i<3; i++) px(0.30+i*0.14, 0.16, 0.09, 0.08, "#8a8070");
      ctx.fillStyle = "#1a1208"; ctx.fillRect(ox+sw*0.36, oy+sh*0.30, sw*0.07, sh*0.14); ctx.fillRect(ox+sw*0.57, oy+sh*0.30, sw*0.07, sh*0.14);
      const glow = 0.5+0.4*Math.sin(now/600);
      ctx.fillStyle = `rgba(255,200,80,${(glow*(0.5+night*0.5)).toFixed(2)})`;
      ctx.beginPath(); ctx.arc(ox+sw*0.5, oy+sh*0.19, sw*0.11, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = "#c09030"; ctx.beginPath(); ctx.arc(ox+sw*0.5, oy+sh*0.19, sw*0.065, 0, Math.PI*2); ctx.fill();
    } else {
      // Tour de bois avec feu de signal
      px(0.40, 0.30, 0.20, 0.50, "#6a4a20");
      px(0.28, 0.58, 0.44, 0.12, "#5a3a18");
      ctx.strokeStyle = "#5a3a18"; ctx.lineWidth = Math.max(2,sw*0.04);
      ctx.beginPath(); ctx.moveTo(ox+sw*0.28, oy+sh*0.70); ctx.lineTo(ox+sw*0.42, oy+sh*0.30); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ox+sw*0.72, oy+sh*0.70); ctx.lineTo(ox+sw*0.58, oy+sh*0.30); ctx.stroke();
      const f1=0.5+0.5*Math.sin(now/180), f2=0.5+0.5*Math.sin(now/150+1.2);
      ctx.fillStyle = `rgba(255,80,8,${(0.65+f1*0.35).toFixed(2)})`;
      ctx.beginPath(); ctx.moveTo(ox+sw*0.42, oy+sh*0.32); ctx.quadraticCurveTo(ox+sw*0.36, oy+sh*(0.17-f1*0.06), ox+sw*0.5, oy+sh*(0.11-f1*0.04)); ctx.quadraticCurveTo(ox+sw*0.64, oy+sh*(0.17-f2*0.05), ox+sw*0.58, oy+sh*0.32); ctx.closePath(); ctx.fill();
      ctx.fillStyle = `rgba(255,200,20,${(0.6+f2*0.3).toFixed(2)})`;
      ctx.beginPath(); ctx.moveTo(ox+sw*0.46, oy+sh*0.32); ctx.quadraticCurveTo(ox+sw*0.44, oy+sh*(0.21-f2*0.08), ox+sw*0.5, oy+sh*(0.15-f1*0.05)); ctx.quadraticCurveTo(ox+sw*0.56, oy+sh*(0.21-f2*0.06), ox+sw*0.54, oy+sh*0.32); ctx.closePath(); ctx.fill();
      if (night > 0.2) { const hg=ctx.createRadialGradient(ox+sw*0.5,oy+sh*0.22,0,ox+sw*0.5,oy+sh*0.22,sw*0.3); hg.addColorStop(0,`rgba(255,150,20,${(0.18*night).toFixed(2)})`); hg.addColorStop(1,"rgba(255,80,5,0)"); ctx.fillStyle=hg; ctx.beginPath(); ctx.arc(ox+sw*0.5,oy+sh*0.22,sw*0.3,0,Math.PI*2); ctx.fill(); }
    }
    return;
  }
  if (id === "sewers") {
    // Égouts : canaux ouverts → réseau de pierres → conduites modernes
    const ei2 = (CM.layout && CM.layout.counts) ? CM.layout.counts.eraIndex : 5;
    const band2 = (CM.layout && CM.layout.counts) ? CM.layout.counts.eraBand : 2;
    if (ei2 >= 11) {
      px(0.06, 0.44, 0.88, 0.40, "#2a3040");
      ctx.strokeStyle = "#4a5870"; ctx.lineWidth = Math.max(2,sw*0.06);
      ctx.beginPath(); ctx.moveTo(ox+sw*0.06, oy+sh*0.56); ctx.lineTo(ox+sw*0.94, oy+sh*0.56); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ox+sw*0.06, oy+sh*0.72); ctx.lineTo(ox+sw*0.94, oy+sh*0.72); ctx.stroke();
      for (let i=0; i<3; i++) { const vx=ox+sw*(0.25+i*0.25); ctx.fillStyle="#6a7a8a"; ctx.fillRect(vx-sw*0.04,oy+sh*0.50,sw*0.08,sh*0.14); ctx.fillStyle="#3a4858"; ctx.fillRect(vx-sw*0.016,oy+sh*0.62,sw*0.032,sh*0.10); }
      const sA=0.5+0.3*Math.sin(now/500);
      for (let i=0; i<4; i++) px(0.16+i*0.2, 0.44, 0.07, 0.04, `rgba(80,220,100,${(sA*(i%2===0?1:0.6)).toFixed(2)})`);
      const str=(now/700)%1; ctx.fillStyle=`rgba(60,180,255,${(0.4+sA*0.2).toFixed(2)})`; ctx.fillRect(ox+sw*(0.08+str*0.55),oy+sh*0.545,sw*0.28,sh*0.028);
      px(0.08, 0.32, 0.28, 0.10, "#1e2434");
      for (let i=0; i<3; i++) ctx.fillRect(ox+sw*(0.11+i*0.08), oy+sh*0.35, sw*0.05, sh*0.04);
    } else if (band2 >= 3) {
      px(0.06, 0.46, 0.88, 0.30, "#3a3020"); px(0.10, 0.56, 0.80, 0.16, "#2a2015");
      const nG=2+tier;
      for (let i=0; i<nG; i++) {
        const gx2=0.18+i*(0.64/Math.max(1,nG-1));
        px(gx2-0.042, 0.45, 0.084, 0.04, "#1a1208");
        ctx.strokeStyle="#3a3020"; ctx.lineWidth=Math.max(0.5,sw*0.013);
        for (let j=0; j<3; j++) ctx.strokeRect(ox+sw*(gx2-0.038+j*0.026),oy+sh*0.45,sw*0.026,sh*0.04);
        const ph=((now/1400)+i*0.4)%1;
        ctx.fillStyle=`rgba(190,190,170,${((1-ph)*0.14).toFixed(2)})`; ctx.beginPath(); ctx.arc(ox+sw*gx2,oy+sh*(0.43-ph*0.22),sw*(0.035+ph*0.06),0,Math.PI*2); ctx.fill();
      }
      px(0.06, 0.60, 0.88, 0.08, "#1e3050");
      const str2=(now/900)%1; ctx.fillStyle="rgba(80,150,200,0.55)"; ctx.fillRect(ox+sw*(0.08+str2*0.60),oy+sh*0.62,sw*0.20,sh*0.04);
    } else {
      px(0.06, 0.48, 0.88, 0.32, "#4a3820");
      px(0.10, 0.54, 0.32, 0.18, "#1e2818"); px(0.58, 0.54, 0.32, 0.18, "#1e2818");
      ctx.fillStyle=`rgba(50,120,80,${(0.4+0.15*Math.sin(now/800)).toFixed(2)})`; ctx.fillRect(ox+sw*0.11,oy+sh*0.56,sw*0.30,sh*0.14); ctx.fillRect(ox+sw*0.59,oy+sh*0.56,sw*0.30,sh*0.14);
      for (let i=0; i<3; i++) { const ph=((now/1800)+i*0.35)%1; ctx.fillStyle=`rgba(100,180,120,${((1-ph)*0.25).toFixed(2)})`; ctx.beginPath(); ctx.arc(ox+sw*(0.20+i*0.10),oy+sh*(0.60-ph*0.16),sw*(0.02+ph*0.03),0,Math.PI*2); ctx.fill(); }
    }
    return;
  }
  if (id === "bureaucracy") {
    // Bureaucratie : salle des scribes → guichets → open space moderne
    const ei2 = (CM.layout && CM.layout.counts) ? CM.layout.counts.eraIndex : 5;
    if (ei2 >= 11) {
      px(0.06, 0.18, 0.88, 0.64, "#3a4050"); px(0.06, 0.12, 0.88, 0.08, "#2a3040");
      ctx.fillStyle="rgba(100,150,200,0.12)"; ctx.fillRect(ox+sw*0.10,oy+sh*0.22,sw*0.80,sh*0.56);
      ctx.strokeStyle="rgba(80,110,160,0.28)"; ctx.lineWidth=Math.max(0.5,sw*0.012);
      for (let i=1; i<4; i++) { ctx.beginPath(); ctx.moveTo(ox+sw*(0.10+i*0.20),oy+sh*0.22); ctx.lineTo(ox+sw*(0.10+i*0.20),oy+sh*0.78); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(ox+sw*0.10,oy+sh*0.50); ctx.lineTo(ox+sw*0.90,oy+sh*0.50); ctx.stroke();
      for (let i=0; i<4; i++) { ctx.fillStyle="rgba(50,65,90,0.65)"; ctx.beginPath(); ctx.arc(ox+sw*(0.20+i*0.20),oy+sh*0.37,sw*0.038,0,Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.arc(ox+sw*(0.20+i*0.20),oy+sh*0.64,sw*0.038,0,Math.PI*2); ctx.fill(); }
      const sA=0.35+0.25*Math.sin(now/600);
      for (let i=0; i<4; i++) px(0.13+i*0.20, 0.31, 0.12, 0.06, `rgba(80,160,255,${(sA*(i%3===0?1:0.6)).toFixed(2)})`);
      px(0.36, 0.06, 0.28, 0.08, "#d4a017");
    } else if (ei2 >= 5) {
      px(0.08, 0.24, 0.84, 0.54, "#c9a84c"); px(0.06, 0.16, 0.88, 0.10, "#6a4a10");
      const nW=2+Math.min(tier,2);
      for (let i=0; i<nW; i++) {
        const wx2=0.16+i*(0.68/Math.max(1,nW-1));
        px(wx2-0.06, 0.56, 0.12, 0.04, "#b8904a");
        ctx.fillStyle="rgba(40,25,8,0.55)"; ctx.beginPath(); ctx.arc(ox+sw*wx2,oy+sh*0.49,sw*0.026,0,Math.PI*2); ctx.fill();
        px(wx2-0.04, 0.51, 0.08, 0.04, "#e8dcc0");
      }
      const stampA=0.3+0.4*Math.abs(Math.sin(now/800));
      ctx.fillStyle=`rgba(180,40,20,${stampA.toFixed(2)})`; ctx.beginPath(); ctx.arc(ox+sw*0.5,oy+sh*0.42,sw*0.06,0,Math.PI*2); ctx.fill();
      px(0.33, 0.12, 0.34, 0.06, "#d4a017");
      px(0.44, 0.64, 0.12, 0.18, "#2a1a08");
      for (let i=0; i<2+tier; i++) px(0.17+i*0.18, 0.32, 0.10, 0.08, litWarm);
    } else {
      px(0.08, 0.28, 0.84, 0.50, "#8a6830");
      ctx.fillStyle="#5a3e18"; ctx.beginPath(); ctx.moveTo(ox+sw*0.06,oy+sh*0.30); ctx.lineTo(ox+sw*0.5,oy+sh*0.12); ctx.lineTo(ox+sw*0.94,oy+sh*0.30); ctx.closePath(); ctx.fill();
      const nR=1+tier;
      for (let row=0; row<nR&&row<3; row++) for (let i=0; i<4; i++) { px(0.18+i*0.16,0.38+row*0.10,0.12,0.07,"#d4c090"); ctx.strokeStyle="#6a4a10"; ctx.lineWidth=Math.max(0.5,sw*0.012); ctx.beginPath(); ctx.moveTo(ox+sw*(0.19+i*0.16),oy+sh*(0.38+row*0.10)); ctx.lineTo(ox+sw*(0.19+i*0.16),oy+sh*(0.38+row*0.10+0.07)); ctx.stroke(); }
      px(0.44, 0.62, 0.12, 0.18, "#1e1006");
    }
    return;
  }
  if (id === "courthouses") {
    // Tribunaux : cercle des anciens → tribunal à colonnes → palais de justice
    const ei2 = (CM.layout && CM.layout.counts) ? CM.layout.counts.eraIndex : 5;
    const band2 = (CM.layout && CM.layout.counts) ? CM.layout.counts.eraBand : 2;
    if (ei2 >= 11) {
      px(0.06, 0.16, 0.88, 0.66, "#d8d0b8");
      ctx.fillStyle="#c8c0a0"; ctx.beginPath(); ctx.moveTo(ox+sw*0.04,oy+sh*0.18); ctx.lineTo(ox+sw*0.5,oy+sh*0.02); ctx.lineTo(ox+sw*0.96,oy+sh*0.18); ctx.closePath(); ctx.fill();
      px(0.04, 0.15, 0.92, 0.04, "#a0906a");
      ctx.fillStyle="rgba(80,140,220,0.16)"; ctx.fillRect(ox+sw*0.28,oy+sh*0.22,sw*0.44,sh*0.44);
      ctx.strokeStyle="rgba(180,200,240,0.38)"; ctx.lineWidth=Math.max(0.5,sw*0.016);
      for (let i=1; i<4; i++) { ctx.beginPath(); ctx.moveTo(ox+sw*(0.28+i*0.11),oy+sh*0.22); ctx.lineTo(ox+sw*(0.28+i*0.11),oy+sh*0.66); ctx.stroke(); }
      const balA=0.12*Math.sin(now/1400);
      ctx.strokeStyle="#d4a017"; ctx.lineWidth=Math.max(1,sw*0.024);
      ctx.beginPath(); ctx.moveTo(ox+sw*0.38,oy+sh*0.28); ctx.lineTo(ox+sw*0.62,oy+sh*0.28); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ox+sw*0.5,oy+sh*0.20); ctx.lineTo(ox+sw*0.5,oy+sh*0.28); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ox+sw*0.38,oy+sh*0.28); ctx.lineTo(ox+sw*0.34,oy+sh*(0.36+balA)); ctx.lineTo(ox+sw*0.42,oy+sh*(0.36+balA)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ox+sw*0.62,oy+sh*0.28); ctx.lineTo(ox+sw*0.58,oy+sh*(0.36-balA)); ctx.lineTo(ox+sw*0.66,oy+sh*(0.36-balA)); ctx.stroke();
      const nC=4+Math.min(tier,2); for (let i=0; i<nC; i++) px(0.09+i*(0.82/Math.max(1,nC-1))-0.016,0.18,0.032,0.62,"rgba(20,15,8,0.36)");
      px(0.44, 0.70, 0.12, 0.14, "#2a1a08");
    } else if (band2 >= 2) {
      px(0.08, 0.28, 0.84, 0.50, "#d4c5a0");
      ctx.fillStyle="#b8a882"; ctx.beginPath(); ctx.moveTo(ox+sw*0.06,oy+sh*0.30); ctx.lineTo(ox+sw*0.5,oy+sh*0.10); ctx.lineTo(ox+sw*0.94,oy+sh*0.30); ctx.closePath(); ctx.fill();
      const nC=3+Math.min(tier,2); for (let i=0; i<nC; i++) px(0.13+i*(0.74/Math.max(1,nC-1))-0.018,0.30,0.036,0.44,"rgba(30,20,8,0.40)");
      const balA2=0.10*Math.sin(now/1500);
      ctx.strokeStyle="#d4a017"; ctx.lineWidth=Math.max(1,sw*0.024);
      ctx.beginPath(); ctx.moveTo(ox+sw*0.38,oy+sh*0.20); ctx.lineTo(ox+sw*0.62,oy+sh*0.20); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ox+sw*0.5,oy+sh*0.14); ctx.lineTo(ox+sw*0.5,oy+sh*0.20); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ox+sw*0.38,oy+sh*0.20); ctx.lineTo(ox+sw*0.34,oy+sh*(0.28+balA2)); ctx.lineTo(ox+sw*0.42,oy+sh*(0.28+balA2)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ox+sw*0.62,oy+sh*0.20); ctx.lineTo(ox+sw*0.58,oy+sh*(0.28-balA2)); ctx.lineTo(ox+sw*0.66,oy+sh*(0.28-balA2)); ctx.stroke();
      px(0.44, 0.62, 0.12, 0.18, "#2a1a08");
    } else {
      px(0.0, 0.48, 1.0, 0.52, "#2e2416");
      for (let i=0; i<5+tier; i++) { const a=(i/(5+tier))*Math.PI*2; ctx.fillStyle="#7a6848"; ctx.beginPath(); ctx.ellipse(ox+sw*(0.5+Math.cos(a)*0.34),oy+sh*(0.65+Math.sin(a)*0.20),sw*0.048,sh*0.038,0,0,Math.PI*2); ctx.fill(); }
      for (let i=0; i<3; i++) { const a=-Math.PI/2+(i-1)*0.8; ctx.fillStyle="rgba(40,25,8,0.65)"; ctx.beginPath(); ctx.arc(ox+sw*(0.5+Math.cos(a)*0.20),oy+sh*(0.65+Math.sin(a)*0.12),sw*0.030,0,Math.PI*2); ctx.fill(); }
      ctx.strokeStyle="#9a7848"; ctx.lineWidth=Math.max(1,sw*0.024); ctx.beginPath(); ctx.moveTo(ox+sw*0.5,oy+sh*0.38); ctx.lineTo(ox+sw*0.5,oy+sh*0.65); ctx.stroke();
      ctx.fillStyle="#d4a017"; ctx.beginPath(); ctx.arc(ox+sw*0.5,oy+sh*0.38,sw*0.04,0,Math.PI*2); ctx.fill();
      const f1=0.5+0.5*Math.sin(now/180);
      ctx.fillStyle=`rgba(255,120,10,${(0.5+f1*0.3).toFixed(2)})`; ctx.beginPath(); ctx.moveTo(ox+sw*0.46,oy+sh*0.65); ctx.quadraticCurveTo(ox+sw*0.42,oy+sh*(0.52-f1*0.05),ox+sw*0.5,oy+sh*(0.47-f1*0.04)); ctx.quadraticCurveTo(ox+sw*0.58,oy+sh*(0.52-f1*0.04),ox+sw*0.54,oy+sh*0.65); ctx.closePath(); ctx.fill();
    }
    return;
  }
  if (id === "public_works") {
    // Grands travaux : chantier avec outils → grue → engins modernes
    const ei2 = (CM.layout && CM.layout.counts) ? CM.layout.counts.eraIndex : 5;
    if (ei2 >= 11) {
      // Engins de construction modernes
      px(0.06, 0.62, 0.88, 0.22, "#5a5040"); // sol chantier
      // Grue mécanique moderne (jaune)
      px(0.56, 0.18, 0.06, 0.54, "#d4a020"); // mât vertical
      ctx.strokeStyle = "#d4a020"; ctx.lineWidth = Math.max(2, sw * 0.04);
      ctx.beginPath(); ctx.moveTo(ox+sw*0.59, oy+sh*0.22); ctx.lineTo(ox+sw*0.90, oy+sh*0.18); ctx.stroke(); // bras
      ctx.beginPath(); ctx.moveTo(ox+sw*0.59, oy+sh*0.22); ctx.lineTo(ox+sw*0.34, oy+sh*0.30); ctx.stroke(); // contrepoids
      const bob2 = Math.sin(now/800)*sh*0.06;
      px(0.82, 0.20, 0.05, 0.50+bob2/sh, "#3a3020"); // câble
      px(0.76, 0.64+bob2/sh, 0.18, 0.10, "#a89070"); // charge suspendue
      // Engin de terrassement (foreground)
      px(0.10, 0.66, 0.28, 0.14, "#c08020"); // bulldozer
      px(0.08, 0.72, 0.30, 0.08, "#7a6030"); // chenilles
      // Matériaux empilés
      for (let i=0; i<3; i++) px(0.16+i*0.10, 0.56, 0.08, 0.08, i%2===0?"#b8a882":"#7a6040");
    } else if (tier >= 1) {
      // Grue à poulie + échafaudages
      px(0.10, 0.62, 0.80, 0.16, "#b8a882"); // sol/fondations
      for (let i=0; i<4; i++) px(0.18+i*0.16, 0.42, 0.04, 0.32, "#6a4a10"); // piliers
      ctx.strokeStyle="#6a4a10"; ctx.lineWidth=Math.max(1,sw*0.030);
      ctx.beginPath(); ctx.moveTo(ox+sw*0.22,oy+sh*0.40); ctx.lineTo(ox+sw*0.78,oy+sh*0.40); ctx.lineTo(ox+sw*0.64,oy+sh*0.24); ctx.stroke();
      const bob3=Math.sin(now/700)*sh*0.028;
      px(0.62, 0.26, 0.036, 0.26+bob3/sh, "#6a4a10");
      px(0.54, 0.54+bob3/sh, 0.18, 0.10, "#b8a882");
      px(0.20, 0.52, 0.18, 0.08, "#b8a882");
      // Ouvriers
      for (let i=0; i<2; i++) { ctx.fillStyle="rgba(40,25,8,0.65)"; ctx.beginPath(); ctx.arc(ox+sw*(0.28+i*0.22),oy+sh*0.58,sw*0.025,0,Math.PI*2); ctx.fill(); }
    } else {
      // Constructeurs primitifs avec paniers et pelles
      px(0.08, 0.58, 0.84, 0.18, "#7a6040"); // sol
      // Blocs de pierre en cours de pose
      for (let i=0; i<3; i++) px(0.14+i*0.22, 0.44, 0.18, 0.16, "#b8a882");
      // Ouvriers (silhouettes)
      for (let i=0; i<2+tier; i++) {
        ctx.fillStyle="rgba(50,30,10,0.65)"; ctx.beginPath(); ctx.arc(ox+sw*(0.24+i*0.20),oy+sh*0.52,sw*0.026,0,Math.PI*2); ctx.fill();
        // Outil (pelle/levier)
        ctx.strokeStyle="#5a3818"; ctx.lineWidth=Math.max(1,sw*0.018);
        ctx.beginPath(); ctx.moveTo(ox+sw*(0.24+i*0.20),oy+sh*0.48); ctx.lineTo(ox+sw*(0.30+i*0.20),oy+sh*0.60); ctx.stroke();
      }
      // Corde tendue (palan primitif)
      ctx.strokeStyle="#8a6830"; ctx.lineWidth=Math.max(1,sw*0.018);
      ctx.beginPath(); ctx.moveTo(ox+sw*0.20,oy+sh*0.30); ctx.lineTo(ox+sw*0.78,oy+sh*0.26); ctx.lineTo(ox+sw*0.72,oy+sh*0.46); ctx.stroke();
    }
    return;
  }
  if (id === "ministries") {
    // Ministères : salle du conseil → palais → ministère moderne
    const ei2 = (CM.layout && CM.layout.counts) ? CM.layout.counts.eraIndex : 5;
    if (ei2 >= 11) {
      // Tour administrative moderne
      px(0.16, 0.08, 0.68, 0.76, "#2a3040"); px(0.14, 0.04, 0.72, 0.06, "#3a4258");
      ctx.fillStyle="rgba(80,140,220,0.14)"; ctx.fillRect(ox+sw*0.20,oy+sh*0.12,sw*0.60,sh*0.66);
      ctx.strokeStyle="rgba(60,100,180,0.24)"; ctx.lineWidth=Math.max(0.5,sw*0.013);
      for (let i=1; i<4; i++) { ctx.beginPath(); ctx.moveTo(ox+sw*(0.20+i*0.15),oy+sh*0.12); ctx.lineTo(ox+sw*(0.20+i*0.15),oy+sh*0.78); ctx.stroke(); }
      for (let i=1; i<6; i++) { ctx.beginPath(); ctx.moveTo(ox+sw*0.20,oy+sh*(0.12+i*0.11)); ctx.lineTo(ox+sw*0.80,oy+sh*(0.12+i*0.11)); ctx.stroke(); }
      for (let row=0; row<3+tier; row++) for (let col=0; col<4; col++) px(0.22+col*0.15, 0.16+row*0.11, 0.09, 0.06, litWarm);
      // Drapeaux
      for (const fx of [0.20, 0.76]) { ctx.strokeStyle="#6a5060"; ctx.lineWidth=Math.max(1,sw*0.016); ctx.beginPath(); ctx.moveTo(ox+sw*fx,oy+sh*0.04); ctx.lineTo(ox+sw*fx,oy-sh*0.06); ctx.stroke(); ctx.fillStyle="#c43a3a"; ctx.beginPath(); ctx.moveTo(ox+sw*fx,oy-sh*0.06); ctx.lineTo(ox+sw*(fx+0.06),oy-sh*0.02); ctx.lineTo(ox+sw*fx,oy+sh*0.02); ctx.closePath(); ctx.fill(); }
    } else if (ei2 >= 5) {
      // Grand palais avec colonnes et drapeaux
      px(0.06, 0.22, 0.88, 0.56, "#d4c5a0"); px(0.14, 0.14, 0.72, 0.10, "#6a4a10");
      px(0.38, 0.12, 0.24, 0.68, "#c9a84c"); // tour centrale
      const nC=4+Math.min(tier,2); for (let i=0; i<nC; i++) px(0.10+i*(0.80/Math.max(1,nC-1))-0.016,0.22,0.032,0.54,"rgba(30,20,8,0.34)");
      for (let row=0; row<3+tier; row++) for (let col=0; col<4; col++) px(0.16+col*0.18, 0.32+row*0.09, 0.08, 0.048, litWarm);
      for (const fx of [0.24, 0.70]) { ctx.strokeStyle="#6a4060"; ctx.lineWidth=Math.max(1,sw*0.018); ctx.beginPath(); ctx.moveTo(ox+sw*fx,oy+sh*0.14); ctx.lineTo(ox+sw*fx,oy+sh*0.0); ctx.stroke(); ctx.fillStyle="#b43a2f"; ctx.beginPath(); ctx.moveTo(ox+sw*fx,oy+sh*0.0); ctx.lineTo(ox+sw*(fx+0.07),oy+sh*0.05); ctx.lineTo(ox+sw*fx,oy+sh*0.10); ctx.closePath(); ctx.fill(); }
    } else {
      // Salle du conseil primitif : grande table ronde, sièges
      px(0.08, 0.28, 0.84, 0.52, "#8a7030");
      ctx.fillStyle="#6a4a10"; ctx.beginPath(); ctx.moveTo(ox+sw*0.06,oy+sh*0.30); ctx.lineTo(ox+sw*0.5,oy+sh*0.10); ctx.lineTo(ox+sw*0.94,oy+sh*0.30); ctx.closePath(); ctx.fill();
      // Table du conseil (ronde)
      ctx.fillStyle="#b89040"; ctx.beginPath(); ctx.ellipse(ox+sw*0.5,oy+sh*0.58,sw*0.24,sh*0.16,0,0,Math.PI*2); ctx.fill();
      ctx.fillStyle="#6a4a10"; ctx.beginPath(); ctx.ellipse(ox+sw*0.5,oy+sh*0.58,sw*0.16,sh*0.10,0,0,Math.PI*2); ctx.fill();
      // Conseillers assis
      for (let i=0; i<4+tier; i++) { const a=(i/(4+tier))*Math.PI*2; ctx.fillStyle="rgba(40,24,8,0.65)"; ctx.beginPath(); ctx.arc(ox+sw*(0.5+Math.cos(a)*0.28),oy+sh*(0.58+Math.sin(a)*0.18),sw*0.026,0,Math.PI*2); ctx.fill(); }
      // Trône / siège d'honneur
      px(0.44, 0.32, 0.12, 0.14, "#d4a017");
    }
    return;
  }
  if (id === "archive_grids") {
    // Réseaux d'archives : rayonnages → salle des archives → data center
    const ei2 = (CM.layout && CM.layout.counts) ? CM.layout.counts.eraIndex : 5;
    if (ei2 >= 10) {
      // Data center : tours de serveurs, flux de données
      px(0.06, 0.16, 0.88, 0.70, "#1e2434");
      px(0.06, 0.10, 0.88, 0.08, "#2a3248");
      const nRacks = 3 + Math.min(tier, 2);
      for (let i=0; i<nRacks; i++) {
        const rx2=0.12+i*(0.76/Math.max(1,nRacks-1));
        px(rx2-0.06, 0.20, 0.12, 0.58, "#0e1624"); // rack
        px(rx2-0.055, 0.22, 0.11, 0.04, "#1a2a3a"); // unité
        const rA=0.4+0.3*Math.sin(now/400+i*1.1);
        for (let j=0; j<5; j++) px(rx2-0.04, 0.27+j*0.09, 0.08, 0.04, `rgba(${j%2===0?"80,220,100":"60,180,255"},${(rA*(0.5+j*0.1)).toFixed(2)})`);
      }
      const pulse2=0.35+Math.abs(Math.sin(now/700))*0.45;
      ctx.strokeStyle=`rgba(107,182,255,${pulse2.toFixed(2)})`; ctx.lineWidth=Math.max(1,sw*0.020);
      for (let i=0; i<nRacks-1; i++) {
        const x1=ox+sw*(0.12+i*(0.76/Math.max(1,nRacks-1))), x2=ox+sw*(0.12+(i+1)*(0.76/Math.max(1,nRacks-1)));
        ctx.beginPath(); ctx.moveTo(x1,oy+sh*0.50); ctx.lineTo(x2,oy+sh*0.50); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x1,oy+sh*0.60); ctx.lineTo(x2,oy+sh*0.60); ctx.stroke();
      }
      // Antenne de transmission
      ctx.strokeStyle="#4a5870"; ctx.lineWidth=Math.max(1,sw*0.016);
      ctx.beginPath(); ctx.moveTo(ox+sw*0.5,oy+sh*0.10); ctx.lineTo(ox+sw*0.5,oy); ctx.stroke();
      ctx.fillStyle=`rgba(107,182,255,${(0.5+Math.abs(Math.sin(now/600))*0.4).toFixed(2)})`;
      ctx.beginPath(); ctx.arc(ox+sw*0.5,oy,Math.max(2,sw*0.042),0,Math.PI*2); ctx.fill();
    } else {
      // Salle des archives physiques : rangées de rayonnages
      px(0.06, 0.22, 0.88, 0.62, "#5a4828");
      ctx.fillStyle="#3a2e18"; ctx.beginPath(); ctx.moveTo(ox+sw*0.04,oy+sh*0.24); ctx.lineTo(ox+sw*0.5,oy+sh*0.08); ctx.lineTo(ox+sw*0.96,oy+sh*0.24); ctx.closePath(); ctx.fill();
      const nS=2+Math.min(tier,2);
      for (let row=0; row<nS; row++) {
        px(0.10, 0.32+row*0.14, 0.80, 0.10, "#3a2c18"); // étagère
        const spines2=["#9c3b2f","#7a5c2a","#3a6a3a","#b58f3a","#8a4a6a","#4a5a8a"];
        for (let i=0; i<6; i++) px(0.14+i*0.12, 0.33+row*0.14, 0.10, 0.08, spines2[i%spines2.length]);
      }
      // Archiviste
      ctx.fillStyle="rgba(40,24,8,0.60)"; ctx.beginPath(); ctx.arc(ox+sw*0.5,oy+sh*0.70,sw*0.026,0,Math.PI*2); ctx.fill();
      px(0.42, 0.74, 0.16, 0.08, "#e0d4aa"); // document
      px(0.44, 0.64, 0.12, 0.20, "#1e1408");
    }
    return;
  }
  if (id === "ruin_architects") {
    // Architectes des ruines : vestige en ruine + architectes + plans évolutifs
    // Ruine partielle (mur effondré)
    px(0.08, 0.54, 0.84, 0.24, "#4a4030");
    px(0.12, 0.28, 0.38, 0.32, "#5a5040"); // pan de mur gauche debout
    px(0.14, 0.22, 0.34, 0.08, "#3a3428"); // sommet effondré
    // Décombres
    for (let i=0; i<3; i++) { ctx.fillStyle=["#6a5a44","#5a4a38","#4a3c2c"][i]; ctx.beginPath(); ctx.ellipse(ox+sw*(0.54+i*0.12),oy+sh*(0.60-i*0.04),sw*(0.07-i*0.01),sh*(0.05-i*0.008),i*0.4,0,Math.PI*2); ctx.fill(); }
    // Plan / blueprint lumineux
    const bpA = 0.4+0.25*Math.sin(now/700);
    px(0.52, 0.26, 0.36, 0.24, `rgba(30,60,120,${bpA.toFixed(2)})`);
    ctx.strokeStyle=`rgba(120,180,255,${(bpA*0.8).toFixed(2)})`; ctx.lineWidth=Math.max(0.5,sw*0.014);
    ctx.beginPath(); ctx.rect(ox+sw*0.54,oy+sh*0.28,sw*0.32,sh*0.20); ctx.stroke();
    for (let i=1; i<3; i++) { ctx.beginPath(); ctx.moveTo(ox+sw*(0.54+i*0.11),oy+sh*0.28); ctx.lineTo(ox+sw*(0.54+i*0.11),oy+sh*0.48); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(ox+sw*0.54,oy+sh*0.38); ctx.lineTo(ox+sw*0.86,oy+sh*0.38); ctx.stroke();
    // Architectes qui étudient
    const nArch=1+tier;
    for (let i=0; i<nArch&&i<3; i++) {
      ctx.fillStyle="rgba(50,35,15,0.70)"; ctx.beginPath(); ctx.arc(ox+sw*(0.18+i*0.22),oy+sh*0.52,sw*0.028,0,Math.PI*2); ctx.fill();
      ctx.strokeStyle="#8a7040"; ctx.lineWidth=Math.max(0.5,sw*0.016);
      ctx.beginPath(); ctx.moveTo(ox+sw*(0.18+i*0.22),oy+sh*0.48); ctx.lineTo(ox+sw*(0.24+i*0.22),oy+sh*0.60); ctx.stroke(); // outil/règle
    }
    // Tier 2+ : échafaudages de restauration
    if (tier >= 2) {
      ctx.strokeStyle="rgba(160,120,60,0.55)"; ctx.lineWidth=Math.max(1,sw*0.022);
      for (let i=0; i<3; i++) { ctx.beginPath(); ctx.moveTo(ox+sw*(0.14+i*0.10),oy+sh*0.28); ctx.lineTo(ox+sw*(0.14+i*0.10),oy+sh*0.54); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(ox+sw*0.12,oy+sh*0.40); ctx.lineTo(ox+sw*0.36,oy+sh*0.40); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ox+sw*0.12,oy+sh*0.50); ctx.lineTo(ox+sw*0.36,oy+sh*0.50); ctx.stroke();
    }
    return;
  }
  if (id === "foragers") {
    // Sol herbe sombre
    px(0.0, 0.58, 1.0, 0.42, "#131a09");

    // === BUISSON / ARBRE (droite) ===
    const tx = 0.70, ty = 0.60;
    // Tronc
    ctx.fillStyle = "#6a3c0e";
    ctx.fillRect(ox + sw * (tx - 0.024), oy + sh * (ty - 0.1), sw * 0.048, sh * 0.2);
    // Feuillage — cercles superposés plus ou moins denses selon le tier
    const foliageCfg = tier >= 2
      ? [[tx, ty-0.3, 0.19],[tx-0.11, ty-0.22, 0.16],[tx+0.11, ty-0.22, 0.15],[tx, ty-0.15, 0.17]]
      : tier >= 1
      ? [[tx, ty-0.26, 0.18],[tx-0.1, ty-0.18, 0.15],[tx+0.09, ty-0.18, 0.14]]
      : [[tx, ty-0.22, 0.17],[tx-0.09, ty-0.15, 0.13]];
    for (const [fx, fy, fr] of foliageCfg) {
      ctx.fillStyle = "#284e14";
      ctx.beginPath(); ctx.arc(ox + sw * fx, oy + sh * fy, sw * fr, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(50,100,24,0.55)";
      ctx.beginPath(); ctx.arc(ox + sw * (fx - fr * 0.22), oy + sh * (fy - fr * 0.22), sw * fr * 0.62, 0, Math.PI * 2); ctx.fill();
    }
    // Fruits/baies (points colorés dans le feuillage)
    const allFruits = [
      [tx - 0.07, ty - 0.24, "#d03808"], [tx + 0.08, ty - 0.28, "#cc5010"],
      [tx - 0.01, ty - 0.32, "#c82808"], [tx + 0.13, ty - 0.20, "#d84010"],
      [tx + 0.02, ty - 0.17, "#e04818"], [tx - 0.12, ty - 0.17, "#c03210"]
    ];
    for (let fi = 0; fi < Math.min(allFruits.length, 2 + tier * 2); fi++) {
      const [ffx, ffy, ffc] = allFruits[fi];
      ctx.fillStyle = ffc;
      ctx.beginPath(); ctx.arc(ox + sw * ffx, oy + sh * ffy, sw * 0.029, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(255,210,160,0.4)";
      ctx.beginPath(); ctx.arc(ox + sw * (ffx - 0.008), oy + sh * (ffy - 0.008), sw * 0.011, 0, Math.PI * 2); ctx.fill();
    }

    // === PANIER (gauche, posé au sol) ===
    const bkx = 0.2, bky = 0.72;
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.beginPath(); ctx.ellipse(ox + sw * bkx, oy + sh * (bky + 0.045), sw * 0.13, sh * 0.04, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#8a5520";
    ctx.beginPath(); ctx.ellipse(ox + sw * bkx, oy + sh * bky, sw * 0.12, sh * 0.08, 0, 0, Math.PI * 2); ctx.fill();
    // Tressage (lignes horizontales)
    ctx.strokeStyle = "#6a3c10"; ctx.lineWidth = Math.max(0.5, sw * 0.018);
    for (let bi = 1; bi <= 3; bi++) {
      const by2 = bky - 0.06 + bi * 0.036;
      const bwi = 0.12 * Math.sqrt(1 - Math.pow((by2 - bky) / 0.08, 2));
      ctx.beginPath(); ctx.moveTo(ox + sw * (bkx - bwi), oy + sh * by2); ctx.lineTo(ox + sw * (bkx + bwi), oy + sh * by2); ctx.stroke();
    }
    // Rebord supérieur
    ctx.fillStyle = "#5e3210";
    ctx.beginPath(); ctx.ellipse(ox + sw * bkx, oy + sh * (bky - 0.045), sw * 0.12, sh * 0.038, 0, Math.PI, 0); ctx.fill();
    // Fruits déjà récoltés dans le panier
    if (tier >= 1) {
      ctx.fillStyle = "#c83010"; ctx.beginPath(); ctx.arc(ox + sw * (bkx - 0.04), oy + sh * (bky - 0.04), sw * 0.026, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#d04818"; ctx.beginPath(); ctx.arc(ox + sw * (bkx + 0.03), oy + sh * (bky - 0.05), sw * 0.023, 0, Math.PI * 2); ctx.fill();
    }

    // === PERSONNAGE — bras animé en train de cueillir ===
    const pick = (now / 680) % (Math.PI * 2);
    const reach = 0.45 + 0.55 * Math.abs(Math.sin(pick));
    const px2 = 0.43, py2 = 0.50;
    // Ombre au sol
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.beginPath(); ctx.ellipse(ox + sw * px2, oy + sh * (py2 + 0.2), sw * 0.07, sh * 0.028, 0, 0, Math.PI * 2); ctx.fill();
    // Jambes
    ctx.fillStyle = "#3a2614"; ctx.fillRect(ox + sw * (px2 - 0.032), oy + sh * (py2 + 0.06), sw * 0.062, sh * 0.14);
    // Corps
    ctx.fillStyle = "#5a3c1a"; ctx.fillRect(ox + sw * (px2 - 0.036), oy + sh * (py2 - 0.06), sw * 0.072, sh * 0.12);
    // Tête
    ctx.fillStyle = "#c48c50"; ctx.beginPath(); ctx.arc(ox + sw * px2, oy + sh * (py2 - 0.1), sw * 0.05, 0, Math.PI * 2); ctx.fill();
    // Bras tendu vers le buisson
    const aex = px2 + 0.08 + reach * 0.16, aey = py2 - 0.08 - reach * 0.09;
    ctx.strokeStyle = "#5a3c1a"; ctx.lineWidth = Math.max(1.5, sw * 0.042); ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(ox + sw * (px2 + 0.032), oy + sh * (py2 - 0.02)); ctx.lineTo(ox + sw * aex, oy + sh * aey); ctx.stroke();
    ctx.lineCap = "square";
    ctx.fillStyle = "#c48c50"; ctx.beginPath(); ctx.arc(ox + sw * aex, oy + sh * aey, sw * 0.032, 0, Math.PI * 2); ctx.fill();

    // Tier 2 : second cueilleur près du buisson
    if (tier >= 2) {
      const px3 = 0.54, py3 = 0.64;
      ctx.fillStyle = "rgba(0,0,0,0.18)"; ctx.beginPath(); ctx.ellipse(ox + sw * px3, oy + sh * (py3 + 0.14), sw * 0.06, sh * 0.025, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#2e1c0e"; ctx.fillRect(ox + sw * (px3 - 0.028), oy + sh * (py3 + 0.05), sw * 0.056, sh * 0.1);
      ctx.fillStyle = "#4a3014"; ctx.fillRect(ox + sw * (px3 - 0.032), oy + sh * (py3 - 0.04), sw * 0.064, sh * 0.1);
      ctx.fillStyle = "#b87848"; ctx.beginPath(); ctx.arc(ox + sw * px3, oy + sh * (py3 - 0.07), sw * 0.044, 0, Math.PI * 2); ctx.fill();
      const pick2 = (now / 620 + 1.8) % (Math.PI * 2);
      const reach2 = 0.4 + 0.5 * Math.abs(Math.sin(pick2));
      const ae2x = px3 + 0.06 + reach2 * 0.12, ae2y = py3 - 0.07 - reach2 * 0.08;
      ctx.strokeStyle = "#4a3014"; ctx.lineWidth = Math.max(1.5, sw * 0.038); ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(ox + sw * (px3 + 0.028), oy + sh * (py3 - 0.01)); ctx.lineTo(ox + sw * ae2x, oy + sh * ae2y); ctx.stroke();
      ctx.lineCap = "square";
      ctx.fillStyle = "#b87848"; ctx.beginPath(); ctx.arc(ox + sw * ae2x, oy + sh * ae2y, sw * 0.028, 0, Math.PI * 2); ctx.fill();
    }
    return;
  }
  if (id === "granaries_city") {
    px(0.12, 0.42, 0.76, 0.32, "#c9a84c");
    ctx.fillStyle = "#d8bd68";
    ctx.beginPath(); ctx.ellipse(ox + sw * 0.5, oy + sh * 0.43, sw * 0.38, sh * 0.16, 0, Math.PI, 0); ctx.fill();
    px(0.25, 0.57, 0.12, 0.17, "#6a4a10");
    px(0.63, 0.57, 0.12, 0.17, "#6a4a10");
    if (tier >= 1) strokeRect(0.08, 0.36, 0.84, 0.42, "#6a4a10");
    return;
  }
  if (id === "caravans") {
    // ── CHARRETTE MARCHANDE À L'ARRÊT ────────────────────────────────
    const cx2 = 0.5, cy2 = 0.5;
    // Ombre portée
    ctx.fillStyle = "rgba(0,0,0,0.2)";
    ctx.beginPath(); ctx.ellipse(ox+sw*(cx2+0.02), oy+sh*(cy2+0.24), sw*0.3, sh*0.07, 0, 0, Math.PI*2); ctx.fill();
    // Timon (avant, part vers la gauche)
    ctx.strokeStyle = "#7a4a18"; ctx.lineWidth = Math.max(1.5, sw*0.032); ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(ox+sw*(cx2-0.22), oy+sh*(cy2+0.06)); ctx.lineTo(ox+sw*(cx2-0.4), oy+sh*(cy2-0.02)); ctx.stroke();
    ctx.lineCap = "square";
    // Plancher de la charrette
    ctx.fillStyle = "#7a5018"; ctx.fillRect(ox+sw*(cx2-0.22), oy+sh*(cy2-0.04), sw*0.44, sh*0.18);
    // Planches (texture bois)
    ctx.strokeStyle = "rgba(50,28,6,0.3)"; ctx.lineWidth = Math.max(0.5, sw*0.016);
    for (let pi = 1; pi < 4; pi++) ctx.strokeRect(ox+sw*(cx2-0.20+pi*0.09), oy+sh*(cy2-0.03), sw*0.08, sh*0.16);
    // Ridelles et montants
    ctx.fillStyle = "#5a3a0c";
    ctx.fillRect(ox+sw*(cx2-0.22), oy+sh*(cy2-0.04), sw*0.44, sh*0.02);
    ctx.fillRect(ox+sw*(cx2-0.22), oy+sh*(cy2+0.12), sw*0.44, sh*0.02);
    ctx.fillRect(ox+sw*(cx2-0.22), oy+sh*(cy2-0.04), sw*0.02, sh*0.18);
    ctx.fillRect(ox+sw*(cx2+0.20), oy+sh*(cy2-0.04), sw*0.02, sh*0.18);
    // Bâche (toile de couverture bombée)
    ctx.fillStyle = "#c8a840";
    ctx.beginPath();
    ctx.moveTo(ox+sw*(cx2-0.19), oy+sh*(cy2-0.04));
    ctx.bezierCurveTo(ox+sw*(cx2-0.19), oy+sh*(cy2-0.22), ox+sw*(cx2+0.19), oy+sh*(cy2-0.22), ox+sw*(cx2+0.19), oy+sh*(cy2-0.04));
    ctx.closePath(); ctx.fill();
    // Plis de la bâche
    ctx.strokeStyle = "rgba(155,120,25,0.48)"; ctx.lineWidth = Math.max(0.5, sw*0.02);
    for (let bi = -1; bi <= 1; bi++) {
      const bpx = cx2 + bi * 0.1;
      ctx.beginPath(); ctx.moveTo(ox+sw*bpx, oy+sh*(cy2-0.04)); ctx.quadraticCurveTo(ox+sw*(bpx+0.015), oy+sh*(cy2-0.16), ox+sw*bpx, oy+sh*(cy2-0.22)); ctx.stroke();
    }
    // Grandes roues (vue de côté légèrement inclinée)
    for (const wrx of [cx2-0.17, cx2+0.17]) {
      ctx.fillStyle = "#2a1606";
      ctx.beginPath(); ctx.ellipse(ox+sw*wrx, oy+sh*(cy2+0.2), sw*0.065, sh*0.046, 0, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = "#5a3210"; ctx.lineWidth = Math.max(0.5, sw*0.015);
      for (let ri = 0; ri < 4; ri++) {
        const ra = ri * Math.PI / 4;
        ctx.beginPath(); ctx.moveTo(ox+sw*wrx, oy+sh*(cy2+0.2)); ctx.lineTo(ox+sw*(wrx+Math.cos(ra)*0.06), oy+sh*(cy2+0.2+Math.sin(ra)*0.042)); ctx.stroke();
      }
      ctx.strokeStyle = "#4a2808"; ctx.lineWidth = Math.max(1, sw*0.022);
      ctx.beginPath(); ctx.ellipse(ox+sw*wrx, oy+sh*(cy2+0.2), sw*0.065, sh*0.046, 0, 0, Math.PI*2); ctx.stroke();
    }
    // Marchandises et barils à côté (tier 1+)
    if (tier >= 1) {
      // Baril
      ctx.fillStyle = "#6a3c10";
      ctx.beginPath(); ctx.ellipse(ox+sw*(cx2+0.34), oy+sh*(cy2+0.12), sw*0.058, sh*0.048, 0, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = "#8a5020";
      ctx.beginPath(); ctx.ellipse(ox+sw*(cx2+0.34), oy+sh*(cy2+0.07), sw*0.058, sh*0.025, 0, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = "#4a2808"; ctx.lineWidth = Math.max(0.5, sw*0.016);
      ctx.beginPath(); ctx.ellipse(ox+sw*(cx2+0.34), oy+sh*(cy2+0.12), sw*0.058, sh*0.048, 0, 0, Math.PI*2); ctx.stroke();
      // Caisse
      ctx.fillStyle = "#9a6828"; ctx.fillRect(ox+sw*(cx2-0.42), oy+sh*(cy2+0.08), sw*0.1, sh*0.09);
      ctx.fillStyle = "#7a5018"; ctx.fillRect(ox+sw*(cx2-0.42), oy+sh*(cy2), sw*0.1, sh*0.09);
      ctx.strokeStyle = "rgba(50,28,8,0.45)"; ctx.lineWidth = Math.max(0.5, sw*0.014);
      ctx.strokeRect(ox+sw*(cx2-0.42), oy+sh*(cy2+0.08), sw*0.1, sh*0.09);
      ctx.strokeRect(ox+sw*(cx2-0.42), oy+sh*(cy2), sw*0.1, sh*0.09);
    }
    return;
  }
  if (id === "markets") {
    // ── ÉTALS DE MARCHÉ ──────────────────────────────────────────────
    const stallColors = ["#c03828","#2a6888","#d4a018","#386830"];
    const goodColors  = ["#e05030","#f0c040","#60a840","#e8804a","#9060c0","#e8e080"];
    const nStalls = tier >= 2 ? 4 : tier >= 1 ? 3 : 2;
    const cols = nStalls <= 2 ? 2 : 2;
    const rows = nStalls <= 2 ? 1 : 2;
    for (let si = 0; si < nStalls; si++) {
      const col = si % cols, row = Math.floor(si / cols);
      const sx2 = 0.1 + col * 0.48, sy2 = 0.14 + row * 0.46;
      // Table/comptoir
      ctx.fillStyle = "#7a5020"; ctx.fillRect(ox+sw*sx2, oy+sh*(sy2+0.18), sw*0.38, sh*0.16);
      ctx.fillStyle = "#9a6830"; ctx.fillRect(ox+sw*sx2, oy+sh*(sy2+0.18), sw*0.38, sh*0.04);
      // Auvent (canopée colorée, légère avancée)
      ctx.fillStyle = stallColors[si % stallColors.length];
      ctx.fillRect(ox+sw*(sx2-0.02), oy+sh*sy2, sw*0.42, sh*0.12);
      // Rayures sur l'auvent
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      for (let ri2 = 0; ri2 < 3; ri2++) ctx.fillRect(ox+sw*(sx2+ri2*0.12), oy+sh*sy2, sw*0.04, sh*0.12);
      // Ombre sous l'auvent
      ctx.fillStyle = "rgba(0,0,0,0.2)"; ctx.fillRect(ox+sw*sx2, oy+sh*(sy2+0.12), sw*0.38, sh*0.04);
      // Marchandises sur le comptoir
      for (let gi = 0; gi < 4; gi++) {
        const gx2 = sx2 + 0.04 + gi * 0.08;
        ctx.fillStyle = goodColors[(si * 3 + gi) % goodColors.length];
        ctx.beginPath(); ctx.arc(ox+sw*(gx2+0.02), oy+sh*(sy2+0.22), sw*0.03, 0, Math.PI*2); ctx.fill();
      }
      // Vendeur (silhouette derrière le comptoir)
      ctx.fillStyle = "#4a3018";
      ctx.fillRect(ox+sw*(sx2+0.15), oy+sh*(sy2+0.34), sw*0.08, sh*0.1);
      ctx.fillStyle = "#c49060";
      ctx.beginPath(); ctx.arc(ox+sw*(sx2+0.19), oy+sh*(sy2+0.32), sw*0.04, 0, Math.PI*2); ctx.fill();
    }
    return;
  }
  if (id === "guilds") {
    // ── QG MILITAIRE / RELIGIEUX ──────────────────────────────────────
    // Corps principal (pierre massive)
    ctx.fillStyle = "#8a7860"; ctx.fillRect(ox+sw*0.12, oy+sh*0.26, sw*0.76, sh*0.6);
    // Ombre côté droit
    ctx.fillStyle = "rgba(0,0,0,0.18)"; ctx.fillRect(ox+sw*0.72, oy+sh*0.26, sw*0.16, sh*0.6);
    // Tours d'angle
    ctx.fillStyle = "#7a6850";
    ctx.fillRect(ox+sw*0.08, oy+sh*0.2, sw*0.2, sh*0.66);
    ctx.fillRect(ox+sw*0.72, oy+sh*0.2, sw*0.2, sh*0.66);
    // Créneaux sur les tours
    ctx.fillStyle = "#6a5840";
    for (let ci = 0; ci < 3; ci++) {
      ctx.fillRect(ox+sw*(0.09+ci*0.055), oy+sh*0.16, sw*0.035, sh*0.07);
      ctx.fillRect(ox+sw*(0.73+ci*0.055), oy+sh*0.16, sw*0.035, sh*0.07);
    }
    // Mâchicoulis du corps principal
    ctx.fillStyle = "#6a5840"; ctx.fillRect(ox+sw*0.12, oy+sh*0.22, sw*0.76, sh*0.055);
    for (let ci = 0; ci < 5; ci++) ctx.fillRect(ox+sw*(0.16+ci*0.14), oy+sh*0.18, sw*0.06, sh*0.06);
    // Grande porte à arc en plein cintre
    ctx.fillStyle = "rgba(15,10,4,0.75)";
    ctx.beginPath(); ctx.arc(ox+sw*0.5, oy+sh*0.62, sw*0.1, Math.PI, 0); ctx.fill();
    ctx.fillRect(ox+sw*0.4, oy+sh*0.62, sw*0.2, sh*0.24);
    ctx.fillStyle = "#5a4030"; // herse/portail
    ctx.fillRect(ox+sw*0.42, oy+sh*0.64, sw*0.16, sh*0.14);
    ctx.strokeStyle = "rgba(80,55,20,0.6)"; ctx.lineWidth = Math.max(0.5, sw*0.02);
    for (let gi = 0; gi < 3; gi++) { ctx.beginPath(); ctx.moveTo(ox+sw*(0.44+gi*0.06), oy+sh*0.64); ctx.lineTo(ox+sw*(0.44+gi*0.06), oy+sh*0.78); ctx.stroke(); }
    // Fenêtres à meurtrières
    ctx.fillStyle = litWarm;
    ctx.fillRect(ox+sw*0.22, oy+sh*0.42, sw*0.06, sh*0.1);
    ctx.fillRect(ox+sw*0.72, oy+sh*0.42, sw*0.06, sh*0.1);
    ctx.fillRect(ox+sw*0.26, oy+sh*0.56, sw*0.05, sh*0.08);
    ctx.fillRect(ox+sw*0.69, oy+sh*0.56, sw*0.05, sh*0.08);
    // Croix / emblème sur le corps
    ctx.fillStyle = tier >= 2 ? "#c0a030" : "#9a8060";
    ctx.fillRect(ox+sw*0.47, oy+sh*0.3, sw*0.06, sh*0.18); // vertical
    ctx.fillRect(ox+sw*0.4, oy+sh*0.38, sw*0.2, sh*0.06);  // horizontal
    // Bannière
    ctx.fillStyle = "#a02020"; ctx.fillRect(ox+sw*0.46, oy+sh*0.12, sw*0.16, sh*0.1);
    ctx.strokeStyle = "#7a1010"; ctx.lineWidth = Math.max(0.5, sw*0.016);
    ctx.beginPath(); ctx.moveTo(ox+sw*0.46, oy+sh*0.08); ctx.lineTo(ox+sw*0.46, oy+sh*0.22); ctx.stroke();
    return;
  }
  if (id === "irrigated_fields") {
    // ── CHAMPS IRRIGUÉS + ANIMATION D'ARROSAGE ───────────────────────
    const nRows = 4 + tier;
    // Rangées de cultures (alternance vert clair/foncé)
    for (let ri = 0; ri < nRows; ri++) {
      const fy = 0.1 + ri * (0.8 / nRows), fh = 0.8 / nRows * 0.82;
      ctx.fillStyle = ri % 2 === 0 ? "#4a7c28" : "#3c6820";
      ctx.fillRect(ox+sw*0.1, oy+sh*fy, sw*0.8, sh*fh);
      // Sillons (petits traits dans chaque rangée)
      ctx.strokeStyle = "rgba(28,50,12,0.3)"; ctx.lineWidth = Math.max(0.5, sw*0.012);
      for (let si2 = 1; si2 < 4; si2++) ctx.strokeRect(ox+sw*(0.12+si2*0.17), oy+sh*(fy+0.01), sw*0.15, sh*(fh-0.02));
    }
    // Canal vertical central (eau)
    ctx.fillStyle = "#2a5a8a"; ctx.fillRect(ox+sw*0.47, oy+sh*0.08, sw*0.06, sh*0.84);
    // Canal horizontal central
    ctx.fillStyle = "#2a5a8a"; ctx.fillRect(ox+sw*0.1, oy+sh*0.47, sw*0.8, sh*0.05);
    // Reflets d'eau animés sur les canaux
    ctx.fillStyle = "rgba(120,190,255,0.35)";
    ctx.fillRect(ox+sw*0.485, oy+sh*0.08, sw*0.03, sh*0.84);
    ctx.fillRect(ox+sw*0.1, oy+sh*0.476, sw*0.8, sh*0.022);
    // Animation : gouttelettes / vaguelettes qui se déplacent sur les canaux
    const waterFlow = (now / 600) % 1;
    ctx.fillStyle = "rgba(160,220,255,0.55)";
    for (let di = 0; di < 4; di++) {
      const dropY = ((waterFlow + di * 0.25) % 1);
      ctx.beginPath(); ctx.ellipse(ox+sw*0.5, oy+sh*(0.1+dropY*0.8), sw*0.018, sh*0.014, 0, 0, Math.PI*2); ctx.fill();
    }
    // Gouttelettes horizontales
    const flowH = (now / 700) % 1;
    for (let di = 0; di < 3; di++) {
      const dropX = ((flowH + di * 0.33) % 1);
      ctx.beginPath(); ctx.ellipse(ox+sw*(0.12+dropX*0.76), oy+sh*0.495, sw*0.014, sh*0.018, 0, 0, Math.PI*2); ctx.fill();
    }
    // Puits / vanne d'irrigation (coin)
    px(0.72, 0.08, 0.18, 0.16, "#6a4a1a");
    ctx.fillStyle = "#8a6428"; ctx.beginPath(); ctx.arc(ox+sw*0.81, oy+sh*0.16, sw*0.06, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = "#5a3810"; ctx.lineWidth = Math.max(1, sw*0.025);
    ctx.beginPath(); ctx.moveTo(ox+sw*0.81, oy+sh*0.1); ctx.lineTo(ox+sw*0.81, oy+sh*0.22); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ox+sw*0.75, oy+sh*0.16); ctx.lineTo(ox+sw*0.87, oy+sh*0.16); ctx.stroke();
    return;
  }
  if (id === "river_ports") {
    px(0.1, 0.54, 0.8, 0.16, "#6a4a10");
    for (let i = 0; i < 5; i += 1) px(0.16 + i * 0.14, 0.42, 0.035, 0.34, "#5a3a10");
    ctx.fillStyle = "#5a4326";
    ctx.beginPath();
    ctx.moveTo(ox + sw * 0.38, oy + sh * 0.72); ctx.lineTo(ox + sw * 0.7, oy + sh * 0.72);
    ctx.lineTo(ox + sw * 0.62, oy + sh * 0.82); ctx.lineTo(ox + sw * 0.44, oy + sh * 0.82);
    ctx.closePath(); ctx.fill();
    px(0.54, 0.4, 0.035, 0.32, "#e8d5b0");
    ctx.fillStyle = "#e8d5b0";
    ctx.beginPath(); ctx.moveTo(ox + sw * 0.58, oy + sh * 0.43); ctx.lineTo(ox + sw * 0.72, oy + sh * 0.62); ctx.lineTo(ox + sw * 0.58, oy + sh * 0.66); ctx.closePath(); ctx.fill();
    return;
  }
  if (id === "water_mills") {
    px(0.06, 0.62, 0.86, 0.12, "#6a4a10");
    px(0.12, 0.72, 0.76, 0.05, "#5a3a10");
    px(0.16, 0.22, 0.36, 0.42, "#8b6914");
    ctx.fillStyle = "#5a3a10";
    ctx.beginPath(); ctx.moveTo(ox + sw * 0.12, oy + sh * 0.25); ctx.lineTo(ox + sw * 0.34, oy + sh * 0.06); ctx.lineTo(ox + sw * 0.56, oy + sh * 0.25); ctx.closePath(); ctx.fill();
    px(0.26, 0.43, 0.1, 0.18, "#2a1a0c");
    const cx = ox + sw * 0.68, cy = oy + sh * 0.68, rr = Math.min(sw, sh) * 0.24;
    ctx.strokeStyle = "#5a3a10"; ctx.lineWidth = Math.max(1, sw * 0.04);
    ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = "#7a5418";
    for (let i = 0; i < 6; i += 1) {
      const a = now / 450 + i * Math.PI / 3;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); ctx.stroke();
    }
    return;
  }
  if (id === "mint_houses") {
    // ── HÔTEL DES MONNAIES — coffres, pièces, balances ───────────────
    // Bâtiment sécurisé (murs épais, pierre)
    ctx.fillStyle = "#a89060"; ctx.fillRect(ox+sw*0.14, oy+sh*0.24, sw*0.72, sh*0.6);
    ctx.fillStyle = "rgba(0,0,0,0.16)"; ctx.fillRect(ox+sw*0.7, oy+sh*0.24, sw*0.16, sh*0.6);
    // Toit mansardé (banque classique)
    ctx.fillStyle = "#6a5838"; ctx.fillRect(ox+sw*0.1, oy+sh*0.18, sw*0.8, sh*0.1);
    ctx.fillStyle = "#504430";
    ctx.beginPath(); ctx.moveTo(ox+sw*0.08, oy+sh*0.28); ctx.lineTo(ox+sw*0.5, oy+sh*0.1); ctx.lineTo(ox+sw*0.92, oy+sh*0.28); ctx.lineTo(ox+sw*0.86, oy+sh*0.22); ctx.lineTo(ox+sw*0.5, oy+sh*0.14); ctx.lineTo(ox+sw*0.14, oy+sh*0.22); ctx.closePath(); ctx.fill();
    // Grilles de fenêtres (sécurité)
    ctx.fillStyle = litGold;
    ctx.fillRect(ox+sw*0.22, oy+sh*0.38, sw*0.14, sh*0.11);
    ctx.fillRect(ox+sw*0.64, oy+sh*0.38, sw*0.14, sh*0.11);
    ctx.strokeStyle = "rgba(60,40,10,0.6)"; ctx.lineWidth = Math.max(0.5, sw*0.018);
    for (const gx2 of [0.22, 0.64]) {
      ctx.strokeRect(ox+sw*gx2, oy+sh*0.38, sw*0.14, sh*0.11);
      ctx.beginPath(); ctx.moveTo(ox+sw*(gx2+0.07), oy+sh*0.38); ctx.lineTo(ox+sw*(gx2+0.07), oy+sh*0.49); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ox+sw*gx2, oy+sh*0.445); ctx.lineTo(ox+sw*(gx2+0.14), oy+sh*0.445); ctx.stroke();
    }
    // Porte de coffre (centrale, ronde)
    ctx.fillStyle = "#4a3818"; ctx.beginPath(); ctx.arc(ox+sw*0.5, oy+sh*0.68, sw*0.1, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = "#c8a030"; ctx.lineWidth = Math.max(1.5, sw*0.03);
    ctx.beginPath(); ctx.arc(ox+sw*0.5, oy+sh*0.68, sw*0.1, 0, Math.PI*2); ctx.stroke();
    ctx.strokeStyle = "#a07820"; ctx.lineWidth = Math.max(1, sw*0.022);
    for (let ri = 0; ri < 4; ri++) {
      const ra = ri * Math.PI/4;
      ctx.beginPath(); ctx.moveTo(ox+sw*0.5, oy+sh*0.68); ctx.lineTo(ox+sw*(0.5+Math.cos(ra)*0.09), oy+sh*(0.68+Math.sin(ra)*0.09)); ctx.stroke();
    }
    ctx.fillStyle = "#d4a828"; ctx.beginPath(); ctx.arc(ox+sw*0.5, oy+sh*0.68, sw*0.04, 0, Math.PI*2); ctx.fill();
    // Pièces d'or animées (sortent du toit en fumée d'activité)
    for (let k = 0; k < 2 + tier; k++) {
      const ph = ((now / 1400 + k * 0.38) % 1);
      const coinX = ox + sw*(0.34 + k*0.14);
      const coinY = oy + sh*(0.18 - ph*0.15);
      ctx.fillStyle = `rgba(210,165,20,${(Math.sin(ph*Math.PI)*0.85).toFixed(2)})`;
      ctx.beginPath(); ctx.arc(coinX, coinY, Math.max(1.5, sw*0.036), 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = `rgba(160,110,10,${(Math.sin(ph*Math.PI)*0.6).toFixed(2)})`;
      ctx.lineWidth = Math.max(0.5, sw*0.012);
      ctx.beginPath(); ctx.arc(coinX, coinY, Math.max(1.5, sw*0.036), 0, Math.PI*2); ctx.stroke();
    }
    // Balance (symbole sur le fronton)
    ctx.fillStyle = "#c8a030"; ctx.fillRect(ox+sw*0.47, oy+sh*0.14, sw*0.06, sh*0.07);
    ctx.beginPath(); ctx.moveTo(ox+sw*0.38, oy+sh*0.16); ctx.lineTo(ox+sw*0.62, oy+sh*0.16); ctx.stroke();
    ctx.beginPath(); ctx.arc(ox+sw*0.38, oy+sh*0.19, sw*0.04, 0, Math.PI); ctx.stroke();
    ctx.beginPath(); ctx.arc(ox+sw*0.62, oy+sh*0.19, sw*0.04, 0, Math.PI); ctx.stroke();
    return;
  }
  if (id === "imperial_exchanges") {
    // ── GRANDE BANQUE NÉOCLASSIQUE (style Banque de France / FMI) ────
    // Escalier monumental
    const nSteps = 4;
    for (let si = nSteps; si >= 0; si--) {
      const sw2 = 0.1 + (si/nSteps)*0.8, sh2 = 0.04;
      ctx.fillStyle = si%2===0 ? "#d8d0b0" : "#e8e0c0";
      ctx.fillRect(ox+sw*(0.5-sw2/2), oy+sh*(0.76-si*sh2), sw*sw2, sh*(sh2+0.005));
    }
    const podY = 0.6;
    // Corps principal (marbre / pierre de taille)
    ctx.fillStyle = "#d4c898"; ctx.fillRect(ox+sw*0.06, oy+sh*podY, sw*0.88, sh*0.28);
    ctx.fillStyle = "rgba(0,0,0,0.14)"; ctx.fillRect(ox+sw*0.78, oy+sh*podY, sw*0.16, sh*0.28);
    // Colonnes (proportionnelles au tier)
    const nCols = 6 + Math.min(4, tier * 2);
    ctx.fillStyle = "#e8e0c0";
    for (let ci = 0; ci < nCols; ci++) {
      const cx2 = ox + sw*(0.1 + ci*(0.8/(nCols-1)));
      ctx.fillRect(cx2 - sw*0.02, oy+sh*podY, sw*0.04, sh*0.28);
      ctx.fillStyle = "rgba(0,0,0,0.12)"; ctx.fillRect(cx2+sw*0.01, oy+sh*podY, sw*0.012, sh*0.28);
      ctx.fillStyle = "#e8e0c0";
      // Chapiteau
      ctx.fillRect(cx2-sw*0.032, oy+sh*podY, sw*0.064, sh*0.026);
    }
    // Architrave
    ctx.fillStyle = "#b8b090"; ctx.fillRect(ox+sw*0.06, oy+sh*podY, sw*0.88, sh*0.03);
    // Frise
    ctx.fillStyle = "#c8c0a0"; ctx.fillRect(ox+sw*0.06, oy+sh*(podY-0.05), sw*0.88, sh*0.05);
    for (let fi = 0; fi < 8; fi++) {
      ctx.fillStyle = fi%2===0 ? "rgba(120,100,50,0.5)" : "rgba(200,180,100,0.4)";
      ctx.fillRect(ox+sw*(0.08+fi*0.11), oy+sh*(podY-0.048), sw*0.075, sh*0.045);
    }
    // Grand fronton triangulaire
    const frontH = 0.14;
    ctx.fillStyle = "#9a9070";
    ctx.beginPath(); ctx.moveTo(ox+sw*0.06, oy+sh*(podY-0.05)); ctx.lineTo(ox+sw*0.5, oy+sh*(podY-0.05-frontH)); ctx.lineTo(ox+sw*0.94, oy+sh*(podY-0.05)); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#b0a880";
    ctx.beginPath(); ctx.moveTo(ox+sw*0.1, oy+sh*(podY-0.05)); ctx.lineTo(ox+sw*0.5, oy+sh*(podY-0.05-frontH+0.02)); ctx.lineTo(ox+sw*0.9, oy+sh*(podY-0.05)); ctx.closePath(); ctx.fill();
    // Acrotères + ornements
    ctx.fillStyle = "#c8b858";
    for (const ax of [0.06, 0.5, 0.94]) {
      const ay = ax===0.5 ? podY-0.05-frontH : podY-0.05;
      ctx.beginPath(); ctx.moveTo(ox+sw*(ax-0.024), oy+sh*ay); ctx.lineTo(ox+sw*ax, oy+sh*(ay-0.048)); ctx.lineTo(ox+sw*(ax+0.024), oy+sh*ay); ctx.closePath(); ctx.fill();
    }
    // Dôme central (tiers élevés)
    if (tier >= 2) {
      const domeX = ox+sw*0.5, domeY = oy+sh*(podY-0.05-frontH);
      ctx.fillStyle = "#c0b870"; ctx.beginPath(); ctx.arc(domeX, domeY, sw*0.08, Math.PI, 0); ctx.fill();
      ctx.fillStyle = "#e8d880"; ctx.beginPath(); ctx.arc(domeX-sw*0.02, domeY-sh*0.02, sw*0.035, Math.PI*1.1, Math.PI*1.9); ctx.fill();
      ctx.strokeStyle = "#9a8840"; ctx.lineWidth = Math.max(0.5, sw*0.018);
      ctx.beginPath(); ctx.moveTo(domeX, domeY-sw*0.08); ctx.lineTo(domeX, domeY-sw*0.13); ctx.stroke();
    }
    // Grandes portes + fenêtres hautes
    ctx.fillStyle = "rgba(15,12,6,0.7)"; ctx.fillRect(ox+sw*0.42, oy+sh*(podY+0.14), sw*0.16, sh*0.14);
    ctx.fillStyle = litGold;
    for (let wi = 0; wi < 4; wi++) ctx.fillRect(ox+sw*(0.14+wi*0.18), oy+sh*(podY+0.05), sw*0.08, sh*0.1);
    return;
  }
}

function drawTile(t, now, timeWear, maxD2) {
  const spanX = t.spanX || t.size || 1;
  const spanY = t.spanY || t.size || 1;
  const s = CM.TILE * CM.cam.zoom;
  const sx = (t.gx * CM.TILE - CM.cam.x) * CM.cam.zoom + CM.cw / 2;
  const sy = (t.gy * CM.TILE - CM.cam.y) * CM.cam.zoom + CM.ch / 2;
  const boxW = s * spanX, boxH = s * spanY;
  if (sx < -boxW || sy < -boxH || sx > CM.cw + boxW || sy > CM.ch + boxH) return;
  const ctx = CM.ctx;

  // Degradation peripherique (usure > 50%).
  const degradeFrac = timeWear > 0.5 ? (timeWear - 0.5) / 0.5 : 0;
  const norm = t.d2 / maxD2;
  const degraded = degradeFrac > 0 && norm > (1 - degradeFrac);

  // Anim de construction (apparition 0.5s).
  const born = CM.born[t.key] || now;
  const appearMs = t.type === "engine" ? 800 : 500;
  const prog = Math.max(0, Math.min(1, (now - born) / appearMs));
  let e = prog * prog * (3 - 2 * prog); // smoothstep
  if (t.type === "engine" && prog < 1) e *= 1 + Math.sin(prog * Math.PI) * 0.08;
  const inset = (1 - e) * Math.min(boxW, boxH) * 0.5;
  let x = sx + inset, y = sy + inset, w = boxW - inset * 2, h = boxH - inset * 2;
  if (w <= 0.5) return;
  ctx.globalAlpha = e;
  const pad = s * 0.12;
  const zc = CM.cam.zoom;
  let tileLumDelta = 0;

  // Effondrement : la ville s'ecroule du centre vers l'exterieur (shrink puis ruine).
  if (CM.collapseAt) {
    const ct = (now - CM.collapseAt) / 1000;
    const sp = Math.max(0, Math.min(1, (ct - norm * 1.1) / 0.6));
    if (sp >= 1) {
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#2a2018";
      ctx.fillRect(x + pad, y + h * 0.52, w - pad * 2, h * 0.4);
      ctx.fillStyle = "#4a4030";
      ctx.fillRect(x + w * 0.3, y + h * 0.58, w * 0.18, h * 0.16);
      ctx.fillRect(x + w * 0.56, y + h * 0.66, w * 0.16, h * 0.14);
      return;
    }
    const k = 1 - sp * 0.85;
    const fx = x + w / 2, fy = y + h;     // se tasse vers le sol
    w *= k; h *= k; x = fx - w / 2; y = fy - h;
  }

  // Variation par batiment (seed stable sur x,y) : taille, decalage 1px, luminosite, micro-ombre.
  if (t.type !== "farm" && t.type !== "engine") {
    const seedV = cmHash(t.gx + ":" + t.gy);
    const sizeVar = 0.82 + (seedV % 37) / 37 * 0.28;   // 0.82..1.10
    const offX = (((seedV >> 5) % 3) - 1);             // -1..1 px
    const offY = (((seedV >> 7) % 3) - 1);
    const ccx = x + w / 2, ccy = y + h / 2;
    w *= sizeVar; h *= sizeVar;
    x = ccx - w / 2 + offX; y = ccy - h / 2 + offY;
    tileLumDelta = (((seedV >> 9) % 31) / 31 - 0.5) * 0.3; // ~ +/-15%
    const sh = Math.max(1.2, 2.4 * zc);                // micro-ombre portee bas-droite
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.fillRect(x + pad + sh, y + pad + sh, w - pad * 2, h - pad * 2);
  }

  if (t.type === "engine") {
    drawEngineSprite(t, x, y, w, h, now);
    // ── Héritage Babel : halo doré pour les tuiles adjacentes du même type ──
    if (state?.babelHeritage && t.buildingId) {
      const tileMap = CM.layout?.engineTileMap;
      if (tileMap) {
        const tileCat = buildingById?.[t.buildingId]?.category;
        if (tileCat) {
          const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
          let adjCount = 0;
          for (const [dx, dy] of DIRS) {
            const nb = tileMap.get((t.gx + dx) + "," + (t.gy + dy));
            if (nb && buildingById?.[nb.buildingId]?.category === tileCat) adjCount++;
          }
          if (adjCount > 0) {
            const ctx = CM.ctx;
            ctx.save();
            ctx.globalAlpha = Math.min(0.45, 0.15 + adjCount * 0.10);
            ctx.fillStyle = "#c9a840";
            ctx.fillRect(x, y, w, h);
            ctx.globalAlpha = Math.min(0.75, 0.28 + adjCount * 0.16);
            ctx.strokeStyle = "#f0d070";
            ctx.lineWidth = Math.max(1, w * 0.055);
            ctx.strokeRect(x + ctx.lineWidth / 2, y + ctx.lineWidth / 2, w - ctx.lineWidth, h - ctx.lineWidth);
            ctx.restore();
          }
        }
      }
    }
  } else if (t.type === "farm") {
    ctx.fillStyle = t.variant === "industrial" ? "#657239" : t.variant === "patch" ? "#3f6424" : "#4a7a2a";
    ctx.fillRect(x + pad, y + pad, w - pad * 2, h - pad * 2);
    ctx.strokeStyle = t.variant === "industrial" ? "#9a8f48" : "#3a6a1a";
    ctx.lineWidth = Math.max(1, s * 0.05);
    if (t.variant === "industrial") {
      ctx.strokeRect(x + w * 0.24, y + h * 0.24, w * 0.52, h * 0.52);
      ctx.fillStyle = "rgba(25,18,8,0.35)";
      ctx.fillRect(x + w * 0.4, y + h * 0.12, w * 0.2, h * 0.74);
    } else {
      for (let li = 1; li <= 3; li += 1) {
        const ly = y + pad + (h - pad * 2) * li / 4;
        ctx.beginPath(); ctx.moveTo(x + pad, ly); ctx.lineTo(x + w - pad, ly); ctx.stroke();
      }
    }
  } else {
    // Corps du batiment
    if (t.type === "house") {
      drawHouseShape(x, y, w, h, pad, CM.layout?.counts?.urbanTier || 0, t.gx * 13 + t.gy * 7, t.variant, now);
    } else if (t.type === "public") {
      drawPublicShape(t.type, x, y, w, h, pad, CM.layout?.counts?.urbanTier || 0, t.variant, now);
    } else if (t.type === "library") {
      drawPublicShape(t.type, x, y, w, h, pad, CM.layout?.counts?.urbanTier || 0, t.variant, now);
    } else {
      ctx.fillStyle = baseColor(t.type, t.variant);
      ctx.fillRect(x + pad, y + pad, w - pad * 2, h - pad * 2);
    }
  }

  // Variation de luminosite (clair/sombre selon le seed).
  if (t.type !== "farm" && Math.abs(tileLumDelta) > 0.02) {
    ctx.fillStyle = tileLumDelta > 0 ? `rgba(255,240,210,${tileLumDelta.toFixed(2)})` : `rgba(0,0,0,${(-tileLumDelta).toFixed(2)})`;
    ctx.fillRect(x + pad, y + pad, w - pad * 2, h - pad * 2);
  }

  // Surcouche de degradation (usure > 60% : assombrissement + fissures diagonales).
  if (degraded) {
    ctx.fillStyle = "rgba(20,14,8,0.45)"; ctx.fillRect(x + pad, y + pad, w - pad * 2, h - pad * 2);
    ctx.strokeStyle = "rgba(10,6,3,0.7)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + w * 0.3, y + pad); ctx.lineTo(x + w * 0.55, y + h - pad); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + w * 0.62, y + pad); ctx.lineTo(x + w * 0.42, y + h - pad); ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Fumee industrielle (ere avancee) sur certains batiments.
  const eb = (CM.layout && CM.layout.counts) ? CM.layout.counts.eraBand : 0;
  if (eb >= 4 && (t.variant === "block" || t.variant === "tenement" || t.variant === "industrial" || t.type === "public") && ((t.gx * 7 + t.gy * 13) % 3 === 0)) {
    const cxs = x + w * 0.5;
    for (let k = 0; k < 2; k += 1) {
      const ph = ((now / 1400) + k * 0.5 + t.gx * 0.13) % 1;
      const py = y + h * 0.12 - ph * h * 1.1;
      ctx.fillStyle = `rgba(72,66,60,${((1 - ph) * 0.3).toFixed(2)})`;
      ctx.beginPath(); ctx.arc(cxs + Math.sin(ph * 6 + t.gx) * w * 0.12, py, w * (0.1 + ph * 0.16), 0, Math.PI * 2); ctx.fill();
    }
  }

  // Feu (usure > 80% sur batiments degrades).
  if (timeWear > 0.8 && degraded && t.type !== "farm") {
    const fireSeed = (t.gx * 31 + t.gy * 17);
    if ((fireSeed % 5) < 3) {
      const fl = 0.55 + 0.45 * Math.abs(Math.sin(now / 130 + fireSeed));
      const fx = x + w / 2, fy = y + h * 0.55, fr = w * 0.42 * fl;
      const g = ctx.createRadialGradient(fx, fy, 0, fx, fy, fr);
      g.addColorStop(0, "rgba(255,228,120," + fl.toFixed(2) + ")");
      g.addColorStop(0.5, "rgba(240,120,30," + (fl * 0.8).toFixed(2) + ")");
      g.addColorStop(1, "rgba(180,40,20,0)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(fx, fy, fr, 0, Math.PI * 2); ctx.fill();
    }
  }
}

function drawCentralFire(now) {
  const L = CM.layout;
  if (!L || !L.counts || L.counts.eraBand > 0) return;
  const z = CM.cam.zoom, s = CM.TILE * z;
  const cx = ((L.cx + 0.5) * CM.TILE - CM.cam.x) * z + CM.cw / 2;
  const cy = ((L.cy + 0.5) * CM.TILE - CM.cam.y) * z + CM.ch / 2;
  if (cx < -s * 2 || cx > CM.cw + s * 2 || cy < -s * 2 || cy > CM.ch + s * 2) return;
  const ctx = CM.ctx;
  const t = now || 0;
  const r = s * 0.55; // rayon du feu proportionnel au zoom

  // Halo rayonnant
  const halo = 0.22 + 0.10 * Math.abs(Math.sin(t / 520));
  const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 2.2);
  rg.addColorStop(0, `rgba(255,165,35,${halo.toFixed(2)})`);
  rg.addColorStop(0.6, `rgba(255,80,10,${(halo * 0.35).toFixed(2)})`);
  rg.addColorStop(1, "rgba(255,60,5,0)");
  ctx.fillStyle = rg;
  ctx.beginPath(); ctx.arc(cx, cy, r * 2.2, 0, Math.PI * 2); ctx.fill();

  // Cercle de pierres
  ctx.fillStyle = "#5a4830";
  for (let i = 0; i < 7; i++) {
    const a = i * Math.PI * 2 / 7;
    ctx.beginPath(); ctx.arc(cx + Math.cos(a) * r * 0.48, cy + Math.sin(a) * r * 0.4, Math.max(1.5, r * 0.1), 0, Math.PI * 2); ctx.fill();
  }
  // Bûches en croix
  ctx.lineWidth = Math.max(2, r * 0.14); ctx.lineCap = "round";
  ctx.strokeStyle = "#6a3c0c";
  ctx.beginPath(); ctx.moveTo(cx - r*0.38, cy + r*0.14); ctx.lineTo(cx + r*0.38, cy - r*0.14); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + r*0.38, cy + r*0.14); ctx.lineTo(cx - r*0.38, cy - r*0.14); ctx.stroke();
  ctx.lineCap = "square";
  // Braises
  ctx.fillStyle = "rgba(200,60,5,0.82)";
  ctx.beginPath(); ctx.ellipse(cx, cy + r*0.05, r*0.28, r*0.2, 0, 0, Math.PI*2); ctx.fill();
  // 3 flammes animées
  const f1 = 0.5+0.5*Math.sin(t/170), f2 = 0.5+0.5*Math.sin(t/140+1.3), f3 = 0.5+0.5*Math.sin(t/200+2.7);
  ctx.fillStyle = `rgba(255,88,10,${(0.78+f1*0.22).toFixed(2)})`;
  ctx.beginPath(); ctx.moveTo(cx-r*0.22,cy+r*0.1); ctx.quadraticCurveTo(cx-r*0.32,cy-r*(0.38+f1*0.18),cx,cy-r*(0.55+f1*0.15)); ctx.quadraticCurveTo(cx+r*0.32,cy-r*(0.38+f2*0.14),cx+r*0.22,cy+r*0.1); ctx.closePath(); ctx.fill();
  ctx.fillStyle = `rgba(255,200,22,${(0.82+f2*0.18).toFixed(2)})`;
  ctx.beginPath(); ctx.moveTo(cx-r*0.14,cy+r*0.1); ctx.quadraticCurveTo(cx-r*0.08,cy-r*(0.44+f2*0.22),cx,cy-r*(0.66+f2*0.18)); ctx.quadraticCurveTo(cx+r*0.08,cy-r*(0.44+f3*0.15),cx+r*0.14,cy+r*0.1); ctx.closePath(); ctx.fill();
  // Étincelle au sommet
  ctx.fillStyle = `rgba(255,252,210,${(0.65+f3*0.35).toFixed(2)})`;
  ctx.beginPath(); ctx.arc(cx, cy - r*(0.64+f2*0.17), Math.max(1, r*0.09), 0, Math.PI*2); ctx.fill();
}

function drawMinimap() {
  if (!CM.mctx) return;
  const m = CM.mctx, size = 150, world = CM.gridN * CM.TILE, sc = size / world;
  m.clearRect(0, 0, size, size);
  m.fillStyle = "#1a1208"; m.fillRect(0, 0, size, size);
  if (CM.layout) {
    m.fillStyle = "#3a3326";
    for (const r of CM.layout.roads) m.fillRect(r.gx * CM.TILE * sc, r.gy * CM.TILE * sc, Math.max(1, CM.TILE * sc), Math.max(1, CM.TILE * sc));
    for (const t of CM.layout.tiles) {
      m.fillStyle = t.type === "engine" ? (CM_INFRA_IDS.has(t.buildingId) ? "#b8a882" : CM_KNOWLEDGE_IDS.has(t.buildingId) ? "#6bb6ff" : "#d4a017") : t.type === "farm" ? "#4a7a2a" : t.type === "public" || t.type === "library" ? "#c9a84c" : "#8b6914";
      const span = t.size || 1;
      m.fillRect(t.gx * CM.TILE * sc, t.gy * CM.TILE * sc, Math.max(1, span * CM.TILE * sc), Math.max(1, span * CM.TILE * sc));
    }
  }
  // Rectangle de la zone visible.
  const vx = (CM.cam.x - CM.cw / 2 / CM.cam.zoom) * sc;
  const vy = (CM.cam.y - CM.ch / 2 / CM.cam.zoom) * sc;
  const vw = (CM.cw / CM.cam.zoom) * sc, vh = (CM.ch / CM.cam.zoom) * sc;
  m.strokeStyle = "#ffffff"; m.lineWidth = 1;
  m.strokeRect(vx, vy, vw, vh);
}

function drawWonder(w, idx, now) {
  const L = CM.layout; if (!L) return;
  const slot = cmWonderSlot(idx, L.gridN, L.cx, L.cy);
  const z = CM.cam.zoom, s = CM.TILE * z;
  const cxs = (slot.gx * CM.TILE + CM.TILE / 2 - CM.cam.x) * z + CM.cw / 2;
  const baseY = (slot.gy * CM.TILE + CM.TILE - CM.cam.y) * z + CM.ch / 2;
  let H_MAX = s * 7, W = s * 3.6;
  if (w.id === "pop1m")          { H_MAX = s * 5.5; W = s * 4.8; }
  if (w.id === "era_kingdom")    { H_MAX = s * 8;   W = s * 3.8; }
  if (w.id === "era_empire")     { H_MAX = s * 6;   W = s * 5.2; }
  if (w.id === "era_mega")       { H_MAX = s * 9;   W = s * 2.6; }
  if (w.id === "era_singularity"){ H_MAX = s * 8.5; W = s * 3.2; }
  if (cxs < -W * 3 || cxs > CM.cw + W * 3 || baseY < -H_MAX * 1.5 || baseY > CM.ch + s * 3) return;

  const born = CM.born["wonder:" + w.id];
  const prog = born ? Math.max(0, Math.min(1, (now - born) / 1400)) : 1;
  const e = prog * prog * (3 - 2 * prog);
  const H = H_MAX * e;
  const topY = baseY - H;
  const ctx = CM.ctx;
  const glow = 0.5 + 0.25 * Math.sin(now / 700 + idx * 1.3);
  const tint = CM_TINTS[CM.dynastyIdx % CM_TINTS.length];

  // Esplanade pavée
  const plazaRx = W * 1.15, plazaRy = plazaRx * 0.36;
  const pg = ctx.createRadialGradient(cxs, baseY, 0, cxs, baseY, plazaRx);
  pg.addColorStop(0, "rgba(178,158,105,0.92)");
  pg.addColorStop(0.55, "rgba(148,130,88,0.6)");
  pg.addColorStop(1, "rgba(112,98,64,0)");
  ctx.fillStyle = pg;
  ctx.beginPath(); ctx.ellipse(cxs, baseY, plazaRx, plazaRy, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "rgba(100,84,52,0.28)";
  ctx.lineWidth = Math.max(0.5, s * 0.016);
  for (let ri = 1; ri <= 3; ri++) {
    ctx.beginPath();
    ctx.ellipse(cxs, baseY, plazaRx * ri / 3.8, plazaRy * ri / 3.8, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Aura
  const auraR = Math.max(1, W * 1.55);
  const ag = ctx.createRadialGradient(cxs, topY + H * 0.3, 0, cxs, topY + H * 0.3, auraR);
  ag.addColorStop(0, `rgba(255,232,120,${(0.36 * glow * e).toFixed(2)})`);
  ag.addColorStop(0.5, `rgba(255,200,60,${(0.11 * glow * e).toFixed(2)})`);
  ag.addColorStop(1, "rgba(255,218,80,0)");
  ctx.fillStyle = ag;
  ctx.beginPath(); ctx.arc(cxs, topY + H * 0.3, auraR, 0, Math.PI * 2); ctx.fill();

  if (H < 3) return;
  ctx.globalAlpha = e;

  ctx.fillStyle = "rgba(0,0,0,0.36)";
  ctx.beginPath(); ctx.ellipse(cxs + s * 0.2, baseY + s * 0.07, W * 0.5, s * 0.2, 0, 0, Math.PI * 2); ctx.fill();

  if (w.id === "dynasty1") {
    // ── LE PREMIER MAUSOLÉE — pyramide / mastaba / obélisque ──────────
    const nSt = 5, stH = H * 0.24;
    for (let i = nSt; i >= 0; i--) {
      const sw = W * (0.08 + (i / nSt) * 0.92), sh = stH / nSt;
      ctx.fillStyle = i % 2 === 0 ? "#c8a040" : "#d8b050";
      ctx.fillRect(cxs - sw / 2, baseY - (i + 1) * sh, sw, sh + 1);
    }
    const chamberW = W * 0.52, chamberH = H * 0.28, chamberY = baseY - stH;
    ctx.fillStyle = "#b89030"; ctx.fillRect(cxs - chamberW / 2, chamberY - chamberH, chamberW, chamberH);
    ctx.fillStyle = "rgba(0,0,0,0.24)"; ctx.fillRect(cxs + chamberW * 0.28, chamberY - chamberH, chamberW * 0.22, chamberH);
    ctx.fillStyle = "#5a3808"; ctx.fillRect(cxs - W * 0.065, chamberY - chamberH * 0.72, W * 0.13, chamberH * 0.54);
    ctx.fillStyle = "#8a6030"; ctx.fillRect(cxs - W * 0.048, chamberY - chamberH * 0.68, W * 0.096, chamberH * 0.42);
    ctx.fillStyle = "#e8c840";
    ctx.beginPath(); ctx.ellipse(cxs, chamberY - chamberH * 0.82, W * 0.055, H * 0.022, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#2a1a08"; ctx.beginPath(); ctx.arc(cxs, chamberY - chamberH * 0.82, W * 0.022, 0, Math.PI * 2); ctx.fill();
    const obBase = chamberY - chamberH, sw0 = W * 0.09, sw1 = W * 0.018;
    ctx.fillStyle = "#e0b840";
    ctx.beginPath(); ctx.moveTo(cxs - sw0 / 2, obBase); ctx.lineTo(cxs - sw1 / 2, topY + H * 0.07);
    ctx.lineTo(cxs + sw1 / 2, topY + H * 0.07); ctx.lineTo(cxs + sw0 / 2, obBase); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "rgba(255,230,130,0.22)";
    ctx.beginPath(); ctx.moveTo(cxs - sw0 / 2, obBase); ctx.lineTo(cxs - sw0 / 2 + W * 0.022, obBase);
    ctx.lineTo(cxs - sw1 / 2 + W * 0.022, topY + H * 0.07); ctx.lineTo(cxs - sw1 / 2, topY + H * 0.07); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(140,100,10,0.45)"; ctx.lineWidth = Math.max(0.5, s * 0.016);
    for (let li = 1; li < 8; li++) {
      const fy = obBase + (topY + H * 0.07 - obBase) * (li / 8);
      const fw = sw0 + (sw1 - sw0) * (li / 8);
      ctx.beginPath(); ctx.moveTo(cxs - fw / 2, fy); ctx.lineTo(cxs + fw / 2, fy); ctx.stroke();
    }
    ctx.fillStyle = "#ffe860";
    ctx.beginPath(); ctx.moveTo(cxs - sw1 * 1.2, topY + H * 0.07); ctx.lineTo(cxs, topY); ctx.lineTo(cxs + sw1 * 1.2, topY + H * 0.07); ctx.closePath(); ctx.fill();
    ctx.fillStyle = `rgba(255,250,180,${(0.92 * glow).toFixed(2)})`;
    ctx.beginPath(); ctx.arc(cxs, topY, Math.max(2, s * 0.16), 0, Math.PI * 2); ctx.fill();

  } else if (w.id === "pop1m") {
    // ── LA GRANDE HALLE — basilique romaine, panthéon, oculus ─────────
    const nSt = 4, stH = H * 0.12;
    for (let i = nSt; i >= 0; i--) {
      const sw = W * (0.14 + (i / nSt) * 0.86), sh = stH / nSt;
      ctx.fillStyle = i % 2 === 0 ? "#c8c0a0" : "#d8d0b0";
      ctx.fillRect(cxs - sw / 2, baseY - (i + 1) * sh, sw, sh + 1);
    }
    const podY = baseY - stH, bodyH = H * 0.46;
    ctx.fillStyle = "#d0c898"; ctx.fillRect(cxs - W * 0.46, podY - bodyH, W * 0.92, bodyH);
    ctx.fillStyle = "rgba(0,0,0,0.12)"; ctx.fillRect(cxs + W * 0.28, podY - bodyH, W * 0.18, bodyH);
    const nC = 12;
    for (let ci = 0; ci < nC; ci++) {
      const cx2 = cxs - W * 0.44 + ci * (W * 0.88 / (nC - 1));
      ctx.fillStyle = "#e8e0c0"; ctx.fillRect(cx2 - s * 0.038, podY - bodyH, s * 0.076, bodyH);
      ctx.fillStyle = "rgba(0,0,0,0.1)"; ctx.fillRect(cx2 + s * 0.015, podY - bodyH, s * 0.02, bodyH);
      ctx.fillStyle = "#d8d0a8"; ctx.fillRect(cx2 - s * 0.08, podY - s * 0.06, s * 0.16, s * 0.06);
      ctx.fillRect(cx2 - s * 0.08, podY - bodyH, s * 0.16, s * 0.06);
    }
    ctx.fillStyle = "#b8b090"; ctx.fillRect(cxs - W * 0.47, podY - bodyH - H * 0.035, W * 0.94, H * 0.035);
    const friezeY = podY - bodyH - H * 0.07;
    ctx.fillStyle = "#c8c0a0"; ctx.fillRect(cxs - W * 0.47, friezeY, W * 0.94, H * 0.035);
    const frontH = H * 0.14;
    ctx.fillStyle = "#888060";
    ctx.beginPath(); ctx.moveTo(cxs - W * 0.48, friezeY); ctx.lineTo(cxs, friezeY - frontH); ctx.lineTo(cxs + W * 0.48, friezeY); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#b0a878";
    ctx.beginPath(); ctx.moveTo(cxs - W * 0.44, friezeY - H * 0.008); ctx.lineTo(cxs, friezeY - frontH + H * 0.018); ctx.lineTo(cxs + W * 0.44, friezeY - H * 0.008); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "rgba(20,16,8,0.55)"; ctx.beginPath(); ctx.arc(cxs, friezeY - frontH * 0.42, W * 0.07, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#d0c888"; ctx.lineWidth = Math.max(1, s * 0.028);
    ctx.beginPath(); ctx.arc(cxs, friezeY - frontH * 0.42, W * 0.07, 0, Math.PI * 2); ctx.stroke();
    for (const ax of [-0.48, 0, 0.48]) {
      const ay2 = ax === 0 ? friezeY - frontH : friezeY;
      ctx.fillStyle = "#d4c870";
      ctx.beginPath(); ctx.moveTo(cxs + W * ax - W * 0.034, ay2); ctx.lineTo(cxs + W * ax, ay2 - H * 0.062); ctx.lineTo(cxs + W * ax + W * 0.034, ay2); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = "rgba(15,12,5,0.65)";
    for (let wi2 = 0; wi2 < 6; wi2++) {
      const wx2 = cxs - W * 0.38 + wi2 * (W * 0.76 / 5);
      ctx.beginPath(); ctx.arc(wx2, podY - bodyH * 0.5, W * 0.044, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = `rgba(255,245,200,${(0.65 * glow).toFixed(2)})`;
    ctx.beginPath(); ctx.arc(cxs, friezeY - frontH, Math.max(2, s * 0.13), 0, Math.PI * 2); ctx.fill();

  } else if (w.id === "era_kingdom") {
    // ── LA COURONNE DE PIERRE — cathédrale gothique ───────────────────
    const nSt = 3, stH = H * 0.08;
    for (let i = nSt; i >= 0; i--) {
      const sw = W * (0.2 + (i / nSt) * 0.8), sh = stH / nSt;
      ctx.fillStyle = i % 2 === 0 ? "#888098" : "#9890a8";
      ctx.fillRect(cxs - sw / 2, baseY - (i + 1) * sh, sw, sh + 1);
    }
    const podY = baseY - stH, naveW = W * 0.38, naveH = H * 0.54;
    ctx.fillStyle = "#7a7090"; ctx.fillRect(cxs - naveW / 2, podY - naveH, naveW, naveH);
    ctx.fillStyle = "#6a6080";
    ctx.fillRect(cxs - W * 0.46, podY - naveH * 0.58, W * 0.082, naveH * 0.44);
    ctx.fillRect(cxs + W * 0.378, podY - naveH * 0.58, W * 0.082, naveH * 0.44);
    ctx.fillStyle = "rgba(180,200,255,0.35)";
    for (let wi2 = 0; wi2 < 3; wi2++) {
      const wx2 = cxs - naveW * 0.3 + wi2 * naveW * 0.3;
      const wyTop = podY - naveH * 0.9, wh = naveH * 0.38;
      ctx.fillRect(wx2 - W * 0.04, wyTop, W * 0.08, wh * 0.75);
      ctx.beginPath(); ctx.arc(wx2, wyTop, W * 0.04, Math.PI, 0); ctx.fill();
    }
    const roseY = podY - naveH * 0.38;
    ctx.fillStyle = "rgba(160,180,255,0.45)"; ctx.beginPath(); ctx.arc(cxs, roseY, W * 0.095, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#9890b8"; ctx.lineWidth = Math.max(0.5, s * 0.016);
    for (let ri = 0; ri < 8; ri++) {
      const ra = ri * Math.PI / 4;
      ctx.beginPath(); ctx.moveTo(cxs, roseY); ctx.lineTo(cxs + Math.cos(ra) * W * 0.095, roseY + Math.sin(ra) * W * 0.095); ctx.stroke();
    }
    ctx.strokeStyle = "#a8a0c0"; ctx.lineWidth = Math.max(0.5, s * 0.022);
    ctx.beginPath(); ctx.arc(cxs, roseY, W * 0.095, 0, Math.PI * 2); ctx.stroke();
    const towerW = W * 0.2, towerH = H * 0.8;
    for (const tx of [-1, 1]) {
      const tcx = cxs + tx * (naveW / 2 + towerW / 2);
      ctx.fillStyle = "#7a7090"; ctx.fillRect(tcx - towerW / 2, podY - towerH, towerW, towerH);
      ctx.fillStyle = "rgba(160,180,255,0.35)";
      for (let ti = 1; ti <= 3; ti++) {
        const twy = podY - towerH * (0.2 + ti * 0.2);
        ctx.fillRect(tcx - W * 0.048, twy - H * 0.058, W * 0.096, H * 0.058 * 0.75);
        ctx.beginPath(); ctx.arc(tcx, twy - H * 0.058, W * 0.048, Math.PI, 0); ctx.fill();
      }
      ctx.fillStyle = "#9890a8";
      ctx.beginPath(); ctx.moveTo(tcx - towerW / 2, podY - towerH); ctx.lineTo(tcx, podY - towerH - H * 0.16); ctx.lineTo(tcx + towerW / 2, podY - towerH); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#d4b840"; ctx.beginPath(); ctx.arc(tcx, podY - towerH - H * 0.16, Math.max(2, s * 0.07), 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = "#888098";
    ctx.beginPath(); ctx.moveTo(cxs - naveW * 0.32, podY - naveH); ctx.lineTo(cxs, topY + H * 0.02); ctx.lineTo(cxs + naveW * 0.32, podY - naveH); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#e8c830"; ctx.beginPath(); ctx.arc(cxs, topY, Math.max(2, s * 0.1), 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#ffe860"; ctx.lineWidth = Math.max(1.5, s * 0.042); ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(cxs, topY - Math.max(3, s * 0.1)); ctx.lineTo(cxs, topY - H * 0.12); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cxs - W * 0.054, topY - H * 0.084); ctx.lineTo(cxs + W * 0.054, topY - H * 0.084); ctx.stroke();
    ctx.lineCap = "square";
    ctx.fillStyle = `rgba(200,215,255,${(0.74 * glow).toFixed(2)})`;
    ctx.beginPath(); ctx.arc(cxs, topY - H * 0.12, Math.max(2, s * 0.15), 0, Math.PI * 2); ctx.fill();

  } else if (w.id === "era_empire") {
    // ── LE FORUM IMPÉRIAL — arc de triomphe + ailes + quadrige ────────
    const nSt = 5, stH = H * 0.13;
    for (let i = nSt; i >= 0; i--) {
      const sw = W * (0.1 + (i / nSt) * 0.9), sh = stH / nSt;
      ctx.fillStyle = i % 2 === 0 ? "#d0c090" : "#e0d0a0";
      ctx.fillRect(cxs - sw / 2, baseY - (i + 1) * sh, sw, sh + 1);
    }
    const podY = baseY - stH, wingW = W * 0.28, wingH = H * 0.42;
    for (const side of [-1, 1]) {
      const wx = cxs + side * W * 0.22;
      ctx.fillStyle = "#c8b878"; ctx.fillRect(wx - wingW / 2, podY - wingH, wingW, wingH);
      const nWC = 5;
      for (let ci = 0; ci < nWC; ci++) {
        const cx2 = wx - wingW * 0.42 + ci * (wingW * 0.84 / (nWC - 1));
        ctx.fillStyle = "#dcd098"; ctx.fillRect(cx2 - s * 0.04, podY - wingH, s * 0.08, wingH);
        ctx.fillStyle = "rgba(0,0,0,0.1)"; ctx.fillRect(cx2 + s * 0.014, podY - wingH, s * 0.018, wingH);
      }
      ctx.fillStyle = "#b0a060"; ctx.fillRect(wx - wingW / 2, podY - wingH - H * 0.028, wingW, H * 0.028);
    }
    const archW = W * 0.44, archH = H * 0.56;
    ctx.fillStyle = "#d4c080"; ctx.fillRect(cxs - archW / 2, podY - archH, archW, archH);
    const mainR = archW * 0.22;
    ctx.fillStyle = "#c0aa60";
    ctx.beginPath(); ctx.arc(cxs, podY - archH + archH * 0.48, mainR, Math.PI, 0);
    ctx.rect(cxs - mainR, podY - archH + archH * 0.48, mainR * 2, archH * 0.48); ctx.fill();
    ctx.fillStyle = "rgba(20,14,4,0.58)";
    ctx.beginPath(); ctx.arc(cxs, podY - archH + archH * 0.48, mainR * 0.84, Math.PI, 0);
    ctx.rect(cxs - mainR * 0.84, podY - archH + archH * 0.48, mainR * 1.68, archH * 0.48); ctx.fill();
    for (const side of [-1, 1]) {
      const ax = cxs + side * archW * 0.32, sR = archW * 0.1;
      ctx.fillStyle = "#b89050";
      ctx.beginPath(); ctx.arc(ax, podY - archH + archH * 0.38, sR, Math.PI, 0);
      ctx.rect(ax - sR, podY - archH + archH * 0.38, sR * 2, archH * 0.38); ctx.fill();
      ctx.fillStyle = "rgba(20,14,4,0.52)";
      ctx.beginPath(); ctx.arc(ax, podY - archH + archH * 0.38, sR * 0.82, Math.PI, 0);
      ctx.rect(ax - sR * 0.82, podY - archH + archH * 0.38, sR * 1.64, archH * 0.38); ctx.fill();
    }
    const atticY = podY - archH;
    ctx.fillStyle = "#c0a868"; ctx.fillRect(cxs - archW / 2, atticY - H * 0.14, archW, H * 0.14);
    ctx.strokeStyle = "rgba(150,120,40,0.6)"; ctx.lineWidth = Math.max(0.5, s * 0.016);
    for (let li = 0; li < 3; li++) {
      const lx = cxs - archW * 0.35 + li * archW * 0.35;
      ctx.beginPath(); ctx.moveTo(lx, atticY - H * 0.04); ctx.lineTo(lx + archW * 0.28, atticY - H * 0.04); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(lx, atticY - H * 0.09); ctx.lineTo(lx + archW * 0.22, atticY - H * 0.09); ctx.stroke();
    }
    const quadY = atticY - H * 0.14;
    ctx.fillStyle = "#d4b040"; ctx.fillRect(cxs - W * 0.1, quadY - H * 0.11, W * 0.2, H * 0.06);
    for (let hi = 0; hi < 4; hi++) {
      const hx = cxs - W * 0.15 + hi * W * 0.1;
      ctx.fillStyle = "#e0c040"; ctx.beginPath(); ctx.ellipse(hx, quadY - H * 0.14, W * 0.028, H * 0.034, 0.3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = `rgba(255,240,140,${(0.72 * glow).toFixed(2)})`;
    ctx.beginPath(); ctx.arc(cxs, quadY - H * 0.18, Math.max(2, s * 0.14), 0, Math.PI * 2); ctx.fill();

  } else if (w.id === "era_mega") {
    // ── LA SPIRE DES MONDES — gratte-ciel futuriste, Art déco ─────────
    const nSt = 3, stH = H * 0.07;
    for (let i = nSt; i >= 0; i--) {
      const sw = W * (0.3 + (i / nSt) * 0.7), sh = stH / nSt;
      ctx.fillStyle = i % 2 === 0 ? "#b0b8c0" : "#c0c8d0";
      ctx.fillRect(cxs - sw / 2, baseY - (i + 1) * sh, sw, sh + 1);
    }
    let currY = baseY - stH;
    const setbacks = [
      { w: W * 0.86, h: H * 0.18, col: "#b8c0cc" },
      { w: W * 0.62, h: H * 0.15, col: "#c0c8d4" },
      { w: W * 0.44, h: H * 0.14, col: "#c8d0dc" },
      { w: W * 0.30, h: H * 0.16, col: "#d0d8e4" },
      { w: W * 0.18, h: H * 0.14, col: "#d8e0ec" }
    ];
    for (const sb of setbacks) {
      ctx.fillStyle = sb.col; ctx.fillRect(cxs - sb.w / 2, currY - sb.h, sb.w, sb.h);
      ctx.fillStyle = "rgba(0,0,0,0.14)"; ctx.fillRect(cxs + sb.w * 0.28, currY - sb.h, sb.w * 0.22, sb.h);
      ctx.fillStyle = `rgba(120,200,255,${(0.55 * glow).toFixed(2)})`;
      ctx.fillRect(cxs - sb.w / 2, currY - sb.h, sb.w, Math.max(1.5, s * 0.024));
      ctx.fillStyle = `rgba(160,220,255,${(0.35 + 0.15 * glow).toFixed(2)})`;
      const nLines = Math.max(2, Math.round(sb.h / Math.max(1, s * 0.1)));
      for (let li = 1; li < nLines; li++) {
        const ly = currY - sb.h + sb.h * (li / nLines);
        ctx.fillRect(cxs - sb.w * 0.42, ly - Math.max(0.5, s * 0.012), sb.w * 0.84, Math.max(1, s * 0.018));
      }
      currY -= sb.h;
    }
    ctx.fillStyle = "#d0d8e8";
    ctx.beginPath(); ctx.moveTo(cxs - W * 0.04, currY); ctx.lineTo(cxs - W * 0.008, topY + H * 0.04);
    ctx.lineTo(cxs + W * 0.008, topY + H * 0.04); ctx.lineTo(cxs + W * 0.04, currY); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#e8f0f8";
    ctx.beginPath(); ctx.moveTo(cxs - W * 0.006, topY + H * 0.04); ctx.lineTo(cxs, topY); ctx.lineTo(cxs + W * 0.006, topY + H * 0.04); ctx.closePath(); ctx.fill();
    const blinkA = 0.4 + 0.6 * Math.abs(Math.sin(now / 800));
    ctx.fillStyle = `rgba(255,60,60,${blinkA.toFixed(2)})`;
    ctx.beginPath(); ctx.arc(cxs, topY, Math.max(2, s * 0.08), 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgba(120,200,255,${(0.88 * glow).toFixed(2)})`;
    ctx.beginPath(); ctx.arc(cxs, currY + setbacks[setbacks.length - 1].h * 0.5, Math.max(1, s * 0.06), 0, Math.PI * 2); ctx.fill();

  } else if (w.id === "era_singularity") {
    // ── L'AXE CIVIQUE — monolithe cristallin, anneau flottant ─────────
    const nSt = 3, stH = H * 0.1;
    for (let i = nSt; i >= 0; i--) {
      const sw = W * (0.2 + (i / nSt) * 0.8), sh = stH / nSt;
      ctx.fillStyle = `rgba(200,230,255,${(0.7 + (i / nSt) * 0.3).toFixed(2)})`;
      ctx.fillRect(cxs - sw / 2, baseY - (i + 1) * sh, sw, sh + 1);
    }
    const podY = baseY - stH, monoW = W * 0.3, monoH = H * 0.54;
    const mGrad = ctx.createLinearGradient(cxs - monoW / 2, 0, cxs + monoW / 2, 0);
    mGrad.addColorStop(0, "rgba(180,220,255,0.95)"); mGrad.addColorStop(0.35, "rgba(240,250,255,0.98)");
    mGrad.addColorStop(0.65, "rgba(200,235,255,0.92)"); mGrad.addColorStop(1, "rgba(160,200,240,0.88)");
    ctx.fillStyle = mGrad; ctx.fillRect(cxs - monoW / 2, podY - monoH, monoW, monoH);
    ctx.fillStyle = "rgba(255,255,255,0.55)"; ctx.fillRect(cxs - monoW * 0.42, podY - monoH, monoW * 0.08, monoH);
    ctx.fillStyle = "rgba(140,190,240,0.7)";
    ctx.beginPath(); ctx.moveTo(cxs - monoW / 2, podY - monoH); ctx.lineTo(cxs - monoW / 2 - W * 0.06, podY - monoH * 0.7);
    ctx.lineTo(cxs - monoW / 2 - W * 0.06, podY); ctx.lineTo(cxs - monoW / 2, podY); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "rgba(180,220,255,0.5)";
    ctx.beginPath(); ctx.moveTo(cxs + monoW / 2, podY - monoH); ctx.lineTo(cxs + monoW / 2 + W * 0.06, podY - monoH * 0.7);
    ctx.lineTo(cxs + monoW / 2 + W * 0.06, podY); ctx.lineTo(cxs + monoW / 2, podY); ctx.closePath(); ctx.fill();
    const lineGlow = 0.3 + 0.5 * Math.abs(Math.sin(now / 600 + idx));
    ctx.strokeStyle = `rgba(100,200,255,${lineGlow.toFixed(2)})`; ctx.lineWidth = Math.max(0.5, s * 0.015);
    for (let li = 1; li < 6; li++) {
      const ly = podY - monoH * (li / 6);
      ctx.beginPath(); ctx.moveTo(cxs - monoW * 0.38, ly); ctx.lineTo(cxs + monoW * 0.38, ly); ctx.stroke();
    }
    const ringY = podY - monoH - H * 0.12, ringRx = W * 0.36, ringRy = W * 0.12;
    const ringG = 0.4 + 0.4 * Math.abs(Math.sin(now / 500));
    ctx.strokeStyle = `rgba(80,220,255,${(0.8 * ringG).toFixed(2)})`; ctx.lineWidth = Math.max(1.5, s * 0.04);
    ctx.beginPath(); ctx.ellipse(cxs, ringY, ringRx, ringRy, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = `rgba(200,240,255,${(0.55 * ringG).toFixed(2)})`; ctx.lineWidth = Math.max(0.5, s * 0.015);
    ctx.beginPath(); ctx.ellipse(cxs, ringY, ringRx * 0.8, ringRy * 0.8, 0, 0, Math.PI * 2); ctx.stroke();
    const bGrad = ctx.createLinearGradient(cxs, ringY, cxs, topY);
    bGrad.addColorStop(0, `rgba(80,220,255,${(0.7 * glow).toFixed(2)})`); bGrad.addColorStop(1, "rgba(80,220,255,0)");
    ctx.fillStyle = bGrad;
    ctx.beginPath(); ctx.moveTo(cxs - W * 0.024, ringY); ctx.lineTo(cxs + W * 0.024, ringY);
    ctx.lineTo(cxs + W * 0.004, topY); ctx.lineTo(cxs - W * 0.004, topY); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "rgba(220,245,255,0.95)";
    ctx.beginPath(); ctx.moveTo(cxs - W * 0.06, topY + H * 0.06); ctx.lineTo(cxs, topY);
    ctx.lineTo(cxs + W * 0.06, topY + H * 0.06); ctx.lineTo(cxs + W * 0.04, topY + H * 0.1); ctx.lineTo(cxs - W * 0.04, topY + H * 0.1); ctx.closePath(); ctx.fill();
    const prism = 0.6 + 0.4 * Math.sin(now / 300 + idx);
    ctx.fillStyle = `rgba(80,230,255,${(prism * 0.9).toFixed(2)})`;
    ctx.beginPath(); ctx.arc(cxs, topY, Math.max(2, s * 0.18), 0, Math.PI * 2); ctx.fill();
  }

  // Bannière de dynastie
  ctx.strokeStyle = "#3a2a12"; ctx.lineWidth = Math.max(1.5, s * 0.048);
  ctx.beginPath(); ctx.moveTo(cxs, topY); ctx.lineTo(cxs, topY - H * 0.13); ctx.stroke();
  ctx.fillStyle = tint;
  ctx.beginPath(); ctx.moveTo(cxs, topY - H * 0.13); ctx.lineTo(cxs + W * 0.36, topY - H * 0.075); ctx.lineTo(cxs, topY - H * 0.02); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = "rgba(255,240,178,0.52)"; ctx.lineWidth = Math.max(0.5, s * 0.016);
  ctx.beginPath(); ctx.moveTo(cxs, topY - H * 0.13); ctx.lineTo(cxs + W * 0.36, topY - H * 0.075); ctx.lineTo(cxs, topY - H * 0.02); ctx.stroke();

  ctx.globalAlpha = 1;
}

/* ---- legacy citymap citymap.js ---- */


/* ============================================================================
 * citymap.js — Initialisation Canvas, boucle rAF.
 *   Contient uniquement initCityMap() et la boucle frame().
 *   Rendu terrain/routes/agents/batiments : modules citymap-render-*.js charges avant.
 * ============================================================================ */
// ── Initialisation navigateur (Canvas + interactions + boucle rAF) ──────────
function initCityMap(canvas, options = {}) {
  if (CM.inited) return;
  if (!canvas || typeof canvas.getContext !== "function") return;
  const mapRoot = options.mapRoot || canvas.parentElement;
  const miniCanvas = options.minimap || null;
  const isActive = options.isActive || function () { return true; };

  CM.inited = true;
  CM.canvas = canvas;
  CM.ctx = canvas.getContext("2d");
  CM.mini = miniCanvas;
  CM.mctx = CM.mini ? CM.mini.getContext("2d") : null;
  cityMapEnsureTooltip(mapRoot, options.tooltip);

  const resize = () => cityMapResizeCanvas(canvas);
  resize();
  const resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(resize) : null;
  if (resizeObserver) resizeObserver.observe(canvas);
  window.addEventListener("resize", resize);
  const cleanupInput = bindCityMapInput(canvas, mapRoot, {
    showHover: (sx, sy) => cityMapShowTooltip(cityMapHitTest(sx, sy), sx, sy),
    clearHover: () => cityMapShowTooltip(null)
  });
  CM.cleanup = () => {
    cleanupInput();
    resizeObserver?.disconnect();
    window.removeEventListener("resize", resize);
    cityMapShowTooltip(null);
  };
  const cityMapRuntimeDeps = { getVehicleDensity, chooseRoadVehicleType };

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const active = isActive();
    if (active && CM.canvas && CM.cw > 0) {
      if (!CM.cw) resize();
      cityMapEnsureLayout(now, cityMapRuntimeDeps);
      cmCheckWonders(now);
      // Cycle jour/nuit lent (~5 min).
      CM.nightF = 0.5 - 0.5 * Math.cos((now || 0) / 300000 * Math.PI * 2);
      // Detection d'effondrement (anim de destruction centre -> exterieur).
      if (typeof collapseInProgress !== "undefined" && collapseInProgress) { if (!CM.collapseAt) CM.collapseAt = now; }
      else { CM.collapseAt = 0; }
      cityMapDrawGround(CM.layout);
      cityMapDrawRiver(now);
      cityMapDrawTrees();
      cityMapDrawVestiges();
      cityMapDrawUrbanMass(CM.layout);
      for (const r of CM.roadList) cityMapDrawRoad(r);
      cityMapDrawStreetLights(now);
      // Agents AVANT les batiments -> charrettes/pietons/navires passent derriere.
      updateVehicles(dt);
      drawShips(dt);
      drawCentralFire(now);
      cityMapDrawBridges();
      drawCitizens(dt, now);
      drawVehicles(now, "ground");
      const tw = state.timeWear || 0, maxD2 = CM.layout ? CM.layout.maxD2 : 1;
      if (CM.layout) {
        // tries du fond vers l'avant (par profondeur)
        for (const t of CM.layout.tiles) drawTile(t, now, tw, maxD2);
      }
      // Nuit : assombrit la scene, les villes avancees se mettent a briller.
      cityMapDrawNight(now);
      // Merveilles (trophees) par-dessus la nuit : elles restent eclatantes.
      if (CM.layout && Array.isArray(state.wonders)) {
        for (let wi = 0; wi < CM_WONDERS.length; wi += 1) {
          if (state.wonders.includes(CM_WONDERS[wi].id)) drawWonder(CM_WONDERS[wi], wi, now);
        }
      }
      drawVehicles(now, "air"); // drones au-dessus
      drawCrisis(dt, now);
    }
    CM.raf = requestAnimationFrame(frame);
  }
  // Premiere mise en page immediate puis boucle.
  if (CM.cw === 0) resize();
  // Hook de diagnostic : force une frame (utile quand rAF est gele en arriere-plan).
  CM.forceFrame = () => { resize(); frame(performance.now()); };
  CM.raf = requestAnimationFrame(frame);
}

export { CM, initCityMap, captureVestige };

setCaptureVestigeHandler(captureVestige);








