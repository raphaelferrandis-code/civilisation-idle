"use strict";
/* Vérifie fatigue de régulation + actions pari. Usage: node scratch/check-fatigue-gamble.js */

global.window = global.window || {};
global.localStorage = global.localStorage || { getItem() { return null; }, setItem() {} };
if (!global.navigator) Object.defineProperty(global, "navigator", { value: { clipboard: { writeText() {} } }, writable: true, configurable: true });
const stubEl = () => ({ className: "", dataset: {}, style: {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } }, addEventListener() {}, setAttribute() {}, showModal() {}, remove() {}, click() {}, appendChild() {}, querySelector() { return stubEl(); }, querySelectorAll() { return []; } });
global.document = global.document || { addEventListener() {}, documentElement: { style: { setProperty() {} } }, body: { appendChild() {} }, querySelector() { return stubEl(); }, querySelectorAll() { return []; }, createElement() { return stubEl(); }, getElementById() { return stubEl(); } };
global.Audio = global.Audio || class { addEventListener() {} play() { return Promise.resolve(); } pause() {} };

const { state, defaultState, invalidateRenderCache, setState } = await import("../src/game/core/state.js");
const { crisisCosts, regulFatigueEffectMult, regulFatigueCostMult, regulationActionUnlocked } = await import("../src/game/core/mechanics.js");
const { runCrisisAction } = await import("../src/game/core/actions/crisis.js");
const { D, toNum } = await import("../src/game/core/num.js");

const NOW = 1_000_000_000_000;
Date.now = () => NOW;

function setup({ bestEra = 5, myth = true } = {}) {
  setState(defaultState());
  state.cycles = 6; state.population = D(50000); state.food = D(1e9); state.gold = D(1e9);
  state.knowledge = D(1e9); state.infrastructure = D(5000); state.legitimacy = 20;
  state.bestEraIndex = bestEra; state.mythsCompleted = myth ? { m: true } : {};
  for (const id of Object.keys(state.buildings)) state.buildings[id] = 0;
  state.buildings.foragers = 40; state.buildings.markets = 20;
  invalidateRenderCache("all");
}

const checks = [];
const ok = (name, cond) => checks.push({ name, pass: !!cond });

// ── FATIGUE ──────────────────────────────────────────────────────────────────
setup();
ok("fatigue initiale = 0", (state.regulFatigue || 0) === 0);
ok("effMult initial = 1", regulFatigueEffectMult() === 1);
ok("costMult initial = 1", regulFatigueCostMult() === 1);

const costBefore = toNum(crisisCosts().rationing.food);
runCrisisAction("rationing", { render: false });
const relief1 = state.foyerRelief.scarcity;
ok("1re action : fatigue montée", state.regulFatigue > 0);
ok("1re action : relief = ADD plein (eff 1)", Math.abs(relief1 - 0.18) < 1e-6);
invalidateRenderCache("all");
const costAfter = toNum(crisisCosts().rationing.food);
ok("coût augmenté avec la fatigue", costAfter > costBefore);

const before2 = state.foyerRelief.scarcity;
runCrisisAction("rationing", { render: false });
const delta2 = state.foyerRelief.scarcity - before2;
ok("2e action : relief réduit par fatigue (<0.18)", delta2 > 0 && delta2 < 0.18 - 1e-6);

// ── PARI (gamble) ─────────────────────────────────────────────────────────────
// Succès forcé (random < p)
setup();
Math.random = () => 0.01;
runCrisisAction("prayForRain", { render: false });
ok("pari gagné : relief scarcity déposé", (state.foyerRelief.scarcity || 0) > 0);

// Échec forcé (random > p) → hausse d'instabilité
setup();
state.instability = 0.3;
Math.random = () => 0.99;
const instBefore = state.instability;
runCrisisAction("prayForRain", { render: false });
ok("pari perdu : instabilité augmentée", state.instability > instBefore);
ok("pari perdu : pas de relief", (state.foyerRelief.scarcity || 0) === 0);

// Verrouillé (bestEra 0) → aucun effet
setup({ bestEra: 0, myth: false });
Math.random = () => 0.01;
const sc0 = state.foyerRelief.scarcity || 0;
ok("prayForRain verrouillée (bestEra 0)", regulationActionUnlocked("prayForRain") === false);
runCrisisAction("prayForRain", { render: false });
ok("pari verrouillé : aucun effet", (state.foyerRelief.scarcity || 0) === sc0);

console.table(checks);
const failed = checks.filter((c) => !c.pass);
console.log(failed.length ? `ÉCHECS: ${failed.length}` : "TOUT OK");
process.exit(failed.length ? 1 : 0);
