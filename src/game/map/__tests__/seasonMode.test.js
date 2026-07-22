import { describe, it, expect } from "vitest";

import {
  seasonAt, seasonGrass, seasonWild, seasonTip, seasonFlowerMul, seasonCanopyTint,
  SPRING, SUMMER, AUTUMN, WINTER,
} from "../seasonMode.js";

// SAISONS (A6). La règle de conception tient en une phrase : QUATRE ÉTATS
// DIRIGÉS, aucune interpolation. Toute teinte intermédiaire non validée à la
// main fait virer la palette. Ces tests interdisent qu'on réintroduise du
// continu, et vérifient que l'été reste la référence (zéro régression).

describe("seasonAt — une horloge à crans", () => {
  it("ne rend que des entiers de 0 à 3", () => {
    for (let i = 0; i < 200; i += 1) {
      const s = seasonAt(i * 137000);
      expect(Number.isInteger(s)).toBe(true);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(3);
    }
  });

  it("parcourt les quatre saisons dans l'ordre et boucle", () => {
    const first = seasonAt(0);
    const seen = [];
    for (let i = 0; i < 4; i += 1) seen.push(seasonAt(i * 2160000));
    expect(seen).toEqual([0, 1, 2, 3]);
    expect(seasonAt(4 * 2160000)).toBe(first);
  });

  it("une saison dure BIEN plus longtemps qu'un cycle jour/nuit (9 min)", () => {
    // Chaque cran paie une recuisson du sol : des saisons rapides feraient
    // recuire en rafale. On vérifie qu'aucun cran ne tombe dans la même minute.
    expect(seasonAt(0)).toBe(seasonAt(9 * 60000));
  });
});

describe("palettes de saison — dirigées, pas calculées", () => {
  it("l'été reste la référence d'origine, au canal près", () => {
    expect(seasonGrass(SUMMER)).toEqual([116, 138, 84]);
    expect(seasonWild(SUMMER)).toEqual([98, 120, 76]);
    expect(seasonTip(SUMMER)).toEqual([156, 180, 96]);
    expect(seasonFlowerMul(SUMMER)).toBe(1);
    // Pas de passe de teinte l'été : coût nul à la saison de référence.
    expect(seasonCanopyTint(SUMMER)).toBeNull();
  });

  it("les quatre saisons sont RÉELLEMENT distinctes", () => {
    const tons = [SPRING, SUMMER, AUTUMN, WINTER].map((s) => seasonGrass(s).join(","));
    expect(new Set(tons).size).toBe(4);
  });

  it("rien ne fleurit en hiver, le printemps déborde", () => {
    expect(seasonFlowerMul(WINTER)).toBe(0);
    expect(seasonFlowerMul(SPRING)).toBeGreaterThan(seasonFlowerMul(SUMMER));
  });

  it("l'automne vire à la rouille : plus de rouge que de vert", () => {
    const [r, g] = seasonGrass(AUTUMN);
    expect(r).toBeGreaterThan(seasonGrass(SUMMER)[0]);
    expect(g).toBeLessThan(seasonGrass(SUMMER)[1]);
  });

  it("une saison inconnue retombe sur l'été plutôt que sur du vide", () => {
    expect(seasonGrass(99)).toEqual(seasonGrass(SUMMER));
    expect(seasonTip(-1)).toEqual(seasonTip(SUMMER));
    expect(seasonFlowerMul(99)).toBe(1);
  });
});
