import { describe, it, expect } from "vitest";

import { bridgeIsSuspended, bridgeTune } from "../iso/isoBridge.js";
import { bridgeEraForBand } from "../pixelBridge.js";

// Les palées d'un pont tombaient tous les 1,15 à 1,6 tuiles d'une berge à
// l'autre, alors qu'un porte-conteneurs en fait 2,24 de large : il traversait la
// pierre. Deux réponses, chacune à sa place dans le temps :
//   · avant le fer, la PASSE NAVIGABLE — la travée du milieu s'ouvre ;
//   · à partir du fer, le SUSPENDU — plus une seule palée dans l'eau.
//
// Le seuil est le point sensible. Celui du vapeur avait fini recopié à trois
// endroits avec deux valeurs différentes, et un vapeur croisait devant des
// habitants en toge. Ce test tient la frontière.

describe("pont suspendu — pas avant le fer", () => {
  it("bois et pierre gardent leurs palées", () => {
    for (const band of [0, 1, 2, 3]) {
      expect(bridgeIsSuspended(band), `bande ${band}`).toBe(false);
    }
  });

  it("fer, béton et énergie sont suspendus", () => {
    for (const band of [4, 5, 6, 7, 8, 9]) {
      expect(bridgeIsSuspended(band), `bande ${band}`).toBe(true);
    }
  });

  it("la bascule tombe EXACTEMENT à la bande 4", () => {
    // Un pont suspendu à l'âge du bronze est la même faute que le vapeur devant
    // des habitants en toge : le suspendu naît avec la métallurgie.
    expect(bridgeIsSuspended(3)).toBe(false);
    expect(bridgeIsSuspended(4)).toBe(true);
    expect(bridgeEraForBand(3)).toBe("pierre");
    expect(bridgeEraForBand(4)).toBe("fer");
  });
});

describe("passe navigable — utile là où il reste des palées", () => {
  it("laisse plus de place que la coque la plus large", () => {
    // Le porte-conteneurs, le plus gros de la flotte, fait 0,7 × 3,2 = 2,24
    // tuiles. La passe doit l'avaler sans qu'il frôle les culées.
    const largeurPasse = bridgeTune.passHalf * 2;
    expect(largeurPasse).toBeGreaterThan(2.24 * 1.3);
  });

  it("reste dans un lit de fleuve plausible", () => {
    // Le fleuve fait ~6 tuiles de large au plus fort. Une passe qui dévorerait
    // tout le lit ne laisserait plus de quoi asseoir les culées.
    expect(bridgeTune.passHalf * 2).toBeLessThan(5);
  });
});
