// MICRO-COÛTS DU PEINTRE (audit du 05/10, PERF-46). La collecte et l'ancrage
// redemandent le décalage de façade et le test « à plat » de CHAQUE tuile à chaque
// frame : un objet neuf et trois à quatre regex par tuile. Mémorisés sur la tuile —
// ces gardes vérifient qu'on rend la même valeur qu'avant, et qu'un réglage changé
// (molette __front) ou une façade recalculée n'est jamais servi périmé.
import { describe, it, expect, afterEach } from "vitest";
import { FRONT, isoFlatFootprint, isoFrontOffset } from "../iso/isoGroundDetail.js";

const carte = (cells) => {
  const m = new Map();
  for (const [k, v] of Object.entries(cells)) m.set(k, { rank: "secondary", ...v });
  return m;
};
const FRONT0 = { ...FRONT };
afterEach(() => { Object.assign(FRONT, FRONT0); });

describe("décalage de façade mémorisé", () => {
  it("rend le même objet d'une frame à l'autre, avec les mêmes valeurs qu'avant", () => {
    const t = { gx: 5, gy: 5, spanX: 1, spanY: 1, type: "house" };
    const rm = carte({ "5,6": {} });
    const a = isoFrontOffset(t, rm), b = isoFrontOffset(t, rm);
    expect(b).toBe(a);
    expect(a.ox).toBe(0);
    expect(a.oy).toBeCloseTo(Math.min(FRONT.push, 0.5 - 0.25 - FRONT.gap), 12);
  });

  it("un poussé changé à la molette, ou une façade recalculée, rendent une valeur neuve", () => {
    const t = { gx: 5, gy: 5, spanX: 1, spanY: 1, type: "house" };
    const rm = carte({ "5,6": {} });
    const a = isoFrontOffset(t, rm);
    FRONT.push = 0.1;
    const b = isoFrontOffset(t, rm);
    expect(b).not.toBe(a);
    expect(b.oy).toBeCloseTo(0.1, 12);
    // __front efface `_front` : la façade se recalcule (ici vers l'est).
    delete t._front;
    const c = isoFrontOffset(t, carte({ "6,5": {} }));
    expect([c.ox, c.oy]).toEqual([0.1, 0]);
  });
});

describe("empreinte à plat mémorisée", () => {
  it("dit la même chose que la regex, et se reteste si l'identifiant change", () => {
    for (const id of ["farm_wheat", "fields", "orchard_x", "CROP", "house", "temple", ""]) {
      expect(isoFlatFootprint({ buildingId: id })).toBe(/field|farm|crop|orchard/i.test(id));
    }
    const t = { buildingId: "farm" };
    expect(isoFlatFootprint(t)).toBe(true);
    t.buildingId = "forge";
    expect(isoFlatFootprint(t)).toBe(false);
    expect(isoFlatFootprint({ variant: "orchard" })).toBe(true);
  });
});
