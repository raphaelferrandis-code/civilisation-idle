"use strict";
// Audit du 2026-10-05, lot 11 (décisions de Raph), paquet « mythes-équilibrage » :
//   BUG-38 : fenêtre du Phénix en temps de jeu NON PAUSÉ, portée à 4 min ;
//   BUG-41 : Antée et toutes les cibles du Phénix ancrées sur le pic du cycle
//            d'avant (le maintien d'Icare vit dans mythRepairs.test.js) ;
//   BUG-39 : Atrides — seul l'Or PRODUIT pendant le pacte compte ;
//   BUG-35 : Pente du rocher — un cran par unité, lot en forme fermée, plafond ×20 ;
//   BUG-24 : la voirie ne lâche pas le rocher de Sisyphe ;
//   BUG-40 : sceau VII — un vol à ×25+ avec une mise d'au moins la moitié de la table ;
//   ATLAS-ECRASE : le ciel tombé rompt le pacte, la chute manuelle redevient permise ;
//   AGE-OR-AUTOMATES : l'automate attend que le moins cher soit payable.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as stateModule from "../state.js";
import { applyOfflineProgress } from "../main.js";
import { D, toNum } from "../num.js";
import { tick } from "../actions/tick.js";
import { MYTH_TICK_HANDLERS } from "../actions/mythTicks.js";
import { activateMyth, sisyphePousser } from "../actions/myths.js";
import { completeCollapse, collapse } from "../actions/crisis.js";
import { buyBuildingCore, buyableInMass } from "../actions/building.js";
import { checkAutomateRules, getAutomateRules } from "../actions/automation.js";
import { launchIcarus, cashOutIcarus, __resetIcarusForTests } from "../actions/icarus.js";
import { tableLimits } from "../actions/maisonTable.js";
import { refreshGrandResetReveal } from "../mechanics/grandResetMilestones.js";
import { buildingBatchCost, rates } from "../mechanics.js";
import { canPayCost } from "../utils.js";
import { registerChoiceDialog } from "../choiceDialog.js";
import { buildings } from "../../data/buildings.js";
import { ACTIVE_RUIN_DEFINITIONS, ANTEE_POP_MULT, ACTIVE_RUIN_SISYPHE_CREEP, ACTIVE_RUIN_SISYPHE_MULT_CAP } from "../../data/activeRuins.js";
import { MYTHS, PHENIX_REBIRTH_WINDOW_MS, PHENIX_REBIRTH_POP_MULT, ATRIDES_GAIN_SECONDS } from "../../data/myths.js";
import { FAVEUR_ECHELLE } from "../balance.js";
import { MID_GAME_FIXTURE, FIXED_NOW } from "./fixtures.js";

const { state, setState, hydrateState, invalidateRenderCache, setGamePaused, setCollapseInProgress } = stateModule;
const latched = { _25: true, _50: true, _75: true };
// Actes I et II accomplis : l'Acte III est ouvert.
const acts12 = () => Object.fromEntries(MYTHS.filter((m) => m.act === 1 || m.act === 2).map((m) => [m.id, true]));
const allHeritages = Object.fromEntries(ACTIVE_RUIN_DEFINITIONS.map((d) => [d.stateKey, true]));

function load(overrides = {}) {
  setState(hydrateState({ ...MID_GAME_FIXTURE, crisisThresholds: latched, mythsCompleted: {}, ...overrides }));
  invalidateRenderCache("all");
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  registerChoiceDialog((d) => Promise.resolve({ ...(d.options?.[0] || {}), selectedIds: (d.multiSelectOptions || []).map((o) => o.id) }));
});

afterEach(async () => {
  // Laisse finir un deuil lancé (pas de carte en test), puis rend la main.
  await vi.advanceTimersByTimeAsync(5000);
  setGamePaused(false);
  setCollapseInProgress(false);
  registerChoiceDialog(null);
  __resetIcarusForTests();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("BUG-38 — Phénix : la fenêtre se compte en temps de jeu non pausé", () => {
  it("le compteur avance au tick et pas sous une fenêtre de crise (partie en pause)", () => {
    load({ activeMythId: "mythe_du_phenix", phoenixCycleSec: 0, instability: 0.2 });
    tick(1);
    tick(1);
    expect(state.phoenixCycleSec).toBe(2);
    setGamePaused(true);
    vi.setSystemTime(FIXED_NOW + 60_000); // une minute murale de délibération
    tick(1);
    setGamePaused(false);
    expect(state.phoenixCycleSec).toBe(2);
  });

  it("renaissance jugée sur le temps de jeu : 3 min 50 jouées valent, même après 6 min 40 murales", () => {
    load({
      activeMythId: "mythe_du_phenix", phoenixRebirthTargetPop: "60000", phoenixRenaissances: 0,
      cycleStartedAt: FIXED_NOW - 400_000, phoenixCycleSec: PHENIX_REBIRTH_WINDOW_MS / 1000 - 10,
      cyclePeaks: { ...MID_GAME_FIXTURE.cyclePeaks, population: 70_000 }
    });
    completeCollapse(D(10), "Dyn", "epi", "manual");
    expect(state.phoenixRenaissances).toBe(1);
    expect(state.activeMythId).toBe("mythe_du_phenix");
    expect(state.phoenixCycleSec).toBe(0); // le chrono de jeu repart pour la suivante
  });

  it("au-delà de 4 min de jeu, la chaîne se brise", () => {
    load({
      activeMythId: "mythe_du_phenix", phoenixRebirthTargetPop: "60000", phoenixRenaissances: 2,
      cycleStartedAt: FIXED_NOW - 60_000, phoenixCycleSec: PHENIX_REBIRTH_WINDOW_MS / 1000 + 1,
      cyclePeaks: { ...MID_GAME_FIXTURE.cyclePeaks, population: 70_000 }
    });
    completeCollapse(D(10), "Dyn", "epi", "manual");
    expect(state.phoenixRenaissances).toBe(0);
  });

  it("une save d'avant, en plein Phénix, reprend l'âge mural du cycle", () => {
    const s = hydrateState({ ...MID_GAME_FIXTURE, activeMythId: "mythe_du_phenix", cycleStartedAt: FIXED_NOW - 90_000 });
    expect(s.phoenixCycleSec).toBeCloseTo(90, 6);
    expect(hydrateState({ ...MID_GAME_FIXTURE }).phoenixCycleSec).toBe(0);
    // Arrêté au dernier crédit : l'absence depuis, le rattrapage hors ligne l'ajoute
    // (sinon elle compterait deux fois).
    const t = hydrateState({ ...MID_GAME_FIXTURE, activeMythId: "mythe_du_phenix", cycleStartedAt: FIXED_NOW - 90_000, lastTick: FIXED_NOW - 30_000 });
    expect(t.phoenixCycleSec).toBeCloseTo(60, 6);
  });

  it("le temps crédité hors ligne use la fenêtre : la cité y a produit", () => {
    // Profil linéaire (pas de farm) : la population monte au taux courant pendant
    // les 10 min, la fenêtre doit les compter — sinon renaissance offerte en
    // cachant l'onglet ou en versant la clepsydre.
    load({ activeMythId: "mythe_du_phenix", phoenixCycleSec: 30, phoenixRebirthTargetPop: "1e30" });
    const pop0 = D(state.population);
    applyOfflineProgress(600);
    expect(D(state.population).gt(pop0)).toBe(true);
    expect(state.phoenixCycleSec).toBeCloseTo(630, 6);
  });
});

describe("BUG-41 — Antée et le Phénix ancrés sur le pic du cycle d'avant", () => {
  it("Antée : base = max(départ, pic d'avant / 50) — retrouver son pic sous les fardeaux", async () => {
    load({ ...allHeritages, grandResetCount: 3, mythsCompleted: acts12(), prevCycle: { peakPop: "2000000" } });
    expect(await activateMyth("mythe_d_antee")).toBe(true);
    expect(state.activeMythId).toBe("mythe_d_antee");
    expect(D(state.mythStartPop).eq(2_000_000 / ANTEE_POP_MULT)).toBe(true);
    const antee = MYTHS.find((m) => m.id === "mythe_d_antee");
    state.cyclePeaks = { ...state.cyclePeaks, population: D(1_999_999) };
    expect(antee.onCollapse()).toBe(false);
    state.cyclePeaks = { ...state.cyclePeaks, population: D(2_000_000) };
    expect(antee.onCollapse()).toBe(true);
  });

  it("Phénix : la 1re cible vaut au moins le pic du cycle interrompu par le pacte", async () => {
    load({ grandResetCount: 3, mythsCompleted: acts12(), prevCycle: null });
    expect(await activateMyth("mythe_du_phenix")).toBe(true);
    const floor = D(state.population).mul(PHENIX_REBIRTH_POP_MULT);
    expect(floor.lt(60_000)).toBe(true); // le plancher seul visait bien plus bas
    expect(D(state.phoenixRebirthTargetPop).eq(60_000)).toBe(true); // cyclePeaks de la fixture
  });

  it("Phénix : les cibles suivantes visent au moins le pic de la cité qui vient de tomber", () => {
    load({
      activeMythId: "mythe_du_phenix", phoenixRebirthTargetPop: "60000", phoenixCycleSec: 100,
      cyclePeaks: { ...MID_GAME_FIXTURE.cyclePeaks, population: 5_000_000 }
    });
    completeCollapse(D(10), "Dyn", "epi", "manual");
    expect(state.phoenixRenaissances).toBe(1);
    const target = D(state.phoenixRebirthTargetPop);
    expect(target.eq(D(state.population).mul(PHENIX_REBIRTH_POP_MULT).max(5_000_000))).toBe(true);
    expect(target.gte(5_000_000)).toBe(true);
  });
});

describe("BUG-39 — Atrides : l'Or PRODUIT pendant le pacte, et lui seul", () => {
  it("un stock d'Or gonflé (fêtes de jalon, aubaines) ne sacre plus rien ; 150 s produites, si", () => {
    load({ activeMythId: "mythe_atrides", atridesDebt: 0, atridesEarned: "0", gold: "1e30" });
    expect(D(rates().gold).gt(0)).toBe(true); // une cité qui produit de l'Or
    MYTH_TICK_HANDLERS.mythe_atrides(state, 1);
    expect(state.atridesReached).toBe(false); // l'ancien objectif (stock − dette) l'aurait sacré
    for (let s = 1; s < ATRIDES_GAIN_SECONDS - 1; s += 1) MYTH_TICK_HANDLERS.mythe_atrides(state, 1);
    expect(state.atridesReached).toBe(false);
    for (let s = 0; s < 3; s += 1) MYTH_TICK_HANDLERS.mythe_atrides(state, 1);
    expect(state.atridesReached).toBe(true);
  });

  it("la dette se retranche du produit ; le compteur survit au rechargement et repart à chaque cycle", () => {
    load({ activeMythId: "mythe_atrides", atridesDebt: 1e300, atridesEarned: "0" });
    for (let s = 0; s < 200; s += 1) MYTH_TICK_HANDLERS.mythe_atrides(state, 1);
    expect(state.atridesReached).toBe(false);
    const earned = D(state.atridesEarned);
    expect(earned.gt(0)).toBe(true);
    const back = hydrateState(JSON.parse(JSON.stringify(state)));
    expect(D(back.atridesEarned).eq(earned)).toBe(true);
    stateModule.resetTemporaryRunState(state);
    expect(D(state.atridesEarned).eq(0)).toBe(true);
  });
});

describe("BUG-35 — Pente du rocher : un cran par unité, le lot au prix des unités", () => {
  const slope = (mult = 1) => load({
    sisypheHeritage: true, activeRuinIds: ["sisyphe"], sisypheMult: mult,
    food: "1e100", gold: "1e100", knowledge: "1e100", infrastructure: "1e100"
  });
  const b = buildings.find((x) => x.id === "foragers");
  const ratio = (x, y) => toNum(D(x).div(y));

  // Un lot de N, puis les mêmes N achetés un par un : même prix, même pente.
  function lotVsUnits(mult, n) {
    slope(mult);
    const lot = buildingBatchCost(b, n)[b.currency];
    expect(buyBuildingCore(b.id, { amount: n, silent: true })).toBe(true);
    const multLot = state.sisypheMult;
    slope(mult);
    let units = D(0);
    for (let i = 0; i < n; i += 1) {
      units = units.add(buildingBatchCost(b, 1)[b.currency]);
      expect(buyBuildingCore(b.id, { amount: 1, silent: true })).toBe(true);
    }
    return { lot, units, multLot, multUnits: state.sisypheMult };
  }

  it("un Max de 50 vaut 50 crans, et coûte autant que 50 achats un par un", () => {
    const r = lotVsUnits(1, 50);
    expect(r.multLot).toBeCloseTo(Math.pow(ACTIVE_RUIN_SISYPHE_CREEP, 50), 12);
    expect(r.multUnits).toBeCloseTo(r.multLot, 12);
    expect(ratio(r.lot, r.units)).toBeCloseTo(1, 9);
  });

  it("au plafond ×20 : les unités du lot qui le passent paient le plafond, comme une par une", () => {
    const r = lotVsUnits(19.9, 10);
    expect(r.multLot).toBe(ACTIVE_RUIN_SISYPHE_MULT_CAP);
    expect(r.multUnits).toBe(ACTIVE_RUIN_SISYPHE_MULT_CAP);
    expect(ratio(r.lot, r.units)).toBeCloseTo(1, 9);
    const atCap = lotVsUnits(ACTIVE_RUIN_SISYPHE_MULT_CAP, 5);
    expect(ratio(atCap.lot, atCap.units)).toBeCloseTo(1, 9);
  });

  it("le texte annonce la pente réelle (0,08 %) et son plafond", () => {
    const def = ACTIVE_RUIN_DEFINITIONS.find((d) => d.id === "sisyphe");
    expect(`${def.malus}`).toMatch(/0[,.]08/);
    expect(`${def.malus}`).toContain(`×${ACTIVE_RUIN_SISYPHE_MULT_CAP}`);
  });
});

describe("BUG-24 — un chantier de voirie ne lâche pas le rocher de Sisyphe", () => {
  it("cran 1, chantier lancé : le rocher tient", () => {
    load({
      activeMythId: "mythe_de_sisyphe", sisypheCran: 0, food: "1e12", knowledge: "1e12", infrastructure: "1e12",
      roadNext: { kind: "link", tiles: 4, targetId: null, toRank: null }
    });
    sisyphePousser("food");
    expect(state.sisypheCran).toBe(1);
    expect(buyBuildingCore("roads")).toBe(true); // la voirie : un chantier mis en file
    expect(state.sisypheCran).toBe(1);
    expect(buyBuildingCore("foragers", { amount: 1 })).toBe(true); // bâtir, lui, le lâche
    expect(state.sisypheCran).toBe(0);
  });
});

describe("BUG-40 — sceau VII : un vol à ×25+, mise d'au moins la moitié de la table", () => {
  const sealSetup = () => {
    load({ bestEraIndex: 3 });
    state.faveur = 1000 * FAVEUR_ECHELLE;
    state.icarusPotFaveur = 1000;
    state.icarusFreeFlights = [];
    state.icarusJackpots = 0;
    state.icarusSealFlights = 0;
    state.grRevealed = {};
    invalidateRenderCache("all");
  };
  // C = 0,97 / u ; m(t) = 2^(t/5) : ×12 à 17,9 s, ×25 à 23,2 s.
  const fly = (stake, ms) => {
    vi.spyOn(Math, "random").mockReturnValueOnce(0.01); // C = 97
    expect(launchIcarus(stake)).toBeTruthy();
    vi.advanceTimersByTime(ms);
    return cashOutIcarus();
  };
  const half = () => Math.ceil(tableLimits().base / 2);

  it("le jackpot ×10 rafle la cagnotte mais ne révèle plus le sceau", () => {
    sealSetup();
    const out = fly(tableLimits().base, 18_000);
    expect(out.m).toBeGreaterThanOrEqual(10);
    expect(out.m).toBeLessThan(25);
    expect(state.icarusJackpots).toBe(1);
    refreshGrandResetReveal();
    expect(state.grRevealed[7]).toBeFalsy();
  });

  it("×25 à mi-table : le sceau VII s'illumine ; sous la moitié, non", () => {
    sealSetup();
    expect(fly(half() - 1, 23_500).m).toBeGreaterThanOrEqual(25);
    expect(state.icarusSealFlights).toBe(0);
    refreshGrandResetReveal();
    expect(state.grRevealed[7]).toBeFalsy();
    expect(fly(half(), 23_500).m).toBeGreaterThanOrEqual(25);
    expect(state.icarusSealFlights).toBe(1);
    refreshGrandResetReveal();
    expect(state.grRevealed[7]).toBe(true);
  });

  it("un vol OFFERT ne compte pas, même à grosse mise", () => {
    sealSetup();
    state.icarusFreeFlights = [tableLimits().base];
    vi.spyOn(Math, "random").mockReturnValueOnce(0.01);
    expect(launchIcarus(0, { free: true })).toBeTruthy();
    vi.advanceTimersByTime(23_500);
    expect(cashOutIcarus().m).toBeGreaterThanOrEqual(25);
    expect(state.icarusSealFlights).toBe(0);
  });
});

describe("ATLAS-ECRASE — le ciel tombé rompt le pacte : la chute manuelle redevient permise", () => {
  it("pacte vivant : chute manuelle refusée ; ciel tombé : chute acceptée", () => {
    load({ activeMythId: "mythe_d_atlas", atlasCrushed: false, atlasFardeau: 60, instability: 1 });
    expect(collapse("manual")).toBe(false);
    expect(stateModule.collapseInProgress).toBe(false);
    state.atlasCrushed = true;
    state.atlasFardeau = 100;
    expect(collapse("manual")).toBe(true);
    expect(stateModule.collapseInProgress).toBe(true);
  });
});

describe("AGE-OR-AUTOMATES — l'automate attend le moins cher au lieu d'un plus cher payable", () => {
  // Savoir : les bâtiments se paient en Or, certains avec un supplément de Savoir.
  // Sans Savoir, le moins cher (supplément compris) est hors de prix ; des plus chers
  // en Or seul restent payables — l'automate du lot 5 les achetait, vidant l'Or.
  function cityWithBlockedCheapest() {
    load({
      hephHeritage: true, cycles: 60, gold: "1e100", knowledge: "0",
      cyclePeaks: { population: "1e30", food: "1e30", gold: "1e30", knowledge: "1e30", infrastructure: "1e30", eraIndex: 20 },
      buildings: { ...MID_GAME_FIXTURE.buildings, scribes: 200, storytellers: 200 }
    });
    for (const r of getAutomateRules()) r.enabled = r.id === "auto_buy_knowledge";
    const cands = buildings.filter((x) => x.category === "knowledge" && buyableInMass(x))
      .map((x) => ({ x, p: buildingBatchCost(x, 1) }))
      .sort((u, v) => u.p[u.x.currency].cmp(v.p[v.x.currency]));
    return cands;
  }

  it("le moins cher est hors de prix : rien n'est acheté, l'Or reste", () => {
    const cands = cityWithBlockedCheapest();
    // Préconditions du cas : le moins cher est bloqué, un plus cher passerait.
    expect(canPayCost(cands[0].p)).toBe(false);
    expect(cands.some((c) => canPayCost(c.p))).toBe(true);
    const before = JSON.stringify(state.buildings);
    checkAutomateRules();
    expect(JSON.stringify(state.buildings)).toBe(before);
  });

  it("dès qu'il est payable, c'est lui qu'il achète", () => {
    const cands = cityWithBlockedCheapest();
    state.knowledge = D("1e100");
    const id = cands[0].x.id;
    const n = state.buildings[id] || 0;
    checkAutomateRules();
    expect(state.buildings[id]).toBe(n + 1);
  });
});
