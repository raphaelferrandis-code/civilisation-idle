import { describe, it, expect } from "vitest";

import { eras } from "../../data/world.js";
import { visualTierOf } from "../eraTiers.js";
import { getCityRenderModel } from "../cityRenderModel.js";

// Stub d'état minimal : le contrat ne lit que population / instability / buildings.
function stub(over = {}) {
  return { population: 0, instability: 0, buildings: {}, ...over };
}

describe("getCityRenderModel — le tuyau jeu → rendu", () => {
  it("exige un état", () => {
    expect(() => getCityRenderModel()).toThrow();
  });

  it("ville vide : aucun bâtiment, palier primitif", () => {
    const m = getCityRenderModel(stub());
    expect(m.buildings).toEqual([]);
    expect(m.totalBuildings).toBe(0);
    expect(m.era.index).toBe(0);
    expect(m.era.band).toBe(0);
    expect(m.era.tier.id).toBe("primitif");
  });

  it("liste les bâtiments possédés avec famille/nom/catégorie, ignore les comptes nuls", () => {
    const m = getCityRenderModel(stub({ buildings: { foragers: 5, markets: 2, scribes: 0 } }));
    const ids = m.buildings.map((b) => b.id);
    expect(ids).toEqual(["foragers", "markets"]); // scribes (0) exclu, ordre déterministe
    expect(m.totalBuildings).toBe(7);
    const foragers = m.buildings.find((b) => b.id === "foragers");
    expect(foragers).toMatchObject({ kind: "food", category: "city", count: 5 });
    expect(typeof foragers.name).toBe("string");
  });

  it("borne l'instabilité dans [0,1]", () => {
    expect(getCityRenderModel(stub({ instability: 1.5 })).instability).toBe(1);
    expect(getCityRenderModel(stub({ instability: -0.2 })).instability).toBe(0);
    expect(getCityRenderModel(stub({ instability: 0.42 })).instability).toBeCloseTo(0.42);
  });

  it("le palier est toujours cohérent avec la bande", () => {
    const m = getCityRenderModel(stub({ population: 1000 }));
    expect(m.era.tier).toEqual(visualTierOf(m.era.band));
  });

  it("une population maximale atteint le palier cosmique", () => {
    const m = getCityRenderModel(stub({ population: eras[eras.length - 1].at }));
    expect(m.era.index).toBe(eras.length - 1);
    expect(m.era.tier.id).toBe("cosmique");
  });
});
