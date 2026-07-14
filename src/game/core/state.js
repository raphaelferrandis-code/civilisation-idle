"use strict";

import { buildings } from '../data/buildings.js';
import { upgrades, dogmaIds } from '../data/upgrades.js';
import { eras, CRISIS_EVENTS } from '../data/world.js';
import { eraBandOf } from '../data/eraThemes.js';
import { clamp01 } from './utils.js';
import { Decimal, D } from './num.js';
import { COLLAPSE_PREP_MAX, POLICY_MAX_ACTIVE, REGUL_LEDGER_MAX, GAMBLE_HISTORY_LEN, STEWARD_MAX_CLAUSES, STEWARD_THRESHOLDS, ICARUS_POT_CAP_FAVEUR, ICARUS_HISTORY_LEN, ICARUS_FREE_FLIGHTS_MAX, DICE_BOOST_MAX_LEVEL, WING_MAX_LEVEL, grandResetProductionMult } from './balance.js';
import { resetAnnals } from './annals.js';
import { normalizeOlympusState, defaultOlympusState } from '../data/olympus.js';
import { epitaphLegacyById } from '../data/epitaphs.js';
import { newCitySeed } from '../map/procedural/seedManager.js';
import { generateCityName } from '../map/procedural/cityName.js';

export const SAVE_KEY = "civilization-collapse-idle-v1";

// Version du SCHÉMA de sauvegarde, stockée DANS le payload (state.saveVersion) —
// surtout pas dans SAVE_KEY. Bumper SAVE_KEY effacerait tous les saves ; bumper
// CURRENT_SAVE_VERSION + ajouter une migration les fait évoluer sans perte.
// v2 : les champs sans plafond (ressources, ruines, pics…) sont sérialisés en
// strings Decimal ("1.5e+30") au lieu de numbers (migration Phase 3).
// v3 : les vestiges deviennent des « records de cité morte » compacts (footprint +
// métadonnées nom/année/ère) au lieu de milliers de cellules ; la rétro-conversion
// des anciens {gridN, ruins[]} est faite sans perte par normalizeVestiges.
export const CURRENT_SAVE_VERSION = 3;

// Champs de premier niveau migrés en Decimal (sérialisés en string dans le save).
export const DECIMAL_SAVE_FIELDS = [
  "population", "food", "gold", "knowledge", "infrastructure", "ruins",
  "chaosRuinsBonus", "phoenixTotalRuins", "phoenixRebirthTargetPop", "orStartPop", "orPopPeak", "hephPopPeak",
  "mythStartGold", "mythStartInfra", "mythStartPop", "ragnarokStartPower"
];

// Anciens coûts des nœuds de ruines SUPPRIMÉS par la refonte de l'arbre
// (docs/REFONTE-ARBRE-RUINES.md) — lus une seule fois par la migration de
// hydrateState pour rembourser le joueur. Déclaré AVANT `state = load()` :
// hydrateState s'exécute au chargement du module (TDZ sinon).
const OLD_RUIN_NODE_COSTS = {
  root_cellars: 1, ember_baskets: 2, bone_ledgers: 4, ash_paths: 6,
  cracked_scales: 9, silent_wells: 21, buried_tolls: 72, smoke_calendar: 90,
  rubble_contracts: 130, sunken_scriptorium: 420, old_coin_molds: 650,
  stone_bread: 1000, mirror_archives: 1500, crowned_debris: 4500,
  burial_math: 10000, forgotten_wharves: 23000, crisis_theatre: 120000,
  first_grammar: 120000, rubble_survey: 600000, echo_census: 3000000,
  bronze_foundations: 6800000, ivory_questions: 35000000,
  ritual_accounting: 78000000, ten_thousand_storehouses: 270000000,
  palace_of_receipts: 400000000, immortal_blueprint: 900000000,
  winter_granaries: 1200000000, silver_roads: 1400000000,
  public_quarries: 2100000000, dead_language_schools: 3000000000,
  nomad_ledgers: 3200000000, canal_charters: 5000000000,
  memory_courts: 5000000000, vaulted_treasuries: 5500000000,
  river_seedbanks: 6000000000, ash_medicine: 9000000000,
  codex_of_failures: 10000000000, deep_foundry: 12000000000,
  green_census: 13000000000, lamp_archives: 14000000000,
  mother_walls: 17000000000, counterfactual_histories: 18000000000,
  seasonal_oaths: 21000000000, patient_bloodlines: 30000000000,
  axiom_engine: 30000000000, last_refuges: 35000000000
};

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
// Suspension temporaire des notifications React : utilisé par la simulation
// hors-ligne (main.simulateAwayCrises) qui rejoue des milliers de ticks d'un coup
// — on ne re-rend qu'une fois à la fin, sinon le boot se fige.
let notifyPaused = false;
export const setNotifyPaused = (paused) => { notifyPaused = Boolean(paused); };
// Lecture du drapeau : les effets cosmétiques/aléatoires du tick (aubaines,
// floats de jalons) sont sautés pendant la simulation hors-ligne, qui suspend
// les notifications et rejoue des milliers de ticks d'un coup.
export const isNotifyPaused = () => notifyPaused;
export const notify = () => {
  if (notifyPaused) return;
  listeners.forEach(l => l());
};

// Pas de miroir module pour la vue active : state.activeView est l'unique
// source de vérité (un miroir non resynchronisé au load() est un piège — cf.
// le commentaire sur buyAmount dans setState).
export function openView(viewId) {
  state.activeView = viewId;
  notify();
}

export function render() {
  notify();
}


export const defaultState = () => ({
  saveVersion: CURRENT_SAVE_VERSION,
  population: new Decimal(10),
  // 12 = exactement UN cueilleur (coût 10) au premier instant : le tout début
  // doit se gagner bâtiment par bâtiment (rythme early game). Le plancher
  // post-effondrement (startFloor("Food", 35), crisis.js) reste plus haut :
  // la boucle de prestige repart plus vite, c'est voulu.
  food: new Decimal(12),
  gold: new Decimal(0),
  knowledge: new Decimal(0),
  infrastructure: new Decimal(0),
  ruins: new Decimal(0),
  cycles: 0,
  // Jackpots d'Icare décrochés (vol ≥ ×10, cagnotte du temple pleine) : jalon du
  // Grand Reset VII. Remis à 0 au GR — re-gagnable dans la boucle précédant GR7.
  icarusJackpots: 0,
  // Jalons de Grand Reset DÉCOUVERTS : { [grIndex]: true }. Un jalon reste masqué
  // (« ??? ») jusqu'à ce qu'il soit atteint une 1re fois ; il est alors révélé —
  // et le reste (survit au GR, cf. GR_PERSISTENT_FIELDS).
  grRevealed: {},
  activeMythId: null,
  mythsCompleted: {},
  mythActsAnnounced: {},
  chaosRuinsDouble: false,
  chaosRuinsBonus: new Decimal(0),
  chaosReached: false,
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
  orStartPop: new Decimal(0),
  orPopPeak: new Decimal(0),
  orGoldReached: false,
  orUsureImbalance: false,
  phoenixHeritage: false,
  phoenixCycleCount: 0,
  phoenixTotalRuins: new Decimal(0),
  phoenixRenaissances: 0,
  phoenixRebirthTargetPop: new Decimal(0),
  phoenixNextForceAt: null,
  ragnarokStartPower: new Decimal(0),
  hephHeritage: false,
  hephPopPeak: new Decimal(0),
  hephGoalReached: false,
  autoScriptRules: null,
  automateRules: null,
  icareInfraReached: false,
  sisypheReached: false,
  atridesReached: false,
  mythStartGold: new Decimal(0),
  mythStartInfra: new Decimal(0),
  mythStartPop: new Decimal(0),
  icareHeritage: false,
  surchauffeEndTime: 0,
  surchauffeCooldownEnd: 0,
  instability: 0,
  timeWear: 0,
  // Couverture du réseau routier (bâtiments-moteur reliés / total, 0..1), écrite
  // par la CARTE à chaque recompute du layout et lue par roadNetworkMultiplier().
  // Persistée : sans elle, un reload calculait la progression OFFLINE sans le
  // bonus routes (la carte n'est pas encore montée à ce moment-là).
  roadCoverage: 0,
  // A6 — Temps cumulé (s) passé sous le seuil de Rupture « stagnation » : monte
  // l'Usure d'une cité sur-stabilisée. Monte/descend dans le tick, reset au cycle.
  stagnationSec: 0,
  // B1 — Plus grande puissance de 10 de population déjà célébrée ce cycle (évite
  // de re-déclencher le même jalon). Reset au cycle → la croissance se re-fête.
  popMilestoneExp: 0,
  // B2 — Horodatage (ms) de la prochaine aubaine. 0 = à programmer au 1er tick.
  nextBoonAt: 0,
  crisisActions: {
    rationing: 0,
    festivals: 0,
    census: 0,
    reforms: 0
  },
  // Relief temporaire par foyer (Étape 2) : part d'apaisement [0..1] appliquée à
  // chaque foyer, alimentée par les actions de régulation et déclinant à chaque
  // tick (cf. FOYER_RELIEF_HALF_LIFE_S). Remis à zéro à chaque cycle.
  foyerRelief: {
    scarcity: 0,
    inequality: 0,
    complexity: 0,
    dissent: 0
  },
  // Réforme de fond : recul DURABLE par foyer [0..FOYER_RELIEF_CAP], déposé par
  // les actions de réforme. Ne décline PAS (contrairement à foyerRelief) ; partage
  // le plafond combiné avec foyerRelief. Remis à zéro à chaque cycle.
  foyerReform: {
    scarcity: 0,
    inequality: 0,
    complexity: 0,
    dissent: 0
  },
  // Levier C : politiques permanentes actives (ids). Tant qu'actives, ralentissent
  // la montée de la Rupture contre un coût de production récupérable. Reset au cycle.
  activePolicies: [],
  // Fatigue de régulation [0..1] : monte à chaque action, réduit leur efficacité
  // et augmente leur coût, décline avec le temps. Reset au cycle.
  regulFatigue: 0,
  // Registre des édits (onglet Régulation) : entrées factuelles des actes de
  // régulation { t, id, kind, foyer?, delta?, by? } (cap REGUL_LEDGER_MAX).
  // Reset au cycle — la mémoire de la civilisation tombée ne se transmet pas.
  regulLedger: [],
  // Historique des paris par table { id: [0|1]×GAMBLE_HISTORY_LEN } — nourrit la
  // Faveur des augures (revers consécutifs → chance accrue). Reset au cycle.
  gambleHistory: {},
  // Consignes de l'Intendance [{ threshold, actionId, enabled, lastAt }] :
  // DOCTRINE persistante — survit aux cycles, comme crisisDoctrine.
  stewardClauses: [],
  // FAVEUR — monnaie des jeux du temple (arbitrage Raph : jeux DÉCOUPLÉS).
  // Gagnée aux osselets et au Vol d'Icare, dépensée (à venir) en Bénédictions
  // et boosters d'odds. SURVIT aux effondrements (comme les ruines), effacée
  // seulement au Grand Reset.
  faveur: 0,
  // Vol d'Icare — cagnotte du temple, EN FAVEUR (nourrie par les vols brûlés et
  // les revers d'osselets, raflée en se posant à ×10+). SURVIT aux cycles : le
  // temple thésaurise à travers les âges (effacée au Grand Reset).
  icarusPotFaveur: 0,
  // Vol d'Icare — points de crash des derniers vols (bandeau d'historique).
  // Reset au cycle, comme gambleHistory.
  icarusHistory: [],
  // Boutique de Faveur — boosters PERMANENTS (comme la Faveur : survivent aux
  // effondrements, effacés au Grand Reset). diceLevel = dés pipés (odds osselets),
  // wingLevel = ailes cirées (edge Icare abaissé).
  diceLevel: 0,
  wingLevel: 0,
  // Bénédiction — bonus TEMPORAIRE de production (multiplicateur global actif
  // jusqu'à blessingUntil). Effet de run : remis à zéro à l'effondrement.
  blessingUntil: 0,
  blessingMult: 1,
  // Vols d'Icare OFFERTS par les Coups de Vénus (mise « Plume » payée par le
  // temple). Reset au cycle.
  icarusFreeFlights: 0,
  // Lissage (EMA) du déficit de nourriture pour le foyer Subsistance. null =
  // non initialisé (le tick le cale sur l'instantané au 1er pas). Reset au cycle.
  scarcityRawEase: null,
  // Lissage (EMA) de la réserve d'or en secondes de revenu, pour le foyer
  // Inégalités. null = non initialisé. Reset au cycle.
  goldReserveEase: null,
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
  // Doctrine de crise — auto-résolution des paliers 25/50/75 % + auto-effondrement
  // configurable (cf. CE-spec-idle-crises.md §A). Postures : "ask" (dialogue
  // bloquant, défaut), "stabiliser" (option qui baisse la Rupture), "temporiser".
  crisisDoctrine: {
    p25: "ask",
    p50: "ask",
    p75: "ask",
    autoCollapse: { enabled: false, trigger: "rupture100", usureThreshold: 0.9, timeSeconds: 600, prepare: true }
  },
  grandResetCount: 0,
  // Exhumations d'archéologie utilisées ce cycle (1 de base, 3 avec les
  // « Chantiers de fouilles »). Remplace l'ancien booléen archaeologyUsed.
  archaeologyUses: 0,
  // « Moisson de crise » : crises narratives STABILISÉES ce cycle (bonus de
  // ruines à l'effondrement, plafonné). Reset au cycle.
  cycleCrisesResolved: 0,
  lastCollapsedBuildings: {},
  vestiges: [],
  wonders: [],
  // Palier d'évolution de chaque merveille (1..5), clé = id de merveille.
  wonderTiers: {},
  cityMapSlots: {},
  riverWP: null,
  // Archétype de plan figé pour la partie : la ville garde son type de rues
  // d'origine (seuls les faubourgs s'ajoutent). Reset au nouveau cycle.
  cityArchetype: null,
  // Seed de génération procédurale de la ville (nouvelle à chaque cycle).
  mapSeed: null,
  // Compteurs "à vie" pour les jalons de merveilles (survivent aux cycles).
  lifetimePurchases: 0,
  playTimeSec: 0,
  buildings: Object.fromEntries(buildings.map((b) => [b.id, 0])),
  upgrades: {},
  // Nom procédural tiré à la création de partie (et régénéré à chaque cycle
  // tant que le joueur ne l'a pas renommé à la main — cf. cityNameCustom).
  cityName: generateCityName(newCitySeed()),
  // true dès que le joueur saisit un nom : il survit alors aux effondrements.
  cityNameCustom: false,
  history: ["An 0: une premiere communaute allume ses feux."],
  bestEraIndex: 0,
  cyclePeaks: {
    population: new Decimal(10),
    food: new Decimal(12),
    gold: new Decimal(0),
    knowledge: new Decimal(0),
    infrastructure: new Decimal(0),
    eraIndex: 0
  },
  cycleStartedAt: Date.now(),
  lastTick: Date.now(),
  // Legs d'épitaphe : bonus actif en début de cycle (activeEpitaphLegacy) et
  // choix en attente entre le dialogue d'épitaphe et completeCollapse
  // (nextEpitaphLegacy). Doivent figurer ici ET dans hydrateState, sinon ils
  // sont silencieusement perdus au rechargement.
  activeEpitaphLegacy: null,
  nextEpitaphLegacy: null,
  // Testament : legs pré-gravé par le joueur (page Effondrement), permanent de
  // cycle en cycle. L'effondrement automatique le grave sans dialogue ; le
  // dialogue manuel le pré-sélectionne.
  testamentLegacyId: null,
  buyAmount: 1,
  activeView: "city",
  mourning: false,
  // UI seulement : ids de nœuds de ruines déjà « vus » (animation de croissance
  // jouée une seule fois). Hors GR_PERSISTENT_FIELDS → l'arbre re-pousse au GR.
  ruinsSeenNodes: [],
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
export let renderCache = {
  cachedRuinEffectsSignature: "",
  cachedRuinEffects: null,
  // Compteur de frame : bumpFrame() l'incrémente (1× par tick). Chaque cache de
  // frame retient la version à laquelle il a été calculé (_frameXVer) et se
  // recalcule dès qu'elle diffère → invalidation centralisée, plus de nullage
  // manuel champ par champ. Sentinelle -1 = forcé périmé (frameVersion >= 0).
  frameVersion: 0,
  _frameVitals: null,
  _frameVitalsVer: -1,
  _framePressure: null,
  _framePressureVer: -1,
  _frameGlobalMult: null,
  _frameGlobalMultVer: -1,
  _frameGlobalMultDec: null,
  _frameGlobalMultDecVer: -1,
  _frameRates: null,
  _frameRatesVer: -1,
  _buildingSums: null,
  _buildingsVersion: 0,
  _upgradesVersion: 0,
  // Horloge du dernier tick, pour les composants qui affichent du temps écoulé
  // (barre de sédiments) sans appeler Date.now() pendant le rendu (React Compiler).
  tickNow: Date.now()
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
  // Plafond relevé (était 500) : les bâtiments DÉCORATIFS persistants (clés
  // `${cycle}:dec_<cat>:<idx>`) peuvent se compter en centaines sur une grande
  // ville, en plus des slots moteurs.
  for (const [key, slot] of Object.entries(raw).slice(0, 6000)) {
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
      // Decimal déshydraté en objet plat {mantissa, exponent} (save édité/importé
      // à la main) : D() sait le reconstruire — comme toNum/D le défendent déjà —
      // au lieu de le remettre silencieusement au défaut.
      : (value !== null && typeof value === "object"
          && typeof value.mantissa === "number" && typeof value.exponent === "number")
        ? D(value)
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

export function normalizeCrisisDoctrine(raw, fallback) {
  const source = isPlainObject(raw) ? raw : {};
  const ac = isPlainObject(source.autoCollapse) ? source.autoCollapse : {};
  const fac = fallback.autoCollapse;
  const posture = (v, def) => (["ask", "stabiliser", "temporiser"].includes(v) ? v : def);
  return {
    p25: posture(source.p25, fallback.p25),
    p50: posture(source.p50, fallback.p50),
    p75: posture(source.p75, fallback.p75),
    autoCollapse: {
      enabled: Boolean(ac.enabled),
      trigger: ["rupture100", "usure", "temps"].includes(ac.trigger) ? ac.trigger : fac.trigger,
      usureThreshold: finiteNumber(ac.usureThreshold, fac.usureThreshold, 0.1, 1),
      timeSeconds: finiteInteger(ac.timeSeconds, fac.timeSeconds, 30, 24 * 3600),
      prepare: ac.prepare === undefined ? fac.prepare : Boolean(ac.prepare)
    }
  };
}

// Registre des édits : tableau d'entrées plates { t, id, kind, foyer?, delta?,
// by? } — champs re-typés un à un (une save trafiquée ne doit jamais injecter
// d'objet profond), cap REGUL_LEDGER_MAX conservé côté écriture (regulLedgerPush).
function normalizeRegulLedger(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(isPlainObject)
    .slice(-REGUL_LEDGER_MAX)
    .map((e) => ({
      t: finiteTimestamp(e.t, Date.now()),
      id: typeof e.id === "string" ? e.id.slice(0, 40) : "",
      kind: typeof e.kind === "string" ? e.kind.slice(0, 20) : "soothe",
      foyer: typeof e.foyer === "string" ? e.foyer.slice(0, 20) : null,
      tier: typeof e.tier === "string" ? e.tier.slice(0, 12) : null,
      delta: finiteNumber(e.delta, 0, 0, 1),
      by: typeof e.by === "string" ? e.by.slice(0, 24) : null
    }))
    .filter((e) => e.id);
}

// Historique des paris : { idAction: [0|1|2] × GAMBLE_HISTORY_LEN max } —
// 1 = gain, 0 = jet creux, 2 = Chien (compte double dans la Faveur).
function normalizeGambleHistory(raw) {
  if (!isPlainObject(raw)) return {};
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!/^[a-zA-Z]{1,32}$/.test(key) || !Array.isArray(value)) continue;
    out[key] = value.slice(-GAMBLE_HISTORY_LEN).map((v) => (v === 2 ? 2 : v ? 1 : 0));
  }
  return out;
}

// Consignes de l'Intendance : seuil borné aux crans proposés, action re-validée
// au chargement par l'UI/tick (stewardActionAllowed) — ici on ne garde que la forme.
function normalizeStewardClauses(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(isPlainObject)
    .slice(0, STEWARD_MAX_CLAUSES)
    .map((c) => ({
      threshold: STEWARD_THRESHOLDS.includes(c.threshold) ? c.threshold : 0.65,
      actionId: typeof c.actionId === "string" ? c.actionId.slice(0, 40) : null,
      enabled: Boolean(c.enabled && typeof c.actionId === "string" && c.actionId),
      lastAt: finiteTimestamp(c.lastAt, 0)
    }));
}

export function normalizeFoyerRelief(raw, fallback) {
  const source = isPlainObject(raw) ? raw : {};
  const out = {};
  for (const key of Object.keys(fallback)) {
    out[key] = finiteNumber(source[key], fallback[key], 0, 1);
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
    food: decimalField(source.food, fallback.food),
    gold: decimalField(source.gold, fallback.gold),
    knowledge: decimalField(source.knowledge, fallback.knowledge),
    infrastructure: decimalField(source.infrastructure, fallback.infrastructure),
    eraIndex: finiteInteger(source.eraIndex, fallback.eraIndex, 0, Math.max(0, eras.length - 1))
  };
}

// Vestige = « record de cité morte » compact (v3). On garde 3 civilisations max.
// Rétro-compat : un vestige v2 { gridN, ruins:[{x,y}] } est converti en footprint
// (bbox des ruines) + métadonnées par défaut ; le lourd tableau ruins est jeté.
export function normalizeVestiges(raw) {
  if (!Array.isArray(raw)) return [];
  const maxEra = Math.max(0, eras.length - 1);
  return raw.slice(-3).map((vestige) => {
    if (!isPlainObject(vestige)) return null;
    // Footprint : présent (v3), sinon dérivé de l'ancien format {gridN, ruins[]} (v2).
    let footprint = vestige.footprint;
    if (!isPlainObject(footprint)) {
      const gridN = finiteInteger(vestige.gridN, 20, 1, 500);
      let cx = Math.floor(gridN / 2), cy = Math.floor(gridN / 2), radius = Math.max(1, Math.floor(gridN / 4));
      if (Array.isArray(vestige.ruins) && vestige.ruins.length) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const cell of vestige.ruins) {
          if (!isPlainObject(cell)) continue;
          const x = Number(cell.x), y = Number(cell.y);
          if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
        if (Number.isFinite(minX)) {
          cx = Math.round((minX + maxX) / 2);
          cy = Math.round((minY + maxY) / 2);
          radius = Math.max(1, Math.ceil(Math.max(maxX - minX, maxY - minY) / 2));
        }
      }
      footprint = { gridN, cx, cy, radius };
    } else {
      footprint = {
        gridN: finiteInteger(footprint.gridN, 20, 1, 500),
        cx: finiteInteger(footprint.cx, 10, 0, 500),
        cy: finiteInteger(footprint.cy, 10, 0, 500),
        radius: finiteInteger(footprint.radius, 5, 1, 500)
      };
    }
    const eraIndex = finiteInteger(vestige.eraIndex, 0, 0, maxEra);
    return {
      cityName: typeof vestige.cityName === "string" ? vestige.cityName.slice(0, 64) : "",
      year: finiteInteger(vestige.year, 0, 0, 1e9),
      eraName: typeof vestige.eraName === "string" ? vestige.eraName.slice(0, 64) : "",
      eraIndex,
      eraBand: finiteInteger(vestige.eraBand, eraBandOf(eraIndex), 0, 9),
      mapSeed: Number.isFinite(Number(vestige.mapSeed)) ? Number(vestige.mapSeed) : 0,
      cycleIndex: finiteInteger(vestige.cycleIndex, 0, 0, 1e9),
      footprint
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

export function normalizeEpitaphLegacy(raw) {
  if (!isPlainObject(raw)) return null;
  const id = typeof raw.id === "string" ? raw.id.slice(0, 64) : "";
  if (!id || !epitaphLegacyById(id)) return null;
  return {
    id,
    cause: typeof raw.cause === "string" ? raw.cause.slice(0, 32) : "",
    chosenCycle: finiteInteger(raw.chosenCycle, 0),
    startedAt: finiteTimestamp(raw.startedAt, Date.now())
  };
}

export function normalizeChronicleEntries(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(isPlainObject)
    .map(entry => {
      return {
        id: typeof entry.id === "string" ? entry.id.slice(0, 128) : "",
        // Id de l'article source (entry.id est suffixé pour les rediffusions) ;
        // les saves d'avant ce champ retombent sur entry.id.
        articleId: typeof entry.articleId === "string" ? entry.articleId.slice(0, 128) : (typeof entry.id === "string" ? entry.id.slice(0, 128) : ""),
        title: typeof entry.title === "string" ? entry.title.slice(0, 200) : "",
        text: typeof entry.text === "string" ? entry.text.slice(0, 4000) : "",
        author: typeof entry.author === "string" ? entry.author.slice(0, 100) : null,
        age: typeof entry.age === "string" ? entry.age.slice(0, 80) : "",
        date: typeof entry.date === "string" ? entry.date.slice(0, 80) : "",
        category: typeof entry.category === "string" ? entry.category.slice(0, 80) : "",
        isNew: typeof entry.isNew === "boolean" ? entry.isNew : false,
        isRerun: Boolean(entry.isRerun),
        // Pilote la fenêtre d'affichage du bandeau (1 min) ; 0 = dépêche
        // ancienne (save d'avant ce champ), donc bandeau masqué.
        publishedAt: finiteTimestamp(entry.publishedAt, 0)
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
      for (const field of ["population", "food", "gold", "knowledge", "infrastructure"]) {
        const value = s.cyclePeaks[field];
        if (typeof value === "number" && Number.isFinite(value)) s.cyclePeaks[field] = String(value);
      }
    }
  }
  // 2 -> 3 : vestiges compacts (footprint + métadonnées). Aucune transformation
  // ici : normalizeVestiges (hydrateState) rétro-convertit les anciens {gridN, ruins[]}.
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
  const stateOut = {
    ...base,
    saveVersion: CURRENT_SAVE_VERSION,
    population: decimalField(source.population, base.population),
    food: decimalField(source.food, base.food),
    gold: decimalField(source.gold, base.gold),
    knowledge: decimalField(source.knowledge, base.knowledge),
    infrastructure: decimalField(source.infrastructure, base.infrastructure),
    ruins: decimalField(source.ruins, base.ruins),
    cycles: finiteInteger(source.cycles, base.cycles),
    icarusJackpots: finiteInteger(source.icarusJackpots, base.icarusJackpots, 0),
    grRevealed: isPlainObject(source.grRevealed) ? { ...source.grRevealed } : {},
    activeMythId: typeof source.activeMythId === "string" && source.activeMythId ? source.activeMythId : null,
    mythsCompleted: normalizeMythsCompleted(source.mythsCompleted),
    mythActsAnnounced: normalizeMythActsAnnounced(source.mythActsAnnounced),
    chaosRuinsDouble: Boolean(source.chaosRuinsDouble),
    chaosRuinsBonus: decimalField(source.chaosRuinsBonus, 0),
    chaosReached: Boolean(source.chaosReached),
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
    orStartPop: decimalField(source.orStartPop, 0),
    orPopPeak: decimalField(source.orPopPeak, 0),
    orGoldReached: Boolean(source.orGoldReached),
    orUsureImbalance: Boolean(source.orUsureImbalance),
    phoenixHeritage: Boolean(source.phoenixHeritage),
    phoenixCycleCount: finiteInteger(source.phoenixCycleCount, 0),
    phoenixTotalRuins: decimalField(source.phoenixTotalRuins, 0),
    phoenixRenaissances: finiteInteger(source.phoenixRenaissances, 0),
    phoenixRebirthTargetPop: decimalField(source.phoenixRebirthTargetPop, 0),
    ragnarokStartPower: decimalField(source.ragnarokStartPower, 0),
    phoenixNextForceAt: source.phoenixNextForceAt ? finiteNumber(source.phoenixNextForceAt, 0, 0) : null,
    hephHeritage: Boolean(source.hephHeritage),
    hephPopPeak: decimalField(source.hephPopPeak, 0),
    hephGoalReached: Boolean(source.hephGoalReached),
    autoScriptRules: normalizeRuleList(source.autoScriptRules, defaultAutoScriptRules(), 1, 9999),
    automateRules: normalizeRuleList(source.automateRules, defaultAutomateRules(), 1, 99),
    icareInfraReached: Boolean(source.icareInfraReached),
    sisypheReached: Boolean(source.sisypheReached),
    atridesReached: Boolean(source.atridesReached),
    mythStartGold: decimalField(source.mythStartGold, 0),
    mythStartInfra: decimalField(source.mythStartInfra, 0),
    mythStartPop: decimalField(source.mythStartPop, 0),
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
    // Le deuil est le voile transitoire de la séquence d'effondrement
    // (runCollapseSequence) ; la séquence ne reprend pas après un
    mourning: false,
    activeEpitaphLegacy: normalizeEpitaphLegacy(source.activeEpitaphLegacy),
    nextEpitaphLegacy: normalizeEpitaphLegacy(source.nextEpitaphLegacy),
    testamentLegacyId: typeof source.testamentLegacyId === "string" && epitaphLegacyById(source.testamentLegacyId)
      ? source.testamentLegacyId
      : null,
    instability: clamp01(finiteNumber(source.instability, base.instability)),
    // Couverture routière : persiste le dernier calcul de la carte (l'offline au
    // chargement applique ainsi le bonus routes d'avant-fermeture).
    roadCoverage: clamp01(finiteNumber(source.roadCoverage, base.roadCoverage)),
    timeWear: clamp01(finiteNumber(source.timeWear, base.timeWear)),
    stagnationSec: finiteNumber(source.stagnationSec, base.stagnationSec, 0),
    popMilestoneExp: finiteInteger(source.popMilestoneExp, base.popMilestoneExp, 0),
    // Horodatage futur (Date.now()+délai) : surtout PAS finiteTimestamp (qui
    // plafonne à « maintenant » et casserait la programmation à venir).
    nextBoonAt: finiteNumber(source.nextBoonAt, base.nextBoonAt, 0),
    crisisActions: normalizeCrisisActions(source.crisisActions, base.crisisActions),
    foyerRelief: normalizeFoyerRelief(source.foyerRelief, base.foyerRelief),
    foyerReform: normalizeFoyerRelief(source.foyerReform, base.foyerReform),
    activePolicies: normalizeStringArray(source.activePolicies, POLICY_MAX_ACTIVE, 40),
    regulFatigue: finiteNumber(source.regulFatigue, base.regulFatigue, 0, 1),
    regulLedger: normalizeRegulLedger(source.regulLedger),
    gambleHistory: normalizeGambleHistory(source.gambleHistory),
    stewardClauses: normalizeStewardClauses(source.stewardClauses),
    faveur: finiteNumber(source.faveur, base.faveur, 0),
    icarusPotFaveur: finiteNumber(source.icarusPotFaveur, base.icarusPotFaveur, 0, ICARUS_POT_CAP_FAVEUR),
    icarusHistory: Array.isArray(source.icarusHistory)
      ? source.icarusHistory.filter((v) => Number.isFinite(v) && v >= 1).slice(-ICARUS_HISTORY_LEN)
      : [],
    icarusFreeFlights: finiteInteger(source.icarusFreeFlights, 0, 0, ICARUS_FREE_FLIGHTS_MAX),
    diceLevel: finiteInteger(source.diceLevel, 0, 0, DICE_BOOST_MAX_LEVEL),
    wingLevel: finiteInteger(source.wingLevel, 0, 0, WING_MAX_LEVEL),
    blessingUntil: finiteNumber(source.blessingUntil, 0, 0),
    blessingMult: finiteNumber(source.blessingMult, 1, 1, 10),
    scarcityRawEase: source.scarcityRawEase == null ? null : finiteNumber(source.scarcityRawEase, 0, 0, 1),
    goldReserveEase: source.goldReserveEase == null ? null : finiteNumber(source.goldReserveEase, 0, 0, 1e9),
    crisisThresholds: normalizeCrisisThresholds(source.crisisThresholds),
    crisisProduction: normalizeCrisisProduction(source.crisisProduction, base.crisisProduction),
    collapsePreparation: finiteNumber(source.collapsePreparation, base.collapsePreparation, 0, COLLAPSE_PREP_MAX),
    terminalPreparations: normalizeTerminalPreparations(source.terminalPreparations, base.terminalPreparations),
    crisisExtensions: finiteInteger(source.crisisExtensions, base.crisisExtensions, 0, 99),
    crisisLimitAnnounced: Boolean(source.crisisLimitAnnounced),
    crisisOpenedAt: source.crisisOpenedAt ? finiteTimestamp(source.crisisOpenedAt, null) : null,
    recentCrisisIds: normalizeStringArray(source.recentCrisisIds, 8, 80),
    crisisDoctrine: normalizeCrisisDoctrine(source.crisisDoctrine, base.crisisDoctrine),
    grandResetCount: finiteInteger(source.grandResetCount, base.grandResetCount),
    // Rétro-compat : l'ancien booléen archaeologyUsed devient 1 exhumation utilisée.
    archaeologyUses: finiteInteger(source.archaeologyUses, source.archaeologyUsed ? 1 : 0, 0),
    cycleCrisesResolved: finiteInteger(source.cycleCrisesResolved, 0, 0),
    lastCollapsedBuildings: normalizeNumberMap(source.lastCollapsedBuildings, buildingIds, {}, true),
    vestiges: normalizeVestiges(source.vestiges),
    wonders: normalizeStringArray(source.wonders, 64, 80),
    wonderTiers: normalizeWonderTiers(source.wonderTiers),
    cityMapSlots: normalizeCityMapSlots(source.cityMapSlots),
    riverWP: normalizeRiverWaypoints(source.riverWP),
    cityArchetype: typeof source.cityArchetype === "string" && /^[a-z]+$/.test(source.cityArchetype) ? source.cityArchetype : null,
    mapSeed: Number.isFinite(source.mapSeed) && source.mapSeed > 0 ? Math.floor(source.mapSeed) >>> 0 : null,
    lifetimePurchases: finiteInteger(source.lifetimePurchases, 0, 0),
    playTimeSec: finiteNumber(source.playTimeSec, 0, 0),
    buildings: normalizeNumberMap(source.buildings, buildingIds, base.buildings, true),
    upgrades: normalizeBooleanMap(source.upgrades, upgradeIds),
    chronicleEntries: normalizeChronicleEntries(source.chronicleEntries),
    chronicleCooldown: finiteNumber(source.chronicleCooldown, 0, 0),
    // On garde le nom sauvegardé, sauf l'ancien placeholder « NomVille » non
    // renommé : il est migré vers un nom procédural frais (base.cityName).
    cityName: typeof source.cityName === "string" && source.cityName.trim()
      && (Boolean(source.cityNameCustom) || source.cityName.trim() !== "NomVille")
      ? source.cityName.trim().slice(0, 42)
      : base.cityName,
    cityNameCustom: Boolean(source.cityNameCustom),
    history: normalizeHistory(source.history, base.history),
    bestEraIndex: finiteInteger(source.bestEraIndex, base.bestEraIndex, 0, Math.max(0, eras.length - 1)),
    cyclePeaks: normalizeCyclePeaks(source.cyclePeaks, base.cyclePeaks),
    cycleStartedAt: finiteTimestamp(source.cycleStartedAt, base.cycleStartedAt),
    lastTick: finiteTimestamp(source.lastTick, base.lastTick),
    buyAmount: source.buyAmount === "max" ? "max" : finiteInteger(source.buyAmount, 1, 1, 500),
    activeView: ["city", "regulation", "prestige", "ruinsView", "tech", "mythView", "history"].includes(source.activeView)
      ? source.activeView
      : "city",
    ruinsSeenNodes: Array.isArray(source.ruinsSeenNodes)
      ? source.ruinsSeenNodes.filter((x) => typeof x === "string")
      : []
  };
  if (!stateOut.crisisLimitAnnounced) stateOut.crisisOpenedAt = null;
  // Migration : les anciens upgrades d'auto-effondrement (intendant/conseil/memoire)
  // sont remplacés par conseil_de_crise + edit_effondrement (cf. CE-spec §A.5). On
  // lit le save BRUT (les anciens ids ont été filtrés de stateOut.upgrades) et on
  // octroie les nouveaux + active l'auto-effondrement pour ne pas régresser.
  const oldAuto = isPlainObject(source.upgrades) &&
    (source.upgrades.intendant_de_crise || source.upgrades.conseil_de_regence || source.upgrades.memoire_institutionnelle);
  if (oldAuto) {
    stateOut.upgrades.conseil_de_crise = true;
    stateOut.upgrades.edit_effondrement = true;
    stateOut.crisisDoctrine.autoCollapse.enabled = true;
  }
  // Migration « Refonte Arbre des Ruines » (2026-07, docs/REFONTE-ARBRE-RUINES.md) :
  // les nœuds SUPPRIMÉS sont remboursés à leur ANCIEN coût (respec) ; les nœuds
  // conservés (ids inchangés) restent possédés. Les dogmes deviennent des paires
  // de choix exclusifs → l'adoption est remise à zéro (gratuits à re-choisir au
  // palier, et une save pouvait posséder les deux membres d'une paire).
  // Idempotent : les ids supprimés n'existent plus dans upgradeIds, donc ils
  // disparaissent du save dès la prochaine sauvegarde (refund une seule fois).
  {
    const rawUpgrades = isPlainObject(source.upgrades) ? source.upgrades : {};
    let refund = 0;
    for (const [id, cost] of Object.entries(OLD_RUIN_NODE_COSTS)) {
      if (rawUpgrades[id]) refund += cost;
    }
    if (refund > 0) {
      stateOut.ruins = D(stateOut.ruins).add(refund);
      for (const id of dogmaIds) delete stateOut.upgrades[id];
      stateOut.ruinsSeenNodes = [];
      stateOut.history = [
        ...(stateOut.history || []),
        `L'Arbre des Ruines a été refondu : les anciens savoirs vous sont remboursés (+${refund} ruines). L'arbre attend d'être rallumé.`
      ];
    }
  }
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

// Invalide d'un seul coup les 5 caches de frame (vitals, pressure, globalMult,
// globalMultDec, rates) : il suffit d'avancer la version, les getters comparent
// eux-mêmes. Appelé 1× en tête de tick (remplace 5 nullages) et par scope "all".
export function bumpFrame() {
  renderCache.frameVersion++;
}

export function invalidateRenderCache(scope = "all") {
  if (scope === "all") {
    bumpFrame();
    renderCache._buildingSums = null;
    renderCache.cachedRuinEffects = null;
    renderCache.cachedRuinEffectsSignature = "";
  }
  // Portées ciblées : seul `rates` dépend des sommes de bâtiments / upgrades, on
  // le force périmé (-1) SANS toucher vitals/pressure/globalMult — qui, eux, ne
  // se rafraîchissent qu'au tick suivant (granularité d'origine préservée).
  if (scope === "all" || scope === "buildings") {
    renderCache._buildingSums = null;
    renderCache._buildingsVersion++;
    renderCache._frameRatesVer = -1;
  }
  if (scope === "all" || scope === "upgrades") {
    renderCache._upgradesVersion++;
    renderCache._frameRatesVer = -1;
  }
}

// Helpers setters pour permettre de reassigner buyAmount ou d'autres variables exportees depuis main.js
export function setBuyAmount(val) {
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
// Saisie en cours : on stocke la valeur telle quelle (pas de trim, sinon
// impossible de taper une espace) et on bascule en mode « renommé à la main ».
export function setCityName(name) {
  state.cityName = String(name).slice(0, 42);
  state.cityNameCustom = true;
  notify();
}
// Validation (perte de focus) : un nom vidé repasse en mode procédural et
// reçoit un nom frais — il sera donc à nouveau régénéré à chaque civilisation.
export function commitCityName() {
  const trimmed = state.cityName.trim();
  if (trimmed) {
    state.cityName = trimmed.slice(0, 42);
  } else {
    state.cityName = generateCityName(state.mapSeed || newCitySeed());
    state.cityNameCustom = false;
  }
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
  // Nouveau run = ressources de départ : un mode x25/x100/max hérité du run
  // précédent bloquerait tout achat tant que le joueur ne le change pas.
  s.buyAmount = 1;
  s.instability = 0;
  s.timeWear = 0;
  // A6/B1 — repartent de zéro à chaque cycle : la stagnation se mesure sur le
  // cycle courant, et la croissance de population se re-célèbre depuis le début.
  s.stagnationSec = 0;
  s.popMilestoneExp = 0;
  s.activeRuinIds = [];
  s.pendingActiveRuinsChoice = false;
  // defaultState() est l'unique source de vérité pour la forme de ces deux
  // objets (les effets ancestorCrisis/archiveCrisis incrémentent les
  // compteurs festivals/census, pas des clés à eux).
  const freshDefaults = defaultState();
  s.crisisActions = freshDefaults.crisisActions;
  s.foyerRelief = freshDefaults.foyerRelief;
  s.foyerReform = freshDefaults.foyerReform;
  s.activePolicies = [];
  s.regulFatigue = 0;
  // Mémoires de régulation du cycle tombé : registre, jets d'augures, annales
  // (les consignes de l'Intendance, elles, sont de la doctrine et SURVIVENT —
  // tout comme la cagnotte d'Icare, que le temple thésaurise à travers les âges).
  s.regulLedger = [];
  s.gambleHistory = {};
  s.icarusHistory = [];
  s.icarusFreeFlights = 0;
  // Bénédiction = effet TEMPORAIRE de run : effacée à l'effondrement (les
  // boosters permanents dés/ailes, eux, SURVIVENT — comme la Faveur).
  s.blessingUntil = 0;
  s.blessingMult = 1;
  resetAnnals();
  s.scarcityRawEase = null;
  // goldReserveEase n'est PAS réinitialisé : juste après l'effondrement, l'or
  // résiduel + un revenu quasi nul donneraient une réserve géante → pic
  // d'Inégalités parasite. On laisse l'EMA reporter la valeur (basse) du cycle
  // précédent et converger doucement vers la nouvelle économie.
  s.crisisThresholds = {};
  s.crisisProduction = freshDefaults.crisisProduction;
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
  s.archaeologyUses = 0;
  s.cycleCrisesResolved = 0;
  s.cityMapSlots = {};
  s.cityArchetype = null;
  
  if (s.atlasHeritage) s.atlasLegitimite = 50;
  s.atlasCrisisCount = 0;
  s.babelProdReached = false;
  s.babelCategory    = null;
  s.orStartPop       = D(s.population || 0);
  s.orPopPeak        = D(s.population || 0);
  s.orGoldReached    = false;
  s.orUsureImbalance = false;
  s.hephPopPeak      = D(s.population || 0);
  s.hephGoalReached  = false;
  
  s.icareInfraReached   = false;
  s.sisypheReached      = false;
  s.atridesReached      = false;
  s.prometheePopReached = false;
  s.prometheeFailed     = false;
  s.chaosReached        = false;
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

// ──────────────── Grand Reset : préservation des héritages ───────────────────
// SOURCE DE VÉRITÉ des champs conservés à travers un Grand Reset. Tout nouveau
// déblocage PERMANENT doit être ajouté ici, sinon il est silencieusement effacé
// au prochain GR (cf. grandReset.test.js). grandResetCount / history sont
// CALCULÉS et traités à part dans buildGrandResetState().
export const GR_PERSISTENT_FIELDS = [
  "mythsCompleted", "mythActsAnnounced", "chaosRuinsDouble", "chaosRuinsBonus",
  "prometheeBraisiers", "atlasHeritage", "sisypheHeritage", "icareHeritage",
  "babelHeritage", "orHeritage", "phoenixHeritage", "atridesHeritage", "eneeHeritage",
  "autoScriptRules", "hephHeritage", "automateRules",
  "surchauffeEndTime", "surchauffeCooldownEnd",
  "cadmosHeritage", "cadmosPermanentEpitaphs", "cadmosLastRunChronicle",
  "anteeHeritage", "ragnarokHeritage", "finalChronicleTitle",
  "olympus", "grRevealed"
];

// Copie un champ persistant vers le state frais. Les Decimal (chaosRuinsBonus)
// sont copiés par RÉFÉRENCE — l'ancien state est jeté juste après, donc pas
// d'aliasing — et surtout PAS via structuredClone/JSON qui perdrait la classe.
// Les objets/arrays de données simples sont clonés en profondeur.
function cloneGrandResetValue(value) {
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Decimal) return value;
  return JSON.parse(JSON.stringify(value));
}

// Construit (sans muter) l'état post-Grand-Reset : un defaultState() frais sur
// lequel on recopie les héritages permanents (GR_PERSISTENT_FIELDS), puis les 3
// champs calculés. Pur (lit le `state` courant) → testable hors de la séquence
// async à dialogue de performGrandReset.
export function buildGrandResetState(nextCount) {
  const fresh = defaultState();
  for (const key of GR_PERSISTENT_FIELDS) {
    if (state[key] !== undefined) fresh[key] = cloneGrandResetValue(state[key]);
  }
  fresh.grandResetCount = nextCount;
  fresh.history = [`Grand Reset x${nextCount} : tout a été effacé. Bonus permanent : ${nextCount === 11 ? "x4 Ruines supplémentaire" : `x${grandResetProductionMult(nextCount).toFixed(0)} production et Ruines gagnées`}. Les pactes mythiques demeurent.`];
  return fresh;
}

export function markChronicleEntryRead(id) {
  state.chronicleEntries = (state.chronicleEntries || []).map(entry =>
    entry.id === id ? { ...entry, isNew: false } : entry
  );
  save();
  notify();
}
