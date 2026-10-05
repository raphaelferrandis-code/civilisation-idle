import { describe, it, expect } from "vitest";
import { getEraTheme, eraBandOf } from "../../data/eraThemes.js";
import { eras } from "../../data/world.js";

// BUG-102 (audit du 05/10) : `ROMANS[i % 5]` supposait cinq ères par époque.
// Vrai pour 0-34, faux pour les époques cosmiques (54, 44, 166 ères) :
// l'infobulle de l'Âge annonçait « Âge stellaire, ère V/V » à son tout début.

describe("position de l'ère dans son époque (BUG-102)", () => {
  it("époques 0-6 : chiffre romain sur V, inchangé", () => {
    for (let i = 0; i <= 34; i++) {
      const t = getEraTheme(i);
      expect(t.epochNumeral).toBe(["I", "II", "III", "IV", "V"][i % 5]);
      expect(t.epochStep).toBe((i % 5) + 1);
      expect(t.epochSize).toBe(5);
    }
  });

  it("époques cosmiques : pas de « x/V », la position réelle dans l'époque", () => {
    for (let i = 35; i < eras.length; i++) {
      const t = getEraTheme(i);
      expect(t.epochNumeral).toBeNull();
      expect(t.epochStep).toBeGreaterThanOrEqual(1);
      expect(t.epochStep).toBeLessThanOrEqual(t.epochSize);
      // Première ère d'une époque : position 1.
      if (eraBandOf(i - 1) !== t.band) expect(t.epochStep).toBe(1);
    }
    // La dernière ère clôt son époque.
    const last = getEraTheme(eras.length - 1);
    expect(last.epochStep).toBe(last.epochSize);
  });
});
