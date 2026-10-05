"use strict";

import { buildings } from '../data/buildings.js';
import { upgrades, dogmaIds } from '../data/upgrades.js';
import { eras, CRISIS_EVENTS } from '../data/world.js';
import { eraBandOf } from '../data/eraThemes.js';
import { clamp01 } from './utils.js';
import { Decimal, D, parseDecimalString } from './num.js';
import { COLLAPSE_PREP_MAX, POLICY_MAX_ACTIVE, REGUL_LEDGER_MAX, GAMBLE_HISTORY_LEN, STEWARD_MAX_CLAUSES, STEWARD_THRESHOLDS, ICARUS_HISTORY_COLOMBIER, FLIGHTS_MAX_COLOMBIER, SCRATCH_HISTORY_LEN, BLACKJACK_HISTORY_LEN, SLOTS_HISTORY_LEN, ROULETTE_HISTORY_LEN, STYLET_MAX_LEVEL, AUTO_COLLAPSE_MIN_SECONDS, AUTO_ICARUS_TARGET_MIN, AUTO_ICARUS_TARGET_MAX, AUTO_TEMPLE_FAVEUR_FLOOR_DEFAULT, AUTO_STAKE_STEPS, CAISSE_INITIAL, TEMPLE_ARTIFACT_IDS, BOON_INTERVAL_MAX_SEC, CLEPSYDRE_HARD_MAX_SECONDS, MAX_BATCH_AMOUNT, grandResetProductionMult, grandResetRuinGainMult } from './balance.js';
import { resetAnnals } from './annals.js';
import { normalizeUiReveal } from './uiReveal.js';
import { normalizeOlympusState, defaultOlympusState } from '../data/olympus.js';
import { epitaphLegacyById } from '../data/epitaphs.js';
import { newCitySeed } from '../map/procedural/seedManager.js';
import { generateCityName } from '../map/procedural/cityName.js';
import { normalizeRoadMemory } from '../map/roadMemory.js';
import { defaultFaitsDivers, normalizeFaitsDivers } from './faitsDiversState.js';

// La clé vit dans saveKey.js (cloudSave.js doit la lire AVANT l'évaluation de
// ce module — cf. l'en-tête de cloudSave.js) ; ré-exportée ici pour les clients.
import { SAVE_KEY, CURRENT_SAVE_VERSION, stripBom, markLocalSaveUnreadable, isLocalSaveUnreadable, newSaveEpoch, consumeFreshEpochRequest, isFutureSave, saveVersionOf } from './saveKey.js';
import { cloudMirrorSave } from './cloudSave.js';
import { archiveUnreadableSave, archiveFutureSave } from './saveBackups.js';
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
// v5 : lot 1 des gains « vrai casino » — les achats de chances (dés pipés, ailes
// cirées, planches, Coffres, dé d'ivoire, double, refente) sont REMBOURSÉS en Faveur
// et retirés ; les vols offerts deviennent des montants.
// v6 : lot 2 (le rang de la Maison) — les artefacts et automatisations devenus des
// CADEAUX DE RANG sont gardés, et la Faveur qu'ils ont coûtée est rendue.
// v7 : l'échelle de la Faveur — tout ce qui se compte en Faveur passe ×1 000.
// ⚠ À chaque bump : ajouter un champ TÉMOIN de la nouvelle version dans
// inferSaveVersion (plus bas, près de migrate) — c'est lui qui empêche de rejouer
// les migrations sur une save dont saveVersion est abîmée (SAV-11).
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

// La règle « minutes » du Script du Phénix ne descend pas sous le plancher des
// minuteurs d'effondrement (AUTO_COLLAPSE_MIN_SECONDS) — vieilles saves comprises.
export function withAutoCollapseFloor(rules) {
  if (!Array.isArray(rules)) return rules;
  const minMinutes = AUTO_COLLAPSE_MIN_SECONDS / 60;
  for (const r of rules) {
    if (r && r.type === "time" && Number.isFinite(r.threshold)) r.threshold = Math.max(minMinutes, r.threshold);
  }
  return rules;
}

export const defaultAutoScriptRules = () => [
  { id: "rule_rupture", type: "rupture", label: "Effondrer si Rupture atteint", unit: "%", threshold: 80, enabled: false },
  { id: "rule_usure", type: "usure", label: "Effondrer si Usure atteint", unit: "%", threshold: 80, enabled: false },
  { id: "rule_time", type: "time", label: "Effondrer apres", unit: "min", threshold: 10, enabled: false }
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
// la caisse. Cadrans communs des autos de jeu : on/off, plancher de Faveur (gain
// gardé), TEMPO (recueilli/mesuré/fervent — multiplie l'intervalle), MISE (une
// part de la limite de la table : min, ¼, ½, max — lot 1 des gains « vrai
// casino ») ; plus le cadran de RISQUE propre à un jeu (rite, cible).
export const defaultTempleAuto = () => ({
  tronc: { unlocked: false, on: false },
  osselets: { unlocked: false, on: false, rite: "classique", tempo: "mesure", stakeStep: "min", faveurFloor: AUTO_TEMPLE_FAVEUR_FLOOR_DEFAULT, lastAt: 0 },
  icarus: { unlocked: false, on: false, target: 2, tempo: "mesure", stakeStep: "min", faveurFloor: AUTO_TEMPLE_FAVEUR_FLOOR_DEFAULT, lastAt: 0 },
  gratteux: { unlocked: false, on: false, tempo: "mesure", stakeStep: "min", faveurFloor: AUTO_TEMPLE_FAVEUR_FLOOR_DEFAULT, lastAt: 0 },
  vingtetun: { unlocked: false, on: false, tempo: "mesure", stakeStep: "min", faveurFloor: AUTO_TEMPLE_FAVEUR_FLOOR_DEFAULT, lastAt: 0 }
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
  blackjack: { naturals: 0, bestStreak: 0 },
  // La machine à sous (2026-10-03) : séries de tours gratuits, roues, jackpots.
  slots:     { freeSpins: 0, wheels: 0, holdWins: 0, jackpots: 0, biggestJackpot: 0 },
  // La roulette du salon (lot 3 des gains « vrai casino ») : les zéros tombés.
  roulette:  { zeros: 0 },
  // Le duel des grands flambeurs (2026-10-04) : les duels gagnés.
  duel:      { gagnes: 0 },
  // Les courses (2026-10-04) : les outsiders (cote ×10 et plus) gagnés.
  courses:   { outsiders: 0 }
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
    // La roue de la Maison (2026-10-04) : tours pris, plus beau gain.
    roueSpins: 0,
    roueBest: 0,
    biggestPotRaked: 0,
    biggestRuinGain: "0",   // string Decimal
    longestCycleSec: 0,
    mostCrisesInCycle: 0,
    fastestEraGainSec: 0,   // 0 = jamais mesuré
    grTimings: {},          // { [gr]: { discovered:number|null, performed:number|null } }
    mythTimings: {}         // { [mythId]: { at, runSec, order, act } }
  };
}

// Une série de tours gratuits de la machine à sous, ou null. Une mise nulle (save
// trafiquée) ou un compte nul la fait tomber.
function normalizeSlotsFreeSpins(raw) {
  if (!isPlainObject(raw)) return null;
  const left = finiteInteger(raw.left, 0, 0, 999);
  // 1e300 : la Faveur est à l'échelle ×1 000 (2026-10-04) ; le plafond par défaut de
  // finiteNumber (MAX_SAFE_INTEGER, ~9e15) tronquait une fin de partie au rechargement.
  const stakeFaveur = finiteNumber(raw.stakeFaveur, 0, 0, 1e300);
  if (stakeFaveur <= 0 || left <= 0) return null;
  return {
    left,
    stakeFaveur,
    won: finiteNumber(raw.won, 0, 0, 1e300),
    total: finiteInteger(raw.total, left, left, 9999)
  };
}

function normalizeChronicleStats(raw) {
  const def = defaultChronicleStats();
  const s = isPlainObject(raw) ? raw : {};
  const games = {};
  for (const [game, extras] of Object.entries(CHRONICLE_GAME_EXTRAS)) {
    const g = isPlainObject(s.games?.[game]) ? s.games[game] : {};
    // Montants de Faveur : bornés à 1e300, pas à MAX_SAFE_INTEGER (l'échelle ×1 000).
    const out = {
      plays: finiteInteger(g.plays, 0, 0),
      wagered: finiteNumber(g.wagered, 0, 0, 1e300),
      won: finiteNumber(g.won, 0, 0, 1e300),
      biggest: finiteNumber(g.biggest, 0, 0, 1e300)
    };
    for (const key of Object.keys(extras)) out[key] = finiteNumber(g[key], 0, 0, 1e300);
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
    faveurEarned: finiteNumber(s.faveurEarned, 0, 0, 1e300),
    faveurSpentShop: finiteNumber(s.faveurSpentShop, 0, 0, 1e300),
    offeringsCollected: finiteNumber(s.offeringsCollected, 0, 0, 1e300),
    roueSpins: finiteInteger(s.roueSpins, 0, 0),
    roueBest: finiteNumber(s.roueBest, 0, 0, 1e300),
    biggestPotRaked: finiteNumber(s.biggestPotRaked, 0, 0, 1e300),
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
      // Le cadran de mise : une part de la limite de la table (lot 1). Les saves
      // d'avant (stakeId + stakePow des Coffres) repartent à la mise minimale.
      stakeStep: Object.prototype.hasOwnProperty.call(AUTO_STAKE_STEPS, g.stakeStep) ? g.stakeStep : "min",
      // Migration douce des saves d'avant la monnaie fermée : goldFloorS est
      // simplement abandonné, le plancher de Faveur part du défaut. Le plafond du
      // curseur suit les recettes (autoFloorMax) : ici, seulement une borne large.
      faveurFloor: Math.round(finiteNumber(g.faveurFloor, def[key].faveurFloor, 0, 1e300)),
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
      target: finiteNumber(g.target, def.icarus.target, AUTO_ICARUS_TARGET_MIN, AUTO_ICARUS_TARGET_MAX)
    })),
    gratteux: game("gratteux", () => ({})),
    vingtetun: game("vingtetun", () => ({}))
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
// Éteint la pastille « dépêche non lue » : ouvrir la Chronique vaut lecture.
// ⚠ `isNew` était posé à true à la publication (chronicleEvaluator.js) et remis
// à false NULLE PART — la pastille ne s'éteignait donc jamais d'elle-même, elle
// attendait la dépêche suivante. Elle est persistée dans la save, donc la marquer
// lue tient aussi après un rechargement.
// ⚠⚠ ON REMPLACE L'ENTRÉE, ON NE LA MUTE PAS. `useGameState` compare par
// `shallowEqual`, qui rend `true` DÈS QUE les deux références sont identiques
// (useGameState.js:6). Muter `isNew` en place aurait notifié dans le vide : le
// sélecteur `chronicleEntries[0]` aurait rendu le même objet, donc aucun rendu,
// donc une pastille qui reste allumée. C'est ce que vérifie le test.
export const markChronicleRead = () => {
  const entries = state.chronicleEntries || [];
  if (!entries[0]?.isNew) return;
  state.chronicleEntries = [{ ...entries[0], isNew: false }, ...entries.slice(1)];
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
  // `reveal` : le JEU QUI SE DÉVOILE (uiReveal.js) — { [clé]: horodatage } des
  // éléments d'interface déjà montrés dans la toute première partie.
  onboarding: { built: false, pressureSeen: false, collapsed: false, reveal: {} },
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
  // d'écrasement (échec), récupération d'ÉPAULER restante EN TICKS DE JEU (plus
  // une échéance murale, BUG-2). Tout per-cycle.
  atlasFardeau: 0,
  atlasEpaules: 0,
  atlasCrushed: false,
  atlasShoulderCdTicks: 0,
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
  // Chantiers de voirie : 1 achat = 1 chantier (raccord d'un moteur, puis
  // élargissement du tronçon le plus emprunté), avancé par le tick sur
  // l'horloge virtuelle. `roadNext` (prochain chantier proposé) et
  // `roadWidened` (tronçons élargis appliqués) sont écrits par la CARTE,
  // même canal que roadCoverage ; le sim et la boutique ne font que lire.
  roadWorks: { active: null, queue: [] },
  roadNext: null,
  roadWidened: 0,
  // Compteur de chantiers de l'ÈRE courante (rampe de durée) : remis à zéro au
  // changement d'ère par roadWorksEraIndex(), et avec le cycle à l'Effondrement.
  roadWorksEra: { era: 0, count: 0 },
  // Chantiers PRÉPAYÉS en réserve (réseau achevé) : lancés tout seuls par le
  // tick dès que la carte repropose du travail.
  roadWorksBank: 0,
  // Portes réelles écrites par la carte (affichage seul) : bâtiments achetables
  // ayant une rue à leur porte / total brut, cœurs d'îlots murés compris.
  roadDoors: null,
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
  // Réforme de fond : recul DURABLE par foyer [0..FOYER_REFORM_CAP], déposé par
  // les actions de réforme. Ne décline PAS (contrairement à foyerRelief) ; le
  // recul combiné (relief + réforme + politique) est plafonné à FOYER_REFORM_CAP. Remis à zéro à chaque cycle.
  foyerReform: {
    scarcity: 0,
    inequality: 0,
    complexity: 0,
    dissent: 0
  },
  // Dette / recul de foyer déposé par les CRISES narratives (25/50/75 %) : une
  // part ABSOLUE ajoutée au foyer (négative = la crise a été traitée, positive =
  // on en a profité), jusqu'à la chute. Contrairement à l'aiguille de la jauge,
  // c'est la CIBLE qui bouge : le choix se sent tout le cycle. [-1..1], remis à
  // zéro à chaque cycle (cf. pressure.js).
  foyerShift: {
    scarcity: 0,
    inequality: 0,
    complexity: 0,
    dissent: 0
  },
  // Cause de chute DÉCLARÉE par le dernier édit terminal scellé (« choisir sa
  // chute » : exode → famine, archives → temps, ordre → rupture), ou null =
  // cause naturelle (foyer dominant). Remise à null à chaque cycle.
  declaredFallCause: null,
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
  // fermée 2026-07-16), dépensée à la Boutique en Bénédictions, artefacts et reliques.
  // SURVIT aux effondrements (comme les ruines), effacée seulement au Grand
  // Reset (le carburant se re-gagne ; les augments, eux, sont ÉTERNELS — cf.
  // GR_PERSISTENT_FIELDS).
  faveur: 0,
  // LA CAISSE DE LA MAISON (ex-tronc des offrandes) — les recettes de la Maison,
  // plafonnées, calculées à la volée depuis trunkAt (cf. actions/offeringTrunk.js).
  // PLEINE au départ (amorce de jeu) ; survit aux effondrements comme la Faveur ;
  // repart pleine au Grand Reset (ce default). trunkAt = 0 → « pas encore relevée ».
  trunkFaveur: CAISSE_INITIAL,
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
  // La machine à sous — issues des derniers tours ('gain'|'perte'|'tours'|'roue'), et
  // la série de TOURS GRATUITS en cours ({ left, stakeFaveur, won, total } ou
  // null) : elle survit à la fermeture de la machine, pas à l'effondrement.
  slotsHistory: [],
  slotsFreeSpins: null,
  // La roue de la Maison (2026-10-04) : l'heure (ms) du dernier tour, 0 = jamais. Un
  // tour par heure ; survit à l'effondrement, repart à zéro au Grand Reset.
  roueAt: 0,
  // La Nuit du Grand Jeu et le spectacle (2026-10-04, actions/nuitGrandJeu.js) : les
  // heures (ms) de la Nuit en cours ou passée, de la prochaine (0 : pas encore
  // prévue), le flambeur tiré, le compte des Nuits ; la fenêtre du spectacle.
  nuitDebut: 0,
  nuitProchaine: 0,
  nuitFlambeur: 0,
  nuitCompte: 0,
  spectacleDebut: 0,
  spectacleFin: 0,
  // La course qui attend ses paris (actions/courses.js) : six partants { couloir, nom, p }.
  courseField: null,
  // Le videur du vingt-et-un (actions/videur.js) : le soupçon, les dernières mises,
  // l'heure (ms) jusqu'à laquelle la table est fermée au joueur.
  bjSoupcon: 0,
  bjMises: [],
  bjHaut: null,
  bjBas: null,
  bjAverti: false,
  bjBarreJusqua: 0,
  // La roulette du salon (lot 3) : les dernières cases tombées (0-36).
  rouletteHistory: [],
  // Boutique de Faveur — augment ÉTERNEL : survit aux effondrements ET au Grand
  // Reset (cf. GR_PERSISTENT_FIELDS). styletLevel = stylet du gratteux (rayon de
  // grattage, pur confort). Les dés pipés, ailes cirées, planches du graveur et
  // Coffres ont disparu au lot 1 des gains « vrai casino » (migration 4 → 5).
  styletLevel: 0,
  // Faveur rendue par la migration 4 → 5 (achats supprimés), en attente d'être
  // ANNONCÉE au premier tick en ligne (templeAutomation), puis remise à 0.
  maisonRefund: 0,
  // Idem pour la migration 5 → 6 (les cadeaux de rang déjà achetés).
  maisonGiftRefund: 0,
  // LE RANG DE LA MAISON (lot 2, actions/maisonRang.js) : la réputation (perte
  // théorique, en heures de recettes) et le plus haut titre atteint. ÉTERNELS :
  // ni l'effondrement ni le Grand Reset ne les touchent (GR_PERSISTENT_FIELDS).
  maisonReputation: 0,
  maisonRank: 0,
  // Bénédiction — bonus TEMPORAIRE de production (multiplicateur global actif
  // jusqu'à blessingUntil). Effet de run : remis à zéro à l'effondrement.
  blessingUntil: 0,
  blessingMult: 1,
  // Vols d'Icare OFFERTS (mise payée par la Maison) : FILE de MONTANTS (la mise de
  // chaque vol), plafonnée à ICARUS_FREE_FLIGHTS_MAX. Les Coups de Vénus, la roue de
  // la machine et la Vénus des tickets donnent un vol à la mise du coup gagnant.
  // Était une file d'ids de mise, et un entier encore avant — cf. migrateFreeFlights.
  // Reset au cycle.
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
  // Rite de la chute de la crise terminale en cours : rite accompli (used) et son
  // palier (riteTier 0..2, -1 = aucun ; lu par le vœu « Le grand rite »).
  terminalPreparations: {
    used: {},
    riteTier: -1,
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
  // Crises narratives du cycle dont on a PROFITÉ (vœu « L'audace »).
  cycleCrisesProfited: 0,
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
  // Cœur de ville et colonne du pont FIGÉS (docs/PLAN-ROUTES.md, lot L1), dans
  // le repère des slots ; `seed` = mapSeed de la ville qui les a fixés.
  cityCore: null,
  // Réseau de rues MÉMORISÉ (docs/PLAN-ROUTES.md, lot L2, format dans
  // map/roadMemory.js) : la ville part de ses rues d'hier au lieu de les redessiner.
  cityRoads: null,
  // LES RUINES DE LA CITÉ TOMBÉE (docs/PLAN-CHUTE.md) : relevées à la chute, rejouées
  // au cycle suivant dans la même vallée. Relevé : iso/isoChute.js (recordRelics) ;
  // format (v2) : normalizeCityRelics, plus bas.
  cityRelics: null,
  // Seed de génération procédurale de la ville. Gardée d'un cycle à l'autre : la
  // cité suivante naît dans la même vallée (docs/PLAN-CHUTE.md) ; neuve au Grand Reset.
  mapSeed: null,
  // Compteurs "à vie" pour les jalons de merveilles (survivent aux cycles).
  lifetimePurchases: 0,
  playTimeSec: 0,
  // Registre de la Chronique : stats de jeux, économie de Faveur, records et
  // horodatages GR/Mythes — cumul À VIE (survit au Grand Reset, cf.
  // GR_PERSISTENT_FIELDS). Objet plein dès le defaultState : la Chronique le lit
  // directement. Nourri par les recorders de chronicleStats.js.
  chronicleStats: defaultChronicleStats(),
  // Époque de la partie { id, at } : posée par les gestes qui la REMPLACENT
  // (import, emplacement, copie de secours, effacement), lue par l'arbitrage du
  // nuage avant l'horloge à vie (saveKey.js, newSaveEpoch ; SAV-4). null = partie
  // jamais remplacée. ÉTERNELLE (cf. GR_PERSISTENT_FIELDS) : un Grand Reset est un
  // pas de la même partie, pas une autre partie.
  saveEpoch: null,
  // Les faits divers de la carte (docs/PLAN-FAITS-DIVERS.md) : les chapitres vus,
  // le fil de Nancy et William. ÉTERNEL (cf. GR_PERSISTENT_FIELDS) ; forme et
  // normalisation dans faitsDiversState.js, seul enregistreur : faitsDivers.js.
  faitsDivers: defaultFaitsDivers(),
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
  // La chute se joue sur la carte (events.js) : la Cité est montée, quel que soit
  // l'onglet. Transitoire, comme le deuil.
  chute: false,
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

// Plafond des ruines relevées à la chute (map/iso/isoChute.js, recordRelics, qui en
// garde au plus autant). DÉCLARÉ AVANT `state = load()` pour la même raison :
// normalizeCityRelics le lit pendant hydrateState. Plus bas, la première version
// (RELIC_MAX) tombait en TDZ dès qu'une sauvegarde portait des ruines — partie neuve
// au lancement qui suivait la PREMIÈRE chute (cf. chuteRelicsLoad.test.js).
export const RELIC_CAP = 2200;

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
  // 4 -> 5 : lot 1 des gains « vrai casino » (2026-10-04, docs/PLAN-GAINS-CASINO.md).
  // Les achats qui touchaient aux CHANCES disparaissent ; la Faveur qu'ils ont coûtée
  // est REMBOURSÉE, aux derniers prix (écrits ICI : ils n'existent plus ailleurs) —
  // dés pipés 130 × 1,45^n, ailes cirées 90 × 1,8^n, planches du graveur 200 × 1,6^n,
  // Coffres 16 000 × 10^n ; dé d'ivoire 300, le double 1 200, la refente 4 000 (ces
  // deux derniers deviennent des règles de base du vingt-et-un). La Faveur rendue
  // est ANNONCÉE au premier tick en ligne (state.maisonRefund, templeAutomation).
  // Tout est écrit dans le corps : ce code court pendant load(), avant les `const`
  // de module déclarés plus bas (TDZ).
  4: (s) => {
    const paid = (level, base, growth, max) => {
      const n = Math.max(0, Math.min(max, Math.floor(Number(level) || 0)));
      let sum = 0;
      for (let i = 0; i < n; i += 1) sum += Math.round(base * Math.pow(growth, i));
      return sum;
    };
    let refund = paid(s.diceLevel, 130, 1.45, 13) + paid(s.wingLevel, 90, 1.8, 8)
      + paid(s.graveurLevel, 200, 1.6, 10) + paid(s.coffreLevel, 16000, 10, 8);
    if (isPlainObject(s.templeArtifacts)) {
      const arts = { ...s.templeArtifacts };
      const removed = { ivoire: 300, double: 1200, refente: 4000 };
      for (const [id, cost] of Object.entries(removed)) {
        if (arts[id]) { refund += cost; delete arts[id]; }
      }
      s.templeArtifacts = arts;
    }
    delete s.diceLevel;
    delete s.wingLevel;
    delete s.graveurLevel;
    delete s.coffreLevel;
    if (refund > 0) {
      const faveur = Number(s.faveur);
      s.faveur = (Number.isFinite(faveur) && faveur > 0 ? faveur : 0) + refund;
      s.maisonRefund = refund;
    }
  },
  // 5 -> 6 : lot 2, le rang de la Maison. Les artefacts et automatisations devenus
  // des CADEAUX DE RANG ne s'achètent plus : qui les a déjà les garde, et la Faveur
  // qu'ils ont coûtée revient (prix écrits ICI, TDZ comme plus haut). Annoncé au
  // premier tick en ligne (state.maisonGiftRefund, templeAutomation).
  5: (s) => {
    const artifacts = { colombier: 200, mesure: 250, echelle: 350, coin: 240, interdit: 500, solaires: 520, serres: 550 };
    const autos = { osselets: 700, icarus: 350, gratteux: 500, vingtetun: 700 };
    let refund = 0;
    if (isPlainObject(s.templeArtifacts)) {
      for (const [id, cost] of Object.entries(artifacts)) if (s.templeArtifacts[id]) refund += cost;
    }
    if (isPlainObject(s.templeAuto)) {
      for (const [game, cost] of Object.entries(autos)) {
        if (isPlainObject(s.templeAuto[game]) && s.templeAuto[game].unlocked) refund += cost;
      }
    }
    if (refund > 0) {
      const faveur = Number(s.faveur);
      s.faveur = (Number.isFinite(faveur) && faveur > 0 ? faveur : 0) + refund;
      s.maisonGiftRefund = refund;
    }
  },
  // 6 -> 7 : L'ÉCHELLE DE LA FAVEUR (Raph, 2026-10-04 : « on gonfle tous les nombres »).
  // Tout ce qui se compte en Faveur passe ×1 000 (FAVEUR_ECHELLE de balance.js à cette
  // date — écrit ICI en dur : si l'échelle change un jour, ce sera une autre migration).
  // La bourse, la cagnotte, la caisse, les vols offerts, la série de tours gratuits,
  // les réserves des automatisations, les remboursements en attente et les compteurs
  // de Faveur de la Chronique ; la réputation (en heures) ne bouge pas.
  6: (s) => {
    const K = 1000;
    const scale = (v) => {
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? n * K : v;
    };
    for (const f of ["faveur", "icarusPotFaveur", "trunkFaveur", "maisonRefund", "maisonGiftRefund"]) {
      if (s[f] != null) s[f] = scale(s[f]);
    }
    // Vols offerts : un tableau de montants (ou d'anciens ids de mise), ou un entier
    // de plumes (format d'avant le lot 1 : 4 Faveur la plume).
    const legacy = { plume: 4, aile: 10, hecatombe: 25 };
    if (Array.isArray(s.icarusFreeFlights)) {
      s.icarusFreeFlights = s.icarusFreeFlights.map((v) => (typeof v === "string" ? (legacy[v] || 0) * K : scale(v)));
    } else if (Number.isFinite(Number(s.icarusFreeFlights)) && Number(s.icarusFreeFlights) > 0) {
      s.icarusFreeFlights = new Array(Math.min(8, Math.floor(Number(s.icarusFreeFlights)))).fill(legacy.plume * K);
    }
    if (isPlainObject(s.slotsFreeSpins)) {
      s.slotsFreeSpins = { ...s.slotsFreeSpins, stakeFaveur: scale(s.slotsFreeSpins.stakeFaveur), won: scale(s.slotsFreeSpins.won) };
    }
    if (isPlainObject(s.templeAuto)) {
      const auto = { ...s.templeAuto };
      for (const g of Object.keys(auto)) {
        if (isPlainObject(auto[g]) && auto[g].faveurFloor != null) auto[g] = { ...auto[g], faveurFloor: scale(auto[g].faveurFloor) };
      }
      s.templeAuto = auto;
    }
    if (isPlainObject(s.chronicleStats)) {
      const cs = { ...s.chronicleStats };
      for (const f of ["faveurEarned", "faveurSpentShop", "offeringsCollected", "biggestPotRaked"]) {
        if (cs[f] != null) cs[f] = scale(cs[f]);
      }
      if (isPlainObject(cs.games)) {
        const games = {};
        for (const [id, g] of Object.entries(cs.games)) {
          if (!isPlainObject(g)) { games[id] = g; continue; }
          const out = { ...g };
          for (const f of ["wagered", "won", "biggest", "biggestJackpot"]) if (out[f] != null) out[f] = scale(out[f]);
          games[id] = out;
        }
        cs.games = games;
      }
      s.chronicleStats = cs;
    }
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
    // Le TERROIR mémorise ses parcelles ([dx, dy, w, h], layout.js) et le port de la
    // grève sa hauteur (sy) : jetés ici, champs et moulins se refondaient à chaque
    // rechargement (F5, import, nuage) — la mémoire de placement ne tenait qu'en session.
    const parcels = normalizeSlotParcels(slot.parcels);
    if (parcels) out[key].parcels = parcels;
    const sy = Number(slot.sy);
    if (Number.isInteger(sy) && sy >= 1 && sy <= 8) out[key].sy = sy;
  }
  return out;
}

function normalizeSlotParcels(raw) {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 8) return null;
  const out = [];
  for (const q of raw) {
    if (!Array.isArray(q) || q.length !== 4 || !q.every((v) => Number.isFinite(Number(v)))) return null;
    const [dx, dy, w, h] = q.map((v) => Math.round(Number(v)));
    if (Math.abs(dx) > 400 || Math.abs(dy) > 400 || w < 1 || h < 1 || w > 24 || h > 24) return null;
    out.push([dx, dy, w, h]);
  }
  return out;
}

export function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

// Équivalent de finiteNumber pour les champs migrés en Decimal : accepte un
// Decimal, un number ou une string sérialisée ("1.5e+30"), borne à >= 0, et
// surtout NE clampe PAS à 2^53 (c'était le plafond caché du chargement).
// Une chaîne non numérique ou infinie retombe au défaut (parseDecimalString) :
// `new Decimal("abc")` LEVAIT, et jetait la partie entière (SAV-3).
export function decimalField(value, fallback) {
  const candidate =
    value instanceof Decimal ? value
      : typeof value === "number" && Number.isFinite(value) ? new Decimal(value)
      : typeof value === "string" && value ? parseDecimalString(value)
      // Decimal déshydraté en objet plat {mantissa, exponent} (save édité/importé
      // à la main) : D() sait le reconstruire — comme toNum/D le défendent déjà —
      // au lieu de le remettre silencieusement au défaut.
      : (value !== null && typeof value === "object"
          && typeof value.mantissa === "number" && typeof value.exponent === "number")
        ? D(value)
      : null;
  if (!candidate || !Number.isFinite(candidate.mantissa) || !Number.isFinite(candidate.exponent)
    || candidate.exponent >= 9e15) {
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

// Vols d'Icare offerts : FILE de MONTANTS (la mise de chaque vol) depuis le lot 1
// des gains « vrai casino » (2026-10-04, mise libre). MIGRATIONS : une file d'ids
// de mise (2026-07-17 → 2026-10-03) devient la file de leurs anciennes mises
// (plume 4, aile 10, hécatombe 25) ; un ENTIER (avant le 2026-07-17) = N plumes.
// Défensif dans les deux sens (save trafiquée, id inconnu, longueur, NaN).
// ⚠ TDZ : hydrateState l'appelle pendant load(), qui court AVANT cette ligne. Une
// déclaration de fonction est hoistée, un `const` de module ne l'est pas — d'où la
// table d'anciennes mises écrite DANS le corps (sinon : save jugée corrompue).
export function migrateFreeFlights(source) {
  const FREE_FLIGHT_LEGACY_STAKES = { plume: 4, aile: 10, hecatombe: 25 };
  if (Array.isArray(source)) {
    // Tronqué au plafond STATIQUE le plus haut (colombier) : à l'hydratation on ne
    // sait pas encore si l'artefact est possédé, et grantFreeFlight ré-applique le
    // plafond vivant de toute façon. Tronquer à 5 mangerait les billets d'une save
    // au colombier plein.
    const out = [];
    for (const v of source) {
      const amount = typeof v === "string" ? (FREE_FLIGHT_LEGACY_STAKES[v] || 0) : Math.floor(finiteNumber(v, 0, 0, 1e300));
      if (amount >= 1) out.push(amount);
    }
    return out.slice(0, FLIGHTS_MAX_COLOMBIER);
  }
  // Ancien format : un entier (des plumes).
  const n = finiteInteger(source, 0, 0, FLIGHTS_MAX_COLOMBIER);
  return new Array(n).fill(FREE_FLIGHT_LEGACY_STAKES.plume);
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

// ── Chantiers de voirie ─────────────────────────────────────────────────────
// Un chantier = { kind: "link"|"widen", tiles, targetId?, toRank?, total, left }.
// `left` avance dans le tick (horloge virtuelle) ; la file est courte (borne
// large à 8 par sécurité, la vraie limite d'achat est ROAD_WORK_QUEUE_MAX).
function normalizeRoadWork(raw) {
  if (!isPlainObject(raw)) return null;
  const tiles = finiteNumber(raw.tiles, 0, 1, 4096);
  const total = finiteNumber(raw.total, 0, 1, 86400);
  if (!(tiles > 0) || !(total > 0)) return null;
  return {
    kind: raw.kind === "widen" ? "widen" : "link",
    tiles,
    targetId: typeof raw.targetId === "string" ? raw.targetId.slice(0, 64) : null,
    toRank: raw.toRank === "avenue" || raw.toRank === "main" ? raw.toRank : null,
    total,
    left: finiteNumber(raw.left, total, 0, total)
  };
}

export function normalizeRoadWorks(raw) {
  const source = isPlainObject(raw) ? raw : {};
  const queue = Array.isArray(source.queue)
    ? source.queue.map(normalizeRoadWork).filter(Boolean).slice(0, 8)
    : [];
  return { active: normalizeRoadWork(source.active), queue };
}

// Prochain chantier proposé (écrit par la carte, comme roadCoverage) : lisible
// même hors-carte pour que la boutique affiche un prix dès le chargement.
export function normalizeRoadNext(raw) {
  if (!isPlainObject(raw)) return null;
  const tiles = finiteNumber(raw.tiles, 0, 1, 65536);
  if (raw.kind === "done") return { kind: "done", tiles: 0, count: 0, targetId: null, toRank: null };
  if (!(tiles > 0)) return null;
  return {
    kind: raw.kind === "widen" ? "widen" : "link",
    tiles,
    // Vague de raccord : nombre de bâtiments servis par ce chantier (≥ 1).
    count: finiteInteger(raw.count, 1, 1, 4096),
    targetId: typeof raw.targetId === "string" ? raw.targetId.slice(0, 64) : null,
    // "twin" = doubler un boulevard en autoroute (voie jumelle creusée).
    toRank: raw.toRank === "avenue" || raw.toRank === "main" || raw.toRank === "twin" ? raw.toRank : null
  };
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
      timeSeconds: finiteInteger(ac.timeSeconds, fac.timeSeconds, AUTO_COLLAPSE_MIN_SECONDS, 24 * 3600),
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

// Comme normalizeFoyerRelief, mais SIGNÉ : une crise peut creuser (+) ou
// combler (−) un foyer.
export function normalizeFoyerShift(raw, fallback) {
  const source = isPlainObject(raw) ? raw : {};
  const out = {};
  for (const key of Object.keys(fallback)) {
    out[key] = finiteNumber(source[key], fallback[key], -1, 1);
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
    used,
    riteTier: finiteInteger(source.riteTier, fallback.riteTier ?? -1, -1, 2)
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
    peakEra: finiteInteger(raw.peakEra, 0, 0, 100000),
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
  return { offered, chosen, done: Boolean(raw.done), broken: Boolean(raw.broken) };
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

// Cœur et pont figés (lot L1 de docs/PLAN-ROUTES.md). Bornes larges : la grille
// plafonne à 360, un décalage au-delà ne peut venir que d'une save abîmée.
// Ruines de la cité tombée (map/iso/isoChute.js, recordRelics), format v2 :
// { v: 2, seed, keys: [clé d'image], forms: [[k, sx, sy, x, y, w, h]], items: [dx, dy, f, dx, dy, f, …] }.
// Une FORME est une ruine dessinée : clé d'image, emprise, cadre écran au zoom 1
// relatif au coin nord de la case. Les maisons d'un même modèle, de même emprise et
// tournées du même côté vers la rue ont la même : un item ne garde que sa case
// (relative au centre de grille) et le numéro de sa forme, en triplets à plat. Le
// cadre est en CENTIÈMES de pixel, entiers — la précision du v1, au bit près (x / 100
// rend le nombre que le v1 arrondissait au centième). L'ORDRE des items est celui du
// relevé : à profondeur égale (même diagonale, pièces d'une même scène), le tri du
// peintre est stable, c'est lui qui fait l'ordre de dessin. Une ruine de scène
// moteur (clé « p|… ») est un monument : jamais arasée.
// (Le v1 — { v: 1, seed, n, keys, items: [[dx, dy, sx, sy, k, x, y, w, h, monument]] },
// cadre en flottants — pesait ~108 Ko au plafond, resérialisés à chaque autosave :
// il est converti au chargement. Audit du 05/10, CHUTE-14.)
// Une forme abîmée ne casse rien : pas de ruines, voilà tout. Les BORNES comptent
// autant que la forme : la carte parcourt sx × sy cases par ruine (relicsFor), une
// emprise de 1e6 la figerait à chaque lancement. Case relative au centre de grille
// (±400, comme le cœur), emprise de 1 à 16 cases, cadre écran au zoom 1 (les plus
// grandes scènes font quelques centaines de pixels).
// ⚠⚠ TDZ : tourne PENDANT `export let state = load()` — RELIC_CAP est déclaré
// au-dessus de cette ligne-là ; ne rien lire d'autre qui soit déclaré plus bas.
export function normalizeCityRelics(raw) {
  if (!isPlainObject(raw) || !Array.isArray(raw.keys) || !Array.isArray(raw.items)) return null;
  // Le relevé v1 nommait les clés AVANT de tronquer au plafond : il peut en rester plus que d'items.
  if (raw.keys.length > RELIC_CAP * 2 || !raw.keys.every((k) => typeof k === "string" && k.length <= 160)) return null;
  // Une ruine dépliée : [dx, dy, sx, sy, clé, x, y, w, h], cadre en centièmes de pixel.
  const entries = [];
  if (raw.v === 1) {
    for (const it of raw.items.slice(0, RELIC_CAP)) {
      if (!Array.isArray(it) || it.length !== 10) continue;
      const v = it.map(Number);
      if (!v.every(Number.isFinite)) continue;
      entries.push([v[0], v[1], v[2], v[3], raw.keys[v[4]],
        Math.round(v[5] * 100), Math.round(v[6] * 100), Math.round(v[7] * 100), Math.round(v[8] * 100)]);
    }
  } else if (raw.v === 2) {
    if (!Array.isArray(raw.forms) || raw.forms.length > RELIC_CAP) return null;
    const forms = raw.forms.map((f) => {
      if (!Array.isArray(f) || f.length !== 7) return null;
      const v = f.map(Number);
      return v.every(Number.isFinite) ? v : null;
    });
    const end = Math.min(raw.items.length, RELIC_CAP * 3);
    for (let i = 0; i + 2 < end; i += 3) {
      const fi = raw.items[i + 2];
      const f = Number.isInteger(fi) ? forms[fi] : null;
      if (!f) continue;
      entries.push([Number(raw.items[i]), Number(raw.items[i + 1]), f[1], f[2], raw.keys[f[0]], f[3], f[4], f[5], f[6]]);
    }
  } else {
    return null;
  }
  const kept = entries.filter(relicEntryOk);
  if (!kept.length) return null;
  const seed = Number(raw.seed);
  return packCityRelics(Number.isFinite(seed) ? seed >>> 0 : 0, kept);
}
// Bornes d'une ruine dépliée (cf. normalizeCityRelics) ; cadre en centièmes de pixel.
function relicEntryOk(e) {
  const [dx, dy, sx, sy, k, x, y, w, h] = e;
  if (typeof k !== "string" || ![dx, dy, sx, sy, x, y, w, h].every(Number.isFinite)) return false;
  if (Math.abs(dx) > 400 || Math.abs(dy) > 400 || sx < 1 || sx > 16 || sy < 1 || sy > 16) return false;
  return Math.abs(x) <= 409600 && Math.abs(y) <= 409600 && w >= 0 && w <= 409600 && h >= 0 && h <= 409600;
}
// Range des ruines dépliées ([dx, dy, sx, sy, clé, x, y, w, h], cadre en centièmes de
// pixel entiers) au format v2, DANS L'ORDRE reçu : clés et formes numérotées à leur
// première apparition, seules celles qui servent sont gardées. Partagé par le relevé
// de la carte (recordRelics) et la conversion du v1 : une sauvegarde rechargée se
// range à l'identique.
export function packCityRelics(seed, entries) {
  const keys = [], keyIdx = new Map(), forms = [], formIdx = new Map(), items = [];
  for (const [dx, dy, sx, sy, k, x, y, w, h] of entries) {
    let ki = keyIdx.get(k);
    if (ki === undefined) { ki = keys.length; keys.push(k); keyIdx.set(k, ki); }
    const fk = ki + "," + sx + "," + sy + "," + x + "," + y + "," + w + "," + h;
    let fi = formIdx.get(fk);
    if (fi === undefined) { fi = forms.length; forms.push([ki, sx, sy, x, y, w, h]); formIdx.set(fk, fi); }
    items.push(dx, dy, fi);
  }
  return { v: 2, seed, keys, forms, items };
}

export function normalizeCityCore(raw) {
  if (!isPlainObject(raw)) return null;
  const seed = Number(raw.seed), dx = Number(raw.dx), dy = Number(raw.dy), bx = Number(raw.bx);
  if (![seed, dx, dy, bx].every(Number.isFinite)) return null;
  if (Math.abs(dx) > 400 || Math.abs(dy) > 400 || Math.abs(bx) > 400) return null;
  // Merveilles figées à leur première pose : { id: [dx, dy] }.
  const wonders = {};
  if (isPlainObject(raw.wonders)) {
    for (const [id, pos] of Object.entries(raw.wonders).slice(0, 64)) {
      if (!/^[a-z0-9_]+$/i.test(id) || !Array.isArray(pos) || pos.length !== 2) continue;
      const wx = Number(pos[0]), wy = Number(pos[1]);
      if (Number.isFinite(wx) && Number.isFinite(wy) && Math.abs(wx) <= 400 && Math.abs(wy) <= 400) wonders[id] = [Math.round(wx), Math.round(wy)];
    }
  }
  // Structure de ville (map/cityQuarters.js) : place centrale, quartiers fondés,
  // grands ensembles civiques, taille maximale de grille. ⚠ Tout champ ajouté à
  // la fiche DOIT passer ici : la normalisation reconstruit l'objet, un champ
  // oublié disparaît au rechargement — la ville refonderait ses quartiers ailleurs.
  const pos2 = (v) => Array.isArray(v) && v.length === 2 && v.every((n) => Number.isFinite(Number(n)) && Math.abs(Number(n)) <= 400)
    ? [Math.round(Number(v[0])), Math.round(Number(v[1]))] : null;
  const central = pos2(raw.central);
  const quarters = {};
  if (isPlainObject(raw.quarters)) {
    for (const [key, q] of Object.entries(raw.quarters).slice(0, 400)) {
      if (!/^[a-z0-9:_-]+$/i.test(key) || !isPlainObject(q)) continue;
      const qdx = Number(q.dx), qdy = Number(q.dy);
      if (!Number.isFinite(qdx) || !Number.isFinite(qdy) || Math.abs(qdx) > 400 || Math.abs(qdy) > 400) continue;
      quarters[key] = { dx: Math.round(qdx), dy: Math.round(qdy), kind: typeof q.kind === "string" ? q.kind.slice(0, 20) : "habitat", site: q.site ? 1 : 0 };
    }
  }
  const districts = {};
  if (isPlainObject(raw.districts)) {
    for (const [n, v] of Object.entries(raw.districts).slice(0, 400)) {
      const pv = pos2(v);
      if (/^[0-9]+$/.test(n) && pv) districts[n] = pv;
    }
  }
  const maxN = Number.isFinite(Number(raw.maxN)) ? Math.max(0, Math.min(400, Math.floor(Number(raw.maxN)))) : 0;
  const out = { seed: seed >>> 0, dx, dy, bx: Math.round(bx), wonders, quarters, districts, maxN };
  if (central) out.central = central;
  const ports = normalizeCityPorts(raw.ports);
  if (ports) out.ports = ports;
  // La ville par îlots (docs/PLAN-ILOTS.md) : sa PRÉSENCE dit que la
  // réorganisation unique a eu lieu — perdue au rechargement, la ville se
  // réorganiserait à chaque partie ouverte.
  const ilot = normalizeCityIlot(raw.ilot);
  if (ilot) out.ilot = ilot;
  return out;
}

// Fiche d'îlots : la LISTE des îlots ouverts ("i:j", dans l'ordre d'ouverture), le
// rôle des places ("i:j" → sorte), l'îlot de chaque halle, le lot de chaque atelier
// ([dx, dy] depuis le centre de grille). Clés de slot "cycle:bâtiment:index". Une
// entrée abîmée est oubliée (l'îlot ou le bâtiment se reposera).
// ⚠⚠ TDZ : cette fonction tourne PENDANT `export let state = load()` (hydrateState →
// normalizeCityCore). Une constante de module déclarée sous cette ligne n'existe pas
// encore à ce moment-là : la lecture jette et la sauvegarde part en « illisible »
// (vécu au premier essai). Tout ce dont elle a besoin est donc LOCAL.
function normalizeCityIlot(raw) {
  if (!isPlainObject(raw)) return null;
  const ILOT_KEY = /^-?[0-9]+:-?[0-9]+$/;
  const ILOT_PLAZA_KINDS = new Set(["centrale", "marche", "jardin", "parvis"]);
  const blocks = Array.isArray(raw.blocks) ? [...new Set(raw.blocks.filter((k) => typeof k === "string" && ILOT_KEY.test(k)))].slice(0, 4000) : [];
  const plazas = {};
  if (isPlainObject(raw.plazas)) {
    for (const [k, v] of Object.entries(raw.plazas).slice(0, 1000)) if (ILOT_KEY.test(k) && ILOT_PLAZA_KINDS.has(v)) plazas[k] = v;
  }
  const halls = {}, annexes = {};
  if (isPlainObject(raw.halls)) {
    for (const [k, v] of Object.entries(raw.halls).slice(0, 2000)) {
      if (/^[0-9]+:[a-z0-9_]+:[0-9]+$/i.test(k) && typeof v === "string" && ILOT_KEY.test(v)) halls[k] = v;
    }
  }
  if (isPlainObject(raw.annexes)) {
    for (const [k, v] of Object.entries(raw.annexes).slice(0, 4000)) {
      if (!/^[0-9]+:[a-z0-9_]+:[0-9]+$/i.test(k) || !Array.isArray(v) || v.length !== 2) continue;
      const gx = Number(v[0]), gy = Number(v[1]);
      if (Number.isFinite(gx) && Number.isFinite(gy) && Math.abs(gx) <= 400 && Math.abs(gy) <= 400) annexes[k] = [Math.round(gx), Math.round(gy)];
    }
  }
  // `v` : version de la fiche (layout.js ILOT_MEMORY_V) — la perdre au chargement
  // replacerait les maisons à chaque rechargement.
  const v = Number.isInteger(raw.v) && raw.v >= 1 && raw.v <= 99 ? raw.v : 1;
  return { v, blocks, plazas, halls, annexes };
}

// Les deux ports figés à leur fondation (docs/PLAN-PORTS.md, map/portSites.js) :
// le BASSIN du vieux port { dx, dy, w, h } et le terre-plein de COMMERCE
// { dx, len, side, depth, edge: [dy par colonne] }, relatifs au centre de grille.
// Un port refusé par les bornes est oublié : il se refondera, plutôt que de
// relire une emprise abîmée.
function normalizeCityPorts(raw) {
  if (!isPlainObject(raw)) return null;
  const int = (v, lo, hi) => { const n = Number(v); return Number.isFinite(n) && n >= lo && n <= hi ? Math.round(n) : null; };
  const out = {};
  const o = raw.old;
  if (isPlainObject(o)) {
    const b = { dx: int(o.dx, -400, 400), dy: int(o.dy, -400, 400), w: int(o.w, 2, 40), h: int(o.h, 1, 40) };
    if (Object.values(b).every((v) => v !== null)) out.old = b;
  }
  const t = raw.trade;
  if (isPlainObject(t) && Array.isArray(t.edge)) {
    const b = { dx: int(t.dx, -400, 400), len: int(t.len, 2, 60), depth: int(t.depth, 1, 20), side: t.side === "N" ? "N" : t.side === "S" ? "S" : null };
    const edge = t.edge.slice(0, 60).map((v) => int(v, -400, 400));
    if (Object.values(b).every((v) => v !== null) && edge.length === b.len && edge.every((v) => v !== null)) out.trade = { ...b, edge };
  }
  return Object.keys(out).length ? out : null;
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

// Version déduite du CONTENU (audit 2026-10-05, SAV-11) : le plus récent « champ
// témoin » présent. Un témoin est un champ né avec une version et que hydrateState
// écrit dans TOUTE save depuis : une save qui le porte a donc déjà passé les
// migrations jusque-là, quoi que dise saveVersion. ⚠ À chaque bump de
// CURRENT_SAVE_VERSION, ajouter un témoin de la nouvelle version (en tête).
// Déclaration de fonction (hoistée), table dans le corps : tourne pendant load().
function inferSaveVersion(save) {
  const witnesses = [
    [7, "roueAt"], // la roue de la Maison, livrée avec l'échelle ×1 000 de la Faveur
    [6, "maisonRank"], // le rang de la Maison
    [6, "maisonReputation"],
  ];
  for (const [version, key] of witnesses) if (key in save) return version;
  return 0;
}

// Version de DÉPART des migrations. saveVersion n'est plus crue sur parole (SAV-11) :
// absente ou abîmée (null, « abc », 7.0001, {}), elle valait 0 et les migrations
// 5 et 6 — qui ne sont pas idempotentes — rejouaient sur une save déjà migrée :
// Faveur ×1 000, cadeaux de rang rendus deux fois. Négative, la boucle comptait
// jusqu'à 0 (−1e9 : 5 minutes de page figée, −1e12 : jamais) à chaque lancement.
// Le témoin sert de PLANCHER : on ne repart jamais sous ce que la save porte déjà.
// La convention « absente = v0 » reste vraie pour les vraies vieilles saves, qui
// ne peuvent porter aucun témoin. Exportée pour les tests.
export function resolveSaveVersion(save) {
  const declared = saveVersionOf(save); // entier ou NaN (saveKey.js)
  const start = declared >= 0 ? Math.min(declared, CURRENT_SAVE_VERSION) : 0;
  return Math.max(start, inferSaveVersion(save));
}

// Amène un objet de sauvegarde brut (fraîchement parsé) jusqu'à
// CURRENT_SAVE_VERSION en appliquant les migrations dans l'ordre.
// Travaille sur une copie superficielle pour ne pas muter l'entrée.
export function migrate(raw) {
  const save = isPlainObject(raw) ? { ...raw } : {};
  let version = resolveSaveVersion(save);
  // Save plus récent que ce build (downgrade) : on ne tente rien d'autre que
  // de le ramener au schéma courant ; hydrateState ignorera les champs inconnus.
  // C'est une PERTE si on la réécrit : load() suspend alors l'écriture, et
  // l'import comme les emplacements la refusent (isFutureSave, SAV-6).
  while (version < CURRENT_SAVE_VERSION) {
    const step = MIGRATIONS[version];
    if (step) step(save);
    version += 1;
  }
  save.saveVersion = CURRENT_SAVE_VERSION;
  return save;
}

// Époque de la partie (saveKey.js, newSaveEpoch) : { id, at } ou null. Une époque
// abîmée retombe à null — la plus ancienne, qui ne gagne jamais un arbitrage par
// erreur. Déclaration de fonction (hoistée) : hydrateState tourne pendant load().
function normalizeSaveEpoch(raw) {
  if (!isPlainObject(raw)) return null;
  const id = typeof raw.id === "string" ? raw.id.slice(0, 64) : "";
  const at = Number(raw.at);
  if (!id || !Number.isFinite(at) || at < 0) return null;
  return { id, at };
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
      collapsed: Boolean(source.onboarding?.collapsed),
      // Une sauvegarde d'avant le dévoilement n'en a pas : {} — sans effet hors
      // de la toute première partie (tout y est visible), et dans une première
      // partie en cours le premier tick re-dévoile ce qui est déjà acquis.
      reveal: normalizeUiReveal(source.onboarding?.reveal)
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
    // Récupération d'ÉPAULER en ticks de jeu, entier de 0 à 15 (= ATLAS_SHOULDER_CD_TICKS
    // de data/myths.js, écrit en dur : pas d'import ici, TDZ). Gardée au reload — sinon
    // F5 ré-armerait le bouton. Une save d'avant (BUG-2) portait l'échéance MURALE
    // atlasShoulderCdEnd : convertie en ticks restants.
    atlasShoulderCdTicks: source.atlasShoulderCdTicks != null
      ? finiteInteger(source.atlasShoulderCdTicks, 0, 0, 15)
      : finiteInteger(Math.ceil((Number(source.atlasShoulderCdEnd) - Date.now()) / 1000), 0, 0, 15),
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
    autoScriptRules: withAutoCollapseFloor(normalizeRuleList(source.autoScriptRules, defaultAutoScriptRules(), 1, 9999)),
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
    chute: false,
    activeEpitaphLegacy: normalizeEpitaphLegacy(source.activeEpitaphLegacy),
    nextEpitaphLegacy: normalizeEpitaphLegacy(source.nextEpitaphLegacy),
    testamentLegacyId: typeof source.testamentLegacyId === "string" && epitaphLegacyById(source.testamentLegacyId)
      ? source.testamentLegacyId
      : null,
    instability: clamp01(finiteNumber(source.instability, base.instability)),
    // Couverture routière : persiste le dernier calcul de la carte (l'offline au
    // chargement applique ainsi le bonus routes d'avant-fermeture).
    roadCoverage: clamp01(finiteNumber(source.roadCoverage, base.roadCoverage)),
    roadWorks: normalizeRoadWorks(source.roadWorks),
    roadNext: normalizeRoadNext(source.roadNext),
    roadWidened: finiteInteger(source.roadWidened, base.roadWidened, 0, 9999),
    roadWorksEra: isPlainObject(source.roadWorksEra)
      ? { era: finiteInteger(source.roadWorksEra.era, 0, 0, 999), count: finiteInteger(source.roadWorksEra.count, 0, 0, 9999) }
      : { era: 0, count: 0 },
    roadWorksBank: finiteInteger(source.roadWorksBank, 0, 0, 999),
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
    foyerShift: normalizeFoyerShift(source.foyerShift, base.foyerShift),
    declaredFallCause: ["famine", "time", "rupture", "avarice"].includes(source.declaredFallCause) ? source.declaredFallCause : null,
    activePolicies: normalizeStringArray(source.activePolicies, POLICY_MAX_ACTIVE, 40),
    regulFatigue: finiteNumber(source.regulFatigue, base.regulFatigue, 0, 1),
    regulLedger: normalizeRegulLedger(source.regulLedger),
    gambleHistory: normalizeGambleHistory(source.gambleHistory),
    stewardClauses: normalizeStewardClauses(source.stewardClauses),
    // 1e300 et non MAX_SAFE_INTEGER : la Faveur est à l'échelle ×1 000 (2026-10-04).
    faveur: finiteNumber(source.faveur, base.faveur, 0, 1e300),
    // Tronc des offrandes : une save d'avant le tronc le découvre PLEIN (base),
    // l'amorce vaut aussi pour les migrations.
    trunkFaveur: finiteNumber(source.trunkFaveur, base.trunkFaveur, 0, 1e300),
    trunkAt: finiteTimestamp(source.trunkAt, 0),
    icarusPotFaveur: finiteNumber(source.icarusPotFaveur, base.icarusPotFaveur, 0, 1e300),
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
    slotsHistory: Array.isArray(source.slotsHistory)
      ? source.slotsHistory.filter((v) => typeof v === "string").slice(-SLOTS_HISTORY_LEN)
      : [],
    rouletteHistory: Array.isArray(source.rouletteHistory)
      ? source.rouletteHistory.filter((v) => Number.isInteger(v) && v >= 0 && v <= 36).slice(-ROULETTE_HISTORY_LEN)
      : [],
    slotsFreeSpins: normalizeSlotsFreeSpins(source.slotsFreeSpins),
    roueAt: finiteNumber(source.roueAt, 0, 0, 1e15),
    courseField: Array.isArray(source.courseField) && source.courseField.length === 6
      && source.courseField.every((x) => x && Number.isInteger(x.couloir) && typeof x.nom === "string" && Number(x.p) > 0 && Number(x.p) < 1)
      ? source.courseField.map((x) => ({ couloir: x.couloir, nom: x.nom, p: Number(x.p) }))
      : null,
    bjSoupcon: finiteNumber(source.bjSoupcon, 0, 0, 100),
    bjMises: Array.isArray(source.bjMises) ? source.bjMises.map(Number).filter((x) => Number.isFinite(x) && x > 0 && x < 1e300).slice(-12) : [],
    bjHaut: source.bjHaut && Number(source.bjHaut.n) > 0 && Number.isFinite(Number(source.bjHaut.m)) ? { m: Number(source.bjHaut.m), n: Math.floor(Number(source.bjHaut.n)) } : null,
    bjBas: source.bjBas && Number(source.bjBas.n) > 0 && Number.isFinite(Number(source.bjBas.m)) ? { m: Number(source.bjBas.m), n: Math.floor(Number(source.bjBas.n)) } : null,
    bjAverti: source.bjAverti === true,
    bjBarreJusqua: finiteNumber(source.bjBarreJusqua, 0, 0, 1e15),
    nuitDebut: finiteNumber(source.nuitDebut, 0, 0, 1e15),
    nuitProchaine: finiteNumber(source.nuitProchaine, 0, 0, 1e15),
    nuitFlambeur: finiteInteger(source.nuitFlambeur, 0, 0, 99),
    nuitCompte: finiteInteger(source.nuitCompte, 0, 0),
    spectacleDebut: finiteNumber(source.spectacleDebut, 0, 0, 1e15),
    spectacleFin: finiteNumber(source.spectacleFin, 0, 0, 1e15),
    // MIGRATIONS : entier (N plumes) → file d'ids → file de MONTANTS (lot 1). Les
    // ids inconnus et les montants invalides tombent, puis la file est tronquée.
    icarusFreeFlights: migrateFreeFlights(source.icarusFreeFlights),
    styletLevel: finiteInteger(source.styletLevel, 0, 0, STYLET_MAX_LEVEL),
    maisonRefund: finiteNumber(source.maisonRefund, 0, 0, 1e300),
    maisonGiftRefund: finiteNumber(source.maisonGiftRefund, 0, 0, 1e300),
    maisonReputation: finiteNumber(source.maisonReputation, 0, 0, 1e12),
    maisonRank: finiteInteger(source.maisonRank, 0, 0, 4),
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
    cycleCrisesProfited: finiteInteger(source.cycleCrisesProfited, 0, 0),
    lastCollapsedBuildings: normalizeNumberMap(source.lastCollapsedBuildings, buildingIds, {}, true),
    vestiges: normalizeVestiges(source.vestiges),
    wonders: normalizeStringArray(source.wonders, 64, 80),
    wonderTiers: normalizeWonderTiers(source.wonderTiers),
    cityMapSlots: normalizeCityMapSlots(source.cityMapSlots),
    riverWP: normalizeRiverWaypoints(source.riverWP),
    cityArchetype: typeof source.cityArchetype === "string" && /^[a-z]+$/.test(source.cityArchetype) ? source.cityArchetype : null,
    cityCore: normalizeCityCore(source.cityCore),
    cityRoads: normalizeRoadMemory(source.cityRoads),
    cityRelics: normalizeCityRelics(source.cityRelics),
    mapSeed: Number.isFinite(source.mapSeed) && source.mapSeed > 0 ? Math.floor(source.mapSeed) >>> 0 : null,
    lifetimePurchases: finiteInteger(source.lifetimePurchases, 0, 0),
    playTimeSec: finiteNumber(source.playTimeSec, 0, 0),
    chronicleStats: normalizeChronicleStats(source.chronicleStats),
    saveEpoch: normalizeSaveEpoch(source.saveEpoch),
    faitsDivers: normalizeFaitsDivers(source.faitsDivers),
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

// Hydrate un objet de sauvegarde. Si hydrateState lève, REPLI CHAMP PAR CHAMP
// (audit 2026-10-05, SAV-3) : l'hydratation reconstruit ~100 champs d'un seul
// bloc, et une seule exception — une régression de normaliseur livrée par une
// mise à jour, le piège TDZ déjà vécu deux fois — jetait TOUTE la partie. On
// garde alors tous les champs qui passent et on remet à neuf ceux qui font lever.
// Rend { state, dropped } (dropped = clés remises à neuf) ; relance l'erreur
// d'origine si même une save vide ne s'hydrate pas (rien à sauver).
// ⚠⚠ TDZ : tourne PENDANT `export let state = load()` — aucune constante de
// module ici, tout est dans les corps (déclarations de fonction = hoistées).
export function hydrateSalvaging(parsed) {
  try {
    return { state: hydrateState(parsed), dropped: [] };
  } catch (error) {
    const salvaged = salvageHydrate(parsed);
    if (salvaged) return salvaged;
    throw error;
  }
}

function salvageHydrate(parsed) {
  if (!isPlainObject(parsed)) return null;
  // Copie PROFONDE à chaque essai : un normaliseur qui muterait son entrée
  // fausserait les essais suivants (et le résultat final).
  let text;
  try { text = JSON.stringify(parsed); } catch { return null; }
  // Version jugée sur la save ENTIÈRE (resolveSaveVersion, SAV-11) : un essai qui
  // n'emporte pas les champs témoins la déduirait plus basse et rejouerait des
  // migrations déjà faites sur les champs qu'il garde.
  const version = resolveSaveVersion(parsed);
  const pick = (keys) => {
    const src = JSON.parse(text);
    const trial = { saveVersion: version };
    for (const key of keys) trial[key] = src[key];
    return trial;
  };
  const passes = (keys) => {
    try { hydrateState(pick(keys)); return true; } catch { return false; }
  };
  if (!passes([])) return null; // même sans aucun champ : le défaut est dans le code
  // Par paquets, puis clé par clé dans un paquet qui lève : une poignée
  // d'hydratations au lieu d'une par champ (≈200) pour le cas courant d'un seul
  // champ fautif. Les clés gardées s'ACCUMULENT : deux champs qui ne lèvent
  // qu'ensemble sont aussi départagés.
  const CHUNK = 16;
  const keys = Object.keys(parsed).filter((key) => key !== "saveVersion");
  const kept = [];
  const dropped = [];
  for (let i = 0; i < keys.length; i += CHUNK) {
    const chunk = keys.slice(i, i + CHUNK);
    if (passes([...kept, ...chunk])) { kept.push(...chunk); continue; }
    for (const key of chunk) {
      if (passes([...kept, key])) kept.push(key);
      else dropped.push(key);
    }
  }
  if (!dropped.length) return null; // l'échec ne tient à aucun champ : pas de repli honnête
  return { state: hydrateState(pick(kept)), dropped };
}

export function load() {
  let raw;
  try {
    raw = localStorage.getItem(SAVE_KEY);
  } catch {
    return defaultState(); // stockage indisponible : il n'y a rien à protéger
  }
  if (!raw) {
    const fresh = defaultState();
    // Partie neuve née d'un « Recommencer depuis le tout premier feu » (effacé au
    // démarrage par cloudSave.js) : époque fraîche, pour que les autres postes
    // adoptent le reset au lieu de remettre l'ancienne partie dans le nuage (SAV-4).
    if (consumeFreshEpochRequest()) fresh.saveEpoch = newSaveEpoch();
    return fresh;
  }
  try {
    // stripBom : une save recopiée d'un fichier (nuage, éditeur) peut en porter
    // un, et JSON.parse le refuse (SAV-1).
    const parsed = JSON.parse(stripBom(raw));
    if (isFutureSave(parsed)) {
      // Save d'une version PLUS RÉCENTE du jeu (branche bêta Steam, ancien build
      // en cache) : elle se joue rétrogradée — migrate() la ré-estampille et
      // hydrateState jette ce qu'il ne connaît pas. Avant, l'autosave des 2 s
      // écrasait la save d'origine, puis le nuage (SAV-6). Copie gardée telle
      // quelle, et rien ne s'écrit avant le choix du joueur dans les Options
      // (Réessayer après la mise à jour, ou Garder cette partie).
      archiveFutureSave(raw, parsed.saveVersion);
      markLocalSaveUnreadable("newer");
      console.warn(`Sauvegarde d'une version plus récente du jeu (v${parsed.saveVersion}, ce build lit la v${CURRENT_SAVE_VERSION}) : écriture suspendue, copie gardée.`);
    }
    const { state: loaded, dropped } = hydrateSalvaging(parsed);
    if (dropped.length) {
      // Partie relue, mais amputée de quelques champs : on joue la partie du
      // joueur (pas une partie neuve), et la save complète part en copie de
      // secours — les champs perdus restent récupérables (Options › Autres).
      archiveUnreadableSave(raw);
      // « illisible » dans le message : les tests de chargement réel (chuteRelicsLoad,
      // cityIlotLoad…) guettent ce mot — un champ amputé reste une régression.
      console.error(`Sauvegarde en partie illisible : champs remis à neuf (${dropped.join(", ")}). Copie complète gardée.`);
      // Bornée à 48 comme log() : une 49e ligne sautait au rechargement suivant
      // (normalizeHistory garde les 48 premières).
      loaded.history = [
        ...(loaded.history || []),
        `La sauvegarde n'a pas pu être relue en entier : ${dropped.join(", ")} remis à neuf. Une copie complète est gardée (Options, onglet Autres).`
      ].slice(-48);
    }
    return loaded;
  } catch (e) {
    // Save illisible (JSON tronqué par un quota, régression qu'aucun repli champ
    // par champ ne contourne…) : on joue une partie neuve DE REPLI, mais on
    // ARCHIVE d'abord le payload brut (deux copies différentes gardées), et rien
    // ne s'écrira — ni la clé principale, que « Réessayer » relira, ni le nuage —
    // tant que le joueur n'a pas tranché dans les Options (saveKey.js). Avant,
    // l'autosave des 2 s écrasait la clé, un deuxième échec la copie de secours,
    // et la fermeture envoyait la partie neuve dans le nuage (SAV-1, SAV-3).
    archiveUnreadableSave(raw);
    markLocalSaveUnreadable();
    console.error("Sauvegarde illisible : partie neuve de repli, rien ne s'écrit avant un choix dans les Options. Payload brut gardé en copie de secours.", e);
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
  // Save précédente illisible (load) : la clé principale la GARDE tant que le
  // joueur n'a pas tranché (Réessayer / Garder cette partie, ou un chargement) —
  // l'autosave de la partie neuve de repli l'écrasait en 2 s. L'échec est dit,
  // comme un stockage plein : la pastille de l'encart d'état reste affichée.
  if (isLocalSaveUnreadable()) {
    lastSaveError = "sauvegarde précédente illisible, écriture suspendue";
    return;
  }
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

// save() DIFFÉRÉE pour les entrées CONTINUES (curseurs, champs numériques) :
// sérialiser tout l'état à chaque événement d'input coûtait des dizaines de
// JSON.stringify + miroirs nuage par geste (audit A.8). Le render() reste
// immédiat chez l'appelant — seul l'enregistrement attend la fin du geste.
// Un timer encore en vol à la fermeture est couvert par la save() de sortie
// (beforeunload, main.js).
let saveSoonTimer = null;
export function saveSoon(delayMs = 800) {
  if (saveSoonTimer) clearTimeout(saveSoonTimer);
  saveSoonTimer = setTimeout(() => { saveSoonTimer = null; save(); }, delayMs);
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
// Une chute en cours : du déclenchement à la stèle (collapseInProgress), puis tant
// que la carte la joue (state.chute : vague, nuit, lever). Ni partie remplacée
// (import, emplacement) — runCollapseSequence reprend après ses `await` sur l'état
// alors en place et effondrerait la partie chargée avec le gain de l'ancienne —, ni
// vue ouverte par-dessus la cinématique (App.jsx).
export function collapseUnderway() {
  return collapseInProgress || !!state.chute;
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
// Tiré d'une seed neuve, pas de mapSeed : la graine survit aux cycles (même vallée,
// docs/PLAN-CHUTE.md), le nom de secours serait le même à chaque civilisation.
export function commitCityName() {
  const trimmed = state.cityName.trim();
  if (trimmed) {
    state.cityName = trimmed.slice(0, 42);
  } else {
    state.cityName = generateCityName(newCitySeed());
    state.cityNameCustom = false;
  }
  notify();
}
export function setMourning(val) {
  state.mourning = Boolean(val);
  notify();
}
// La chute se joue sur la carte (events.js, runCollapseSequence).
export function setChuteCinematic(val) {
  state.chute = Boolean(val);
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
  // Pente du rocher (Ruine active Sisyphe) : l'inflation ×1.004/achat est celle
  // DU cycle — comme le fardeau, elle se rechoisit à chaque chute. Sans ce reset
  // elle s'accumulait de cycle en cycle (×50 après 1 000 achats, puis ×50 de plus…).
  s.sisypheMult = 1;
  s.pendingActiveRuinsChoice = false;
  // defaultState() est l'unique source de vérité pour la forme de ces deux
  // objets (les effets ancestorCrisis/archiveCrisis incrémentent les
  // compteurs festivals/census, pas des clés à eux).
  const freshDefaults = defaultState();
  s.crisisActions = freshDefaults.crisisActions;
  s.foyerRelief = freshDefaults.foyerRelief;
  s.foyerReform = freshDefaults.foyerReform;
  s.foyerShift = freshDefaults.foyerShift;
  s.declaredFallCause = null;
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
  s.slotsHistory = [];
  s.slotsFreeSpins = null;
  s.rouletteHistory = [];
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
  s.terminalPreparations = { used: {}, riteTier: -1 };
  s.crisisExtensions = 0;
  s.crisisLimitAnnounced = false;
  s.crisisOpenedAt = null;
  s.archaeologyUses = 0;
  s.cycleCrisesResolved = 0;
  s.cycleCrisesProfited = 0;
  // Le vœu du cycle (D2) meurt avec la civilisation : completeCollapse en tire un
  // nouveau juste après. Rangé ici (et non en champ éternel) → il disparaît aussi
  // quand resetCivilization scelle un pacte, ce qui est voulu (le pacte a ses
  // propres règles) ; le prochain cycle en reproposera un.
  s.cycleVow = null;
  s.cityMapSlots = {};
  s.cityArchetype = null;
  s.cityCore = null;
  s.cityRoads = null;
  s.atlasSkipUsed = false;
  s.atlasFardeau = 0;
  s.atlasEpaules = 0;
  s.atlasCrushed = false;
  s.atlasShoulderCdTicks = 0;
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
  "styletLevel", "templeAuto", "templeArtifacts",
  // Le rang de la Maison (lot 2) : la réputation ne se perd jamais.
  "maisonReputation", "maisonRank",
  // L'horloge de la Nuit du Grand Jeu (2026-10-04) : la Maison est hors du temps, ses
  // Nuits ne recommencent pas à zéro à chaque Grand Reset (sinon, au rythme des sceaux,
  // on n'en verrait plus une). Une Nuit EN COURS, elle, s'éteint avec la cité.
  "nuitProchaine", "nuitCompte",
  // Registre de la Chronique : cumul À VIE de stats/records/horodatages — c'est
  // un journal de records, il traverse le Grand Reset (l'horloge à vie, les
  // timings de GR/Mythes et les compteurs de jeux ne se réinitialisent jamais).
  "chronicleStats",
  // La clepsydre (C7). Choix EXPLICITE : le temps mis de côté est du temps déjà
  // vécu par le joueur, pas une ressource de partie. L'effacer au Grand Reset
  // punirait exactement le geste que la clepsydre existe pour servir — garder
  // son absence sous le coude pour la verser sur la cité neuve.
  "storedSeconds",
  // Les faits divers de la carte : ce que le joueur a vu de la ville ne s'oublie
  // pas, c'est ce qui fait la continuité d'un cycle à l'autre (une histoire
  // commencée avant un Grand Reset se poursuit après).
  "faitsDivers",
  // L'époque de la partie (SAV-4) : un Grand Reset est un pas de la MÊME partie.
  // Effacée, elle redeviendrait « la plus ancienne » et l'arbitrage du nuage
  // refuserait toute écriture face à une copie d'époque plus récente.
  "saveEpoch"
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
