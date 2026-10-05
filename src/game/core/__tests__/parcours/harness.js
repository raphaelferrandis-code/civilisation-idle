// HARNAIS DE PARCOURS (audit 2026-10-05, TEST-1) — repris du harnais de l'audit
// (_audit/tmp-parcours). Un joueur scripté (player.js) pilote les VRAIES actions
// du jeu sous horloge virtuelle (vi.useFakeTimers) : achats, crises,
// effondrements, Ruines, Grands Resets, Mythes, Icare, hors-ligne. Garde-fous :
// NaN / Infinity / négatifs, aller-retour JSON + hydrateState, rechargement
// simulé, détecteur de blocage.
//
// Rien n'est écrit sur le disque, sauf si PC_OUT désigne un dossier (journal,
// résumé et saves des jalons y vont alors) : le journal reste en mémoire et
// accompagne l'échec d'un test.
import { vi } from "vitest";
import fs from "fs";
import path from "path";

export const BASE_NOW = 1_800_000_000_000;

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Lancé par `npm run test:parcours` (npm pose npm_lifecycle_event, sur tous les
// systèmes) ou par PARCOURS=1 : hors de la suite par défaut, trop long pour elle.
export const PARCOURS_ON = process.env.PARCOURS === "1" || process.env.npm_lifecycle_event === "test:parcours";

let restoreFns = [];

// Horloge virtuelle, hasard graine, stockage en mémoire, console bâillonnée
// (comptée) ; puis les modules du jeu. À défaire par restoreEnv().
export async function setupEnv(seed = 12345, now = BASE_NOW) {
  const mem = new Map();
  const prevStorage = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => { mem.set(k, String(v)); },
    removeItem: (k) => { mem.delete(k); },
    clear: () => mem.clear(),
    key: (i) => [...mem.keys()][i] ?? null,
    get length() { return mem.size; }
  };
  vi.useFakeTimers({ now, toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
  const rng = mulberry32(seed);
  const prevRandom = Math.random;
  Math.random = () => rng();
  const counters = { error: 0, warn: 0, errors: [] };
  const prevConsole = { error: console.error, warn: console.warn, log: console.log, info: console.info };
  console.error = (...a) => { counters.error++; if (counters.errors.length < 60) counters.errors.push(a.map(String).join(" ").slice(0, 400)); };
  console.warn = () => { counters.warn++; };
  console.log = () => {};
  console.info = () => {};
  restoreFns = [
    () => { globalThis.localStorage = prevStorage; },
    () => { Math.random = prevRandom; },
    () => { Object.assign(console, prevConsole); },
    () => { vi.useRealTimers(); }
  ];
  const g = {};
  g.st = await import("../../state.js");
  g.actions = await import("../../actions.js");
  g.mech = await import("../../mechanics.js");
  g.main = await import("../../main.js");
  g.myth = await import("../../../data/myths.js");
  g.ar = await import("../../../data/activeRuins.js");
  g.up = await import("../../../data/upgrades.js");
  g.bld = await import("../../../data/buildings.js");
  g.world = await import("../../../data/world.js");
  g.cd = await import("../../choiceDialog.js");
  g.num = await import("../../num.js");
  g.utils = await import("../../utils.js");
  g.vows = await import("../../../data/vows.js");
  g.layout = await import("../../../map/layout.js");
  g.rw = await import("../../actions/roadWorks.js");
  g.counters = counters;
  g.mem = mem;
  return g;
}

export function restoreEnv() {
  for (const fn of restoreFns.reverse()) fn();
  restoreFns = [];
}

// Charge une save figée (fixture) comme le ferait un chargement : horloge posée
// à l'heure de la save, hydratation, caches remis à neuf.
export function loadSave(g, raw) {
  const { setState, hydrateState, invalidateRenderCache } = g.st;
  if (raw.vt != null) vi.setSystemTime(BASE_NOW + raw.vt * 1000);
  setState(hydrateState(JSON.parse(JSON.stringify(raw.state || raw))));
  invalidateRenderCache("all");
}

export function vtSec() { return (Date.now() - BASE_NOW) / 1000; }

export function fmtT(sec) {
  sec = Math.round(sec);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return `${h}h${String(m).padStart(2, "0")}m${String(s).padStart(2, "0")}s`;
}

// ── Garde-fous numériques ──────────────────────────────────────────────────
const NONNEG = ["population", "food", "gold", "knowledge", "infrastructure", "ruins", "faveur", "storedSeconds", "icarusPotFaveur", "atridesDebt", "cycles", "grandResetCount"];
export function scanState(g, out) {
  const { state } = g.st;
  const { Decimal } = g.num;
  const bad = [];
  const seen = new Set();
  function walk(v, p, depth) {
    if (depth > 6 || v === null || v === undefined) return;
    if (v instanceof Decimal) {
      const s = v.toString();
      if (/NaN|Infinity/.test(s)) bad.push(`${p}=${s}`);
      return;
    }
    if (typeof v === "number") {
      if (!Number.isFinite(v) && !(p.endsWith("Until") || p.endsWith("At"))) bad.push(`${p}=${v}`);
      return;
    }
    if (typeof v === "object") {
      if (seen.has(v)) return; seen.add(v);
      if (Array.isArray(v)) { v.slice(0, 50).forEach((x, i) => walk(x, `${p}[${i}]`, depth + 1)); return; }
      for (const k of Object.keys(v)) walk(v[k], p ? `${p}.${k}` : k, depth + 1);
    }
  }
  walk(state, "", 0);
  for (const k of NONNEG) {
    const v = state[k];
    if (v instanceof Decimal ? v.lt(0) : (typeof v === "number" && v < 0)) bad.push(`${k}<0 (${String(v)})`);
  }
  if (!(state.instability >= 0 && state.instability <= 1)) bad.push(`instability hors [0,1] = ${state.instability}`);
  if (!(state.timeWear >= 0 && state.timeWear <= 1)) bad.push(`timeWear hors [0,1] = ${state.timeWear}`);
  for (const [id, n] of Object.entries(state.buildings || {})) if (!(Number.isInteger(n) && n >= 0)) bad.push(`buildings.${id}=${n}`);
  if (bad.length && out) out(bad);
  return bad;
}

// Champs que l'hydratation remet à neuf par conception (cf. saveRoundTrip.test.js).
const TRANSIENT = new Set(["lastCycleReport", "mourning", "chute", "pendingCrisisSlot", "cadmosPromptPending", "roadDoors"]);

// Aller-retour JSON → hydrateState → JSON : liste des champs qui changent.
export function roundTrip(g) {
  const { state, hydrateState } = g.st;
  const s1 = JSON.stringify(state);
  let h;
  try { h = hydrateState(JSON.parse(s1)); } catch (e) { return { error: String((e && e.stack) || e) }; }
  const s2 = JSON.stringify(h);
  if (s1 === s2) return { same: true, size: s1.length };
  const a = JSON.parse(s1), b = JSON.parse(s2);
  const diffs = [];
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    if (TRANSIENT.has(k)) continue;
    const ja = canon(a[k]), jb = canon(b[k]);
    if (ja !== jb) diffs.push({ k, before: (ja || "undefined").slice(0, 300), after: (jb || "undefined").slice(0, 300), detail: deepDiff(a[k], b[k], k).slice(0, 8) });
  }
  return { same: diffs.length === 0, size: s1.length, diffs };
}

// Journal : en mémoire (les 400 dernières lignes, rendues par tail()), et dans
// PC_OUT/<nom>.log si ce dossier est donné.
export function makeLogger(name) {
  const lines = [];
  const dir = process.env.PC_OUT;
  const file = dir ? path.join(dir, `${name}.log`) : null;
  if (file) { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(file, ""); }
  const log = (line) => {
    lines.push(line);
    if (lines.length > 400) lines.shift();
    if (file) fs.appendFileSync(file, line + "\n");
  };
  log.tail = (n = 40) => lines.slice(-n).join("\n");
  log.dump = (fileName, data) => {
    if (!dir) return;
    fs.writeFileSync(path.join(dir, fileName), typeof data === "string" ? data : JSON.stringify(data, null, 1));
  };
  return log;
}

export async function flushMicro() {
  for (let i = 0; i < 6; i++) await Promise.resolve();
}

// Avance l'horloge virtuelle de `ms` en exécutant les timers échus (deuil 2 s,
// GR 1,3 s, vol d'Icare, dialogues à durée…). Chemin rapide sans timer en attente.
export async function advance(ms) {
  if (vi.getTimerCount() === 0) {
    vi.setSystemTime(Date.now() + ms);
    await flushMicro();
  } else {
    await vi.advanceTimersByTimeAsync(ms);
  }
}

// Un pas de la boucle de jeu, comme startGameLoop (main.js) : l'horloge avance,
// le temps de jeu est crédité, puis tick() et l'Édit d'effondrement.
export async function step(g, dt) {
  const { state } = g.st;
  await advance(dt * 1000);
  state.playTimeSec = (state.playTimeSec || 0) + dt;
  if (state.chronicleStats) state.chronicleStats.lifetimePlaySec = (state.chronicleStats.lifetimePlaySec || 0) + dt;
  state.lastTick = Date.now();
  g.actions.tick(dt);
  g.main.checkAutoCollapse();
}

// Attend une promesse du jeu en faisant avancer l'horloge virtuelle.
export async function settle(p, stepMs = 250, maxSteps = 400) {
  let done = false, val, err;
  p.then((v) => { done = true; val = v; }, (e) => { done = true; err = e; });
  for (let i = 0; i < maxSteps && !done; i++) {
    await flushMicro();
    if (done) break;
    await advance(stepMs);
  }
  if (!done) throw new Error("settle: promesse jamais résolue");
  if (err) throw err;
  return val;
}

// Représentation canonique : clés triées, zéros d'une table de compteurs et
// conteneurs vides ignorés — l'hydratation complète une fiche partielle (la vallée
// gardée par completeCollapse sans carte : cityCore sans quarters/districts) sans
// rien perdre.
const isEmptyBox = (x) => x !== null && typeof x === "object" && Object.keys(x).length === 0;
export function canon(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]";
  const ks = Object.keys(v).filter((k) => !(v[k] === 0 || v[k] === false || v[k] === null || v[k] === undefined || isEmptyBox(v[k]))).sort();
  return "{" + ks.map((k) => JSON.stringify(k) + ":" + canon(v[k])).join(",") + "}";
}
export function deepDiff(a, b, p) {
  const out = [];
  if (canon(a) === canon(b)) return out;
  if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) out.push(...deepDiff(a[k], b[k], p + "." + k));
    return out;
  }
  out.push(p + ": " + String(JSON.stringify(a)).slice(0, 120) + " -> " + String(JSON.stringify(b)).slice(0, 120));
  return out;
}
