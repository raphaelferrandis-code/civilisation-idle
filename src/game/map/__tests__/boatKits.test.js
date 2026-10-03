// Les kits de bateaux (docs/PLAN-BATEAUX.md) : chaque époque a sa flotte complète,
// chaque modèle se cuit sans erreur, sans être ROGNÉ par son cadre, et les coques du
// Démiurge flottent vraiment au-dessus de l'eau.
import { describe, it, expect } from "vitest";
import { BOAT_MODELS, BAND_FLEET, fleetRoles } from "../iso/boatKits.js";
import { bakeBoat, dirTheta, inFrame } from "../iso/boatBake.js";
import { HOVER } from "../iso/boatKitsCosmic.js";

const opaque = (R) => { let n = 0; for (let i = 3; i < R.data.length; i += 4) if (R.data[i]) n += 1; return n; };

describe("la flotte de chaque époque", () => {
  it("toutes les bandes 0 à 9 ont marchands, pêcheur, passeur et embarcadère", () => {
    for (let b = 0; b <= 9; b += 1) {
      const fl = BAND_FLEET[b];
      expect(fl, "bande " + b).toBeTruthy();
      expect(fl.trade.length).toBeGreaterThanOrEqual(2);
      expect(fl.fisher.length).toBeGreaterThanOrEqual(1);
      expect(fl.ferry.length).toBeGreaterThanOrEqual(1);
      expect(BOAT_MODELS[fl.landing], "embarcadère " + b).toBeTruthy();
      if (b >= 2) expect(fl.barge && fl.barge.length, "chaland " + b).toBeGreaterThanOrEqual(1);
      if (b >= 5) expect(fl.service && fl.service.length, "service " + b).toBeGreaterThanOrEqual(1);
      expect(fleetRoles(b)).not.toContain("landing");
    }
  });
  it("chaque modèle cité existe et porte le bon métier", () => {
    for (const fl of Object.values(BAND_FLEET)) {
      for (const [role, ids] of Object.entries(fl)) {
        if (role === "landing") continue;
        for (const id of ids) {
          expect(BOAT_MODELS[id], id).toBeTruthy();
          // La plaisance À QUAI peut emprunter un autre métier (la chaloupe du passeur
          // fait la « vedette » des bassins de la Fonte).
          if (role !== "pleasure") expect(BOAT_MODELS[id].role, id).toBe(role);
        }
      }
    }
  });
  it("tous les marchands à voile ou à moteur portent des feux ; ni barques ni radeaux", () => {
    for (const id of ["radeau", "pirogue", "radeau-voile", "barque-cousue"]) expect(!!BOAT_MODELS[id].lights).toBe(false);
    for (const id of ["corbita", "cogue", "vapeur", "porte-conteneurs", "voilier-solaire"]) expect(BOAT_MODELS[id].lights).toBe(true);
  });
});

describe("chaque modèle se cuit proprement", () => {
  const ids = Object.keys(BOAT_MODELS);
  it.each(ids)("%s : visible, et jamais rogné par son cadre", (id) => {
    const M = BOAT_MODELS[id];
    for (const k of [0, 9, 17, 26]) {
      for (const state of ["cruise", "dock", "anchor", "salute"]) {
        const ctx = { variant: M.variant(5), state, k: 1.2 };
        const b = bakeBoat(M, dirTheta(k), ctx);
        expect(b.img.w).toBeGreaterThan(4);
        expect(b.img.h).toBeGreaterThan(3);
        // Même cuisson dans un cadre élargi de 24 px : s'il y a PLUS de pixels, le
        // cadre du modèle rognait une pièce (mât, voile, rame…).
        if (state === "cruise" || state === "dock") {
          const [a0, a1, c0, c1, h0, h1] = M.bounds;
          const big = bakeBoat({ ...M, bounds: [a0 - 24, a1 + 24, c0 - 24, c1 + 24, h0, h1 + 24] }, dirTheta(k), ctx);
          expect(opaque(big.img), id + " cap " + k + " " + state).toBe(opaque(b.img));
        }
      }
    }
  });
});

describe("le Démiurge lévite", () => {
  // La même coque, ramenée sur l'eau (repère abaissé de HOVER) : son plus bas pixel
  // doit descendre d'autant. Mesure exacte, quel que soit le cap.
  const lowest = (R) => { let low = -Infinity; for (let j = 0; j < R.h; j += 1) for (let i = 0; i < R.w; i += 1) if (R.data[(j * R.w + i) * 4 + 3]) low = Math.max(low, j + R.oy); return low; };
  it("ses coques flottent HOVER px au-dessus de l'eau", () => {
    const ids = Object.keys(BOAT_MODELS).filter((k) => BOAT_MODELS[k].hover);
    expect(ids.length).toBeGreaterThanOrEqual(6);
    for (const id of ids) {
      const M = BOAT_MODELS[id];
      const down = { ...M, build(S, ctx) { inFrame(S, 0, 0, -HOVER, 0, () => M.build(S, ctx)); } };
      const ctx = { variant: M.variant(3), state: "cruise", k: 1.2 };
      const up = lowest(bakeBoat(M, dirTheta(0), ctx).img), dn = lowest(bakeBoat(down, dirTheta(0), ctx).img);
      expect(dn - up, id).toBeGreaterThanOrEqual(HOVER - 1);
    }
  });
});
