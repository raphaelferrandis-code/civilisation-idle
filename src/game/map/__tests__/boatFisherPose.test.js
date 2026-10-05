// Audit du 2026-10-05, BUG-65 — au mouillage (fisherDwell, ~90 s), seule la scapha
// (bande 4) recevait l'état 'anchor' : les pêcheurs des neuf autres bandes ramaient sur
// place, voile latine hissée, sans jamais relever filet, ligne ni sagaie. Le kit décide
// maintenant par le métier du modèle.
import { describe, it, expect } from "vitest";
import { BOAT_MODELS, BAND_FLEET } from "../iso/boatKits.js";
import { bakeBoat, dirTheta } from "../iso/boatBake.js";
import { kitState } from "../iso/boatKit.js";

describe("BUG-65 — le pêcheur pêche au mouillage, à toutes les époques", () => {
  it("chaque bande : l'état de mouillage transmis au kit donne la pose de pêche", () => {
    for (let b = 0; b <= 9; b += 1) {
      const id = BAND_FLEET[b].fisher[0], M = BOAT_MODELS[id];
      const st = kitState({ id, seed: 3 }, "anchor");
      expect(st, "bande " + b + " (" + id + ")").toBe("anchor");
      const poses = bakeBoat(M, dirTheta(4), { variant: M.variant(3), state: st, k: 1 }).crew.map((c) => c.pose);
      expect(poses, "bande " + b + " (" + id + ")").toContain("haul");
    }
  });

  it("les autres métiers ne changent pas : drague, pompiers et marchands restent en route", () => {
    for (let b = 0; b <= 9; b += 1) {
      const fl = BAND_FLEET[b];
      for (const id of [...(fl.service || []), ...fl.trade]) expect(kitState({ id, seed: 1 }, "anchor"), id).toBe("cruise");
    }
    expect(kitState({ id: "inconnu", seed: 1 }, "anchor")).toBe("cruise");
    expect(kitState(null, "anchor")).toBe("cruise");
  });
});
