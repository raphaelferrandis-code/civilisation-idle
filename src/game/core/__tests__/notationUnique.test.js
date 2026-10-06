// NOTATION UNIQUE (refonte UI, maquette V4, 2026-10-03) : suffixes familiers
// jusqu'au trillion (K, M, B, T), puis scientifique pour TOUS. Avant, Qa…Dc
// menaient jusqu'à 1e36 et la même barre montrait « 13.8Qa » à côté de
// « 8.90e41 ».
import { describe, it, expect } from "vitest";
import { fmt, fmtShort, fmtShortLive, COMPACT_UNITS, SCIENTIFIC_FROM } from "../utils.js";
import { D } from "../num.js";

describe("notation unique — K, M, B, T puis scientifique", () => {
  it("les suffixes s'arrêtent au trillion", () => {
    expect(COMPACT_UNITS).toEqual(["K", "M", "B", "T"]);
    expect(SCIENTIFIC_FROM).toBe(1e15);
  });

  it("bascule à mille trillions, sans suffixe exotique", () => {
    expect(fmt(8.7e14)).toBe("870T");
    expect(fmt(1e15)).toBe("1.00e15");
    expect(fmt(1.38e16)).toBe("1.38e16");
    expect(fmt(8.9e41)).toBe("8.90e41");
    expect(fmt(D("8.9e41"))).toBe("8.90e41");
  });

  it("le format court et le format vivant suivent la même règle", () => {
    expect(fmtShort(1.38e16)).toBe("1.38e16");
    expect(fmtShortLive(5.6e12)).toBe("5.6000T");
    expect(fmtShortLive(1.38e16)).toBe("1.3800e16");
  });

  it("au-delà du float, le format vivant ne garde que deux décimales (BUG-20)", () => {
    // L'odomètre n'y roule plus : « 2.2017e2741 » était rogné dans sa case.
    expect(fmtShortLive(D("2.2017e2741"))).toBe("2.20e2741");
    expect(fmtShortLive(D("4.4397e345"))).toBe("4.44e345");
    expect(fmtShortLive(D("-3.5e400"))).toBe("-3.50e400");
  });

  it("aucun nombre affiché ne porte de suffixe à deux lettres", () => {
    for (let e = 3; e <= 300; e += 1) {
      const s = fmt(1.5 * Math.pow(10, e));
      expect(s, `1.5e${e} → ${s}`).toMatch(/^[0-9.]+([KMBT]|e[0-9]+)$/);
    }
  });

  it("le point est le séparateur décimal, jamais la virgule", () => {
    for (const v of [1.5, 15.5, 1500, 1.5e7, 1.5e20]) expect(fmt(v)).not.toContain(",");
  });
});
