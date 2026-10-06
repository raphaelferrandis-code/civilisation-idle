// UNE SEULE ÉCHELLE D'ÈRES POUR LES PLACES ET LES POINTS D'EAU (audit du 05/10,
// STRUCT-12). waterPointEra recopiait la table de plazaEraForBand : la correction du
// 2026-09-30 (le bassin romain au Marbre, band 4 ; le puits de bois aux bands 2-3) y
// est restée oubliée jusqu'au 2026-10-04. Elle la lit désormais, plus un cran
// primitif sous les places.
import { it, expect } from "vitest";
import { waterPointEra } from "../isoGroundProps.js";
import { plazaEraForBand } from "../isoPlaza.js";

it("points d'eau = places, plus le cran primitif", () => {
  const want = ["primitive", "primitive", "medieval", "medieval", "antique", "industrial", "modern", "cosmic", "cosmic", "cosmic"];
  for (let b = 0; b <= 9; b += 1) {
    expect(waterPointEra(b)).toBe(want[b]);
    expect(waterPointEra(b)).toBe(plazaEraForBand(b) || "primitive");
  }
});
