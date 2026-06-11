"use strict";

import { buildings } from '../data/buildings.js';
import { upgrades } from '../data/upgrades.js';
import { eras, DOCTRINES, CRISIS_EVENTS } from '../data/world.js';
import { clamp01 } from './utils.js';
import { Decimal, D } from './num.js';
import { COLLAPSE_PREP_MAX } from './balance.js';
import { normalizeOlympusState, defaultOlympusState } from '../data/olympus.js';

export const SAVE_KEY = "civilization-collapse-idle-v1";

// Version du SCHÉMA de sauvegarde, stockée DANS le payload (state.saveVersion) —
// surtout pas dans SAVE_KEY. Bumper SAVE_KEY effacerait tous les saves ; bumper
// CURRENT_SAVE_VERSION + ajouter une migration les fait évoluer sans perte.
// v2 : les champs sans plafond (ressources, ruines, pics…) sont sérialisés en
// strings Decimal ("1.5e+30") au lieu de numbers (migration Phase 3).
export const CURRENT_SAVE_VERSION = 2;

// Champs de premier niveau migrés en Decimal (sérialisés en string dans le save).
export const DECIMAL_SAVE_FIELDS = [
  "population", "food", "gold", "knowledge", "infrastructure", "ruins",
  "chaosRuinsBonus", "phoenixTotalRuins", "orPopPeak", "hephPopPeak"
];

export const defaultAutoScriptRules = () => [
  { id: "rule_rupture", type: "rupture", label: "Effondrer si Rupture atteint", unit: "%", threshold: 80, enabled: false },
  { id: "rule_usure", type: "usure", label: "Effondrer si Usure atteint", unit: "%", threshold: 80, enabled: false },
  { id: "rule_time", type: "time", label: "Effondrer apres", unit: "min", threshold: 5, enabled: false }
];

export const defaultAutomateRules = () => [
  { id: "auto_buy_city", type: "buy_cheapest", category: "city", label: "Acheter bati. (Cite) si abordable", enabled: false },
  { id: "auto_buy_infra", type: "buy_cheapest", category: "infra", label: "Acheter bati. (Infra) si abordable", enabled: false },
  { id: "auto_rationing", type: "crisis_action", actionId: "rationing", label: "Rationnement si Rupture >=", unit: "%", threshold: 60, enabled: false }
];

// Rendre disponible le système d'abonnement en prévision de la Phase 3
const listeners = new Set();
export const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
export const notify = () => {
  listeners.forEach(l => l());
};

export let activeView = "city";
export function openView(viewId) {
  activeView = viewId;
  state.activeView = viewId;
  notify();
}

export function render() {
  notify();
}


export const defaultState = () => ({
  saveVersion: CURRENT_SAVE_VERSION,
  population: new Decimal(10),
  food: new Decimal(35),
  gold: new Decimal(0),
  knowledge: new Decimal(0),
  infrastructure: new Decimal(0),
  ruins: new Decimal(0),
  legitimacy: 0,
  cycles: 0,
  dynastyCount: 0,
  activeMythId: null,
  mythsCompleted: {},
  mythActsAnnounced: {},
  chaosRuinsDouble: false,
  chaosRuinsBonus: new Decimal(0),
  prometheeFailed: false,
  prometheePopReached: false,
  prometheeBraisiers: false,
  atlasHeritage: false,
  atlasLegitimite: 50,
  atlasCrisisCount: 0,
  sisypheMult: 1,
  sisypheHeritage: false,
  babelHeritage: false,
  babelCategory: null,
  babelProdReached: false,
  orHeritage: false,
  orPopPeak: new Decimal(0),
  orGoldReached: false,
  orUsureImbalance: false,
  phoenixHeritage: false,
  phoenixCycleCount: 0,
  phoenixTotalRuins: new Decimal(0),
  phoenixNextForceAt: null,
  hephHeritage: false,
  hephPopPeak: new Decimal(0),
  hephGoalReached: false,
  autoScriptRules: null,
  automateRules: null,
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
  // Préparations terminales : malus de production (%) actifs jusqu'à l'effondrement,
  // bonus associés, et actions déjà utilisées pendant la crise en cours.
  terminalPreparations: {
    foodMalus: 0,
    goldMalus: 0,
    knowledgeMalus: 0,
    infraBonus: 0,
    ruptureSlow: 0,
    used: {}
  },
  crisisExtensions: 0,
  crisisLimitAnnounced: false,
  crisisOpenedAt: null,
  recentCrisisIds: [],
  grandResetCount: 0,
  archaeologyUsed: false,
  lastCollapsedBuildings: {},
  vestiges: [],
  wonders: [],
  // Palier d'évolution de chaque merveille (1..5), clé = id de merveille.
  wonderTiers: {},
  cityMapSlots: {},
  riverWP: null,
  // Seed de génération procédurale de la ville (nouvelle à chaque cycle).
  mapSeed: null,
  // Rayon de l'enceinte, figé au moment de sa construction (null = pas bâtie).
  wallRadius: null,
  // Compteurs "à vie" pour les jalons de merveilles (survivent aux cycles).
  lifetimePurchases: 0,
  playTimeSec: 0,
  buildings: Object.fromEntries(buildings.map((b) => [b.id, 0])),
  upgrades: {},
  cityName: "NomVille",
  history: ["An 0: une premiere communaute allume ses feux."],
  bestEraIndex: 0,
  cyclePeaks: {
    population: new Decimal(10),
    knowledge: new Decimal(0),
    infrastructure: new Decimal(0),
    eraIndex: 0
  },
  cycleStartedAt: Date.now(),
  lastTick: Date.now(),
  dynastyDoctrine: null,
  buyAmount: 1,
  activeView: "city",
  notifEnabled: true,
  mourning: false,
  atridesDebt: 0,
  atridesDrainDisabled: false,
  atridesDebtGrowthMultiplier: 1,
  atridesRenegotiateActiveUntil: 0,
  atridesRenegotiateCooldownEnd: 0,
  atridesHeritage: false,
  atridesPactActive: false,
  atridesNextRunPenaltyActive: false,
  eneeHeritage: false,
  eneeCollapseCount: 0,
  eneeMigrations: 0,
  eneeDegraded: false,
  eneeTerritoryStartedAt: null,
  cadmosHeritage: false,
  cadmosChronicle: [],
  cadmosLastRunChronicle: [],
  cadmosPermanentEpitaphs: [],
  cadmosCycleBonuses: { food: 0, gold: 0, stability: 0 },
  cadmosTriggeredMilestones: {},
  cadmosPromptPending: false,
  cadmosLastChosenOrientation: null,
  cadmosRecentWords: [],
  anteeHeritage: false,
  activeRuinIds: [],
  pendingActiveRuinsChoice: false,
  ragnarokHeritage: false,
  ragnarokEffectsApplied: false,
  finalChronicleTitle: null,
  ragnarokActiveConstraints: [],
  chronicleEntries: [],
  chronicleCooldown: 0,
  olympus: defaultOlympusState()
});

export let state = load();
export let renderedCrowdCount = -1;
export let renderedMapStage = -1;
export let renderedDynastyStyle = -1;
export let renderedLogSignature = "";
export let renderedArchiveSignature = "";
export let renderedCityCounters = {};
export let renderedVillagerMessage = "";
export let buyAmount = 1;
export let recentBuildingMilestones = {};
export let renderCache = {
  buildings: {},
  upgrades: {},
  dogmas: "",
  batchCosts: {},
  cachedRuinEffectsSignature: "",
  cachedRuinEffects: null,
  _frameVitals: null,
  _framePressure: null,
  _frameGlobalMult: null,
  _frameGlobalMultDec: null,
  _frameRates: null,
  _buildingSums: null,
  _buildingsVersion: 0,
  _upgradesVersion: 0
};
export let gamePaused = false;
export let collapseInProgress = false;

export const buildingById = Object.fromEntries(buildings.map((building) => [building.id, building]));
export const upgradeById = Object.fromEntries(upgrades.map((upgrade) => [upgrade.id, upgrade]));

export function normalizeWonderTiers(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out = {};
  for (const [key, tier] of Object.entries(raw).slice(0, 32)) {
    const t = Number(tier);
    if (typeof key !== "string" || !Number.isFinite(t)) continue;
    out[key.slice(0, 40)] = Math.max(1, Math.min(5, Math.floor(t)));
  }
  return out;
}

export function normalizeCityMapSlots(raw) {
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

export function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

// Équivalent de finiteNumber pour les champs migrés en Decimal : accepte un
// Decimal, un number ou une string sérialisée ("1.5e+30"), borne à >= 0, et
// surtout NE clampe PAS à 2^53 (c'était le plafond caché du chargement).
export function decimalField(value, fallback) {
  const candidate =
    value instanceof Decimal ? value
      : typeof value === "number" && Number.isFinite(value) ? new Decimal(value)
      : typeof value === "string" && value ? new Decimal(value)
      : null;
  if (!candidate || !Number.isFinite(candidate.mantissa) || !Number.isFinite(candidate.exponent)) {
    return D(fallback);
  }
  return candidate.lt(0) ? new Decimal(0) : candidate;
}

export function finiteNumber(value, fallback, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

export function finiteInteger(value, fallback, min = 0, max = Number.MAX_SAFE_INTEGER) {
  return Math.floor(finiteNumber(value, fallback, min, max));
}

export function finiteTimestamp(value, fallback) {
  const now = Date.now();
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, now);
}

export function normalizeStringArray(raw, limit = 32, maxLength = 80) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((value) => typeof value === "string")
    .map((value) => value.slice(0, maxLength))
    .slice(-limit);
}

export function normalizeHistory(raw, fallback) {
  if (!Array.isArray(raw)) return fallback;
  const history = raw
    .filter((value) => typeof value === "string" && value.trim())
    .map((value) => value.slice(0, 500))
    .slice(0, 48);
  return history.length ? history : fallback;
}

export function normalizeMythsCompleted(raw) {
  if (!isPlainObject(raw)) return {};
  const out = {};
  for (const [id, val] of Object.entries(raw)) {
    if (typeof id === "string" && id.length <= 64 && val) out[id] = true;
  }
  return out;
}

export function normalizeMythActsAnnounced(raw) {
  if (!isPlainObject(raw)) return {};
  const out = {};
  for (const key of ["act2", "act3", "ragnarok"]) {
    if (raw[key]) out[key] = true;
  }
  return out;
}

export function normalizeBooleanMap(raw, allowedIds) {
  if (!isPlainObject(raw)) return {};
  const out = {};
  for (const id of allowedIds) {
    if (raw[id]) out[id] = true;
  }
  return out;
}

export function normalizeNumberMap(raw, allowedIds, fallback = {}, integer = true) {
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

export function normalizeCrisisActions(raw, fallback) {
  const source = isPlainObject(raw) ? raw : {};
  const out = {};
  for (const key of Object.keys(fallback)) {
    out[key] = finiteInteger(source[key], fallback[key], 0, 999);
  }
  return out;
}

export function normalizeCrisisThresholds(raw) {
  if (!isPlainObject(raw)) return {};
  const allowed = new Set(CRISIS_EVENTS.map((event) => event.id));
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    if (allowed.has(key) && value) out[key] = true;
  }
  return out;
}

export function normalizeCrisisProduction(raw, fallback) {
  const source = isPlainObject(raw) ? raw : {};
  const out = {};
  for (const key of Object.keys(fallback)) {
    out[key] = finiteNumber(source[key], fallback[key], 0.1, 100);
  }
  return out;
}

export function normalizeTerminalPreparations(raw, fallback) {
  const source = isPlainObject(raw) ? raw : {};
  const usedSource = isPlainObject(source.used) ? source.used : {};
  const used = {};
  for (const key of ["exodus", "prepareArchives", "holdOrder"]) {
    if (usedSource[key]) used[key] = true;
  }
  return {
    foodMalus: finiteNumber(source.foodMalus, fallback.foodMalus, 0, 0.85),
    goldMalus: finiteNumber(source.goldMalus, fallback.goldMalus, 0, 0.85),
    knowledgeMalus: finiteNumber(source.knowledgeMalus, fallback.knowledgeMalus, 0, 0.85),
    infraBonus: finiteNumber(source.infraBonus, fallback.infraBonus, 0, 1),
    ruptureSlow: finiteNumber(source.ruptureSlow, fallback.ruptureSlow, 0, 0.8),
    used
  };
}

export function normalizeRuleList(raw, defaults, thresholdMin = 1, thresholdMax = 9999) {
  if (!Array.isArray(raw)) return null;
  const byId = new Map(raw.filter(isPlainObject).map((rule) => [rule.id, rule]));
  return defaults.map((fallback) => {
    const source = byId.get(fallback.id) || {};
    const normalized = {
      ...fallback,
      enabled: Boolean(source.enabled)
    };
    if ("threshold" in fallback) {
      normalized.threshold = finiteNumber(source.threshold, fallback.threshold, thresholdMin, thresholdMax);
    }
    return normalized;
  });
}

export function normalizeCyclePeaks(raw, fallback) {
  const source = isPlainObject(raw) ? raw : {};
  return {
    population: decimalField(source.population, fallback.population),
    knowledge: decimalField(source.knowledge, fallback.knowledge),
    infrastructure: decimalField(source.infrastructure, fallback.infrastructure),
    eraIndex: finiteInteger(source.eraIndex, fallback.eraIndex, 0, Math.max(0, eras.length - 1))
  };
}

export function normalizeVestiges(raw) {
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

export function normalizeRiverWaypoints(raw) {
  if (!Array.isArray(raw) || raw.length !== 6) return null;
  const points = raw.map((point) => {
    if (!isPlainObject(point)) return null;
    const dy = Number(point.dy);
    return Number.isFinite(dy) ? { dy: Math.max(-500, Math.min(500, dy)) } : null;
  });
  return points.every(Boolean) ? points : null;
}

export function normalizeCadmosChronicle(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(isPlainObject)
    .map(entry => {
      const id = typeof entry.id === "string" ? entry.id : `cadmos_${Date.now()}_${Math.random()}`;
      const name = typeof entry.name === "string" ? entry.name.slice(0, 100) : "";
      const word = typeof entry.word === "string" ? entry.word.slice(0, 50) : "";
      const orientation = ["food", "gold", "stability"].includes(entry.orientation) ? entry.orientation : "food";
      const orientationLabel = typeof entry.orientationLabel === "string" ? entry.orientationLabel.slice(0, 50) : "";
      const milestoneType = typeof entry.milestoneType === "string" ? entry.milestoneType.slice(0, 50) : "";
      const threshold = finiteNumber(entry.threshold, 0, 0);
      const cycle = finiteInteger(entry.cycle, 0, 0);
      const chosenAt = finiteTimestamp(entry.chosenAt, Date.now());
      const engravedAt = entry.engravedAt ? finiteTimestamp(entry.engravedAt, Date.now()) : undefined;

      const out = {
        id,
        name,
        word,
        orientation,
        orientationLabel,
        milestoneType,
        threshold,
        cycle,
        chosenAt
      };
      if (engravedAt !== undefined) {
        out.engravedAt = engravedAt;
      }
      return out;
    })
    .filter(e => e.name);
}

export function normalizeCadmosCycleBonuses(raw, fallback) {
  const source = isPlainObject(raw) ? raw : {};
  return {
    food: finiteNumber(source.food, fallback.food, 0),
    gold: finiteNumber(source.gold, fallback.gold, 0),
    stability: finiteNumber(source.stability, fallback.stability, 0)
  };
}

export function normalizeCadmosTriggeredMilestones(raw) {
  if (!isPlainObject(raw)) return {};
  const out = {};
  for (const [key, val] of Object.entries(raw)) {
    if (typeof key === "string" && key.length <= 128 && val) {
      out[key] = true;
    }
  }
  return out;
}

export function normalizeChronicleEntries(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(isPlainObject)
    .map(entry => {
      return {
        id: typeof entry.id === "string" ? entry.id.slice(0, 128) : "",
        title: typeof entry.title === "string" ? entry.title.slice(0, 200) : "",
        text: typeof entry.text === "string" ? entry.text.slice(0, 4000) : "",
        author: typeof entry.author === "string" ? entry.author.slice(0, 100) : null,
        age: typeof entry.age === "string" ? entry.age.slice(0, 80) : "",
        date: typeof entry.date === "string" ? entry.date.slice(0, 80) : "",
        category: typeof entry.category === "string" ? entry.category.slice(0, 80) : "",
        isNew: typeof entry.isNew === "boolean" ? entry.isNew : false
      };
    })
    .filter(e => e.id)
    .slice(0, 250);
}

// Migrations séquentielles du schéma de sauvegarde.
// Clé = version DE DÉPART ; la fonction transforme (en place) un save de cette
// version vers la version+1. Pour passer à la v2, écris MIGRATIONS[1] = (s) => {...}
// (ex. renommer un champ, recalculer une valeur rééquilibrée…).
//
// La v0 désigne les anciens saves sans champ `saveVersion`. Le passage 0 -> 1
// ne nécessite AUCUNE transformation : les normalizers de hydrateState rendent
// déjà ces saves compatibles. On se contente donc d'estampiller la version.
const MIGRATIONS = {
  // 0: (s) => { /* aucune transformation : géré par les normalizers */ },
  // 1 -> 2 : les champs numériques sans plafond deviennent des strings Decimal.
  // decimalField() accepte les deux formes ; cette migration rend simplement le
  // format v2 canonique pour que tout save réécrit soit homogène.
  1: (s) => {
    for (const field of DECIMAL_SAVE_FIELDS) {
      if (typeof s[field] === "number" && Number.isFinite(s[field])) s[field] = String(s[field]);
    }
    if (isPlainObject(s.cyclePeaks)) {
      // migrate() ne copie que le premier niveau : on clone avant de muter.
      s.cyclePeaks = { ...s.cyclePeaks };
      for (const field of ["population", "knowledge", "infrastructure"]) {
        const value = s.cyclePeaks[field];
        if (typeof value === "number" && Number.isFinite(value)) s.cyclePeaks[field] = String(value);
      }
    }
  }
};

// Amène un objet de sauvegarde brut (fraîchement parsé) jusqu'à
// CURRENT_SAVE_VERSION en appliquant les migrations dans l'ordre.
// Travaille sur une copie superficielle pour ne pas muter l'entrée.
export function migrate(raw) {
  const save = isPlainObject(raw) ? { ...raw } : {};
  let version = Number.isInteger(save.saveVersion) ? save.saveVersion : 0;
  // Save plus récent que ce build (downgrade) : on ne tente rien d'autre que
  // de le ramener au schéma courant ; hydrateState ignorera les champs inconnus.
  while (version < CURRENT_SAVE_VERSION) {
    const step = MIGRATIONS[version];
    if (step) step(save);
    version += 1;
  }
  save.saveVersion = CURRENT_SAVE_VERSION;
  return save;
}

export function hydrateState(parsed = {}) {
  const base = defaultState();
  const source = migrate(isPlainObject(parsed) ? parsed : {});
  const buildingIds = buildings.map((building) => building.id);
  const upgradeIds = upgrades.map((upgrade) => upgrade.id);
  const doctrineIds = new Set(DOCTRINES.map((doctrine) => doctrine.id));
  const stateOut = {
    ...base,
    saveVersion: CURRENT_SAVE_VERSION,
    population: decimalField(source.population, base.population),
    food: decimalField(source.food, base.food),
    gold: decimalField(source.gold, base.gold),
    knowledge: decimalField(source.knowledge, base.knowledge),
    infrastructure: decimalField(source.infrastructure, base.infrastructure),
    ruins: decimalField(source.ruins, base.ruins),
    legitimacy: finiteNumber(source.legitimacy, base.legitimacy),
    cycles: finiteInteger(source.cycles, base.cycles),
    dynastyCount: finiteInteger(source.dynastyCount, base.dynastyCount),
    activeMythId: typeof source.activeMythId === "string" && source.activeMythId ? source.activeMythId : null,
    mythsCompleted: normalizeMythsCompleted(source.mythsCompleted),
    mythActsAnnounced: normalizeMythActsAnnounced(source.mythActsAnnounced),
    chaosRuinsDouble: Boolean(source.chaosRuinsDouble),
    chaosRuinsBonus: decimalField(source.chaosRuinsBonus, 0),
    prometheeFailed: Boolean(source.prometheeFailed),
    prometheePopReached: Boolean(source.prometheePopReached),
    prometheeBraisiers: Boolean(source.prometheeBraisiers),
    atlasHeritage: Boolean(source.atlasHeritage),
    atlasLegitimite: finiteNumber(source.atlasLegitimite, 50, 0, 100),
    atlasCrisisCount: finiteInteger(source.atlasCrisisCount, 0),
    sisypheMult: finiteNumber(source.sisypheMult, 1, 1),
    sisypheHeritage: Boolean(source.sisypheHeritage),
    babelHeritage: Boolean(source.babelHeritage),
    babelCategory: ["city", "knowledge", "infra"].includes(source.babelCategory) ? source.babelCategory : null,
    babelProdReached: Boolean(source.babelProdReached),
    orHeritage: Boolean(source.orHeritage),
    orPopPeak: decimalField(source.orPopPeak, 0),
    orGoldReached: Boolean(source.orGoldReached),
    orUsureImbalance: Boolean(source.orUsureImbalance),
    phoenixHeritage: Boolean(source.phoenixHeritage),
    phoenixCycleCount: finiteInteger(source.phoenixCycleCount, 0),
    phoenixTotalRuins: decimalField(source.phoenixTotalRuins, 0),
    phoenixNextForceAt: source.phoenixNextForceAt ? finiteNumber(source.phoenixNextForceAt, 0, 0) : null,
    hephHeritage: Boolean(source.hephHeritage),
    hephPopPeak: decimalField(source.hephPopPeak, 0),
    hephGoalReached: Boolean(source.hephGoalReached),
    autoScriptRules: normalizeRuleList(source.autoScriptRules, defaultAutoScriptRules(), 1, 9999),
    automateRules: normalizeRuleList(source.automateRules, defaultAutomateRules(), 1, 99),
    icareInfraReached: Boolean(source.icareInfraReached),
    icareHeritage: Boolean(source.icareHeritage),
    surchauffeEndTime: finiteNumber(source.surchauffeEndTime || 0, 0, 0),
    surchauffeCooldownEnd: finiteNumber(source.surchauffeCooldownEnd || 0, 0, 0),
    atridesDebt: finiteNumber(source.atridesDebt, base.atridesDebt, 0),
    atridesDrainDisabled: Boolean(source.atridesDrainDisabled),
    atridesDebtGrowthMultiplier: finiteNumber(source.atridesDebtGrowthMultiplier, base.atridesDebtGrowthMultiplier, 0),
    atridesRenegotiateActiveUntil: finiteTimestamp(source.atridesRenegotiateActiveUntil, base.atridesRenegotiateActiveUntil),
    atridesRenegotiateCooldownEnd: finiteTimestamp(source.atridesRenegotiateCooldownEnd, base.atridesRenegotiateCooldownEnd),
    atridesHeritage: Boolean(source.atridesHeritage),
    atridesPactActive: Boolean(source.atridesPactActive),
    atridesNextRunPenaltyActive: Boolean(source.atridesNextRunPenaltyActive),
    eneeHeritage: Boolean(source.eneeHeritage),
    eneeCollapseCount: finiteInteger(source.eneeCollapseCount, base.eneeCollapseCount, 0),
    eneeMigrations: finiteInteger(source.eneeMigrations, base.eneeMigrations, 0),
    eneeDegraded: Boolean(source.eneeDegraded),
    eneeTerritoryStartedAt: source.eneeTerritoryStartedAt ? finiteTimestamp(source.eneeTerritoryStartedAt, base.eneeTerritoryStartedAt) : null,
    cadmosHeritage: Boolean(source.cadmosHeritage),
    cadmosChronicle: normalizeCadmosChronicle(source.cadmosChronicle),
    cadmosLastRunChronicle: normalizeCadmosChronicle(source.cadmosLastRunChronicle),
    cadmosPermanentEpitaphs: normalizeCadmosChronicle(source.cadmosPermanentEpitaphs),
    cadmosCycleBonuses: normalizeCadmosCycleBonuses(source.cadmosCycleBonuses, base.cadmosCycleBonuses),
    cadmosTriggeredMilestones: normalizeCadmosTriggeredMilestones(source.cadmosTriggeredMilestones),
    cadmosPromptPending: Boolean(source.cadmosPromptPending),
    cadmosLastChosenOrientation: ["food", "gold", "stability"].includes(source.cadmosLastChosenOrientation) ? source.cadmosLastChosenOrientation : null,
    cadmosRecentWords: normalizeStringArray(source.cadmosRecentWords, 16, 50),
    anteeHeritage: Boolean(source.anteeHeritage),
    activeRuinIds: normalizeStringArray(source.activeRuinIds, 32, 80),
    pendingActiveRuinsChoice: Boolean(source.pendingActiveRuinsChoice),
    ragnarokHeritage: Boolean(source.ragnarokHeritage),
    ragnarokEffectsApplied: Boolean(source.ragnarokEffectsApplied),
    finalChronicleTitle: typeof source.finalChronicleTitle === "string" ? source.finalChronicleTitle.slice(0, 100) : base.finalChronicleTitle,
    ragnarokActiveConstraints: normalizeStringArray(source.ragnarokActiveConstraints, 32, 200),
    olympus: normalizeOlympusState(source.olympus),
    mourning: Boolean(source.mourning),
    instability: clamp01(finiteNumber(source.instability, base.instability)),
    timeWear: clamp01(finiteNumber(source.timeWear, base.timeWear)),
    crisisActions: normalizeCrisisActions(source.crisisActions, base.crisisActions),
    crisisThresholds: normalizeCrisisThresholds(source.crisisThresholds),
    crisisProduction: normalizeCrisisProduction(source.crisisProduction, base.crisisProduction),
    collapsePreparation: finiteNumber(source.collapsePreparation, base.collapsePreparation, 0, COLLAPSE_PREP_MAX),
    terminalPreparations: normalizeTerminalPreparations(source.terminalPreparations, base.terminalPreparations),
    crisisExtensions: finiteInteger(source.crisisExtensions, base.crisisExtensions, 0, 99),
    crisisLimitAnnounced: Boolean(source.crisisLimitAnnounced),
    crisisOpenedAt: source.crisisOpenedAt ? finiteTimestamp(source.crisisOpenedAt, null) : null,
    recentCrisisIds: normalizeStringArray(source.recentCrisisIds, 8, 80),
    grandResetCount: finiteInteger(source.grandResetCount, base.grandResetCount),
    archaeologyUsed: Boolean(source.archaeologyUsed),
    lastCollapsedBuildings: normalizeNumberMap(source.lastCollapsedBuildings, buildingIds, {}, true),
    vestiges: normalizeVestiges(source.vestiges),
    wonders: normalizeStringArray(source.wonders, 64, 80),
    wonderTiers: normalizeWonderTiers(source.wonderTiers),
    cityMapSlots: normalizeCityMapSlots(source.cityMapSlots),
    riverWP: normalizeRiverWaypoints(source.riverWP),
    mapSeed: Number.isFinite(source.mapSeed) && source.mapSeed > 0 ? Math.floor(source.mapSeed) >>> 0 : null,
    wallRadius: Number.isFinite(source.wallRadius) && source.wallRadius > 0 ? Math.min(150, source.wallRadius) : null,
    lifetimePurchases: finiteInteger(source.lifetimePurchases, 0, 0),
    playTimeSec: finiteNumber(source.playTimeSec, 0, 0),
    buildings: normalizeNumberMap(source.buildings, buildingIds, base.buildings, true),
    upgrades: normalizeBooleanMap(source.upgrades, upgradeIds),
    chronicleEntries: normalizeChronicleEntries(source.chronicleEntries),
    chronicleCooldown: finiteNumber(source.chronicleCooldown, 0, 0),
    cityName: typeof source.cityName === "string" && source.cityName.trim()
      ? source.cityName.trim().slice(0, 42)
      : base.cityName,
    history: normalizeHistory(source.history, base.history),
    bestEraIndex: finiteInteger(source.bestEraIndex, base.bestEraIndex, 0, Math.max(0, eras.length - 1)),
    cyclePeaks: normalizeCyclePeaks(source.cyclePeaks, base.cyclePeaks),
    cycleStartedAt: finiteTimestamp(source.cycleStartedAt, base.cycleStartedAt),
    lastTick: finiteTimestamp(source.lastTick, base.lastTick),
    dynastyDoctrine: doctrineIds.has(source.dynastyDoctrine) ? source.dynastyDoctrine : null,
    buyAmount: source.buyAmount === "max" ? "max" : finiteInteger(source.buyAmount, 1, 1, 500),
    activeView: source.activeView || "city"
  };
  if (!stateOut.crisisLimitAnnounced) stateOut.crisisOpenedAt = null;
  return stateOut;
}

export function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return defaultState();
    return hydrateState(JSON.parse(raw));
  } catch {
    return defaultState();
  }
}

export function save() {
  try {
    state.lastTick = Date.now();
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch (e) {
    // QuotaExceededError (stockage plein ou navigation privee iOS Safari)
    // La progression continue en memoire — pas de crash silencieux.
    console.warn("Sauvegarde impossible:", e?.message || e);
  }
}

export function invalidateRenderCache(scope = "all") {
  if (scope === "all") {
    renderCache._frameVitals = null;
    renderCache._framePressure = null;
    renderCache._frameGlobalMult = null;
    renderCache._frameGlobalMultDec = null;
    renderCache._frameRates = null;
    renderCache._buildingSums = null;
    renderCache.cachedRuinEffects = null;
    renderCache.cachedRuinEffectsSignature = "";
  }
  if (scope === "all" || scope === "buildings") {
    renderCache.buildings = {};
    renderCache.batchCosts = {};
    renderCache._buildingSums = null;
    renderCache._buildingsVersion++;
    renderCache._frameRates = null;
  }
  if (scope === "all" || scope === "upgrades") {
    renderCache.upgrades = {};
    renderCache._upgradesVersion++;
    renderCache._frameRates = null;
  }
  if (scope === "all" || scope === "dogmas") renderCache.dogmas = "";
}

// Helpers setters pour permettre de reassigner buyAmount ou d'autres variables exportees depuis main.js
export function setBuyAmount(val) {
  buyAmount = val;
  state.buyAmount = val;
  notify();
}
export function setGamePaused(val) {
  gamePaused = val;
  notify();
}
export function setCollapseInProgress(val) {
  collapseInProgress = val;
  notify();
}
export function setCityName(name) {
  state.cityName = name.trim() || "NomVille";
  notify();
}
export function setMourning(val) {
  state.mourning = Boolean(val);
  notify();
}
export function setState(newState) {
  for (const key of Object.keys(state)) {
    delete state[key];
  }
  Object.assign(state, newState);
  notify();
}

export function resetTemporaryRunState(s) {
  s.instability = 0;
  s.timeWear = 0;
  s.activeRuinIds = [];
  s.pendingActiveRuinsChoice = false;
  s.crisisActions = {
    rationing: 0,
    census: 0,
    festivals: 0,
    reforms: 0,
    ancestorCrisis: 0,
    archiveCrisis: 0
  };
  s.crisisThresholds = {};
  s.crisisProduction = {
    population: 1,
    food: 1,
    gold: 1,
    knowledge: 1,
    infrastructure: 1
  };
  s.collapsePreparation = 0;
  s.terminalPreparations = {
    foodMalus: 0,
    goldMalus: 0,
    knowledgeMalus: 0,
    infraBonus: 0,
    ruptureSlow: 0,
    used: {}
  };
  s.crisisExtensions = 0;
  s.crisisLimitAnnounced = false;
  s.crisisOpenedAt = null;
  s.archaeologyUsed = false;
  s.cityMapSlots = {};
  
  if (s.atlasHeritage) s.atlasLegitimite = 50;
  s.atlasCrisisCount = 0;
  s.babelProdReached = false;
  s.babelCategory    = null;
  s.orPopPeak        = D(s.population || 0);
  s.orGoldReached    = false;
  s.orUsureImbalance = false;
  s.hephPopPeak      = D(s.population || 0);
  s.hephGoalReached  = false;
  
  s.icareInfraReached   = false;
  s.prometheePopReached = false;
  s.prometheeFailed     = false;
  s.prometheeBraisiers  = false;

  s.eneeMigrations         = 0;
  s.eneeDegraded           = false;
  
  s.cadmosChronicle = [];
  s.cadmosCycleBonuses = { food: 0, gold: 0, stability: 0 };
  s.cadmosTriggeredMilestones = {};
  s.cadmosPromptPending = false;
  s.cadmosLastChosenOrientation = null;
  s.cadmosRecentWords = [];
  
  s.atridesDebt = 0;
  s.atridesDrainDisabled = false;
  s.atridesDebtGrowthMultiplier = 1;
  s.atridesRenegotiateActiveUntil = 0;
  s.atridesRenegotiateCooldownEnd = 0;
  s.atridesPactActive = false;
  s.chronicleEntries = [];
  s.chronicleCooldown = 0;
}

export function markChronicleEntryRead(id) {
  state.chronicleEntries = (state.chronicleEntries || []).map(entry =>
    entry.id === id ? { ...entry, isNew: false } : entry
  );
  save();
  notify();
}
