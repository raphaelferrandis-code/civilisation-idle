// LE CRÉDIT HORS-LIGNE NE DÉPEND PLUS DE L'INSTANT DU DÉPART, ET VERSER = S'ABSENTER
// (audit 2026-10-05, BUG-7, BUG-8, BUG-9, BUG-10, BUG-31).
//  - BUG-7 : le crédit linéaire relisait rates() segment après segment sur des
//    stocks déjà gonflés, et posait des coupes sans fenêtre active : partir 10 s
//    après un effondrement payait ×2,3 ce que payait un départ 5 min plus tard.
//  - BUG-8 : le versement de clepsydre rejouait le temps sous une horloge partie
//    AVANT le début du cycle (âge négatif) : ~6× moins de chutes en farm.
//  - BUG-9 : quitter pendant la crise terminale (ou une modale) jetait l'absence.
//  - BUG-10 : l'Édit « usure » ne tirait plus jamais une fois la crise terminale
//    ouverte (elle gèle l'Usure).
//  - BUG-31 : la simulation sautait vers l'onglet Effondrement, sauvegardait à
//    chaque chute, et taisait les pactes honorés ou brisés.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import * as stateModule from "../state.js";
const { state, setState, hydrateState, invalidateRenderCache, setGamePaused, setCollapseInProgress } = stateModule;
import { applyOfflineProgress, spendStoredTime, checkAutoCollapse } from "../main.js";
import { registerIdleReport, dismissIdleReport, publishIdleReport } from "../idleReport.js";
import { autoCollapseDelay, rates } from "../mechanics.js";
import { BRAISIERS_DURATION_MS, HEPH_POP_DECAY_START_MIN, RAGNAROK_ID, RAGNAROK_WINTER_AT_MS } from "../../data/myths.js";
import { SAVE_KEY } from "../saveKey.js";
import { D, toNum } from "../num.js";
import { MID_GAME_FIXTURE, FIXED_NOW } from "./fixtures.js";

const HOUR = 3_600_000;

// Hasard REJOUABLE : la comparaison absence / versement rejoue la vraie boucle
// (aubaines, temple, épitaphes) — les deux passes doivent tirer les mêmes dés.
function seedRandom(seed = 12345) {
  let s = seed >>> 0;
  vi.spyOn(Math, "random").mockImplementation(() => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  });
}

const ratio = (a, b) => toNum(D(a).div(D(b)));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  setGamePaused(false);
  setCollapseInProgress(false);
});

afterEach(() => {
  dismissIdleReport();
  setGamePaused(false);
  setCollapseInProgress(false);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// Cité linéaire de l'audit : la Nourriture de base suit la population, c'est ce
// qui rendait le crédit segment par segment sensible à l'instant du départ.
const linearRaw = (extra = {}) => ({
  ...MID_GAME_FIXTURE, buildings: { foragers: 30, granaries_city: 20 }, instability: 0.1, cycles: 20, ...extra
});

// Absence de `seconds` : l'état est hydraté À L'INSTANT DU DÉPART, puis on revient.
function runAbsence(rawAt, seconds) {
  const departed = FIXED_NOW - seconds * 1000;
  vi.setSystemTime(departed);
  setState(hydrateState(rawAt(departed)));
  vi.setSystemTime(FIXED_NOW);
  invalidateRenderCache("all");
  const before = { food: D(state.food), population: D(state.population), cycles: state.cycles, ruins: D(state.ruins) };
  applyOfflineProgress(seconds);
  return before;
}

// Versement de `seconds` : le même état, écrit MAINTENANT, avec la clepsydre pleine.
function runPour(rawAt, seconds) {
  vi.setSystemTime(FIXED_NOW);
  setState(hydrateState({ ...rawAt(FIXED_NOW), storedSeconds: seconds }));
  invalidateRenderCache("all");
  const before = { food: D(state.food), population: D(state.population), cycles: state.cycles, ruins: D(state.ruins) };
  const res = spendStoredTime();
  expect(res.ok).toBe(true);
  return before;
}

describe("BUG-7 — crédit linéaire : même crédit quel que soit l'instant du départ", () => {
  const ABS = 7200;
  const gainFor = (ageAtDeparture, extra = {}) => {
    const before = runAbsence((t) => linearRaw({ cycleStartedAt: t - ageAtDeparture * 1000, lastTick: t, ...extra }), ABS);
    return { food: D(state.food).sub(before.food), population: D(state.population).sub(before.population) };
  };

  it("absence de 2 h partie à 10 s contre 300 s de cycle → même crédit", () => {
    const early = gainFor(10);
    const late = gainFor(300);
    expect(ratio(early.food, late.food)).toBeCloseTo(1, 9);
    expect(ratio(early.population, late.population)).toBeCloseTo(1, 9);
  });

  it("Braisiers actifs au départ : leurs secondes au taux ×2, le reste au taux de base, rien de plus", () => {
    const age = 10;
    const departed = FIXED_NOW - ABS * 1000;
    vi.setSystemTime(departed);
    setState(hydrateState(linearRaw({ cycleStartedAt: departed - age * 1000, lastTick: departed, prometheeBraisiers: true })));
    invalidateRenderCache("all");
    const rateIn = D(rates().food);
    vi.setSystemTime(departed - age * 1000 + BRAISIERS_DURATION_MS);
    invalidateRenderCache("all");
    const rateOut = D(rates().food);
    expect(toNum(rateIn.div(rateOut))).toBeGreaterThan(1.5); // la fenêtre compte vraiment
    const inSec = BRAISIERS_DURATION_MS / 1000 - age;
    const expected = rateIn.mul(inSec).add(rateOut.mul(ABS - inSec));
    const gain = gainFor(age, { prometheeBraisiers: true });
    expect(ratio(gain.food, expected)).toBeCloseTo(1, 9);
  });

  it("une Bénédiction ×1 qui expire pendant l'absence ne change rien au crédit", () => {
    const plain = gainFor(300);
    const blessed = gainFor(300, { blessingUntil: FIXED_NOW - ABS * 1000 + 60_000, blessingMult: 1 });
    expect(ratio(blessed.food, plain.food)).toBeCloseTo(1, 9);
  });

  it("une vraie Bénédiction ne paie que ses minutes : entre le taux ×1 et le taux béni partout", () => {
    const plain = gainFor(300);
    const blessed = gainFor(300, { blessingUntil: FIXED_NOW - ABS * 1000 + 600_000, blessingMult: 1.5 });
    const r = ratio(blessed.food, plain.food);
    expect(r).toBeGreaterThan(1);
    expect(r).toBeLessThan(1.1); // 10 min bénies sur 120 : bien loin du ×1,5 partout
  });

  // Les escaliers des Mythes, absents de la liste des coupes : le Rayonnement
  // d'Héphaïstos s'éteint juste APRÈS 3 min (test strict), l'Hiver Fimbul gèle la
  // production de moitié à 8 min. Sans eux, un départ en tout début de cycle
  // étalait le taux d'avant la marche sur les deux heures.
  it("Mythes : Héphaïstos à 3 min et l'Hiver Fimbul à 8 min coupent le crédit à leur heure", () => {
    for (const [mythId, windowMs, age, key] of [
      ["mythe_d_hephaistos", HEPH_POP_DECAY_START_MIN * 60_000 + 1, 60, "population"],
      [RAGNAROK_ID, RAGNAROK_WINTER_AT_MS, 300, "food"]
    ]) {
      const extra = { grandResetCount: 3, activeMythId: mythId, mythsCompleted: {} };
      const departed = FIXED_NOW - ABS * 1000;
      vi.setSystemTime(departed);
      setState(hydrateState(linearRaw({ cycleStartedAt: departed - age * 1000, lastTick: departed, ...extra })));
      invalidateRenderCache("all");
      const rateIn = D(rates()[key]);
      vi.setSystemTime(departed - age * 1000 + windowMs);
      invalidateRenderCache("all");
      const rateOut = D(rates()[key]);
      expect(toNum(rateIn.sub(rateOut))).toBeGreaterThan(0); // la fenêtre compte vraiment
      const inSec = windowMs / 1000 - age;
      const expected = rateIn.mul(inSec).add(rateOut.mul(ABS - inSec));
      const gain = gainFor(age, extra);
      expect(ratio(gain[key], expected)).toBeCloseTo(1, 9);
    }
  });
});

describe("BUG-8 — verser une heure vaut une heure d'absence", () => {
  it("chemin linéaire : versement de 1 h à 30 min de cycle = absence de 1 h partie à 30 min, legs compris", () => {
    const raw = (t) => linearRaw({
      cycleStartedAt: t - 1800 * 1000, lastTick: t,
      activeEpitaphLegacy: { id: "granaries", cause: "famine", chosenCycle: 19, startedAt: t - 1800 * 1000 }
    });
    const a = runAbsence(raw, 3600);
    const absFood = D(state.food).sub(a.food);
    const absPop = D(state.population).sub(a.population);
    const p = runPour(raw, 3600);
    const pourFood = D(state.food).sub(p.food);
    const pourPop = D(state.population).sub(p.population);
    expect(ratio(pourFood, absFood)).toBeCloseTo(1, 9);
    expect(ratio(pourPop, absPop)).toBeCloseTo(1, 9);
  });

  it("chemin farm : versement de 2 h contre absence de 2 h sur le même état → mêmes chutes, mêmes ressources", () => {
    const farmRaw = (t) => ({
      population: 100000, food: 400000, gold: 200000, knowledge: 30000, infrastructure: 3000,
      ruins: 5000, cycles: 10, instability: 0.3, timeWear: 0.1, bestEraIndex: 6,
      cyclePeaks: { population: 120000, knowledge: 35000, infrastructure: 3500, eraIndex: 6 },
      cycleStartedAt: t - 20 * 60_000, lastTick: t,
      buildings: { foragers: 30, granaries_city: 20, caravans: 12, markets: 8, irrigated_fields: 6 },
      upgrades: { conseil_de_crise: true, edit_effondrement: true },
      hephHeritage: true,
      crisisDoctrine: { p25: "stabiliser", p50: "stabiliser", p75: "stabiliser", autoCollapse: { enabled: true, trigger: "temps", timeSeconds: 600, usureThreshold: 0.9, prepare: false } }
    });
    seedRandom();
    const a = runAbsence(farmRaw, 7200);
    const abs = { cycles: state.cycles - a.cycles, ruins: D(state.ruins).sub(a.ruins).toString(), food: state.food.toString(), pop: state.population.toString() };
    vi.restoreAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    seedRandom();
    const p = runPour(farmRaw, 7200);
    const pour = { cycles: state.cycles - p.cycles, ruins: D(state.ruins).sub(p.ruins).toString(), food: state.food.toString(), pop: state.population.toString() };
    expect(abs.cycles).toBeGreaterThan(5); // déclencheur « temps » à 10 min : une chute toutes les 10 min
    expect(pour).toEqual(abs);
  });
});

describe("BUG-9 / BUG-10 — la crise terminale ne mange plus l'absence ni le farm", () => {
  const terminalFarm = (trigger) => (t) => ({
    population: 100000, food: 400000, gold: 200000, knowledge: 30000, infrastructure: 3000,
    ruins: 5000, cycles: 10, instability: 1, timeWear: 0.3, bestEraIndex: 6,
    cyclePeaks: { population: 120000, knowledge: 35000, infrastructure: 3500, eraIndex: 6 },
    buildings: { foragers: 30, granaries_city: 20, caravans: 12, markets: 8, irrigated_fields: 6 },
    upgrades: { conseil_de_crise: true, edit_effondrement: true },
    hephHeritage: true, crisisLimitAnnounced: true, crisisOpenedAt: t - 60_000,
    crisisDoctrine: { p25: "stabiliser", p50: "stabiliser", p75: "stabiliser", autoCollapse: { enabled: true, trigger, timeSeconds: 3600, usureThreshold: 0.9, prepare: false } },
    cycleStartedAt: t - HOUR, lastTick: t
  });

  it("farm (rupture100) parti pendant la grâce terminale : l'Édit effondre et le farm continue", () => {
    seedRandom();
    const before = runAbsence(terminalFarm("rupture100"), 7200);
    expect(state.cycles - before.cycles).toBeGreaterThan(0);
    expect(toNum(D(state.ruins).sub(before.ruins))).toBeGreaterThan(0);
    expect(state.lastTick).toBe(FIXED_NOW);
  });

  it("farm (usure) parti en crise terminale avant le seuil : des chutes répétées hors ligne", () => {
    seedRandom();
    const before = runAbsence(terminalFarm("usure"), 7200);
    expect(state.cycles - before.cycles).toBeGreaterThan(1);
  });

  // Crise terminale ouverte à 30 s de cycle : moisson nulle, l'Édit ne peut pas
  // effondrer, la cité reste gelée — en ligne comme hors ligne. La sortie `break`
  // de la sim créditait pourtant le reste de l'absence au taux plein (+4,5e8 de
  // Nourriture ici, quel que soit le déclencheur).
  it("farm figé en crise terminale à moisson nulle : rien n'est produit, le reliquat va dans la clepsydre", () => {
    for (const trigger of ["usure", "temps", "rupture100"]) {
      const young = (t) => ({
        ...terminalFarm(trigger)(t),
        bestEraIndex: 0, cyclePeaks: { population: 120, knowledge: 35, infrastructure: 3, eraIndex: 0 },
        cycleStartedAt: t - 90_000, crisisOpenedAt: t - 60_000
      });
      let report = null;
      const unregister = registerIdleReport((r) => { report = r; });
      const before = runAbsence(young, 7200);
      unregister();
      expect(state.cycles).toBe(before.cycles);
      expect(state.crisisLimitAnnounced).toBe(true);
      expect(D(state.food).eq(before.food)).toBe(true);
      expect(state.storedSeconds).toBe(7200 - 10); // un pas de sim, puis la cité figée
      expect(report.creditedSec).toBe(10);
      expect(report.storedSec).toBe(7190);
      expect(state.lastTick).toBe(FIXED_NOW);
    }
  });

  it("dialogue bloquant ouvert : rien n'est crédité, l'absence va dans la clepsydre", () => {
    setState(hydrateState(linearRaw({ lastTick: FIXED_NOW - HOUR })));
    setGamePaused(true);
    const food = state.food.toString();
    applyOfflineProgress(3600);
    expect(state.food.toString()).toBe(food);
    expect(state.storedSeconds).toBe(3600);
    expect(state.lastTick).toBe(FIXED_NOW);
    expect(stateModule.gamePaused).toBe(true); // la modale reste maîtresse de la pause
  });

  it("en ligne, Édit « usure » à 0,9 : une crise terminale atteinte avant le seuil effondre après la grâce", async () => {
    setState(hydrateState({
      ...MID_GAME_FIXTURE, instability: 1, timeWear: 0.3, cycles: 12,
      upgrades: { conseil_de_crise: true, edit_effondrement: true },
      crisisLimitAnnounced: true, crisisOpenedAt: FIXED_NOW - 10_000,
      crisisDoctrine: { autoCollapse: { enabled: true, trigger: "usure", usureThreshold: 0.9, prepare: false } }
    }));
    invalidateRenderCache("all");
    const cycles = state.cycles;
    checkAutoCollapse();
    expect(stateModule.collapseInProgress).toBe(false); // la grâce court encore
    vi.setSystemTime(FIXED_NOW + autoCollapseDelay());
    checkAutoCollapse();
    expect(stateModule.collapseInProgress).toBe(true);
    await vi.advanceTimersByTimeAsync(2500); // le deuil (pas de carte en test)
    expect(state.cycles).toBe(cycles + 1);
    expect(state.crisisLimitAnnounced).toBe(false);
  });
});

describe("BUG-31 — la simulation hors-ligne n'a plus d'effets de bord", () => {
  // Cité sous forte pression (cible de Rupture ~1,6) : chaque cycle rejoué finit
  // en crise terminale, c'est-à-dire par triggerCollapseChoices.
  const pressedFarmRaw = (extra = {}) => (t) => ({
    ...MID_GAME_FIXTURE, population: 2e6, food: 6e7, gold: 5e6, knowledge: 1e6, infrastructure: 50, bestEraIndex: 6,
    buildings: { foragers: 60, granaries_city: 30, caravans: 30, markets: 20, guilds: 10 }, cycles: 12, instability: 0.9, timeWear: 0.3,
    upgrades: { conseil_de_crise: true, edit_effondrement: true }, hephHeritage: true, activeView: "city",
    crisisDoctrine: { p25: "stabiliser", p50: "stabiliser", p75: "stabiliser", autoCollapse: { enabled: true, trigger: "rupture100", timeSeconds: 3600, usureThreshold: 0.9, prepare: false } },
    cycleStartedAt: t - 600_000, lastTick: t,
    ...extra
  });
  const farmRaw = (extra = {}) => (t) => ({
    population: 100000, food: 400000, gold: 200000, knowledge: 30000, infrastructure: 3000,
    ruins: 5000, cycles: 10, instability: 0.3, timeWear: 0.1, bestEraIndex: 6,
    cyclePeaks: { population: 120000, knowledge: 35000, infrastructure: 3500, eraIndex: 6 },
    cycleStartedAt: t - 20 * 60_000, lastTick: t, activeView: "city",
    buildings: { foragers: 30, granaries_city: 20, caravans: 12, markets: 8, irrigated_fields: 6 },
    upgrades: { conseil_de_crise: true, edit_effondrement: true },
    hephHeritage: true,
    crisisDoctrine: { p25: "stabiliser", p50: "stabiliser", p75: "stabiliser", autoCollapse: { enabled: true, trigger: "rupture100", timeSeconds: 600, usureThreshold: 0.9, prepare: false } },
    ...extra
  });

  it("des chutes rejouées : une seule sauvegarde, et le joueur reste sur la vue Cité", () => {
    const writes = [];
    globalThis.localStorage = {
      getItem: () => null,
      removeItem: () => {},
      setItem: (key) => { if (key === SAVE_KEY) writes.push(key); }
    };
    try {
      seedRandom();
      const before = runAbsence(pressedFarmRaw(), 7200);
      expect(state.cycles - before.cycles).toBeGreaterThan(1);
      expect(state.activeView).toBe("city");
      expect(writes.length).toBe(1); // la sauvegarde finale d'applyOfflineProgress
    } finally {
      delete globalThis.localStorage;
    }
  });

  it("un pacte honoré pendant l'absence est annoncé au journal et au rapport", () => {
    let report = null;
    const unregister = registerIdleReport((r) => { report = r; });
    seedRandom();
    runAbsence(farmRaw({ activeMythId: "mythe_de_promethee", prometheePopReached: true, prometheeFailed: false }), 7200);
    unregister();
    expect(state.mythsCompleted.mythe_de_promethee).toBe(true);
    expect(report.myths.crowned.length).toBe(1);
    expect(state.history.some((line) => line.includes(report.myths.crowned[0]))).toBe(true);
  });

  it("un pacte brisé par une chute de l'absence est annoncé au rapport", () => {
    let report = null;
    const unregister = registerIdleReport((r) => { report = r; });
    seedRandom();
    runAbsence(pressedFarmRaw({ activeMythId: "mythe_de_promethee", prometheePopReached: false, prometheeFailed: true }), 7200);
    unregister();
    expect(state.mythsCompleted.mythe_de_promethee).toBeFalsy();
    expect(report.myths.broken).toBeTruthy();
  });

  it("le rapport survit au démontage de la vue Cité jusqu'à sa fermeture", () => {
    const report = { title: "x", deltas: [], idle: [] };
    publishIdleReport(report);
    let got = null;
    let unregister = registerIdleReport((r) => { got = r; });
    expect(got).toBe(report);
    unregister(); // la vue Cité se démonte sans que le rapport soit fermé
    got = null;
    unregister = registerIdleReport((r) => { got = r; });
    expect(got).toBe(report); // … et le retrouve au remontage
    dismissIdleReport(report); // fermé
    unregister();
    got = null;
    unregister = registerIdleReport((r) => { got = r; });
    expect(got).toBe(null);
    unregister();
  });
});
