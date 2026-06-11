"use strict";
// Golden-master du cœur économique. Fige les sorties des fonctions de calcul
// pour un état de référence (voir fixtures.js). But : pendant la migration
// Decimal (Phase 3), toute dérive des valeurs sous 2^53 fait échouer ces tests.
// Mettre à jour les snapshots (npm run test -- -u) UNIQUEMENT après avoir vérifié
// que le changement de valeur est voulu.

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";

import { state, setState, hydrateState, invalidateRenderCache } from "../state.js";
import {
  cityVitals,
  pressureBreakdown,
  rates,
  ruinGain,
  timeWearRate,
  buildingBatchCost,
  maxBuyAmount
} from "../mechanics.js";
import { buildings } from "../../data/buildings.js";
import { MID_GAME_FIXTURE, FIXED_NOW } from "./fixtures.js";

const buildingById = (id) => {
  const b = buildings.find((x) => x.id === id);
  if (!b) throw new Error(`Bâtiment de fixture introuvable : ${id}`);
  return b;
};

beforeAll(() => {
  // Fige le temps : pressureBreakdown / ruinGain lisent Date.now().
  vi.spyOn(Date, "now").mockReturnValue(FIXED_NOW);
});

afterAll(() => {
  vi.restoreAllMocks();
});

beforeEach(() => {
  // État de référence frais + caches de frame vidés avant chaque calcul.
  setState(hydrateState(MID_GAME_FIXTURE));
  invalidateRenderCache("all");
});

describe("golden-master du cœur économique", () => {
  it("cityVitals", () => {
    expect(cityVitals()).toMatchSnapshot();
  });

  it("pressureBreakdown", () => {
    expect(pressureBreakdown()).toMatchSnapshot();
  });

  it("rates", () => {
    expect(rates()).toMatchSnapshot();
  });

  it("ruinGain (crise ouverte)", () => {
    // ruinGain n'est appelé qu'à l'effondrement : la rupture doit être au max
    // pour exercer le vrai calcul (sinon court-circuit !crisisOpen() → 0).
    state.instability = 1;
    expect(ruinGain()).toMatchSnapshot();
  });

  it("timeWearRate", () => {
    expect(timeWearRate()).toMatchSnapshot();
  });

  describe("buildingBatchCost", () => {
    for (const id of ["foragers", "markets"]) {
      for (const amount of [1, 25, 500, "max"]) {
        it(`${id} x${amount}`, () => {
          expect(buildingBatchCost(buildingById(id), amount)).toMatchSnapshot();
        });
      }
    }
  });

  describe("maxBuyAmount", () => {
    for (const id of ["foragers", "markets", "guilds"]) {
      it(id, () => {
        expect(maxBuyAmount(buildingById(id))).toMatchSnapshot();
      });
    }
  });
});
