/* eslint-disable */
import { state } from '../core/state.js';
import { eras } from '../data/world.js';
import { seededRng } from '../core/utils.js';
import { toNum } from '../core/num.js';
import { currentEraIndex } from '../core/mechanics.js';
import { chronicle } from '../core/actions.js';
import { setCityMapEngineTileMap, setCaptureVestigeHandler } from './cityMapBridge.js';
import { ensureMapSeed, mixSeed } from './procedural/seedManager.js';
import { ageConfigFor } from './procedural/ageVisualConfig.js';
import { eraBandOf } from '../data/eraThemes.js';
import { computeCityPersonality } from './procedural/cityPersonality.js';
import { generateCityPlan } from './procedural/cityPlan.js';
import { generateRoadsGraph, trimDemandlessRoads } from './procedural/roadGraph.js';
import { generateWalls } from './procedural/wallGenerator.js';
import { createBuildingPlacer } from './procedural/buildingGenerator.js';
import { createWaterModel } from './procedural/waterModel.js';
import { CM_GIVEN, CM_EPITHETS, CM_TRADES, CM_HOUSES, CM_ROLES, CM_STREET_OF } from './cityNaming.js';
import {
  CM_ENGINE_BUILDINGS, CM_KNOWLEDGE_BUILDINGS, CM_INFRA_BUILDINGS, CM_MAP_BUILDINGS,
  CM_KNOWLEDGE_IDS, CM_INFRA_IDS, CM_SLOT_PRIORITIES
} from './cityBuildings.js';

/* ---- legacy citymap core\layout.js ---- */


/* ============================================================================
 * citymap-layout.js — Code PUR (sans dépendance navigateur/Canvas).
 *   Contient : constantes, utilitaires, computeCityLayout, et tout ce qui
 *   peut être exécuté en dehors d'un contexte DOM (simulation Node incluse).
 *   Chargé AVANT citymap.js qui contient uniquement initCityMap().
 *
 * Dépendances globales attendues au chargement :
 *   - seededRng()   (utils.js)
 *   - state, eras   (state.js, data-world.js)
 * ============================================================================ */

// ── Objet état du canvas (partagé avec citymap.js) ──────────────────────────
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
  healthF: 0.6,
  lodActive: false,
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
// ── Constantes de routes ─────────────────────────────────────────────────────
const ROAD_N = 1;
const ROAD_E = 2;
const ROAD_S = 4;
const ROAD_W = 8;

// SOURCE UNIQUE de la largeur de chaussée par rang/ère, partagée par le rendu
// (corps de route + marquages, renderWorld) et les véhicules (décalage de file,
// agents) pour garantir l'alignement. Tout changement de largeur se fait ICI.
function roadWidthFor(rank, eraIndex) {
  if (rank === "main") return eraIndex >= 12 ? 0.84 : eraIndex >= 7 ? 0.66 : 0.5;
  if (rank === "secondary") return eraIndex >= 12 ? 0.32 : eraIndex >= 7 ? 0.28 : 0.24;
  if (rank === "path") return eraIndex >= 7 ? 0.16 : 0.13;
  return eraIndex >= 12 ? 0.58 : eraIndex >= 7 ? 0.48 : 0.38; // avenue
}

// ── Palettes et données visuelles ────────────────────────────────────────────
const CM_TINTS = ["#c9a84c", "#d8a24a", "#caa05a", "#d6b257", "#cf9a4a", "#d1c06a", "#b98f6a", "#cf8a5a"];

// Registre des bâtiments carte → ./cityBuildings.js (données pures extraites).

// Affinité à l'eau d'un bâtiment moteur : où son emprise a le droit de se poser.
//   "dry" (défaut) = jamais sur l'eau ni sur la berge ;
//   "bank"         = peut mordre la berge (quais, moulins, ports) — pool rive ;
//   "near"         = sol sec proche de la rive ;
//   "on"           = se pose SUR l'eau (comme un pont) ;
//   "any"          = indifférent (pool terrestre, eau interdite).
// Sans champ `water`, on retombe sur l'historique : zone "river" ⇒ "bank".
// Une seule fonction à toucher pour qu'une demande « tel objet sur/hors de
// l'eau » devienne une métadonnée dans CM_*_BUILDINGS.
function cmWaterAffinity(meta) {
  if (meta && meta.water) return meta.water;
  return meta && meta.zone === "river" ? "bank" : "dry";
}
// Droits de pose dérivés de l'affinité, consommés par footprintFits.
function cmWaterAllow(affinity) {
  return {
    allowWater: affinity === "on",
    allowBank:  affinity === "on" || affinity === "bank"
  };
}
// Vrai dès qu'un bâtiment cherche la proximité de l'eau (pool + score « rivière »).
function cmWaterAffine(affinity) {
  return affinity === "on" || affinity === "bank" || affinity === "near";
}

// ── Merveilles ───────────────────────────────────────────────────────────────
// Chaque merveille a une identité propre : nom, sprite dédié (renderBuildings),
// emplacement thématique, et 5 PALIERS d'évolution : franchir un nouveau jalon
// (population ×10, dynastie suivante, ère plus avancée...) fait grandir le
// monument et l'orne de nouveaux attributs. `metric` extrait la valeur de
// progression, `tiers` liste les 5 seuils, `tierLabel` nomme le jalon.
const CM_WONDERS = [
  { id: "dynasty1",       name: "Le Mausolée du Fondateur",   icon: "mausoleum", slot: { angle: -2.42, ring: 1.0 }, reEra: 2,
    unlockedBy: "Première dynastie fondée.",
    metric: (s) => s.dynastyCount || 0, tiers: [1, 3, 5, 8, 12],
    tierLabel: (v) => `${v} dynastie${v > 1 ? "s" : ""}` },
  { id: "pop1m",          name: "La Colonne du Million",      icon: "column",    slot: { angle: 1.15, ring: 0.62 }, reEra: 6,
    unlockedBy: "Population d'au moins 1 000 000.",
    metric: (s) => toNum(s.population) || 0, tiers: [1e6, 1e7, 1e8, 1e9, 1e10],
    tierLabel: (v) => v >= 1e9 ? `${v / 1e9} milliard${v >= 2e9 ? "s" : ""} d'habitants` : `${v / 1e6} million${v >= 2e6 ? "s" : ""} d'habitants` },
  { id: "era_kingdom",    name: "La Couronne de Pierre",      icon: "crown",     slot: { angle: -1.25, ring: 1.18 }, reEra: 9,
    unlockedBy: "Âge du royaume atteint.",
    metric: (s) => cmEraIndexFor(s), tiers: [9, 13, 17, 21, 25],
    tierLabel: (v) => `ère « ${eras[v] ? eras[v].name : v} »` },
  { id: "era_empire",     name: "L'Arc de Triomphe Éternel",  icon: "arch",      slot: { angle: 0.02, ring: 0.82 }, reEra: 13,
    unlockedBy: "500 achats accomplis (bâtiments et décrets).",
    metric: (s) => s.lifetimePurchases || 0, tiers: [500, 2500, 10000, 15000, 20000],
    tierLabel: (v) => `${v >= 1000 ? (v / 1000) + " 000" : v} achats accomplis` },
  { id: "era_mega",       name: "L'Aiguille Céleste",         icon: "needle",    slot: { angle: 2.3, ring: 0.55 }, reEra: 17,
    unlockedBy: "30 minutes passées à veiller sur la cité.",
    metric: (s) => s.playTimeSec || 0, tiers: [1800, 7200, 28800, 86400, 259200],
    tierLabel: (v) => v >= 3600 ? `${Math.round(v / 3600)} heures de veille` : `${Math.round(v / 60)} minutes de veille` },
  { id: "era_singularity",name: "L'Œil de la Singularité",    icon: "eye",       slot: { angle: -0.6, ring: 0.42 }, reEra: 21,
    unlockedBy: "Premier mythe accompli.",
    metric: (s) => Object.keys(s.mythsCompleted || {}).length, tiers: [1, 3, 5, 8, 12],
    tierLabel: (v) => `${v} mythe${v > 1 ? "s" : ""} accompli${v > 1 ? "s" : ""}` }
];
const WONDER_TIER_NAMES = ["", "I", "II", "III", "IV", "V"];
// Palier courant d'une merveille (0 = pas encore érigée, 1..5 sinon).
function cmWonderTier(w, s) {
  const v = w.metric(s);
  let tier = 0;
  for (const threshold of w.tiers) { if (v >= threshold) tier += 1; else break; }
  return tier;
}
// ── Réérection progressive ──────────────────────────────────────────────────
// state.wonders / state.wonderTiers = MÉMOIRE PERMANENTE (le rang atteint, jamais
// perdu, survit aux cycles). Mais une merveille débloquée ne se redresse
// PHYSIQUEMENT sur la carte du cycle courant que lorsque la civilisation a
// regrandi jusqu'à l'ère qui la justifie (`reEra`, indexé sur l'ère COURANTE qui,
// elle, repart de zéro à chaque effondrement). La pierre se souvient ; le
// monument attend que la cité soit de nouveau à sa hauteur. C'est ce qui évite le
// « village minuscule cerné de 6 monuments » en début de cycle.
function cmWonderActive(w, s) {
  if (!w || !s || !Array.isArray(s.wonders) || !s.wonders.includes(w.id)) return false;
  const reEra = typeof w.reEra === "number" ? w.reEra : 0;
  return cmEraIndexFor(s) >= reEra;
}
function cmWonderActiveIds(s) {
  const out = new Set();
  if (!s || !Array.isArray(s.wonders)) return out;
  for (const w of CM_WONDERS) if (cmWonderActive(w, s)) out.add(w.id);
  return out;
}
const WONDER_CLEAR_R = 5; // rayon libre (tuiles) autour de chaque merveille ;
// couvre l'emprise du parvis du plus gros sprite au palier V (cf. drawWonder).

// ── Utilitaires purs ─────────────────────────────────────────────────────────
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

// Fraction d'ère [0..1] pour le dimensionnement de la ville (densité, portée…).
// Ancrée sur 34 : les ères transcendantes (index dense ≥ 35) saturent à 1 (ville
// maximale). Identique à l'origine pour les ères 0–34.
function cmEraFrac(index) {
  return Math.max(0, Math.min(1, index / 34));
}
// Bande visuelle : source unique de vérité (eraThemes.eraBandOf), ancrée sur 34
// pour les ères 0–34 (couleurs inchangées) + 3 bandes cosmiques 7–9 (mappées par
// tier → les ères « factices » suivent leur palier majeur).
function cmEraBand(index) {
  return eraBandOf(index);
}
function cmEraIndexFor(s) {
  if (typeof currentEraIndex === "function") return currentEraIndex();
  if (typeof eras !== "undefined" && Array.isArray(eras) && eras.length > 0) {
    let index = 0;
    const pop = toNum(s.population) || 0;
    for (let i = 0; i < eras.length; i += 1) {
      if (pop >= toNum(eras[i].at)) index = i; else break; // early exit ; toNum() évite la coercion native d'un seuil Decimal (ères transcendantes)
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
function cmFieldSpan(level) {
  // Ceinture de champs : un bloc unique, plus large que haut, qui grandit avec
  // le niveau. Croissance en sqrt pour ralentir l'expansion en fin de partie.
  const r = Math.sqrt(Math.max(1, Math.floor(level)));
  return { w: cmClamp(2 + Math.floor(r * 1.4), 2, 11), h: cmClamp(2 + Math.floor(r * 0.7), 2, 6) };
}
function cmRiverPortSpan(level) {
  // Port fluvial UNIQUE : emprise rectangulaire large le long du fleuve (quai +
  // parking à bateaux) et plus modeste vers la terre. Grandit avec le tier
  // (richesse/population) ; le bord sud reste plaqué sur l'eau, le corps s'étire
  // donc vers la berge. Le ponton du sprite plonge ensuite dans le fleuve.
  const t = cmEngineTier(level);
  // h : profondeur de repli ; la vraie profondeur est dérivée du fleuve à la pose
  // (assez pour atteindre l'eau au sud tout en gardant le dos sur terre, ≥ 3).
  return { w: t >= 3 ? 5 : t >= 2 ? 4 : t >= 1 ? 3 : 2, h: t >= 2 ? 4 : 3 };
}
function cmWaterMillSpan(level) {
  // Moulin à eau UNIQUE : même pose riveraine que le port (bord SUD plaqué au
  // centre du fleuve → la roue plonge dans l'eau RÉELLEMENT peinte ; on a donc
  // retiré le bief peint du sprite). Emprise plus étroite que le port (pas de quai
  // à bateaux) ; la profondeur réelle est dérivée du fleuve à la pose.
  const t = cmEngineTier(level);
  return { w: t >= 2 ? 4 : 3, h: t >= 2 ? 4 : 3 };
}
function cmEngineInstances(count, id) {
  if (id === "aqueducts") return count > 0 ? [Math.floor(count)] : [];
  // Champs : une seule ceinture agricole qui grandit (pas de tuiles dispersées).
  if (id === "irrigated_fields") return count > 0 ? [Math.floor(count)] : [];
  // Port fluvial / moulin à eau : un seul bâtiment riverain qui grandit
  // (pas de quais ni de moulins éparpillés sur la berge).
  if (id === "river_ports" || id === "water_mills") return count > 0 ? [Math.floor(count)] : [];
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
  // Les cellules de place portent un nom de place, pas de rue.
  const road = L && L.roadMap && L.roadMap.get(gx + "," + gy);
  if (road && road.rank === "plaza") {
    // Nom stable pour toute la place : basé sur la place la plus proche.
    let pKey = gx + ":" + gy;
    let pKind = "centrale";
    if (L.plan && Array.isArray(L.plan.plazas)) {
      let best = Infinity;
      for (const p of L.plan.plazas) {
        const d = Math.hypot(gx - p.gx, gy - p.gy);
        if (d < best) { best = d; pKey = p.gx + ":" + p.gy; pKind = p.kind || "centrale"; }
      }
    }
    const kindList = pKind === "marche" ? ["Place du Marché", "Halles"]
      : pKind === "parvis" ? ["Parvis", "Place du Temple"]
      : pKind === "jardin" ? ["Jardin Public", "Square"]
      : band >= 4 ? ["Grande Place", "Place", "Esplanade"] : ["Place", "Place Commune"];
    return `${cmPick(kindList, cmHash("pk" + pKey))} ${cmPick(CM_STREET_OF, cmHash("pof" + pKey))}`;
  }
  const vertical = Math.abs(gx - cx) >= Math.abs(gy - cy);
  const lineId = vertical ? 1000 + gx : 2000 + gy;
  const major = gx === cx || gy === cy;
  const of = cmPick(CM_STREET_OF, cmHash("of" + lineId));
  const kindList = major
    ? (band >= 4 ? ["Avenue", "Boulevard", "Grande Voie"] : ["Grand-Rue", "Grande Voie", "Voie"])
    : (band >= 4 ? ["Rue", "Avenue", "Passage"] : ["Rue", "Ruelle", "Venelle", "Sente"]);
  return `${cmPick(kindList, cmHash("k" + lineId))} ${of}`;
}

// ── Merveilles : slots et vérification ──────────────────────────────────────
function cmBaseWonderSlot(idx, gridN, cx, cy, ringTarget) {
  // Emplacement thématique propre à chaque merveille (angle/anneau dédiés),
  // avec un léger jitter seedé pour que deux parties ne soient pas identiques.
  const w = CM_WONDERS[idx] || CM_WONDERS[0];
  const seed = (typeof state !== "undefined" && state && state.mapSeed) ? state.mapSeed : 0;
  const jit = seed ? (((cmHash(seed + ":wslot:" + w.id) % 100) / 100) - 0.5) * 0.5 : 0;
  const angle = (w.slot ? w.slot.angle : idx * (Math.PI * 2 / CM_WONDERS.length) - Math.PI / 2) + jit;
  // Anneau de base : si la portée urbaine réelle est fournie (calcul du plan), on
  // l'utilise pour que les merveilles suivent le périmètre de la cité au lieu de
  // rester collées à un plafond fixe (34) que les mégalopoles débordent — sinon
  // elles finissent enfouies au cœur dense. À défaut (rendu), repli sur la grille.
  const ringBase = ringTarget && ringTarget > 0
    ? Math.max(WONDER_CLEAR_R + 2, ringTarget)
    : Math.max(WONDER_CLEAR_R + 2, Math.min(Math.round(gridN * 0.3), 34));
  let ring = Math.max(WONDER_CLEAR_R + 2, Math.round(ringBase * (w.slot ? w.slot.ring : 1)));
  // Plafonne (sans jamais réduire les petits anneaux) pour que la position reste
  // dans la grille : center ± ring doit tenir dans [3, gridN-3] (cf. blocked()).
  // Indispensable car ringTarget × ring 1.18 peut dépasser le bord sur les mégalopoles.
  const maxRing = Math.max(WONDER_CLEAR_R + 2, Math.floor(gridN / 2) - 3);
  ring = Math.min(ring, maxRing);
  return { gx: Math.round(cx + Math.cos(angle) * ring), gy: Math.round(cy + Math.sin(angle) * ring) };
}

function cmWonderSlot(idx, gridN, cx, cy) {
  const saved = CM.layout && CM.layout.wonderSlots && CM.layout.wonderSlots[idx];
  if (saved && saved.gridN === gridN && saved.cx === cx && saved.cy === cy) return { gx: saved.gx, gy: saved.gy };
  return cmBaseWonderSlot(idx, gridN, cx, cy);
}

function cmDryWonderSlot(idx, gridN, cx, cy, riverSet, bankSet, plazas, ringTarget) {
  const base = cmBaseWonderSlot(idx, gridN, cx, cy, ringTarget);
  const waterR = Math.max(2, WONDER_CLEAR_R - 1);
  const blocked = (gx, gy) => {
    if (gx < 2 || gy < 2 || gx > gridN - 3 || gy > gridN - 3) return true;
    // Jamais sur une esplanade : les places restent des espaces publics nus.
    if (Array.isArray(plazas)) {
      for (const p of plazas) {
        const half = p.size / 2 + 2.5;
        if (Math.abs(gx - p.gx) <= half && Math.abs(gy - p.gy) <= half) return true;
      }
    }
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
  if (!state.wonderTiers || typeof state.wonderTiers !== "object") state.wonderTiers = {};
  for (const w of CM_WONDERS) {
    let tier = 0;
    try { tier = cmWonderTier(w, state); } catch (e) { tier = 0; }
    const prev = state.wonderTiers[w.id] || (state.wonders.includes(w.id) ? 1 : 0);
    if (tier <= prev) {
      // Les merveilles ne régressent jamais : la pierre garde la mémoire du sommet.
      if (prev > 0 && !state.wonderTiers[w.id]) state.wonderTiers[w.id] = prev;
      continue;
    }
    state.wonderTiers[w.id] = tier;
    if (!state.wonders.includes(w.id)) {
      state.wonders.push(w.id);
      CM.born["wonder:" + w.id] = now;
      if (typeof chronicle === "function") chronicle(`Merveille érigée : ${w.name}. La cité grave son ascension dans la pierre.`);
    } else {
      // Montée de rang : animation de reconstruction + chronique.
      CM.born["wonder:" + w.id] = now;
      if (typeof chronicle === "function") chronicle(`${w.name} s'élève au rang ${WONDER_TIER_NAMES[tier]} — ${w.tierLabel(w.tiers[tier - 1])}. Les bâtisseurs surpassent leurs ancêtres.`);
    }
  }
}

// ── Graphe routier ───────────────────────────────────────────────────────────
function cmIsBridgeRoad(layout, gx, gy) {
  const road = layout && layout.roadMap && layout.roadMap.get(gx + "," + gy);
  return !!(road && road.roadSurface === "bridge");
}

function cmBuildRoadGraph(roads, roadSet, roadMeta, river, cx, cy) {
  const key = (gx, gy) => gx + "," + gy;
  const ORTHO = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const isWater = (gx, gy) => !!(river && river.isWater && river.isWater(gx, gy));
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

  // ── Élagage de connectivité : ne garder que le réseau marchable relié au cœur.
  //    Les piétons se déplacent par adjacence ORTHOGONALE (agents.js) ; tout
  //    fragment terrestre, mini-cluster ou cul-de-sac coupé du cœur est à la fois
  //    un piège (habitant bloqué « au milieu de nulle part ») et un artefact
  //    visuel. On flood-fill depuis la route marchable la plus proche du cœur et
  //    on retire le reste. (Les ponts sans issue terrestre des deux côtés ont
  //    déjà été écartés par la validation ci-dessus.) Le réseau étant généré
  //    depuis le cœur, les composantes hors-cœur sont en pratique de petits
  //    fragments — pas des quartiers légitimes.
  const isBridgeAt = (gx, gy) => {
    const rr = graph.roadMap.get(key(gx, gy));
    return !!(rr && rr.roadSurface === "bridge");
  };
  const walkable = (gx, gy) => {
    const k = key(gx, gy);
    if (!graph.roadMap.has(k)) return false;
    if (river && river.cells && river.cells.has(k)) return isBridgeAt(gx, gy);
    if (river && river.banks && river.banks.has(k)) {
      return ORTHO.some(([dx, dy]) => isBridgeAt(gx + dx, gy + dy));
    }
    return true;
  };
  let seedKey = null, seedD = Infinity;
  for (const r of graph.roads) {
    if (!walkable(r.gx, r.gy)) continue;
    const d = (r.gx - cx) * (r.gx - cx) + (r.gy - cy) * (r.gy - cy);
    if (d < seedD) { seedD = d; seedKey = key(r.gx, r.gy); }
  }
  if (seedKey) {
    const reached = new Set([seedKey]);
    const stack = [seedKey];
    while (stack.length) {
      const k = stack.pop();
      const comma = k.indexOf(",");
      const gx = +k.slice(0, comma), gy = +k.slice(comma + 1);
      for (const [dx, dy] of ORTHO) {
        const ngx = gx + dx, ngy = gy + dy, nk = key(ngx, ngy);
        if (reached.has(nk) || !walkable(ngx, ngy)) continue;
        reached.add(nk);
        stack.push(nk);
      }
    }
    let pruned = false;
    for (const r of graph.roads) {
      if (!reached.has(key(r.gx, r.gy))) { activeSet.delete(key(r.gx, r.gy)); pruned = true; }
    }
    if (pruned) graph = buildGraph(activeSet);
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

// ── Compteurs et disposition ─────────────────────────────────────────────────
function cityCounts(s) {
  const b = s.buildings || {};
  const get = (id) => b[id] || 0;
  const foodB = get("foragers") + get("granaries_city") + get("irrigated_fields") + get("water_mills") + get("river_ports");
  const lg = (v) => Math.log10(Math.max(0, v) + 1);
  const eraIndex    = cmEraIndexFor(s);
  const eraFrac     = cmEraFrac(eraIndex);
  const eraBand     = cmEraBand(eraIndex);
  const popDepth    = lg(toNum(s.population));
  const infraDepth  = lg(toNum(s.infrastructure));
  const knowledgeDepth = lg(toNum(s.knowledge));
  const urbanTier   = cmClamp(eraBand * 1.8 + Math.max(0, infraDepth - 5) * 0.85, 0, 14);
  const campTier    = cmClamp(popDepth - 1, 0, 3);
  const lateSurge   = Math.pow(Math.max(0, eraIndex - 12), 2.08);
  // Multiplicateur progressif : village compact (×1) → mégalopole étendue (×2.5)
  const lateScale   = 1 + Math.pow(eraFrac, 2) * 1.5;
  // Remplissage par la population : le plafond de maisons était piloté par le
  // SEUL âge (eraFrac) → une population qui gonfle AU SEIN d'un âge ne densifiait
  // jamais la ville (224 K habitants restaient un camp clairsemé de ~18 toits).
  // On ajoute un terme de pop SATURÉ (popDepth borné à 10) et PONDÉRÉ par
  // l'avancée d'âge (1−eraFrac) : il remplit la ville en early/mid — là où la pop
  // dépasse vite le décor — et s'efface en fin de partie, où l'âge fournit déjà
  // un grand plafond. Purement visuel : n'affecte que le nombre de toits dessinés.
  const popFill     = Math.pow(Math.min(popDepth, 10), 1.45) * (1 - eraFrac * 0.85);
  const houseCap    = Math.round((8 + Math.pow(eraFrac, 1.72) * 650) * lateScale + popFill * 10);
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

// ── Génération de la disposition (pure) ─────────────────────────────────────
function computeCityLayout(s) {
  const c = cityCounts(s);
  // ── Couche procédurale : seed de partie, personnalité, config d'âge ──────
  const mapSeed = ensureMapSeed(s);
  const personality = computeCityPersonality(mapSeed, s);
  const ageCfg = ageConfigFor(c.eraBand);
  const total = c.houses + c.farms + c.publics + c.libs;
  const enginePressure = CM_MAP_BUILDINGS.reduce((sum, meta) => {
    const level = Math.floor((s.buildings && s.buildings[meta.id]) || 0);
    return sum + cmEngineInstances(level).reduce((acc, group) => acc + Math.max(1, cmEngineFootprint(meta.id, group) ** 2), 0);
  }, 0);
  // Facteur de packing : village dense (0.27) → mégalopole diffuse (0.13)
  const packFactor = 0.27 - c.eraFrac * 0.14;
  // Grille minimale selon le nombre de merveilles : chacune réclame un rayon libre,
  // il faut assez d'espace pour les espacer correctement en cercle.
  // Seules les merveilles RÉÉRIGÉES ce cycle (cf. cmWonderActive) réclament de
  // l'espace : un village en début de cycle ne gonfle plus sa grille pour des
  // monuments encore en sommeil.
  const wonderCount = cmWonderActiveIds(s).size;
  const minNWonders = wonderCount >= 5 ? 36 : wonderCount >= 3 ? 30 : wonderCount >= 1 ? 24 : 20;
  let N = minNWonders;
  while (N * N * packFactor < total + enginePressure * 1.35 + 10 + c.megaDistricts * 18 && N < 300) N += 2;
  const cx = Math.floor(N / 2), cy = Math.floor(N / 2);

  // Rivière fixe — stockée dans state.riverWP, la ville s'étend autour
  const xStart = cx - N * 1.8, xEnd = cx + N * 1.8;
  const WN = 6;
  let WP;
  if (s.riverWP && s.riverWP.length === WN) {
    WP = s.riverWP.map((p, i) => ({
      x: xStart + (xEnd - xStart) * (i / (WN - 1)),
      y: cy + p.dy
    }));
  } else {
    // Rivière seedée par partie : chaque civilisation a son propre cours d'eau.
    const rrng = seededRng(mixSeed(mapSeed, "river") + 7);
    const bandY = cy + N * (0.16 + rrng() * 0.16);
    WP = [];
    for (let i = 0; i < WN; i += 1) {
      WP.push({ x: xStart + (xEnd - xStart) * (i / (WN - 1)), y: cmClamp(bandY + (rrng() - 0.5) * N * 0.32, cy + N * 0.08, N - 1.5) });
    }
    s.riverWP = WP.map((p) => ({ dy: p.y - cy }));
  }
  const cr = (a, b, c2, d, t) => { const t2 = t * t, t3 = t2 * t; return 0.5 * (2 * b + (-a + c2) * t + (2 * a - 5 * b + 4 * c2 - d) * t2 + (-a + 3 * b - 3 * c2 + d) * t3); };
  // Densité d'échantillonnage proportionnelle à la taille : l'espacement entre
  // samples doit rester << rayon des disques riverSet/bankSet (~hw+1.4), sinon
  // de grands trous s'ouvrent entre samples sur les grandes cartes et le RUBAN
  // PEINT (spline continue) recouvre des cellules classées « sèches » → des
  // bâtiments se posent sous l'eau peinte. Pas de fixe : ~1.5 cellule par pas.
  const STEPS = Math.max(12, Math.ceil((N * 3.6 / (WN - 1)) / 1.5));
  const riverSamples = [];
  for (let i = 0; i < WN - 1; i += 1) {
    const p0 = WP[Math.max(0, i - 1)], p1 = WP[i], p2 = WP[i + 1], p3 = WP[Math.min(WN - 1, i + 2)];
    for (let st = 0; st < STEPS; st += 1) {
      const t = st / STEPS;
      const x = cr(p0.x, p1.x, p2.x, p3.x, t), y = cr(p0.y, p1.y, p2.y, p3.y, t);
      const u = Math.max(0, Math.min(1, (x - xStart) / (xEnd - xStart)));
      riverSamples.push({ x, y, hw: 2.0 + 1.1 * Math.sin(Math.PI * u) });
    }
  }
  riverSamples.push({ x: WP[WN - 1].x, y: WP[WN - 1].y, hw: 2.0 });
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
  const riverYByCol = new Array(N), riverHwByCol = new Array(N);
  for (let gx = 0; gx < N; gx += 1) {
    let by = cy + N, bhw = 1.5, bd = Infinity;
    for (const sp of riverSamples) { const dd = Math.abs(sp.x - (gx + 0.5)); if (dd < bd) { bd = dd; by = sp.y; bhw = sp.hw; } }
    riverYByCol[gx] = by; riverHwByCol[gx] = bhw;
  }
  const riverYAt = (gx) => riverYByCol[Math.max(0, Math.min(N - 1, Math.round(gx)))];
  // Demi-largeur visible du ruban au droit d'une colonne (pour caler un riverain
  // sur le bord d'eau RÉELLEMENT peint, pas sur le riverSet euclidien plus large).
  const riverHwAt = (gx) => riverHwByCol[Math.max(0, Math.min(N - 1, Math.round(gx)))];

  const cityReachBase = Math.max(5, Math.min(N * 0.46, N * (0.18 + c.eraFrac * 0.24) + Math.sqrt(total + enginePressure * 1.1) * 0.25));
  // ── Plan de ville procédural : archétype, cœur urbain, quartiers, places ──
  // Corridor du fleuve = eau ∪ berge : les places ne s'y posent jamais (seuls
  // routes/ponts traversent l'eau). Le reste (quartiers, merveilles) l'évite déjà.
  const corridorAt = (gx, gy) => { const k = gx + "," + gy; return riverSet.has(k) || bankSet.has(k); };
  const plan = generateCityPlan({ seed: mapSeed, counts: c, personality, ageCfg, N, cx, cy, riverYAt, corridorAt });
  plan.reachBase = cityReachBase;
  plan.finalize({ reachBase: cityReachBase });
  const quarterAnchors = plan.anchors;

  // Pont historique : la traversée la plus proche du cœur urbain.
  let riverBridge = riverSamples[0], rbd = Infinity;
  for (const sp of riverSamples) { const dd = Math.abs(sp.x - (plan.core.x + 0.5)); if (dd < rbd) { rbd = dd; riverBridge = sp; } }

  // Modèle d'eau : source de vérité unique du « sur l'eau / berge / près / sec ».
  // Construit tôt pour que pose, graphe routier et rendu consultent les mêmes
  // prédicats. Sur-ensemble du contrat river historique → rétro-compatible.
  const water = createWaterModel({
    cells: riverSet, banks: bankSet, near: nearSet,
    samples: riverSamples, bridge: riverBridge, riverYAt, present: true
  });
  const river = water;

  // Fonction chaude : appelée pour chaque cellule de la grille + chaque tronçon
  // de route + chaque tentative de district. Boucle simple et hash entier
  // (pas de concaténation de chaînes ni de closure de reduce).
  const riverPullFactor = c.eraBand >= 2 ? 0.55 : 0.2;
  const organicLimit = (gx, gy, margin = 0) => {
    const px = gx + 0.5, py = gy + 0.5;
    const dx = px - plan.core.x, dy = py - plan.core.y;
    const dist = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);
    const riverPull = Math.max(0, 5.5 - Math.abs(py - riverYAt(gx))) * riverPullFactor;
    let quarterPull = 0;
    for (let qi = 0; qi < quarterAnchors.length; qi += 1) {
      const q = quarterAnchors[qi];
      const pull = (q.r - Math.hypot(px - q.gx, py - q.gy)) * q.strength;
      if (pull > quarterPull) quarterPull = pull;
    }
    const h = (Math.imul(gx | 0, 73856093) ^ Math.imul(gy | 0, 19349663) ^ mapSeed) >>> 0;
    const hashEdge = ((h % 1000) / 1000 - 0.5) * 1.8;
    return dist <= plan.reachFor(cityReachBase, angle) + riverPull + quarterPull + hashEdge + margin;
  };
  const organicScore = (cell) => {
    const dx = cell.gx + 0.5 - plan.core.x, dy = cell.gy + 0.5 - plan.core.y;
    const reach = Math.max(1, plan.reachFor(cityReachBase, Math.atan2(dy, dx)));
    return Math.hypot(dx, dy) / reach;
  };

  // ── Réseau viaire procédural (axes, rues, sentiers, places, ponts) ───────
  // Moteur graphe : réseau connexe par construction (cf. roadGraph.js).
  const { roads, roadKey, roadMeta } = generateRoadsGraph({
    plan, seed: mapSeed, counts: c, ageCfg, N,
    riverSet, bankSet, riverBridgeX: riverBridge.x, organicLimit
  });

  // ── Enceinte urbaine (ère fortifiée+) ─────────────────────────────────────
  // Le rayon est FIGÉ à la construction (state.wallRadius) : la muraille ne
  // suit pas la croissance de la ville — c'est la ville qui déborde de ses
  // murs, comme dans une vraie cité. Reset à chaque effondrement.
  const frozenWallReach = Number.isFinite(s.wallRadius) && s.wallRadius > 0 ? s.wallRadius : null;
  const walls = generateWalls({
    plan, seed: mapSeed, counts: c, ageCfg, personality, N,
    reachBase: frozenWallReach || cityReachBase, roadKey, roadMeta, riverSet, bankSet
  });
  if (walls && !frozenWallReach) s.wallRadius = cityReachBase;
  const wallSet = walls ? walls.set : null;

  // Districts (anti-collision merveilles + fleuve)
  const districts = [];
  const occupiedFoot = new Set();
  const builtWonderIds = cmWonderActiveIds(s);
  // ringTarget = portée urbaine réelle → les merveilles se posent sur le périmètre
  // de la cité et s'écartent à mesure qu'elle grandit (plus de cap fixe à 34).
  const wonderSlots = CM_WONDERS.map((_, wi) => cmDryWonderSlot(wi, N, cx, cy, riverSet, bankSet, plan.plazas, cityReachBase));
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
      if (wallSet && wallSet.has(tx + "," + ty)) return false;
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
    // Orientation seedée : les grands complexes ne poussent pas aux mêmes angles d'une partie à l'autre.
    const baseAngle = (Math.PI * 2 * n) / Math.max(6, c.megaDistricts) + (n % 2) * 0.28 + (mixSeed(mapSeed, "districts") % 628) / 100;
    let placed = null;
    for (let attempt = 0; attempt < 10 && !placed; attempt += 1) {
      const ring = 5 + Math.floor(n / 6) * 5 + attempt;
      const angle = baseAngle + attempt * 0.17;
      // Math.floor obligatoire : les clés de riverSet/bankSet/occupiedFoot sont des entiers.
      // Sans floor, "12.83,5" != "12,5" et le check fleuve ne fonctionne jamais.
      const gx = Math.floor(cmClamp(cx + Math.cos(angle) * ring, 1, N - size - 1));
      const gy = Math.floor(cmClamp(cy + Math.sin(angle) * ring, 1, N - size - 1));
      if (footFits(gx, gy, size)) placed = { gx, gy };
    }
    if (!placed) continue;
    for (let ax = 0; ax < size; ax += 1) for (let ay = 0; ay < size; ay += 1) occupiedFoot.add((placed.gx + ax) + "," + (placed.gy + ay));
    districts.push({ gx: placed.gx, gy: placed.gy, size, kind, key: `district:${placed.gx},${placed.gy}:${kind}` });
  }

  // Zone réservée (merveilles + districts)
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

  // Cellules (bâtissables + arbres)
  const cells = [];
  const quarterScore = (cell) => quarterAnchors.reduce((best, q) => {
    const qd = Math.hypot((cell.gx + 0.5) - q.gx, (cell.gy + 0.5) - q.gy);
    return Math.max(best, Math.max(0, q.r * 1.35 - qd) / Math.max(1, q.r) * q.strength);
  }, 0);
  for (let gx = 0; gx < N; gx += 1) {
    for (let gy = 0; gy < N; gy += 1) {
      const key = gx + "," + gy;
      if (roadKey.has(key) || riverSet.has(key) || bankSet.has(key) || reserved.has(key)) continue;
      if (wallSet && wallSet.has(key)) continue;
      if (!organicLimit(gx, gy, 0.8)) continue;
      const dx = gx - cx, dy = gy - cy;
      const score = organicScore({ gx, gy });
      const noise = (cmHash("green:" + gx + ":" + gy + ":" + mapSeed) % 100) / 100;
      // Espaces verts/vides : pilotés par la config d'âge et la personnalité
      // (une cité fastueuse garde ses jardins, une mégalopole bétonne tout).
      const parkBase = ageCfg.parkChance * (personality.treeMul || 1);
      const parkChance = Math.max(0.05, Math.min(0.45, parkBase * 0.55 + Math.max(0, score - 0.58) * 0.42));
      cells.push({ gx, gy, d2: dx * dx + dy * dy, score, green: noise < parkChance });
    }
  }
  // Décore-trie-retire : score calculé une seule fois par cellule (les
  // comparateurs avec boucle d'ancres rendaient le tri quadratique en pratique).
  const buildable = cells
    .filter((cc) => !cc.green)
    .map((cc) => ({ cc, s: cc.score * 100 + cc.d2 * 0.012 - quarterScore(cc) * 15 + (cmHash("build:" + cc.gx + ":" + cc.gy) % 17) / 40 }))
    .sort((a, b) => a.s - b.s)
    .map((e) => e.cc);

  const tiles = [], usedKeys = new Set();

  // ── Placement par catégorie : quartiers, rues, places, personnalité ──────
  const placer = createBuildingPlacer({
    cells: buildable, plan, roadKey, counts: c, personality, ageCfg,
    seed: mapSeed, nearSet, N, requireRoad: true
  });
  const pushTile = (t) => tiles.push(t);
  // Multiplicateurs de personnalité : une cité agricole a plus de champs,
  // une cité savante plus de lieux de savoir... (bornés par les caps d'ère)
  const biasedCount = (n, mul) => Math.max(0, Math.round(n * (mul || 1)));

  // Emprises moteur (bâtiments achetés) — réservées avant les tuiles décoratives
  const claimed = new Set(), engineFootprint = new Set();
  // La muraille est inconstructible : sans cette graine, les emprises multi-
  // cellules et les slots sauvegardés d'avant l'enceinte passent par-dessus.
  if (wallSet) for (const k of wallSet) claimed.add(k);
  for (const d of districts) {
    for (let ax = 0; ax < d.size; ax += 1) for (let ay = 0; ay < d.size; ay += 1) claimed.add((d.gx + ax) + "," + (d.gy + ay));
  }
  const footprintFits = (gx, gy, sizeX, allowBank = false, allowRoad = false, sizeY = sizeX, allowWater = false) => {
    if (gx < 0 || gy < 0 || gx + sizeX > N || gy + sizeY > N) return false;
    for (let ax = 0; ax < sizeX; ax += 1) for (let ay = 0; ay < sizeY; ay += 1) {
      const key = (gx + ax) + "," + (gy + ay);
      if (claimed.has(key) || (!allowRoad && roadKey.has(key))) return false;
      if (!allowWater && riverSet.has(key)) return false;
      if (!allowBank && bankSet.has(key)) return false;
    }
    return true;
  };
  const claimFootprint = (gx, gy, sizeX, sizeY = sizeX) => {
    for (let ax = 0; ax < sizeX; ax += 1) for (let ay = 0; ay < sizeY; ay += 1) claimed.add((gx + ax) + "," + (gy + ay));
  };
  // Côté (N/S/E/W) par lequel une emprise sizeX×sizeY touche le FLEUVE (cellules
  // d'eau, pas la berge) — sert à orienter le sprite riverain vers le vrai cours
  // d'eau. Renvoie le bord le plus mouillé, ou null si l'emprise ne borde pas
  // l'eau (donc pas un vrai riverain : candidat à rejeter).
  const footprintWaterSide = (gx, gy, sizeX, sizeY) => {
    let n = 0, s = 0, e = 0, w = 0;
    for (let ax = 0; ax < sizeX; ax += 1) {
      if (riverSet.has((gx + ax) + "," + (gy - 1)))     n += 1;
      if (riverSet.has((gx + ax) + "," + (gy + sizeY))) s += 1;
    }
    for (let ay = 0; ay < sizeY; ay += 1) {
      if (riverSet.has((gx - 1) + "," + (gy + ay)))      w += 1;
      if (riverSet.has((gx + sizeX) + "," + (gy + ay)))  e += 1;
    }
    const m = Math.max(n, s, e, w);
    if (m === 0) return null;
    // Égalités tranchées vers le bas (S) : c'est l'orientation native du sprite.
    if (m === s) return "S";
    if (m === n) return "N";
    if (m === e) return "E";
    return "W";
  };
  // Listes de base par pool (recalculées une fois par taille, pas par requête).
  // Le pool dépend de l'affinité à l'eau (on/bank/near → cellules d'eau/rive)
  // OU, à défaut, de la zone terrestre (outside vs buildable).
  const engineBaseCache = new Map();
  const fitsGrid = (cell, size) => cell.gx >= 0 && cell.gy >= 0 && cell.gx + size <= N && cell.gy + size <= N;
  const cellsFromSet = (set, size) => Array.from(set).map((k) => {
    const cma = k.indexOf(",");
    return { gx: +k.slice(0, cma), gy: +k.slice(cma + 1) };
  }).filter((cell) => fitsGrid(cell, size));
  const engineBaseFor = (zone, affinity, size) => {
    const waterAffine = cmWaterAffine(affinity);
    const cacheKey = (waterAffine ? "w:" + affinity : "z:" + zone) + ":" + size;
    let base = engineBaseCache.get(cacheKey);
    if (base) return base;
    if (affinity === "on")        base = cellsFromSet(riverSet, size);
    else if (affinity === "bank") base = cellsFromSet(new Set([...Array.from(nearSet), ...Array.from(bankSet)]), size);
    else if (affinity === "near") base = cellsFromSet(nearSet, size);
    else if (zone === "outside")  base = cells.filter((cell) => fitsGrid(cell, size));
    else                          base = buildable;
    engineBaseCache.set(cacheKey, base);
    return base;
  };
  // Fonction chaude (une exécution par bâtiment moteur × toutes les cellules) :
  // clés dans un Float64Array + argsort d'indices, jitter par hash entier —
  // pas d'objets temporaires ni de hash de chaîne par cellule.
  const engineCandidates = (zone, affinity, size, id, index = 0, total = 1, limit = 1024) => {
    const base = engineBaseFor(zone, affinity, size);
    const waterAffine = cmWaterAffine(affinity);
    const half = size / 2;
    const idHash = cmHash(id + ":" + index) >>> 0;
    const angleTarget = (Math.PI * 2 * index) / Math.max(1, total) + (cmHash(id) % 628) / 100;
    const n = base.length;
    const keys = new Float64Array(n);
    for (let i = 0; i < n; i += 1) {
      const cell = base[i];
      const px = cell.gx + half, py = cell.gy + half;
      const dist = Math.hypot(px - cx, py - cy);
      let angular = Math.abs(Math.atan2(py - cy, px - cx) - angleTarget);
      if (angular > Math.PI) angular = Math.PI * 2 - angular;
      const jitter = (((Math.imul(cell.gx | 0, 73856093) ^ Math.imul(cell.gy | 0, 19349663) ^ idHash) >>> 0) % 1000) / 1000;
      let k;
      // Un bâtiment affine à l'eau se range le long du fil du courant, quelle
      // que soit sa zone nominale.
      if (waterAffine || zone === "river") k = Math.abs(py - riverYAt(px)) + Math.abs(px - (cx + (index - total / 2) * 4)) * 0.22;
      else if (zone === "center")    k = dist + angular * 1.8;
      else if (zone === "mid")       k = Math.abs(dist - N * 0.24) + angular * 2.4;
      else if (zone === "caravan")   k = Math.abs(dist - N * 0.38) + angular * 1.4;
      else if (zone === "edge")      k = Math.abs(dist - N * 0.44) + angular * 2 + Math.max(0, cell.gy - cy) * 0.02;
      else if (zone === "outside")   k = Math.abs(dist - N * 0.48) + Math.max(0, cy - cell.gy) * 0.025 + angular * 1.2;
      else if (zone === "knowledge") k = Math.abs(dist - N * 0.28) + angular * 2 + Math.max(0, cell.gy - cy) * 0.01;
      else if (zone === "ruin")      k = Math.abs(dist - N * 0.4) + angular * 1.5 + Math.max(0, cy - cell.gy) * 0.018;
      else                           k = Math.abs(dist - N * 0.42) + angular * 1.8;
      keys[i] = k + jitter;
    }
    // Sélection top-K (tas max) : on n'a besoin que des ~meilleures cellules,
    // trier les dizaines de milliers d'autres serait du travail perdu.
    const K = Math.min(n, limit);
    if (K === n) {
      const idx = new Uint32Array(n);
      for (let i = 0; i < n; i += 1) idx[i] = i;
      idx.sort((a, b) => keys[a] - keys[b]);
      const out = new Array(n);
      for (let i = 0; i < n; i += 1) out[i] = base[idx[i]];
      return out;
    }
    const heap = new Uint32Array(K);
    let heapSize = 0;
    const siftUp = (i) => {
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (keys[heap[p]] >= keys[heap[i]]) break;
        const t = heap[p]; heap[p] = heap[i]; heap[i] = t; i = p;
      }
    };
    const siftDown = () => {
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < heapSize && keys[heap[l]] > keys[heap[m]]) m = l;
        if (r < heapSize && keys[heap[r]] > keys[heap[m]]) m = r;
        if (m === i) break;
        const t = heap[m]; heap[m] = heap[i]; heap[i] = t; i = m;
      }
    };
    for (let i = 0; i < n; i += 1) {
      if (heapSize < K) { heap[heapSize] = i; heapSize += 1; siftUp(heapSize - 1); }
      else if (keys[i] < keys[heap[0]]) { heap[0] = i; siftDown(); }
    }
    const idx = heap.slice(0, heapSize);
    idx.sort((a, b) => keys[a] - keys[b]);
    const out = new Array(idx.length);
    for (let i = 0; i < idx.length; i += 1) out[i] = base[idx[i]];
    return out;
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
    // ── Aqueduc : structure linéaire (spanX tiles × 1 tile) ─────────────────
    if (req.meta.id === "aqueducts") {
      const spanX = cmAqueductSpan(req.level), spanY = 1;
      let placed = null;
      const slot = slotStore[req.slotKey];
      if (preferSavedSlot && slot) {
        const saved = { gx: cmClamp(cx + (Number(slot.dx) || 0), 0, N - spanX), gy: cmClamp(cy + (Number(slot.dy) || 0), 0, N - spanY) };
        if (footprintFits(saved.gx, saved.gy, spanX, false, false, spanY)) placed = saved;
      }
      if (!placed) {
        // Décore-trie-retire : score calculé une fois par cellule.
        // L'aqueduc longe la lisière de la ville (reach + 2.5), pas le bord de
        // la grille : à N*0.46 il finissait hors de la zone que le joueur
        // regarde, visible seulement en dézoom LOD (gros pavés).
        const aqRing = Math.min(N * 0.44, (frozenWallReach || cityReachBase) + 2.5);
        const aqCells = cells.filter((c2) => c2.gx + spanX <= N && c2.gy + spanY <= N)
          .map((c2) => ({ c2, s: Math.abs(Math.hypot(c2.gx + spanX / 2 - cx, c2.gy + 0.5 - cy) - aqRing) + (cmHash("aq:" + c2.gx + ":" + c2.gy) % 1000) / 1000 }))
          .sort((a, b) => a.s - b.s)
          .map((e) => e.c2);
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
    // ── Champs : ceinture agricole 2D (spanX × spanY) collée à la lisière ──
    // Un seul bloc qui grandit avec le niveau, placé tangent au bord de la ville
    // (comme la ferme qui s'étend autour du bourg) plutôt que des tuiles éparses.
    if (req.meta.id === "irrigated_fields") {
      const fs = cmFieldSpan(req.level);
      let spanX = fs.w, spanY = fs.h, placed = null;
      const slot = slotStore[req.slotKey];
      if (preferSavedSlot && slot) {
        const saved = { gx: cmClamp(cx + (Number(slot.dx) || 0), 0, N - spanX), gy: cmClamp(cy + (Number(slot.dy) || 0), 0, N - spanY) };
        if (footprintFits(saved.gx, saved.gy, spanX, false, false, spanY)) placed = saved;
      }
      if (!placed) {
        const fieldRing = Math.min(N * 0.46, (frozenWallReach || cityReachBase) + Math.max(spanX, spanY) / 2 + 1);
        const fieldCells = cells
          .map((c2) => ({ c2, s: Math.abs(Math.hypot(c2.gx + spanX / 2 - cx, c2.gy + spanY / 2 - cy) - fieldRing) + (cmHash("field:" + c2.gx + ":" + c2.gy) % 1000) / 1000 }))
          .sort((a, b) => a.s - b.s)
          .map((e) => e.c2);
        const tryPlace = () => { for (const c2 of fieldCells) if (footprintFits(c2.gx, c2.gy, spanX, false, false, spanY)) return c2; return null; };
        placed = tryPlace();
        // Repli : rétrécir le bloc si la ville est trop dense pour le loger.
        while (!placed && (spanX > 2 || spanY > 2)) { spanX = Math.max(2, spanX - 1); spanY = Math.max(2, spanY - 1); placed = tryPlace(); }
      }
      if (!placed) return false;
      claimFootprint(placed.gx, placed.gy, spanX, spanY);
      for (let ax = 0; ax < spanX; ax += 1) for (let ay = 0; ay < spanY; ay += 1) {
        engineFootprint.add((placed.gx + ax) + "," + (placed.gy + ay));
        usedKeys.add((placed.gx + ax) + "," + (placed.gy + ay));
      }
      const dx = placed.gx + spanX / 2 - cx, dy = placed.gy + spanY / 2 - cy;
      tiles.push({ gx: placed.gx, gy: placed.gy, type: "engine", variant: "irrigated_fields", buildingId: "irrigated_fields",
        buildingName: req.meta.name, level: req.level, groupLevel: req.groupLevel,
        groupIndex: 1, groupTotal: 1, tier: req.tier, size: Math.max(spanX, spanY), spanX, spanY,
        key: `engine:irrigated_fields:0:${req.slotKey}:${req.tier}`, d2: dx * dx + dy * dy });
      slotStore[req.slotKey] = { dx: placed.gx - cx, dy: placed.gy - cy, zone: req.meta.zone, id: req.meta.id };
      liveSlotKeys.add(req.slotKey);
      placedSlotKeys.add(req.slotKey);
      return true;
    }
    // ── Port fluvial / moulin à eau : bâtiment UNIQUE forcé sur la rive ───────
    // Emprise rectangulaire posée sur la rive nord, bord SUD plaqué contre l'eau
    // VISIBLE (waterSide "S" garanti, jamais de repli N/E/O) : le ponton (port) ou
    // la roue à aubes (moulin) plonge alors pile dans le fleuve et le corps s'étire
    // derrière sur la berge. Placement déterministe (colonnes triées par proximité
    // au cœur) → stable. Le port étant posé avant le moulin, ce dernier prend la
    // meilleure colonne libre restante sur la même rive.
    if (req.meta.id === "river_ports" || req.meta.id === "water_mills") {
      const rp = req.meta.id === "water_mills" ? cmWaterMillSpan(req.level) : cmRiverPortSpan(req.level);
      let spanX = rp.w, spanY = rp.h, placed = null;
      // Rangée nord (dos du bâtiment) hors de l'eau : le corps reste sur terre.
      const northRowDry = (gx, gy, sx) => {
        for (let ax = 0; ax < sx; ax += 1) if (riverSet.has((gx + ax) + "," + gy)) return false;
        return true;
      };
      // Cale le bord SUD de l'emprise sur le CENTRE du fleuve (eau la plus vive),
      // avec une profondeur dérivée de la demi-largeur : le ponton et le bateau
      // tombent en pleine eau, le corps du bâtiment retombe sur la berge au nord.
      const fitOnShore = (gx, sx) => {
        const c = gx + sx / 2;
        const sy = cmClamp(Math.round(riverHwAt(c)) + 2, 3, 5);
        const south = Math.round(riverYAt(c)) - 1;             // bord sud : 1 case avant le centre (port un poil plus haut)
        const gy = south - sy;
        if (gx < 0 || gx + sx > N || gy < 0 || south > N - 1) return null;
        if (!northRowDry(gx, gy, sx)) return null;
        if (!footprintFits(gx, gy, sx, true, false, sy, true)) return null; // dock/eau toléré
        return { gx, gy, sy };
      };
      const slot = slotStore[req.slotKey];
      if (preferSavedSlot && slot) {
        // dy = rangée SUD (centre du fleuve), sy = profondeur mémorisée.
        const sy = cmClamp(Number(slot.sy) || spanY, 3, 5);
        const sgx = cmClamp(cx + (Number(slot.dx) || 0), 0, N - spanX);
        const sgy = cmClamp(cy + (Number(slot.dy) || 0), 0, N - 1) - sy;
        if (sgy >= 0 && northRowDry(sgx, sgy, spanX)
          && footprintFits(sgx, sgy, spanX, true, false, sy, true)) { placed = { gx: sgx, gy: sgy }; spanY = sy; }
      }
      if (!placed) {
        const baseX = Math.round(plan.core.x);
        // Repli : rétrécir la largeur si la rive est trop encombrée près du cœur.
        for (const sx of (spanX > 2 ? [spanX, Math.max(2, spanX - 1), 2] : [2])) {
          const cols = [];
          for (let gx = 1; gx <= N - sx - 1; gx += 1) cols.push(gx);
          cols.sort((a, b) => (Math.abs(a + sx / 2 - baseX) - Math.abs(b + sx / 2 - baseX)) || (a - b));
          for (const gx of cols) {
            if (Math.abs(gx + sx / 2 - riverBridge.x) < 2) continue; // laisser la travée du pont libre
            const cand = fitOnShore(gx, sx);
            if (cand) { placed = cand; spanX = sx; spanY = cand.sy; break; }
          }
          if (placed) break;
        }
      }
      if (!placed) return false;
      claimFootprint(placed.gx, placed.gy, spanX, spanY);
      for (let ax = 0; ax < spanX; ax += 1) for (let ay = 0; ay < spanY; ay += 1) {
        engineFootprint.add((placed.gx + ax) + "," + (placed.gy + ay));
        usedKeys.add((placed.gx + ax) + "," + (placed.gy + ay));
      }
      const dx = placed.gx + spanX / 2 - cx, dy = placed.gy + spanY / 2 - cy;
      tiles.push({ gx: placed.gx, gy: placed.gy, type: "engine", variant: req.meta.id, buildingId: req.meta.id,
        buildingName: req.meta.name, level: req.level, groupLevel: req.groupLevel,
        groupIndex: 1, groupTotal: 1, tier: req.tier, size: Math.max(spanX, spanY), spanX, spanY, waterSide: "S",
        key: `engine:${req.meta.id}:0:${req.slotKey}:${req.tier}`, d2: dx * dx + dy * dy });
      // dy = rangée sud (centre du fleuve), sy = profondeur, pour rester plaqué.
      slotStore[req.slotKey] = { dx: placed.gx - cx, dy: (placed.gy + spanY) - cy, sy: spanY, zone: req.meta.zone, id: req.meta.id };
      liveSlotKeys.add(req.slotKey);
      placedSlotKeys.add(req.slotKey);
      return true;
    }
    const aff = cmWaterAffinity(req.meta);
    // ── Bâtiments de berge (ports, moulins) ──────────────────────────────────
    // L'emprise se cale au bord du fleuve (sur terre/berge, JAMAIS sur l'eau) et
    // DOIT border l'eau. Le sprite est dessiné « eau en bas » (vue oblique, toit
    // vers le haut) : on PRIORISE donc une pose dont le fleuve est au sud
    // (waterSide "S"), où le sprite tombe juste sans réorientation. À défaut, on
    // accepte un autre bord (rendu natif, toujours à l'endroit — jamais tourné,
    // pour ne pas retourner les toits/coques). waterSide est conservé pour info.
    if (aff === "bank") {
      let bsize = req.size, bplaced = null, bside = null;
      const tryAt = (gx, gy, sz) =>
        footprintFits(gx, gy, sz, true, false, sz, false) ? footprintWaterSide(gx, gy, sz, sz) : null;
      const bslot = slotStore[req.slotKey];
      if (preferSavedSlot && bslot) {
        const sgx = cmClamp(cx + (Number(bslot.dx) || 0), 0, N - bsize);
        const sgy = cmClamp(cy + (Number(bslot.dy) || 0), 0, N - bsize);
        const ws = tryAt(sgx, sgy, bsize);
        if (ws) { bplaced = { gx: sgx, gy: sgy }; bside = ws; }
      }
      if (!bplaced) {
        // Passe 1 : fleuve au sud (orientation native parfaite). Passe 2 : tout bord.
        for (const wantSouth of [true, false]) {
          for (const sz of (bsize > 1 ? [bsize, 1] : [1])) {
            for (const cell of engineCandidates(req.meta.zone, aff, sz, req.meta.id, req.groupIndex - 1, req.groupTotal, Infinity)) {
              const ws = tryAt(cell.gx, cell.gy, sz);
              if (ws && (!wantSouth || ws === "S")) { bplaced = cell; bside = ws; bsize = sz; break; }
            }
            if (bplaced) break;
          }
          if (bplaced) break;
        }
      }
      if (!bplaced) return false;
      claimFootprint(bplaced.gx, bplaced.gy, bsize);
      for (let ax = 0; ax < bsize; ax += 1) for (let ay = 0; ay < bsize; ay += 1) {
        engineFootprint.add((bplaced.gx + ax) + "," + (bplaced.gy + ay));
        usedKeys.add((bplaced.gx + ax) + "," + (bplaced.gy + ay));
      }
      const bdx = bplaced.gx + bsize / 2 - cx, bdy = bplaced.gy + bsize / 2 - cy;
      tiles.push({ gx: bplaced.gx, gy: bplaced.gy, type: "engine", variant: req.meta.id, buildingId: req.meta.id,
        buildingName: req.meta.name, level: req.level, groupLevel: req.groupLevel,
        groupIndex: req.groupIndex, groupTotal: req.groupTotal, tier: req.tier, size: bsize, waterSide: bside,
        key: `engine:${req.meta.id}:${req.groupIndex - 1}:${req.slotKey}:${req.tier}`, d2: bdx * bdx + bdy * bdy });
      slotStore[req.slotKey] = { dx: bplaced.gx - cx, dy: bplaced.gy - cy, zone: req.meta.zone, id: req.meta.id };
      liveSlotKeys.add(req.slotKey);
      placedSlotKeys.add(req.slotKey);
      return true;
    }
    let size = req.size, placed = null;
    const { allowWater, allowBank } = cmWaterAllow(aff);
    const slot = slotStore[req.slotKey];
    if (preferSavedSlot && slot) {
      const saved = { gx: cmClamp(cx + (Number(slot.dx) || 0), 0, N - size), gy: cmClamp(cy + (Number(slot.dy) || 0), 0, N - size) };
      if (footprintFits(saved.gx, saved.gy, size, allowBank, false, size, allowWater)) {
        placed = saved;
      } else {
        // Re-tri local autour du slot sauvegardé (décoré : un score par cellule).
        const slotHash = cmHash(req.slotKey) >>> 0;
        const nearby = engineCandidates(req.meta.zone, aff, size, req.meta.id, req.groupIndex - 1, req.groupTotal)
          .map((cell) => ({ cell, s: Math.hypot(cell.gx - saved.gx, cell.gy - saved.gy) + ((((Math.imul(cell.gx | 0, 73856093) ^ Math.imul(cell.gy | 0, 19349663) ^ slotHash) >>> 0) % 100) / 500) }))
          .sort((a, b) => a.s - b.s)
          .map((e) => e.cell);
        for (const cell of nearby) if (footprintFits(cell.gx, cell.gy, size, allowBank, false, size, allowWater)) { placed = cell; break; }
      }
    }
    if (!placed) {
      const candidates = engineCandidates(req.meta.zone, aff, size, req.meta.id, req.groupIndex - 1, req.groupTotal);
      for (const cell of candidates) if (footprintFits(cell.gx, cell.gy, size, allowBank, false, size, allowWater)) { placed = cell; break; }
      // Si le top-K est saturé (toutes les bonnes cellules déjà prises),
      // on retombe sur la liste complète.
      if (!placed) {
        const all = engineCandidates(req.meta.zone, aff, size, req.meta.id, req.groupIndex - 1, req.groupTotal, Infinity);
        for (let ci = candidates.length; ci < all.length; ci += 1) {
          const cell = all[ci];
          if (footprintFits(cell.gx, cell.gy, size, allowBank, false, size, allowWater)) { placed = cell; break; }
        }
      }
      // Repli taille-1 pour les bâtiments affines à l'eau (rive souvent étroite).
      if (!placed && cmWaterAffine(aff) && size > 1) {
        size = 1;
        for (const cell of engineCandidates(req.meta.zone, aff, 1, req.meta.id, req.groupIndex - 1, req.groupTotal))
          if (footprintFits(cell.gx, cell.gy, 1, allowBank, false, 1, allowWater)) { placed = cell; break; }
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
    // Le foyer fondateur s'installe près du cœur urbain choisi par le plan.
    const fx = Math.round(plan.core.x), fy = Math.round(plan.core.y);
    const preferred = [
      { gx: fx + 3, gy: fy - 1 },
      { gx: fx + 2, gy: fy + 2 },
      { gx: fx - 2, gy: fy + 2 },
      { gx: fx + 2, gy: fy - 2 },
      { gx: fx - 2, gy: fy - 2 },
      { gx: fx + 3, gy: fy + 1 },
      { gx: fx - 3, gy: fy + 1 },
      { gx: fx + 1, gy: fy - 3 },
      { gx: fx - 1, gy: fy - 3 }
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

  const bias = personality.buildingBias || {};
  placer.placeCategory("public", biasedCount(Math.max(0, c.publics - (centralFirepitPlaced ? 1 : 0)), bias.public), usedKeys, pushTile);
  placer.placeCategory("library", biasedCount(c.libs, bias.library), usedKeys, pushTile);
  placer.placeCategory("house", biasedCount(c.houses, bias.house), usedKeys, pushTile);
  placer.placeCategory("farm", biasedCount(c.farms, bias.farm), usedKeys, pushTile);

  // ── Trim à la demande : émonde les routes qui ne bordent aucun bâtiment
  //    (approche de pont vers le vide, antennes mortes des secteurs sous-bâtis).
  //    N'enlève que des feuilles → ne coupe aucun axe traversant ni n'isole le
  //    réseau. Posé AVANT cmBuildRoadGraph : un pont devenu inutile perd son
  //    ancrage terrestre et sera écarté par sa validation.
  const demand = new Set(reserved); // merveilles + districts comptent comme demande
  const addFoot = (gx, gy, sx, sy) => {
    for (let ax = 0; ax < sx; ax += 1) for (let ay = 0; ay < sy; ay += 1) demand.add((gx + ax) + "," + (gy + ay));
  };
  for (const t of tiles) {
    if (t.type === "engine") addFoot(t.gx, t.gy, t.spanX || t.size || 1, t.spanY || t.size || 1);
    else demand.add(t.gx + "," + t.gy);
  }
  trimDemandlessRoads({ roads, roadKey, roadMeta, demand });

  let maxD2 = 1;
  for (const t of tiles) if (t.d2 > maxD2) maxD2 = t.d2;

  // Végétation : densité pilotée par l'âge (recul du front boisé) et la
  // personnalité (les ruines et cités agricoles laissent la nature revenir).
  const trees = [];
  const maxR  = Math.max(1, Math.hypot(cx, cy));
  const treeMul = ageCfg.treeDensity * (personality.treeMul || 1);
  for (const cell of cells) {
    if (usedKeys.has(cell.gx + "," + cell.gy)) continue;
    const norm = Math.sqrt(cell.d2) / maxR;
    const hsh  = cmHash(cell.gx + "x" + cell.gy + ":" + mapSeed) % 100;
    const prob = (20 + norm * 50 + (norm > 0.55 ? 22 : 0)) * treeMul;
    if (hsh < prob) trees.push({ gx: cell.gx, gy: cell.gy, r: 0.62 + (hsh % 30) / 80 });
  }

  const roadGraph = cmBuildRoadGraph(roads, roadKey, roadMeta, river, cx, cy);
  const engineTileMap = new Map(
    tiles.filter((t) => t.type === "engine" && t.buildingId)
         .map((t) => [t.gx + "," + t.gy, t])
  );
  return {
    gridN: N, cx, cy, tiles,
    roads: roadGraph.roads, roadSet: roadGraph.roadSet, roadMap: roadGraph.roadMap, roadMeta,
    districts, trees, maxD2, counts: c, river, water, engineTileMap, wonderSlots, walls,
    // Exposé au runtime (habitants, véhicules, tooltips, décor de places) :
    plan: { archetype: plan.archetype, core: plan.core, order: plan.order, chaos: plan.chaos, plazas: plan.plazas || [] },
    personality, ageCfg, mapSeed
  };
}

// ── Vestiges (pur, sans Canvas) ──────────────────────────────────────────────
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
  CM_INFRA_IDS,
  CM_KNOWLEDGE_IDS,
  CM_MAP_BUILDINGS,
  CM_ROLES,
  CM_TINTS,
  CM_WONDERS,
  ROAD_E,
  ROAD_N,
  ROAD_S,
  ROAD_W,
  roadWidthFor,
  WONDER_CLEAR_R,
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
  cmWonderActive,
  cmWonderActiveIds,
  WONDER_TIER_NAMES,
  computeCityLayout
};
