// La cuisson de chaque modèle de bateau (docs/PLAN-BATEAUX.md), partagée entre TROIS
// fichiers de test : boatKits.test.js (1er tiers), boatKitsBake2.test.js et
// boatKitsBake3.test.js. Seule, c'était le fichier le plus long de la suite (30 s) ;
// en trois, Vitest les fait tourner en parallèle (audit 2026-10-05, TEST-7).
// Les modèles sont répartis UN SUR TROIS (et non par blocs) : les coûteux (porte-
// conteneurs, arches, chalands de lumière) se partagent entre les fichiers.
import { describe, it, expect } from "vitest";
import { BOAT_MODELS } from "../iso/boatKits.js";
import { bakeBoat, dirTheta } from "../iso/boatBake.js";
// Le compte de pixels opaques partagé des tests d'art (TEST-9), plus une recopie.
import { opaqueCount as opaque } from "../../../test/pixels.js";

export const BAKE_TIERS = 3;

// tier = 1, 2 ou 3.
export function describeBoatBakes(tier) {
  const ids = Object.keys(BOAT_MODELS).filter((_, i) => i % BAKE_TIERS === tier - 1);
  describe("chaque modèle se cuit proprement (tiers " + tier + "/" + BAKE_TIERS + ")", () => {
    it.each(ids)("%s : visible, et jamais rogné par son cadre", (id) => {
      const M = BOAT_MODELS[id];
      const visible = (b) => { expect(b.img.w).toBeGreaterThan(4); expect(b.img.h).toBeGreaterThan(3); };
      // En route et à quai, aux quatre caps : la même cuisson dans un cadre élargi de
      // 24 px ; s'il y a PLUS de pixels, le cadre du modèle rognait une pièce (mât,
      // voile, rame…).
      for (const k of [0, 9, 17, 26]) {
        for (const state of ["cruise", "dock"]) {
          const ctx = { variant: M.variant(5), state, k: 1.2 };
          const b = bakeBoat(M, dirTheta(k), ctx);
          visible(b);
          const [a0, a1, c0, c1, h0, h1] = M.bounds;
          const big = bakeBoat({ ...M, bounds: [a0 - 24, a1 + 24, c0 - 24, c1 + 24, h0, h1 + 24] }, dirTheta(k), ctx);
          expect(opaque(big.img), id + " cap " + k + " " + state).toBe(opaque(b.img));
        }
      }
      // Au mouillage et au salut, on ne vérifie que la cuisson et la visibilité : un
      // cap suffit (un différent pour chacun).
      for (const [state, k] of [["anchor", 9], ["salute", 26]]) {
        visible(bakeBoat(M, dirTheta(k), { variant: M.variant(5), state, k: 1.2 }));
      }
    });
  });
}
