"use strict";

import { buildings } from '../data/buildings.js';
import { upgrades, dogmaIds } from '../data/upgrades.js';
import { eras, CRISIS_EVENTS } from '../data/world.js';
import { eraBandOf } from '../data/eraThemes.js';
import { clamp01 } from './utils.js';
import { Decimal, D } from './num.js';
import { COLLAPSE_PREP_MAX, POLICY_MAX_ACTIVE, REGUL_LEDGER_MAX, GAMBLE_HISTORY_LEN, STEWARD_MAX_CLAUSES, STEWARD_THRESHOLDS, ICARUS_POT_CAP_FAVEUR, ICARUS_HISTORY_COLOMBIER, FLIGHTS_MAX_COLOMBIER, ICARUS_STAKES, SCRATCH_HISTORY_LEN, BLACKJACK_HISTORY_LEN, DICE_BOOST_MAX_LEVEL, WING_MAX_LEVEL, STYLET_MAX_LEVEL, GRAVEUR_MAX_LEVEL, COFFRE_MAX_LEVEL, AUTO_ICARUS_TARGET_MIN, AUTO_ICARUS_TARGET_MAX, AUTO_TEMPLE_FAVEUR_FLOOR_DEFAULT, AUTO_TEMPLE_FAVEUR_FLOOR_MAX, TRUNK_CAP, TEMPLE_ARTIFACT_IDS, BOON_INTERVAL_MAX_SEC, CLEPSYDRE_HARD_MAX_SECONDS, MAX_BATCH_AMOUNT, grandResetProductionMult, grandResetRuinGainMult } from './balance.js';
import { resetAnnals } from './annals.js';
import { normalizeOlympusState, defaultOlympusState } from '../data/olympus.js';
import { epitaphLegacyById } from '../data/epitaphs.js';
import { newCitySeed } from '../map/procedural/seedManager.js';
import { generateCityName } from '../map/procedural/cityName.js';

// La clé vit dans saveKey.js (cloudSave.js doit la lire AVANT l'évaluation de
// ce module — cf. l'en-tête de cloudSave.js) ; ré-exportée ici pour les clients.
import { SAVE_KEY, CURRENT_SAVE_VERSION } from './saveKey.js';
import { cloudMirrorSave } from './cloudSave.js';
export { SAVE_KEY };

// Version du SCHÉMA de sauvegarde, stockée DANS le payload (state.saveVersion) —
// surtout pas dans SAVE_KEY. Bumper SAVE_KEY effacerait tous les saves ; bumper
// CURRENT_SAVE_VERSION + ajouter une migration les fait évoluer sans perte.
// v2 : les champs sans plafond (ressources, ruines, pics…) sont sérialisés en
// strings Decimal ("1.5e+30") au lieu de numbers (migration Phase 3).
// v3 : les vestiges deviennent des « records de cité morte » compacts (footprint +
// métadonnées nom/année/ère) au lieu de milliers de cellules ; la rétro-conversion
// des anciens {gridN, ruins[]} est faite sans perte par normalizeVestiges.
// v4 : rétro-correctif des « Braisiers ancestraux » — l'héritage de Prométhée était
// effacé par resetTemporaryRunState à l'effondrement même qui l'accordait, donc
// aucune save ne peut le porter. On le re-dérive de mythsCompleted.
export { CURRENT_SAVE_VERSION }; // défini dans saveKey.js (lisible par cloudSave.js sans importer state.js)

// Champs de premier niveau migrés en Decimal (sérialisés en string dans le save).
export const DECIMAL_SAVE_FIELDS = [
  "population", "food", "gold", "knowledge", "infrastructure", "ruins",
  "phoenixTotalRuins", "phoenixRebirthTargetPop", "hephPopPeak",
  "mythStartGold", "mythStartInfra", "mythStartPop"
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

// Bornes des champs numériques des automates, PAR CHAMP. Le débit reste bas
// volontairement : il multiplie les achats par tick, donc aussi le tri des
// bâtiments et le calcul de coût pendant le rattrapage hors ligne.
export const AUTOMATE_FIELD_BOUNDS = { reservePct: [0, 90], perTick: [1, 10] };

// `reservePct` : part de la devise que l'automate NE touche PAS. Sans elle,
// l'auto-achat était en tout ou rien et sabotait les autres branches, donc on le
// laissait éteint — l'inverse de ce qu'une automatisation payée doit faire.
// `perTick` : nombre d'achats par tick.
export const defaultAutomateRules = () => [
  { id: "auto_buy_city", type: "buy_cheapest", category: "city", label: "Acheter bati. (Cite) si abordable", enabled: false, reservePct: 0, perTick: 1 },
  { id: "auto_buy_knowledge", type: "buy_cheapest", category: "knowledge", label: "Acheter bati. (Savoir) si abordable", enabled: false, reservePct: 0, perTick: 1 },
  { id: "auto_buy_infra", type: "buy_cheapest", category: "infra", label: "Acheter bati. (Infra) si abordable", enabled: false, reservePct: 0, perTick: 1 },
  { id: "auto_rationing", type: "crisis_action", actionId: "rationing", label: "Rationnement si Rupture >=", unit: "%", threshold: 60, enabled: false }
];

// Réglages du moteur d'automatisation du Temple (Phase 2, 2026-07-15) : des
// CADRANS par jeu. Débloqués à l'échoppe (`unlocked`), activés par le joueur
// (`on`), réglés (rite / multiplicateur cible / mise / plancher). Monnaie
// fermée (2026-07-16) : osselets ET Icare misent la FAVEUR → plancher de
// Faveur (faveurFloor) ; tronc = auto-relève des offrandes, sans cadran.
// ÉTERNELS (GR_PERSISTENT_FIELDS). null en defaultState, rempli à
// l'hydratation (comme autoScriptRules/automateRules).
// Les QUATRE jeux ont leur auto (capstones, arbitrage Raphaël 2026-07-17), plus
// le tronc. Cadrans communs des autos de jeu : on/off, plancher de Faveur (gain
// gardé), TEMPO (recueilli/mesuré/fervent — multiplie l'intervalle) ; plus le
// cadran de RISQUE propre à chaque jeu (rite, mise, cible).
export const defaultTempleAuto = () => ({
  tronc: { unlocked: false, on: false },
  osselets: { unlocked: false, on: false, rite: "classique", tempo: "mesure", stakePow: 0, faveurFloor: AUTO_TEMPLE_FAVEUR_FLOOR_DEFAULT, lastAt: 0 },
  icarus: { unlocked: false, on: false, target: 2, stakeId: "plume", tempo: "mesure", stakePow: 0, faveurFloor: AUTO_TEMPLE_FAVEUR_FLOOR_DEFAULT, lastAt: 0 },
  gratteux: { unlocked: false, on: false, stakeId: "obole", tempo: "mesure", stakePow: 0, faveurFloor: AUTO_TEMPLE_FAVEUR_FLOOR_DEFAULT, lastAt: 0 },
  vingtetun: { unlocked: false, on: false, stakeId: "legere", tempo: "mesure", stakePow: 0, faveurFloor: AUTO_TEMPLE_FAVEUR_FLOOR_DEFAULT, lastAt: 0 }
});

// ── Registre de la Chronique (stats à vie) ───────────────────────────────────
// Compteurs HISTORIQUES cumulés : stats des 4 jeux du temple, économie de Faveur,
// records/superlatifs, et horodatages (sur une horloge à vie) des déblocages de
// Grand Reset et des accomplissements de Mythes. ÉTERNEL : survit aux
// effondrements ET au Grand Reset (GR_PERSISTENT_FIELDS) — c'est un registre de
// records, pas un état de run. Tout est en number/string/map plats (aucun Decimal
// vivant) : `biggestRuinGain` est une STRING Decimal ("1.5e+30") pour survivre au
// clone JSON du Grand Reset ET à JSON.stringify sans perte. Les recorders qui le
// nourrissent vivent dans chronicleStats.js. lifetimePlaySec est l'horloge à vie
// (incrémentée au tick, à côté de playTimeSec qui, lui, repart à 0 au GR).
const CHRONICLE_GAME_EXTRAS = {
  osselets:  { venus: 0, dog: 0 },
  icarus:    { bestMult: 0, jackpots: 0, biggestJackpot: 0, crashes: 0 },
  scratch:   { venus: 0, soleil: 0 },
  blackjack: { naturals: 0, bestStreak: 0 }
};

export function defaultChronicleStats() {
  const games = {};
  for (const [game, extras] of Object.entries(CHRONICLE_GAME_EXTRAS)) {
    games[game] = { plays: 0, wagered: 0, won: 0, biggest: 0, ...extras };
  }
  return {
    lifetimePlaySec: 0,
    games,
    faveurEarned: 0,
    faveurSpentShop: 0,
    offeringsCollected: 0,
    biggestPotRaked: 0,
    biggestRuinGain: "0",   // string Decimal
    longestCycleSec: 0,
    mostCrisesInCycle: 0,
    fastestEraGainSec: 0,   // 0 = jamais mesuré
    grTimings: {},          // { [gr]: { discovered:number|null, performed:number|null } }
    mythTimings: {}         // { [mythId]: { at, runSec, order, act } }
  };
}

function normalizeChronicleStats(raw) {
  const def = defaultChronicleStats();
  const s = isPlainObject(raw) ? raw : {};
  const games = {};
  for (const [game, extras] of Object.entries(CHRONICLE_GAME_EXTRAS)) {
    const g = isPlainObject(s.games?.[game]) ? s.games[game] : {};
    const out = {
      plays: finiteInteger(g.plays, 0, 0),
      wagered: finiteNumber(g.wagered, 0, 0),
      won: finiteNumber(g.won, 0, 0),
      biggest: finiteNumber(g.biggest, 0, 0)
    };
    for (const key of Object.keys(extras)) out[key] = finiteNumber(g[key], 0, 0);
    games[game] = out;
  }
  // Horodatages GR : { [gr]: { discovered, performed } } — gr borné 1..11.
  const grTimings = {};
  if (isPlainObject(s.grTimings)) {
    for (const [key, val] of Object.entries(s.grTimings)) {
      const gr = Number(key);
      if (!Number.isInteger(gr) || gr < 1 || gr > 11 || !isPlainObject(val)) continue;
      grTimings[gr] = {
        discovered: val.discovered == null ? null : finiteNumber(val.discovered, 0, 0),
        performed: val.performed == null ? null : finiteNumber(val.performed, 0, 0)
      };
    }
  }
  // Horodatages mythes : { [mythId]: { at, runSec, order, act } }.
  const mythTimings = {};
  if (isPlainObject(s.mythTimings)) {
    for (const [id, val] of Object.entries(s.mythTimings)) {
      if (typeof id !== "string" || id.length > 64 || !isPlainObject(val)) continue;
      mythTimings[id.slice(0, 64)] = {
        at: finiteNumber(val.at, 0, 0),
        runSec: finiteNumber(val.runSec, 0, 0),
        order: finiteInteger(val.order, 0, 0),
        act: (typeof val.act === "number" || typeof val.act === "string") ? val.act : 0
      };
    }
  }
  return {
    lifetimePlaySec: finiteNumber(s.lifetimePlaySec, 0, 0),
    games,
    faveurEarned: finiteNumber(s.faveurEarned, 0, 0),
    faveurSpentShop: finiteNumber(s.faveurSpentShop, 0, 0),
    offeringsCollected: finiteNumber(s.offeringsCollected, 0, 0),
    biggestPotRaked: finiteNumber(s.biggestPotRaked, 0, 0),
    // Conservé en STRING Decimal ; decimalField().toString() re-normalise toute
    // forme (number/string/Decimal déshydraté) sans coercition native.
    biggestRuinGain: decimalField(s.biggestRuinGain, def.biggestRuinGain).toString(),
    longestCycleSec: finiteNumber(s.longestCycleSec, 0, 0),
    mostCrisesInCycle: finiteInteger(s.mostCrisesInCycle, 0, 0),
    fastestEraGainSec: finiteNumber(s.fastestEraGainSec, 0, 0),
    grTimings,
    mythTimings
  };
}

const VALID_TEMPOS = ["recueilli", "mesure", "fervent"];

function normalizeTempleAuto(source) {
  const def = defaultTempleAuto();
  const s = (source && typeof source === "object") ? source : {};
  const game = (key, extra) => {
    const g = (s[key] && typeof s[key] === "object") ? s[key] : {};
    return {
      unlocked: Boolean(g.unlocked),
      on: Boolean(g.on),
      tempo: VALID_TEMPOS.includes(g.tempo) ? g.tempo : "mesure",
      // Le cadran de coffre de l'auto : la PUISSANCE de mise (mise × 10^stakePow),
      // re-clampée au rang possédé à CHAQUE tick par clampStakeMult.
      stakePow: finiteInteger(g.stakePow, 0, 0, COFFRE_MAX_LEVEL),
      // Migration douce des saves d'avant la monnaie fermée : goldFloorS est
      // simplement abandonné, le plancher de Faveur part du défaut.
      faveurFloor: Math.round(finiteNumber(g.faveurFloor, def[key].faveurFloor, 0, AUTO_TEMPLE_FAVEUR_FLOOR_MAX)),
      lastAt: finiteTimestamp(g.lastAt, 0),
      ...extra(g)
    };
  };
  const t = (s.tronc && typeof s.tronc === "object") ? s.tronc : {};
  return {
    tronc: {
      unlocked: Boolean(t.unlocked),
      on: Boolean(t.on)
    },
    osselets: game("osselets", (g) => ({
      rite: typeof g.rite === "string" ? g.rite : def.osselets.rite
    })),
    icarus: game("icarus", (g) => ({
      target: finiteNumber(g.target, def.icarus.target, AUTO_ICARUS_TARGET_MIN, AUTO_ICARUS_TARGET_MAX),
      stakeId: typeof g.stakeId === "string" ? g.stakeId : def.icarus.stakeId
    })),
    gratteux: game("gratteux", (g) => ({
      stakeId: typeof g.stakeId === "string" ? g.stakeId : def.gratteux.stakeId
    })),
    vingtetun: game("vingtetun", (g) => ({
      stakeId: typeof g.stakeId === "string" ? g.stakeId : def.vingtetun.stakeId
    }))
  };
}

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
// DEUX drapeaux et non un seul. `notifyPaused` disait « pas de bruit visuel » et
// servait AUSSI, faute de mieux, à couper de la MÉCANIQUE : le Temple et les
// aubaines s'arrêtaient donc pendant l'absence, ce qui est l'inverse de la
// promesse d'une automatisation. `offlineSim` dit « on rejoue du temps » :
//   - ce qui est COSMÉTIQUE se coupe sur notifyPaused (floats, célébrations,
//     échantillons de courbe) ;
//   - ce qui est MÉCANIQUE tourne sous offlineSim, en silence et PLAFONNÉ.
// Toujours levés ensemble par simulateAwayCrises, jamais l'un sans l'autre.
let offlineSim = false;
export const setOfflineSim = (on) => { offlineSim = Boolean(on); };
export const isOfflineSim = () => offlineSim;
// Consomme le bandeau de fin de cycle : l'affichage le prend en charge, l'état
// ne garde pas trace d'une annonce déjà passée à l'écran.
export const clearCycleReport = () => {
  if (!state.lastCycleReport) return;
  state.lastCycleReport = null;
  notify();
};
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
  // Sceaux de Grand Reset RÉCLAMÉS : { [gr]: true }. Système ORDRE-LIBRE — chaque
  // sceau se réclame indépendamment, dans n'importe quel ordre. grRevealed[gr] =
  // condition atteinte une fois (banké, réclamable à vie) ; grClaimed[gr] = encaissé
  // via un Grand Reset. grandResetCount = nombre de sceaux réclamés (|grClaimed|).
  grClaimed: {},
  // Bâtiments dont l'apparition a DÉJÀ été annoncée (D6) : { [id]: true }.
  // À VIE, et c'est le point : isUnlocked retombe à faux à chaque effondrement
  // (les bâtiments et les pics repartent au socle), donc un latch par cycle
  // rejouerait la même rafale toutes les deux ou trois minutes.
  revealedBuildings: {},
  // Premiers pas (E1) : trois drapeaux latchés à SENS UNIQUE par le tick. Ils
  // ne se relisent jamais sur l'état courant — la chute vide les bâtiments et
  // le Grand Reset remet `cycles` à zéro, donc une condition relue ferait
  // revenir le fil chez un joueur qui l'a fini depuis longtemps.
  onboarding: { built: false, pressureSeen: false, collapsed: false },
  activeMythId: null,
  mythsCompleted: {},
  mythActsAnnounced: {},
  // Héritage du Chaos « Né du néant » : +25 % sur toutes les récoltes de Ruines
  // (facteur de ruinGain). Remplace l'ancienne banque chaosRuinsDouble/chaosRuinsBonus.
  chaosHeritage: false,
  chaosReached: false,
  prometheeFailed: false,
  prometheePopReached: false,
  prometheeBraisiers: false,
  atlasHeritage: false,
  // Héritage d'Atlas : « Atlas prend le coup » déjà consommé ce cycle (skip d'une
  // gestion de crise, 1×/cycle — voir crisis.js). Remis à false à chaque cycle.
  atlasSkipUsed: false,
  // « Le poids du ciel » (Atlas) : jauge du Fardeau, épaulées comptées, drapeau
  // d'écrasement (échec), fin du cooldown d'ÉPAULER. Tout per-cycle.
  atlasFardeau: 0,
  atlasEpaules: 0,
  atlasCrushed: false,
  atlasShoulderCdEnd: 0,
  sisypheMult: 1,
  sisypheHeritage: false,
  // « La Montée » (Sisyphe) : cran courant du rocher (0 = au pied), sommets déjà
  // atteints (le premier retombe toujours), usages par matière de la montée en
  // cours (chaque usage double le prix de la matière). Tout per-cycle.
  sisypheCran: 0,
  sisypheMontees: 0,
  sisypheUsages: { food: 0, knowledge: 0, infrastructure: 0 },
  babelHeritage: false,
  babelCategory: null,
  // Héritage « la Langue commune » : catégorie déclarée ce cycle (+20 % de prod),
  // une déclaration par cycle — null tant que rien n'est déclaré.
  babelCommonTongue: null,
  // Réglage AUTO de la Langue commune : langue retenue d'un cycle à l'autre —
  // redéclarée d'elle-même à chaque nouveau cycle (resetTemporaryRunState).
  // Survit au Grand Reset (GR_PERSISTENT_FIELDS) : un réglage de confort ne se
  // reconfigure pas.
  babelAutoTongue: null,
  orHeritage: false,
  // « Les Caravanes » (Âge d'Or) : marchés conclus ce cycle.
  orDealsClosed: 0,
  orUsureImbalance: false,
  phoenixHeritage: false,
  phoenixCycleCount: 0,
  phoenixTotalRuins: new Decimal(0),
  phoenixRenaissances: 0,
  phoenixRebirthTargetPop: new Decimal(0),
  phoenixNextForceAt: null,
  // « L'Hiver Fimbul » (Ragnarok) : offrandes versées à l'Arche, prix d'UNE
  // offrande figé à l'activation (4 Decimals — activateMyth le pose via rates()),
  // bouchées du Loup déjà prises (dérivé de l'âge du cycle). Tout per-cycle.
  ragnarokArkOfferings: 0,
  ragnarokArkCost: null,
  ragnarokArkNextAt: 0,
  ragnarokWolfBites: 0,
  hephHeritage: false,
  hephPopPeak: new Decimal(0),
  hephGoalReached: false,
  autoScriptRules: null,
  automateRules: null,
  // Objet COMPLET dès le defaultState (pas null) : le tableau de bord lit
  // state.templeAuto directement (pas de getter lazy comme autoScriptRules) — un
  // null sur une partie fraîche non rechargée masquerait le panneau ET son bouton
  // de déblocage. buildGrandResetState/hydrate le recopient/normalisent par-dessus.
  templeAuto: defaultTempleAuto(),
  // Artefacts du Temple (Phase 4) : refontes de risque déblocables (booléens),
  // ÉTERNELS (GR_PERSISTENT_FIELDS). Objet plein (pas null) : le panneau-arbre
  // lit state.templeArtifacts directement.
  templeArtifacts: {},
  // « Vol par paliers » (Icare) : altitude courante du cycle. Le latch borne le
  // fardeau « Cire fondante » à UNE montée automatique par franchissement du seuil.
  icareAltitude: 0,
  icareAutoBurnLatched: false,
  atridesReached: false,
  mythStartGold: new Decimal(0),
  mythStartInfra: new Decimal(0),
  mythStartPop: new Decimal(0),
  icareHeritage: false,
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
  // C7 — LA CLEPSYDRE : secondes d'absence reçues AU-DESSUS du plafond, mises de
  // côté au lieu d'être jetées, versées quand le joueur le décide (main.js,
  // spendStoredTime). Number simple, jamais un Decimal : c'est du temps, borné à
  // moins d'un million de secondes par CLEPSYDRE_HARD_MAX_SECONDS.
  // SURVIT au Grand Reset (GR_PERSISTENT_FIELDS) : c'est du temps déjà VÉCU par
  // le joueur, pas une ressource de partie. L'effacer punirait précisément qui
  // enchaîne un Grand Reset au retour d'une longue absence — le cas d'usage.
  storedSeconds: 0,
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
  // Gagnée au tronc des offrandes et aux jeux, MISÉE aux osselets (monnaie
  // fermée 2026-07-16), dépensée à la Boutique en Bénédictions et boosters.
  // SURVIT aux effondrements (comme les ruines), effacée seulement au Grand
  // Reset (le carburant se re-gagne ; les augments, eux, sont ÉTERNELS — cf.
  // GR_PERSISTENT_FIELDS).
  faveur: 0,
  // TRONC DES OFFRANDES — goutte-à-goutte passif de Faveur, plafonné, calculé à
  // la volée depuis trunkAt (cf. actions/offeringTrunk.js). PLEIN au départ
  // (amorce de jeu) ; survit aux effondrements comme la Faveur ; repart plein
  // au Grand Reset (ce default). trunkAt = 0 → « pas encore relevé ».
  trunkFaveur: TRUNK_CAP,
  trunkAt: 0,
  // Vol d'Icare — cagnotte du temple, EN FAVEUR (nourrie par les vols brûlés et
  // les revers d'osselets, raflée en se posant à ×10+). SURVIT aux cycles : le
  // temple thésaurise à travers les âges (effacée au Grand Reset).
  icarusPotFaveur: 0,
  // Vol d'Icare — points de crash des derniers vols (bandeau d'historique).
  // Reset au cycle, comme gambleHistory.
  icarusHistory: [],
  // Tickets à gratter — symboles des derniers tickets (bandeau d'historique).
  // Reset au cycle, comme icarusHistory. La cagnotte, elle, est PARTAGÉE avec
  // Icare (state.icarusPotFaveur) et survit aux cycles.
  scratchHistory: [],
  // Vingt-et-un — issues des dernières mains ('win'|'lose'|'push'|'blackjack').
  // Reset au cycle, comme scratchHistory (la cagnotte reste partagée/persistante).
  blackjackHistory: [],
  // Série de victoires au vingt-et-un (la Voix de l'oracle) : win/blackjack
  // l'allonge, lose la coupe, push ne compte pas. Le temple comptait les défaites
  // (Clémence), il compte enfin les victoires. Reset au cycle avec l'historique ;
  // l'auto n'y touche jamais (la série se joue à la main).
  blackjackStreak: 0,
  // Boutique de Faveur — boosters ÉTERNELS : survivent aux effondrements ET au
  // Grand Reset (augments, cf. GR_PERSISTENT_FIELDS ; 2026-07-15). diceLevel =
  // dés pipés (odds osselets), wingLevel = ailes cirées (edge Icare abaissé),
  // styletLevel = stylet du gratteux (rayon de grattage, pur confort).
  diceLevel: 0,
  wingLevel: 0,
  styletLevel: 0,
  // Les planches du graveur : le winrate du gratteux monte, paiements fixes
  // (le pendant des dés pipés — cf. scratchPrizesEff).
  graveurLevel: 0,
  // Les Coffres du temple : chaque rang autorise une mise ×10 de plus dans les
  // 4 jeux (le moteur exponentiel de l'imprimante volontaire — cf. clampStakeMult).
  coffreLevel: 0,
  // Bénédiction — bonus TEMPORAIRE de production (multiplicateur global actif
  // jusqu'à blessingUntil). Effet de run : remis à zéro à l'effondrement.
  blessingUntil: 0,
  blessingMult: 1,
  // Vols d'Icare OFFERTS (mise payée par le temple) : FILE d'ids de mise, plafonnée
  // à ICARUS_FREE_FLIGHTS_MAX. Les Coups de Vénus (osselets, gratteux) donnent une
  // « plume » ; le Soleil du gratteux donne un billet à la hauteur du ticket. Était
  // un ENTIER avant le 2026-07-17 (compteur de plumes implicites) — cf. la migration
  // dans hydrateState. Reset au cycle.
  icarusFreeFlights: [],
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
    used: {},
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
  // Registre de la Chronique : stats de jeux, économie de Faveur, records et
  // horodatages GR/Mythes — cumul À VIE (survit au Grand Reset, cf.
  // GR_PERSISTENT_FIELDS). Objet plein dès le defaultState : la Chronique le lit
  // directement. Nourri par les recorders de chronicleStats.js.
  chronicleStats: defaultChronicleStats(),
  buildings: Object.fromEntries(buildings.map((b) => [b.id, 0])),
  upgrades: {},
  // Nom procédural tiré à la création de partie (et régénéré à chaque cycle
  // tant que le joueur ne l'a pas renommé à la main — cf. cityNameCustom).
  cityName: generateCityName(newCitySeed()),
  // true dès que le joueur saisit un nom : il survit alors aux effondrements.
  cityNameCustom: false,
  history: ["An 0: une premiere communaute allume ses feux."],
  bestEraIndex: 0,
  // Bilan du cycle précédent (cf. normalizePrevCycle) : sert à chiffrer l'écart
  // dans le bandeau de fin de cycle. null tant qu'aucune civilisation n'est tombée.
  prevCycle: null,
  // Bandeau de fin de cycle EN ATTENTE d'affichage. Volontairement TRANSITOIRE :
  // remis à null à l'hydratation, sinon un F5 rejouerait le bilan d'une chute
  // déjà annoncée.
  lastCycleReport: null,
  // Le vœu du cycle (D2) : objectif court terme volontaire, choisi parmi trois au
  // début du cycle. Champ de RUN — meurt à l'effondrement (resetTemporaryRunState)
  // et au Grand Reset (hors GR_PERSISTENT_FIELDS). null tant qu'aucun n'est tiré ;
  // { offered:[{id,target,base}], chosen:{id,target,base}|null, done:bool }.
  cycleVow: null,
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
  finalChronicleTitle: null,
  chronicleEntries: [],
  chronicleCooldown: 0,
  olympus: defaultOlympusState()
});

// Index par id. DÉCLARÉS AVANT `state = load()` : hydrateState tourne au
// chargement du module et les lit (normalizeBuyQueue) — plus bas, c'est une TDZ,
// donc une exception dans hydrateState, donc le repli « sauvegarde illisible,
// partie neuve ». Même raison que OLD_RUIN_NODE_COSTS en tête de fichier.
export const buildingById = Object.fromEntries(buildings.map((building) => [building.id, building]));
export const upgradeById = Object.fromEntries(upgrades.map((upgrade) => [upgrade.id, upgrade]));

// ⚠ MIGRATIONS DOIT RESTER AU-DESSUS DE `load()` (juste en dessous). C'est un
// `const` : il n'est initialisé qu'à la ligne où il est écrit. Déclaré plus bas
// dans le fichier — ce qui était le cas — `load()` (ligne suivante, exécutée à
// l'ÉVALUATION DU MODULE) tombait sur « Cannot access 'MIGRATIONS' before
// initialization » dès qu'une sauvegarde demandait une migration, c'est-à-dire
// pour TOUTE sauvegarde plus ancienne que CURRENT_SAVE_VERSION. Le jeu concluait
// « sauvegarde illisible », archivait la partie sous ...-corrupt-backup et
// repartait à zéro. Même piège que OLD_RUIN_NODE_COSTS en tête de fichier.
// Ses dépendances sont sûres : DECIMAL_SAVE_FIELDS est un const de la ligne 38,
// isPlainObject et normalizeMythsCompleted sont des déclarations de fonction
// (hoistées, donc utilisables avant leur ligne).
//
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
  },
  // 2 -> 3 : vestiges compacts (footprint + métadonnées). Aucune transformation
  // ici : normalizeVestiges (hydrateState) rétro-convertit les anciens {gridN, ruins[]}.
  //
  // 3 -> 4 : rétro-correctif des « Braisiers ancestraux ». `prometheeBraisiers` est
  // un héritage PERMANENT (il figure dans GR_PERSISTENT_FIELDS) mais il était listé
  // dans resetTemporaryRunState, qui tourne à la fin du MÊME effondrement que
  // applyHeritage — le drapeau était donc posé puis effacé, et aucune save existante
  // ne peut le porter à true. Il ne peut pas non plus se regagner : activateMyth
  // (actions/myths.js) refuse un Mythe déjà complété, donc applyHeritage ne rejoue
  // jamais. On le re-dérive de mythsCompleted, seule trace survivante de la réussite.
  3: (s) => {
    if (s.prometheeBraisiers) return;
    const completed = normalizeMythsCompleted(s.mythsCompleted);
    if (completed["mythe_de_promethee"]) s.prometheeBraisiers = true;
  },
};

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

// Vols d'Icare offerts : FILE d'ids de mise depuis le 2026-07-17 (le Soleil du
// gratteux offre un vol À LA HAUTEUR DU TICKET, ce qu'un compteur ne peut pas
// porter). MIGRATION : une save d'avant porte un ENTIER = N vols « Plume ».
// Défensif dans les deux sens (save trafiquée, id inconnu, longueur, NaN).
export function migrateFreeFlights(source) {
  const ids = ICARUS_STAKES.map((s) => s.id);
  if (Array.isArray(source)) {
    // Tronqué au plafond STATIQUE le plus haut (colombier) : à l'hydratation on ne
    // sait pas encore si l'artefact est possédé, et grantFreeFlight ré-applique le
    // plafond vivant de toute façon. Tronquer à 5 mangerait les billets d'une save
    // au colombier plein.
    return source.filter((id) => ids.includes(id)).slice(0, FLIGHTS_MAX_COLOMBIER);
  }
  // Ancien format : un entier (des plumes).
  const n = finiteInteger(source, 0, 0, FLIGHTS_MAX_COLOMBIER);
  return new Array(n).fill("plume");
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

// `{...fallback, enabled}` puis recopie EXPLICITE des seuls champs listés. Le
// piège est l'inverse de celui qu'on croit : ce ne sont pas les nouveaux champs
// qui manqueraient (les défauts sont injectés par le spread), ce sont les
// valeurs RÉGLÉES PAR LE JOUEUR qui repartaient au défaut à chaque rechargement,
// silencieusement, faute d'être recopiées. Tout champ numérique modifiable doit
// donc figurer dans `numericBounds`, sinon il ne survit pas à un F5.
export function normalizeRuleList(raw, defaults, thresholdMin = 1, thresholdMax = 9999, numericBounds = null) {
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
    if (numericBounds) {
      for (const [field, [min, max]] of Object.entries(numericBounds)) {
        if (!(field in fallback)) continue;
        normalized[field] = finiteNumber(source[field], fallback[field], min, max);
      }
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

// Bilan du cycle PRÉCÉDENT, conservé pour pouvoir afficher un écart au suivant.
// chronicleStats ne garde que des RECORDS (plus gros gain, plus long cycle) :
// le cycle d'avant n'y figure nulle part, d'où ce champ dédié. Les montants sont
// des chaînes (Decimal sérialisé) : ce bilan ne sert qu'à l'affichage, jamais au
// calcul, donc on ne paie pas la reconstruction en Decimal à l'hydratation.
export function normalizePrevCycle(raw) {
  if (!isPlainObject(raw)) return null;
  const cause = typeof raw.cause === "string" ? raw.cause.slice(0, 40) : "";
  return {
    cycleSec: finiteNumber(raw.cycleSec, 0, 0, 1e12),
    ruinGain: typeof raw.ruinGain === "string" ? raw.ruinGain.slice(0, 64) : "0",
    peakPop: typeof raw.peakPop === "string" ? raw.peakPop.slice(0, 64) : "0",
    cause
  };
}

// Le vœu du cycle (D2). Validation de FORME seule, sans connaître la table des
// vœux : un id persisté qui n'existe plus se résout en « aucun vœu » au runtime
// (vowById → null), donc importer vows.js ici (et créer un cycle state↔vows)
// serait inutile.
function normalizeVowEntry(raw) {
  if (!isPlainObject(raw) || typeof raw.id !== "string") return null;
  return {
    id: raw.id.slice(0, 40),
    target: finiteNumber(raw.target, 0, -1e6, 1e6),
    base: finiteNumber(raw.base, 0, -1e6, 1e6),
  };
}
export function normalizeCycleVow(raw) {
  if (!isPlainObject(raw)) return null;
  const offered = Array.isArray(raw.offered)
    ? raw.offered.slice(0, 3).map(normalizeVowEntry).filter(Boolean)
    : [];
  const chosen = normalizeVowEntry(raw.chosen);
  if (!offered.length && !chosen) return null;
  return { offered, chosen, done: Boolean(raw.done) };
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

// (MIGRATIONS est déclaré PLUS HAUT, juste avant `state = load()` — voir le
// commentaire là-bas : ici, il serait initialisé trop tard.)

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

// Normalise un set de sceaux de Grand Reset { [gr]: true } (clés 1..11).
function normalizeGrSet(obj) {
  const out = {};
  if (!isPlainObject(obj)) return out;
  for (let gr = 1; gr <= 11; gr += 1) if (obj[gr]) out[gr] = true;
  return out;
}

// Migration « ordre-libre » : un save LINÉAIRE (grandResetCount = N, sans grClaimed)
// avait réclamé les N premiers sceaux dans l'ordre historique GR I→N.
function legacyClaimedFromCount(n) {
  const out = {};
  const claimed = Math.min(11, Math.max(0, Number.isFinite(n) ? n : 0));
  for (let gr = 1; gr <= claimed; gr += 1) out[gr] = true;
  return out;
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
    // grRevealed ⊇ grClaimed : un sceau réclamé (y compris migré depuis un save
    // linéaire) est forcément « découvert ». On fusionne les 3 sources.
    // legacyClaimedFromCount UNIQUEMENT pour un save linéaire (sans grClaimed) :
    // sur un save ordre-libre, l'ajouter révélerait (donc rendrait réclamables)
    // des sceaux jamais atteints — cliquet exploitable au reload. Même garde que
    // la branche grClaimed plus bas.
    grRevealed: {
      ...normalizeGrSet(source.grRevealed),
      ...normalizeGrSet(source.grClaimed),
      ...(isPlainObject(source.grClaimed) ? {} : legacyClaimedFromCount(finiteInteger(source.grandResetCount, 0, 0)))
    },
    // Même forme et mêmes bornes que mythsCompleted : une map d'identifiants
    // vers true. Une sauvegarde d'avant D6 n'en a pas, elle repart de {} — le
    // premier tick annoncera donc d'un coup ce qui est déjà à portée, en UN
    // seul message groupé, puis plus jamais.
    revealedBuildings: normalizeMythsCompleted(source.revealedBuildings),
    // Objet PLEIN et jamais null, comme templeAuto : le sélecteur le lit à
    // chaque tick et un null y coûterait un test de garde à chaque lecture.
    onboarding: {
      built: Boolean(source.onboarding?.built),
      pressureSeen: Boolean(source.onboarding?.pressureSeen),
      collapsed: Boolean(source.onboarding?.collapsed)
    },
    activeMythId: typeof source.activeMythId === "string" && source.activeMythId ? source.activeMythId : null,
    mythsCompleted: normalizeMythsCompleted(source.mythsCompleted),
    mythActsAnnounced: normalizeMythActsAnnounced(source.mythActsAnnounced),
    // `|| source.chaosRuinsDouble` : renommage 2026-07-20 — les saves d'avant la
    // refonte portent l'héritage sous l'ancien drapeau de la banque.
    chaosHeritage: Boolean(source.chaosHeritage || source.chaosRuinsDouble),
    chaosReached: Boolean(source.chaosReached),
    prometheeFailed: Boolean(source.prometheeFailed),
    prometheePopReached: Boolean(source.prometheePopReached),
    prometheeBraisiers: Boolean(source.prometheeBraisiers),
    atlasHeritage: Boolean(source.atlasHeritage),
    atlasSkipUsed: Boolean(source.atlasSkipUsed),
    atlasFardeau: finiteNumber(source.atlasFardeau, 0, 0, 100),
    atlasEpaules: finiteInteger(source.atlasEpaules, 0, 0),
    atlasCrushed: Boolean(source.atlasCrushed),
    // Fin de cooldown (horodatage FUTUR) : finiteNumber, pas finiteTimestamp —
    // ce dernier plafonne à « maintenant » et ré-armerait ÉPAULER à chaque reload.
    atlasShoulderCdEnd: finiteNumber(source.atlasShoulderCdEnd, 0, 0),
    sisypheMult: finiteNumber(source.sisypheMult, 1, 1),
    sisypheHeritage: Boolean(source.sisypheHeritage),
    sisypheCran: finiteInteger(source.sisypheCran, 0, 0),
    sisypheMontees: finiteInteger(source.sisypheMontees, 0, 0),
    sisypheUsages: {
      food: finiteInteger(source.sisypheUsages?.food, 0, 0),
      knowledge: finiteInteger(source.sisypheUsages?.knowledge, 0, 0),
      infrastructure: finiteInteger(source.sisypheUsages?.infrastructure, 0, 0)
    },
    babelHeritage: Boolean(source.babelHeritage),
    babelCategory: ["city", "knowledge", "infra"].includes(source.babelCategory) ? source.babelCategory : null,
    babelCommonTongue: ["city", "knowledge", "infra"].includes(source.babelCommonTongue) ? source.babelCommonTongue : null,
    babelAutoTongue: ["city", "knowledge", "infra"].includes(source.babelAutoTongue) ? source.babelAutoTongue : null,
    orHeritage: Boolean(source.orHeritage),
    orDealsClosed: finiteInteger(source.orDealsClosed, 0, 0),
    orUsureImbalance: Boolean(source.orUsureImbalance),
    phoenixHeritage: Boolean(source.phoenixHeritage),
    phoenixCycleCount: finiteInteger(source.phoenixCycleCount, 0),
    phoenixTotalRuins: decimalField(source.phoenixTotalRuins, 0),
    phoenixRenaissances: finiteInteger(source.phoenixRenaissances, 0),
    phoenixRebirthTargetPop: decimalField(source.phoenixRebirthTargetPop, 0),
    ragnarokArkOfferings: finiteInteger(source.ragnarokArkOfferings, 0, 0),
    // Le prix d'une offrande (4 Decimals), figé à l'activation ; null hors Ragnarok.
    ragnarokArkCost: source.ragnarokArkCost && typeof source.ragnarokArkCost === "object"
      ? {
          food: decimalField(source.ragnarokArkCost.food, 0),
          gold: decimalField(source.ragnarokArkCost.gold, 0),
          knowledge: decimalField(source.ragnarokArkCost.knowledge, 0),
          infrastructure: decimalField(source.ragnarokArkCost.infrastructure, 0)
        }
      : null,
    // Prochaine offrande (horodatage FUTUR) : finiteNumber — finiteTimestamp la
    // rendrait re-disponible au reload (triche de l'Arche par F5).
    ragnarokArkNextAt: finiteNumber(source.ragnarokArkNextAt, 0, 0),
    ragnarokWolfBites: finiteInteger(source.ragnarokWolfBites, 0, 0),
    phoenixNextForceAt: source.phoenixNextForceAt ? finiteNumber(source.phoenixNextForceAt, 0, 0) : null,
    hephHeritage: Boolean(source.hephHeritage),
    hephPopPeak: decimalField(source.hephPopPeak, 0),
    hephGoalReached: Boolean(source.hephGoalReached),
    autoScriptRules: normalizeRuleList(source.autoScriptRules, defaultAutoScriptRules(), 1, 9999),
    automateRules: normalizeRuleList(source.automateRules, defaultAutomateRules(), 1, 99, AUTOMATE_FIELD_BOUNDS),
    templeAuto: normalizeTempleAuto(source.templeAuto),
    templeArtifacts: normalizeBooleanMap(source.templeArtifacts, TEMPLE_ARTIFACT_IDS),
    icareAltitude: finiteInteger(source.icareAltitude, 0, 0),
    icareAutoBurnLatched: Boolean(source.icareAutoBurnLatched),
    atridesReached: Boolean(source.atridesReached),
    mythStartGold: decimalField(source.mythStartGold, 0),
    mythStartInfra: decimalField(source.mythStartInfra, 0),
    mythStartPop: decimalField(source.mythStartPop, 0),
    icareHeritage: Boolean(source.icareHeritage),
    atridesDebt: finiteNumber(source.atridesDebt, base.atridesDebt, 0),
    atridesDrainDisabled: Boolean(source.atridesDrainDisabled),
    atridesDebtGrowthMultiplier: finiteNumber(source.atridesDebtGrowthMultiplier, base.atridesDebtGrowthMultiplier, 0),
    // Effet PAYÉ en cours (horodatage FUTUR) : finiteNumber, pas finiteTimestamp
    // qui le ferait expirer sur-le-champ au reload (perte sèche pour le joueur).
    atridesRenegotiateActiveUntil: finiteNumber(source.atridesRenegotiateActiveUntil, base.atridesRenegotiateActiveUntil, 0),
    // Fin de cooldown (FUTUR) : finiteNumber — finiteTimestamp la raserait au reload.
    atridesRenegotiateCooldownEnd: finiteNumber(source.atridesRenegotiateCooldownEnd, base.atridesRenegotiateCooldownEnd, 0),
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
    finalChronicleTitle: typeof source.finalChronicleTitle === "string" ? source.finalChronicleTitle.slice(0, 100) : base.finalChronicleTitle,
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
    // plafonne à « maintenant » et casserait la programmation à venir). Borné en
    // HAUT à now + intervalle max : une horloge système reculée après coup peut
    // laisser un nextBoonAt aberrant qui bloquerait les aubaines à jamais.
    nextBoonAt: finiteNumber(source.nextBoonAt, base.nextBoonAt, 0, Date.now() + BOON_INTERVAL_MAX_SEC * 1000),
    // Borné au plafond ABSOLU de la clepsydre et non au plafond du joueur : les
    // upgrades ne sont pas encore lisibles à ce stade de l'hydratation. Le
    // versement, lui, re-borne à la contenance réelle (clepsydreCapSeconds).
    storedSeconds: finiteNumber(source.storedSeconds, base.storedSeconds, 0, CLEPSYDRE_HARD_MAX_SECONDS),
    crisisActions: normalizeCrisisActions(source.crisisActions, base.crisisActions),
    foyerRelief: normalizeFoyerRelief(source.foyerRelief, base.foyerRelief),
    foyerReform: normalizeFoyerRelief(source.foyerReform, base.foyerReform),
    activePolicies: normalizeStringArray(source.activePolicies, POLICY_MAX_ACTIVE, 40),
    regulFatigue: finiteNumber(source.regulFatigue, base.regulFatigue, 0, 1),
    regulLedger: normalizeRegulLedger(source.regulLedger),
    gambleHistory: normalizeGambleHistory(source.gambleHistory),
    stewardClauses: normalizeStewardClauses(source.stewardClauses),
    faveur: finiteNumber(source.faveur, base.faveur, 0),
    // Tronc des offrandes : une save d'avant le tronc le découvre PLEIN (base),
    // l'amorce vaut aussi pour les migrations.
    trunkFaveur: finiteNumber(source.trunkFaveur, base.trunkFaveur, 0, TRUNK_CAP),
    trunkAt: finiteTimestamp(source.trunkAt, 0),
    icarusPotFaveur: finiteNumber(source.icarusPotFaveur, base.icarusPotFaveur, 0, ICARUS_POT_CAP_FAVEUR),
    // Tronqué au plafond STATIQUE le plus haut (colombier, 24) : le plafond vivant
    // dépend d'un artefact qu'on ne connaît pas encore à ce stade de l'hydratation.
    icarusHistory: Array.isArray(source.icarusHistory)
      ? source.icarusHistory.filter((v) => Number.isFinite(v) && v >= 1).slice(-ICARUS_HISTORY_COLOMBIER)
      : [],
    scratchHistory: Array.isArray(source.scratchHistory)
      ? source.scratchHistory.filter((v) => typeof v === "string").slice(-SCRATCH_HISTORY_LEN)
      : [],
    blackjackHistory: Array.isArray(source.blackjackHistory)
      ? source.blackjackHistory.filter((v) => typeof v === "string").slice(-BLACKJACK_HISTORY_LEN)
      : [],
    blackjackStreak: finiteInteger(source.blackjackStreak, 0, 0),
    // MIGRATION 2026-07-17 : entier → FILE d'ids de mise. Une save d'avant portait
    // un compteur de vols « Plume » implicites : N devient N plumes. Les ids sont
    // filtrés sur ICARUS_STAKES (une save trafiquée ne doit pas injecter une mise
    // inexistante) puis tronqués au plafond.
    icarusFreeFlights: migrateFreeFlights(source.icarusFreeFlights),
    diceLevel: finiteInteger(source.diceLevel, 0, 0, DICE_BOOST_MAX_LEVEL),
    wingLevel: finiteInteger(source.wingLevel, 0, 0, WING_MAX_LEVEL),
    styletLevel: finiteInteger(source.styletLevel, 0, 0, STYLET_MAX_LEVEL),
    graveurLevel: finiteInteger(source.graveurLevel, 0, 0, GRAVEUR_MAX_LEVEL),
    coffreLevel: finiteInteger(source.coffreLevel, 0, 0, COFFRE_MAX_LEVEL),
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
    // Sceaux réclamés (ordre-libre). Migration : un save linéaire sans grClaimed a
    // réclamé les N premiers sceaux (N = grandResetCount).
    grClaimed: isPlainObject(source.grClaimed)
      ? normalizeGrSet(source.grClaimed)
      : legacyClaimedFromCount(finiteInteger(source.grandResetCount, 0, 0)),
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
    chronicleStats: normalizeChronicleStats(source.chronicleStats),
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
    prevCycle: normalizePrevCycle(source.prevCycle),
    cycleVow: normalizeCycleVow(source.cycleVow),
    lastCycleReport: null,   // transitoire : jamais rejoué au rechargement
    cyclePeaks: normalizeCyclePeaks(source.cyclePeaks, base.cyclePeaks),
    cycleStartedAt: finiteTimestamp(source.cycleStartedAt, base.cycleStartedAt),
    lastTick: finiteTimestamp(source.lastTick, base.lastTick),
    // 'max' et 'step' sont des SENTINELLES (quantité résolue par bâtiment au
    // moment de l'achat). Absentes de cette liste blanche, elles retombaient
    // silencieusement sur ×1 au rechargement.
    buyAmount: source.buyAmount === "max" || source.buyAmount === "step"
      ? source.buyAmount
      : finiteInteger(source.buyAmount, 1, 1, MAX_BATCH_AMOUNT),
    activeView: ["city", "regulation", "prestige", "ruinsView", "tech", "mythView", "comptoir", "history"].includes(source.activeView)
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
  let raw = null;
  try {
    raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return defaultState();
    return hydrateState(JSON.parse(raw));
  } catch (e) {
    // Save illisible (JSON tronqué par un quota, régression d'un normalizer sur
    // une save par ailleurs valide…) : on repart neuf, mais on ARCHIVE d'abord le
    // payload brut. Sans ça, l'auto-save des 2 s (main.js) l'écraserait, détruisant
    // sans trace une save potentiellement réparable à la main.
    try {
      if (raw) localStorage.setItem(SAVE_KEY + "-corrupt-backup", raw);
    } catch { /* stockage plein : on ne peut pas archiver, tant pis */ }
    console.error(`Sauvegarde illisible : repli sur une partie neuve. Payload brut archivé sous « ${SAVE_KEY}-corrupt-backup ».`, e);
    return defaultState();
  }
}

// Horodatage de la dernière sauvegarde RÉUSSIE, et dernier échec s'il y en a un.
// VARIABLES DE MODULE et surtout pas des champs de `state` : dans l'état ils
// partiraient dans l'export JSON, devraient être normalisés à l'hydratation, et
// déclencheraient un render à chaque écriture pour une donnée d'affichage.
let lastSaveAt = 0;
let lastSaveError = "";
export const getLastSaveAt = () => lastSaveAt;
// Un échec de sauvegarde ne peut PAS passer par les toasts : le bus ignore les
// entrées sans libellé et la couche s'efface au bout de 2,4 s. Or c'est
// exactement l'information qui doit rester à l'écran tant qu'elle est vraie.
export const getLastSaveError = () => lastSaveError;

export function save() {
  try {
    // lastTick n'est PLUS posé ici : il vit désormais dans la boucle de tick
    // (temps réellement crédité, cf. offlineCredit.js). Sinon l'auto-save throttlé
    // d'un onglet caché le rafraîchissait en continu et le retour ne créditait
    // jamais l'absence (M16). L'écriture reste, seule l'estampille bouge.
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    lastSaveAt = Date.now();
    lastSaveError = "";
  } catch (e) {
    // QuotaExceededError (stockage plein ou navigation privee iOS Safari)
    // La progression continue en memoire — pas de crash silencieux.
    lastSaveError = e?.message || String(e);
    console.warn("Sauvegarde impossible:", lastSaveError);
  }
  cloudMirrorSave(); // miroir Google Drive du .exe (throttlé) — no-op en navigateur
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
  // Nouveau run = ressources de départ : un mode x25/x100/max/palier hérité du
  // run précédent bloquerait tout achat tant que le joueur ne le change pas.
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
  s.scratchHistory = [];
  s.blackjackHistory = [];
  s.blackjackStreak = 0;
  s.icarusFreeFlights = [];
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
  // Le vœu du cycle (D2) meurt avec la civilisation : completeCollapse en tire un
  // nouveau juste après. Rangé ici (et non en champ éternel) → il disparaît aussi
  // quand resetCivilization scelle un pacte, ce qui est voulu (le pacte a ses
  // propres règles) ; le prochain cycle en reproposera un.
  s.cycleVow = null;
  s.cityMapSlots = {};
  s.cityArchetype = null;
  s.atlasSkipUsed = false;
  s.atlasFardeau = 0;
  s.atlasEpaules = 0;
  s.atlasCrushed = false;
  s.atlasShoulderCdEnd = 0;
  s.babelCategory     = null;
  // « La Langue commune » : si le réglage Auto est armé, la langue du nouveau
  // cycle repart déclarée d'elle-même — sinon, à re-déclarer à la main.
  s.babelCommonTongue = (s.babelHeritage && s.babelAutoTongue) ? s.babelAutoTongue : null;
  s.orDealsClosed    = 0;
  s.orUsureImbalance = false;
  s.hephPopPeak      = D(s.population || 0);
  s.hephGoalReached  = false;
  
  // Traqueurs de PROGRESSION de run (remis à zéro à chaque cycle).
  // ⚠ NE JAMAIS ajouter ici un drapeau d'HÉRITAGE (cf. GR_PERSISTENT_FIELDS) :
  // resetTemporaryRunState tourne à la FIN de completeCollapse (crisis.js:400),
  // ~95 lignes APRÈS checkMythOnCollapse/applyHeritage (crisis.js:306) — le même
  // effondrement qui accorde l'héritage l'effacerait aussitôt. Cas vécu :
  // `prometheeBraisiers` (Braisiers ancestraux jamais actifs, donc Ruine active
  // « promethee » jamais proposée, donc Antée infaisable et Ragnarok verrouillé).
  // Barré par le test de classe dans grandReset.test.js.
  s.icareAltitude       = 0;
  s.icareAutoBurnLatched = false;
  s.sisypheCran         = 0;
  s.sisypheMontees      = 0;
  s.sisypheUsages       = { food: 0, knowledge: 0, infrastructure: 0 };
  s.atridesReached      = false;
  s.prometheePopReached = false;
  s.prometheeFailed     = false;
  s.chaosReached        = false;
  s.ragnarokArkOfferings = 0;
  s.ragnarokArkCost      = null;
  s.ragnarokArkNextAt    = 0;
  s.ragnarokWolfBites    = 0;

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
  "mythsCompleted", "mythActsAnnounced", "chaosHeritage",
  "prometheeBraisiers", "atlasHeritage", "sisypheHeritage", "icareHeritage",
  "babelHeritage", "babelAutoTongue", "orHeritage", "phoenixHeritage", "atridesHeritage", "eneeHeritage",
  "autoScriptRules", "hephHeritage", "automateRules",
  "cadmosHeritage", "cadmosPermanentEpitaphs", "cadmosLastRunChronicle",
  "anteeHeritage", "ragnarokHeritage", "finalChronicleTitle",
  "olympus", "grRevealed", "grClaimed",
  // Bâtiments déjà annoncés (D6) : le latch est à VIE. Après un Grand Reset le
  // joueur reconstruit tout, et lui rejouer la découverte des Cueilleurs serait
  // du bruit sur une mécanique qu'il connaît par cœur.
  "revealedBuildings",
  // Premiers pas (E1) : un Grand Reset ne refait PAS le didacticiel. Sans cette
  // entrée, `cycles` repartant à zéro, le fil se rouvrirait chez un joueur qui
  // vient d'accomplir la chose la plus avancée du jeu.
  "onboarding",
  // Augments du Temple (2026-07-15) : boosters de jeu ÉTERNELS — survivent au
  // Grand Reset ; la Faveur (le carburant) se re-gagne, elle, à chaque cycle GR.
  // templeAuto = réglages d'automatisation (Phase 2) : éternels aussi.
  // templeArtifacts = refontes de risque déblocables (Phase 4) : éternelles aussi.
  "diceLevel", "wingLevel", "styletLevel", "graveurLevel", "coffreLevel", "templeAuto", "templeArtifacts",
  // Registre de la Chronique : cumul À VIE de stats/records/horodatages — c'est
  // un journal de records, il traverse le Grand Reset (l'horloge à vie, les
  // timings de GR/Mythes et les compteurs de jeux ne se réinitialisent jamais).
  "chronicleStats",
  // La clepsydre (C7). Choix EXPLICITE : le temps mis de côté est du temps déjà
  // vécu par le joueur, pas une ressource de partie. L'effacer au Grand Reset
  // punirait exactement le geste que la clepsydre existe pour servir — garder
  // son absence sous le coude pour la verser sur la cité neuve.
  "storedSeconds"
];

// Copie un champ persistant vers le state frais. Les Decimal éventuels
// sont copiés par RÉFÉRENCE — l'ancien state est jeté juste après, donc pas
// d'aliasing — et surtout PAS via structuredClone/JSON qui perdrait la classe.
// Les objets/arrays de données simples sont clonés en profondeur.
function cloneGrandResetValue(value) {
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Decimal) return value;
  return JSON.parse(JSON.stringify(value));
}

// Construit (sans muter) l'état post-Grand-Reset : un defaultState() frais sur
// lequel on recopie les héritages permanents (GR_PERSISTENT_FIELDS), puis les 2
// champs calculés (grandResetCount, history). Pur (lit le `state` courant) →
// testable hors de la séquence async à dialogue de performGrandReset.
// `gr` = le ou les SCEAUX réclamés (un numéro, ou une liste si le joueur en a
// coché plusieurs) : sert au récit, pas au calcul (le rang, lui, est nextCount).
export function buildGrandResetState(nextCount, gr = nextCount) {
  const fresh = defaultState();
  for (const key of GR_PERSISTENT_FIELDS) {
    if (state[key] !== undefined) fresh[key] = cloneGrandResetValue(state[key]);
  }
  fresh.grandResetCount = nextCount;
  // Les deux bases sont distinctes : l'annonce les sépare (elle mentait sur la
  // moisson dès que GRAND_RESET_PROD_BASE a cessé d'être GRAND_RESET_RUIN_BASE).
  const prodTxt = grandResetProductionMult(nextCount);
  const ruinTxt = grandResetRuinGainMult(nextCount);
  // Le ×4 Ruines est le bonus PROPRE au sceau du Ragnarök (gr 11) : testé sur les
  // SCEAUX réclamés, pas sur le rang du GR — en ordre libre, gr diffère de
  // nextCount. Il s'AJOUTE aux deux courbes au lieu de les remplacer dans le récit
  // (l'ancien texte en ou-exclusif mentait dans les deux sens).
  const seals = Array.isArray(gr) ? gr : [gr];
  const ragnarok = seals.includes(11) ? ", plus x4 Ruines du Ragnarok" : "";
  const prodStr = prodTxt < 10 ? prodTxt.toFixed(1) : prodTxt.toFixed(0);
  fresh.history = [`Grand Reset x${nextCount} : tout a été effacé. Bonus permanent : x${prodStr} production et x${ruinTxt.toFixed(0)} Ruines gagnées${ragnarok}. Les pactes mythiques demeurent.`];
  return fresh;
}

export function markChronicleEntryRead(id) {
  state.chronicleEntries = (state.chronicleEntries || []).map(entry =>
    entry.id === id ? { ...entry, isNew: false } : entry
  );
  save();
  notify();
}
