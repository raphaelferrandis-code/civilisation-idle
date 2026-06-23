"use strict";
// collapseCause() pilote l'affinité du legs d'épitaphe (epitaphRuinMultiplier) et
// le texte d'épitaphe. Sa logique mêle un seuil dur (timeWear), un score de
// nourriture et des comparaisons de pressions. Avant ce test elle n'était couverte
// par aucune assertion. On verrouille ici les branches robustes + l'invariant de
// sortie (toujours l'une des 4 causes connues).

import { describe, it, expect, beforeEach } from "vitest";
import { state, setState, hydrateState } from "../state.js";
import { collapseCause } from "../events.js";
import { Decimal } from "../num.js";

const CAUSES = ["time", "famine", "avarice", "rupture"];

beforeEach(() => {
  setState(hydrateState({}));
});

describe("collapseCause", () => {
  it("renvoie 'time' quand l'usure du temps atteint 1", () => {
    state.timeWear = 1;
    expect(collapseCause()).toBe("time");
  });

  it("renvoie 'famine' quand la nourriture est à zéro pour une population réelle", () => {
    state.timeWear = 0;
    state.population = new Decimal(1000);
    state.food = new Decimal(0);
    expect(collapseCause()).toBe("famine");
  });

  it("renvoie toujours l'une des 4 causes connues (invariant de sortie)", () => {
    expect(CAUSES).toContain(collapseCause());
    state.timeWear = 0.5;
    expect(CAUSES).toContain(collapseCause());
  });

  it("priorise 'time' sur les autres causes (usure >= 1 court-circuite)", () => {
    state.timeWear = 1;
    state.population = new Decimal(1000);
    state.food = new Decimal(0); // condition de famine présente, mais time prime
    expect(collapseCause()).toBe("time");
  });
});
