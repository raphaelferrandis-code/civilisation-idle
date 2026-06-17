"use strict";
/* ============================================================================
 * sim-10-profils.js - Simulateur headless "10 profils de joueur" pour
 * "Civilisation Effondrement" (CE).
 *
 * BUT : mesurer, pour DIX styles de jeu distincts, QUAND chaque jalon de
 * progression est atteint, en utilisant EXCLUSIVEMENT les vraies formules du
 * jeu (src/game/**). Aucune formule n'est recopiee ni inventee : on importe le
 * moteur reel et on le pilote.
 *
 * Jalons mesures par profil (temps virtuel pour les atteindre) :
 *   - Grand Reset 1 (deverrouille les Mythes)
 *   - Arbre de Ruines complet (tous les noeuds non-dogme achetes)
 *   - Acte I / II / III des Mythes, puis TOUS les Mythes completes
 *   - Grand Reset 10, puis Grand Reset 11 (Ragnarok)
 *   + jalons de contexte : ages, dynasties 1 / 10.
 *
 * Un profil = un jeu de "boutons de comportement" (cf. PROFILES plus bas) :
 * duree de cycle visee, gestion de la Rupture, sabotage (preparations
 * terminales), agressivite d'achat, poursuite des Mythes. Pour changer un
 * profil, il suffit d'editer son objet dans PROFILES.
 *
 * POLITIQUE D'EFFONDREMENT (fidelite) : on NE force PAS instability=1 a la main.
 * Phase de croissance : on tient eventuellement la Rupture sous le seuil et on
 * fait grossir la cite jusqu'a l'age vise. Phase de chute : on CESSE de gerer ;
 * la Rupture monte d'elle-meme (<=1 %/s, cf. INSTABILITY_MAX_RISE_PER_SEC) ou
 * l'Usure finit par atteindre 1 -> la crise s'ouvre organiquement, puis on
 * effondre. Ceci evite la degenerescence documentee dans simulate-ce.js
 * (cite ineffondrable OU effondrement a gain nul) tout en restant fidele : un
 * joueur reel choisit "quand lacher", pas la valeur de la jauge.
 *
 * Sorties :
 *   - course-gr1-profils.md  (table principale : jalons par profil)
 *   - sim-10-profils-milestones.tsv  (--mlog : trace live de tous les jalons)
 *
 * Usage :
 *   node sim-10-profils.js                 # les 10 profils, budget par defaut
 *   node sim-10-profils.js --profile=theoricien
 *   node sim-10-profils.js --hours=240 --tick=5 --maxreal=10 --mlog
 *
 * Options :
 *   --profile=<id>   un seul profil (cf. PROFILES) ; defaut : les 10
 *   --hours=<n>      budget en heures virtuelles par profil (defaut 240 = 10 j)
 *   --tick=<n>       pas de simulation en secondes virtuelles (defaut 5)
 *   --maxreal=<n>    budget de TEMPS REEL de calcul par profil, en minutes (defaut 6)
 *   --mlog           ecrit la trace live des jalons
 *   --debug          logs de diagnostic periodiques
 * ========================================================================== */

import fs from "fs";

// ---------------------------------------------------------------------------
// 0. Stubs d'environnement (doivent exister AVANT les import() du jeu)
//    Repris a l'identique de simulate-ce.js : le moteur attend un DOM minimal.
// ---------------------------------------------------------------------------
global.window = {};
global.localStorage = { getItem() { return null; }, setItem() {} };
Object.defineProperty(global, "navigator", {
  value: { clipboard: { writeText() {} } }, writable: true, configurable: true
});
const stubEl = () => ({
  className: "", dataset: {}, innerHTML: "", returnValue: "0", textContent: "",
  disabled: false, value: "", checked: false, style: {},
  classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
  addEventListener() {}, removeEventListener() {}, setAttribute() {}, showModal() {},
  remove() {}, click() {}, appendChild() {}, querySelector() { return stubEl(); },
  querySelectorAll() { return []; }
});
global.document = {
  addEventListener() {}, documentElement: { style: { setProperty() {} } },
  body: { appendChild() {} }, querySelector() { return stubEl(); },
  querySelectorAll() { return []; }, createElement() { return stubEl(); },
  getElementById() { return stubEl(); }
};
global.Audio = class { constructor() { this.volume = 1; } addEventListener() {} play() { return Promise.resolve(); } pause() {} };
global.render = () => {};
global.save = () => {};

// ---------------------------------------------------------------------------
// 1. Import des vraies formules du jeu (memes modules que simulate-ce.js)
// ---------------------------------------------------------------------------
const { buildings, dynastyNames } = await import("./src/game/data/buildings.js");
const { upgrades, dogmaIds, PRESTIGE_DOGMAS, PRESTIGE_TREE_BRANCHES } = await import("./src/game/data/upgrades.js");
const { eras } = await import("./src/game/data/world.js");
const myth = await import("./src/game/data/myths.js");
const { MYTHS, getMythById, isMythUnlocked, isMythCompleted } = myth;
const { unlockedActiveRuinDefinitions: unlockedActiveRuinDefs } = await import("./src/game/data/activeRuins.js");

const stateModule = await import("./src/game/core/state.js");
const { state, defaultState, invalidateRenderCache, setGamePaused, setCollapseInProgress, setBuyAmount, setState } = stateModule;

const { registerChoiceDialog } = await import("./src/game/core/choiceDialog.js");
// Handler de dialogue : pour les crises narratives, on choisit une option
// STABILISANTE qui ne draine ni Legitimite ni Population ; sinon options[0]
// (confirmation de dynastie / Grand Reset). Repris de simulate-ce.js.
registerChoiceDialog((dialog) => {
  const opts = dialog.options || [];
  const isCrisisEvent = opts.length > 1 && opts.every((o) => typeof o.apply === "function");
  let picked = opts[0];
  if (isCrisisEvent) {
    const drains = (o) => { const d = o.detail || ""; return /gitimit\S*\s*-/.test(d) || /Population\s*-/.test(d); };
    const nonDraining = opts.filter((o) => !drains(o));
    const stabilizingClean = nonDraining.filter((o) => /Rupture\s*-/.test(o.detail || ""));
    picked = stabilizingClean[0] || nonDraining[0] || opts[0];
  }
  const choice = { ...(picked || {}) };
  if (dialog.multiSelectOptions) {
    choice.selectedIds = dialog.multiSelectOptions.filter((o) => !o.disabled).map((o) => o.id);
  }
  return choice;
});

const mech = await import("./src/game/core/mechanics.js");
const {
  isUnlocked, canBuyUpgrade, checkDogmaAvailability, ruinGain, crisisOpen,
  buildingBatchCost, legitimacyGain, globalMultiplier, rates, timeWearRate,
  currentEraIndex, ownedRuinBranchPurchaseCount, ownedRuinTreePurchaseCount, has,
  dynastyRuinsThreshold, grandResetLegitimacyCost, grandResetMythsRequired, completedMythCount,
  terminalCrisisReady, TERMINAL_PREP_TIERS
} = mech;

const { canPayCost, payCost, fmt } = await import("./src/game/core/utils.js");
const { D, toNum } = await import("./src/game/core/num.js");
const actions = await import("./src/game/core/actions.js");
const {
  buyUpgrade, completeCollapse, tick, foundDynasty, performGrandReset,
  activateMyth, migrerEnee, chronicle, runCrisisAction, runTerminalCrisisAction
} = actions;
const { generateEpitaph } = await import("./src/game/core/events.js");

// Pont d'effets world.js <-> core/ (cable par main.js en vrai jeu, absent en
// headless). Sans lui les apply() des crises narratives levent et figent le jeu.
const { registerWorldEffects } = await import("./src/game/data/worldEffects.js");
const { addProductionPenalty, amplifyRuptureFactor } = mech;
const { clamp01 } = await import("./src/game/core/utils.js");
registerWorldEffects({ addProductionPenalty, chronicle, amplifyRuptureFactor, clamp01, state });

// ---------------------------------------------------------------------------
// 2. CLI
// ---------------------------------------------------------------------------
const argv = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)=?(.*)$/);
  return m ? [m[1], m[2] === "" ? true : m[2]] : [a, true];
}));
const HOURS = Number(argv.hours) || 240;                 // 10 jours virtuels par defaut
const TICK = Number(argv.tick) || 5;                     // s virtuelles / tick
const MYTH_TICK = Number(argv.mythtick) || 15;           // tick plus grossier pour les longs cycles de Mythe (debit)
const SMART_MYTHS = !argv["dumb-myths"];                 // tactiques dediees par Mythe (defaut ON ; --dumb-myths pour l'ancien comportement)
const BUDGET_SECONDS = HOURS * 3600;
const REAL_TIME_LIMIT_MS = (Number(argv.maxreal) || 6) * 60 * 1000;
const CYCLE_HARD_CAP = 6 * 3600;                         // 6 h virtuelles max / cycle (garde-fou)
const MAX_CYCLES = 5_000_000;
const RUIN_TREE_TOTAL = upgrades.filter((u) => u.group === "ruins" && !dogmaIds.has(u.id)).length;

// ---------------------------------------------------------------------------
// 3. LES 10 PROFILS DE JOUEUR  (= la seule chose a editer pour regler un style)
// ---------------------------------------------------------------------------
// Champs :
//   label        : nom lisible
//   desc         : intention de design
//   afk          : true = ne pilote pas la Rupture, laisse tomber des l'ouverture
//   growSeconds  : age de cycle VISE avant de lacher la cite (le levier de style)
//   manage       : tient la Rupture sous manageBelow pendant la croissance
//   manageBelow  : seuil au-dessus duquel on declenche des actions de regulation
//   sabotage     : true = utilise les preparations terminales (collapsePreparation)
//   sabotageTier : palier de preparation 0..2 (plus haut = plus de Ruines, plus cher)
//   buyEconomy   : achete des batiments (false = quasi-AFK economique)
//   treeFirst    : priorise l'arbre de Ruines avant de fonder des dynasties
//   pursueMyths  : pilote les Mythes une fois le GR1 atteint
const PROFILES = {
  afk_assume: {
    label: "1. AFK assume",
    desc: "Laisse tourner. Achete un peu, ne gere jamais la crise, s'effondre des que ca casse.",
    afk: false, growSeconds: 0, manage: false, manageBelow: 1, sabotage: false, sabotageTier: 0,
    buyEconomy: true, treeFirst: false, pursueMyths: true
  },
  optimiseur_timing: {
    label: "2. Optimiseur de timing",
    desc: "Tient la Rupture, effondre a un age propre (~10 min), sans sabotage.",
    afk: false, growSeconds: 600, manage: true, manageBelow: 0.8, sabotage: false, sabotageTier: 0,
    buyEconomy: true, treeFirst: true, pursueMyths: true
  },
  architecte_mythes: {
    label: "3. Architecte des Mythes",
    desc: "Identite POST-GR1 (sequencage des Mythes). Avant GR1 : jeu generique solide.",
    afk: false, growSeconds: 720, manage: true, manageBelow: 0.8, sabotage: true, sabotageTier: 1,
    buyEconomy: true, treeFirst: true, pursueMyths: true
  },
  casse_cou: {
    label: "4. Casse-cou",
    desc: "Cycles tres courts (~2 min), pas de gestion, spam d'effondrements.",
    afk: false, growSeconds: 120, manage: false, manageBelow: 1, sabotage: false, sabotageTier: 0,
    buyEconomy: true, treeFirst: false, pursueMyths: true
  },
  prudent: {
    label: "5. Prudent",
    desc: "Cycles longs (~20 min), gestion lourde, petit sabotage. Grosses cites, peu de risque.",
    afk: false, growSeconds: 1200, manage: true, manageBelow: 0.7, sabotage: true, sabotageTier: 1,
    buyEconomy: true, treeFirst: true, pursueMyths: true
  },
  completionniste: {
    label: "6. Completionniste",
    desc: "Achete tout, complete l'arbre avant de fonder, cycles moyens (~12 min).",
    afk: false, growSeconds: 720, manage: true, manageBelow: 0.8, sabotage: true, sabotageTier: 1,
    buyEconomy: true, treeFirst: true, pursueMyths: true
  },
  theoricien: {
    label: "7. Theoricien (tenir puis saborder)",
    desc: "Plafond de skill : longue croissance geree + sabotage MAX avant la chute.",
    afk: false, growSeconds: 900, manage: true, manageBelow: 0.75, sabotage: true, sabotageTier: 2,
    buyEconomy: true, treeFirst: true, pursueMyths: true
  },
  lecteur: {
    label: "8. Lecteur",
    desc: "Tres lent : cycles tres longs (~30 min), achats minimaux (lit le lore).",
    afk: false, growSeconds: 1800, manage: true, manageBelow: 0.85, sabotage: false, sabotageTier: 0,
    buyEconomy: true, treeFirst: false, pursueMyths: true
  },
  chasseur_meta: {
    label: "9. Chasseur de meta",
    desc: "Optimise la meta. Pre-GR1 : jeu generique fort, sabotage modere.",
    afk: false, growSeconds: 840, manage: true, manageBelow: 0.78, sabotage: true, sabotageTier: 2,
    buyEconomy: true, treeFirst: true, pursueMyths: true
  },
  relanceur_compulsif: {
    label: "10. Relanceur compulsif",
    desc: "Relance sans cesse : cycles tres courts (~3 min), pas de sabotage.",
    afk: false, growSeconds: 180, manage: false, manageBelow: 1, sabotage: false, sabotageTier: 0,
    buyEconomy: true, treeFirst: false, pursueMyths: true
  }
};

// ---------------------------------------------------------------------------
// 4. Horloge virtuelle + budget temps reel (repris de simulate-ce.js)
// ---------------------------------------------------------------------------
let VT = 0;                                  // temps virtuel (s) du profil courant
const ORIGINAL_NOW = Date.now;
const realNow = () => ORIGINAL_NOW.call(Date);
const CLOCK_BASE = realNow();
let scenarioRealStart = realNow();
function setClock() { Date.now = () => CLOCK_BASE + VT * 1000; }
setClock();
const flush = () => new Promise((r) => setImmediate(r));
function timedOut() { return realNow() - scenarioRealStart > REAL_TIME_LIMIT_MS; }

function fmtDuration(sec) {
  sec = Math.round(sec);
  const d = Math.floor(sec / 86400); sec -= d * 86400;
  const h = Math.floor(sec / 3600); sec -= h * 3600;
  const m = Math.floor(sec / 60); const s = sec - m * 60;
  const parts = [];
  if (d) parts.push(d + "j");
  if (h || d) parts.push(h + "h");
  parts.push(m + "m");
  if (!d && !h) parts.push(s + "s");
  return parts.join(" ");
}
function num(x) { const n = toNum(x); return Number.isFinite(n) ? n : Number.MAX_VALUE; }

// ---------------------------------------------------------------------------
// 5. Acheteurs (economie, arbre de ruines, heritage) - repris de simulate-ce.js
// ---------------------------------------------------------------------------
const bldById = Object.fromEntries(buildings.map((b) => [b.id, b]));
// opts (pour les tactiques de Mythes) :
//   noFood        : n'achete aucun batiment producteur de Nourriture (Promethee)
//   popCap        : au-dela de cette population, n'achete plus de batiment qui fait croitre la pop (Age d'Or)
//   onlyCategory  : ne garde que les batiments de cette categorie (Babel : "city"/"knowledge"/"infra")
function buyBuildings(opts = {}) {
  const t = {};
  const b = state.buildings;
  t.foragers = 10;
  if (b.foragers >= 3) t.granaries_city = 6;
  if (b.granaries_city >= 3) t.caravans = 4;
  if (b.caravans >= 1) t.storytellers = 4;
  if (b.storytellers >= 3) t.scribes = 4;
  if (b.storytellers >= 1) t.roads = 4;
  if (b.roads >= 3) t.aqueducts = 4;
  if (b.aqueducts >= 3) t.watch = 3;
  if (b.watch >= 3) t.sewers = 3;
  if (b.sewers >= 3) t.bureaucracy = 3;
  if (b.caravans >= 4) t.markets = 4;
  if (b.markets >= 4) t.guilds = 3;
  if (b.guilds >= 3) t.irrigated_fields = 3;
  if (b.irrigated_fields >= 3) t.river_ports = 3;
  if (b.river_ports >= 3) t.courthouses = 3;
  if (b.courthouses >= 3) t.water_mills = 3;
  if (b.water_mills >= 3) t.public_works = 3;
  if (b.public_works >= 3) t.mint_houses = 3;
  if (b.mint_houses >= 3) t.imperial_exchanges = 2;

  // Filtres de tactique de Mythe : on retire du plan d'achat ce qui contredit
  // l'objectif (ex. Promethee : pas de Nourriture ; Age d'Or : plafond de pop).
  for (const id of Object.keys(t)) {
    const bd = bldById[id];
    if (!bd) continue;
    if (opts.noFood && (bd.food || 0) > 0) { delete t[id]; continue; }
    if (opts.onlyCategory && bd.category !== opts.onlyCategory) { delete t[id]; continue; }
    if (opts.popCap !== undefined && (bd.pop || 0) > 0 && num(state.population) >= opts.popCap) { delete t[id]; continue; }
  }

  let allMet = true;
  for (const [id, target] of Object.entries(t)) {
    if (target > 0 && (b[id] || 0) < target) { allMet = false; break; }
  }
  const scale = (allMet ? 6 + state.cycles : 4) + Math.floor(VT / 600);

  let bought = 0;
  for (let pass = 0; pass < 16; pass++) {
    const visible = buildings
      .filter((bd) => t[bd.id] > 0 && isUnlocked(bd) && (b[bd.id] || 0) < t[bd.id] * scale)
      .sort((a, c) => ((b[a.id] || 0) / (t[a.id] * scale)) - ((b[c.id] || 0) / (t[c.id] * scale)));
    if (!visible.length) break;
    let changed = false;
    for (const bd of visible) {
      const cost = buildingBatchCost(bd, 1);
      if (!canPayCost(cost)) continue;
      // Securite nourriture legere : eviter la spirale de mort, mais laisser la
      // penurie pousser la Rupture (sinon aucune crise -> aucun effondrement).
      if (cost.food && D(state.food).sub(cost.food).lt(D(state.population).mul(0.5))) continue;
      payCost(cost);
      state.buildings[bd.id] = (b[bd.id] || 0) + 1;
      bought++; changed = true;
      break;
    }
    if (!changed) break;
  }
  if (bought) invalidateRenderCache("all");
  return bought > 0;
}

// Achat cible par predicat (tactiques de Mythe). Achete au plus ~maxBuys
// batiments correspondant a `pred`, du moins cher au plus cher.
function buyMatching(pred, { maxBuys = 40, foodSafety = false } = {}) {
  let bought = 0;
  for (let pass = 0; pass < maxBuys; pass++) {
    const cands = buildings
      .filter((bd) => isUnlocked(bd) && pred(bd))
      .map((bd) => ({ bd, cost: buildingBatchCost(bd, 1) }))
      .filter((x) => canPayCost(x.cost))
      .sort((a, b) => num(a.cost[Object.keys(a.cost)[0]]) - num(b.cost[Object.keys(b.cost)[0]]));
    let changed = false;
    for (const { bd, cost } of cands) {
      if (foodSafety && cost.food && D(state.food).sub(cost.food).lt(D(state.population).mul(0.5))) continue;
      payCost(cost); state.buildings[bd.id] = (state.buildings[bd.id] || 0) + 1; bought++; changed = true; break;
    }
    if (!changed) break;
  }
  if (bought) invalidateRenderCache("all");
  return bought;
}

// Achat MINIMAL de la chaine de prerequis (pour debloquer l'infra) puis infra pure.
// Usage : Hephaistos — on veut une infra >= 1500 avec le MOINS de production de
// pop possible, pour que le declin (0,8%/min) l'emporte sur la production.
function buyMinimalInfra() {
  const chainCaps = { foragers: 3, granaries_city: 3, caravans: 1, storytellers: 1, scribes: 1, roads: 3 };
  for (const [id, cap] of Object.entries(chainCaps)) {
    const bd = bldById[id];
    if (!bd) continue;
    while ((state.buildings[id] || 0) < cap && isUnlocked(bd)) {
      const c = buildingBatchCost(bd, 1);
      if (!canPayCost(c)) break;
      payCost(c); state.buildings[id] = (state.buildings[id] || 0) + 1;
    }
  }
  buyMatching((bd) => (bd.infra || 0) > 0 && (bd.pop || 0) === 0, { maxBuys: 30 });
  invalidateRenderCache("all");
}

// Achat MINIMAL orienté Trésor (pour l'Âge d'Or) : juste la chaîne pour débloquer
// les marchés, puis des bâtiments d'Or. Peu de bâtiments => la production de pop
// reste négligeable => la pop ne croît pas de 25% avant que le Trésor n'atteigne sa cible.
function buyMinimalGold() {
  const chainCaps = { foragers: 3, granaries_city: 3, caravans: 4 };
  for (const [id, cap] of Object.entries(chainCaps)) {
    const bd = bldById[id];
    if (!bd) continue;
    while ((state.buildings[id] || 0) < cap && isUnlocked(bd)) {
      const c = buildingBatchCost(bd, 1);
      if (!canPayCost(c)) break;
      payCost(c); state.buildings[id] = (state.buildings[id] || 0) + 1;
    }
  }
  buyMatching((bd) => (bd.gold || 0) > 0, { maxBuys: 20 });
  invalidateRenderCache("all");
}

function buyRuinTree(keepReserveRuins = 0) {
  let bought = 0;
  for (let pass = 0; pass < 6; pass++) {
    let changed = false;
    const affordable = upgrades
      .filter((u) => u.group === "ruins" && !dogmaIds.has(u.id) && canBuyUpgrade(u))
      .sort((a, c) => (a.cost.ruins || 0) - (c.cost.ruins || 0));
    for (const u of affordable) {
      if (D(state.ruins).sub(u.cost.ruins || 0).lt(keepReserveRuins)) continue;
      buyUpgrade(u.id); bought++; changed = true;
      if (bought > 5000) return bought;
    }
    for (const d of PRESTIGE_DOGMAS) {
      if (checkDogmaAvailability(d.id) === "available") { buyUpgrade(d.id); bought++; changed = true; }
    }
    if (!changed) break;
  }
  return bought;
}

const HERITAGE_ORDER = [
  "reforme_administrative", "protocoles_urgence", "reseau_routes", "codex_mythique",
  "conservateurs_ruines", "rituel_effondrement", "grand_reset",
  "veilleurs_nuit_1", "veilleurs_nuit_2", "veilleurs_nuit_3", "veilleurs_nuit_4"
];
function buyHeritage() {
  for (const id of HERITAGE_ORDER) {
    const u = upgrades.find((x) => x.id === id);
    if (u && canBuyUpgrade(u)) buyUpgrade(id);
  }
}

// ---------------------------------------------------------------------------
// 6. Gestion de la Rupture + sabotage (preparations terminales)
// ---------------------------------------------------------------------------
function manageRupture(below) {
  for (const id of ["reforms", "census", "rationing", "festivals"]) {
    if (state.instability <= below) break;
    try { runCrisisAction(id, { render: false }); } catch { /* noop */ }
  }
}

// Sabotage = "tenir gros puis saborder". Une fois la crise ouverte, on enchaine
// les preparations terminales (chacune monte collapsePreparation, qui muscle
// ruinGain), jusqu'au palier vise, PUIS on laisse re-monter la Rupture.
function prepareCollapse(tier) {
  for (const type of ["prepareArchives", "exodus", "holdOrder"]) {
    for (let t = 0; t <= tier; t++) {
      if (terminalCrisisReady(type, t)) {
        try { runTerminalCrisisAction(type, t); } catch { /* noop */ }
      }
    }
  }
}

// Effondrement direct (sans sequence d'animation). Exige crisisOpen() (sinon
// ruinGain()==0). Renvoie false si gain nul (degenerescence) pour que l'appelant
// laisse vieillir la cite plutot que de boucler a l'infini.
function doCollapse(reason = "auto") {
  const gain = ruinGain();
  if (D(gain).lte(0)) return false;
  completeCollapse(gain, dynastyNames[state.dynastyCount % dynastyNames.length], generateEpitaph(), reason);
  setGamePaused(false);
  setCollapseInProgress(false);
  return true;
}

// ---------------------------------------------------------------------------
// 7. Enregistreur de jalons
// ---------------------------------------------------------------------------
const MLOG = argv.mlog ? (typeof argv.mlog === "string" ? argv.mlog : "sim-10-profils-milestones.tsv") : null;
if (MLOG) fs.writeFileSync(MLOG, "profil\ttemps_virtuel\tjalon\tcycle\tage\tGR\tdynasties\tlegitimite\truines\n", "utf8");

function snapshot() {
  return {
    vt: VT, cycles: state.cycles, dynastyCount: state.dynastyCount,
    grandResetCount: state.grandResetCount || 0,
    bestEraIndex: state.bestEraIndex || 0, era: eras[currentEraIndex()].name,
    ruins: num(state.ruins), legitimacy: state.legitimacy,
    treeOwned: ownedRuinTreePurchaseCount(), globalMult: globalMultiplier()
  };
}

function makeRecorder(profileId) {
  return {
    profileId, milestones: [], seenEra: new Set(),
    record(key, label) {
      if (this.milestones.some((m) => m.key === key)) return;
      const ms = { key, label, ...snapshot() };
      this.milestones.push(ms);
      if (MLOG) fs.appendFileSync(MLOG,
        `${profileId}\t${fmtDuration(ms.vt)}\t${label}\t${ms.cycles}\t${ms.era}\t${ms.grandResetCount}\t${ms.dynastyCount}\t${fmt(ms.legitimacy)}\t${fmt(ms.ruins)}\n`);
    },
    has(key) { return this.milestones.some((m) => m.key === key); },
    check() {
      const ei = currentEraIndex();
      if (!this.seenEra.has(ei)) { this.seenEra.add(ei); this.record(`era_${ei}`, `Age : ${eras[ei].name}`); }
      if (state.dynastyCount >= 1) this.record("dynasty_1", "Dynastie 1 fondee");
      if (state.dynastyCount >= 10) this.record("dynasty_10", "Dynastie 10 fondee");
      if (ownedRuinTreePurchaseCount() >= RUIN_TREE_TOTAL) this.record("tree_complete", "Arbre de Ruines complet");
      const gr = state.grandResetCount || 0;
      for (const g of [1, 3, 5, 10, 11]) if (gr >= g) this.record(`gr_${g}`, `Grand Reset ${g}`);
      // Mythes par acte + total.
      const actNames = { 1: "Acte I (Fondation)", 2: "Acte II (Domination)", 3: "Acte III (Apocalypse)" };
      for (const act of [1, 2, 3]) {
        const list = MYTHS.filter((m) => m.act === act);
        if (list.length && list.every((m) => isMythCompleted(m.id))) this.record(`act_${act}`, `${actNames[act]} complete`);
      }
      if (MYTHS.length && MYTHS.every((m) => isMythCompleted(m.id))) this.record("all_myths", "TOUS les Mythes completes");
    }
  };
}

// ---------------------------------------------------------------------------
// 8. Pilotage des Mythes (best-effort, honnete sur les echecs)
// ---------------------------------------------------------------------------
const mythResults = {}; // profileId -> { completed, attempted, attemptsById:{}, done:[] }
const MYTH_MAX_ATTEMPTS = 3; // au-dela, on abandonne ce Mythe (anti-gaspillage de calcul)

async function resolvePause() {
  let f = 0;
  while (stateModule.gamePaused && !crisisOpen() && f++ < 10) await flush();
}

// ── Tactiques dediees par Mythe (--smart-myths, ON par defaut) ───────────────
// Chaque objectif de Mythe a une condition sur-mesure (cf. data/myths.js) qu'une
// strategie generique ne peut pas satisfaire (et parfois sabote activement, ex.
// Promethee). Ici, pour chaque Mythe, on encode la micro-strategie qui le resout :
//   grow       : duree de cycle visee (s) adaptee a l'objectif
//   below      : seuil de gestion de la Rupture (plus bas = on tient plus fort)
//   buyOpts    : options passees a buyBuildings (noFood / popCap / onlyCategory)
//   setup()    : reglage one-shot a l'activation (choix Babel/Antee/Ragnarok)
//   onTick()   : action par tick (migration Enee, spam de crises Atlas)
//   met()      : objectif atteint -> on declenche l'effondrement immediatement
//   maxCycles  : nombre d'essais de cycle pour ce Mythe
const goldNum  = () => num(state.gold);
const powerNum = () => num(state.population) + num(state.food) * 0.05 + num(state.gold) * 0.1 + num(state.knowledge) * 0.25 + num(state.infrastructure);

const MYTH_TACTICS = {
  // ── Acte I ────────────────────────────────────────────────────────────────
  mythe_du_chaos:      { grow: 700,  below: 0.8 }, // ruines banque >= 50 : trivial post-GR1
  mythe_de_cadmos:     { grow: 700,  below: 0.8 }, // nommer 3 Ages : le handler de dialogue repond aux prompts
  mythe_d_enee:        { grow: 1700, below: 0.7,  // >=3 migrations (territoire degrade /6 min)
    onTick() { if (state.eneeDegraded) { try { migrerEnee(); } catch { /* */ } } },
    met() { return (state.eneeMigrations || 0) >= 3; } },
  mythe_de_promethee:  { grow: 2400, below: 0.6,  // pop>=500 AVANT Rupture 80% -> surtout NE PAS spammer la Nourriture
    buyOpts: { noFood: true },
    met() { return state.prometheePopReached === true; } },
  mythe_d_hephaistos:  { grow: 2400, below: 0.85, // REFONTE : infra >= 1x pic de pop + pop declinee de 20%
    // La production de pop est etouffee par le Mythe -> la pop chute toute seule
    // (~0,8%/min). On construit donc NORMALEMENT (pic de pop fixe dans les 3
    // premieres min, puis on pompe l'infra) et on tient la Rupture pour survivre
    // les ~28 min que dure le declin de 20%. C'est le defi : tenir sous Usure x2.5.
    met() { return state.hephGoalReached === true; } },

  // ── Acte II ─────────────────────────────────────────────────────────────────
  mythe_de_sisyphe:    { grow: 2200, below: 0.75, // 50 000 Tresor malgre l'inflation des couts
    met() { return goldNum() >= 50000; } },
  mythe_de_babel:      { grow: 2200, below: 0.8,  // mult exponentiel x5 (~33 batiments du type choisi)
    setup() { state.babelCategory = "city"; },
    buyOpts: { onlyCategory: "city" },
    met() { return state.babelProdReached === true; } },
  mythe_age_or:        { grow: 900, below: 0.95,  // 75 000 Tresor, pop plafonnee par le Mythe (+25% max)
    // La pop est desormais PLAFONNEE par le Mythe (production de pop coupee au
    // plafond) -> on construit normalement, le Tresor monte, la pop reste sous le
    // plafond -> objectif atteint. Rupture plafonnee a 5% -> pas d'effondrement seul.
    met() { return state.orGoldReached === true; } },

  // ── Acte III ────────────────────────────────────────────────────────────────
  mythe_d_atlas:       { grow: 200,  below: 1,    // survivre 45 min OU 10 vagues de crise -> on spamme 10 crises
    onTick() { if ((state.atlasCrisisCount || 0) < 12) { for (const id of ["census", "rationing", "festivals", "reforms"]) { try { runCrisisAction(id, { render: false, force: true }); } catch { /* */ } } } },
    met() { return (state.atlasCrisisCount || 0) >= 10; } },
  mythe_d_icare:       { grow: 1200, below: 0.85, // infra>=5000 (prod x100 aide, mais Rupture x30) -> on tient la Rupture + rush infra
    met() { return state.icareInfraReached === true; } },
  mythe_du_phenix:     { grow: 200, below: 0.85, maxCycles: 24, collapseAtAge: 180 }, // 400 ruines cumulees sur 20 cycles (on effondre a la main avant le force in-game)
  mythe_atrides:       { grow: 2600, below: 0.8,  // Tresor net (Tresor - Dette) >= 100 000
    met() { return goldNum() - (state.atridesDebt || 0) >= 100000; } },
  mythe_d_antee:       { grow: 900,  below: 0.8,  // >=2 Ruines actives + puissance >= 10 000
    setup() {
      const ids = unlockedActiveRuinDefs(state).map((d) => d.id);
      state.activeRuinIds = ids.slice(0, Math.max(2, Math.min(ids.length, 4)));
      state.pendingActiveRuinsChoice = false;
    },
    met() { return (state.activeRuinIds || []).length >= 2 && powerNum() >= 10000; } },

  // ── Ragnarok (debloque le GR11) ───────────────────────────────────────────────
  mythe_du_ragnarok:   { grow: 600,  below: 0.85, // puissance >= 1e6 OU banque de ruines >= 10 000 (vraie post-GR10)
    setup() {
      const ids = unlockedActiveRuinDefs(state).map((d) => d.id);
      state.activeRuinIds = ids.slice(0, Math.max(2, Math.min(ids.length, 4)));
      state.pendingActiveRuinsChoice = false;
      state.babelCategory = state.babelCategory || "city";
    },
    met() { return powerNum() >= 1e6 || num(state.ruins) >= 10000; } }
};

// Declenche un effondrement immediat (l'objectif du Mythe est atteint) : on
// pousse la Rupture a 1 pour ouvrir la crise, puis on effondre. completeCollapse
// passe meme si l'effondrement MANUEL est desactive (Atlas/Icare) — fidele a
// "la cite finit par tomber", la condition onCollapse() etant deja remplie.
function forceCollapseNow(reason) {
  state.instability = Math.max(state.instability || 0, 1);
  return doCollapse(reason);
}

async function tryCompleteMyth(m, rec, prof) {
  if (isMythCompleted(m.id) || !isMythUnlocked(m)) return isMythCompleted(m.id);
  try { await activateMyth(m.id); } catch { return false; }

  // Tactique dediee (si --smart-myths) ou repli generique sur le style du profil.
  const tac = (SMART_MYTHS && MYTH_TACTICS[m.id]) ? MYTH_TACTICS[m.id] : {};
  const grow    = tac.grow    !== undefined ? tac.grow    : prof.growSeconds;
  const below   = tac.below   !== undefined ? tac.below   : prof.manageBelow;
  // buyOpts peut etre statique ou une fonction du contexte (age du cycle) pour
  // les tactiques en deux phases (ex. Hephaistos : grossir puis laisser decliner).
  const buyOptsFor = (ageSec) => (typeof tac.buyOpts === "function" ? tac.buyOpts({ ageSec, state }) : (tac.buyOpts || {}));
  const maxCycles = tac.maxCycles || (m.id === "mythe_du_phenix" ? 22 : 5);
  if (tac.setup) { try { tac.setup(); } catch { /* */ } }

  for (let c = 0; c < maxCycles && state.activeMythId; c++) {
    const startVT = VT;
    let g = 0;
    let objectiveHit = false;
    // noBuy peut dependre de l'etat en debut de cycle (Hephaistos : si l'infra
    // gardee est deja >= 1500, on N'ACHETE RIEN ce cycle -> aucune production de
    // pop -> le declin de 0,8%/min finit par atteindre 25%).
    const noBuy = typeof tac.noBuy === "function" ? tac.noBuy(state) : Boolean(tac.noBuy);
    while (g++ < 500000 && !crisisOpen() && state.activeMythId) {
      if (VT - startVT >= CYCLE_HARD_CAP || VT >= BUDGET_SECONDS || timedOut()) break;
      if (stateModule.gamePaused) { await resolvePause(); if (stateModule.gamePaused) break; continue; }
      if (tac.buy) { try { tac.buy({ ageSec: VT - startVT }); } catch { /* */ } }
      else if (!noBuy) buyBuildings(buyOptsFor(VT - startVT));
      // Gestion de la Rupture pendant la phase de croissance (sauf si l'objectif
      // exige de la laisser monter — le profil afk n'en fait jamais).
      if (!prof.afk && state.instability > below && (VT - startVT) < grow) manageRupture(below);
      if (tac.onTick) { try { tac.onTick(); } catch { /* */ } }
      setClock(); tick(MYTH_TICK); VT += MYTH_TICK;
      // Cadmos : le prompt de nommage d'Age est un dialogue asynchrone tire dans
      // le tick ; on vide la file de micro-taches pour qu'il se resolve (sinon
      // cadmosPromptPending reste bloque et aucun Age n'est nomme).
      if (state.cadmosPromptPending) { let f = 0; while (state.cadmosPromptPending && f++ < 12) await flush(); }
      if (stateModule.gamePaused && !crisisOpen()) await resolvePause();
      // Objectif atteint : on effondre tout de suite pour le verrouiller.
      if (tac.met && tac.met()) { objectiveHit = true; break; }
      // Effondrement manuel à âge fixe (Phénix : enchaîner 20 cycles courts SANS
      // attendre l'effondrement forcé in-game, qui passe par la séquence animée
      // non résolue en headless).
      if (tac.collapseAtAge && (VT - startVT) >= tac.collapseAtAge) break;
    }
    if (argv.debug && m.id === "mythe_d_hephaistos") {
      const peak = Math.max(1, num(state.hephPopPeak || 1));
      const decline = 1 - num(state.population) / peak;
      const ratio = num(state.infrastructure) / peak;
      process.stderr.write(`    [heph] cyc${c} infra/pic=${ratio.toFixed(3)} (cible 1.0) declin=${(decline * 100).toFixed(1)}%/20% pop=${fmt(num(state.population))} pic=${fmt(peak)} crise=${crisisOpen()} age=${fmtDuration(VT - startVT)}\n`);
    }
    if (argv.debug && m.id === "mythe_age_or") {
      const cap = num(state.orStartPop || 0) * 1.25;
      process.stderr.write(`    [or] cyc${c} gold=${fmt(goldNum())}/75000 reached=${state.orGoldReached} startPop=${fmt(num(state.orStartPop || 0))} popPeak=${fmt(num(state.orPopPeak || 0))} cap=${fmt(cap)} depasse=${num(state.orPopPeak || 0) > cap} age=${fmtDuration(VT - startVT)}\n`);
    }
    if (argv.debug && ["mythe_du_phenix", "mythe_atrides", "mythe_d_antee"].includes(m.id)) {
      process.stderr.write(`    [${m.id}] cyc${c} active=${state.activeMythId} crise=${crisisOpen()} net=${fmt(goldNum() - (state.atridesDebt || 0))} activeRuins=${(state.activeRuinIds || []).length} power=${fmt(powerNum())} phxCyc=${state.phoenixCycleCount || 0} phxRuins=${fmt(num(state.phoenixTotalRuins || 0))} age=${fmtDuration(VT - startVT)}\n`);
    }
    if (objectiveHit) { forceCollapseNow("manual"); rec.check(); if (isMythCompleted(m.id)) break; }
    else {
      if (prof.sabotage && crisisOpen()) prepareCollapse(prof.sabotageTier);
      // forceCollapseNow pousse la Rupture a 1 AVANT d'effondrer : indispensable
      // pour les cycles sans crise naturelle (ex. Phenix, effondrement a age fixe),
      // sinon ruinGain()=0 et l'effondrement echoue (le pacte ne progresse jamais).
      if (!forceCollapseNow("manual")) {
        for (let k = 0; k < 8 && state.instability >= 1; k++) manageRupture(0.5);
        state.instability = Math.min(state.instability, 0.5);
      }
      rec.check();
    }
    if (isMythCompleted(m.id)) break;
    if (VT >= BUDGET_SECONDS || timedOut()) break;
    if (!state.activeMythId && !isMythCompleted(m.id) && m.id !== "mythe_du_phenix") {
      try { await activateMyth(m.id); if (tac.setup) tac.setup(); } catch { break; }
    }
  }
  return isMythCompleted(m.id);
}

async function driveMyths(rec, prof) {
  if ((state.grandResetCount || 0) < 1) return;
  const r = mythResults[prof._id] || (mythResults[prof._id] = { completed: 0, attempted: 0, attemptsById: {}, done: [] });
  // Ordre des actes + Ragnarok. Le gating est dur (Acte II exige tout l'Acte I,
  // etc.) : inutile d'essayer l'Acte II si l'Acte I n'est pas bouclé.
  for (const act of [1, 2, 3, "ragnarok"]) {
    for (const m of MYTHS.filter((x) => x.act === act)) {
      if (VT >= BUDGET_SECONDS || timedOut()) return;
      if (isMythCompleted(m.id) || !isMythUnlocked(m)) continue;
      if ((r.attemptsById[m.id] || 0) >= MYTH_MAX_ATTEMPTS) continue; // abandonné
      r.attemptsById[m.id] = (r.attemptsById[m.id] || 0) + 1;
      r.attempted++;
      if (await tryCompleteMyth(m, rec, prof)) { r.completed++; r.done.push(m.id); }
    }
    rec.check();
  }
}

// ---------------------------------------------------------------------------
// 9. Joue un cycle complet selon le profil, jusqu'a l'effondrement
// ---------------------------------------------------------------------------
async function playCycle(rec, prof) {
  const cycleStartVT = VT;
  let guard = 0;
  let releasing = false; // phase de chute : on a cesse de gerer
  while (guard++ < 5_000_000) {
    if (VT >= BUDGET_SECONDS || timedOut()) return false;
    if (VT - cycleStartVT >= CYCLE_HARD_CAP) { releasing = true; }
    if (stateModule.gamePaused) { await resolvePause(); if (stateModule.gamePaused) return false; continue; }

    if (crisisOpen()) break; // la crise s'est ouverte organiquement -> on effondre

    const age = VT - cycleStartVT;
    if (!releasing && age >= prof.growSeconds) releasing = true;

    if (prof.buyEconomy) buyBuildings();
    // Phase de croissance : on tient la Rupture pour faire grossir la cite.
    // Phase de chute (releasing) : on ne gere plus -> la jauge monte d'elle-meme.
    if (!releasing && !prof.afk && prof.manage && state.instability > prof.manageBelow) {
      manageRupture(prof.manageBelow);
    }
    setClock(); tick(TICK); VT += TICK;
    if (stateModule.gamePaused && !crisisOpen()) await resolvePause();
    if ((guard & 7) === 0) rec.check();
  }
  // Crise ouverte : sabotage eventuel (collapsePreparation), puis effondrement.
  if (prof.sabotage && crisisOpen()) prepareCollapse(prof.sabotageTier);
  if (crisisOpen()) state.instability = Math.max(state.instability, 1);
  return doCollapse(prof.afk ? "auto" : "manual");
}

// ---------------------------------------------------------------------------
// 10. Boucle principale d'un profil : cycles -> meta -> GR -> Mythes
// ---------------------------------------------------------------------------
function resetScenario() {
  VT = 0; scenarioRealStart = realNow(); setClock();
  setState(defaultState());
  setGamePaused(false); setCollapseInProgress(false); setBuyAmount(100);
  invalidateRenderCache("all");
}

async function runProfile(prof) {
  resetScenario();
  const rec = makeRecorder(prof._id);
  rec.check();
  let collapseFails = 0;

  while (VT < BUDGET_SECONDS && state.cycles < MAX_CYCLES) {
    if (timedOut()) break;

    const collapsed = await playCycle(rec, prof);
    if (VT >= BUDGET_SECONDS || timedOut()) break;

    if (!collapsed) {
      // Effondrement a gain nul (degenerescence) ou pause bloquante : on apaise
      // pour laisser la cite vieillir, et on abandonne apres N echecs.
      collapseFails++;
      for (let k = 0; k < 12 && state.instability >= 1; k++) manageRupture(0.5);
      state.instability = Math.min(state.instability, 0.5);
      if (collapseFails >= 10) break;
      continue;
    }
    collapseFails = 0;

    // --- Meta-progression -----------------------------------------------------
    const treeDone = ownedRuinTreePurchaseCount() >= RUIN_TREE_TOTAL;
    if (prof.treeFirst && !treeDone) {
      buyRuinTree(0);                       // dump tout dans l'arbre d'abord
    } else {
      buyRuinTree(dynastyRuinsThreshold()); // garde la reserve pour fonder
    }
    buyHeritage();
    // Fonder une dynastie des que possible (gagne de la legitimite).
    if (legitimacyGain() > 0) { try { await foundDynasty(); } catch { /* noop */ } }
    rec.check();

    // --- Grand Reset si finançable + gate Mythes satisfait --------------------
    const nextGR = (state.grandResetCount || 0) + 1;
    const maxGR = state.ragnarokHeritage ? 11 : 10;
    const grUnlocked = has("grand_reset") && (state.grandResetCount || 0) < maxGR;
    if (grUnlocked && state.legitimacy >= grandResetLegitimacyCost(nextGR)
        && completedMythCount() >= grandResetMythsRequired(nextGR)) {
      try { await performGrandReset(); } catch { /* noop */ }
      rec.check();
    }

    // --- Mythes : apres GR1, et chaque fois que le gate Mythes bloque le GR ----
    const blockedByMyths = grUnlocked && completedMythCount() < grandResetMythsRequired((state.grandResetCount || 0) + 1);
    if (prof.pursueMyths && (state.grandResetCount || 0) >= 1
        && (!rec.has("all_myths")) && (rec.has("gr_1") && (blockedByMyths || !mythResults[prof._id]))) {
      await driveMyths(rec, prof);
      buyHeritage();
      rec.check();
    }

    if (argv.debug && state.cycles % 200 === 0) {
      process.stderr.write(`  [${prof._id}] VT=${fmtDuration(VT)} cyc=${state.cycles} dyn=${state.dynastyCount} ` +
        `GR=${state.grandResetCount || 0} legit=${fmt(state.legitimacy)} ruines=${fmt(num(state.ruins))} tree=${ownedRuinTreePurchaseCount()}/${RUIN_TREE_TOTAL}\n`);
    }
  }
  rec.final = snapshot();
  rec.realMs = realNow() - scenarioRealStart;
  return rec;
}

// ---------------------------------------------------------------------------
// 11. Execution
// ---------------------------------------------------------------------------
// ── Mode diagnostic : --mythtest ─────────────────────────────────────────────
// Isole le pilotage des Mythes du long grind meta : on monte un etat post-GR1
// fort, puis on tente chaque Mythe dans l'ordre des actes et on logue le verdict.
if (argv.mythtest) {
  resetScenario();
  state.grandResetCount = 1;
  state.cycles = 8;
  state.dynastyCount = 6;
  state.legitimacy = 1000;
  state.ruins = D(1e8);
  state.bestEraIndex = 10;
  buyRuinTree(0); buyHeritage(); buyRuinTree(0); buyHeritage();
  // Grosse banque de Ruines APRES achat de l'arbre (sinon l'achat la draine) :
  // represente un milieu/fin de partie ; fallen_roads (infra gardee = sqrt(ruines)
  // x0.25) tient alors l'infra >= 1500 sans rien construire (clef d'Hephaistos).
  state.ruins = D(1e14);
  // Depart REALISTE de cycle de Mythe : comme apres un effondrement, les batiments
  // sont quasi remis a zero et la pop est basse — il faut TOUT reconstruire dans
  // le cycle. Les bonus de meta (arbre de Ruines, heritages, x2 du GR1) demeurent.
  for (const id of Object.keys(state.buildings)) state.buildings[id] = 0;
  state.population = D(10); state.food = D(35); state.gold = D(0); state.knowledge = D(0); state.infrastructure = D(0);
  state.cycleStartedAt = Date.now();
  invalidateRenderCache("all");
  const rec = makeRecorder("mythtest");
  const r = (mythResults.mythtest = { completed: 0, attempted: 0, attemptsById: {}, done: [] });
  const prof = { _id: "mythtest", afk: false, growSeconds: 600, manage: true, manageBelow: 0.8, sabotage: true, sabotageTier: 2, buyEconomy: true, pursueMyths: true };
  console.log(`[MYTHTEST] smart=${SMART_MYTHS} mythtick=${MYTH_TICK}s budget=${HOURS}h maxreal=${REAL_TIME_LIMIT_MS / 60000}min`);
  for (const act of [1, 2, 3, "ragnarok"]) {
    for (const m of MYTHS.filter((x) => x.act === act)) {
      if (timedOut()) { console.log(`[MYTHTEST] STOP temps reel`); break; }
      const t0 = VT, real0 = realNow();
      const unlocked = isMythUnlocked(m);
      let ok = false;
      if (unlocked) { r.attempted++; ok = await tryCompleteMyth(m, rec, prof); if (ok) { r.completed++; r.done.push(m.id); } }
      const tag = !unlocked ? "VERROUILLE (acte precedent incomplet)" : ok ? "OK" : "ECHEC";
      console.log(`[MYTHTEST] ${String(act).padEnd(8)} ${m.name.replace("Le Mythe ", "").padEnd(22)} -> ${tag}  (${fmtDuration(VT - t0)} virt, ${((realNow() - real0) / 1000).toFixed(0)}s reel)`);
    }
  }
  console.log(`[MYTHTEST] Total : ${r.completed}/${MYTHS.length} Mythes completes par le bot.`);
  process.exit(0);
}

const order = (argv.profile && PROFILES[argv.profile]) ? [argv.profile] : Object.keys(PROFILES);
console.log(`[SIM-10] Budget=${HOURS}h virtuelles/profil | tick=${TICK}s | maxreal=${REAL_TIME_LIMIT_MS / 60000}min | arbre=${RUIN_TREE_TOTAL} noeuds | profils=${order.length}`);

const recs = {};
for (const id of order) {
  const prof = { ...PROFILES[id], _id: id };
  process.stdout.write(`[SIM-10] ${prof.label} ... `);
  const rec = await runProfile(prof);
  recs[id] = rec;
  const f = rec.final;
  const mr = mythResults[id] || { completed: 0, attempted: 0 };
  console.log(`${fmtDuration(f.vt)} virt | cyc=${f.cycles} dyn=${f.dynastyCount} GR=${f.grandResetCount} ` +
    `arbre=${f.treeOwned}/${RUIN_TREE_TOTAL} mythes=${mr.completed}/${MYTHS.length} (${(rec.realMs / 1000).toFixed(0)}s reel)`);
}

// ---------------------------------------------------------------------------
// 12. Rapport markdown : course-gr1-profils.md
// ---------------------------------------------------------------------------
function ms(rec, key) {
  const m = rec.milestones.find((x) => x.key === key);
  return m ? fmtDuration(m.vt) : "—";
}
function truncated(rec) { return rec.final.vt < BUDGET_SECONDS * 0.98 && rec.realMs >= REAL_TIME_LIMIT_MS; }

const JALONS = [
  ["gr_1", "Grand Reset 1"],
  ["tree_complete", "Arbre de Ruines complet"],
  ["act_1", "Acte I des Mythes"],
  ["act_2", "Acte II des Mythes"],
  ["act_3", "Acte III des Mythes"],
  ["all_myths", "Tous les Mythes"],
  ["gr_10", "Grand Reset 10"],
  ["gr_11", "Grand Reset 11 (Ragnarok)"]
];

let md = `# Course au Grand Reset (et au-dela) — 10 profils de joueur

> Genere par \`sim-10-profils.js\` — budget ${HOURS} h virtuelles/profil, pas ${TICK} s, plafond temps reel ${REAL_TIME_LIMIT_MS / 60000} min/profil.
> **Toutes les valeurs viennent des vraies formules du jeu** (\`src/game/**\`), pilotees par le moteur reel
> (tick -> crise -> effondrement -> ruines -> dynastie -> Grand Reset -> Mythes). Aucune formule recopiee.
> Effondrement FIDELE : on tient la Rupture pendant la croissance, on lache au moment voulu et la jauge
> monte d'elle-meme jusqu'a l'ouverture de la crise — on ne force jamais une jauge a la main pour declencher la chute.
> Un "—" = jalon **non atteint** dans le budget (de temps virtuel OU de temps reel de calcul). \`(tronque)\` = stoppe par le plafond temps reel.

## Jalons par profil (temps virtuel pour les atteindre)

| Profil | ${JALONS.map(([, l]) => l).join(" | ")} |
|---|${JALONS.map(() => "---").join("|")}|
`;
for (const id of order) {
  const rec = recs[id];
  md += `| ${PROFILES[id].label} | ${JALONS.map(([k]) => ms(rec, k)).join(" | ")} |\n`;
}

md += `\n## Synthese finale par profil\n
| Profil | Temps simule | Cycles | Dynasties | GR | Arbre | Mythes | Legitimite | Ruines | Mult global | Calcul reel |
|---|---|---|---|---|---|---|---|---|---|---|
`;
for (const id of order) {
  const rec = recs[id]; const f = rec.final;
  const mr = mythResults[id] || { completed: 0 };
  md += `| ${PROFILES[id].label} | ${fmtDuration(f.vt)}${truncated(rec) ? " (tronque)" : ""} | ${f.cycles} | ${f.dynastyCount} | ${f.grandResetCount} | ${f.treeOwned}/${RUIN_TREE_TOTAL} | ${mr.completed}/${MYTHS.length} | ${fmt(f.legitimacy)} | ${fmt(f.ruins)} | x${fmt(f.globalMult)} | ${(rec.realMs / 1000).toFixed(0)} s |\n`;
}

md += `\n## Definition des profils (les "boutons" de comportement)\n
| Profil | Cycle vise | Gere la Rupture | Sabotage | Intention |
|---|---|---|---|---|
`;
for (const id of order) {
  const p = PROFILES[id];
  md += `| ${p.label} | ${p.afk ? "organique" : fmtDuration(p.growSeconds)} | ${p.manage ? `oui (<${p.manageBelow})` : "non"} | ${p.sabotage ? `palier ${p.sabotageTier}` : "non"} | ${p.desc} |\n`;
}

// Détail des Mythes complétés par profil + comptage par acte.
const ACT_COUNT = { 1: MYTHS.filter((m) => m.act === 1).length, 2: MYTHS.filter((m) => m.act === 2).length, 3: MYTHS.filter((m) => m.act === 3).length, ragnarok: MYTHS.filter((m) => m.act === "ragnarok").length };
md += `\n## Mythes — detail par profil\n
> Gating dur : l'**Acte II** exige TOUT l'Acte I (${ACT_COUNT[1]} Mythes) complete ; l'Acte III exige tout l'Acte II (${ACT_COUNT[2]}) ; le **Ragnarok / GR11** exige TOUS les Mythes principaux (${ACT_COUNT[1] + ACT_COUNT[2] + ACT_COUNT[3]}). Le gate des Grand Resets monte aussi : GR3 = 1 Mythe, GR4 = 2, … GR10 = 8.

| Profil | Mythes completes (bot) | Lesquels |
|---|---|---|
`;
for (const id of order) {
  const r = mythResults[id];
  const done = (r && r.done) ? r.done.map((mid) => getMythById(mid)?.name.replace("Le Mythe ", "") || mid) : [];
  md += `| ${PROFILES[id].label} | ${done.length}/${MYTHS.length} | ${done.length ? done.join(", ") : "—"} |\n`;
}

md += `\n## Lecture
- **Effondrement (\`ruinGain\`)** recompense l'age du cycle (patience), la profondeur de population et la **preparation a l'effondrement** (\`collapsePreparation\`, plafonnee a ${num(2.4)}). Les profils qui *tiennent puis sabordent* (Theoricien, Chasseur de meta, Prudent) doivent donc gagner plus de Ruines par cycle que ceux qui spamment (Casse-cou, Relanceur).
- **Legitimite (\`legitimacyGain\`)** = floor((ruines/160)^0.5 + cycles/12 + floor(dynasties/5)), gagnee en **fondant une dynastie** (seuil de ruines croissant ×1.4/fondation). Le GR1 exige ${num(300)} legitimite + l'upgrade \`grand_reset\`.
- **Grand Reset** : cout en legitimite ×2 par GR (GR2 : 600, GR3 : 1200…), remet \`cycles\` a 0 (donc le terme cycles/12 se reconstruit a chaque boucle). A partir du GR3, chaque GR exige un Mythe complete de plus ; le GR11 exige l'heritage Ragnarok (tous les Mythes).
- **Le vrai mur n'est pas le temps : c'est l'Acte I des Mythes.** Tant que les ${ACT_COUNT[1]} Mythes de l'Acte I ne sont pas TOUS completes, l'Acte II reste verrouille, donc l'Acte III, le Ragnarok et le GR11 le sont aussi ; et le gate des GR profonds (GR5 = 3 Mythes … GR10 = 8) est sature. Un pilote mecanique ne boucle qu'une partie de l'Acte I (objectifs sur-mesure : migration d'Enee, declin d'Hephaistos, equilibre de l'Age d'Or…), d'ou les **—** sur Acte II+/GR10/GR11. C'est une mesure de la difficulte de ces Mythes pour un jeu "automatique", a confronter au ressenti humain.
- Un jalon **—** peut aussi venir d'un budget temps reel court : relancer avec \`--maxreal\` plus grand pour distinguer "trop lent" de "pas eu le temps de calculer".

## Limites honnetes
- Le pilote de Mythes joue agressivement mais n'egale pas un humain : un Mythe non complete signale un objectif non atteint *par le bot*, pas forcement un Mythe impossible (chaque \`onCollapse()\` a une condition sur-mesure, cf. \`data/myths.js\`).
- Le pas de ${TICK} s rend les temps absolus approximatifs (±1 tick par transition) ; le **classement** entre profils est robuste.
`;

fs.writeFileSync("course-gr1-profils.md", md, "utf8");
console.log(`[SIM-10] Ecrit : course-gr1-profils.md${MLOG ? " + " + MLOG : ""}`);
