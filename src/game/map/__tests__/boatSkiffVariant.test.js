// L'ESQUIF COSMIQUE LIT LA VARIANTE DE LA CUISSON (audit du 05/10, MORT-11, décision
// de Raph du 2026-10-06). makeSkiffC prenait `this.variant(1)` en dur et ignorait
// `ctx.variant`, seul modèle à le faire. Branché comme les autres
// (`ctx.variant || this.variant(1)`) : aucun pixel ne change, la variante de l'esquif
// ne dépendant pas de la graine (planches/barque-variante : 72 comparaisons
// identiques). Ce que ce test tient : la graine ne change toujours rien, et la
// variante transmise est bien celle qui peint la coque.
import { describe, it, expect } from "vitest";
import { BOAT_MODELS } from "../iso/boatKits.js";
import { bakeBoat, dirTheta } from "../iso/boatBake.js";

const same = (a, b) => a.w === b.w && a.h === b.h && a.ox === b.ox && a.oy === b.oy
  && a.data.length === b.data.length && a.data.every((v, i) => v === b.data[i]);

describe("esquif cosmique — la variante de la cuisson", () => {
  it("la graine ne change aucun pixel ; une autre variante, si", () => {
    const M = BOAT_MODELS["esquif-7"];
    expect(M).toBeTruthy();
    const th = dirTheta(4);
    const ref = bakeBoat(M, th, {}).img;
    expect(same(bakeBoat(M, th, { variant: M.variant(777) }).img, ref)).toBe(true);
    // La nacre teintée d'une autre ère : si la variante transmise était encore
    // ignorée, la coque resterait celle de la bande 7.
    const autre = bakeBoat(M, th, { variant: BOAT_MODELS["esquif-9"].variant(1) }).img;
    expect(same(autre, ref)).toBe(false);
  });
});
