import { describe, it, expect } from "vitest";

import { normalizeVestiges, migrate, hydrateState, CURRENT_SAVE_VERSION } from "../state.js";

describe("normalizeVestiges — records de cité morte (v3)", () => {
  it("convertit un vestige v2 {gridN, ruins[]} en footprint compact, sans ruins", () => {
    const v2 = { gridN: 30, ruins: [{ x: 10, y: 10 }, { x: 20, y: 14 }, { x: 12, y: 22 }] };
    const [out] = normalizeVestiges([v2]);
    expect(out).toBeTruthy();
    expect(out.ruins).toBeUndefined(); // le lourd tableau est jeté
    // bbox: x 10..20 → cx 15 ; y 10..22 → cy 16 ; radius = ceil(max(10,12)/2) = 6
    expect(out.footprint).toEqual({ gridN: 30, cx: 15, cy: 16, radius: 6 });
    // métadonnées par défaut (vieux save : ère/année inconnues)
    expect(out.cityName).toBe("");
    expect(out.year).toBe(0);
    expect(out.eraIndex).toBe(0);
    expect(typeof out.eraBand).toBe("number");
    expect(out.mapSeed).toBe(0);
  });

  it("vestige v2 sans ruines → footprint dérivé de gridN", () => {
    const [out] = normalizeVestiges([{ gridN: 24 }]);
    expect(out.footprint).toEqual({ gridN: 24, cx: 12, cy: 12, radius: 6 });
  });

  it("préserve et borne un record v3 complet", () => {
    const v3 = {
      cityName: "Valmoren", year: 412, eraName: "Âge du Bronze",
      eraIndex: 8, eraBand: 3, mapSeed: 123456, cycleIndex: 5,
      footprint: { gridN: 40, cx: 20, cy: 18, radius: 9 }
    };
    const [out] = normalizeVestiges([v3]);
    expect(out.cityName).toBe("Valmoren");
    expect(out.year).toBe(412);
    expect(out.eraName).toBe("Âge du Bronze");
    expect(out.eraIndex).toBe(8);
    expect(out.eraBand).toBe(3);
    expect(out.mapSeed).toBe(123456);
    expect(out.cycleIndex).toBe(5);
    expect(out.footprint).toEqual({ gridN: 40, cx: 20, cy: 18, radius: 9 });
  });

  it("footprint bruité → valeurs finies clampées, non-finies rabattues sur le défaut", () => {
    const [out] = normalizeVestiges([{ footprint: { gridN: 99999, cx: -5, cy: "x", radius: 0 } }]);
    expect(out.footprint.gridN).toBe(500); // 99999 fini → clamp max
    expect(out.footprint.cx).toBe(0);      // -5 fini → clamp min
    expect(out.footprint.cy).toBe(10);     // "x" non-fini → défaut
    expect(out.footprint.radius).toBe(1);  // 0 fini → clamp min
  });

  it("filtre le bruit et conserve 3 vestiges max (les plus récents)", () => {
    expect(normalizeVestiges("nope")).toEqual([]);
    expect(normalizeVestiges([null, 42, "x"])).toEqual([]);
    const four = [1, 2, 3, 4].map((n) => ({ footprint: { gridN: 20, cx: 10, cy: 10, radius: n } }));
    const out = normalizeVestiges(four);
    expect(out.length).toBe(3);
    expect(out.map((v) => v.footprint.radius)).toEqual([2, 3, 4]); // slice(-3)
  });
});

describe("migration save → v3 (vestiges)", () => {
  it("CURRENT_SAVE_VERSION vaut 3", () => {
    expect(CURRENT_SAVE_VERSION).toBe(3);
  });

  it("migrate() estampille la version 3 (transformation faite par les normalizers)", () => {
    const migrated = migrate({ saveVersion: 2, vestiges: [{ gridN: 28, ruins: [{ x: 5, y: 5 }] }] });
    expect(migrated.saveVersion).toBe(3);
  });

  it("hydrateState convertit un save v2 en records compacts (ruins jetés)", () => {
    const s = hydrateState({ saveVersion: 2, vestiges: [{ gridN: 28, ruins: [{ x: 5, y: 5 }, { x: 15, y: 11 }] }] });
    expect(s.saveVersion).toBe(3);
    expect(s.vestiges.length).toBe(1);
    expect(s.vestiges[0].ruins).toBeUndefined();
    expect(s.vestiges[0].footprint.gridN).toBe(28);
  });
});
