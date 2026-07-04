import { describe, it, expect } from "vitest";

import { buildNecropolis } from "../necropolis.js";

const TILE = 32;
// Ville vivante : core à (30,25) → coreWx = 960 ; rayon urbain = sqrt(400) = 20 tuiles.
const layout = { plan: { core: { x: 30, y: 25 } }, cx: 30, cy: 25, gridN: 60, maxD2: 400 };
const coreWx = 30 * TILE; // 960

const rec = (mapSeed, radius, extra = {}) => ({ mapSeed, eraBand: 2, eraIndex: 8, footprint: { radius }, ...extra });

describe("buildNecropolis — ancrage ouest déterministe", () => {
  it("aucun vestige → absente", () => {
    expect(buildNecropolis({ vestiges: [] }, layout, TILE).present).toBe(false);
    expect(buildNecropolis({}, layout, TILE).present).toBe(false);
    expect(buildNecropolis({ vestiges: [rec(1, 10)] }, null, TILE).present).toBe(false);
  });

  it("une tombe : à l'ouest du core, taille bornée dérivée du rayon", () => {
    const r = buildNecropolis({ vestiges: [rec(111, 10)] }, layout, TILE);
    expect(r.present).toBe(true);
    expect(r.tombs.length).toBe(1);
    const t = r.tombs[0];
    expect(t.halfTiles).toBe(6);            // clamp(round(10*0.6), 3, 14) = 6
    expect(t.bbox.x1).toBeLessThan(coreWx); // entièrement à l'ouest de la ville
    expect(t.recent).toBe(true);
  });

  it("taille bornée : campement mini, mégalopole maxi", () => {
    const small = buildNecropolis({ vestiges: [rec(1, 2)] }, layout, TILE).tombs[0];
    const huge = buildNecropolis({ vestiges: [rec(1, 100)] }, layout, TILE).tombs[0];
    expect(small.halfTiles).toBe(3);   // min
    expect(huge.halfTiles).toBe(14);   // max
  });

  it("trois civs : juxtaposées vers l'ouest, récente au plus près, sans chevauchement", () => {
    // index 0 = plus ancienne, 2 = plus récente
    const vestiges = [rec(1, 8), rec(2, 20), rec(3, 5)];
    const r = buildNecropolis({ vestiges }, layout, TILE);
    expect(r.tombs.length).toBe(3);
    // tombs[0] = la plus récente (posée en premier, la plus à l'est) ; tombs[2] = la plus ancienne (à l'ouest)
    expect(r.tombs[0].record.mapSeed).toBe(3);
    expect(r.tombs[2].record.mapSeed).toBe(1);
    // centres décroissants vers l'ouest
    expect(r.tombs[0].centerWx).toBeGreaterThan(r.tombs[1].centerWx);
    expect(r.tombs[1].centerWx).toBeGreaterThan(r.tombs[2].centerWx);
    // pas de chevauchement : le bord OUEST d'une tombe est à l'ouest du bord EST de la suivante
    expect(r.tombs[0].bbox.x0).toBeGreaterThan(r.tombs[1].bbox.x1);
    expect(r.tombs[1].bbox.x0).toBeGreaterThan(r.tombs[2].bbox.x1);
    // toutes à l'ouest de la ville
    for (const t of r.tombs) expect(t.bbox.x1).toBeLessThan(coreWx);
    // bbox globale à l'ouest du core
    expect(r.bboxWorld.x1).toBeLessThan(coreWx);
  });

  it("déterministe : même entrée → sortie identique", () => {
    const vestiges = [rec(7, 12), rec(9, 18)];
    const a = buildNecropolis({ vestiges }, layout, TILE);
    const b = buildNecropolis({ vestiges }, layout, TILE);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    // jitter vertical seedé → pas parfaitement aligné sur core.y, mais stable
    expect(a.tombs[0].centerWy).toBe(b.tombs[0].centerWy);
  });
});
