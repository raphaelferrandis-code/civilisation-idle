"use strict";

/* ============================================================================
 * state.js - Etat global + persistance: SAVE_KEY, defaultState, state, flags, caches, buildingById/upgradeById, load/save/invalidateRenderCache.
 * Ordre de chargement (index.html): U -> DB -> DU -> DW -> ST -> ME -> EV -> AC -> RE -> MA
 * Scope global partage (pas de modules) - ne pas envelopper dans une IIFE.
 * ============================================================================ */

const SAVE_KEY = "civilization-collapse-idle-v1";

const defaultState = () => ({
  population: 10,
  food: 35,
  gold: 0,
  knowledge: 0,
  infrastructure: 0,
  ruins: 0,
  legitimacy: 0,
  cycles: 0,
  dynastyCount: 0,
  activeMythId: null,
  mythsCompleted: {},
  mythActsAnnounced: {},
  chaosRuinsDouble: false,
  chaosRuinsBonus: 0,
  prometheeFailed: false,
  prometheePopReached: false,
  prometheeBraisiers: false,
  atlasHeritage: false,
  atlasLegitimite: 50,
  atlasCrisisCount: 0,
  sisypheMult: 1,
  sisypheHeritage: false,
  icareInfraReached: false,
  icareHeritage: false,
  surchauffeEndTime: 0,
  surchauffeCooldownEnd: 0,
  instability: 0,
  timeWear: 0,
  crisisActions: {
    rationing: 0,
    festivals: 0,
    census: 0,
    reforms: 0
  },
  crisisThresholds: {},
  crisisProduction: {
    global: 1,
    population: 1,
    food: 1,
    gold: 1,
    knowledge: 1,
    infrastructure: 1
  },
  collapsePreparation: 0,
  crisisExtensions: 0,
  crisisLimitAnnounced: false,
  crisisOpenedAt: null,
  recentCrisisIds: [],
  grandResetCount: 0,
  archaeologyUsed: false,
  lastCollapsedBuildings: {},
  vestiges: [],
  wonders: [],
  cityMapSlots: {},
  riverWP: null,
  buildings: Object.fromEntries(buildings.map((b) => [b.id, 0])),
  upgrades: {},
  cityName: "NomVille",
  history: ["An 0: une premiere communaute allume ses feux."],
  bestEraIndex: 0,
  cyclePeaks: {
    population: 10,
    knowledge: 0,
    infrastructure: 0,
    eraIndex: 0
  },
  cycleStartedAt: Date.now(),
  lastTick: Date.now(),
  dynastyDoctrine: null
});

let state = load();
let renderedCrowdCount = -1;
let renderedMapStage = -1;
let renderedDynastyStyle = -1;
let renderedLogSignature = "";
let renderedArchiveSignature = "";
let renderedCityCounters = {};
let renderedVillagerMessage = "";
let buyAmount = 1;
let recentBuildingMilestones = {};
let cachedRuinEffectsSignature = "";
let cachedRuinEffects = null;
let renderCache = {
  buildings: {},
  upgrades: {},
  dogmas: "",
  // Cache des coûts batch par bâtiment (clé = buildingId), valide tant que la signature ne change pas
  batchCosts: {}
};
let gamePaused = false;
let collapseInProgress = false;

// Cache inter-appels tick/render dans le même intervalle : évite de recalculer
// cityVitals(), pressureBreakdown() et globalMultiplier() plusieurs fois par frame.
let _frameVitals = null;
let _framePressure = null;
let _frameGlobalMult = null;

const buildingById = Object.fromEntries(buildings.map((building) => [building.id, building]));
const upgradeById = Object.fromEntries(upgrades.map((upgrade) => [upgrade.id, upgrade]));

function normalizeCityMapSlots(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out = {};
  for (const [key, slot] of Object.entries(raw).slice(0, 500)) {
    if (!/^\d+:[a-z_]+:\d+$/.test(key) || !slot || typeof slot !== "object") continue;
    const dx = Number(slot.dx);
    const dy = Number(slot.dy);
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) continue;
    out[key] = {
      dx,
      dy,
      zone: typeof slot.zone === "string" ? slot.zone : "",
      id: typeof slot.id === "string" ? slot.id : ""
    };
  }
  return out;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function finiteNumber(value, fallback, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function finiteInteger(value, fallback, min = 0, max = Number.MAX_SAFE_INTEGER) {
  return Math.floor(finiteNumber(value, fallback, min, max));
}

function finiteTimestamp(value, fallback) {
  const now = Date.now();
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, now);
}

function normalizeStringArray(raw, limit = 32, maxLength = 80) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((value) => typeof value === "string")
    .map((value) => value.slice(0, maxLength))
    .slice(-limit);
}

function normalizeHistory(raw, fallback) {
  if (!Array.isArray(raw)) return fallback;
  const history = raw
    .filter((value) => typeof value === "string" && value.trim())
    .map((value) => value.slice(0, 500))
    .slice(0, 48);
  return history.length ? history : fallback;
}

function normalizeMythsCompleted(raw) {
  if (!isPlainObject(raw)) return {};
  const out = {};
  for (const [id, val] of Object.entries(raw)) {
    if (typeof id === "string" && id.length <= 64 && val) out[id] = true;
  }
  return out;
}

function normalizeMythActsAnnounced(raw) {
  if (!isPlainObject(raw)) return {};
  const out = {};
  for (const key of ["act2", "act3", "ragnarok"]) {
    if (raw[key]) out[key] = true;
  }
  return out;
}

function normalizeBooleanMap(raw, allowedIds) {
  if (!isPlainObject(raw)) return {};
  const out = {};
  for (const id of allowedIds) {
    if (raw[id]) out[id] = true;
  }
  return out;
}

function normalizeNumberMap(raw, allowedIds, fallback = {}, integer = true) {
  const source = isPlainObject(raw) ? raw : {};
  const out = {};
  for (const id of allowedIds) {
    const fallbackValue = fallback[id] || 0;
    out[id] = integer
      ? finiteInteger(source[id], fallbackValue)
      : finiteNumber(source[id], fallbackValue);
  }
  return out;
}

function normalizeCrisisActions(raw, fallback) {
  const source = isPlainObject(raw) ? raw : {};
  const out = {};
  for (const key of Object.keys(fallback)) {
    out[key] = finiteInteger(source[key], fallback[key], 0, 999);
  }
  return out;
}

function normalizeCrisisThresholds(raw) {
  if (!isPlainObject(raw)) return {};
  const allowed = new Set(CRISIS_EVENTS.map((event) => event.id));
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    if (allowed.has(key) && value) out[key] = true;
  }
  return out;
}

function normalizeCrisisProduction(raw, fallback) {
  const source = isPlainObject(raw) ? raw : {};
  const out = {};
  for (const key of Object.keys(fallback)) {
    out[key] = finiteNumber(source[key], fallback[key], 0.1, 100);
  }
  return out;
}

function normalizeCyclePeaks(raw, fallback) {
  const source = isPlainObject(raw) ? raw : {};
  return {
    population: finiteNumber(source.population, fallback.population),
    knowledge: finiteNumber(source.knowledge, fallback.knowledge),
    infrastructure: finiteNumber(source.infrastructure, fallback.infrastructure),
    eraIndex: finiteInteger(source.eraIndex, fallback.eraIndex, 0, Math.max(0, eras.length - 1))
  };
}

function normalizeVestiges(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(-3).map((vestige) => {
    if (!isPlainObject(vestige)) return null;
    const ruins = Array.isArray(vestige.ruins)
      ? vestige.ruins
        .filter((cell) => isPlainObject(cell) && Number.isFinite(Number(cell.x)) && Number.isFinite(Number(cell.y)))
        .slice(0, 2500)
        .map((cell) => ({ x: Number(cell.x), y: Number(cell.y) }))
      : [];
    return {
      gridN: finiteInteger(vestige.gridN, 20, 1, 500),
      ruins
    };
  }).filter(Boolean);
}

function normalizeRiverWaypoints(raw) {
  if (!Array.isArray(raw) || raw.length !== 6) return null;
  const points = raw.map((point) => {
    if (!isPlainObject(point)) return null;
    const dy = Number(point.dy);
    return Number.isFinite(dy) ? { dy: Math.max(-500, Math.min(500, dy)) } : null;
  });
  return points.every(Boolean) ? points : null;
}

function hydrateState(parsed = {}) {
  const base = defaultState();
  const source = isPlainObject(parsed) ? parsed : {};
  const buildingIds = buildings.map((building) => building.id);
  const upgradeIds = upgrades.map((upgrade) => upgrade.id);
  const doctrineIds = new Set(DOCTRINES.map((doctrine) => doctrine.id));
  const stateOut = {
    ...base,
    population: finiteNumber(source.population, base.population),
    food: finiteNumber(source.food, base.food),
    gold: finiteNumber(source.gold, base.gold),
    knowledge: finiteNumber(source.knowledge, base.knowledge),
    infrastructure: finiteNumber(source.infrastructure, base.infrastructure),
    ruins: finiteNumber(source.ruins, base.ruins),
    legitimacy: finiteNumber(source.legitimacy, base.legitimacy),
    cycles: finiteInteger(source.cycles, base.cycles),
    dynastyCount: finiteInteger(source.dynastyCount, base.dynastyCount),
    activeMythId: typeof source.activeMythId === "string" && source.activeMythId ? source.activeMythId : null,
    mythsCompleted: normalizeMythsCompleted(source.mythsCompleted),
    mythActsAnnounced: normalizeMythActsAnnounced(source.mythActsAnnounced),
    chaosRuinsDouble: Boolean(source.chaosRuinsDouble),
    chaosRuinsBonus: finiteNumber(source.chaosRuinsBonus, 0, 0),
    prometheeFailed: Boolean(source.prometheeFailed),
    prometheePopReached: Boolean(source.prometheePopReached),
    prometheeBraisiers: Boolean(source.prometheeBraisiers),
    atlasHeritage: Boolean(source.atlasHeritage),
    atlasLegitimite: finiteNumber(source.atlasLegitimite, 50, 0, 100),
    atlasCrisisCount: finiteInteger(source.atlasCrisisCount, 0),
    sisypheMult: finiteNumber(source.sisypheMult, 1, 1),
    sisypheHeritage: Boolean(source.sisypheHeritage),
    icareInfraReached: Boolean(source.icareInfraReached),
    icareHeritage: Boolean(source.icareHeritage),
    surchauffeEndTime: finiteNumber(source.surchauffeEndTime || 0, 0, 0),
    surchauffeCooldownEnd: finiteNumber(source.surchauffeCooldownEnd || 0, 0, 0),
    instability: clamp01(finiteNumber(source.instability, base.instability)),
    timeWear: clamp01(finiteNumber(source.timeWear, base.timeWear)),
    crisisActions: normalizeCrisisActions(source.crisisActions, base.crisisActions),
    crisisThresholds: normalizeCrisisThresholds(source.crisisThresholds),
    crisisProduction: normalizeCrisisProduction(source.crisisProduction, base.crisisProduction),
    collapsePreparation: finiteNumber(source.collapsePreparation, base.collapsePreparation, 0, 2.4),
    crisisExtensions: finiteInteger(source.crisisExtensions, base.crisisExtensions, 0, 7),
    crisisLimitAnnounced: Boolean(source.crisisLimitAnnounced),
    crisisOpenedAt: source.crisisOpenedAt ? finiteTimestamp(source.crisisOpenedAt, null) : null,
    recentCrisisIds: normalizeStringArray(source.recentCrisisIds, 8, 80),
    grandResetCount: finiteInteger(source.grandResetCount, base.grandResetCount),
    archaeologyUsed: Boolean(source.archaeologyUsed),
    lastCollapsedBuildings: normalizeNumberMap(source.lastCollapsedBuildings, buildingIds, {}, true),
    vestiges: normalizeVestiges(source.vestiges),
    wonders: normalizeStringArray(source.wonders, 64, 80),
    cityMapSlots: normalizeCityMapSlots(source.cityMapSlots),
    riverWP: normalizeRiverWaypoints(source.riverWP),
    buildings: normalizeNumberMap(source.buildings, buildingIds, base.buildings, true),
    upgrades: normalizeBooleanMap(source.upgrades, upgradeIds),
    cityName: typeof source.cityName === "string" && source.cityName.trim()
      ? source.cityName.trim().slice(0, 42)
      : base.cityName,
    history: normalizeHistory(source.history, base.history),
    bestEraIndex: finiteInteger(source.bestEraIndex, base.bestEraIndex, 0, Math.max(0, eras.length - 1)),
    cyclePeaks: normalizeCyclePeaks(source.cyclePeaks, base.cyclePeaks),
    cycleStartedAt: finiteTimestamp(source.cycleStartedAt, base.cycleStartedAt),
    lastTick: finiteTimestamp(source.lastTick, base.lastTick),
    dynastyDoctrine: doctrineIds.has(source.dynastyDoctrine) ? source.dynastyDoctrine : null
  };
  if (!stateOut.crisisLimitAnnounced) stateOut.crisisOpenedAt = null;
  return stateOut;
}

function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return defaultState();
    return hydrateState(JSON.parse(raw));
  } catch {
    return defaultState();
  }
}

function save() {
  try {
    state.lastTick = Date.now();
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch (e) {
    // QuotaExceededError (stockage plein ou navigation privee iOS Safari)
    // La progression continue en memoire — pas de crash silencieux.
    console.warn("Sauvegarde impossible:", e?.message || e);
  }
}

function invalidateRenderCache(scope = "all") {
  if (scope === "all" || scope === "buildings") {
    renderCache.buildings = {};
    renderCache.batchCosts = {}; // Le coût change si les upgrades ou counts changent
  }
  if (scope === "all" || scope === "upgrades") renderCache.upgrades = {};
  if (scope === "all" || scope === "dogmas") renderCache.dogmas = "";
}
