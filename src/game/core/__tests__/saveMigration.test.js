"use strict";
// G-01 — Migrations de sauvegarde (la classe de bug la plus coûteuse : une
// régression ici corrompt SILENCIEUSEMENT les anciens saves en production).
// Le seul test de sérialisation existant (state.hydration) part de defaultState()
// (déjà en v2) et ne traverse JAMAIS une migration réelle depuis un payload v0/v1.
// On verrouille ici : v0 (numérique, sans saveVersion), v1 -> v2 (number -> string
// Decimal + clone cyclePeaks SANS muter l'entrée), et un save de version FUTURE.

import { describe, it, expect } from "vitest";
import {
  migrate, hydrateState, CURRENT_SAVE_VERSION, DECIMAL_SAVE_FIELDS,
} from "../state.js";
import { Decimal } from "../num.js";

describe("migrate() — montée de schéma", () => {
  it("v0 (sans saveVersion) : estampille à la version courante", () => {
    const out = migrate({ population: 1234 });
    expect(out.saveVersion).toBe(CURRENT_SAVE_VERSION);
  });

  it("v0/v1 : convertit les champs Decimal numériques en strings (format v2 canonique)", () => {
    const out = migrate({ saveVersion: 1, population: 1234, gold: 50, ruins: 9 });
    expect(out.population).toBe("1234");
    expect(out.gold).toBe("50");
    expect(out.ruins).toBe("9");
    expect(out.saveVersion).toBe(CURRENT_SAVE_VERSION);
  });

  it("ne MUTE PAS l'objet d'entrée (travaille sur une copie)", () => {
    const input = { saveVersion: 1, population: 1234, cyclePeaks: { population: 1000, food: 2000 } };
    const out = migrate(input);
    // entrée intacte
    expect(input.population).toBe(1234);
    expect(input.cyclePeaks.population).toBe(1000);
    expect(input.cyclePeaks.food).toBe(2000);
    expect(input.saveVersion).toBe(1);
    // sortie migrée
    expect(out.population).toBe("1234");
    expect(out.cyclePeaks.population).toBe("1000");
    expect(out.cyclePeaks.food).toBe("2000");
  });

  it("save de version FUTURE (> courante) : ramené au schéma courant sans crash ni migration", () => {
    const input = { saveVersion: CURRENT_SAVE_VERSION + 50, population: 5 };
    const out = migrate(input);
    expect(out.saveVersion).toBe(CURRENT_SAVE_VERSION);
    // aucune migration appliquée (la boucle ne tourne pas) : population reste brute
    expect(out.population).toBe(5);
  });

  it("laisse les strings déjà-v2 inchangées (idempotence sur format canonique)", () => {
    const out = migrate({ saveVersion: CURRENT_SAVE_VERSION, population: "1234" });
    expect(out.population).toBe("1234");
  });

  it("couvre tous les DECIMAL_SAVE_FIELDS présents en number", () => {
    const raw = { saveVersion: 1 };
    for (const f of DECIMAL_SAVE_FIELDS) raw[f] = 7;
    const out = migrate(raw);
    for (const f of DECIMAL_SAVE_FIELDS) {
      expect(out[f], `${f} non converti en string`).toBe("7");
    }
  });
});

describe("hydrateState() — depuis un save ancien", () => {
  it("v0 numérique : produit des Decimal corrects pour les ressources", () => {
    const s = hydrateState({ population: 1234, food: 567, gold: 8 });
    expect(s.population instanceof Decimal && s.population.eq(1234), "population").toBe(true);
    expect(s.food instanceof Decimal && s.food.eq(567), "food").toBe(true);
    expect(s.gold instanceof Decimal && s.gold.eq(8), "gold").toBe(true);
    expect(s.saveVersion).toBe(CURRENT_SAVE_VERSION);
  });

  it("v2 string et v0 number donnent le MÊME résultat (decimalField accepte les deux)", () => {
    const fromNum = hydrateState({ population: 4242 });
    const fromStr = hydrateState({ saveVersion: CURRENT_SAVE_VERSION, population: "4242" });
    expect(fromNum.population.eq(fromStr.population)).toBe(true);
  });

  it("save de version future ne fait pas crasher l'hydratation", () => {
    expect(() => hydrateState({ saveVersion: 999, population: 3 })).not.toThrow();
    const s = hydrateState({ saveVersion: 999, population: 3 });
    expect(s.population.eq(3)).toBe(true);
    expect(s.saveVersion).toBe(CURRENT_SAVE_VERSION);
  });

  it("entrée vide / invalide : retombe sur les valeurs par défaut sans crash", () => {
    expect(() => hydrateState(undefined)).not.toThrow();
    expect(() => hydrateState(null)).not.toThrow();
    expect(() => hydrateState("corrompu")).not.toThrow();
    expect(hydrateState({}).saveVersion).toBe(CURRENT_SAVE_VERSION);
  });
});
