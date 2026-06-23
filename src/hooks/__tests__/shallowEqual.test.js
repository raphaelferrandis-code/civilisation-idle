"use strict";
// shallowEqual est la pierre angulaire de toute la stratégie de re-render
// (useGameState) : un bug ici = soit des re-renders MANQUÉS (UI figée), soit des
// re-renders EXCESSIFS (perte de perf diffuse). Fonction pure, parfaitement
// testable sans jsdom.

import { describe, it, expect } from "vitest";
import { shallowEqual } from "../useGameState.js";

describe("shallowEqual", () => {
  it("identité par Object.is (primitives, même référence)", () => {
    expect(shallowEqual(1, 1)).toBe(true);
    expect(shallowEqual("a", "a")).toBe(true);
    expect(shallowEqual(NaN, NaN)).toBe(true);   // Object.is(NaN,NaN) === true
    expect(shallowEqual(0, -0)).toBe(false);     // Object.is(0,-0) === false
    const o = { a: 1 };
    expect(shallowEqual(o, o)).toBe(true);
  });

  it("null / non-objets", () => {
    expect(shallowEqual(null, null)).toBe(true);
    expect(shallowEqual(null, {})).toBe(false);
    expect(shallowEqual({}, null)).toBe(false);
    expect(shallowEqual(1, "1")).toBe(false);
  });

  it("objets plats : égalité champ par champ", () => {
    expect(shallowEqual({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true);
    expect(shallowEqual({ a: 1, b: 2 }, { a: 1, b: 3 })).toBe(false);
  });

  it("nombre de clés différent", () => {
    expect(shallowEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(shallowEqual({ a: 1, b: 2 }, { a: 1 })).toBe(false);
  });

  it("même cardinalité mais clé différente", () => {
    expect(shallowEqual({ a: 1 }, { b: 1 })).toBe(false);
  });

  it("comparaison SHALLOW : objets imbriqués comparés par référence", () => {
    const inner = { x: 1 };
    expect(shallowEqual({ n: inner }, { n: inner })).toBe(true);   // même réf
    expect(shallowEqual({ n: { x: 1 } }, { n: { x: 1 } })).toBe(false); // réfs ≠
  });

  it("tableaux", () => {
    expect(shallowEqual([1, 2], [1, 2])).toBe(true);
    expect(shallowEqual([1, 2], [1, 3])).toBe(false);
    expect(shallowEqual([1, 2], [1, 2, 3])).toBe(false);
  });

  it("cas réel useGameState : un objet Decimal réassigné (nouvelle réf) compte comme changé", () => {
    // tick() réassigne state.food = D(...) → nouvelle instance Decimal chaque tick.
    // Un sélecteur objet { food } doit donc être détecté comme changé.
    const a = { food: { v: 1 } };
    const b = { food: { v: 1 } }; // food = nouvelle instance (comme un new Decimal)
    expect(shallowEqual(a, b)).toBe(false);
  });
});
