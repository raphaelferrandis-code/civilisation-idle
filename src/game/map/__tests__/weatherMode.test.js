import { describe, it, expect } from "vitest";

import { rainAt, windAt } from "../weatherMode.js";

// MÉTÉO (A2). La règle de design tient dans la courbe : le temps dégagé est
// l'état normal, l'averse est un événement COURT. Un jeu qu'on laisse tourner
// des heures ne doit pas passer son temps sous la pluie.

describe("rainAt — l'averse reste un événement court", () => {
  it("le temps est dégagé sur la plus grande partie du cycle", () => {
    let sec = 0;
    for (let i = 0; i < 1000; i += 1) if (rainAt(i / 1000) > 0) sec += 1;
    expect(sec / 1000).toBeLessThan(0.25);
  });

  it("il pleut vraiment à un moment, et à pleine intensité", () => {
    const peak = Math.max(...Array.from({ length: 1000 }, (_, i) => rainAt(i / 1000)));
    expect(peak).toBe(1);
  });

  it("aucun saut : l'averse arrive et se retire en fondu", () => {
    let maxJump = 0;
    let prev = rainAt(0);
    for (let i = 1; i <= 1000; i += 1) {
      const v = rainAt(i / 1000);
      maxJump = Math.max(maxJump, Math.abs(v - prev));
      prev = v;
    }
    expect(maxJump).toBeLessThan(0.05);
  });

  it("boucle proprement : la fin du cycle rejoint le début", () => {
    expect(rainAt(0.9999)).toBeCloseTo(rainAt(0), 2);
  });
});

describe("windAt — le vent tient pendant une averse, change à la suivante", () => {
  it("constant pour un cycle donné", () => {
    expect(windAt(1234)).toBe(windAt(1234));
  });

  it("borné : la pluie penche, elle ne devient jamais horizontale", () => {
    for (let c = 0; c < 500; c += 1) {
      expect(Math.abs(windAt(c))).toBeLessThanOrEqual(0.7);
    }
  });

  it("deux averses de suite ne se ressemblent pas", () => {
    const a = Array.from({ length: 40 }, (_, c) => windAt(c));
    const uniques = new Set(a.map((v) => v.toFixed(3)));
    expect(uniques.size).toBeGreaterThan(30);
  });
});
