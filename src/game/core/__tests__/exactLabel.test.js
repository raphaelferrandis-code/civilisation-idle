"use strict";
// VALEUR EXACTE AU SURVOL : UNE SEULE RECETTE (décision de Raph, audit du 05/10,
// STRUCT-12). Le bandeau des ressources (Topbar) écrivait tous les chiffres jusqu'au
// bout du domaine float puis « 1.234e+400 » ; la boutique (PurchaseRow) passait en
// scientifique dès 1e15 et écrivait « 1.234e400 ». Les deux lisent désormais
// exactLabel (utils.js), alignée sur la boutique.

import { it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { exactLabel, fmtInt } from "../utils.js";
import { D } from "../num.js";
import { setLang } from "../i18n.js";

afterEach(() => setLang("fr"));

it("sous 1e15 : tous les chiffres, séparés à la manière de la langue", () => {
  expect(exactLabel(1234567)).toBe(fmtInt(1234567));
  expect(exactLabel(D(42))).toBe(fmtInt(42));
  expect(exactLabel(999999999999999)).toBe(fmtInt(999999999999999));
  setLang("en");
  expect(exactLabel(D(3000))).toBe("3,000");
});

it("dès 1e15 : la notation scientifique du jeu, sans « + »", () => {
  expect(exactLabel(1e15)).toBe("1.000e15");
  expect(exactLabel(D("2.5e21"))).toBe("2.500e21");
  // Avant : le bandeau écrivait ici « 123 456 789 012 345 680 000 000 ».
  expect(exactLabel(D("1.2345678901234568e23"))).toBe("1.235e23");
});

it("au-delà du domaine float (Decimal) : « 1.234e400 », pas « 1.234e+400 »", () => {
  expect(exactLabel(D("1.234e400"))).toBe("1.234e400");
});

it("le bandeau et la boutique n'ont plus leur copie", () => {
  for (const f of ["Topbar.jsx", "PurchaseRow.jsx"]) {
    const src = readFileSync(fileURLToPath(new URL(`../../../components/ui/${f}`, import.meta.url)), "utf8");
    expect(src, f).not.toMatch(/function exactLabel/);
    expect(src, f).toMatch(/import \{[^}]*\bexactLabel\b[^}]*\} from '..\/..\/game\/core\/utils.js'/);
  }
});
