import { describe, it, expect } from "vitest";
import { crediblePopulation, HAB_ANCHORS } from "../demographics.js";
import { eras } from "../../data/world.js";
import { D } from "../num.js";

describe("crediblePopulation — compteur habitants cosmétique", () => {
  it("démarre à ~10 (population initiale)", () => {
    expect(crediblePopulation(10)).toBeCloseTo(10, 0);
  });

  it("continu aux frontières d'ère : au seuil d'entrée, vaut l'ancre de l'ère", () => {
    for (let i = 0; i < HAB_ANCHORS.length; i += 1) {
      const atThreshold = crediblePopulation(eras[i].at);
      // tolérance 2 % (le seuil peut être pile OU une micro-fraction au-dessus)
      expect(atThreshold).toBeGreaterThan(HAB_ANCHORS[i] * 0.98);
      expect(atThreshold).toBeLessThan(HAB_ANCHORS[i] * 1.02);
    }
  });

  it("rend un « clan » et un « hameau » crédibles", () => {
    // Ère 3 = Clans, ère 5 = Hameau. Milieu d'ère → entre les deux ancres.
    const clan = crediblePopulation(56339);   // seuil Clans
    const hameau = crediblePopulation(8.7e6); // ~seuil Hameau
    expect(clan).toBeGreaterThan(100);
    expect(clan).toBeLessThan(300);
    expect(hameau).toBeGreaterThan(500);
    expect(hameau).toBeLessThan(1500);
  });

  it("est strictement croissant avec la population-moteur", () => {
    let prev = 0;
    for (const p of [10, 100, 1000, 1e4, 1e5, 1e6, 1e8, 1e10, 1e14, 1e20, 1e28]) {
      const h = crediblePopulation(p);
      expect(h).toBeGreaterThan(prev);
      prev = h;
    }
  });

  it("reste fini et positif pour des Decimal cosmiques (au-delà du float)", () => {
    for (const p of [D("1e35"), D("1e97"), D("1e120")]) {
      const h = crediblePopulation(p);
      expect(Number.isFinite(h)).toBe(true);
      expect(h).toBeGreaterThan(0);
    }
  });

  it("ne descend jamais sous 1, même à population effondrée", () => {
    expect(crediblePopulation(0)).toBeGreaterThanOrEqual(1);
    expect(crediblePopulation(1)).toBeGreaterThanOrEqual(1);
  });
});
