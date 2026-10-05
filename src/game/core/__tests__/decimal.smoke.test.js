"use strict";
// Tests de fumée de la migration Decimal (Phase 3) : vérifie que le tick fait
// croître les ressources en Decimal sans NaN, que les achats x1/x25/xmax
// restent cohérents, et que l'économie survit AU-DELÀ du plafond float
// (~1.8e308) — le but même de la migration. Pas de snapshots ici : uniquement
// des invariants.

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";

import { state, setState, hydrateState, invalidateRenderCache, bumpFrame, CURRENT_SAVE_VERSION } from "../state.js";
import { Decimal, D } from "../num.js";
import {
  rates, buildingBatchCost, buildingCostAt, maxBuyAmount, ruinMultiplierDec, currentEraIndex, ruinGain,
  unspentRuinsPowerMultiplier, unspentRuinsPowerMultiplierDec, globalMultiplier
} from "../mechanics.js";
import { tick } from "../actions/tick.js";
import { canPayCost, payCost, fmt } from "../utils.js";
import { buildings } from "../../data/buildings.js";
import { MID_GAME_FIXTURE, FIXED_NOW } from "./fixtures.js";
import { neutralizeCrises } from "../../../test/core.js";

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
  neutralizeCrises();
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

  // Audit du 05/10, BUG-11 : au-delà de ~1,8e308 de Savoir au pic, civicDepth
  // devenait Infinity et Decimal.mul(Infinity) rend 0 → moisson au plancher.
  it("moisson au-delà du float : un pic de Savoir > 1,8e308 ne la fait pas retomber au plancher", () => {
    state.cyclePeaks.population = new Decimal("1e200");
    state.cyclePeaks.infrastructure = new Decimal("1e10");
    state.cyclePeaks.knowledge = new Decimal("1e300");
    const sousLeFloat = ruinGain(true);
    state.cyclePeaks.knowledge = new Decimal("1e330");
    const auDela = ruinGain(true);
    expect(isSaneDecimal(auDela)).toBe(true);
    // Plus de Savoir au pic → au moins autant de Ruines (et pas 55).
    expect(auDela.gte(sousLeFloat)).toBe(true);
    expect(auDela.gt("1e80")).toBe(true);

    // Le cas du test de fumée historique, cette fois avec le Savoir au-delà.
    state.cyclePeaks.population = new Decimal("1e320");
    expect(ruinGain(true).gt("1e100")).toBe(true);

    // Pop, Savoir et Infra tous au-delà du float (≈ 1e180 attendu, pas ~105).
    state.cyclePeaks.population = new Decimal("1e400");
    state.cyclePeaks.knowledge = new Decimal("1e400");
    state.cyclePeaks.infrastructure = new Decimal("1e400");
    expect(ruinGain(true).gt("1e150")).toBe(true);
  });

  // BUG-11, suite : un pic d'Infra seul au-delà de ~4,5e307 (×4 dans la somme).
  it("moisson : un pic d'Infra à 1e308 (somme civique au-delà du float) reste continu", () => {
    state.cyclePeaks.population = new Decimal("1e200");
    state.cyclePeaks.knowledge = new Decimal("1e300");
    state.cyclePeaks.infrastructure = new Decimal("1e307");
    const avant = ruinGain(true);
    state.cyclePeaks.infrastructure = new Decimal("1e308");
    const apres = ruinGain(true);
    expect(apres.gte(avant)).toBe(true);
    expect(apres.lt(avant.mul(2))).toBe(true);
  });

  // BUG-36 : sous Enracinement (×1,15), un coût unitaire fini AVANT remise mais
  // > 1,8e308 APRÈS débordait en Infinity : bâtiment bloqué à ce compte précis.
  it("coûts sous Enracinement : pas de compte impayable dans la fenêtre 1,56e308-1,8e308", () => {
    state.upgrades.trait_enracinement = true;
    state.food = new Decimal("1e320");
    state.gold = new Decimal("1e320");
    state.knowledge = new Decimal("1e320");
    state.infrastructure = new Decimal("1e320");
    invalidateRenderCache("all");
    const b = buildingById("foragers");
    // Compte n tel que base × scale^n ∈ ]1,8e308 / 1,15 ; 1,8e308[.
    const n = Math.ceil(Math.log(1.7976e308 / 1.15 / b.base) / Math.log(b.scale));
    expect(b.base * Math.pow(b.scale, n)).toBeLessThan(1.7976e308);
    state.buildings.foragers = n;
    invalidateRenderCache("all");
    const lot = buildingBatchCost(b, 1);
    expect(isSaneDecimal(lot.food), `coût x1 à ${n} : ${lot.food.toString()}`).toBe(true);
    expect(lot.food.exponent).toBe(308);
    // Le prix payé égale le prix affiché (buildingCostAt remise avant de tester).
    const affiche = buildingCostAt(b, n).food;
    expect(lot.food.div(affiche).sub(1).abs().lt(1e-9)).toBe(true);
    expect(canPayCost(lot)).toBe(true);
    expect(maxBuyAmount(b)).toBeGreaterThan(1);
  });

  // BUG-82 : sans « Ruines en réserve », Infinity × 0 = NaN au-delà du float.
  it("ruines au-delà du float sans « Ruines en réserve » : facteur 1, jamais NaN", () => {
    state.ruins = new Decimal("1e400");
    delete state.upgrades.foundation_ghosts;
    invalidateRenderCache("all");
    bumpFrame();
    expect(unspentRuinsPowerMultiplier()).toBe(1);
    expect(unspentRuinsPowerMultiplierDec().eq(1)).toBe(true);
    expect(Number.isNaN(globalMultiplier())).toBe(false);

    // Avec le nœud, le facteur suit toujours le stock (débordement voulu → Decimal).
    state.upgrades.foundation_ghosts = true;
    invalidateRenderCache("all");
    bumpFrame();
    expect(unspentRuinsPowerMultiplier()).toBe(Infinity);
    expect(unspentRuinsPowerMultiplierDec().gt("1e395")).toBe(true);
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
      phoenixTotalRuins: 99,
      phoenixRebirthTargetPop: 1234,
      hephPopPeak: 4321,
      cyclePeaks: { population: 60000, knowledge: 15000, infrastructure: 900, eraIndex: 5 },
      buildings: { foragers: 20 }
    };
    const loaded = hydrateState(oldSave);
    expect(loaded.saveVersion).toBe(CURRENT_SAVE_VERSION);
    expect(loaded.population.eq(9_007_199_254_740_991)).toBe(true);
    expect(loaded.food.eq(123456.789)).toBe(true);
    expect(loaded.ruins.eq(5000)).toBe(true);
    expect(loaded.phoenixTotalRuins.eq(99)).toBe(true);
    expect(loaded.phoenixRebirthTargetPop.eq(1234)).toBe(true);
    expect(loaded.hephPopPeak.eq(4321)).toBe(true);
    expect(loaded.cyclePeaks.population.eq(60000)).toBe(true);
    expect(loaded.buildings.foragers).toBe(20);
  });

  it("migration v0 (sans saveVersion) : estampillé à la version courante, données conservées", () => {
    const loaded = hydrateState({ gold: 42, buildings: { foragers: 3 } });
    expect(loaded.saveVersion).toBe(CURRENT_SAVE_VERSION);
    expect(loaded.gold.eq(42)).toBe(true);
    expect(loaded.buildings.foragers).toBe(3);
  });

  it("fmt affiche correctement au-delà de 10^27 (mode compact par défaut)", () => {
    expect(fmt(999)).toBe("999");
    expect(fmt(1500)).toBe("1.50K");
    expect(fmt(new Decimal(1500))).toBe("1.50K");
    // Notation unique : plus de suffixes au-delà du trillion (Qa…Dc retirés).
    expect(fmt(1e27)).toBe("1.00e27");
    expect(fmt(new Decimal("1e30"))).toBe("1.00e30");
    expect(fmt(new Decimal("2e33"))).toBe("2.00e33");
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
