import { describe, it, expect } from "vitest";

import { buildings } from "../../data/buildings.js";
import { KINDS, BUILDING_KIND, kindOf } from "../buildingKinds.js";

describe("buildingKinds — familles visuelles des bâtiments", () => {
  it("chaque bâtiment du jeu a une famille connue (pas de trou de taxonomie)", () => {
    for (const b of buildings) {
      expect(BUILDING_KIND).toHaveProperty(b.id);
      expect(KINDS).toContain(kindOf(b.id, b.category));
    }
  });

  it("le mapping ne contient pas de famille inconnue", () => {
    for (const kind of Object.values(BUILDING_KIND)) {
      expect(KINDS).toContain(kind);
    }
  });

  it("respecte quelques mappings repères", () => {
    expect(kindOf("foragers")).toBe("food");
    expect(kindOf("markets")).toBe("market");
    expect(kindOf("observatories")).toBe("observatory");
    expect(kindOf("scribes")).toBe("knowledge");
    expect(kindOf("roads")).toBe("civic");
    expect(kindOf("mint_houses")).toBe("mint");
  });

  it("retombe sur la catégorie de gameplay pour un id inconnu", () => {
    expect(kindOf("nouveau_batiment", "knowledge")).toBe("knowledge");
    expect(kindOf("nouveau_batiment", "infra")).toBe("civic");
    expect(kindOf("nouveau_batiment", "city")).toBe("market");
    expect(kindOf("nouveau_batiment")).toBe("civic"); // dernier recours
  });
});
