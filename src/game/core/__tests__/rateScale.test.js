"use strict";
// DÉBITS À UNITÉ ADAPTATIVE (B4) et MANTISSE À 3 CHIFFRES (B12). Les deux vivent
// dans utils.js et se touchent : rateScale met une valeur à l'échelle, et c'est
// formatCompactNumber qui l'écrit ensuite.

import { describe, it, expect } from "vitest";
import { rateScale, fmt, fmtShort, signedShort } from "../utils.js";
import { D } from "../num.js";

describe("rateScale — un zéro mort redevient un chiffre", () => {
  it("garde la seconde dès qu'il y a au moins 1 par seconde", () => {
    expect(rateScale(1).unit).toBe("/s");
    expect(rateScale(1500).unit).toBe("/s");
    expect(rateScale(-42).unit).toBe("/s");
  });

  it("bascule à la minute entre 1/min et 1/s", () => {
    const r = rateScale(0.5);
    expect(r.unit).toBe("/min");
    expect(r.value).toBeCloseTo(30, 6);
  });

  it("bascule à l'heure sous 1 par minute", () => {
    // Le cas de la fiche : 0,0004/s s'affichait « 0.0/s ».
    const r = rateScale(0.0004);
    expect(r.unit).toBe("/h");
    expect(r.value).toBeCloseTo(1.44, 6);
    expect(fmtShort(r.value)).not.toBe("0.0");
  });

  it("le cas emblématique des Conteurs : 0,01 Rayonnement par seconde", () => {
    const r = rateScale(0.01);
    expect(r.unit).toBe("/h");
    expect(signedShort(r.value)).toBe("+36");
  });

  it("ACCEPTE un Decimal comme un number natif, et rend le même libellé", () => {
    // Le piège : la topbar passe des Decimal (rates()), la boutique des numbers
    // natifs. Un rateScale écrit en .abs()/.mul() léverait sur la boutique.
    const natif = rateScale(0.0004);
    const dec = rateScale(D(0.0004));
    expect(dec.unit).toBe(natif.unit);
    expect(fmtShort(dec.value)).toBe(fmtShort(natif.value));
    expect(dec.value instanceof Object).toBe(true); // reste un Decimal
  });

  it("un débit NUL reste en /s : c'est l'état nominal du début de partie", () => {
    // rates.js met l'Or à exactement 0 tant que le Rayonnement est sous 25.
    // « 0.0/h » serait plus absurde que « 0.0/s ».
    expect(rateScale(0).unit).toBe("/s");
    expect(rateScale(D(0)).unit).toBe("/s");
  });

  it("ne colle pas d'unité horaire à un débit non fini", () => {
    expect(rateScale(Infinity).unit).toBe("/s");
    expect(fmtShort(rateScale(Infinity).value)).toBe("inf");
  });

  it("ne change JAMAIS le signe : il reste composé par l'appelant", () => {
    // Une sortie déjà signée ferait doubler le « + » de la topbar ou
    // disparaître celui de la boutique.
    expect(signedShort(rateScale(0.5).value)).toBe("+30");
    expect(signedShort(rateScale(-0.5).value)).toBe("-30");
  });
});

describe("mantisse à 3 chiffres significatifs (B12)", () => {
  it("supprime le « .0 » de la bande 100-999, et rien d'autre", () => {
    expect(fmt(1500)).toBe("1.50K");   // inchangé
    expect(fmt(15000)).toBe("15.0K");  // inchangé
    expect(fmt(150000)).toBe("150K");  // était « 150.0K »
    expect(fmt(870000)).toBe("870K");  // était « 870.0K »
  });

  it("tient sur les grands ordres de grandeur et en Decimal", () => {
    expect(fmt(D("8.7e11"))).toBe("870B");
    expect(fmt(D("1e27"))).toBe("1.00Oc");
    expect(fmt(D("2e33"))).toBe("2.00Dc");
  });

  it("la mantisse ne dépasse jamais 3 chiffres significatifs", () => {
    for (const v of [1.5e3, 1.5e4, 1.5e5, 8.7e6, 8.7e7, 8.7e8]) {
      const chiffres = fmt(v).replace(/[^0-9]/g, "");
      expect(chiffres.length, `${fmt(v)} porte plus de 3 chiffres`).toBeLessThanOrEqual(3);
    }
  });
});
