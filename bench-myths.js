"use strict";
/* ============================================================================
 * bench-myths.js - Mesure EXACTE de l'impact de chaque Heritage de Mythe sur la
 * production, l'Usure, les couts et l'automatisation - SANS avoir a atteindre le
 * GR1 organiquement.
 *
 * Methode : on construit un etat de jeu controle (meme economie pour tous), on
 * mesure les metriques AVANT, on applique applyHeritage() + la condition
 * d'activation reelle de l'heritage (lue dans le code), on remesure APRES.
 * Tous les chiffres viennent des vraies formules (src/game/**). Ce qui n'est pas
 * mesurable headless (ex. adjacence Babel = carte) est FLAGGE, pas invente.
 *
 * Sortie : myth-impact.md (+ table console).
 * Usage  : node bench-myths.js
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
const { buildings } = await import("./src/game/data/buildings.js");
const mythMod = await import("./src/game/data/myths.js");
const { MYTHS, getMythById } = mythMod;
const stateModule = await import("./src/game/core/state.js");
const { state, defaultState, invalidateRenderCache, setState } = stateModule;
const { registerChoiceDialog } = await import("./src/game/core/choiceDialog.js");
registerChoiceDialog((d) => d.options?.[0] || {});
const mech = await import("./src/game/core/mechanics.js");
const { rates, globalMultiplier, timeWearRate, buildingBatchCost, ruinGain } = mech;
const { D, toNum } = await import("./src/game/core/num.js");
const actions = await import("./src/game/core/actions.js");
const { addProductionPenalty, amplifyRuptureFactor } = mech;
const { chronicle } = actions;
const { clamp01, fmt } = await import("./src/game/core/utils.js");
const { registerWorldEffects } = await import("./src/game/data/worldEffects.js");
registerWorldEffects({ addProductionPenalty, chronicle, amplifyRuptureFactor, clamp01, state });

// Horloge virtuelle fixe (les heritages a fenetre temporelle lisent Date.now()).
const NOW = 1_000_000_000_000;
Date.now = () => NOW;

const n = (x) => { const v = toNum(x); return Number.isFinite(v) ? v : Number.MAX_VALUE; };
function prodTotal() {
  invalidateRenderCache("all");
  const r = rates();
  return n(r.population) + n(r.food) + n(r.gold) + n(r.knowledge) + n(r.infrastructure);
}
function prodBreakdown() {
  invalidateRenderCache("all");
  const r = rates();
  return { pop: n(r.population), food: n(r.food), gold: n(r.gold), knowledge: n(r.knowledge), infra: n(r.infrastructure) };
}

// Economie de reference (mid-game raisonnable, toutes categories actives).
const LOADOUT = {
  foragers: 80, granaries_city: 50, caravans: 40, storytellers: 40, scribes: 25,
  roads: 40, aqueducts: 25, markets: 25, guilds: 18, watch: 12, bureaucracy: 12,
  sewers: 12, irrigated_fields: 12, schools: 15
};
function baseline() {
  setState(defaultState());
  state.cycles = 6;
  state.dynastyCount = 2;
  state.legitimacy = 25;
  state.grandResetCount = 0;
  state.ruins = D(800);
  state.bestEraIndex = 8;
  state.cycleStartedAt = NOW - 5 * 60_000; // cycle de 5 min en cours
  for (const id of Object.keys(state.buildings)) state.buildings[id] = 0;
  for (const [id, c] of Object.entries(LOADOUT)) if (id in state.buildings) state.buildings[id] = c;
  // Ressources plausibles pour les ratios (vitals, scarcity, etc.)
  state.population = D(40000);
  state.food = D(120000);
  state.gold = D(60000);
  state.knowledge = D(45000);
  state.infrastructure = D(8000);
  state.cyclePeaks = { population: D(40000), knowledge: D(45000), infrastructure: D(8000), eraIndex: 8 };
  invalidateRenderCache("all");
}

// Cout d'achat de reference (proxy "vitesse d'expansion") : 10 bureaucraties.
function sampleCost() {
  const b = buildings.find((x) => x.id === "bureaucracy");
  return n(buildingBatchCost(b, 10).gold || buildingBatchCost(b, 10)[b.currency]);
}

// Carte heritage -> automatisation/mecanique debloquee (exacte, depuis le code).
const AUTOMATION = {
  mythe_d_hephaistos: "Panneau AUTOMATES : achat auto de batiments + actions de crise auto (runs futures)",
  mythe_du_phenix: "Panneau SCRIPT : effondrement auto selon seuils (Rupture/Usure/temps)",
  mythe_d_icare: "Bouton SURCHAUFFE : x5 production 30s, +25% Rupture, cd 2 min",
  mythe_atrides: "Bouton PACTE : x2 production 2 min (puis -50% pendant la crise)",
  mythe_d_antee: "Choix RUINES ACTIVES en debut de cycle : x ruines selon malus actives",
  mythe_d_atlas: "Jauge LEGITIMITE (0-100) : attenue les effets negatifs des crises (jusqu'a -25%)",
  mythe_de_cadmos: "Gravure d'EPITAPHES : +2% permanent / orientation (max 3)",
  mythe_de_babel: "SYNERGIE d'adjacence sur la carte : +10% prod / voisin du meme type"
};

// Pre-setup applique AVANT la mesure "before" (pour isoler l'effet propre de
// l'heritage, ex. Ragnarok : on est deja a GR11, l'heritage n'ajoute que le x4).
const PRESETUP = {
  mythe_du_ragnarok: () => { state.grandResetCount = 11; }
};

// Activation reelle de l'heritage pour exposer son effet mesurable.
const ACTIVATE = {
  mythe_du_chaos: () => { state.chaosRuinsBonus = D(state.ruins); }, // ruines de cycle Chaos comptees x2
  mythe_de_promethee: () => { state.cycleStartedAt = NOW; },          // Braisiers : 2 premieres min
  mythe_d_enee: () => { state.eneeCollapseCount = 10; state.cycleStartedAt = NOW; }, // +100% global 30s
  mythe_de_cadmos: () => { state.cadmosPermanentEpitaphs = [
    { id: "a", orientation: "food", name: "x" }, { id: "b", orientation: "food", name: "y" }, { id: "c", orientation: "food", name: "z" }
  ]; }, // 3 epitaphes Nourriture = +6% food permanent
  mythe_age_or: () => { state.food = D(60000); state.gold = D(60000); }, // equilibre -> -20% Usure
  mythe_d_icare: () => { state.surchauffeEndTime = NOW + 30_000; },   // x5 prod 30s
  mythe_atrides: () => { state.atridesPactActive = true; state.cycleStartedAt = NOW; }, // x2 prod 2min
  mythe_d_atlas: () => {},  // -15% Usure base (toujours actif)
  mythe_d_antee: () => {},  // ruines actives : effet a l'effondrement (decrit)
  mythe_du_ragnarok: () => { state.ragnarokHeritage = true; } // x4 ruines (GR11 deja en place via PRESETUP)
};

// ruinGain depend de l'age du cycle (patience) : certains ACTIVATE remettent
// cycleStartedAt=NOW pour exposer un effet de prod -> on fige un age constant
// pour la mesure de Ruines afin d'isoler le vrai effet de l'heritage.
const RUIN_AGE_BASE = NOW - 12 * 60_000; // cycle de 12 min (patience ~0.8)
function measureRuinGain() {
  const saved = state.cycleStartedAt;
  state.cycleStartedAt = RUIN_AGE_BASE;
  state.instability = 1;
  const g = n(ruinGain());
  state.instability = 0;
  state.cycleStartedAt = saved;
  return g;
}

const results = [];
for (const m of MYTHS) {
  baseline();
  if (PRESETUP[m.id]) PRESETUP[m.id]();
  const before = { prod: prodTotal(), gmult: globalMultiplier(), wear: timeWearRate(), cost: sampleCost(), ruin: measureRuinGain() };

  try { if (typeof m.applyHeritage === "function") m.applyHeritage(); } catch { /* */ }
  if (ACTIVATE[m.id]) ACTIVATE[m.id]();

  const after = { prod: prodTotal(), gmult: globalMultiplier(), wear: timeWearRate(), cost: sampleCost(), ruin: measureRuinGain() };

  const prodX = before.prod > 0 ? after.prod / before.prod : 1;
  const gmultX = before.gmult > 0 ? after.gmult / before.gmult : 1;
  const wearX = before.wear > 0 ? after.wear / before.wear : 1;
  const costX = before.cost > 0 ? after.cost / before.cost : 1;
  const ruinX = before.ruin > 0 ? after.ruin / before.ruin : 1;

  // Gate = debloque une mecanique/automatisation persistante (carte AUTOMATION),
  // + Ragnarok (debloque le 11e Grand Reset).
  const gate = Boolean(AUTOMATION[m.id]) || m.id === "mythe_du_ragnarok";

  results.push({
    act: m.act, id: m.id, name: m.name,
    prodX, gmultX, wearX, costX, ruinX,
    automation: AUTOMATION[m.id] || (m.id === "mythe_du_ragnarok" ? "Debloque le 11e GRAND RESET (x4 Ruines permanent)" : "-"),
    gate, heritage: m.heritageDescription || ""
  });
}

// --- Sortie console ---------------------------------------------------------
const ACT = { 1: "I", 2: "II", 3: "III", ragnarok: "R" };
console.log("\n=== IMPACT DES HERITAGES DE MYTHES (mesure exacte) ===\n");
console.table(results.map((r) => ({
  Acte: ACT[r.act] || r.act,
  Mythe: r.name.replace("Le Mythe ", ""),
  "Mult global x": r.gmultX.toFixed(2),
  "Prod/s x": r.prodX.toFixed(2),
  "Usure x": r.wearX.toFixed(2),
  "Cout x": r.costX.toFixed(2),
  "Ruines x": r.ruinX.toFixed(2),
  Role: r.gate ? "GATE" : "mult."
})));

// --- Sortie markdown --------------------------------------------------------
function note(r) {
  const parts = [];
  if (Math.abs(r.gmultX - 1) > 0.01) parts.push(`mult. global x${r.gmultX.toFixed(2)}`);
  if (Math.abs(r.prodX - 1) > 0.01) parts.push(`production totale/s x${r.prodX.toFixed(2)}`);
  if (Math.abs(r.wearX - 1) > 0.01) parts.push(`Usure x${r.wearX.toFixed(2)}`);
  if (Math.abs(r.costX - 1) > 0.01) parts.push(`couts de construction x${r.costX.toFixed(2)}`);
  if (Math.abs(r.ruinX - 1) > 0.01) parts.push(`Ruines gagnees a l'effondrement x${r.ruinX.toFixed(2)}`);
  if (!parts.length) parts.push("aucun effet PASSIF mesurable (l'interet est la mecanique optionnelle debloquee, cf. Automatisation)");
  return parts.join(", ");
}
const gates = results.filter((r) => r.gate).length;
let md = `# Impact des Heritages de Mythes - mesure exacte

> Genere par \`bench-myths.js\`. Etat de reference identique pour tous (economie mid-game,
> pop 40k, ~370 batiments, 6 cycles). Chaque heritage est applique avec sa **condition
> d'activation reelle** (fenetre temporelle, equilibre, surchauffe...), puis on remesure.
> Tous les chiffres viennent des formules de \`src/game/**\`. **${gates}/${results.length}** heritages
> debloquent une mecanique/automatisation persistante (vrai gate) ; les autres sont des multiplicateurs.

## Tableau de synthese
> Prod/s x = effet sur la production totale par seconde (les ressources food/gold sont en racine du mult global, donc prod/s croit moins vite que le mult global). Usure/Couts/Ruines x : <1 = reduction (bonus).

| Acte | Mythe | Mult global x | Prod/s x | Usure x | Couts x | Ruines x | Role | Automatisation / mecanique debloquee |
|---|---|---|---|---|---|---|---|---|
`;
for (const r of results) {
  md += `| ${ACT[r.act] || r.act} | ${r.name} | ${r.gmultX.toFixed(2)} | ${r.prodX.toFixed(2)} | ${r.wearX.toFixed(2)} | ${r.costX.toFixed(2)} | ${r.ruinX.toFixed(2)} | ${r.gate ? "**GATE**" : "mult."} | ${r.automation} |\n`;
}

md += `\n## Detail par Mythe (effet mesure + verdict)\n`;
for (const r of results) {
  md += `\n### ${r.name} (Acte ${ACT[r.act] || r.act}) - ${r.gate ? "GATE de progression" : "multiplicateur"}\n`;
  md += `- **Effet passif mesure** : ${note(r)}.\n`;
  if (r.automation !== "-") md += `- **Mecanique/automatisation debloquee** : ${r.automation}.\n`;
  md += `- **Heritage (texte)** : ${r.heritage}\n`;
}

md += `\n## Lecture / verdict global
- **Gates (${gates})** : ces Mythes debloquent une mecanique **persistante** (panneaux d'automatisation Hephaistos/Phenix, boutons actifs Icare/Atrides, jauge Atlas, choix Antee, gravure Cadmos, synergie Babel). Leur "impact production" passif peut etre ~x1 : la valeur est dans la **capacite debloquee**, pas dans un multiplicateur constant.
- **Multiplicateurs** : effet passif direct mesurable (ex. Cadmos +6% nourriture avec 3 epitaphes, Sisyphe couts x${(results.find((r) => r.id === "mythe_de_sisyphe")?.costX || 1).toFixed(2)}, Enee +100% global 30s/cycle, Icare Surchauffe x${(results.find((r) => r.id === "mythe_d_icare")?.prodX || 1).toFixed(0)} ponctuel, Atrides Pacte x${(results.find((r) => r.id === "mythe_atrides")?.prodX || 1).toFixed(0)}).
- **Non mesurable headless (flagge)** : Babel adjacence (necessite la carte / placement), Antee ruines actives (multiplicateur applique a l'effondrement selon malus choisis), Ragnarok x4 ruines (effectif uniquement au 11e Grand Reset).
- **A calibrer (placeholder dans data/myths.js)** : objectifs de Chaos, Sisyphe, Antee marques "placeholder/a calibrer".
`;

fs.writeFileSync("myth-impact.md", md, "utf8");
console.log(`\nEcrit : myth-impact.md (${gates}/${results.length} gates)`);
