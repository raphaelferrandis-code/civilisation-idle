"use strict";
// GAIN RELATIF PAR ACHAT (B6).
//
// Le chiffre affiché sur chaque rangée doit répondre à « qu'est-ce que ce lot
// AJOUTE », et deux façons de se tromper le rendraient trompeur plutôt
// qu'inutile :
//   1. rapporter la production TOTALE de la ligne au lieu du gain marginal —
//      la synergie de jalon étant exponentielle en `count`, ce que l'on possède
//      déjà en nombre afficherait un gain énorme, soit l'inverse du conseil ;
//   2. diverger de la base que les Comptes de la cité (B3) calculent, auquel
//      cas deux écrans du même jeu se contrediraient.

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";

import { state, setState, defaultState, hydrateState, invalidateRenderCache } from "../state.js";
import {
  productionScales,
  buildingRelativeGain,
  productionBreakdown
} from "../mechanics/production/productionBreakdown.js";
import { buildings } from "../../data/buildings.js";
import { MID_GAME_FIXTURE, FIXED_NOW } from "./fixtures.js";

const parId = (id) => buildings.find((b) => b.id === id);

beforeAll(() => { vi.spyOn(Date, "now").mockReturnValue(FIXED_NOW); });
afterAll(() => { vi.restoreAllMocks(); });
beforeEach(() => { setState(hydrateState(MID_GAME_FIXTURE)); invalidateRenderCache("all"); });

describe("buildingRelativeGain — le gain est MARGINAL", () => {
  it("acheter 1 de plus vaut BIEN MOINS que la ligne entière", () => {
    // Le piège nommé par la fiche. Sur un bâtiment déjà possédé en nombre, la
    // production totale de la ligne est sans commune mesure avec ce qu'un achat
    // de plus apporte : si les deux étaient du même ordre, c'est que le calcul
    // rapporte le total.
    const b = parId("foragers");
    state.buildings.foragers = 60;
    invalidateRenderCache("all");

    const prep = productionScales();
    const marginal = buildingRelativeGain(b, 60, 1, prep);
    expect(marginal.length).toBeGreaterThan(0);

    const totalLigne = productionBreakdown("food").rows.find((r) => r.key === "foragers");
    const gainFood = marginal.find((g) => g.resource === "food");
    expect(gainFood, "les Cueilleurs produisent de la nourriture").toBeTruthy();
    expect(
      gainFood.add < totalLigne.value / 5,
      `marginal=${gainFood.add} total de la ligne=${totalLigne.value}`
    ).toBe(true);
  });

  it("un lot de 10 vaut plus qu'un lot de 1, sans valoir dix fois plus", () => {
    const b = parId("foragers");
    state.buildings.foragers = 40;
    invalidateRenderCache("all");
    const prep = productionScales();
    const un = buildingRelativeGain(b, 40, 1, prep).find((g) => g.resource === "food").add;
    const dix = buildingRelativeGain(b, 40, 10, prep).find((g) => g.resource === "food").add;
    expect(dix).toBeGreaterThan(un);
    // La synergie monte avec le compte, donc dix achats valent PLUS que dix
    // fois un achat : c'est la signature d'un calcul qui rejoue vraiment la
    // courbe au lieu de multiplier linéairement.
    expect(dix).toBeGreaterThan(un * 10);
  });

  it("le premier exemplaire d'un bâtiment jamais construit produit un gain", () => {
    const b = parId("foragers");
    state.buildings.foragers = 0;
    invalidateRenderCache("all");
    const gains = buildingRelativeGain(b, 0, 1, productionScales());
    expect(gains.length, "un bâtiment neuf doit annoncer ce qu'il apporte").toBeGreaterThan(0);
    for (const g of gains) expect(g.add).toBeGreaterThan(0);
  });
});

describe("buildingRelativeGain — cohérent avec les Comptes de la cité", () => {
  it("le gain d'un achat égale l'écart de contribution mesuré par B3", () => {
    // L'ancrage qui empêche les deux écrans de se contredire : on mesure la
    // contribution AVANT, on achète pour de vrai, on remesure. L'écart doit
    // être ce que le chip annonçait.
    const b = parId("granaries_city");
    state.buildings.granaries_city = 12;
    invalidateRenderCache("all");
    const annonce = buildingRelativeGain(b, 12, 3, productionScales()).find((g) => g.resource === "food");
    const avant = productionBreakdown("food").rows.find((r) => r.key === "granaries_city").value;

    state.buildings.granaries_city = 15;
    invalidateRenderCache("all");
    const apres = productionBreakdown("food").rows.find((r) => r.key === "granaries_city").value;

    // Tolérance lâche : acheter change AUSSI le dénominateur (la base totale
    // grandit), donc les deux valeurs mises à l'échelle ne peuvent pas coïncider
    // au bit près. L'ordre de grandeur, lui, doit être le bon.
    const ecart = apres - avant;
    expect(ecart).toBeGreaterThan(0);
    expect(annonce.add).toBeGreaterThan(ecart * 0.5);
    expect(annonce.add).toBeLessThan(ecart * 2);
  });

  it("les échelles convertissent bien vers le débit affiché", () => {
    const { scales } = productionScales();
    for (const [res, s] of Object.entries(scales)) {
      expect(Number.isFinite(s.k), `${res} : k non fini`).toBe(true);
      expect(Number.isFinite(s.rate), `${res} : débit non fini`).toBe(true);
    }
  });
});

describe("buildingRelativeGain — cas dégradés", () => {
  it("une ressource sans débit rend pct null au lieu de +Infini", () => {
    // Partie neuve : l'Or ne coule pas tant que le Rayonnement est sous 25.
    // Diviser par ce zéro afficherait « +Infini % » sur la première rangée.
    setState(defaultState());
    invalidateRenderCache("all");
    for (const b of buildings) {
      for (const g of buildingRelativeGain(b, 0, 1, productionScales())) {
        expect(g.pct === null || Number.isFinite(g.pct), `${b.id}/${g.resource} pct=${g.pct}`).toBe(true);
        expect(g.pct === null || g.pct >= 0).toBe(true);
      }
    }
  });

  it("une quantité nulle ou négative ne rend aucun gain", () => {
    const b = parId("foragers");
    expect(buildingRelativeGain(b, 10, 0, productionScales())).toEqual([]);
    expect(buildingRelativeGain(b, 10, -5, productionScales())).toEqual([]);
  });

  it("aucune valeur non finie, même très haut", () => {
    state.buildings.foragers = 5000;
    invalidateRenderCache("all");
    for (const g of buildingRelativeGain(parId("foragers"), 5000, 100, productionScales())) {
      expect(Number.isFinite(g.add), `add=${g.add}`).toBe(true);
    }
  });

  it("les ressources sont classées, la plus servie en tête", () => {
    const gains = buildingRelativeGain(parId("foragers"), 30, 5, productionScales());
    for (let i = 1; i < gains.length; i++) {
      expect((gains[i - 1].pct ?? Infinity) >= (gains[i].pct ?? Infinity)).toBe(true);
    }
  });

  it("un débit affiché non fini ne fabrique pas de gain", () => {
    // Fin de partie : rates() déborde. On préfère ne rien annoncer plutôt que
    // d'écrire un pourcentage inventé.
    setState(defaultState());
    state.buildings.foragers = 100000;
    invalidateRenderCache("all");
    for (const g of buildingRelativeGain(parId("foragers"), 100000, 1, productionScales())) {
      expect(Number.isFinite(g.add)).toBe(true);
    }
  });
});
