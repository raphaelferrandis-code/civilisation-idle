/* Mesure la "cassure" du tracé de la muraille : angle de virage entre segments
 * consécutifs de walls.outline (0° = droit). Un pic d'évitement de place se
 * voit comme un virage > 60°. Usage : node check-wall-kinks.mjs
 */
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
const { computeCityLayout, CM_MAP_BUILDINGS } = await import("./src/game/map/layout.js");

const turnAngles = (ol) => {
  const out = [];
  for (let i = 0; i < ol.length; i += 1) {
    const a = ol[(i - 1 + ol.length) % ol.length], b = ol[i], c = ol[(i + 1) % ol.length];
    const v1x = b.x - a.x, v1y = b.y - a.y, v2x = c.x - b.x, v2y = c.y - b.y;
    const n1 = Math.hypot(v1x, v1y), n2 = Math.hypot(v2x, v2y);
    if (n1 < 1e-6 || n2 < 1e-6) continue;
    const cos = Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / (n1 * n2)));
    out.push(Math.acos(cos) * 180 / Math.PI);
  }
  return out;
};

const all = [];
let worst = { a: 0 };
for (let seed = 1; seed <= 12; seed += 1) {
  for (const ei of [18, 22, 26, 30, 34]) {
    const s = defaultState();
    s.mapSeed = seed * 7919 + 13;
    s.population = eras[ei].at;
    for (const meta of CM_MAP_BUILDINGS) s.buildings[meta.id] = 40;
    setState(s);
    const L = computeCityLayout(state);
    if (!L.walls || !Array.isArray(L.walls.outline)) continue;
    for (const a of turnAngles(L.walls.outline)) {
      all.push(a);
      if (a > worst.a) worst = { a, seed, ei };
    }
  }
}
all.sort((x, y) => x - y);
const pct = (p) => all[Math.min(all.length - 1, Math.floor(all.length * p))].toFixed(1);
console.log(`points: ${all.length} | p50 ${pct(0.5)}° | p95 ${pct(0.95)}° | p99 ${pct(0.99)}° | max ${worst.a.toFixed(1)}° (seed ${worst.seed}, ère ${worst.ei})`);
console.log(`virages > 60° : ${all.filter((a) => a > 60).length} | > 90° : ${all.filter((a) => a > 90).length}`);
