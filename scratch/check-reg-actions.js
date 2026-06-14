"use strict";
/* Vérifie le dispatch moteur des actions de régulation déblocables (registre).
 * Usage: node scratch/check-reg-actions.js */

global.window = global.window || {};
global.localStorage = global.localStorage || { getItem() { return null; }, setItem() {} };
if (!global.navigator) Object.defineProperty(global, "navigator", { value: { clipboard: { writeText() {} } }, writable: true, configurable: true });
const stubEl = () => ({ className: "", dataset: {}, style: {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } }, addEventListener() {}, setAttribute() {}, showModal() {}, remove() {}, click() {}, appendChild() {}, querySelector() { return stubEl(); }, querySelectorAll() { return []; } });
global.document = global.document || { addEventListener() {}, documentElement: { style: { setProperty() {} } }, body: { appendChild() {} }, querySelector() { return stubEl(); }, querySelectorAll() { return []; }, createElement() { return stubEl(); }, getElementById() { return stubEl(); } };
global.Audio = global.Audio || class { addEventListener() {} play() { return Promise.resolve(); } pause() {} };

const { state, defaultState, invalidateRenderCache, setState } = await import("../src/game/core/state.js");
const { regulationActionUnlocked, regulationContext } = await import("../src/game/core/mechanics.js");
const { runCrisisAction } = await import("../src/game/core/actions/crisis.js");
const { D, toNum } = await import("../src/game/core/num.js");

const NOW = 1_000_000_000_000;
Date.now = () => NOW;

function setup({ bestEra, myth }) {
  setState(defaultState());
  state.cycles = 6; state.dynastyCount = 2;
  state.population = D(50000); state.food = D(5e7); state.gold = D(5e7);
  state.knowledge = D(5e7); state.infrastructure = D(5000); state.legitimacy = 20;
  state.bestEraIndex = bestEra;
  state.mythsCompleted = myth ? { mythe_test: true } : {};
  for (const id of Object.keys(state.buildings)) state.buildings[id] = 0;
  state.buildings.foragers = 40; state.buildings.markets = 20; state.buildings.scribes = 15;
  invalidateRenderCache("all");
}

const checks = [];
const ok = (name, cond) => checks.push({ name, pass: !!cond });

// 1) Action de palier (bestEra) verrouillée puis débloquée
setup({ bestEra: 0, myth: false });
ok("publicWorks verrouillée à bestEra 0", regulationActionUnlocked("publicWorks") === false);
setup({ bestEra: 5, myth: true });
ok("publicWorks débloquée à bestEra 5", regulationActionUnlocked("publicWorks") === true);

// 2) publicWorks (soothe + infra) : relief complexity + infra augmentée + counter reforms++
setup({ bestEra: 5, myth: true });
const infraBefore = toNum(state.infrastructure);
const reformsBefore = state.crisisActions.reforms;
runCrisisAction("publicWorks", { render: false });
ok("publicWorks : relief complexity déposé", (state.foyerRelief.complexity || 0) > 0);
ok("publicWorks : infrastructure augmentée", toNum(state.infrastructure) > infraBefore);
ok("publicWorks : counter reforms incrémenté", state.crisisActions.reforms === reformsBefore + 1);

// 3) cornucopia (reform + infra) : foyerReform scarcity déposé (durable)
setup({ bestEra: 5, myth: true });
runCrisisAction("cornucopia", { render: false });
ok("cornucopia : foyerReform scarcity déposé (durable)", (state.foyerReform.scarcity || 0) > 0);

// 4) evergetism (reform + legit) : foyerReform inequality + légitimité augmentée
setup({ bestEra: 5, myth: true });
const legitBefore = state.legitimacy;
runCrisisAction("evergetism", { render: false });
ok("evergetism : foyerReform inequality déposé", (state.foyerReform.inequality || 0) > 0);
ok("evergetism : légitimité augmentée", state.legitimacy > legitBefore);

// 5) Action verrouillée : aucun effet même si appelée
setup({ bestEra: 0, myth: false });
const scBefore = state.foyerReform.scarcity || 0;
runCrisisAction("cornucopia", { render: false }); // verrouillée (myth 0)
ok("cornucopia verrouillée : aucun effet", (state.foyerReform.scarcity || 0) === scBefore);

console.table(checks);
const failed = checks.filter((c) => !c.pass);
console.log(failed.length ? `ÉCHECS: ${failed.length}` : "TOUT OK");
process.exit(failed.length ? 1 : 0);
