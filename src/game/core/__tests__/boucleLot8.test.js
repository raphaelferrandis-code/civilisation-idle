"use strict";
// Audit du 2026-10-05, lot 8 — la boucle de jeu et le poids de la save :
//  - PERF-17 : rattrapage hors ligne (signature de ruinEffects reconstruite à
//              chaque appel, auto-achat qui re-chiffrait chaque candidat) ;
//  - PERF-16 : « Tout acheter » re-balayait tous les bâtiments après CHAQUE unité ;
//  - PERF-69 : notifications et sauvegardes redondantes dans la boucle ;
//  - SAV-16  : chaque dépêche de la Chronique recopiait le texte de son article.
// Aucun chronomètre (la CI est 2 à 3 fois plus lente) : on COMPTE les chiffrages,
// les notifications et les écritures, et on compare des suites d'achats.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Compteur de chiffrages : automation.js et building.js lisent buildingBatchCost
// par le baril mechanics.js. ⚠ Ce fichier n'importe JAMAIS le baril lui-même :
// importé le premier, sa fabrique chargeait les actions pendant qu'elle se
// construisait, et building.js recevait alors le vrai module (compteur muet).
const h = vi.hoisted(() => ({ batchCalls: 0 }));
vi.mock("../mechanics.js", async (orig) => {
  const m = await orig();
  return { ...m, buildingBatchCost: (...args) => { h.batchCalls += 1; return m.buildingBatchCost(...args); } };
});

import {
  state, setState, defaultState, defaultTempleAuto, hydrateState, invalidateRenderCache, renderCache,
  subscribe, normalizeChronicleEntries, SAVE_KEY
} from "../state.js";
import { D } from "../num.js";
import { checkAutomateRules, getAutomateRules, tickTempleAutomation } from "../actions.js";
import { buyAllAffordable, buyBuildingCore, buyableInMass } from "../actions/building.js";
import { ruinEffectSum } from "../mechanics/shared.js";
import { buildingBatchCost } from "../mechanics/cost.js";
import { enforceInfrastructureCap } from "../mechanics/production/globalMultipliers.js";
import { buyRoadWorkCore } from "../actions/roadWorks.js";
import { checkAndTriggerChronicleEntries, chronicleEntryContent } from "../chronicleEvaluator.js";
import { startGameLoop } from "../main.js";
import { canPayCost } from "../utils.js";
import { buildings } from "../../data/buildings.js";
import { upgrades } from "../../data/upgrades.js";
import { chronicleArticles } from "../../data/chronicleArticles.js";
import { ROAD_WORK_QUEUE_MAX, ROAD_WORKS_BANK_MAX, FAVEUR_ECHELLE } from "../balance.js";
import { MID_GAME_FIXTURE, FIXED_NOW } from "./fixtures.js";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("PERF-17 — ruinEffects : un cache exact, sans signature reconstruite", () => {
  // Deux nœuds de ruines du même effet, pour lire leur somme.
  const byType = {};
  for (const u of upgrades) if (u.group === "ruins" && u.effectType && u.amount) (byType[u.effectType] ||= []).push(u);
  const [type, [a, b]] = Object.entries(byType).find(([, list]) => list.length >= 2);

  it("relu sans recalcul tant que rien ne change, juste dès qu'on écrit en place", () => {
    setState(defaultState());
    state.upgrades = { [a.id]: true };
    expect(ruinEffectSum(type)).toBeCloseTo(a.amount, 12);
    const cache = renderCache.cachedRuinEffects;
    expect(ruinEffectSum(type)).toBeCloseTo(a.amount, 12);
    expect(renderCache.cachedRuinEffects).toBe(cache); // même objet : aucun recalcul
    state.upgrades[b.id] = true; // ajout EN PLACE, sans invalidation
    expect(ruinEffectSum(type)).toBeCloseTo(a.amount + b.amount, 12);
    state.upgrades[a.id] = false; // passage à faux
    expect(ruinEffectSum(type)).toBeCloseTo(b.amount, 12);
    delete state.upgrades[a.id];
    state.upgrades[a.id] = true; // retiré puis remis : l'ordre change
    expect(ruinEffectSum(type)).toBeCloseTo(a.amount + b.amount, 12);
    state.upgrades = { [b.id]: true }; // autre objet (Grand Reset, import)
    expect(ruinEffectSum(type)).toBeCloseTo(b.amount, 12);
    renderCache.cachedRuinEffectsSignature = ""; // invalidation explicite (achat d'un nœud)
    expect(ruinEffectSum(type)).toBeCloseTo(b.amount, 12);
    expect(renderCache.cachedRuinEffects).not.toBe(cache);
  });
});

describe("PERF-17 — auto-achat : un seul chiffrage par candidat", () => {
  it("rien d'abordable : chaque candidat est chiffré une fois, plus de second chiffrage dans buyBuildingCore", () => {
    setState(defaultState());
    state.hephHeritage = true;
    state.population = D(1e6);
    state.cyclePeaks = { population: D(1e6), food: D(1e12), gold: D(1e12), knowledge: D(1e12), infrastructure: D(1e6), eraIndex: 3 };
    for (const k of ["food", "gold", "knowledge", "infrastructure"]) state[k] = D(0);
    invalidateRenderCache("all");
    for (const r of getAutomateRules()) r.enabled = false;
    const rule = getAutomateRules().find((r) => r.id === "auto_buy_city");
    rule.enabled = true;
    rule.perTick = 10;
    const candidats = buildings.filter((b) => b.category === "city" && buyableInMass(b)).length;
    expect(candidats).toBeGreaterThan(3);
    h.batchCalls = 0;
    checkAutomateRules();
    expect(h.batchCalls).toBe(candidats); // avant : 2 × candidats
  });
});

// L'ANCIEN glouton de « Tout acheter », recopié tel quel : re-balayage complet
// après chaque unité. La version rapide doit donner la MÊME suite d'achats.
function toutAcheterReference() {
  const babelLock = state.activeMythId === "mythe_de_babel" ? state.babelCategory : null;
  let bought = 0;
  while (bought < 10000) {
    let best = null;
    let bestKey = null;
    for (const b of buildings) {
      if (!buyableInMass(b)) continue;
      if (babelLock && b.category !== babelLock) continue;
      const cost1 = buildingBatchCost(b, 1);
      if (!canPayCost(cost1)) continue;
      const key = cost1[b.currency];
      if (best === null || key.gt(bestKey)) { best = b; bestKey = key; }
    }
    if (!best) break;
    if (!buyBuildingCore(best.id, { amount: 1, silent: true })) break;
    bought += 1;
  }
  let works = 0;
  if (!babelLock || babelLock === "infra") {
    while (works < ROAD_WORK_QUEUE_MAX + ROAD_WORKS_BANK_MAX && buyRoadWorkCore()) works += 1;
  }
  enforceInfrastructureCap();
  return bought + works;
}

function citeRiche(exp, { ruin = null, counts = {} } = {}) {
  setState(defaultState());
  state.cycles = 12;
  const v = D(`1e${exp}`);
  for (const k of ["food", "gold", "knowledge", "infrastructure", "population"]) state[k] = v;
  state.cyclePeaks = { population: v, food: v, gold: v, knowledge: v, infrastructure: v, eraIndex: 10 };
  if (ruin) state.activeRuinIds = [ruin];
  Object.assign(state.buildings, counts);
  invalidateRenderCache("all");
}
const empreinte = () => JSON.stringify({
  b: state.buildings, f: String(state.food), g: String(state.gold), k: String(state.knowledge), i: String(state.infrastructure),
  sm: state.sisypheMult, ins: state.instability, lp: state.lifetimePurchases
});

describe("PERF-16 — « Tout acheter » : la même suite d'achats, sans re-balayage par unité", () => {
  const premiers = (cat) => buildings.filter((b) => b.category === cat).slice(0, 2);
  const cas = [
    ["sans fardeau", 12, {}],
    ["Pente du rocher (tous les prix montent à chaque achat)", 10, { ruin: "sisyphe" }],
    ["Feu volé (moteurs à nourriture plus chers)", 10, { ruin: "promethee" }],
    // La bascule de la catégorie dominante allège l'ancienne : ces deux villes-là
    // donnaient une autre suite d'achats sans le re-balayage à la bascule.
    ["Confusion des langues, Cité en tête", 10, { ruin: "babel", counts: Object.fromEntries(premiers("city").map((b) => [b.id, 10])) }],
    ["Confusion des langues, Savoir en tête", 10, { ruin: "babel", counts: Object.fromEntries(premiers("knowledge").map((b) => [b.id, 10])) }]
  ];
  for (const [nom, exp, opts] of cas) {
    it(`${nom} : état final identique au bit près`, () => {
      citeRiche(exp, opts);
      const nRef = toutAcheterReference();
      const ref = empreinte();
      citeRiche(exp, opts);
      expect(buyAllAffordable()).toBe(nRef);
      expect(empreinte()).toBe(ref);
      expect(nRef).toBeGreaterThan(20);
    });
  }

  it("le nombre de chiffrages suit les achats, plus achats × bâtiments", () => {
    citeRiche(30);
    h.batchCalls = 0;
    const n = buyAllAffordable();
    expect(n).toBeGreaterThan(1000);
    // Avant : un chiffrage de CHAQUE bâtiment par unité (~4 600 × 30). Après : un par
    // achat, plus un balayage par bâtiment épuisé.
    expect(h.batchCalls).toBeLessThan(3 * n);
  });
});

describe("PERF-69 — pas de notification en plus dans le tick", () => {
  it("l'auto-achat ne notifie plus : la boucle le fait juste après le tick", () => {
    setState(defaultState());
    state.hephHeritage = true;
    state.population = D(1e6);
    for (const k of ["food", "gold", "knowledge", "infrastructure"]) state[k] = D(1e12);
    state.cyclePeaks = { population: D(1e6), food: D(1e12), gold: D(1e12), knowledge: D(1e12), infrastructure: D(1e6), eraIndex: 3 };
    invalidateRenderCache("all");
    for (const r of getAutomateRules()) r.enabled = r.id === "auto_buy_city";
    const avant = JSON.stringify(state.buildings);
    let notes = 0;
    const off = subscribe(() => { notes += 1; });
    checkAutomateRules();
    off();
    expect(JSON.stringify(state.buildings)).not.toBe(avant); // il a bien acheté
    expect(notes).toBe(0);
  });

  it("les autos de la Maison jouent sans notifier", () => {
    setState(hydrateState(MID_GAME_FIXTURE));
    state.bestEraIndex = 4;
    state.faveur = 500 * FAVEUR_ECHELLE;
    state.maisonRefund = 0;
    const auto = defaultTempleAuto();
    for (const g of Object.values(auto)) g.unlocked = true;
    auto.osselets.on = true;
    auto.osselets.faveurFloor = 0;
    state.templeAuto = auto;
    let notes = 0;
    const off = subscribe(() => { notes += 1; });
    tickTempleAutomation();
    off();
    expect(state.templeAuto.osselets.lastAt).toBe(FIXED_NOW); // le jet a eu lieu
    expect(notes).toBe(0);
  });
});

describe("PERF-69 — sauvegardes : ni par dépêche, ni onglet caché sans crédit", () => {
  let writes;
  let listeners;
  beforeEach(() => {
    writes = 0;
    const store = new Map();
    vi.stubGlobal("localStorage", {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => { if (k === SAVE_KEY) writes += 1; store.set(k, v); },
      removeItem: (k) => store.delete(k)
    });
    listeners = {};
    const on = (t, fn) => { (listeners[t] ||= []).push(fn); };
    const off = (t, fn) => { listeners[t] = (listeners[t] || []).filter((f) => f !== fn); };
    vi.stubGlobal("window", { addEventListener: on, removeEventListener: off });
    vi.stubGlobal("document", { hidden: false, addEventListener: on, removeEventListener: off });
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("une dépêche de la Chronique n'écrit plus la save", () => {
    setState(hydrateState({}));
    state.chronicleCooldown = 0;
    checkAndTriggerChronicleEntries(state, 1);
    expect(state.chronicleEntries).toHaveLength(1);
    expect(writes).toBe(0);
  });

  it("onglet caché : une save au masquage, puis plus rien tant qu'aucun tick ne crédite", () => {
    setState(hydrateState({ ...MID_GAME_FIXTURE, lastTick: FIXED_NOW }));
    const cleanup = startGameLoop();
    vi.advanceTimersByTime(10_000);
    const visibles = writes;
    expect(visibles).toBeGreaterThan(0); // autosave à 2 s et 10 s, onglet visible
    document.hidden = true;
    for (const fn of listeners.visibilitychange || []) fn();
    expect(writes).toBe(visibles + 1); // la save du masquage
    vi.advanceTimersByTime(120_000);
    expect(writes).toBe(visibles + 1); // avant : une save toutes les 10 s, sur un état figé
    document.hidden = false;
    vi.advanceTimersByTime(10_000);
    expect(writes).toBeGreaterThan(visibles + 1); // de retour : l'autosave reprend
    cleanup();
  });
});

describe("SAV-16 — la Chronique ne garde que l'identité de ses dépêches", () => {
  it("une dépêche publiée ne recopie ni titre, ni texte, ni auteur : ils se relisent dans l'article", () => {
    setState(hydrateState({}));
    state.chronicleCooldown = 0;
    checkAndTriggerChronicleEntries(state, 1);
    const entry = state.chronicleEntries[0];
    expect(entry).not.toHaveProperty("title");
    expect(entry).not.toHaveProperty("text");
    expect(entry).not.toHaveProperty("author");
    const art = chronicleArticles.find((a) => a.id === entry.articleId);
    expect(chronicleEntryContent(entry)).toEqual({ title: art.title, text: art.text, author: art.author || null });
    // Une rediffusion (id suffixé) relit le même article.
    expect(chronicleEntryContent({ ...entry, id: `${entry.articleId}~r1` }).title).toBe(art.title);
  });

  it("vieille save : le texte ne survit que sur la dernière dépêche, en repli ; 250 dépêches pèsent moitié moins", () => {
    const vieilles = chronicleArticles.slice(0, 250).map((art, i) => ({
      id: art.id, articleId: art.id, title: art.title, text: art.text, author: art.author,
      age: "Campement", date: `An ${i + 1}`, category: "Chronique", isNew: i === 0, isRerun: false, publishedAt: FIXED_NOW - i * 180_000
    }));
    const avant = JSON.stringify(vieilles).length;
    const norm = normalizeChronicleEntries(vieilles);
    expect(norm).toHaveLength(vieilles.length);
    expect(norm[0].title).toBe(vieilles[0].title);
    expect(norm.slice(1).some((e) => "title" in e || "text" in e || "author" in e)).toBe(false);
    expect(chronicleEntryContent(norm[7]).text).toBe(vieilles[7].text);
    expect(JSON.stringify(norm).length).toBeLessThan(avant / 2); // ~77 Ko → ~36 Ko
    // Article disparu : le repli sur le texte gardé.
    expect(chronicleEntryContent({ id: "p9_disparu", title: "Vieux titre", text: "Vieux texte" }))
      .toEqual({ title: "Vieux titre", text: "Vieux texte", author: null });
  });
});
