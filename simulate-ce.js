"use strict";
/* ============================================================================
 * simulate-ce.js - Simulateur headless + tableau de bord d'equilibrage pour
 * "Civilisation Effondrement" (CE).
 *
 * N'utilise AUCUN navigateur : il monte des stubs DOM minimalistes puis importe
 * directement les vraies formules du jeu (src/game/**) pour faire tourner la
 * boucle complete (tick -> crise -> effondrement -> ruines -> dynastie -> grand
 * reset -> mythes) et en extraire des jalons horodates, des courbes et une
 * analyse d'equilibrage.
 *
 * Sorties :
 *   - simulation-report.html  (interactif, SVG inline)
 *   - balance-summary.md
 *
 * Usage :
 *   node simulate-ce.js [--hours=24] [--scenario=all|idle|optimized|no-mythes]
 *                       [--maxreal=8] [--debug]
 *
 * Toutes les formules proviennent du code de jeu (referencees en commentaire).
 * Ce qui n'est pas simulable de facon fiable est FLAGGE, jamais invente.
 * ========================================================================== */

import fs from "fs";

// ---------------------------------------------------------------------------
// 0. Stubs d'environnement (doivent exister AVANT les import() du jeu)
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
// 1. Import des vraies formules du jeu
// ---------------------------------------------------------------------------
const { buildings, dynastyNames } = await import("./src/game/data/buildings.js");
const { upgrades, dogmaIds, PRESTIGE_DOGMAS, PRESTIGE_TREE_BRANCHES } = await import("./src/game/data/upgrades.js");
const { eras } = await import("./src/game/data/world.js");
const myth = await import("./src/game/data/myths.js");
const { MYTHS, getMythById, isMythUnlocked, isMythCompleted } = myth;

const stateModule = await import("./src/game/core/state.js");
const { state, defaultState, invalidateRenderCache, setGamePaused, setCollapseInProgress, setBuyAmount, setState } = stateModule;

const { registerChoiceDialog } = await import("./src/game/core/choiceDialog.js");
registerChoiceDialog((dialog) => {
  const opts = dialog.options || [];
  // Crises narratives : ce sont les options porteuses d'un apply() + d'un detail
  // chiffre. Un joueur optimise prefere une option STABILISANTE (Rupture -) qui
  // NE draine PAS la Legitimite (la monnaie de prestige) ni la Population.
  const isCrisisEvent = opts.length > 1 && opts.every((o) => typeof o.apply === "function");
  let picked = opts[0];
  if (isCrisisEvent) {
    // Detection ASCII-robuste (evite les pieges d'encodage sur "Legitimite").
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
  dynastyRuinsThreshold, grandResetLegitimacyCost, grandResetMythsRequired, completedMythCount
} = mech;

const { canPayCost, payCost, fmt, clamp01 } = await import("./src/game/core/utils.js");
const { D, toNum } = await import("./src/game/core/num.js");
const actions = await import("./src/game/core/actions.js");
const {
  buyUpgrade, completeCollapse, tick, foundDynasty, performGrandReset,
  activateMyth, migrerEnee, chronicle, runCrisisAction
} = actions;
const { generateEpitaph } = await import("./src/game/core/events.js");

// Pont d'effets world.js <-> core/ (normalement cable par main.js, absent en
// headless). Sans ca, les apply() des crises narratives levent (effects.state
// === null) et laissent le jeu en pause -> aucune progression.
const { registerWorldEffects } = await import("./src/game/data/worldEffects.js");
const { addProductionPenalty, amplifyRuptureFactor } = mech;
registerWorldEffects({ addProductionPenalty, chronicle, amplifyRuptureFactor, clamp01, state });

// ---------------------------------------------------------------------------
// 2. CLI
// ---------------------------------------------------------------------------
const argv = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)=?(.*)$/);
  return m ? [m[1], m[2] === "" ? true : m[2]] : [a, true];
}));
const HOURS = Number(argv.hours) || 24;
const SCENARIO = (argv.scenario && argv.scenario !== true) ? String(argv.scenario) : "all";
const BUDGET_SECONDS = HOURS * 3600;

// ---------------------------------------------------------------------------
// 3. Constantes du moteur de simulation
// ---------------------------------------------------------------------------
const TICK = Number(argv.tick) || 5; // secondes virtuelles par tick
const SAMPLE_EVERY = 120;       // echantillonnage des courbes (s virtuelles)
const CYCLE_HARD_CAP = 4 * 3600; // garde-fou : 4 h virtuelles max par cycle
const GROW_SECONDS = 600;        // duree de croissance avant de laisser la crise emporter la cite (profil par defaut)

// Profil de jeu courant (style d'effondrement). growSeconds = combien de temps on
// tient la Rupture pour faire grossir la cite avant de la laisser tomber ;
// manage = utilise les actions de crise. Differents profils = differents pacings.
let PROFILE = { id: "balanced", label: "Equilibre", growSeconds: GROW_SECONDS, manage: true };
let starveMode = false; // force la famine en fin de cycle pour declencher l'effondrement
const bldById = Object.fromEntries(buildings.map((b) => [b.id, b]));
const PROFILES = {
  rusher:   { id: "rusher",   label: "Rusher (effondre tot)",      growSeconds: 0,    manage: false },
  balanced: { id: "balanced", label: "Equilibre (~10 min/cycle)",  growSeconds: 600,  manage: true },
  patient:  { id: "patient",  label: "Patient (~30 min/cycle)",    growSeconds: 1800, manage: true }
};
const TREE_PHASE_NODES = 22;    // nb de noeuds d'arbre avant de prioriser les dynasties
const MAX_CYCLES = 200000;      // garde-fou
const REAL_TIME_LIMIT_MS = (Number(argv.maxreal) || 8) * 60 * 1000; // budget temps reel

// ---------------------------------------------------------------------------
// 4. Helpers temps / mesure
// ---------------------------------------------------------------------------
let VT = 0;                      // temps virtuel (s) depuis le debut du scenario
const ORIGINAL_NOW = Date.now;   // horloge reelle, capturee avant tout patch
const realNow = () => ORIGINAL_NOW.call(Date);
const REAL_START = realNow();
const CLOCK_BASE = REAL_START;
let scenarioRealStart = REAL_START;   // budget temps reel PAR scenario
function setClock() { Date.now = () => CLOCK_BASE + VT * 1000; }
setClock();
const flush = () => new Promise((r) => setImmediate(r));

// Watchdog + heartbeat sur TIMERS REELS (independants de la boucle sync) : si la
// boucle async se fige sur un await, le garde-temps interne (sync) ne s'evalue
// jamais -> ces timers garantissent qu'on ne tourne pas indefiniment et montrent
// le dernier etat connu. Les jalons exacts sont deja dans milestones-live.tsv.
const HARD_DEADLINE_MS = REAL_TIME_LIMIT_MS * 4 + 120000;
if (argv.heartbeat || argv.mlog) {
  const hb = setInterval(() => {
    const line = `[HB] reel=${Math.round((realNow() - REAL_START) / 1000)}s cyc=${state.cycles} VT=${fmtDurationSafe(VT)} ` +
      `inst=${(state.instability || 0).toFixed(2)} paused=${stateModule.gamePaused} myth=${state.activeMythId || "-"} GR=${state.grandResetCount || 0} dyn=${state.dynastyCount || 0}\n`;
    process.stderr.write(line);
    try { fs.appendFileSync("heartbeat.log", line); } catch { /* */ }
  }, 10000);
  hb.unref?.();
}
const watchdog = setTimeout(() => {
  process.stderr.write(`[WATCHDOG] deadline reelle (${HARD_DEADLINE_MS / 60000}min) atteinte, sortie forcee. Jalons dans milestones-live.tsv.\n`);
  process.exit(3);
}, HARD_DEADLINE_MS);
watchdog.unref?.();
function fmtDurationSafe(s) { try { return fmtDuration(s); } catch { return s + "s"; } }
// Trace synchrone : ecrase trace.log a chaque etape -> en cas de gel sync, le
// fichier montre la DERNIERE etape entree (donc celle qui bloque).
const TRACE = argv.trace ? "trace.log" : null;
let traceN = 0;
function trace(s) { if (TRACE) { try { fs.appendFileSync(TRACE, `#${traceN++} ${s} cyc=${state.cycles} VT=${VT} inst=${(state.instability || 0).toFixed(3)}\n`); } catch { /* */ } } }

function num(x) { const n = toNum(x); return Number.isFinite(n) ? n : Number.MAX_VALUE; }
function sumRates() {
  const r = rates();
  return num(r.population) + num(r.food) + num(r.gold) + num(r.knowledge) + num(r.infrastructure);
}
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
function timedOut() { return realNow() - scenarioRealStart > REAL_TIME_LIMIT_MS; }

function activeAutomations() {
  const out = [];
  if (has("intendant_de_crise")) out.push("Intendant de crise (effondrement auto 10 min, 55%)");
  if (has("conseil_de_regence")) out.push("Conseil de regence (auto 6 min + rationnement, 80%)");
  if (has("memoire_institutionnelle")) out.push("Memoire institutionnelle (auto 3 min, 100%)");
  if (has("protocoles_urgence")) out.push("Protocoles de stabilisation (rationnement/recensement auto)");
  if (has("conservateurs_ruines")) out.push("Archivistes des Ruines (achat auto 1er upgrade au collapse)");
  if (state.hephHeritage) out.push("Automates (Hephaistos) - achat/crise auto");
  if (state.phoenixHeritage) out.push("Script d'effondrement (Phenix)");
  return out;
}

function snapshot() {
  const r = rates();
  return {
    vt: VT, real: fmtDuration(VT),
    cycles: state.cycles, dynastyCount: state.dynastyCount,
    grandResetCount: state.grandResetCount || 0,
    eraIndex: currentEraIndex(), bestEraIndex: state.bestEraIndex || 0,
    era: eras[currentEraIndex()].name,
    population: num(state.population), food: num(state.food), gold: num(state.gold),
    knowledge: num(state.knowledge), infrastructure: num(state.infrastructure),
    ruins: num(state.ruins), legitimacy: state.legitimacy,
    globalMult: globalMultiplier(),
    prodTotal: num(r.population) + num(r.food) + num(r.gold) + num(r.knowledge) + num(r.infrastructure),
    prodRates: {
      population: num(r.population), food: num(r.food), gold: num(r.gold),
      knowledge: num(r.knowledge), infrastructure: num(r.infrastructure)
    },
    ruinTreeOwned: ownedRuinTreePurchaseCount(),
    dogmasOwned: PRESTIGE_DOGMAS.filter((d) => has(d.id)).length,
    automations: activeAutomations()
  };
}

// ---------------------------------------------------------------------------
// 5. Acheteurs (economie, arbre de ruines, dogmes, heritage)
// ---------------------------------------------------------------------------
function buyBuildings() {
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

  // Echelle d'expansion : un facteur plancher eleve garantit qu'on depasse les
  // ~65 batiments qui annulent la "grace de fondation" (pressureBreakdown), sans
  // quoi la Rupture plafonne sous 1 et aucune crise ne s'ouvre jamais.
  // Mode "famine forcee" : tard, une cite sur-nourrie ne declenche plus de crise
  // (scarcity=0, Usure gelee par l'infra). Pour forcer l'effondrement, on cesse
  // d'acheter des batiments producteurs de Nourriture : la population continue de
  // croitre, le ratio nourriture/pop chute -> scarcity monte -> Rupture -> crise.
  if (starveMode) for (const id of Object.keys(t)) {
    const bd = bldById[id];
    if (bd && (bd.food || 0) > 0) delete t[id];
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

function buyRuinTree(keepReserveRuins = 0) {
  let bought = 0;
  for (let pass = 0; pass < 6; pass++) {
    if (TRACE) fs.writeFileSync(TRACE, `D:buyTree pass=${pass} bought=${bought} cyc=${state.cycles} ruins=${fmt(num(state.ruins))}\n`);
    let changed = false;
    const affordable = upgrades
      .filter((u) => u.group === "ruins" && !dogmaIds.has(u.id) && canBuyUpgrade(u))
      .sort((a, c) => (a.cost.ruins || 0) - (c.cost.ruins || 0));
    for (const u of affordable) {
      if (D(state.ruins).sub(u.cost.ruins || 0).lt(keepReserveRuins)) continue;
      buyUpgrade(u.id); bought++; changed = true;
      if (bought > 2000) return bought; // garde-fou
    }
    for (const d of PRESTIGE_DOGMAS) {
      if (checkDogmaAvailability(d.id) === "available") { buyUpgrade(d.id); bought++; changed = true; }
    }
    if (!changed) break;
  }
  return bought;
}

// protocoles_urgence est re-achete depuis le reequilibrage anti-degenerescence
// (cooldown 60 s + rendements decroissants) : l'automation ne peut plus
// verrouiller la jauge sous le seuil de crise. Sa presence VALIDE le correctif.
const HERITAGE_ORDER = [
  "reforme_administrative", "protocoles_urgence", "reseau_routes", "codex_mythique",
  "conservateurs_ruines", "rituel_effondrement", "grand_reset"
];
function buyHeritage() {
  for (const id of HERITAGE_ORDER) {
    if (TRACE) trace("F1:" + id);
    const u = upgrades.find((x) => x.id === id);
    if (u && canBuyUpgrade(u)) buyUpgrade(id);
  }
}

// ---------------------------------------------------------------------------
// 6. Effondrement direct (sans sequence d'animation)
// ---------------------------------------------------------------------------
function doCollapse(reason = "auto") {
  const gain = ruinGain();
  if (D(gain).lte(0)) return false;
  completeCollapse(gain, dynastyNames[state.dynastyCount % dynastyNames.length], generateEpitaph(), reason);
  setGamePaused(false);
  setCollapseInProgress(false);
  return true;
}

// ---------------------------------------------------------------------------
// 7. Enregistreur de jalons + series temporelles
// ---------------------------------------------------------------------------
const MLOG = argv.mlog ? (typeof argv.mlog === "string" ? argv.mlog : "milestones-live.tsv") : null;
if (MLOG) fs.writeFileSync(MLOG, "temps_virtuel\tjalon\tcycle\tage\tGR\tdynasties\tlegitimite\tmult_global\tprod_s\n", "utf8");

function makeRecorder() {
  return {
    series: [], milestones: [], seenEra: new Set(), seenDogmaThreshold: new Set(), nextSample: 0,
    record(key, label, extra = {}) {
      if (this.milestones.some((m) => m.key === key)) return;
      const ms = { key, label, ...snapshot(), ...extra };
      this.milestones.push(ms);
      if (MLOG) fs.appendFileSync(MLOG, `${fmtDuration(ms.vt)}\t${label}\t${ms.cycles}\t${ms.era}\t${ms.grandResetCount}\t${ms.dynastyCount}\t${fmt(ms.legitimacy)}\tx${fmt(ms.globalMult)}\t${fmt(ms.prodTotal)}\n`);
    },
    maybeSample() {
      if (VT >= this.nextSample) { this.series.push(snapshot()); this.nextSample = VT + SAMPLE_EVERY; }
    },
    checkPassiveMilestones() {
      const ei = currentEraIndex();
      if (!this.seenEra.has(ei)) {
        this.seenEra.add(ei);
        this.record(`era_${ei}`, `Age atteint : ${eras[ei].name} (palier ${ei})`, { kind: "era" });
      }
      if (state.dynastyCount >= 1) this.record("dynasty_1", "Dynastie 1 fondee", { kind: "dynasty" });
      if (state.dynastyCount >= 10) this.record("dynasty_10", "Dynastie 10 fondee", { kind: "dynasty" });
      const gr = state.grandResetCount || 0;
      if (gr >= 1) this.record("gr_1", "Grand Reset 1", { kind: "grandreset" });
      if (gr >= 10) this.record("gr_10", "Grand Reset 10", { kind: "grandreset" });
      if (gr >= 11) this.record("gr_11", "Grand Reset 11 (post-Mythes)", { kind: "grandreset" });
      for (const branch of PRESTIGE_TREE_BRANCHES) {
        const owned = ownedRuinBranchPurchaseCount(branch.id);
        for (const th of [10, 20, 30]) {
          const k = `dogma_${branch.id}_${th}`;
          if (owned >= th && !this.seenDogmaThreshold.has(k)) {
            this.seenDogmaThreshold.add(k);
            this.record(`ruins_threshold_${th}_${branch.id}`,
              `Palier ${th} ruines achete - branche ${branch.name}`, { kind: "dogma_threshold", threshold: th, branch: branch.name });
          }
        }
      }
      if ((state.grandResetCount || 0) >= 1) {
        this.record("myth_unlocked", "Premiers Mythes debloques (Acte I disponible)", { kind: "myth" });
      }
      const names = { 1: "Fondation", 2: "Domination", 3: "Apocalypse" };
      for (const act of [1, 2, 3]) {
        const list = MYTHS.filter((m) => m.act === act);
        if (list.length && list.every((m) => isMythCompleted(m.id))) {
          this.record(`act_${act}_done`, `Acte ${act} (${names[act]}) - tous les Mythes completes`, { kind: "myth" });
        }
      }
      if (MYTHS.some((m) => m.act === 1)
          && MYTHS.filter((m) => [1, 2, 3].includes(m.act)).every((m) => isMythCompleted(m.id))) {
        this.record("all_myths", "Tous les Mythes (Acte I->III) completes", { kind: "myth" });
      }
    }
  };
}

// ---------------------------------------------------------------------------
// 8. Reinitialisation propre d'un scenario
// ---------------------------------------------------------------------------
function resetScenario() {
  VT = 0; scenarioRealStart = realNow(); setClock();
  setState(defaultState());
  setGamePaused(false); setCollapseInProgress(false); setBuyAmount(100);
  invalidateRenderCache("all");
}

// ---------------------------------------------------------------------------
// 9. Joue un cycle jusqu'a l'ouverture de la crise terminale (crisisOpen).
//    On ne peut PAS gagner de ruines avant une crise (ruinGain()==0 sinon),
//    donc on construit jusqu'a ce que Rupture OU Usure atteigne 1. Les crises
//    narratives 25/50/75 % ouvrent des dialogues asynchrones (gamePaused) -> on
//    vide la micro-task queue pour les laisser se resoudre (handler = options[0]).
// ---------------------------------------------------------------------------
async function resolvePause() {
  let f = 0;
  while (stateModule.gamePaused && !crisisOpen() && f++ < 10) await flush();
}

// Gestion active de la Rupture : un joueur optimise utilise les actions de crise
// (Reformes/Recensement/Rationnement/Festivals) pour tenir l'instabilite sous le
// seuil terminal et laisser la cite GRANDIR (eres, population) avant d'effondrer
// au sommet -> bien plus de Ruines (peakPopulation + patience dans ruinGain()).
function manageRupture() {
  for (const id of ["reforms", "census", "rationing", "festivals"]) {
    if (state.instability <= 0.6) break;
    try { runCrisisAction(id, { render: false }); } catch { /* noop */ }
  }
}

async function playCycleUntilCollapse(rec, { buyEconomy = true, grow = true } = {}) {
  const cycleStartVT = VT;
  starveMode = false;
  let guard = 0;
  while (guard++ < 500000) {
    if (crisisOpen()) break;
    if (VT - cycleStartVT >= CYCLE_HARD_CAP) {
      if (argv.debug) {
        const p = mech.pressureBreakdown();
        console.error(`  [STALL] cyc=${state.cycles} inst=${state.instability.toFixed(3)} target=${(p.total).toFixed(3)} ` +
          `scarcity=${p.scarcity.toFixed(2)} ineq=${p.inequality.toFixed(2)} complex=${p.complexity.toFixed(2)} ` +
          `dissent=${p.dissent.toFixed(2)} struct=${p.structural.toFixed(2)} mitig=${p.mitigation.toFixed(2)} wear=${(state.timeWear||0).toFixed(3)}`);
      }
      break;
    }
    if (VT >= BUDGET_SECONDS) break;
    if (timedOut()) break;
    if (stateModule.gamePaused) { await resolvePause(); if (stateModule.gamePaused) break; continue; }
    if (buyEconomy) buyBuildings();
    // Phase de croissance : on tient la Rupture ; passe GROW_SECONDS on relache
    // et la cite finit par s'effondrer au sommet de sa puissance.
    if (grow && PROFILE.manage && (VT - cycleStartVT) < PROFILE.growSeconds && state.instability > 0.7) manageRupture();
    setClock();
    tick(TICK);
    VT += TICK;
    if (stateModule.gamePaused && !crisisOpen()) await resolvePause();
    if (rec && (guard & 3) === 0) { rec.maybeSample(); rec.checkPassiveMilestones(); }
  }
  if (rec) { rec.maybeSample(); rec.checkPassiveMilestones(); }
}

// ---------------------------------------------------------------------------
// 10. Pilotage des Mythes (best-effort, honnete sur les echecs)
// ---------------------------------------------------------------------------
// Chaque Mythe a une condition onCollapse() bespoke (cf. data/myths.js). On
// active le pacte, on joue un cycle "fort", on applique l'action specifique si
// elle existe, puis on effondre. On enregistre succes/echec sans rien inventer.
const mythDelta = []; // { id, name, act, before, after, completed }

async function tryCompleteMyth(m, rec) {
  if (isMythCompleted(m.id) || !isMythUnlocked(m)) return isMythCompleted(m.id);

  const before = { globalMult: globalMultiplier(), prodTotal: sumRates(), vt: VT };
  try {
    await activateMyth(m.id);
  } catch (e) {
    mythDelta.push({ id: m.id, name: m.name, act: m.act, error: String(e?.message || e), completed: false });
    return false;
  }

  const maxCycles = m.id === "mythe_du_phenix" ? 22 : 4;
  for (let c = 0; c < maxCycles && state.activeMythId; c++) {
    const startVT = VT;
    let g = 0;
    while (g++ < 500000 && !crisisOpen() && state.activeMythId) {
      if (VT - startVT >= CYCLE_HARD_CAP) break;
      if (VT >= BUDGET_SECONDS || timedOut()) break;
      if (stateModule.gamePaused) { await resolvePause(); if (stateModule.gamePaused) break; continue; }
      buyBuildings();
      if (m.id === "mythe_d_enee" && state.eneeDegraded) { try { migrerEnee(); } catch { /* noop */ } }
      setClock(); tick(TICK); VT += TICK;
      if (stateModule.gamePaused && !crisisOpen()) await resolvePause();
      if (rec) { rec.maybeSample(); rec.checkPassiveMilestones(); }
    }
    if (!doCollapse("auto")) break;
    if (rec) rec.checkPassiveMilestones();
    if (isMythCompleted(m.id)) break;
    if (VT >= BUDGET_SECONDS || timedOut()) break;
    if (!state.activeMythId && !isMythCompleted(m.id) && m.id !== "mythe_du_phenix") {
      try { await activateMyth(m.id); } catch { break; }
    }
  }

  const completed = isMythCompleted(m.id);
  const after = { globalMult: globalMultiplier(), prodTotal: sumRates(), vt: VT };
  mythDelta.push({
    id: m.id, name: m.name, act: m.act, objectif: m.objectif, heritage: m.heritageDescription,
    before, after, completed
  });
  return completed;
}

async function driveMyths(rec) {
  if ((state.grandResetCount || 0) < 1) return;
  for (const act of [1, 2, 3]) {
    for (const m of MYTHS.filter((x) => x.act === act)) {
      if (VT >= BUDGET_SECONDS || timedOut()) return;
      await tryCompleteMyth(m, rec);
    }
    rec.checkPassiveMilestones();
  }
}

// ---------------------------------------------------------------------------
// 11. Scenarios
// ---------------------------------------------------------------------------
async function runOptimized({ withMyths = true, profile = PROFILES.balanced } = {}) {
  PROFILE = profile;
  resetScenario();
  const rec = makeRecorder();
  rec.profile = profile;
  rec.checkPassiveMilestones();
  let mythsDriven = false;
  let mythPasses = 0;
  let collapseFails = 0;

  while (VT < BUDGET_SECONDS && state.cycles < MAX_CYCLES) {
    if (timedOut()) break;

    trace("A:playCycle");
    await playCycleUntilCollapse(rec, { buyEconomy: true });
    trace("B:post-playCycle");
    if (argv.debug && state.cycles % 25 === 0) {
      console.error(`  [dbg] cyc=${state.cycles} VT=${fmtDuration(VT)} bestEra=${eras[state.bestEraIndex || 0].name} ` +
        `tree=${ownedRuinTreePurchaseCount()} ruins=${fmt(num(state.ruins))} legit=${fmt(state.legitimacy)} ` +
        `dyn=${state.dynastyCount} GR=${state.grandResetCount || 0}`);
    }
    if (VT >= BUDGET_SECONDS) break;
    if (!crisisOpen()) break; // cap atteint sans crise : on arrete proprement
    trace("C:doCollapse");
    // Degenerescence tardive : si l'economie est si forte que la Rupture atteint
    // 100 % avant que le cycle n'ait 120 s, le pic de population est minuscule et
    // ruinGain() retombe a 0. completeCollapse n'est alors PAS appele -> sans
    // garde-fou, la boucle tourne a l'infini. On apaise la crise pour laisser la
    // cite vieillir/grossir ; apres N echecs consecutifs on arrete proprement.
    if (!doCollapse("forced")) {
      collapseFails++;
      for (let k = 0; k < 12 && state.instability >= 1; k++) manageRupture();
      state.instability = Math.min(state.instability, 0.5);
      if (collapseFails >= 8) {
        if (argv.debug) console.error(`  [STOP] effondrement sans gain (degenerescence tardive) cyc=${state.cycles} ere=${eras[state.bestEraIndex || 0].name}`);
        break;
      }
      continue;
    }
    collapseFails = 0;

    // Meta-progression (seuil de dynastie desormais croissant intra-GR)
    trace("D:buyTree");
    const treeOwned = ownedRuinTreePurchaseCount();
    if (treeOwned < TREE_PHASE_NODES) {
      buyRuinTree(0);
    } else {
      buyRuinTree(dynastyRuinsThreshold());
      if (legitimacyGain() > 0) { trace("E:foundDynasty"); await foundDynasty(); }
    }
    trace("F:buyHeritage");
    buyHeritage();
    trace("F2:checkMilestones");
    rec.checkPassiveMilestones();
    trace("F3:doneMeta");

    const nextGR = (state.grandResetCount || 0) + 1;
    const grUnlocked = has("grand_reset") && (state.grandResetCount || 0) < (state.ragnarokHeritage ? 11 : 10);
    if (grUnlocked && state.legitimacy >= grandResetLegitimacyCost(nextGR)
      && completedMythCount() >= grandResetMythsRequired(nextGR)) {
      trace("G:performGrandReset");
      await performGrandReset();
      rec.checkPassiveMilestones();
    }

    // Pilotage des Mythes : 1re passe au deblocage (GR1), puis nouvelles passes
    // quand le gate Mythes bloque le prochain GR (max 4 passes au total).
    const blockedByMyths = grUnlocked && completedMythCount() < grandResetMythsRequired(nextGR);
    if (withMyths && (state.grandResetCount || 0) >= 1 && mythPasses < 4 && (!mythsDriven || blockedByMyths)) {
      mythsDriven = true;
      mythPasses++;
      await driveMyths(rec);
      buyHeritage();
      rec.checkPassiveMilestones();
    }
  }
  rec.final = snapshot();
  return rec;
}

async function runIdle() {
  // Controle : aucune action manuelle. On ne fait que ticker (les automations
  // eventuelles agiraient, mais aucune n'est debloquee depuis un save vierge ->
  // c'est le plancher "automation seule").
  resetScenario();
  const rec = makeRecorder();
  rec.checkPassiveMilestones();
  let guard = 0;
  while (VT < BUDGET_SECONDS && guard++ < 10000000) {
    if (timedOut()) break;
    if (stateModule.gamePaused) { await resolvePause(); if (stateModule.gamePaused) break; continue; }
    setClock();
    tick(TICK);
    VT += TICK;
    if (stateModule.gamePaused && !crisisOpen()) await resolvePause();
    rec.maybeSample();
    rec.checkPassiveMilestones();
    if (crisisOpen()) { if (!doCollapse("forced")) break; }
  }
  rec.final = snapshot();
  return rec;
}

// ---------------------------------------------------------------------------
// 12. Execution
// ---------------------------------------------------------------------------
console.log(`[CE-SIM] Budget=${HOURS}h virtuelles, scenario=${SCENARIO}, max reel=${REAL_TIME_LIMIT_MS / 60000}min`);
const results = {};

// --- Mode --profiles : comparaison de pacing par style de jeu ----------------
if (argv.profiles) {
  const fmtMs = (rec, key) => { const m = rec.milestones.find((x) => x.key === key || x.key.startsWith(key)); return m ? fmtDuration(m.vt) : "non atteint"; };
  const order = ["idle", ...Object.keys(PROFILES)];
  const recs = {};
  for (const pid of order) {
    console.log(`[CE-SIM] Profil ${pid}...`);
    recs[pid] = pid === "idle" ? await runIdle() : await runOptimized({ withMyths: true, profile: PROFILES[pid] });
    const f = recs[pid].final;
    console.log(`  -> ${fmtDuration(f.vt)} virtuel | cycles=${f.cycles} dyn=${f.dynastyCount} GR=${f.grandResetCount} bestAge=${eras[f.bestEraIndex].name}`);
  }
  // Lignes de jalons
  const MS = [
    ["bestAge", "Age max atteint"], ["dynasty_1", "Dynastie 1"], ["dynasty_10", "Dynastie 10"],
    ["ruins_threshold_10_", "Dogme palier 10"], ["ruins_threshold_20_", "Dogme palier 20"], ["ruins_threshold_30_", "Dogme palier 30"],
    ["gr_1", "Grand Reset 1 (= Mythes debloques)"], ["gr_10", "Grand Reset 10"], ["gr_11", "Grand Reset 11"],
    ["all_myths", "Tous les Mythes completes"]
  ];
  const profLabel = (pid) => pid === "idle" ? "Idle" : PROFILES[pid].label;
  let pmd = `# Pacing par profil de joueur - jalons horodates (temps virtuel)

> Genere par \`simulate-ce.js --profiles\` (budget reel ${REAL_TIME_LIMIT_MS / 60000} min/profil, pas ${TICK}s).
> Chiffres EXACTS pour les jalons atteints dans le temps de calcul. La boucle de prestige de CE etant
> tres longue (GR1 ~ jours virtuels composes), les jalons profonds peuvent etre "non atteint" faute de
> temps de CALCUL reel (pas par design) : relancer avec \`--maxreal\` plus grand pour les horodater.

## Synthese finale par profil
| Profil | Temps virtuel simule | Cycles | Dynasties | GR | Age max | Mult global | Prod/s |
|---|---|---|---|---|---|---|---|
${order.map((p) => { const f = recs[p].final; return `| ${profLabel(p)} | ${fmtDuration(f.vt)} | ${f.cycles} | ${f.dynastyCount} | ${f.grandResetCount} | ${eras[f.bestEraIndex].name} | x${fmt(f.globalMult)} | ${fmt(f.prodTotal)} |`; }).join("\n")}

## Jalons horodates (temps virtuel pour les atteindre)
| Jalon | ${order.map(profLabel).join(" | ")} |
|---|${order.map(() => "---").join("|")}|
`;
  for (const [key, label] of MS) {
    const cells = order.map((p) => {
      if (key === "bestAge") { const f = recs[p].final; return `${eras[f.bestEraIndex].name} (${fmtMs(recs[p], "era_" + f.bestEraIndex)})`; }
      return fmtMs(recs[p], key);
    });
    pmd += `| ${label} | ${cells.join(" | ")} |\n`;
  }
  // Progression complete des ages pour le profil equilibre
  const balRec = recs.balanced;
  pmd += `\n## Progression des Ages (profil ${profLabel("balanced")})\n| Age | Palier | Temps virtuel |\n|---|---|---|\n`;
  balRec.milestones.filter((m) => m.kind === "era").sort((a, b) => a.eraIndex - b.eraIndex)
    .forEach((m) => { pmd += `| ${eras[m.eraIndex].name} | ${m.eraIndex} | ${fmtDuration(m.vt)} |\n`; });
  // Rythme meta mesure (pour extrapolation honnete)
  pmd += `\n## Rythme meta mesure (base d'extrapolation, NON un jalon)\n`;
  for (const p of order.filter((x) => x !== "idle")) {
    const f = recs[p].final;
    const cyclesPerVHour = f.vt > 0 ? (f.cycles / (f.vt / 3600)).toFixed(1) : "0";
    const dynRate = f.dynastyCount > 0 ? fmtDuration(f.vt / f.dynastyCount) : "n/a";
    pmd += `- **${profLabel(p)}** : ${f.cycles} cycles en ${fmtDuration(f.vt)} (${cyclesPerVHour} cycles/h virtuelle) ; `;
    pmd += `${f.dynastyCount} dynasties (~1 / ${dynRate}) ; legitimite finale ${fmt(f.legitimacy)} / 300 requis pour GR1.\n`;
  }
  pmd += `\n> **Lecture.** Le GR1 exige 300 legitimite (+~53 depensees en heritages avant). La legitimite par dynastie
> CROIT (terme \`cycles/12\` dans \`legitimacyGain\`), donc l'extrapolation lineaire sous-estime : l'ordre de grandeur
> reel du GR1 est de plusieurs jours virtuels de jeu compose. Les Mythes (donc Actes I-III, GR11) sont verrouilles
> derriere ce GR1. Pour des horodatages EXACTS de GR1+/Mythes, relancer un run long (\`--maxreal=60\`+).\n`;

  fs.writeFileSync("pacing-profiles.md", pmd, "utf8");
  console.log("[CE-SIM] Ecrit : pacing-profiles.md");
  process.exit(0);
}

const CLI_PROFILE = (argv.profile && PROFILES[argv.profile]) ? PROFILES[argv.profile] : PROFILES.balanced;
if (SCENARIO === "all" || SCENARIO === "optimized") {
  console.log(`[CE-SIM] Scenario OPTIMIZED (profil ${CLI_PROFILE.label})...`);
  results.optimized = await runOptimized({ withMyths: true, profile: CLI_PROFILE });
  const f = results.optimized.final;
  console.log(`  -> cycles=${f.cycles} dynasties=${f.dynastyCount} GR=${f.grandResetCount} ere=${f.era} ` +
    `jalons=${results.optimized.milestones.length} mythes=${mythDelta.filter((m) => m.completed).length}/${mythDelta.length}`);
}
if (SCENARIO === "all" || SCENARIO === "no-mythes") {
  console.log("[CE-SIM] Scenario NO-MYTHES...");
  results.noMythes = await runOptimized({ withMyths: false });
  const f = results.noMythes.final;
  console.log(`  -> cycles=${f.cycles} dynasties=${f.dynastyCount} GR=${f.grandResetCount} ere=${f.era}`);
}
if (SCENARIO === "all" || SCENARIO === "idle") {
  console.log("[CE-SIM] Scenario IDLE...");
  results.idle = await runIdle();
  const f = results.idle.final;
  console.log(`  -> cycles=${f.cycles} ere=${f.era}`);
}

// ---------------------------------------------------------------------------
// 13. Analyse d'equilibrage
// ---------------------------------------------------------------------------
// Cibles de pacing INDICATIVES (minutes virtuelles) - a calibrer par le designer.
// Elles servent uniquement a flagger "trop rapide / trop lent" ; ce ne sont pas
// des valeurs canoniques du jeu.
const PACING_TARGETS = {
  dynasty_1: 60, dynasty_10: 600, gr_1: 1440, gr_10: 14400, gr_11: 20000, all_myths: 12000
};

// Temps virtuel reellement simule par scenario + detection de troncature reelle.
const simulatedVT = Math.max(...["optimized", "noMythes", "idle"].filter((k) => results[k]).map((k) => results[k].final.vt), 0);
// Tronque si un scenario s'est arrete bien avant le budget virtuel demande.
const truncatedByRealTime = simulatedVT < BUDGET_SECONDS * 0.98;

function analyzeDeadZones(series, minGapSec = 600, gainThreshold = 0.05) {
  const zones = [];
  let i = 0;
  while (i < series.length - 1) {
    const a = series[i];
    let j = i + 1;
    while (j < series.length) {
      const b = series[j];
      const gain = a.prodTotal > 0 ? (b.prodTotal - a.prodTotal) / a.prodTotal : (b.prodTotal > 0 ? Infinity : 0);
      if (b.vt - a.vt >= minGapSec && gain < gainThreshold) { j++; continue; }
      break;
    }
    if (j - i > 1) {
      const b = series[j - 1];
      const gain = a.prodTotal > 0 ? (b.prodTotal - a.prodTotal) / a.prodTotal : 0;
      if (b.vt - a.vt >= minGapSec) {
        zones.push({ fromVT: a.vt, toVT: b.vt, durationSec: b.vt - a.vt, gain, fromEra: a.era, toEra: b.era });
        i = j; continue;
      }
    }
    i++;
  }
  return zones;
}

function classifyMythDef(m) {
  // Gate de progression (debloque une mecanique persistante) vs simple
  // multiplicateur, deduit du texte d'heritage (data/myths.js). Analyse statique,
  // independante de la simulation -> toujours disponible meme si le bot ne complete
  // pas le Mythe.
  const h = (m?.heritageDescription || "").toLowerCase();
  const unlocksMechanic = /d[ée]bloque|panneau|bouton|jauge|ruines actives|automat|script|11e grand reset|surchauffe|migration|nom de pouvoir|epitaphe|épitaphe/.test(h);
  return unlocksMechanic ? "gate (debloque une mecanique)" : "multiplicateur";
}
function classifyMyth(d) {
  const m = getMythById(d.id);
  const prodFactor = d.after && d.before && d.before.prodTotal > 0 ? d.after.prodTotal / d.before.prodTotal : null;
  return { type: classifyMythDef(m), prodFactor };
}

// Catalogue statique des Mythes (depuis data/myths.js) : acte, objectif, heritage,
// classification gate/multiplicateur. Sert l'analyse "chaque Mythe est-il un vrai
// gate ou un multiplicateur cosmetique ?" meme sans completion simulee.
const ACT_NAMES = { 1: "I Fondation", 2: "II Domination", 3: "III Apocalypse", ragnarok: "Ragnarok" };
const mythCatalog = MYTHS.map((m) => ({
  id: m.id, act: m.act, actName: ACT_NAMES[m.act] || String(m.act), name: m.name,
  objectif: m.objectif || "", heritage: m.heritageDescription || "",
  type: classifyMythDef(m),
  completed: isMythCompleted(m.id),
  drivenResult: mythDelta.find((d) => d.id === m.id) || null
}));

// ---------------------------------------------------------------------------
// 14. Generation des graphiques SVG inline
// ---------------------------------------------------------------------------
function svgLogLine(seriesList, accessor, { width = 820, height = 320, title = "", yLabel = "", colors = [] } = {}) {
  const pad = { l: 64, r: 16, t: 28, b: 40 };
  const W = width - pad.l - pad.r, H = height - pad.t - pad.b;
  const all = seriesList.flatMap((s) => s.data.map((p) => ({ x: p.vt, y: accessor(p) }))).filter((p) => Number.isFinite(p.y) && p.y > 0);
  if (!all.length) return `<svg viewBox="0 0 ${width} ${height}"><text x="20" y="40" fill="#888">Aucune donnee</text></svg>`;
  const xs = all.map((p) => p.x), ys = all.map((p) => Math.log10(p.y));
  const xMin = Math.min(...xs), xMax = Math.max(...xs) || 1;
  const yMin = Math.min(...ys), yMax = Math.max(...ys);
  const ySpan = (yMax - yMin) || 1;
  const X = (x) => pad.l + (xMax === xMin ? 0 : (x - xMin) / (xMax - xMin)) * W;
  const Y = (y) => pad.t + H - ((Math.log10(y) - yMin) / ySpan) * H;

  let grid = "";
  for (let k = Math.floor(yMin); k <= Math.ceil(yMax); k++) {
    const yy = pad.t + H - ((k - yMin) / ySpan) * H;
    grid += `<line x1="${pad.l}" y1="${yy}" x2="${pad.l + W}" y2="${yy}" stroke="#23304a" stroke-width="1"/>`;
    grid += `<text x="${pad.l - 8}" y="${yy + 4}" fill="#7b8aa6" font-size="11" text-anchor="end">10^${k}</text>`;
  }
  const xticks = 6;
  for (let i = 0; i <= xticks; i++) {
    const xv = xMin + (xMax - xMin) * i / xticks;
    const xx = X(xv);
    grid += `<line x1="${xx}" y1="${pad.t}" x2="${xx}" y2="${pad.t + H}" stroke="#1a2436" stroke-width="1"/>`;
    grid += `<text x="${xx}" y="${pad.t + H + 16}" fill="#7b8aa6" font-size="10" text-anchor="middle">${fmtDuration(xv)}</text>`;
  }
  let paths = "";
  seriesList.forEach((s, idx) => {
    const pts = s.data.map((p) => ({ x: p.vt, y: accessor(p) })).filter((p) => Number.isFinite(p.y) && p.y > 0);
    if (!pts.length) return;
    const color = colors[idx] || s.color || "#5bd1ff";
    const dPath = pts.map((p, i) => `${i ? "L" : "M"}${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join(" ");
    paths += `<path d="${dPath}" fill="none" stroke="${color}" stroke-width="2"/>`;
  });
  const legend = seriesList.map((s, idx) =>
    `<g transform="translate(${pad.l + idx * 180},${pad.t - 14})"><rect width="12" height="12" y="-10" fill="${colors[idx] || s.color}"/><text x="16" fill="#cdd6ea" font-size="11">${s.label}</text></g>`
  ).join("");
  return `<svg viewBox="0 0 ${width} ${height}" class="chart">
    <text x="${pad.l}" y="16" fill="#e8eefc" font-size="13" font-weight="600">${title}</text>
    ${grid}${paths}${legend}
    <text x="14" y="${pad.t + H / 2}" fill="#7b8aa6" font-size="11" transform="rotate(-90 14 ${pad.t + H / 2})" text-anchor="middle">${yLabel}</text>
  </svg>`;
}

function svgTimeline(milestones, { width = 820, height = 280, title = "" } = {}) {
  const items = milestones.filter((m) => Number.isFinite(m.vt)).sort((a, b) => a.vt - b.vt);
  if (!items.length) return `<svg viewBox="0 0 ${width} ${height}"><text x="20" y="40" fill="#888">Aucun jalon</text></svg>`;
  const pad = { l: 16, r: 16, t: 40, b: 30 };
  const W = width - pad.l - pad.r;
  const vMax = Math.max(...items.map((m) => m.vt)) || 1;
  const X = (v) => pad.l + (v / vMax) * W;
  const colorByKind = { era: "#5bd1ff", dynasty: "#ffd479", grandreset: "#ff7eb6", dogma_threshold: "#7ee787", myth: "#c08bff" };
  let out = `<line x1="${pad.l}" y1="${height - pad.b}" x2="${pad.l + W}" y2="${height - pad.b}" stroke="#2a3a57" stroke-width="2"/>`;
  items.forEach((m, i) => {
    const x = X(m.vt);
    const y = pad.t + (i % 6) * 28;
    const c = colorByKind[m.kind] || "#9fb3d1";
    out += `<line x1="${x}" y1="${y + 6}" x2="${x}" y2="${height - pad.b}" stroke="${c}" stroke-width="1" opacity="0.4"/>`;
    out += `<circle cx="${x}" cy="${height - pad.b}" r="3.5" fill="${c}"/>`;
    out += `<text x="${x + 4}" y="${y + 8}" fill="#cdd6ea" font-size="10">${m.label.slice(0, 42)} | ${fmtDuration(m.vt)}</text>`;
  });
  return `<svg viewBox="0 0 ${width} ${height}" class="chart"><text x="${pad.l}" y="18" fill="#e8eefc" font-size="13" font-weight="600">${title}</text>${out}</svg>`;
}

function svgMythDelta({ width = 820, height = 360, title = "" } = {}) {
  const data = mythDelta.filter((d) => d.before && d.after);
  if (!data.length) return `<svg viewBox="0 0 ${width} ${height}"><text x="20" y="40" fill="#888">Aucun Mythe tente</text></svg>`;
  const pad = { l: 140, r: 20, t: 30, b: 20 };
  const W = width - pad.l - pad.r, H = height - pad.t - pad.b;
  const bh = Math.min(22, H / data.length - 6);
  const factors = data.map((d) => d.after.globalMult / (d.before.globalMult || 1));
  const fMax = Math.max(2, ...factors);
  let out = `<text x="16" y="18" fill="#e8eefc" font-size="13" font-weight="600">${title}</text>`;
  data.forEach((d, i) => {
    const y = pad.t + i * (bh + 6);
    const f = d.after.globalMult / (d.before.globalMult || 1);
    const w = (Math.log10(Math.max(1, f)) / Math.log10(fMax)) * W;
    const col = d.completed ? "#7ee787" : "#5b6b88";
    const short = d.name.replace("Le Mythe de ", "").replace("Le Mythe d'", "").replace("Le Mythe du ", "").slice(0, 16);
    out += `<text x="${pad.l - 8}" y="${y + bh - 5}" fill="#cdd6ea" font-size="10" text-anchor="end">${short}</text>`;
    out += `<rect x="${pad.l}" y="${y}" width="${Math.max(2, w)}" height="${bh}" fill="${col}" rx="2"/>`;
    out += `<text x="${pad.l + Math.max(2, w) + 6}" y="${y + bh - 5}" fill="#9fb3d1" font-size="10">x${f.toFixed(2)} mult ${d.completed ? "ok" : "echec"}</text>`;
  });
  return `<svg viewBox="0 0 ${width} ${height}" class="chart">${out}</svg>`;
}

// ---------------------------------------------------------------------------
// 15. Construction des series pour les graphiques
// ---------------------------------------------------------------------------
const colorMap = { optimized: "#5bd1ff", noMythes: "#ffd479", idle: "#ff7eb6" };
const labelMap = { optimized: "Optimise", noMythes: "Sans Mythes", idle: "Idle" };
function seriesFor(keys) {
  return keys.filter((k) => results[k]).map((k) => ({ label: labelMap[k], color: colorMap[k], data: results[k].series }));
}
const prodSeries = seriesFor(["optimized", "noMythes", "idle"]);
const ruinSeries = seriesFor(["optimized", "noMythes"]);
const chartProd = svgLogLine(prodSeries, (p) => p.prodTotal, { title: "Production totale / s (echelle log)", yLabel: "ressources/s", colors: prodSeries.map((s) => s.color) });
const chartRuins = svgLogLine(ruinSeries, (p) => p.ruins, { title: "Ruines accumulees (echelle log)", yLabel: "ruines", colors: ruinSeries.map((s) => s.color) });
const chartLegit = svgLogLine(ruinSeries, (p) => p.legitimacy, { title: "Legitimite (monnaie de prestige)", yLabel: "legitimite", colors: ["#5bd1ff", "#ffd479"] });
const chartMult = svgLogLine(ruinSeries, (p) => p.globalMult, { title: "Multiplicateur global de production", yLabel: "x mult", colors: ["#5bd1ff", "#ffd479"] });
const chartTimeline = results.optimized ? svgTimeline(results.optimized.milestones, { title: "Chronologie des jalons (scenario optimise)" }) : "";
const chartMyth = svgMythDelta({ title: "Impact des Mythes - facteur sur le multiplicateur global (avant->apres heritage)" });

// ---------------------------------------------------------------------------
// 16. Tableaux de jalons
// ---------------------------------------------------------------------------
const REQUIRED_MILESTONES = [
  ["era_0", "Premier age"], ["dynasty_1", "Dynastie 1"], ["dynasty_10", "Dynastie 10"],
  ["ruins_threshold_10_", "Palier ruines 10 (dogme)"], ["ruins_threshold_20_", "Palier ruines 20 (dogme)"],
  ["ruins_threshold_30_", "Palier ruines 30 (dogme)"],
  ["gr_1", "Grand Reset 1"], ["gr_10", "Grand Reset 10"], ["gr_11", "Grand Reset 11"],
  ["myth_unlocked", "1er Mythe debloque"], ["act_1_done", "Acte I complete"],
  ["act_2_done", "Acte II complete"], ["act_3_done", "Acte III complete"], ["all_myths", "Tous les Mythes"]
];
function milestoneRow(rec, key) {
  return rec ? rec.milestones.find((x) => x.key === key || x.key.startsWith(key)) : null;
}

// ---------------------------------------------------------------------------
// 17. HTML report
// ---------------------------------------------------------------------------
function htmlMilestoneTable(rec) {
  const rows = rec.milestones.slice().sort((a, b) => a.vt - b.vt).map((m) => `
    <tr><td>${m.label}</td><td class="mono">${fmtDuration(m.vt)}</td><td class="mono">${m.cycles}</td>
      <td>${m.era}</td><td class="mono">${fmt(m.population)}</td><td class="mono">${fmt(m.ruins)}</td>
      <td class="mono">${fmt(m.legitimacy)}</td><td class="mono">x${fmt(m.globalMult)}</td>
      <td class="mono">${fmt(m.prodTotal)}/s</td>
      <td>${(m.automations || []).length ? (m.automations || []).join("<br>") : "<span class='muted'>-</span>"}</td></tr>`).join("");
  return `<table class="tbl"><thead><tr><th>Jalon</th><th>Temps</th><th>Cycle</th><th>Age</th><th>Pop.</th>
    <th>Ruines</th><th>Legit.</th><th>Mult.</th><th>Prod.</th><th>Automations actives</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function htmlRequiredTable() {
  const rec = results.optimized;
  if (!rec) return "<p class='muted'>Scenario optimise non execute.</p>";
  const rows = REQUIRED_MILESTONES.map(([key, label]) => {
    const m = milestoneRow(rec, key);
    const target = PACING_TARGETS[key.replace(/_$/, "")];
    let verdict = "";
    if (m && target) {
      const minutes = m.vt / 60;
      if (minutes < target * 0.5) verdict = "<span class='bad'>trop rapide</span>";
      else if (minutes > target * 2) verdict = "<span class='bad'>trop lent</span>";
      else verdict = "<span class='ok'>dans la cible</span>";
    }
    return `<tr><td>${label}</td>
      <td>${m ? `<span class='ok'>OK ${fmtDuration(m.vt)}</span>` : "<span class='bad'>non atteint dans le budget</span>"}</td>
      <td class="mono">${m ? `cycle ${m.cycles}, ${m.era}` : "-"}</td>
      <td class="mono">${m ? `x${fmt(m.globalMult)} | ${fmt(m.prodTotal)}/s` : "-"}</td>
      <td>${target ? `${target} min ${verdict}` : "<span class='muted'>n/a</span>"}</td></tr>`;
  }).join("");
  return `<table class="tbl"><thead><tr><th>Jalon requis</th><th>Atteint</th><th>Contexte</th><th>Mult./Prod.</th><th>Cible pacing</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function htmlMythTable() {
  if (!mythDelta.length) return "<p class='muted'>Aucun Mythe tente (GR1 non atteint dans le budget).</p>";
  const rows = mythDelta.map((d) => {
    const cls = classifyMyth(d);
    const factor = d.after && d.before ? (d.after.globalMult / (d.before.globalMult || 1)) : null;
    return `<tr><td>Acte ${d.act}</td><td>${d.name}</td>
      <td>${d.completed ? "<span class='ok'>OK complete</span>" : "<span class='bad'>echec/partiel</span>"}</td>
      <td>${cls.type}</td><td class="mono">${factor ? "x" + factor.toFixed(2) : "-"}</td>
      <td class="small">${(d.objectif || d.error || "").replace(/</g, "&lt;")}</td></tr>`;
  }).join("");
  return `<table class="tbl"><thead><tr><th>Acte</th><th>Mythe</th><th>Statut sim.</th><th>Type (heritage)</th><th>Delta mult.</th><th>Objectif</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function htmlMythCatalog() {
  const gates = mythCatalog.filter((m) => m.type.startsWith("gate")).length;
  const rows = mythCatalog.map((m) => {
    const driven = m.drivenResult;
    const status = m.completed ? "<span class='ok'>complete (sim)</span>"
      : driven ? "<span class='bad'>tente, echec sim</span>"
      : "<span class='muted'>non tente (GR1 non atteint)</span>";
    return `<tr><td class="mono">${m.actName}</td><td>${m.name}</td>
      <td>${m.type.startsWith("gate") ? "<span class='ok'>GATE</span>" : "<span class='muted'>multiplicateur</span>"}</td>
      <td class="small">${(m.objectif || "").replace(/</g, "&lt;")}</td>
      <td class="small">${(m.heritage || "").replace(/</g, "&lt;").slice(0, 220)}</td>
      <td>${status}</td></tr>`;
  }).join("");
  return `<p class="small">Analyse statique depuis <span class="mono">data/myths.js</span> (independante de la simulation).
    <b>${gates}/${mythCatalog.length}</b> Mythes debloquent une mecanique persistante (vrai gate de progression) ;
    les autres sont des multiplicateurs/héritages passifs.</p>
    <table class="tbl"><thead><tr><th>Acte</th><th>Mythe</th><th>Role</th><th>Objectif (gate intra-mythe)</th><th>Heritage permanent</th><th>Statut sim.</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function htmlDeadZones() {
  const rec = results.optimized;
  if (!rec) return "";
  const zones = analyzeDeadZones(rec.series);
  if (!zones.length) return "<p class='ok'>Aucune zone morte > 10 min avec moins de 5% de gain de production detectee.</p>";
  const rows = zones.map((z) => `<tr><td class="mono">${fmtDuration(z.fromVT)} -> ${fmtDuration(z.toVT)}</td>
    <td class="mono">${fmtDuration(z.durationSec)}</td><td class="mono">${(z.gain * 100).toFixed(1)}%</td>
    <td>${z.fromEra} -> ${z.toEra}</td></tr>`).join("");
  return `<table class="tbl"><thead><tr><th>Intervalle</th><th>Duree</th><th>Gain prod.</th><th>Ages</th></tr></thead><tbody>${rows}</tbody></table>`;
}

const finalCmp = ["optimized", "noMythes", "idle"].filter((k) => results[k]).map((k) => {
  const f = results[k].final;
  return `<tr><td>${labelMap[k]}</td><td class="mono">${f.cycles}</td><td class="mono">${f.dynastyCount}</td>
    <td class="mono">${f.grandResetCount}</td><td>${f.era}</td><td class="mono">${fmt(f.ruins)}</td>
    <td class="mono">${fmt(f.legitimacy)}</td><td class="mono">x${fmt(f.globalMult)}</td><td class="mono">${fmt(f.prodTotal)}/s</td></tr>`;
}).join("");

const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>CE - Rapport d'equilibrage & simulation</title>
<style>
  :root{color-scheme:dark}
  body{margin:0;background:#0c1220;color:#dbe4f5;font:14px/1.5 -apple-system,Segoe UI,Roboto,sans-serif}
  header{padding:28px 32px;background:linear-gradient(120deg,#142036,#0c1220);border-bottom:1px solid #1d2942}
  h1{margin:0 0 6px;font-size:22px}
  h2{margin:34px 0 12px;font-size:17px;border-left:3px solid #5bd1ff;padding-left:10px}
  main{max-width:1100px;margin:0 auto;padding:0 24px 80px}
  .muted{color:#5b6b88}.small{font-size:11px;color:#9fb3d1}
  .ok{color:#7ee787}.bad{color:#ff8c8c}
  .mono{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px}
  .grid{display:grid;gap:18px}
  .card{background:#101a2e;border:1px solid #1d2942;border-radius:10px;padding:14px 16px}
  table.tbl{border-collapse:collapse;width:100%;font-size:12.5px;margin:8px 0}
  table.tbl th{text-align:left;color:#9fb3d1;border-bottom:1px solid #2a3a57;padding:6px 8px}
  table.tbl td{border-bottom:1px solid #18233a;padding:6px 8px;vertical-align:top}
  .chart{width:100%;height:auto;background:#0d1525;border:1px solid #1d2942;border-radius:10px;margin:6px 0}
  .pill{display:inline-block;padding:2px 8px;border-radius:99px;background:#1a2742;color:#9fb3d1;font-size:11px;margin-right:6px}
  .note{background:#10202a;border:1px solid #1f4a55;color:#9fe6ff;padding:10px 14px;border-radius:8px;margin:10px 0;font-size:13px}
</style></head><body>
<header>
  <h1>Civilisation Effondrement - Rapport de simulation & d'equilibrage</h1>
  <div class="muted">Budget demande : ${HOURS} h virtuelles | <b>temps virtuel reellement simule : ${fmtDuration(simulatedVT)}</b>${truncatedByRealTime ? ` (tronque par --maxreal=${REAL_TIME_LIMIT_MS / 60000}min de temps reel)` : ""} |
   pas de tick ${TICK}s | effondrement a l'ouverture de la crise (Rupture/Usure = 100%) |
   genere le ${new Date(realNow()).toISOString().slice(0, 16).replace("T", " ")}</div>
  ${truncatedByRealTime ? `<div class="note" style="margin-top:10px;border-color:#6b4a1f;background:#2a1c0f;color:#ffcf99">La simulation a ete <b>arretee par la limite de temps reel</b> (${REAL_TIME_LIMIT_MS / 60000} min), pas par le budget virtuel. Les jalons "non atteints" peuvent l'etre avec <span class="mono">--maxreal</span> plus grand. La boucle de prestige de CE est tres longue (Grand Reset 1 ~ 1 jour virtuel de jeu compose).</div>` : ""}
  <div style="margin-top:10px">
    <span class="pill">Optimise</span><span class="pill">Sans Mythes (controle)</span><span class="pill">Idle (plancher)</span>
  </div>
</header>
<main>
<div class="note"><b>Methode.</b> Le simulateur importe les vraies formules du jeu (<span class="mono">src/game/core/mechanics.js</span>,
 <span class="mono">actions/*</span>, <span class="mono">data/*</span>) et fait tourner la boucle complete sans navigateur.
 Le scenario <b>optimise</b> suit un achat best-first a cibles progressives + arbre de ruines + dynasties + grand resets,
 puis pilote les Mythes apres le 1er Grand Reset (verrou de design).</div>

<h2>1 - Synthese finale par scenario</h2>
<div class="card"><table class="tbl"><thead><tr>
  <th>Scenario</th><th>Cycles</th><th>Dynasties</th><th>Grand Resets</th><th>Meilleur age</th>
  <th>Ruines</th><th>Legitimite</th><th>Mult. global</th><th>Prod. finale</th></tr></thead><tbody>${finalCmp}</tbody></table></div>

<h2>2 - Jalons requis (scenario optimise)</h2>
<div class="card">${htmlRequiredTable()}</div>

<h2>3 - Courbes</h2>
<div class="grid">
  <div class="card">${chartProd}</div>
  <div class="card">${chartRuins}</div>
  <div class="card">${chartMult}</div>
  <div class="card">${chartLegit}</div>
  <div class="card">${chartTimeline}</div>
</div>

<h2>4 - Impact des Mythes (gate vs cosmetique)</h2>
<div class="card">${htmlMythCatalog()}</div>
<div class="card"><h3 style="margin:0 0 8px;color:#9fb3d1">Deltas mesures en simulation (si GR1 atteint)</h3>${chartMyth}${htmlMythTable()}</div>

<h2>5 - Zones mortes de progression</h2>
<div class="card">${htmlDeadZones()}</div>

<h2>6 - Tous les jalons horodates (optimise)</h2>
<div class="card" style="overflow:auto;max-height:520px">${results.optimized ? htmlMilestoneTable(results.optimized) : ""}</div>
</main></body></html>`;

fs.writeFileSync("simulation-report.html", html, "utf8");

// ---------------------------------------------------------------------------
// 18. balance-summary.md
// ---------------------------------------------------------------------------
function mdMilestone(rec, key, label) {
  const m = milestoneRow(rec, key);
  if (!m) return `| ${label} | NON ATTEINT${truncatedByRealTime ? " (sim tronquee au temps reel)" : ""} | - | - | - | - |`;
  return `| ${label} | ${fmtDuration(m.vt)} | cycle ${m.cycles}, ${m.era} | x${fmt(m.globalMult)} | ${fmt(m.prodTotal)}/s | ${fmt(m.ruins)} ruines / ${fmt(m.legitimacy)} legit. |`;
}

const rec = results.optimized;
const deadZones = rec ? analyzeDeadZones(rec.series) : [];

let md = `# Civilisation Effondrement - Synthese d'equilibrage

> Genere par \`simulate-ce.js\` (budget demande ${HOURS} h virtuelles, pas ${TICK}s).
> **Temps virtuel reellement simule : ${fmtDuration(simulatedVT)}**${truncatedByRealTime ? ` (ARRETE par la limite de temps reel --maxreal=${REAL_TIME_LIMIT_MS / 60000}min, pas par le budget virtuel).` : "."}
> Formules reelles importees de \`src/game/**\`. Tout jalon non atteignable est **flagge**, jamais invente.
> Les jalons "NON ATTEINT" le sont faute de temps reel de calcul, pas forcement par design : relancer avec \`--maxreal\` plus grand pour aller plus loin.
> Cibles de pacing = **placeholders indicatifs** a calibrer par le designer.

## Scenarios
- **idle** - aucune action manuelle (plancher "automation seule" ; depuis un save vierge aucune automation n'est debloquee).
- **optimized** - achat best-first + arbre de ruines + dynasties + grand resets + pilotage des Mythes.
- **no-mythes** - identique a optimized mais **aucun Mythe active** (groupe de controle ; plafonne au Grand Reset 10, ne peut pas atteindre le GR11).

## Synthese finale
| Scenario | Cycles | Dynasties | Grand Resets | Meilleur age | Ruines | Legitimite | Mult. | Prod./s |
|---|---|---|---|---|---|---|---|---|
${["optimized", "noMythes", "idle"].filter((k) => results[k]).map((k) => {
  const f = results[k].final;
  return `| ${labelMap[k]} | ${f.cycles} | ${f.dynastyCount} | ${f.grandResetCount} | ${f.era} | ${fmt(f.ruins)} | ${fmt(f.legitimacy)} | x${fmt(f.globalMult)} | ${fmt(f.prodTotal)} |`;
}).join("\n")}

## Jalons requis (scenario optimise)
| Jalon | Temps virtuel ecoule | Contexte | Mult. | Prod. | Prestige |
|---|---|---|---|---|---|
${rec ? REQUIRED_MILESTONES.map(([k, l]) => mdMilestone(rec, k, l)).join("\n") : "_scenario optimise non execute_"}

## Evaluation des Mythes - gate de progression ou multiplicateur cosmetique ?

### Catalogue (analyse statique depuis data/myths.js, ${mythCatalog.filter((m) => m.type.startsWith("gate")).length}/${mythCatalog.length} vrais gates)
| Acte | Mythe | Role | Objectif (gate intra-mythe) | Heritage permanent |
|---|---|---|---|---|
${mythCatalog.map((m) => `| ${m.actName} | ${m.name} | ${m.type.startsWith("gate") ? "**GATE**" : "multiplicateur"} | ${(m.objectif || "").replace(/\|/g, "/").slice(0, 120)} | ${(m.heritage || "").replace(/\|/g, "/").slice(0, 140)} |`).join("\n")}

### Deltas mesures en simulation
`;

if (mythDelta.length) {
  md += `\n| Acte | Mythe | Statut sim. | Type | Delta mult. global | Verdict |\n|---|---|---|---|---|---|\n`;
  for (const d of mythDelta) {
    const cls = classifyMyth(d);
    const factor = d.after && d.before ? (d.after.globalMult / (d.before.globalMult || 1)) : null;
    const verdict = cls.type.startsWith("gate")
      ? "**Gate reel** - debloque une mecanique persistante"
      : (factor && factor > 1.05 ? "Multiplicateur significatif" : "Multiplicateur faible / cosmetique");
    md += `| ${d.act} | ${d.name} | ${d.completed ? "OK" : "echec (non complete en sim)"} | ${cls.type} | ${factor ? "x" + factor.toFixed(2) : "-"} | ${verdict} |\n`;
  }
  md += `\n> **Limite de simulation.** Chaque Mythe a une condition \`onCollapse()\` sur-mesure (cf. \`src/game/data/myths.js\`)
> souvent a satisfaire **avant** l'effondrement (ex. Sisyphe 50 000 tresor, Icare 5 000 infra, Age d'Or 75 000 tresor pop<300).
> Le pilote automatique joue agressivement mais n'egale pas un humain optimal : un "echec" signale un objectif **non atteint par le bot**,
> pas necessairement un Mythe impossible.\n`;
} else {
  md += `\n> **Aucun Mythe tente** : le scenario n'a pas atteint le **Grand Reset 1** dans le budget de ${HOURS} h
> (les Mythes sont verrouilles tant que \`grandResetCount < 1\`, cf. \`isMythUnlocked\` dans \`myths.js\`).
> Augmente \`--hours\` pour franchir ce verrou.\n`;
}

md += `\n## Zones mortes de progression (> 10 min, < 5 % de gain de production)\n`;
if (!rec) md += `_n/a_\n`;
else if (!deadZones.length) md += `Aucune zone morte detectee sur la fenetre echantillonnee.\n`;
else {
  md += `| Intervalle | Duree | Gain prod. | Ages |\n|---|---|---|---|\n`;
  md += deadZones.map((z) => `| ${fmtDuration(z.fromVT)} -> ${fmtDuration(z.toVT)} | ${fmtDuration(z.durationSec)} | ${(z.gain * 100).toFixed(1)}% | ${z.fromEra} -> ${z.toEra} |`).join("\n") + "\n";
}

md += `\n## Recommandations de reequilibrage\n`;
const recos = [];
if (rec) {
  for (const [key, target] of Object.entries(PACING_TARGETS)) {
    const m = milestoneRow(rec, key);
    if (!m) { recos.push(`- [!] **${key}** non atteint (sim ${truncatedByRealTime ? "tronquee a " + fmtDuration(simulatedVT) + " virtuel par le temps reel" : "budget"}, cible indicative ~${target} min) - relancer avec --maxreal plus grand pour confirmer le pacing reel.`); continue; }
    const minutes = m.vt / 60;
    if (minutes < target * 0.5) recos.push(`- [v] **${key}** atteint en ${fmtDuration(m.vt)} (cible ~${target} min) - **trop rapide**. Augmenter le cout/seuil correspondant.`);
    else if (minutes > target * 2) recos.push(`- [^] **${key}** atteint en ${fmtDuration(m.vt)} (cible ~${target} min) - **trop lent**. Adoucir la courbe (couts, gain de ruines/legitimite).`);
  }
  if (deadZones.length) recos.push(`- [o] ${deadZones.length} zone(s) morte(s) detectee(s) - inserer un deblocage/objectif intermediaire.`);
  const cosmetic = mythDelta.filter((d) => classifyMyth(d).type === "multiplicateur" && (!d.after || d.after.globalMult / (d.before?.globalMult || 1) <= 1.05));
  if (cosmetic.length) recos.push(`- [m] Mythes a heritage multiplicateur faible : ${cosmetic.map((d) => d.name).join(", ")} - renforcer l'heritage ou en faire un vrai gate.`);
}
// Objectifs/heritages de Mythes encore marques "placeholder" / "a calibrer" dans data/myths.js.
const placeholders = mythCatalog.filter((m) => /placeholder|calibrer/i.test(m.objectif + " " + m.heritage));
if (placeholders.length) recos.push(`- [?] Objectifs de Mythes non calibres (marques "placeholder") : ${placeholders.map((m) => m.name).join(", ")} - valeurs cibles a finaliser dans data/myths.js.`);
const multipliers = mythCatalog.filter((m) => m.type === "multiplicateur");
recos.push(`- [i] Repartition des heritages : ${mythCatalog.length - multipliers.length} gates (mecanique persistante) vs ${multipliers.length} multiplicateurs (${multipliers.map((m) => m.name.replace("Le Mythe ", "")).join(", ")}). Les multiplicateurs purs sont les candidats a un enrichissement s'ils paraissent cosmetiques.`);
md += (recos.length ? recos.join("\n") : "- Aucun ecart de pacing majeur detecte sur les jalons atteints.") + "\n";

md += `\n## Pointeurs formules (source de verite)
- Production / taux : \`src/game/core/mechanics.js\` -> \`rates()\`, \`globalMultiplier()\`, \`buildingOutputMultiplier()\`.
- Multiplicateur de Ruines : \`ruinMultiplier()\` (1 + ruins^0.62 x 0.09, cf. \`balance.js\`).
- Gain de Ruines a l'effondrement : \`ruinGain()\` (patience/profondeur/sediment).
- Legitimite : \`legitimacyGain()\` ; dynastie : \`actions/myths.js -> foundDynasty()\`.
- Grand Reset : \`actions/building.js -> performGrandReset()\` (x2 prod/reset, 11e = x4 ruines si Ragnarok).
- Dogmes (paliers 10/20/30) : \`data/upgrades.js -> PRESTIGE_DOGMAS\` + \`ownedRuinBranchPurchaseCount()\`.
- Mythes (actes, conditions, heritages) : \`data/myths.js -> MYTHS\`, deblocage \`isMythUnlocked()\`.

## DECOUVERTE CLE : degenerescence de l'effondrement en fin de partie
Le bot optimise (toutes strategies) **se bloque autour du cycle ~334 / ere 5-7**, AVANT le 1er Grand Reset, a cause d'une
degenerescence du systeme d'effondrement. Deux faces du meme probleme, mesurees dans le code :
1. **Cite trop stabilisee -> ineffondrable.** Avec l'automation \`protocoles_urgence\` (auto-rationnement a 65 % de Rupture) +
   l'Usure gelee par une infrastructure enorme + scarcity=0 (surplus de Nourriture), la Rupture **plafonne sous 1** : la crise
   terminale ne s'ouvre jamais (cible de pression mesuree ~3.0, mais instabilite bloquee a ~0.70). Aucun effondrement -> meta-progression gelee.
2. **Cite trop puissante -> effondrement a gain nul.** Sans cette stabilisation, l'economie composee fait monter la Rupture a 100 %
   en **moins de 120 s** : a cet age, \`ruinGain()\` a \`minGain=0\`, patience 0.18 et un pic de population minuscule -> **gain = 0 Ruine**.
   L'effondrement ne produit rien, donc la progression n'avance pas.

**Implication d'equilibrage** : les declencheurs d'effondrement (Rupture/Usure) **ne montent pas a l'echelle** d'une economie maximisee.
Passe un certain point, soit la cite ne peut plus tomber, soit elle tombe pour 0. Un humain peut peut-etre naviguer ce point en
effondrant a la main au bon moment, mais c'est un vrai point de friction : le GR1 (et donc tout le contenu Mythes/Actes/GR2-11)
est de fait **bloque derriere cette degenerescence**, pas seulement derriere le temps de calcul.
> Pistes : faire croitre la profondeur de \`ruinGain()\` avec la taille reelle de la cite meme a faible age ; plafonner la
> stabilisation auto ; ou indexer le seuil de crise sur l'echelle economique.

### Hypotheses / formules a clarifier (flaggees)
- **Patience de \`ruinGain()\`** recompense les cycles longs (jusqu'a x1.75 + sediment x5 au-dela de 7 j) : le pacing depend fortement de la strategie d'effondrement.
- **Objectifs de Mythes** : plusieurs sont a atteindre *avant* l'effondrement et ne sont pas garantis par le bot (voir tableau).
- **GR11 = Ragnarok** : exige tous les Mythes completes ; atteignable en simulation seulement si le pilote complete les 13 Mythes + Ragnarok.
`;

fs.writeFileSync("balance-summary.md", md, "utf8");

console.log(`[CE-SIM] Ecrit : simulation-report.html (${(html.length / 1024).toFixed(0)} Ko) + balance-summary.md`);
console.log(`[CE-SIM] Jalons optimise : ${results.optimized ? results.optimized.milestones.length : 0} | Mythes completes : ${mythDelta.filter((m) => m.completed).length}/${mythDelta.length}`);
