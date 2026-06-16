"use strict";
/* Mesure : un retour d'idle long crée-t-il un pic de Rupture ? (cf. finding verif)
 * Réutilise les vraies formules. Usage : node sim-idle-impact-return.js */
import { state, setState, hydrateState, invalidateRenderCache } from "./src/game/core/state.js";
import { registerChoiceDialog } from "./src/game/core/choiceDialog.js";
import { pressureBreakdown, cityVitals } from "./src/game/core/mechanics.js";
import { applyOfflineProgress, idleCapSeconds } from "./src/game/core/main.js";
import { tick } from "./src/game/core/actions.js";
import { toNum } from "./src/game/core/num.js";

// Stub de dialogue (au cas où une crise non automatisée s'ouvrirait) : prend options[0].
registerChoiceDialog((d) => ({ ...(d.options && d.options[0]) }));

function baseState() {
  const now = Date.now();
  return hydrateState({
    population: 200000, food: 600000, gold: 300000, knowledge: 50000, infrastructure: 5000,
    legitimacy: 40, ruins: 8000, cycles: 8, dynastyCount: 6, instability: 0.35, timeWear: 0.2,
    bestEraIndex: 6, cyclePeaks: { population: 220000, knowledge: 60000, infrastructure: 6000, eraIndex: 6 },
    cycleStartedAt: now - 1800000, lastTick: now,
    buildings: { foragers: 40, granaries_city: 25, caravans: 15, markets: 10, guilds: 6, irrigated_fields: 8, river_ports: 4, aqueducts: 6, roads: 8, watch: 4, sewers: 3, scribes: 6, storytellers: 8, schools: 4 },
    // tous les paliers Veille → cap 24h ; conseil_de_crise → crises auto-résolues (stabiliser)
    upgrades: { veilleurs_nuit_1: true, veilleurs_nuit_2: true, veilleurs_nuit_3: true, veilleurs_nuit_4: true, conseil_de_crise: true, root_cellars: true },
    crisisDoctrine: { p25: "stabiliser", p50: "stabiliser", p75: "stabiliser", autoCollapse: { enabled: false, trigger: "rupture100", usureThreshold: 0.9, timeSeconds: 600, prepare: true } }
  });
}

function snap() {
  invalidateRenderCache("all");
  const p = pressureBreakdown();
  const v = cityVitals();
  return {
    inst: state.instability, wear: state.timeWear || 0, total: p.total,
    scarcity: p.scarcity, ineq: p.inequality, complex: p.complexity, dissent: p.dissent, struct: p.structural, mitig: p.mitigation,
    pop: toNum(state.population), food: toNum(state.food), foodScore: v.foodScore
  };
}
const f = (n) => (Math.abs(n) >= 1000 ? n.toExponential(2) : n.toFixed(3));
const line = (label, s) => `${label} inst=${s.inst.toFixed(3)} target=${s.total.toFixed(3)} | scar=${s.scarcity.toFixed(2)} ineq=${s.ineq.toFixed(2)} cplx=${s.complex.toFixed(2)} diss=${s.dissent.toFixed(2)} str=${s.struct.toFixed(2)} mit=${s.mitig.toFixed(2)} | pop=${f(s.pop)} food=${f(s.food)} foodScore=${s.foodScore.toFixed(2)} wear=${s.wear.toFixed(3)}`;

for (const hours of [2, 8, 24]) {
  setState(baseState());
  invalidateRenderCache("all");
  const before = snap();
  applyOfflineProgress(hours * 3600);
  const justAfter = snap();
  // 3 min de ticks pour laisser l'EMA + la jauge converger ; suit le pic d'instabilité.
  let peakInst = state.instability; let crossed100 = false;
  for (let i = 0; i < 180; i++) { tick(1); if (state.instability > peakInst) peakInst = state.instability; if (state.crisisLimitAnnounced) crossed100 = true; }
  const after3 = snap();
  console.log(`\n=== Idle ${hours}h (cap ${Math.round(idleCapSeconds() / 3600)}h) ===`);
  console.log(line("avant  :", before));
  console.log(line("retour :", justAfter));
  console.log(line("+3min  :", after3));
  console.log(`pic d'instabilité sur 3min = ${peakInst.toFixed(3)} ${crossed100 ? "→ ⚠️ CRISE TERMINALE ouverte" : "(pas de crise terminale)"}`);
}
