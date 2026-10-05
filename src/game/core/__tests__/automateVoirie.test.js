"use strict";
// Audit du 2026-10-05, lot 5 — automates d'Héphaïstos et voirie :
//  - BUG-6  : l'automate Infrastructure se figeait sur la rangée Routes (file de
//             chantiers pleine → plus aucun bâtiment acheté) ;
//  - BUG-29 : l'automate « Rationner si Rupture ≥ X » tirait à chaque tick ;
//  - BUG-75 : une ligne de Chronique par tick d'auto-achat noyait le journal ;
//  - BUG-27 : les Archivistes des Ruines achetaient des nœuds encore verrouillés ;
//  - BUG-23 : file et réserve de chantiers survivaient à l'effondrement ;
//  - BUG-24 : la voirie échappait au verrou de Babel ;
//  - BUG-34 : les remises de construction (Grand cadastre…) ignoraient la voirie.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { state, setState, defaultState, hydrateState, invalidateRenderCache, resetTemporaryRunState, buildingById } from "../state.js";
import { D } from "../num.js";
import { getAutomateRules, checkAutomateRules, buyBuilding, completeCollapse } from "../actions.js";
import { buyRoadWorkCore, roadWorksCount, roadWorksBank, roadWorkCost, roadTilePrice, tickRoadWorks } from "../actions/roadWorks.js";
import { buyAllAffordable } from "../actions/building.js";
import { checkNodeAvailability } from "../mechanics.js";
import { shiftStateTimestamps } from "../offlineCredit.js";
import { upgrades, dogmaIds } from "../../data/upgrades.js";
import { ROAD_WORK_QUEUE_MAX, ROAD_WORKS_BANK_MAX, STEWARD_COOLDOWN_MS, STEWARD_FATIGUE_GATE, ROAD_NEXT_FALLBACK_TILES } from "../balance.js";
import { MID_GAME_FIXTURE, FIXED_NOW } from "./fixtures.js";

const ruleById = (id) => getAutomateRules().find((r) => r.id === id);
const LINK = { kind: "link", tiles: 4, targetId: null, toRank: null };

// Cité riche dont tous les bâtiments d'Infrastructure de base sont révélés.
function richCity() {
  setState(defaultState());
  state.hephHeritage = true;
  state.population = D(1e6);
  state.knowledge = D(1e12);
  state.gold = D(1e12);
  state.food = D(1e12);
  state.cyclePeaks = { population: D(1e6), food: D(1e12), gold: D(1e12), knowledge: D(1e12), infrastructure: D(1e6), eraIndex: 3 };
  state.roadNext = { ...LINK };
  invalidateRenderCache("all");
}

const infraBuilt = () => ["aqueducts", "watch", "bureaucracy", "sewers", "courthouses", "public_works", "ministries", "archive_grids"]
  .reduce((n, id) => n + (state.buildings[id] || 0), 0);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("BUG-6 — l'automate Infrastructure ne se fige plus sur la voirie", () => {
  it("file de chantiers pleine : les bâtiments d'Infrastructure s'achètent quand même", () => {
    richCity();
    while (buyRoadWorkCore()) { /* remplit la file */ }
    expect(roadWorksCount()).toBe(ROAD_WORK_QUEUE_MAX);
    const rule = ruleById("auto_buy_infra");
    rule.enabled = true;
    rule.perTick = 5;
    checkAutomateRules();
    expect(infraBuilt()).toBe(5);
  });

  it("début de cycle, roads = 0 : le Service des eaux est acheté (la voirie n'est plus « le moins cher »)", () => {
    richCity();
    state.knowledge = D(9000); // un Service des eaux (8 000), et des chantiers bien moins chers
    ruleById("auto_buy_infra").enabled = true;
    checkAutomateRules();
    expect(state.buildings.aqueducts).toBe(1);
  });

  it("la voirie reste servie, À PART et après les bâtiments, sous la même réserve", () => {
    richCity();
    const rule = ruleById("auto_buy_infra");
    rule.enabled = true;
    rule.perTick = 2;
    checkAutomateRules();
    expect(infraBuilt()).toBe(2);
    expect(roadWorksCount()).toBe(1);

    // Réserve de 50 % : un chantier qui l'entamerait n'est pas lancé.
    richCity(); // état neuf : les règles renaissent avec lui
    const fresh = ruleById("auto_buy_infra");
    fresh.enabled = true;
    state.knowledge = roadWorkCost().mul(1.5);
    fresh.reservePct = 50;
    checkAutomateRules();
    expect(roadWorksCount()).toBe(0);
    fresh.reservePct = 0;
    checkAutomateRules();
    expect(roadWorksCount()).toBe(1);
  });
});

describe("BUG-29 — l'automate « Rationner » a le cooldown et la garde de fatigue de l'Intendance", () => {
  const rationings = () => (state.regulLedger || []).filter((e) => e.id === "rationing").length;

  function armedCity() {
    setState(hydrateState(MID_GAME_FIXTURE));
    state.hephHeritage = true;
    state.food = 1e12;
    state.gold = 1e12;
    state.instability = 0.92;
    const rule = ruleById("auto_rationing");
    rule.enabled = true;
    rule.threshold = 60;
    invalidateRenderCache("all");
    return rule;
  }

  it("un saut de Rupture ne déclenche plus une rafale : un tir, puis le cooldown", () => {
    armedCity();
    for (let s = 0; s < 15; s++) {
      vi.setSystemTime(FIXED_NOW + s * 1000);
      checkAutomateRules();
    }
    expect(rationings()).toBe(1);
    state.regulFatigue = 0; // la fatigue retombe dans le tick, absent ici
    vi.setSystemTime(FIXED_NOW + STEWARD_COOLDOWN_MS + 1000);
    checkAutomateRules();
    expect(rationings()).toBe(2);
  });

  it("administration fatiguée : l'automate laisse souffler, comme l'Intendance", () => {
    armedCity();
    state.regulFatigue = STEWARD_FATIGUE_GATE + 0.1;
    checkAutomateRules();
    expect(rationings()).toBe(0);
  });

  it("un horodatage dans le futur (horloge virtuelle d'un versement) ne gèle pas la règle", () => {
    const rule = armedCity();
    rule.lastAt = FIXED_NOW + 3_600_000;
    checkAutomateRules();
    expect(rationings()).toBe(1);
  });

  it("l'horodatage survit au rechargement (sinon un reload rouvrait la rafale)", () => {
    const rule = armedCity();
    checkAutomateRules();
    expect(rule.lastAt).toBe(FIXED_NOW);
    const back = hydrateState(JSON.parse(JSON.stringify(state)));
    expect(back.automateRules.find((r) => r.id === "auto_rationing").lastAt).toBe(FIXED_NOW);
  });

  it("versement de clepsydre : l'horodatage est rebasé avec les autres (le cooldown tient)", () => {
    const rule = armedCity();
    checkAutomateRules();
    expect(rationings()).toBe(1);
    // Versement d'une heure : l'horloge virtuelle repart d'une heure en arrière,
    // le helper unique décale tout le référentiel d'autant.
    shiftStateTimestamps(state, -3_600_000);
    expect(rule.lastAt).toBe(FIXED_NOW - 3_600_000);
    vi.setSystemTime(FIXED_NOW - 3_600_000 + 5_000);
    state.regulFatigue = 0; // seule la minuterie doit retenir l'automate
    checkAutomateRules();
    expect(rationings()).toBe(1); // 5 s après le tir : toujours en cooldown
    // Les règles d'achat n'ont pas d'horodatage : rien ne leur est ajouté.
    expect("lastAt" in ruleById("auto_buy_city")).toBe(false);
  });
});

describe("BUG-75 — la Chronique de l'auto-achat est agrégée", () => {
  const autoLines = () => (state.history || []).filter((l) => /mécanismes automatiques|automatic mechanisms/.test(l));

  it("une ligne par minute au plus, qui compte tout ce qui a été érigé entre-temps", () => {
    richCity();
    state.cycles = 41; // cycle propre à ce test : le compteur de module repart à zéro
    state.history = [];
    ruleById("auto_buy_city").enabled = true;
    for (let s = 0; s < 30; s++) {
      vi.setSystemTime(FIXED_NOW + 3_600_000 + s * 1000);
      checkAutomateRules();
    }
    expect(autoLines()).toHaveLength(1);
    vi.setSystemTime(FIXED_NOW + 3_600_000 + 61_000);
    checkAutomateRules();
    const lines = autoLines();
    expect(lines).toHaveLength(2);
    // 29 achats en attente + celui de ce tick.
    expect(lines[1]).toMatch(/érigé 30 bâtiments|raised 30 buildings/);
  });
});

describe("BUG-27 — les Archivistes des Ruines respectent les verrous de l'arbre", () => {
  it("aucun nœud acheté avant son palier de cycle, et l'achat compte comme un achat", () => {
    setState(defaultState());
    state.cycles = 4;
    state.upgrades = { conservateurs_ruines: true };
    for (const u of upgrades) {
      if (u.group === "ruins" && !dogmaIds.has(u.id) && (u.cost?.ruins || 0) > 0 && u.cost.ruins < 1500) state.upgrades[u.id] = true;
    }
    const before = new Set(Object.keys(state.upgrades));
    state.ruins = D(1900);
    state.lifetimePurchases = 0;
    completeCollapse(D(0), "Dyn", "epi", "manual");
    const bought = Object.keys(state.upgrades).filter((id) => !before.has(id));
    // Avant le correctif : veilleurs_nuit_4 (ouvert au cycle 7), acheté au cycle 5.
    expect(bought).not.toContain("veilleurs_nuit_4");
    for (const id of bought) {
      const u = upgrades.find((x) => x.id === id);
      expect(u.unlockCycles || 0).toBeLessThanOrEqual(state.cycles);
    }
    expect(checkNodeAvailability("veilleurs_nuit_4")).not.toBe("available");
  });

  it("un nœud ouvert est acheté au coût effectif, compté dans les achats, caches invalidés", () => {
    setState(defaultState());
    state.cycles = 2;
    state.upgrades = { conservateurs_ruines: true };
    state.ruins = D(1e6);
    state.lifetimePurchases = 0;
    completeCollapse(D(0), "Dyn", "epi", "manual");
    const bought = Object.keys(state.upgrades).filter((id) => id !== "conservateurs_ruines");
    expect(bought).toHaveLength(1);
    expect(checkNodeAvailability(bought[0])).toBe("purchased");
    expect(state.lifetimePurchases).toBe(1);
  });
});

describe("BUG-23 — la voirie repart à zéro avec la cité", () => {
  function prepaidWorks() {
    setState(defaultState());
    state.knowledge = D(1e15);
    state.roadNext = { kind: "done", tiles: 0, targetId: null, toRank: null };
    while (buyRoadWorkCore()) { /* réserve pleine */ }
    state.roadNext = { kind: "link", tiles: 6, targetId: null, toRank: null };
    while (buyRoadWorkCore()) { /* file pleine */ }
    state.roadCoverage = 0.8;
    state.roadWidened = 4;
    expect(roadWorksBank()).toBe(ROAD_WORKS_BANK_MAX);
    expect(roadWorksCount()).toBe(ROAD_WORK_QUEUE_MAX);
  }

  it("l'effondrement efface file, réserve, rampe et tracé de l'ancienne cité", () => {
    prepaidWorks();
    completeCollapse(D(10), "Dyn", "epi", "manual");
    expect(roadWorksBank()).toBe(0);
    expect(roadWorksCount()).toBe(0);
    expect(state.roadWorksEra.count).toBe(0);
    expect(state.roadNext).toBeNull();
    expect(state.roadCoverage).toBe(0);
    expect(state.roadWidened).toBe(0);
    for (let i = 0; i < 400; i++) tickRoadWorks(10);
    expect(state.buildings.roads || 0).toBe(0);
  });

  it("resetTemporaryRunState (pacte de Mythe) fait de même", () => {
    prepaidWorks();
    resetTemporaryRunState(state);
    expect(roadWorksBank()).toBe(0);
    expect(roadWorksCount()).toBe(0);
  });
});

describe("BUG-24 — la voirie respecte le verrou de Babel", () => {
  it("Babel sur « Cité » : pas de chantier, ni à la main, ni par l'automate", () => {
    richCity();
    state.activeMythId = "mythe_de_babel";
    state.babelCategory = "city";
    expect(buyBuilding("roads")).toBe(false);
    ruleById("auto_buy_infra").enabled = true;
    checkAutomateRules();
    expect(roadWorksCount()).toBe(0);
    expect(buyAllAffordable("infra")).toBe(0);
  });

  it("Babel sur « Infrastructure » : la voirie s'achète", () => {
    richCity();
    state.activeMythId = "mythe_de_babel";
    state.babelCategory = "infra";
    expect(buyBuilding("roads")).toBe(true);
    expect(roadWorksCount()).toBe(1);
  });
});

describe("BUG-34 — les remises de construction touchent la voirie", () => {
  it("Grand cadastre : −25 % sur le chantier comme sur le prix plat de réserve", () => {
    setState(defaultState());
    state.roadNext = { ...LINK };
    const sans = roadWorkCost();
    state.upgrades = { grand_cadastre: true };
    invalidateRenderCache("all");
    expect(roadWorkCost().toNumber()).toBeCloseTo(sans.toNumber() * 0.75, 9);
    state.roadNext = { kind: "done", tiles: 0, targetId: null, toRank: null };
    expect(roadWorkCost().toNumber()).toBeCloseTo(roadTilePrice().toNumber() * ROAD_NEXT_FALLBACK_TILES * 0.75, 9);
  });

  it("Nomadisme : −30 %, et le prix payé est le prix affiché", () => {
    setState(defaultState());
    state.roadNext = { ...LINK };
    const sans = roadWorkCost();
    state.upgrades = { trait_nomadism: true };
    invalidateRenderCache("all");
    const avec = roadWorkCost();
    expect(avec.toNumber()).toBeCloseTo(sans.toNumber() * 0.7, 9);
    state.knowledge = D(1e6);
    expect(buyRoadWorkCore()).toBe(true);
    expect(D(1e6).sub(state.knowledge).toNumber()).toBeCloseTo(avec.toNumber(), 6);
    expect(buildingById.roads.category).toBe("infra");
  });
});
