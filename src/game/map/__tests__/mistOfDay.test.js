import { describe, it, expect } from "vitest";

import { mistOfDay } from "../iso/vieArt.js";

// Cycle (cityMapRuntime) : jour 0-0,55, crépuscule 0,55-0,65, nuit 0,65-0,90, aube 0,90-1.
describe("brume du fleuve — heure", () => {
  it("rien en pleine nuit (sa trame se lisait comme des points de lumière, Raph 2026-10-01)", () => {
    for (const p of [0.7, 0.75, 0.8, 0.85, 0.89]) expect(mistOfDay(p)).toBe(0);
  });
  it("se forme au soir, culmine à l'aube, se lève dans la matinée", () => {
    expect(mistOfDay(0.58)).toBeGreaterThan(0.2);   // crépuscule
    expect(mistOfDay(0.99)).toBe(1);                // aube
    expect(mistOfDay(0.05)).toBeGreaterThan(0);     // matinée : elle se lève
    expect(mistOfDay(0.3)).toBe(0);                 // plein jour
  });
  it("courbe continue (pas de saut à l'entrée ni à la sortie de la nuit)", () => {
    for (let p = 0; p < 1; p += 0.002) {
      expect(Math.abs(mistOfDay(p + 0.002) - mistOfDay(p))).toBeLessThan(0.08);
    }
  });
});
