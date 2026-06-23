import { describe, it, expect } from "vitest";

import { tileKey, tileStyle, KIND_BASE_COLOR, KIND_BASE_HEIGHT } from "../tileStyle.js";
import { KINDS } from "../../buildingKinds.js";

describe("tileStyle — table type × palier", () => {
  it("génère la clé logique type × palier (future clé de sprite)", () => {
    expect(tileKey("market", 3)).toBe("market_t3");
    expect(tileKey("food", 1)).toBe("food_t1");
    expect(tileKey("knowledge", 9)).toBe("knowledge_t5"); // borné 1..5
  });

  it("fait MONTER la hauteur avec le palier (la ville grandit en vieillissant)", () => {
    const h1 = tileStyle("market", 1).height;
    const h3 = tileStyle("market", 3).height;
    const h5 = tileStyle("market", 5).height;
    expect(h1).toBeLessThan(h3);
    expect(h3).toBeLessThan(h5);
  });

  it("élargit l'empreinte avec le palier", () => {
    expect(tileStyle("civic", 1).foot).toBeLessThan(tileStyle("civic", 5).foot);
  });

  it("change la couleur d'un palier à l'autre (le concept devient visible)", () => {
    const c1 = tileStyle("food", 1).color;
    const c5 = tileStyle("food", 5).color;
    expect(c1).not.toBe(c5);
  });

  it("garde une identité de famille distincte (deux kinds diffèrent au même palier)", () => {
    expect(tileStyle("food", 3).color).not.toBe(tileStyle("market", 3).color);
    expect(KIND_BASE_COLOR.food).not.toBe(KIND_BASE_COLOR.market);
  });

  it("borne les paliers hors plage sans planter", () => {
    expect(tileStyle("food", 0).height).toBe(tileStyle("food", 1).height);
    expect(tileStyle("food", 99).height).toBe(tileStyle("food", 5).height);
  });

  it("chaque famille (15) a une couleur ET une hauteur de base", () => {
    expect(KINDS).toHaveLength(15);
    for (const kind of KINDS) {
      expect(KIND_BASE_COLOR, kind).toHaveProperty(kind);
      expect(KIND_BASE_HEIGHT, kind).toHaveProperty(kind);
    }
  });
});
