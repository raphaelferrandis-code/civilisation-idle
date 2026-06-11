"use strict";
// Tests de fumée de la migration Decimal (Phase 3) : vérifie que le tick fait
// croître les ressources en Decimal sans NaN, que les achats x1/x25/xmax
// restent cohérents, et que l'économie survit AU-DELÀ du plafond float
// (~1.8e308) — le but même de la migration. Pas de snapshots ici : uniquement
// des invariants.

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";

import { state, setState, hydrateState, invalidateRenderCache } from "../state.js";
import { Decimal, D } from "../num.js";
import { rates, buildingBatchCost, maxBuyAmount, ruinMultiplierDec, currentEraIndex } from "../mechanics.js";
import { tick } from "../actions/tick.js";
import { canPayCost, payCost, fmt } from "../utils.js";
import { buildings } from "../../data/buildings.js";
import { CRISIS_EVENTS } from "../../data/world.js";
import { MID_GAME_FIXTURE, FIXED_NOW } from "./fixtures.js";

const buildingById = (id) => buildings.find((x) => x.id === id);
const isSaneDecimal = (value) =>
  value instanceof Decimal && Number.isFinite(value.mantissa) && Number.isFinite(value.exponent);

beforeAll(() => {
  vi.spyOn(Date, "now").mockReturnValue(FIXED_NOW);
});

afterAll(() => {
  vi.restoreAllMocks();
});

beforeEach(() => {
  setState(hydrateState(MID_GAME_FIXTURE));
  // Neutralise les événements de crise : ils ouvrent un dialogue UI
  // (openChoiceDialog) qui n'existe pas en environnement de test.
  state.crisisThresholds = Object.fromEntries(CRISIS_EVENTS.map((e) => [e.id, true]));
  invalidateRenderCache("all");
});

describe("migration Decimal — fumée", () => {
  it("le tick fait croître les ressources en Decimal, sans NaN", () => {
    const before = D(state.food);
    for (let i = 0; i < 50; i += 1) tick(1);
    for (const key of ["population", "food", "gold", "knowledge", "infrastructure"]) {
      expect(isSaneDecimal(state[key]), `${key} doit rester un Decimal sain`).toBe(true);
    }
    expect(state.food.gt(before)).toBe(true);
    expect(typeof state.instability).toBe("number");
    expect(typeof state.timeWear).toBe("number");
  });

  it("achat x1 : payCost débite exactement le coût", () => {
    const b = buildingById("foragers");
    const cost = buildingBatchCost(b, 1);
    const foodBefore = D(state.food);
    expect(canPayCost(cost)).toBe(true);
    payCost(cost);
    expect(state.food.eq(foodBefore.sub(cost.food))).toBe(true);
  });

  it("payCost lève une erreur sur une ressource inconnue", () => {
    expect(() => payCost({ resourceInexistante: 10 })).toThrow(/ressource inconnue/);
  });

  it("maxBuyAmount est cohérent : on peut payer n mais pas n+1", () => {
    const b = buildingById("foragers");
    const n = maxBuyAmount(b);
    expect(canPayCost(buildingBatchCost(b, n))).toBe(true);
    expect(canPayCost(buildingBatchCost(b, n + 1))).toBe(false);
  });

  it("économie au-delà du float : coûts, achats et rates restent finis", () => {
    // Très très tard : ressources au-delà de 1.8e308, des milliers de bâtiments.
    state.population = new Decimal("1e320");
    state.food = new Decimal("1e350");
    state.gold = new Decimal("1e340");
    state.knowledge = new Decimal("1e330");
    state.infrastructure = new Decimal("1e310");
    state.ruins = new Decimal("1e315");
    state.cyclePeaks.population = new Decimal("1e320");
    state.buildings.foragers = 12000; // synergie 1.025^12000 >> 1e308
    invalidateRenderCache("all");

    // Coût d'un lot énorme : fini en Decimal, impayable ou payable mais jamais NaN.
    const b = buildingById("foragers");
    const cost = buildingBatchCost(b, 500);
    expect(isSaneDecimal(cost.food)).toBe(true);
    expect(cost.food.gt("1e308")).toBe(true);

    // rates() bascule sur le miroir Decimal : tout reste sain.
    const r = rates();
    for (const key of ["population", "food", "gold", "knowledge", "infrastructure"]) {
      expect(isSaneDecimal(r[key]), `rates.${key} doit être un Decimal sain`).toBe(true);
    }
    expect(Number.isFinite(r.instability)).toBe(true);

    // Le multiplicateur de ruines déborde le float mais pas le Decimal.
    expect(isSaneDecimal(ruinMultiplierDec())).toBe(true);

    // Un tick complet ne corrompt rien.
    tick(1);
    for (const key of ["population", "food", "gold", "knowledge", "infrastructure"]) {
      expect(isSaneDecimal(state[key]), `${key} après tick`).toBe(true);
    }
    expect(currentEraIndex()).toBeGreaterThan(0);
  });

  it("migration v1 → v2 : un vieux save pré-Decimal (numbers) charge sans perte", () => {
    const oldSave = {
      saveVersion: 1,
      population: 9_007_199_254_740_991, // 2^53 - 1 : l'ancien plafond exact
      food: 123456.789,
      gold: 0,
      knowledge: 42,
      infrastructure: 17,
      ruins: 5000,
      chaosRuinsBonus: 12,
      phoenixTotalRuins: 99,
      orPopPeak: 1234,
      hephPopPeak: 4321,
      cyclePeaks: { population: 60000, knowledge: 15000, infrastructure: 900, eraIndex: 5 },
      buildings: { foragers: 20 }
    };
    const loaded = hydrateState(oldSave);
    expect(loaded.saveVersion).toBe(2);
    expect(loaded.population.eq(9_007_199_254_740_991)).toBe(true);
    expect(loaded.food.eq(123456.789)).toBe(true);
    expect(loaded.ruins.eq(5000)).toBe(true);
    expect(loaded.chaosRuinsBonus.eq(12)).toBe(true);
    expect(loaded.phoenixTotalRuins.eq(99)).toBe(true);
    expect(loaded.orPopPeak.eq(1234)).toBe(true);
    expect(loaded.hephPopPeak.eq(4321)).toBe(true);
    expect(loaded.cyclePeaks.population.eq(60000)).toBe(true);
    expect(loaded.buildings.foragers).toBe(20);
  });

  it("migration v0 (sans saveVersion) : estampillé v2, données conservées", () => {
    const loaded = hydrateState({ gold: 42, buildings: { foragers: 3 } });
    expect(loaded.saveVersion).toBe(2);
    expect(loaded.gold.eq(42)).toBe(true);
    expect(loaded.buildings.foragers).toBe(3);
  });

  it("fmt affiche correctement au-delà de 10^27 (mode compact par défaut)", () => {
    expect(fmt(999)).toBe("999");
    expect(fmt(1500)).toBe("1.50K");
    expect(fmt(new Decimal(1500))).toBe("1.50K");
    expect(fmt(1e27)).toBe("1.00Oc");
    expect(fmt(new Decimal("1e30"))).toBe("1.00No");
    // 2e33 et pas 1e33 : la reconversion mantisse → float peut tomber juste
    // sous la frontière (9.999…e32) et fausser l'arrondi d'affichage.
    expect(fmt(new Decimal("2e33"))).toBe("2.00Dc");
    expect(fmt(new Decimal("2.5e45"))).toBe("2.50e45");
    expect(fmt(new Decimal("1.23e400"))).toBe("1.23e400");
  });

  it("sérialisation : save → JSON → hydrate round-trippe les Decimals", () => {
    state.food = new Decimal("1.234e400");
    state.ruins = new Decimal("5.6e77");
    const reloaded = hydrateState(JSON.parse(JSON.stringify(state)));
    expect(reloaded.food.eq(state.food)).toBe(true);
    expect(reloaded.ruins.eq(state.ruins)).toBe(true);
    // Le plafond caché à 2^53 du chargement est levé.
    expect(reloaded.food.gt(Number.MAX_SAFE_INTEGER)).toBe(true);
  });
});
