import { describe, it, expect } from "vitest";

import { VISUAL_TIERS, visualTierOf, visualTierOfEra } from "../eraTiers.js";

describe("eraTiers — regroupement des 10 bandes en 5 paliers visuels", () => {
  it("couvre les bandes 0..9 exactement une fois (aucun trou, aucun doublon)", () => {
    const seen = VISUAL_TIERS.flatMap((t) => t.bands).sort((a, b) => a - b);
    expect(seen).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("expose 5 paliers indexés 1..5", () => {
    expect(VISUAL_TIERS).toHaveLength(5);
    expect(VISUAL_TIERS.map((t) => t.index)).toEqual([1, 2, 3, 4, 5]);
  });

  it("mappe chaque bande au bon palier", () => {
    const expected = {
      0: "primitif", 1: "primitif",
      2: "antique", 3: "antique",
      4: "imperial", 5: "imperial",
      6: "industriel",
      7: "cosmique", 8: "cosmique", 9: "cosmique"
    };
    for (const [band, id] of Object.entries(expected)) {
      expect(visualTierOf(Number(band)).id).toBe(id);
    }
  });

  it("borne les bandes hors plage", () => {
    expect(visualTierOf(-5).id).toBe("primitif");
    expect(visualTierOf(99).id).toBe("cosmique");
    expect(visualTierOf(3.9).id).toBe("antique"); // tronqué à 3
  });

  it("visualTierOfEra part de l'index d'ère brut", () => {
    expect(visualTierOfEra(0).id).toBe("primitif");
  });
});
