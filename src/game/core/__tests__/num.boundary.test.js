"use strict";
// Frontière numérique (num.js) : un Decimal DÉSHYDRATÉ (objet plat
// { mantissa, exponent } issu d'une save JSON ou d'un set direct en test)
// doit être reconstruit, jamais coercé en NaN — le NaN se propageait aux
// caps/coordonnées du layout et FIGEAIT le placement (boucle infinie).

import { describe, it, expect } from "vitest";

import { Decimal, D, toNum } from "../num.js";

describe("num.js — Decimals déshydratés et valeurs invalides", () => {
  it("toNum reconstruit un objet plat {mantissa, exponent}", () => {
    expect(toNum({ mantissa: 5, exponent: 5 })).toBe(5e5);
    expect(toNum({ mantissa: 1.234, exponent: 2 })).toBeCloseTo(123.4);
    expect(toNum({ mantissa: 2, exponent: 0 })).toBe(2);
  });

  it("toNum ne renvoie JAMAIS NaN (gel du layout)", () => {
    expect(toNum({})).toBe(0);                        // objet quelconque
    expect(toNum({ mantissa: "x", exponent: 2 })).toBe(0);
    expect(toNum(undefined)).toBe(0);
    expect(toNum("pas un nombre")).toBe(0);
    expect(toNum({ mantissa: NaN, exponent: 1 })).toBe(0); // mantisse NaN filtrée aussi
    expect(toNum(null)).toBe(0);                      // Number(null) = 0, inchangé
  });

  it("D reconstruit un objet plat en vrai Decimal (au lieu de 0)", () => {
    const d = D({ mantissa: 5, exponent: 5 });
    expect(d instanceof Decimal).toBe(true);
    expect(d.toNumber()).toBe(5e5);
    // mantisse invalide -> 0 (pas de Decimal NaN)
    expect(D({ mantissa: NaN, exponent: 3 }).toNumber()).toBe(0);
  });

  it("D et toNum restent inchangés pour les cas déjà couverts", () => {
    expect(D(42).toNumber()).toBe(42);
    expect(D("1e10").toNumber()).toBe(1e10);
    expect(D(new Decimal(7)).toNumber()).toBe(7);
    expect(toNum(new Decimal(9))).toBe(9);
    expect(toNum(3.5)).toBe(3.5);
    expect(toNum("12")).toBe(12);
  });
});
