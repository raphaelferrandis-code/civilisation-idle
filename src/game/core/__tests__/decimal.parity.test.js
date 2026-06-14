"use strict";
// Parité float ↔ Decimal des 7 fonctions miroir de mechanics.js.
//
// Contrat de num.js : sous le plafond float (~1.8e308), la variante Decimal
// d'un multiplicateur doit donner le MÊME résultat que sa jumelle float (à
// quelques ulps près — break_infinity calcule pow()/log10() via des routines
// mantisse/exposant qui divergent des Math.* natifs dans les derniers chiffres).
// Au-delà du plafond, le float déborde à Infinity et seul le Decimal reste
// fini : c'est le but du miroir, donc on borne les scénarios SOUS l'overflow.
//
// À quoi ça sert : ces paires doivent évoluer en lockstep. Si on modifie une
// formule d'un seul côté du miroir (exposant, coefficient, facteur oublié), une
// vraie dérive produit un écart MACROSCOPIQUE (>1e-3) — largement au-dessus du
// bruit ulp mesuré (~1e-14). Voir le rapport d'audit, action #2.

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";

import { state, setState, hydrateState, invalidateRenderCache } from "../state.js";
import { Decimal } from "../num.js";
import {
  ruinMultiplier, ruinMultiplierDec,
  unspentRuinsPowerMultiplier, unspentRuinsPowerMultiplierDec,
  institutionMultiplier, institutionMultiplierDec,
  infraMultiplier, infraMultiplierDec,
  globalMultiplier, globalMultiplierDec,
  babelExponentialMult, babelExponentialMultDec,
  buildingOutputMultiplier, buildingOutputMultiplierDec
} from "../mechanics.js";
import { buildings } from "../../data/buildings.js";
import { MID_GAME_FIXTURE, FIXED_NOW } from "./fixtures.js";

// Bruit ulp mesuré sur le domaine testé : ~1e-14 (jusqu'à ruins=1e250).
// 1e-9 laisse 5 ordres de grandeur de marge tout en attrapant toute vraie
// dérive de formule.
const REL_TOL = 1e-9;

function expectClose(label, floatVal, decVal) {
  const d = decVal instanceof Decimal ? decVal.toNumber() : Number(decVal);
  const f = Number(floatVal);
  expect(Number.isFinite(f), `${label}: version float non finie (${f})`).toBe(true);
  expect(Number.isFinite(d), `${label}: version Decimal non finie (${d})`).toBe(true);
  const diff = Math.abs(f - d);
  const tol = REL_TOL * Math.max(1, Math.abs(f));
  expect(
    diff <= tol,
    `${label}: float=${f} dec=${d} Δ=${diff.toExponential(3)} > tol=${tol.toExponential(3)}`
  ).toBe(true);
}

// Chaque scénario = patch appliqué sur un état frais hydraté depuis la fixture.
// On reste sous le plafond float pour que la parité soit définie (cf. en-tête).
const SCENARIOS = [
  {
    name: "baseline mid-game",
    patch: () => {}
  },
  {
    name: "valeurs hautes sous le plafond float",
    patch: () => {
      state.ruins = new Decimal("1e40");
      state.chaosRuinsBonus = new Decimal("1e20");
      state.legitimacy = 95;
      state.infrastructure = new Decimal("1e30");
    }
  },
  {
    name: "ruines proches du plafond (pow finie)",
    patch: () => {
      state.ruins = new Decimal("1e250");
      state.legitimacy = 80;
    }
  },
  {
    name: "oral_tradition + ruines non dépensées (unspentRuinsPower)",
    patch: () => {
      state.upgrades.oral_tradition = true;
      // foundation_ghosts : effectType "unspentRuinsPower", amount 0.01.
      state.upgrades.foundation_ghosts = true;
    }
  },
  {
    name: "mythe du chaos actif (ruin/institution neutralisés à 1)",
    patch: () => {
      state.activeMythId = "mythe_du_chaos";
    }
  },
  {
    name: "mythe de Babel actif (exponentielle par bâtiment)",
    patch: () => {
      state.activeMythId = "mythe_de_babel";
      state.babelCategory = "city";
    }
  }
];

beforeAll(() => {
  // globalMultiplier lit Date.now() (surchauffe, fenêtres atrides/énée).
  vi.spyOn(Date, "now").mockReturnValue(FIXED_NOW);
});

afterAll(() => {
  vi.restoreAllMocks();
});

beforeEach(() => {
  setState(hydrateState(MID_GAME_FIXTURE));
});

describe("parité float ↔ Decimal — multiplicateurs miroir", () => {
  for (const scenario of SCENARIOS) {
    it(scenario.name, () => {
      scenario.patch();
      // Vide les caches de frame (globalMultiplier, ruinEffects) APRÈS le patch
      // pour que les deux variantes recalculent sur le même état.
      invalidateRenderCache("all");

      expectClose("ruinMultiplier", ruinMultiplier(), ruinMultiplierDec());
      expectClose("unspentRuinsPowerMultiplier", unspentRuinsPowerMultiplier(), unspentRuinsPowerMultiplierDec());
      expectClose("institutionMultiplier", institutionMultiplier(), institutionMultiplierDec());
      expectClose("infraMultiplier", infraMultiplier(), infraMultiplierDec());
      expectClose("babelExponentialMult", babelExponentialMult(), babelExponentialMultDec());
      // Composite : garde aussi contre un facteur ajouté/retiré d'un seul côté.
      expectClose("globalMultiplier", globalMultiplier(), globalMultiplierDec());
    });
  }
});

describe("parité float ↔ Decimal — buildingOutputMultiplier", () => {
  // Un représentant par catégorie : la formule branche sur category === "city".
  const SAMPLE_IDS = ["foragers", "scribes", "aqueducts"];
  // Couvre les bords de palier (×25), dont count <= 0 (court-circuit à 1).
  const COUNTS = [0, 1, 12, 24, 25, 26, 49, 50, 100, 250, 500];

  for (const id of SAMPLE_IDS) {
    const building = buildings.find((b) => b.id === id);
    it(`${id} (${building?.category}) sur paliers`, () => {
      expect(building, `bâtiment ${id} introuvable`).toBeTruthy();
      for (const count of COUNTS) {
        expectClose(
          `${id}@${count}`,
          buildingOutputMultiplier(building, count),
          buildingOutputMultiplierDec(building, count)
        );
      }
    });
  }
});
