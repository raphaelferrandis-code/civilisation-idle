// Audit du 2026-10-05, BUG-97 — les conteneurs de la barge du pousseur (bande 6)
// prenaient leur couleur d'une somme linéaire graine + abscisse + rangée : elle avançait
// de 6-7 par baie, d'où des paires et des dégradés de la même teinte (6 6 5 5 4 4 4) —
// le défaut déjà corrigé sur le porte-conteneurs. Couleur hachée par boîte désormais.
import { describe, it, expect, vi } from "vitest";

// On note la teinte de chaque conteneur posé (le dessin, lui, reste le vrai).
const boxes = vi.hoisted(() => ({ list: [] }));
vi.mock("../iso/boatParts.js", async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, container: (S, a0, a1, c0, c1, z0, z1, ramp) => { boxes.list.push({ a0, c0, ramp }); return real.container(S, a0, a1, c0, c1, z0, z1, ramp); } };
});

import { BOAT_MODELS } from "../iso/boatKits.js";
import { bakeBoat, dirTheta } from "../iso/boatBake.js";

describe("BUG-97 — les conteneurs du convoi poussé se mélangent", () => {
  it("d'une baie à la voisine, une même teinte pas plus souvent qu'au hasard", () => {
    const M = BOAT_MODELS.pousseur;
    let same = 0, pairs = 0;
    for (let seed = 1; seed <= 12; seed += 1) {
      boxes.list = [];
      bakeBoat(M, dirTheta(4), { variant: { ...M.variant(seed), load: "boxes" }, state: "cruise", k: 0 });
      expect(boxes.list.length, "graine " + seed).toBe(14);         // 7 baies × 2 files
      for (const side of [-1, 1]) {
        // File bâbord (c0 = −6,3) ou tribord (c0 = 0,5), de la poupe à la proue.
        const row = boxes.list.filter((b) => (side < 0 ? b.c0 < 0 : b.c0 > 0)).sort((p, q) => p.a0 - q.a0);
        for (let i = 1; i < row.length; i += 1) { pairs += 1; if (row[i].ramp === row[i - 1].ramp) same += 1; }
      }
    }
    // Au hasard (7 teintes) : ~1/7 des voisines. La somme linéaire en donnait 4 sur 6.
    expect(same / pairs).toBeLessThan(0.3);
  });
});
