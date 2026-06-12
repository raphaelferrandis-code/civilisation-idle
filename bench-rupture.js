"use strict";
/* ============================================================================
 * bench-rupture.js - Mesure EXACTE de l'impact des achats (batiments
 * stabilisants, infrastructure, nourriture) sur la cible de Rupture, a trois
 * echelles de partie (early / mid / late).
 *
 * Repond a la question d'equilibrage : « les achats d'infrastructure
 * reduisent-ils assez la jauge, et gardent-ils un effet en fin de partie ? »
 * Avant le reequilibrage (couverture en ratio + plafonds doux), la reponse
 * mesuree etait : effet ~0.000 en fin de partie (sources saturees aux plafonds
 * durs, mitigation plafonnee a 0.75 des ~1e5 d'infra).
 *
 * Sortie : rupture-impact.md (+ table console).
 * Usage  : node bench-rupture.js
 * ========================================================================== */
import fs from "fs";

// --- Stubs DOM (avant imports jeu) -----------------------------------------
global.window = {};
global.localStorage = { getItem() { return null; }, setItem() {} };
Object.defineProperty(global, "navigator", { value: { clipboard: { writeText() {} } }, writable: true, configurable: true });
const stubEl = () => ({ className: "", dataset: {}, innerHTML: "", textContent: "", disabled: false, value: "", checked: false, style: {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } }, addEventListener() {}, setAttribute() {}, showModal() {}, remove() {}, click() {}, appendChild() {}, querySelector() { return stubEl(); }, querySelectorAll() { return []; } });
global.document = { addEventListener() {}, documentElement: { style: { setProperty() {} } }, body: { appendChild() {} }, querySelector() { return stubEl(); }, querySelectorAll() { return []; }, createElement() { return stubEl(); }, getElementById() { return stubEl(); } };
global.Audio = class { constructor() { this.volume = 1; } addEventListener() {} play() { return Promise.resolve(); } pause() {} };
global.render = () => {}; global.save = () => {};

// --- Imports jeu ------------------------------------------------------------
const stateModule = await import("./src/game/core/state.js");
const { state, defaultState, invalidateRenderCache, setState } = stateModule;
const { registerChoiceDialog } = await import("./src/game/core/choiceDialog.js");
registerChoiceDialog((d) => d.options?.[0] || {});
const mech = await import("./src/game/core/mechanics.js");
const { pressureBreakdown } = mech;
const { D } = await import("./src/game/core/num.js");

const NOW = 1_000_000_000_000;
Date.now = () => NOW;

// --- Etats de reference -----------------------------------------------------
// Chaque profil fixe pop/ressources/batiments a une echelle representative.
// cycles>=12 + pop/batiments au-dela des graces -> on mesure la formule nue.
const SCALES = {
  early: {
    label: "Early (pop 800, ~45 batiments)",
    population: 800, food: 2500, gold: 600, knowledge: 400, infrastructure: 60,
    buildings: { foragers: 12, granaries_city: 8, caravans: 6, storytellers: 5, scribes: 3, roads: 6, aqueducts: 3, markets: 2 }
  },
  mid: {
    label: "Mid (pop 40K, ~370 batiments)",
    population: 40000, food: 120000, gold: 60000, knowledge: 45000, infrastructure: 8000,
    buildings: { foragers: 80, granaries_city: 50, caravans: 40, storytellers: 40, scribes: 25, roads: 40, aqueducts: 25, markets: 25, guilds: 18, watch: 12, bureaucracy: 12, sewers: 12, irrigated_fields: 12, schools: 15 }
  },
  late: {
    label: "Late (pop 1G, ~3000 batiments)",
    population: 1e9, food: 3e9, gold: 1.5e9, knowledge: 8e8, infrastructure: 2e7,
    buildings: { foragers: 400, granaries_city: 300, caravans: 250, storytellers: 250, scribes: 200, roads: 300, aqueducts: 200, markets: 200, guilds: 150, watch: 100, bureaucracy: 100, sewers: 150, irrigated_fields: 150, schools: 120, river_ports: 100, courthouses: 80, water_mills: 80, public_works: 60, mint_houses: 40, imperial_exchanges: 20 }
  }
};

function applyScale(def) {
  setState(defaultState());
  state.cycles = 14;            // au-dela des graces de fondation/installation
  state.dynastyCount = 3;
  state.legitimacy = 30;
  state.ruins = D(500);
  state.cycleStartedAt = NOW - 20 * 60_000; // cycle de 20 min (settlingGrace eteinte)
  state.population = D(def.population);
  state.food = D(def.food);
  state.gold = D(def.gold);
  state.knowledge = D(def.knowledge);
  state.infrastructure = D(def.infrastructure);
  for (const id of Object.keys(state.buildings)) state.buildings[id] = 0;
  for (const [id, c] of Object.entries(def.buildings)) if (id in state.buildings) state.buildings[id] = c;
  invalidateRenderCache("all");
}

function target() {
  invalidateRenderCache("all");
  return pressureBreakdown();
}

// --- Achats a tester ---------------------------------------------------------
const PURCHASES = [
  { id: "sewers25", label: "+25 egouts (stabilisant -0.003)", apply: () => { state.buildings.sewers += 25; } },
  { id: "courthouses10", label: "+10 tribunaux (stabilisant -0.006)", apply: () => { state.buildings.courthouses += 10; } },
  { id: "infra50", label: "+50% ressource Infrastructure", apply: () => { state.infrastructure = D(state.infrastructure).mul(1.5); } },
  { id: "roads25", label: "+25 routes (production d'infra)", apply: () => { state.buildings.roads += 25; } },
  { id: "foodHalf", label: "-50% Nourriture (controle scarcity)", apply: () => { state.food = D(state.food).mul(0.5); } }
];

const rows = [];
for (const [scaleId, def] of Object.entries(SCALES)) {
  applyScale(def);
  const base = target();
  for (const p of PURCHASES) {
    applyScale(def);
    p.apply();
    const after = target();
    rows.push({
      scale: scaleId, scaleLabel: def.label, purchase: p.label,
      before: base.total, after: after.total, delta: after.total - base.total,
      mitigBefore: base.mitigation, mitigAfter: after.mitigation,
      structBefore: base.structural, structAfter: after.structural
    });
  }
}

// --- Console ------------------------------------------------------------------
console.log("\n=== IMPACT DES ACHATS SUR LA CIBLE DE RUPTURE ===\n");
console.table(rows.map((r) => ({
  Echelle: r.scale,
  Achat: r.purchase,
  "Cible avant": r.before.toFixed(3),
  "Cible apres": r.after.toFixed(3),
  Delta: (r.delta >= 0 ? "+" : "") + r.delta.toFixed(3)
})));

// --- Markdown -----------------------------------------------------------------
let md = `# Impact des achats sur la jauge de Rupture - mesure exacte

> Genere par \`bench-rupture.js\`. Cible de pression (\`pressureBreakdown().total\`)
> mesuree avant/apres chaque achat, sur trois etats de reference (graces eteintes,
> cycle de 20 min). Delta negatif = l'achat REDUIT la pression (bon pour le joueur).
> Reference avant reequilibrage : delta ~ -0.000 partout en late game (plafonds durs satures).

| Echelle | Achat | Cible avant | Cible apres | Delta |
|---|---|---|---|---|
`;
for (const r of rows) {
  md += `| ${r.scaleLabel} | ${r.purchase} | ${r.before.toFixed(3)} | ${r.after.toFixed(3)} | ${(r.delta >= 0 ? "+" : "") + r.delta.toFixed(3)} |\n`;
}
md += `
## Lecture
- **Stabilisants (egouts/tribunaux)** : prise directe sur la charge structurelle (\`STABILIZER_DIRECT_FACTOR\`) - leur delta doit rester negatif et sensible a TOUTES les echelles.
- **Infrastructure (ressource et producteurs)** : agit via la couverture en ratio (mitigation, portage du structural, absorption de la complexity).
- **Nourriture -50%** : controle positif - la scarcity doit reagir fortement (c'est la tension voulue).
- Leviers de reglage : \`INFRA_COVERAGE_*\`, \`MITIGATION_*\`, \`STABILIZER_DIRECT_FACTOR\`, \`COMPLEXITY_COVERAGE_ABSORB\` dans \`src/game/core/balance.js\`.
`;
fs.writeFileSync("rupture-impact.md", md, "utf8");
console.log("Ecrit : rupture-impact.md");
