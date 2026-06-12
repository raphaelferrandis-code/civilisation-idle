/* Vérification headless : aucun bâtiment (tuile décorative, moteur, district)
 * ne doit chevaucher une cellule de muraille (walls.set, portes exclues).
 * Couvre aussi le scénario "slot sauvegardé avant la muraille".
 * Usage : node check-walls.mjs
 */
import "process";

// Stubs DOM minimalistes (mêmes que simulate-ce.js)
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

const { eras } = await import("./src/game/data/world.js");
const { defaultState, setState, state } = await import("./src/game/core/state.js");
const layoutMod = await import("./src/game/map/layout.js");
const { computeCityLayout, CM_MAP_BUILDINGS } = layoutMod;

const footCells = (t) => {
  const sx = t.spanX || t.size || 1, sy = t.spanY || t.size || 1;
  const out = [];
  for (let ax = 0; ax < sx; ax += 1) for (let ay = 0; ay < sy; ay += 1) out.push((t.gx + ax) + "," + (t.gy + ay));
  return out;
};

const overlapsFor = (L) => {
  if (!L.walls || !L.walls.set) return null;
  const bad = [];
  for (const t of L.tiles) {
    for (const k of footCells(t)) if (L.walls.set.has(k)) bad.push(`${t.type}/${t.variant || t.buildingId} @ ${k}`);
  }
  for (const d of L.districts) {
    for (const k of footCells(d)) if (L.walls.set.has(k)) bad.push(`district/${d.kind} @ ${k}`);
  }
  return bad;
};

const mkState = (seed, eraIdx) => {
  const s = defaultState();
  s.mapSeed = seed;
  s.population = eras[eraIdx].at;
  for (const meta of CM_MAP_BUILDINGS) s.buildings[meta.id] = 40;
  return s;
};

let walledLayouts = 0, totalBad = 0;
const eraIdxs = [];
for (let i = 0; i < eras.length; i += 1) eraIdxs.push(i);
const sampleEras = eraIdxs.filter((i) => i % 4 === 2); // échantillon d'ères variées

for (let seed = 1; seed <= 12; seed += 1) {
  for (const ei of sampleEras) {
    const s = mkState(seed * 7919 + 13, ei);
    setState(s);
    const L = computeCityLayout(state);
    const bad = overlapsFor(L);
    if (bad === null) continue; // pas de muraille à cette ère
    walledLayouts += 1;
    if (bad.length) {
      totalBad += bad.length;
      console.log(`SEED ${seed} ERA ${ei}: ${bad.length} chevauchements — ${bad.slice(0, 5).join(" ; ")}`);
    }
  }
}

// Scénario slots sauvegardés : layout AVANT muraille (slots persistés), puis
// l'ère monte, la muraille apparaît — les slots doivent être relogés.
let savedSlotWalled = 0;
const firstWalledEra = (() => {
  for (let i = 0; i < eras.length; i += 1) {
    const s = mkState(1, i); setState(s);
    if (computeCityLayout(state).walls) return i;
  }
  return -1;
})();
for (let seed = 1; seed <= 12; seed += 1) {
  const s = mkState(seed * 104729 + 7, Math.max(0, firstWalledEra - 1));
  setState(s);
  computeCityLayout(state); // persiste les slots sans muraille
  state.population = eras[Math.min(eras.length - 1, firstWalledEra + 1)].at;
  const L2 = computeCityLayout(state);
  const bad = overlapsFor(L2);
  if (bad === null) continue;
  savedSlotWalled += 1;
  if (bad.length) {
    totalBad += bad.length;
    console.log(`SAVED-SLOT SEED ${seed}: ${bad.length} chevauchements — ${bad.slice(0, 5).join(" ; ")}`);
  }
}

console.log(`Layouts murés testés : ${walledLayouts} (+ ${savedSlotWalled} scénarios slots sauvegardés), première ère murée : ${firstWalledEra}`);
console.log(totalBad === 0 ? "OK — aucun bâtiment sur la muraille" : `ÉCHEC — ${totalBad} chevauchements`);
process.exit(totalBad === 0 ? 0 : 1);
