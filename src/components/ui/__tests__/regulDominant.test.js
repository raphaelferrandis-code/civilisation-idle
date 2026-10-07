/**
 * LE FOYER DOMINANT de la barre de Régulation (retour extérieur du 2026-10-07,
 * maquette « Lisibilité de la Cité ») : à partir de la crise profonde, le foyer
 * qui pèse le plus passe au rouge et son édit à l'or. Avant, aucun : le rouge et
 * l'or restent réservés au danger et au geste à faire maintenant.
 */
import { describe, it, expect } from "vitest";
import { dominantFoyerKey, DOMINANT_FOYER_FROM } from "../regulModel.js";

const FOYERS = [["scarcity", 0.18], ["inequality", 0.41], ["complexity", 0.26], ["dissent", 0.12]];

describe("dominantFoyerKey", () => {
  it("personne sous la crise profonde, ni sans Rupture connue", () => {
    expect(dominantFoyerKey(FOYERS, 0.74)).toBeNull();
    expect(dominantFoyerKey(FOYERS, undefined)).toBeNull();
  });

  it("à partir du palier de 75 % de la jauge, le foyer qui pèse le plus", () => {
    expect(DOMINANT_FOYER_FROM).toBe(0.75);
    expect(dominantFoyerKey(FOYERS, 0.75)).toBe("inequality");
    expect(dominantFoyerKey(FOYERS, 0.97)).toBe("inequality");
  });

  it("à égalité le premier de la liste ; si rien ne pèse, personne", () => {
    expect(dominantFoyerKey([["scarcity", 0.3], ["inequality", 0.3]], 0.9)).toBe("scarcity");
    expect(dominantFoyerKey([["scarcity", 0], ["inequality", undefined]], 0.9)).toBeNull();
  });
});
