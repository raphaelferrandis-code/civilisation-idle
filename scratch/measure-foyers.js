"use strict";
/* Mesure les valeurs PAR FOYER de pressureBreakdown() aux echelles early/mid/late,
 * pour calibrer le recul plat foyerReform. Usage: node scratch/measure-foyers.js */

// --- Stubs DOM (avant imports jeu) -----------------------------------------
global.window = global.window || {};
global.localStorage = global.localStorage || { getItem() { return null; }, setItem() {} };
if (!global.navigator) Object.defineProperty(global, "navigator", { value: { clipboard: { writeText() {} } }, writable: true, configurable: true });
const stubEl = () => ({ className: "", dataset: {}, innerHTML: "", textContent: "", disabled: false, value: "", checked: false, style: {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } }, addEventListener() {}, setAttribute() {}, showModal() {}, remove() {}, click() {}, appendChild() {}, querySelector() { return stubEl(); }, querySelectorAll() { return []; } });
global.document = global.document || { addEventListener() {}, documentElement: { style: { setProperty() {} } }, body: { appendChild() {} }, querySelector() { return stubEl(); }, querySelectorAll() { return []; }, createElement() { return stubEl(); }, getElementById() { return stubEl(); } };
global.Audio = global.Audio || class { constructor() { this.volume = 1; } addEventListener() {} play() { return Promise.resolve(); } pause() {} };

const stateModule = await import("../src/game/core/state.js");
const { state, defaultState, invalidateRenderCache, setState } = stateModule;
const mech = await import("../src/game/core/mechanics.js");
const { pressureBreakdown } = mech;
const { D } = await import("../src/game/core/num.js");

const NOW = 1_000_000_000_000;
Date.now = () => NOW;

const SCALES = {
  early: { population: 800, food: 2500, gold: 600, knowledge: 400, infrastructure: 60,
    buildings: { foragers: 12, granaries_city: 8, caravans: 6, storytellers: 5, scribes: 3, roads: 6, aqueducts: 3, markets: 2 } },
  mid: { population: 40000, food: 120000, gold: 60000, knowledge: 45000, infrastructure: 8000,
    buildings: { foragers: 80, granaries_city: 50, caravans: 40, storytellers: 40, scribes: 25, roads: 40, aqueducts: 25, markets: 25, guilds: 18, watch: 12, bureaucracy: 12, sewers: 12, irrigated_fields: 12, schools: 15 } },
  late: { population: 1e9, food: 3e9, gold: 1.5e9, knowledge: 8e8, infrastructure: 2e7,
    buildings: { foragers: 400, granaries_city: 300, caravans: 250, storytellers: 250, scribes: 200, roads: 300, aqueducts: 200, markets: 200, guilds: 150, watch: 100, bureaucracy: 100, sewers: 150, irrigated_fields: 150, schools: 120, river_ports: 100, courthouses: 80, water_mills: 80, public_works: 60, mint_houses: 40, imperial_exchanges: 20 } }
};

function applyScale(def) {
  setState(defaultState());
  state.cycles = 14; state.dynastyCount = 3; state.legitimacy = 30; state.ruins = D(500);
  state.cycleStartedAt = NOW - 20 * 60_000;
  state.population = D(def.population); state.food = D(def.food); state.gold = D(def.gold);
  state.knowledge = D(def.knowledge); state.infrastructure = D(def.infrastructure);
  for (const id of Object.keys(state.buildings)) state.buildings[id] = 0;
  for (const [id, c] of Object.entries(def.buildings)) if (id in state.buildings) state.buildings[id] = c;
  invalidateRenderCache("all");
}

const CAP = 0.45; // FOYER_RELIEF_CAP

const rows = [];
for (const [scaleId, def] of Object.entries(SCALES)) {
  // (1) cible nue
  applyScale(def);
  const base = pressureBreakdown();
  // (2) cible quand les 4 foyers sont RÉFORMÉS au plafond (recul durable maxé)
  applyScale(def);
  state.foyerReform = { scarcity: CAP, inequality: CAP, complexity: CAP, dissent: CAP };
  invalidateRenderCache("all");
  const reformed = pressureBreakdown();
  // (3) pire cas anti-immortalité : réforme maxée + apaisement temporaire maxé
  applyScale(def);
  state.foyerReform = { scarcity: CAP, inequality: CAP, complexity: CAP, dissent: CAP };
  state.foyerRelief = { scarcity: CAP, inequality: CAP, complexity: CAP, dissent: CAP };
  invalidateRenderCache("all");
  const both = pressureBreakdown();
  rows.push({
    echelle: scaleId,
    "cible nue": base.total.toFixed(3),
    "réformé max": reformed.total.toFixed(3),
    "réf+apais max": both.total.toFixed(3),
    "invariant ≥1.0 (late)": scaleId === "late" ? (both.total >= 1.0 ? "OK" : "CASSÉ") : "—"
  });
}
console.table(rows);
