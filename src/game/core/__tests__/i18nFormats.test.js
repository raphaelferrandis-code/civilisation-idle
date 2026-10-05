"use strict";
// FORMATS DE NOMBRES ET DE DURÉES SELON LA LANGUE (audit du 05/10, I18N-10 et
// I18N-11). « fr-FR » était écrit en dur (« 560 000 » sur le compteur d'habitants
// anglais), l'arrondi du format compact franchissait les bornes (« 1000K »,
// « 10.00K »), trois copies du formateur « horloge » écrivaient « 3j 04h » en
// anglais, et les cotes passaient à la virgule.

import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { fmt, fmtShort, fmtShortLive, fmtHabitants, fmtInt, numLocale, fmtClock, fmtCote, setNumberFormatMode } from "../utils.js";
import { setLang } from "../i18n.js";
import { buildingMilestoneInfo } from "../mechanics/production/buildingOutput.js";
import { nomCheval, NOMS } from "../actions/courses.js";

afterEach(() => {
  setLang("fr");
  setNumberFormatMode("compact");
});

describe("format compact — l'arrondi ne franchit plus les bornes", () => {
  it("passe à l'unité suivante quand l'arrondi atteint 1000", () => {
    expect(fmt(999999)).toBe("1.00M");
    expect(fmt(999999999)).toBe("1.00B");
    expect(fmt(999.6)).toBe("1.00K");
    expect(fmtShort(999999)).toBe("1.00M");
  });

  it("au bout du T, l'arrondi bascule en scientifique", () => {
    expect(fmt(999999999999999)).toBe("1.00e15");
  });

  it("la valeur ARRONDIE choisit ses décimales (3 chiffres significatifs)", () => {
    expect(fmt(9999.6)).toBe("10.0K");
    expect(fmt(99960)).toBe("100K");
    expect(fmtShortLive(9999.99996)).toBe("10.000K");
  });

  it("les valeurs loin des bornes ne bougent pas", () => {
    expect(fmt(8700)).toBe("8.70K");
    expect(fmt(87000)).toBe("87.0K");
    expect(fmt(870000)).toBe("870K");
    expect(fmt(999.4)).toBe("999");
    expect(fmt(-999999)).toBe("-1.00M");
  });
});

describe("séparateurs de milliers de la langue", () => {
  it("numLocale suit la langue", () => {
    expect(numLocale()).toBe("fr-FR");
    setLang("en");
    expect(numLocale()).toBe("en-US");
  });

  it("le compteur d'habitants écrit « 560,000 » en anglais", () => {
    expect(fmtHabitants(560000)).toMatch(/^560\s000$/u);
    setLang("en");
    expect(fmtHabitants(560000)).toBe("560,000");
    expect(fmtInt(3000.4)).toBe("3,000");
    expect(fmtHabitants(2.5e6)).toBe("2.50M");
  });

  it("le format complet groupe à la virgule en anglais, la décimale reste au point", () => {
    setNumberFormatMode("full");
    expect(fmt(1234567)).toBe("1 234 567");
    setLang("en");
    expect(fmt(1234567)).toBe("1,234,567");
    expect(fmt(5.5)).toBe("5.5");
  });
});

describe("fmtClock — une seule horloge, unité de jour traduite", () => {
  const T = 3 * 86400 + 4 * 3600 + 5 * 60 + 9;

  it("« d » en anglais, « j » en français", () => {
    expect(fmtClock(T)).toBe("3j 04h 05m");
    setLang("en");
    expect(fmtClock(T)).toBe("3d 04h 05m");
  });

  it("reproduit les trois conventions des anciennes copies", () => {
    // Chronique : les secondes tombent en jours.
    expect(fmtClock(2 * 3600 + 5 * 60 + 9)).toBe("2h 05m 09s");
    expect(fmtClock(65)).toBe("1m 05s");
    expect(fmtClock(7)).toBe("7s");
    // Encart latéral : à la seconde même en jours.
    expect(fmtClock(T, { seconds: "always" })).toBe("3j 04h 05m 09s");
    // Faits divers : à la minute.
    expect(fmtClock(2 * 3600 + 5 * 60 + 9, { seconds: "never" })).toBe("2h 05m");
    expect(fmtClock(30, { seconds: "never" })).toBe("0m");
  });

  it("encaisse les entrées aberrantes", () => {
    expect(fmtClock(-5)).toBe("0s");
    expect(fmtClock(NaN)).toBe("0s");
  });
});

describe("cotes au point et libellés bilingues", () => {
  it("une cote s'écrit au point dans les deux langues", () => {
    expect(fmtCote(2.5)).toBe("×2.50");
    expect(fmtCote(12.34)).toBe("×12.3");
    expect(fmtCote(1.9, 2)).toBe("×1.90");
    setLang("en");
    expect(fmtCote(2.5)).toBe("×2.50");
  });

  it("le jalon d'un bâtiment n'écrit plus « atteint » en anglais", () => {
    const b = { id: "test", category: "city" };
    expect(buildingMilestoneInfo(b, 25).label).toMatch(/^×.+ atteint$/);
    setLang("en");
    expect(buildingMilestoneInfo(b, 25).label).toMatch(/^×.+ reached$/);
  });

  it("les chevaux mythologiques prennent leur graphie anglaise, le nom français reste la clé", () => {
    expect(nomCheval("Pégase")).toBe("Pégase");
    setLang("en");
    expect(nomCheval("Pégase")).toBe("Pegasus");
    expect(nomCheval("Phébus")).toBe("Phoebus");
    expect(nomCheval("Tonnerre")).toBe("Tonnerre"); // nom propre, gardé
    for (const n of NOMS) expect(nomCheval(n)).toBeTruthy();
  });

  it("les sources des vestiges actifs portent les noms anglais des Mythes", () => {
    // Lecture du SOURCE : activeRuins.js s'aplatit dans la langue du chargement.
    const src = readFileSync(fileURLToPath(new URL("../../data/activeRuins.js", import.meta.url)), "utf8");
    const ens = [...src.matchAll(/source: \{ fr: "[^"]*", en: "([^"]*)" \}/g)].map((m) => m[1]);
    expect(ens.length).toBeGreaterThanOrEqual(10);
    for (const en of ens) expect(en, `source anglaise « ${en} »`).not.toMatch(/[éèêëàâîïôûçÉÈÊÀÂÎÔÛÇ]/);
    expect(ens).toEqual(expect.arrayContaining(["Aeneas", "Prometheus", "Hephaestus", "Sisyphus", "Icarus", "Phoenix", "Atreides"]));
  });
});
