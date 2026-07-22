"use strict";
// MODE MAX DÉPLAFONNÉ (C5). Le mode Max, vendu par une amélioration, partait
// d'une dichotomie bornée à 500 : en milieu de partie il fallait dix clics sur
// un bâtiment bon marché. Il sonde maintenant vers le haut avant de dichotomier.
//
// LE TEST QUI COMPTE est le dernier : déplafonner la quantité SANS lever le
// clamp du calcul de coût ferait payer un lot de 500 pour un lot bien plus gros.
// C'est de la monnaie gratuite, et rien dans le jeu ne l'aurait signalé.

import { describe, it, expect, beforeEach } from "vitest";

import { state, setState, defaultState } from "../state.js";
import { maxBuyAmount, buildingBatchCost } from "../mechanics.js";
import { canPayCost } from "../utils.js";
import { buildings } from "../../data/buildings.js";
import { D } from "../num.js";

const cheap = buildings.find((b) => b.category === "city");

// Donne au joueur de quoi voir venir, sans toucher au reste de l'état.
function fund(amount) {
  for (const key of ["food", "gold", "knowledge", "infrastructure", "population"]) {
    state[key] = D(amount);
  }
}

beforeEach(() => {
  setState(defaultState());
});

describe("maxBuyAmount — sonde puis dichotomie", () => {
  it("rend 1 quand rien n'est payable", () => {
    fund(0);
    expect(maxBuyAmount(cheap)).toBe(1);
  });

  it("dépasse largement l'ancien plafond de 500 quand le solde le permet", () => {
    fund("1e60");
    expect(maxBuyAmount(cheap)).toBeGreaterThan(500);
  });

  it("reste borné : un solde délirant ne rend pas l'infini", () => {
    fund("1e3000");
    const n = maxBuyAmount(cheap);
    expect(Number.isFinite(n)).toBe(true);
    expect(n).toBeLessThanOrEqual(1e9);
  });

  it("la quantité rendue est bien la PLUS GRANDE payable", () => {
    fund("1e40");
    const n = maxBuyAmount(cheap);
    // Payable à n…
    expect(canPayCost(buildingBatchCost(cheap, n))).toBe(true);
    // …et plus payable à n+1, sinon la sonde s'est arrêtée trop tôt.
    expect(canPayCost(buildingBatchCost(cheap, n + 1))).toBe(false);
  });

  it("suit le compteur : plus on en a, moins on peut en acheter d'un coup", () => {
    fund("1e40");
    const depuisZero = maxBuyAmount(cheap);
    state.buildings[cheap.id] = 300;
    expect(maxBuyAmount(cheap)).toBeLessThan(depuisZero);
  });
});

describe("maxBuyAmount — aucune monnaie gratuite", () => {
  it("le coût d'un lot suit la quantité DEMANDÉE, sans être écrêté à 500", () => {
    // Le piège : buildingBatchCost clampait à 500. La quantité créditée, elle,
    // ne l'était pas. Payer 500 et en recevoir 5000 aurait cassé l'économie.
    fund("1e60");
    const gros = maxBuyAmount(cheap);
    expect(gros).toBeGreaterThan(500);
    const coutGros = buildingBatchCost(cheap, gros);
    const coutCinqCents = buildingBatchCost(cheap, 500);
    const devise = Object.keys(coutGros)[0];
    expect(coutGros[devise].gt(coutCinqCents[devise])).toBe(true);
  });

  it("le coût est strictement croissant avec la quantité", () => {
    fund("1e60");
    let precedent = null;
    for (const n of [1, 10, 100, 500, 1000, 5000]) {
      const c = buildingBatchCost(cheap, n);
      const devise = Object.keys(c)[0];
      if (precedent) expect(c[devise].gt(precedent)).toBe(true);
      precedent = c[devise];
    }
  });
});
