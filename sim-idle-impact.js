"use strict";
/* ============================================================================
 * sim-idle-impact.js — Mesure d'impact du chantier "gain idle + doctrine de
 * crise" (cf. CE-spec-idle-crises.md). Réutilise les VRAIES formules du jeu.
 *
 * Mesure, à une échelle de cité représentative atteinte en jouant activement :
 *   1. Production idle / heure        (aujourd'hui = 0)
 *   2. Ruines "farmables" par effondrement idle + reachability de 12/42 ruines
 *   3. Projection grossière vers GR1
 *
 * Usage : node sim-idle-impact.js [--cycles=14] [--grow=600]
 * ========================================================================== */
import fs from "fs";

// --- Stubs DOM (avant tout import jeu) -------------------------------------
global.window = {};
global.localStorage = { getItem() { return null; }, setItem() {} };
Object.defineProperty(global, "navigator", { value: { clipboard: { writeText() {} } }, writable: true, configurable: true });
const stubEl = () => ({ className: "", dataset: {}, innerHTML: "", returnValue: "0", textContent: "", disabled: false, value: "", checked: false, style: {},
  classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
  addEventListener() {}, removeEventListener() {}, setAttribute() {}, showModal() {}, remove() {}, click() {}, appendChild() {},
  querySelector() { return stubEl(); }, querySelectorAll() { return []; } });
global.document = { addEventListener() {}, documentElement: { style: { setProperty() {} } }, body: { appendChild() {} },
  querySelector() { return stubEl(); }, querySelectorAll() { return []; }, createElement() { return stubEl(); }, getElementById() { return stubEl(); } };
global.Audio = class { constructor() { this.volume = 1; } addEventListener() {} play() { return Promise.resolve(); } pause() {} };
global.render = () => {}; global.save = () => {};

// --- Imports jeu ------------------------------------------------------------
const { buildings, dynastyNames } = await import("./src/game/data/buildings.js");
const { upgrades, dogmaIds } = await import("./src/game/data/upgrades.js");
const { eras } = await import("./src/game/data/world.js");
const stateModule = await import("./src/game/core/state.js");
const { state, defaultState, invalidateRenderCache, setGamePaused, setCollapseInProgress, setBuyAmount, setState } = stateModule;

const { registerChoiceDialog } = await import("./src/game/core/choiceDialog.js");
registerChoiceDialog((dialog) => {
  const opts = dialog.options || [];
  const isCrisisEvent = opts.length > 1 && opts.every((o) => typeof o.apply === "function");
  let picked = opts[0];
  if (isCrisisEvent) {
    // Posture "Stabiliser" : option qui baisse la Rupture sans drainer Légitimité/Population.
    const drains = (o) => { const d = o.detail || ""; return /gitimit\S*\s*-/.test(d) || /Population\s*-/.test(d); };
    const nonDraining = opts.filter((o) => !drains(o));
    const stab = nonDraining.filter((o) => /Rupture\s*-/.test(o.detail || ""));
    picked = stab[0] || nonDraining[0] || opts[0];
  }
  return { ...(picked || {}) };
});

const mech = await import("./src/game/core/mechanics.js");
const { isUnlocked, canBuyUpgrade, ruinGain, crisisOpen, buildingBatchCost, legitimacyGain,
  globalMultiplier, rates, timeWearRate, currentEraIndex, has, dynastyRuinsThreshold,
  grandResetLegitimacyCost, addProductionPenalty, amplifyRuptureFactor } = mech;
const { canPayCost, payCost, fmt, clamp01 } = await import("./src/game/core/utils.js");
const { D, toNum } = await import("./src/game/core/num.js");
const actions = await import("./src/game/core/actions.js");
const { buyUpgrade, completeCollapse, tick, runCrisisAction, chronicle } = actions;
const { generateEpitaph } = await import("./src/game/core/events.js");
const { registerWorldEffects } = await import("./src/game/data/worldEffects.js");
registerWorldEffects({ addProductionPenalty, chronicle, amplifyRuptureFactor, clamp01, state });

// --- CLI / constantes -------------------------------------------------------
const argv = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)=?(.*)$/); return m ? [m[1], m[2] === "" ? true : m[2]] : [a, true]; }));
const TICK = 5;
const N_CYCLES = Number(argv.cycles) || 14;
const GROW = Number(argv.grow) || 600;          // s : on tient la Rupture pour faire grossir la cité
const CYCLE_CAP = 30 * 60;                       // garde-fou : 30 min virtuelles / cycle
let VT = 0;
const CLOCK_BASE = Date.now();
const setClock = () => { Date.now = () => CLOCK_BASE + VT * 1000; };
setClock();
const flush = () => new Promise((r) => setImmediate(r));
const num = (x) => { const n = toNum(x); return Number.isFinite(n) ? n : Number.MAX_VALUE; };
const bldById = Object.fromEntries(buildings.map((b) => [b.id, b]));

// --- Buyer (repris de simulate-ce.js, échelle d'expansion identique) --------
function buyBuildings() {
  const t = {}; const b = state.buildings;
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
  let allMet = true;
  for (const [id, target] of Object.entries(t)) if (target > 0 && (b[id] || 0) < target) { allMet = false; break; }
  const scale = (allMet ? 6 + state.cycles : 4) + Math.floor(VT / 600);
  let bought = 0;
  for (let pass = 0; pass < 16; pass++) {
    const visible = buildings.filter((bd) => t[bd.id] > 0 && isUnlocked(bd) && (b[bd.id] || 0) < t[bd.id] * scale)
      .sort((a, c) => ((b[a.id] || 0) / (t[a.id] * scale)) - ((b[c.id] || 0) / (t[c.id] * scale)));
    if (!visible.length) break;
    let changed = false;
    for (const bd of visible) {
      const cost = buildingBatchCost(bd, 1);
      if (!canPayCost(cost)) continue;
      if (cost.food && D(state.food).sub(cost.food).lt(D(state.population).mul(0.5))) continue;
      payCost(cost); state.buildings[bd.id] = (b[bd.id] || 0) + 1; bought++; changed = true; break;
    }
    if (!changed) break;
  }
  if (bought) invalidateRenderCache("all");
}

function buyRuinTree() {
  for (let pass = 0; pass < 6; pass++) {
    const affordable = upgrades.filter((u) => u.group === "ruins" && !dogmaIds.has(u.id) && canBuyUpgrade(u))
      .sort((a, c) => (a.cost.ruins || 0) - (c.cost.ruins || 0));
    if (!affordable.length) break;
    let changed = false;
    for (const u of affordable) { buyUpgrade(u.id); changed = true; }
    if (!changed) break;
  }
}

function manageRupture() {
  for (const id of ["reforms", "census", "rationing", "festivals"]) {
    if (state.instability <= 0.6) break;
    try { runCrisisAction(id, { render: false }); } catch { /* */ }
  }
}

async function resolvePause() { let f = 0; while (stateModule.gamePaused && !crisisOpen() && f++ < 12) await flush(); }

function doCollapse(reason = "auto") {
  const gain = ruinGain();
  if (D(gain).lte(0)) return D(0);
  completeCollapse(gain, dynastyNames[state.dynastyCount % dynastyNames.length], generateEpitaph(), reason);
  setGamePaused(false); setCollapseInProgress(false);
  return gain;
}

// Joue un cycle jusqu'à crise terminale, en gérant la Rupture pendant GROW s.
async function playCycle() {
  const startVT = VT; let g = 0;
  while (g++ < 200000) {
    if (crisisOpen()) break;
    if (VT - startVT >= CYCLE_CAP) break;
    if (stateModule.gamePaused) { await resolvePause(); if (stateModule.gamePaused) break; continue; }
    buyBuildings();
    if ((VT - startVT) < GROW && state.instability > 0.7) manageRupture();
    setClock(); tick(TICK); VT += TICK;
    if (stateModule.gamePaused && !crisisOpen()) await resolvePause();
  }
}

// --- Bootstrap : N cycles actifs, on enregistre ruines cumulées par cycle ---
setState(defaultState());
setGamePaused(false); setCollapseInProgress(false); setBuyAmount(100);
invalidateRenderCache("all");

const reach = { c12: null, c42: null };   // VT auquel les ruines cumulées franchissent 12 / 42
let ruinsEverCumulative = 0;              // total brut farmé (avant dépense en upgrades)
const perCycle = [];

for (let c = 0; c < N_CYCLES; c++) {
  await playCycle();
  // snapshot "sommet de cycle" juste avant l'effondrement (= ce que l'idle ramasserait)
  const peakRates = { population: num(rates().population), food: num(rates().food), gold: num(rates().gold), knowledge: num(rates().knowledge), infrastructure: num(rates().infrastructure) };
  const peakProd = Object.values(peakRates).reduce((a, b) => a + b, 0);
  const peakPop = num(state.population);
  const era = currentEraIndex();
  const gain = num(doCollapse("forced"));
  ruinsEverCumulative += gain;
  if (reach.c12 === null && ruinsEverCumulative >= 12) reach.c12 = { vt: VT, cycle: c + 1 };
  if (reach.c42 === null && ruinsEverCumulative >= 42) reach.c42 = { vt: VT, cycle: c + 1 };
  buyRuinTree();
  perCycle.push({ cycle: c + 1, vt: VT, era: eras[era]?.name, peakPop, gain, peakProd, peakRates,
    ruinsNow: num(state.ruins), ruinsEver: ruinsEverCumulative, mult: globalMultiplier() });
}

// État représentatif = dernier sommet de cycle mesuré
const last = perCycle[perCycle.length - 1];

// --- MESURE 1 : production idle / heure (au dernier sommet) -----------------
// La cité produit au taux courant pendant l'absence (cap 8 h dans la spec).
const prodPerHour = last.peakProd * 3600;

// --- MESURE 2 : ruines farmables ---------------------------------------------
// On ne compte que les VRAIS effondrements (gain > 0) : les entrées à 0 sont des
// playCycle qui ont buté sur le cap sans atteindre la crise terminale (cité encore
// stable). Throughput réel = ruines totales / temps virtuel total.
const realCollapses = perCycle.filter((x) => x.gain > 0);
const totalRuins = realCollapses.reduce((a, x) => a + x.gain, 0);
const ruinsPerHour = VT > 0 ? totalRuins / (VT / 3600) : 0;
const avgGain = realCollapses.length ? totalRuins / realCollapses.length : 0;
const dynThreshold = num(dynastyRuinsThreshold());

// --- Rapport ----------------------------------------------------------------
const L = (s) => console.log(s);
L("");
L("=== SIM IMPACT IDLE + DOCTRINE DE CRISE ===");
L(`Bootstrap : ${N_CYCLES} cycles actifs, grow=${GROW}s, tick=${TICK}s, VT total=${(VT / 3600).toFixed(2)} h virt.`);
L("");
L("--- Reachability du coût en ruines (validation §D de la spec) ---");
L(`  conseil_de_crise (12 ruines) : ${reach.c12 ? `cycle ${reach.c12.cycle} (~${(reach.c12.vt / 60).toFixed(0)} min virt.)` : "non atteint dans le run"}`);
L(`  farm complet (42 ruines)     : ${reach.c42 ? `cycle ${reach.c42.cycle} (~${(reach.c42.vt / 60).toFixed(0)} min virt.)` : "non atteint dans le run"}`);
L("");
L("--- Ruines brutes farmées par cycle ---");
L("  cyc | ère                    | pic pop      | gain ruines | ruines cumul");
for (const x of perCycle) {
  L(`  ${String(x.cycle).padStart(3)} | ${String(x.era || "?").padEnd(22)} | ${fmt(x.peakPop).padStart(11)} | ${fmt(x.gain).padStart(11)} | ${fmt(x.ruinsEver).padStart(11)}`);
}
L("");
L("--- État représentatif (dernier sommet de cycle) ---");
L(`  Ère ${last.era}, pic pop ${fmt(last.peakPop)}, mult global x${fmt(last.mult)}`);
L(`  Taux : pop ${fmt(last.peakRates.population)}/s, food ${fmt(last.peakRates.food)}/s, or ${fmt(last.peakRates.gold)}/s, savoir ${fmt(last.peakRates.knowledge)}/s, infra ${fmt(last.peakRates.infrastructure)}/s`);
L("");
L("--- MESURE 1 : production idle (aujourd'hui = 0) ---");
L(`  prod totale/s = ${fmt(last.peakProd)}  →  /h = ${fmt(prodPerHour)}  →  /4h = ${fmt(prodPerHour * 4)}  →  /8h(cap) = ${fmt(prodPerHour * 8)}`);
L("");
L("--- MESURE 1bis : rendement idle par ÈRE × CAP (validation des paliers) ---");
// Meilleur taux de prod observé à chaque ère (cité établie à ce palier).
const byEra = new Map();
for (const x of perCycle) {
  const cur = byEra.get(x.era);
  if (!cur || x.peakProd > cur.prod) byEra.set(x.era, { prod: x.peakProd, pop: x.peakPop });
}
const CAPS = [2, 4, 8, 12, 24];
L(`  ère                    | prod/s     | ${CAPS.map((h) => (h + "h").padStart(9)).join(" | ")}`);
for (const [eraName, v] of byEra) {
  const cells = CAPS.map((h) => fmt(v.prod * 3600 * h).padStart(9)).join(" | ");
  L(`  ${String(eraName).padEnd(22)} | ${fmt(v.prod).padStart(10)} | ${cells}`);
}
L("  (rendement = prod/s × 3600 × cap ; gratuit jusqu'à 2h, paliers ruines au-delà)");
L("");
L("--- MESURE 2 : ruines idle (aujourd'hui = 0) ---");
L(`  vrais effondrements : ${realCollapses.length}/${N_CYCLES} cycles (les autres : cité encore stable)`);
L(`  gain moyen / effondrement réel = ${fmt(avgGain)} ruines`);
L(`  throughput = ${fmt(totalRuins)} ruines en ${(VT / 3600).toFixed(2)} h  →  ~${fmt(ruinsPerHour)} ruines / h virt.`);
L(`  seuil de fondation actuel (dynastyRuinsThreshold) = ${fmt(dynThreshold)} ruines`);
L(`  → un effondrement réel couvre ~${(avgGain / dynThreshold).toFixed(2)} fondation(s) ; GR1 = 300 légitimité.`);
L("");
L("NOTE : sans auto-ACHAT, le farm multi-effondrement s'essouffle (cité vidée après");
L("chaque chute). Le farm idle nourri suppose un auto-rebuild — cf. finding ci-dessous.");
L("");
fs.writeFileSync("sim-idle-impact.out.json", JSON.stringify({ reach, perCycle, last, prodPerHour, avgGain, ruinsPerHour, totalRuins, realCollapses: realCollapses.length, dynThreshold }, null, 2));
L("Détail JSON : sim-idle-impact.out.json");
