"use strict";
/* Vérifie le Levier C — politiques permanentes. Usage: node scratch/check-policies.js */

global.window = global.window || {};
global.localStorage = global.localStorage || { getItem() { return null; }, setItem() {} };
if (!global.navigator) Object.defineProperty(global, "navigator", { value: { clipboard: { writeText() {} } }, writable: true, configurable: true });
const stubEl = () => ({ className: "", dataset: {}, style: {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } }, addEventListener() {}, setAttribute() {}, showModal() {}, remove() {}, click() {}, appendChild() {}, querySelector() { return stubEl(); }, querySelectorAll() { return []; } });
global.document = global.document || { addEventListener() {}, documentElement: { style: { setProperty() {} } }, body: { appendChild() {} }, querySelector() { return stubEl(); }, querySelectorAll() { return []; }, createElement() { return stubEl(); }, getElementById() { return stubEl(); } };
global.Audio = global.Audio || class { addEventListener() {} play() { return Promise.resolve(); } pause() {} };

const { state, defaultState, invalidateRenderCache, setState } = await import("../src/game/core/state.js");
const { policyRiseSlow, policyProductionMultiplier, rates } = await import("../src/game/core/mechanics.js");
const { togglePolicy } = await import("../src/game/core/actions/crisis.js");
const { D, toNum } = await import("../src/game/core/num.js");

const NOW = 1_000_000_000_000;
Date.now = () => NOW;

function setup({ bestEra, myth }) {
  setState(defaultState());
  state.cycles = 6; state.population = D(50000); state.food = D(5e7); state.gold = D(5e7);
  state.knowledge = D(5e7); state.infrastructure = D(5000); state.legitimacy = 20;
  state.bestEraIndex = bestEra; state.mythsCompleted = myth ? { m: true } : {};
  for (const id of Object.keys(state.buildings)) state.buildings[id] = 0;
  state.buildings.foragers = 40; state.buildings.markets = 20;
  invalidateRenderCache("all");
}

const checks = [];
const ok = (name, cond) => checks.push({ name, pass: !!cond });

// 1) Aucune politique : neutre
setup({ bestEra: 5, myth: true });
ok("aucune politique : riseSlow = 0", policyRiseSlow() === 0);
ok("aucune politique : coût gold = 1", policyProductionMultiplier("gold") === 1);
const goldRateBase = toNum(rates().gold);

// 2) Couvre-feu (riseSlow 0.25, coût global 0.10)
togglePolicy("curfew");
ok("curfew activée", (state.activePolicies || []).includes("curfew"));
ok("curfew : riseSlow = 0.25", Math.abs(policyRiseSlow() - 0.25) < 1e-9);
ok("curfew : coût gold = 0.90", Math.abs(policyProductionMultiplier("gold") - 0.90) < 1e-9);
invalidateRenderCache("all");
ok("curfew : production d'or réduite", toNum(rates().gold) < goldRateBase);

// 3) 2e politique OK, 3e bloquée (POLICY_MAX_ACTIVE = 2)
togglePolicy("martialLaw");
ok("2 politiques actives", (state.activePolicies || []).length === 2);
togglePolicy("paxDivina");
ok("3e politique bloquée (max 2)", (state.activePolicies || []).length === 2);
ok("riseSlow cumulé (curfew+martial) = 0.70", Math.abs(policyRiseSlow() - 0.70) < 1e-9);

// 4) Désactivation : récupération
togglePolicy("curfew");
ok("curfew désactivée", !(state.activePolicies || []).includes("curfew"));

// 5) Verrouillage : Pax Divina sans mythe → refusée
setup({ bestEra: 5, myth: false });
togglePolicy("paxDivina");
ok("paxDivina verrouillée (0 mythe) : refusée", !(state.activePolicies || []).includes("paxDivina"));

console.table(checks);
const failed = checks.filter((c) => !c.pass);
console.log(failed.length ? `ÉCHECS: ${failed.length}` : "TOUT OK");
process.exit(failed.length ? 1 : 0);
