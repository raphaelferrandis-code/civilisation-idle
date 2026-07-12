"use strict";
// Golden-master du cœur économique. Fige les sorties des fonctions de calcul
// pour un état de référence (voir fixtures.js). But : pendant la migration
// Decimal (Phase 3), toute dérive des valeurs sous 2^53 fait échouer ces tests.
// Mettre à jour les snapshots (npm run test -- -u) UNIQUEMENT après avoir vérifié
// que le changement de valeur est voulu.

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";

import { state, setState, hydrateState, invalidateRenderCache } from "../state.js";
import { Decimal } from "../num.js";
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

// Golden robuste au bruit flottant. `geomSum` (coûts) et les jauges float
// calculent en `double` : leur dernier ulp varie selon la plateforme / la lib
// math (ex. foragers x25 : …952 vs …955) — un snapshot pleine précision est
// donc déterministement fragile. On borne à 12 chiffres significatifs avant
// sérialisation, aussi bien pour les Decimal (→ `Decimal(<valeur>)`) que pour
// les number natifs (cityVitals/pressureBreakdown/timeWearRate). 12 s.f. tuent
// le bruit ulp (~1e-15) sans masquer une vraie dérive de formule (REL_TOL 1e-9).
// Régénérer les snapshots (`npm run test -- -u`) UNIQUEMENT après un changement
// d'équilibrage VOULU.
const STABLE_SIG = 12;
const stableNum = (n) => String(Number(n.toPrecision(STABLE_SIG)));
expect.addSnapshotSerializer({
  test: (value) => value instanceof Decimal,
  serialize: (value) => {
    const n = value.toNumber();
    // Au-delà du domaine double (≥ ~1.8e308) : garder la forme Decimal brute.
    return `Decimal(${Number.isFinite(n) ? stableNum(n) : value.toString()})`;
  }
});
expect.addSnapshotSerializer({
  test: (value) =>
    typeof value === "number" && Number.isFinite(value) && !Number.isInteger(value),
  serialize: (value) => stableNum(value)
});

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

  // Trois points de la courbe en plus de la fixture mid-game : le nerf de -33 %
  // introduit par l'extension des ères (revue n°2) n'avait été visible que parce
  // qu'un point existait — on couvre désormais early game, late game float, et
  // le chemin Decimal au-delà de 2^53 (branche populationDepthDec).
  describe("ruinGain — couverture de la courbe", () => {
    const ruinGainAtPeak = (population) => {
      state.instability = 1;
      state.cyclePeaks.population = population;
      return ruinGain();
    };

    it("pic early game (500)", () => {
      expect(ruinGainAtPeak(500)).toMatchSnapshot();
    });

    it("pic late game float (1e20)", () => {
      expect(ruinGainAtPeak(1e20)).toMatchSnapshot();
    });

    it("pic au-delà du domaine float (1e310) — chemin Decimal", () => {
      expect(ruinGainAtPeak(new Decimal("1e310"))).toMatchSnapshot();
    });
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
