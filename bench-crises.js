"use strict";
/* ============================================================================
 * bench-crises.js - Les choix de crise (paliers 25/50/75 %) changent-ils
 * vraiment l'issue d'une partie, et la bonne réponse dépend-elle de la
 * situation ?
 *
 * Deux mesures, sur une partie neuve jouée par le même plan d'achats que
 * simulate-ce et la même Régulation (réforme de fond du foyer dominant dès
 * que la cible dépasse REGUL_AT et qu'elle est payable) :
 *
 * 1. CARRIÈRES (défaut) — trois joueurs types jouent le même budget de temps
 *    et ne diffèrent QUE par leurs réponses aux crises :
 *      - prudent : traite (stabilise) toujours ;
 *      - cupide  : profite (temporise) toujours ;
 *      - lucide  : lit sa marge — profite si la cible de Rupture reste sous
 *                  LUCIDE_MAX malgré la dette, ou si traiter ne la ramènerait
 *                  pas sous 100 % (la cité tombe de toute façon) ; sinon traite.
 *    Métrique : Ruines gagnées dans le budget (le dernier cycle, inachevé,
 *    compte à son gain projeté). Si les trois se valent, les crises ne
 *    comptent pas ; si une posture pure gagne, le choix est résolu d'avance.
 *
 * 2. CONTREFACTUEL (--branch) — une carrière prudente ; à CHAQUE crise, la
 *    suite du cycle est rejouée deux fois depuis le même état exact (même
 *    hasard), une fois en traitant, une fois en profitant (les crises
 *    suivantes du cycle étant traitées). On note laquelle rapporte le plus de
 *    Ruines par heure de cycle. Si le gagnant change selon la situation, le
 *    choix n'est pas résolu d'avance — c'est le but.
 *
 * Usage : node bench-crises.js [--hours=12] [--seed=N] [--only=a,b,c]
 *         [--lucide=0.5] [--regul=0.85|off] [--cap=4] [--branch]
 *         [--treat=a,b,c] [--profit=a,b,c] [--prep=a,b,c] [--out=fichier.md]
 *   --only : limite le tirage aux crises listées (ids de CRISIS_POOL), pour
 *            mesurer un lot précis (le pilote). Sinon, tirage normal du jeu.
 *   --treat/--profit/--prep : molettes de calibrage des crises « qui comptent »
 *            (par palier 25/50/75 %), appliquées aux options en mémoire — même
 *            effet que modifier CRISIS_*_SHIFT / CRISIS_PROFIT_PREP (balance.js).
 *   --cap : heures max par cycle ; un cycle tenu jusque-là tombe à ce moment
 *            (gain projeté, ruinGain(true)), comme le ferait un joueur.
 * Sortie : console + crisis-choices-impact.md (ou --out).
 * ========================================================================== */
import fs from "fs";

// --- Stubs DOM (avant imports jeu), comme bench-rupture.js ------------------
global.window = { addEventListener() {}, removeEventListener() {} };
global.localStorage = { getItem() { return null; }, setItem() {} };
Object.defineProperty(global, "navigator", { value: { clipboard: { writeText() {} } }, writable: true, configurable: true });
const stubEl = () => ({ className: "", dataset: {}, innerHTML: "", textContent: "", disabled: false, value: "", checked: false, style: {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } }, addEventListener() {}, removeEventListener() {}, setAttribute() {}, showModal() {}, remove() {}, click() {}, appendChild() {}, querySelector() { return stubEl(); }, querySelectorAll() { return []; } });
global.document = { addEventListener() {}, removeEventListener() {}, documentElement: { style: { setProperty() {} } }, body: { appendChild() {} }, querySelector() { return stubEl(); }, querySelectorAll() { return []; }, createElement() { return stubEl(); }, getElementById() { return stubEl(); } };
global.Audio = class { constructor() { this.volume = 1; } addEventListener() {} play() { return Promise.resolve(); } pause() {} };
global.render = () => {}; global.save = () => {};

const argv = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)=?(.*)$/);
  return m ? [m[1], m[2] === "" ? true : m[2]] : [a, true];
}));
const BUDGET_S = (Number(argv.hours) || 12) * 3600;
const SEED = argv.seed != null ? Number(argv.seed) >>> 0 : 0x9e3779b9;
const ONLY = typeof argv.only === "string" ? argv.only.split(",") : null;
const OUT = typeof argv.out === "string" ? argv.out : "crisis-choices-impact.md";
const TICK = 5;                 // secondes virtuelles par tick (comme simulate-ce)
const CYCLE_CAP_S = (Number(argv.cap) || 4) * 3600;
const LUCIDE_MAX = Number(argv.lucide) || 0.5;
const REGUL_AT = argv.regul === "off" ? Infinity : (Number(argv.regul) || 0.85);
const BRANCH = Boolean(argv.branch);

// --- Horloge virtuelle + hasard seedé RESTAURABLE ------------------------------
// L'état du générateur est un simple entier : on peut le sauver/restaurer pour
// rejouer une branche à l'identique (mode contrefactuel).
let VT = 0;
const BASE = 1_700_000_000_000;
Date.now = () => BASE + VT * 1000;
const rng = { a: SEED };
Math.random = () => {
  rng.a |= 0; rng.a = (rng.a + 0x6D2B79F5) | 0;
  let t = Math.imul(rng.a ^ (rng.a >>> 15), 1 | rng.a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// --- Imports jeu --------------------------------------------------------------
const stateModule = await import("./src/game/core/state.js");
const { state, defaultState, hydrateState, invalidateRenderCache, setState, setGamePaused, setCollapseInProgress, setBuyAmount } = stateModule;
const { registerChoiceDialog } = await import("./src/game/core/choiceDialog.js");
const mech = await import("./src/game/core/mechanics.js");
const { isUnlocked, buildingBatchCost, ruinGain, crisisOpen, pressureBreakdown, addProductionPenalty, amplifyRuptureFactor } = mech;
const { canPayCost, payCost, clamp01 } = await import("./src/game/core/utils.js");
const { D, toNum } = await import("./src/game/core/num.js");
const actions = await import("./src/game/core/actions.js");
const { completeCollapse, tick, chronicle, runCrisisAction } = actions;
const { generateEpitaph } = await import("./src/game/core/events.js");
const { buildings, dynastyNames } = await import("./src/game/data/buildings.js");
const { CRISIS_POOL } = await import("./src/game/data/world.js");
const { registerWorldEffects } = await import("./src/game/data/worldEffects.js");
registerWorldEffects({ addProductionPenalty, chronicle, amplifyRuptureFactor, clamp01, state });

const num = (x) => { const n = toNum(x); return Number.isFinite(n) ? n : Number.MAX_VALUE; };
const flush = () => new Promise((r) => setImmediate(r));

// --- Tirage restreint (--only) + molettes ---------------------------------------
// Les crises hors liste sont marquées « récentes » à chaque tick : le tirage du
// jeu les écarte alors d'office. Les conditions des crises retenues sont levées
// (sinon une crise non éligible laisserait repasser une autre).
if (ONLY) {
  for (const ev of CRISIS_POOL) if (ONLY.includes(ev.id)) ev.condition = () => true;
}
const NOT_ONLY = ONLY ? CRISIS_POOL.filter((e) => !ONLY.includes(e.id)).map((e) => e.id) : [];
const knob = (k) => (typeof argv[k] === "string" ? argv[k].split(",").map(Number) : null);
const TREAT = knob("treat"), PROFIT = knob("profit"), PREP = knob("prep");
const LEVEL = { 0.25: 0, 0.5: 1, 0.75: 2 };
for (const ev of CRISIS_POOL) for (const o of ev.options || []) {
  if (typeof o.foyerShift !== "number") continue;
  const i = LEVEL[ev.threshold];
  if (o.stance === "stabiliser" && TREAT) o.foyerShift = -TREAT[i];
  if (o.stance === "temporiser" && PROFIT) o.foyerShift = PROFIT[i];
  if (o.stance === "temporiser" && PREP) o.prep = PREP[i];
}
const CRISIS_BY_ID = Object.fromEntries(CRISIS_POOL.map((e) => [e.id, e]));

// --- Politiques de réponse aux crises --------------------------------------------
// Dette effective d'une option : son déplacement de foyer, freiné par la
// réforme/l'apaisement déjà acquis sur ce foyer (même formule que pressure.js).
function optionShift(opt) {
  if (!opt || typeof opt.foyerShift !== "number" || !opt.foyer) return 0;
  const cut = Math.min(0.72, (state.foyerRelief?.[opt.foyer] || 0) + (state.foyerReform?.[opt.foyer] || 0));
  return opt.foyerShift * (1 - cut);
}
const POLICIES = {
  prudent: (opts) => opts.find((o) => o.stance === "stabiliser"),
  cupide: (opts) => opts.find((o) => o.stance === "temporiser"),
  // Profite quand son choix ne change pas l'issue, traite quand il la fait
  // basculer : si la cible reste sous LUCIDE_MAX même après la dette, profiter
  // est gratuit ; si traiter ne ramène pas la cible sous 100 %, la cité tombe de
  // toute façon et autant encaisser ; sinon (zone critique), traiter.
  lucide: (opts) => {
    const greedy = opts.find((o) => o.stance === "temporiser");
    const safe = opts.find((o) => o.stance === "stabiliser");
    const target = pressureBreakdown().total;
    if (target + optionShift(greedy) < LUCIDE_MAX) return greedy;
    if (target + optionShift(safe) >= 1) return greedy;
    return safe;
  }
};
// `decide` : politique courante ; `forced` : posture imposée à la PROCHAINE
// crise seulement (branches du contrefactuel). `log` reçoit chaque décision.
const ctl = { decide: POLICIES.prudent, forced: null, log: [] };
registerChoiceDialog((dialog) => {
  const opts = (dialog.options || []).filter((o) => typeof o.apply === "function");
  if (opts.length < 2) return dialog.options?.[0] || {};
  invalidateRenderCache("all");
  const p = pressureBreakdown();
  let pick;
  if (ctl.forced) { pick = opts.find((o) => o.stance === ctl.forced); ctl.forced = null; }
  pick = pick || ctl.decide(opts) || opts[0];
  // Le dialogue ne transporte pas l'id ; checkCrisisThresholds vient de le
  // pousser en dernier dans recentCrisisIds.
  const id = (state.recentCrisisIds || []).slice(-1)[0];
  const foyer = CRISIS_BY_ID[id]?.foyer;
  ctl.log.push({ id, stance: pick.stance, target: p.total, foyerValue: foyer ? p[foyer] : 0, wear: state.timeWear || 0, cycle: state.cycles });
  return pick;
});

// --- Plan d'achats (repris de simulate-ce.js buyBuildings, sans les Mythes) -----
function buyBuildings(cycleVT) {
  const t = {};
  const b = state.buildings;
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
  for (const [id, target] of Object.entries(t)) if ((b[id] || 0) < target) { allMet = false; break; }
  const scale = (allMet ? 6 + state.cycles : 4) + Math.floor(cycleVT / 600);
  let bought = 0;
  for (let pass = 0; pass < 16; pass++) {
    const visible = buildings
      .filter((bd) => t[bd.id] > 0 && isUnlocked(bd) && (b[bd.id] || 0) < t[bd.id] * scale)
      .sort((a, c) => ((b[a.id] || 0) / (t[a.id] * scale)) - ((b[c.id] || 0) / (t[c.id] * scale)));
    if (!visible.length) break;
    let changed = false;
    for (const bd of visible) {
      const cost = buildingBatchCost(bd, 1);
      if (!canPayCost(cost)) continue;
      if (bd.id !== "foragers" && cost.food && D(state.food).sub(cost.food).lt(D(state.population).mul(0.5))) continue;
      payCost(cost);
      state.buildings[bd.id] = (b[bd.id] || 0) + 1;
      bought++; changed = true;
      break;
    }
    if (!changed) break;
  }
  if (bought) invalidateRenderCache("all");
}

// --- Régulation commune : réforme de fond du foyer qui pèse le plus ------------
const REFORM_OF = { scarcity: "reformScarcity", inequality: "reformInequality", complexity: "reformComplexity", dissent: "reformDissent" };
function regulate() {
  invalidateRenderCache("all");
  const p = pressureBreakdown();
  if (p.total < REGUL_AT) return;
  const order = Object.keys(REFORM_OF).sort((a, b) => (p[b] || 0) - (p[a] || 0));
  for (const foyer of order) {
    if ((state.foyerReform?.[foyer] || 0) >= 0.72 - 1e-6) continue;
    try { runCrisisAction(REFORM_OF[foyer], { render: false }); } catch { /* noop */ }
    return;
  }
}

// --- Boucle de jeu ------------------------------------------------------------------
async function step(cycleStartVT) {
  if (ONLY) state.recentCrisisIds = NOT_ONLY.slice();
  buyBuildings(VT - cycleStartVT);
  regulate();
  tick(TICK);
  VT += TICK;
  while (stateModule.gamePaused && !crisisOpen()) await flush();
}
const cycleOver = (cycleStartVT) => crisisOpen() || VT - cycleStartVT >= CYCLE_CAP_S;
// Gain du cycle qui s'arrête ici : réel s'il est tombé, projeté s'il a tenu
// jusqu'au plafond (ou si le budget l'interrompt).
const cycleGain = () => num(crisisOpen() ? ruinGain() : ruinGain(true));
function collapseNow(gain) {
  completeCollapse(D(gain), dynastyNames[state.cycles % dynastyNames.length], generateEpitaph(), crisisOpen() ? "auto" : "forced");
  setGamePaused(false); setCollapseInProgress(false);
}
function freshGame() {
  VT = 0; rng.a = SEED; ctl.log = []; ctl.forced = null;
  setState(defaultState());
  state.roadCoverage = 0.9; // bonus réseau routier en régime établi (cf. simulate-ce G-07)
  setGamePaused(false); setCollapseInProgress(false); setBuyAmount(1);
  invalidateRenderCache("all");
}

// Instantané complet (état + horloge + hasard) pour rejouer une branche.
const snapshot = () => ({ json: JSON.stringify(state), VT, a: rng.a });
function restore(snap) {
  setState(hydrateState(JSON.parse(snap.json)));
  VT = snap.VT; rng.a = snap.a;
  setGamePaused(false); setCollapseInProgress(false);
  invalidateRenderCache("all");
}

// --- 1. Carrières sur un budget de temps --------------------------------------------
async function career(name) {
  freshGame();
  ctl.decide = POLICIES[name];
  const cycles = [];
  while (VT < BUDGET_S) {
    const start = VT;
    while (!cycleOver(start) && VT < BUDGET_S) await step(start);
    const gain = cycleGain();
    cycles.push({ dur: VT - start, gain, peakPop: num(state.cyclePeaks?.population ?? state.population), cause: crisisOpen() ? ((state.timeWear || 0) >= 1 ? "usure" : "rupture") : (VT >= BUDGET_S ? "budget" : "plafond") });
    if (gain <= 0 || VT >= BUDGET_S) break;
    collapseNow(gain);
  }
  const total = cycles.reduce((s, c) => s + c.gain, 0);
  return { name, cycles, total, picks: ctl.log.slice() };
}

// --- 2. Contrefactuel : rejouer chaque crise des deux façons ---------------------------
// Joue la suite du cycle depuis l'instantané, la prochaine crise étant forcée
// à `stance` (les suivantes traitées). Rend les Ruines/heure du cycle entier.
async function branchValue(snap, cycleStartVT, stance) {
  restore(snap);
  ctl.decide = POLICIES.prudent; ctl.forced = stance;
  const logLen = ctl.log.length;
  while (!cycleOver(cycleStartVT)) await step(cycleStartVT);
  const gain = cycleGain();
  ctl.log.length = logLen; // les décisions des branches ne polluent pas le journal
  const hours = (VT - cycleStartVT) / 3600;
  return { gain, hours, perHour: gain / Math.max(1e-9, hours) };
}
async function counterfactual() {
  freshGame();
  ctl.decide = POLICIES.prudent;
  const rows = [];
  while (VT < BUDGET_S) {
    const start = VT;
    while (!cycleOver(start) && VT < BUDGET_S) {
      const snap = snapshot();
      const before = ctl.log.length;
      await step(start);
      if (ctl.log.length === before) continue;
      // Une crise vient de tomber pendant ce tick : on rejoue deux fois.
      const ctx = ctl.log[ctl.log.length - 1];
      const treat = await branchValue(snap, start, "stabiliser");
      const profit = await branchValue(snap, start, "temporiser");
      rows.push({ ...ctx, treat, profit, best: profit.perHour > treat.perHour ? "profiter" : "traiter" });
      // Retour sur la ligne principale (prudente) : on rejoue le même tick.
      restore(snap);
      ctl.decide = POLICIES.prudent;
      ctl.log.length = before;
      await step(start);
    }
    const gain = cycleGain();
    if (gain <= 0 || VT >= BUDGET_S) break;
    collapseNow(gain);
  }
  return rows;
}

// --- Exécution + rapport ------------------------------------------------------------------
const fmtH = (s) => `${Math.floor(s / 3600)} h ${String(Math.round((s % 3600) / 60)).padStart(2, "0")}`;
const pct = (x) => `${Math.round(x * 100)} %`;
let md = `# Choix de crise : impact mesuré

> Généré par \`bench-crises.js\` (partie neuve, budget ${BUDGET_S / 3600} h, graine ${SEED},
> tick ${TICK} s, plan d'achats de simulate-ce, réforme du foyer dominant dès ${REGUL_AT === Infinity ? "jamais" : "une cible de " + REGUL_AT},
> plafond ${CYCLE_CAP_S / 3600} h par cycle).
> ${ONLY ? `Tirage limité à : ${ONLY.join(", ")}.` : "Tirage normal du jeu."}
> Molettes : traiter ${TREAT ? TREAT.join("/") : "défaut"} · profiter ${PROFIT ? PROFIT.join("/") : "défaut"} · Ruines ${PREP ? PREP.join("/") : "défaut"}.
`;

// Contrefactuel (--branch), ajouté APRÈS les carrières dans le même rapport.
const branchSection = async () => {
  const rows = await counterfactual();
  const nProfit = rows.filter((r) => r.best === "profiter").length;
  console.log(`contrefactuel : ${rows.length} crises, meilleur = profiter ${nProfit} / traiter ${rows.length - nProfit}`);
  md += `
## Contrefactuel : à chaque crise, quelle option rapporte le plus ?

Ligne principale prudente. Pour chaque crise, la suite du cycle est rejouée depuis
le même état exact, une fois en traitant, une fois en profitant (Ruines par heure
de cycle). **Meilleur choix : profiter ${nProfit} fois, traiter ${rows.length - nProfit} fois.**

| Cycle | Crise | Cible | Foyer | Usure | Traiter (R/h) | Profiter (R/h) | Meilleur |
|---|---|---|---|---|---|---|---|
`;
  for (const r of rows) {
    md += `| ${r.cycle + 1} | ${r.id} | ${pct(r.target)} | ${pct(r.foyerValue)} | ${pct(r.wear)} | ${r.treat.perHour.toFixed(1)} (${fmtH(r.treat.hours * 3600)}) | ${r.profit.perHour.toFixed(1)} (${fmtH(r.profit.hours * 3600)}) | ${r.best} |\n`;
    console.log(`  c${r.cycle + 1} ${String(r.id).padEnd(20)} cible ${pct(r.target).padStart(5)}  traiter ${r.treat.perHour.toFixed(1).padStart(6)} R/h  profiter ${r.profit.perHour.toFixed(1).padStart(6)} R/h  → ${r.best}`);
  }
};
{
  const results = [];
  for (const name of Object.keys(POLICIES)) {
    const r = await career(name);
    results.push(r);
    console.log(`${name.padEnd(8)} ruines=${r.total.toFixed(0).padStart(6)} en ${BUDGET_S / 3600} h  cycles=${r.cycles.length}  traiter/profiter=${r.picks.filter((p) => p.stance === "stabiliser").length}/${r.picks.filter((p) => p.stance === "temporiser").length}`);
  }
  md += `
## Carrières (même budget de temps)

| Joueur | Ruines en ${BUDGET_S / 3600} h | Cycles | Traiter / Profiter |
|---|---|---|---|
`;
  for (const r of results) {
    md += `| ${r.name} | ${r.total.toFixed(0)} | ${r.cycles.length} | ${r.picks.filter((p) => p.stance === "stabiliser").length} / ${r.picks.filter((p) => p.stance === "temporiser").length} |\n`;
  }
  md += `\n### Détail par cycle\n\n| Joueur | Cycle | Durée | Pic de pop | Ruines | Fin |\n|---|---|---|---|---|---|\n`;
  // 12 premiers cycles par joueur : le cupide en enchaîne plus d'une centaine.
  for (const r of results) r.cycles.slice(0, 12).forEach((c, i) => {
    md += `| ${r.name} | ${i + 1} | ${fmtH(c.dur)} | ${c.peakPop.toExponential(2)} | ${c.gain.toFixed(0)} | ${c.cause} |\n`;
  });
}
if (BRANCH) await branchSection();
fs.writeFileSync(OUT, md, "utf8");
console.log(`Écrit : ${OUT}`);
