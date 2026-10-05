"use strict";
// RECALCULS DE LA VILLE ÉVITABLES (PERF-18, audit du 2026-10-05). Un palier de
// bâtiment passait le throttle comme une ère : une rafale d'automates enchaînait les
// recalculs de 200-300 ms. Et en mode îlots, chaque bascule de bande de crise (qui
// n'y replante que des arbres) relançait tout le plan sur-le-champ.
import { describe, it, expect } from "vitest";
import { layoutRecomputeWait } from "../cityMapRuntime.js";

const shown = (o = {}) => ({ core: "33|4|", group: "g1", crisis: 0, ilot: true, ...o });
const state = (o = {}) => ({ core: "33|4|", group: "g1", crisis: 0, ...o });

describe("throttle du plan de la ville", () => {
  it("sans plan affiché : tout de suite", () => {
    expect(layoutRecomputeWait(null, state(), 0).wait).toBe(false);
  });

  it("un palier de bâtiment attend 2,5 s depuis le recalcul précédent, pas plus", () => {
    const next = state({ group: "g2" });
    expect(layoutRecomputeWait(shown(), next, 400)).toMatchObject({ wait: true, group: true, core: false });
    expect(layoutRecomputeWait(shown(), next, 2000).wait).toBe(true);     // passait à 1,5 s avant
    expect(layoutRecomputeWait(shown(), next, 2600).wait).toBe(false);
  });

  it("ère, cycle et merveille restent immédiats, même pendant une rafale", () => {
    for (const core of ["34|4|", "33|5|", "33|4|era_mega:1"]) {
      expect(layoutRecomputeWait(shown(), state({ core, group: "g2" }), 10).wait).toBe(false);
    }
  });

  it("la bande de crise : groupée en mode îlots, immédiate hors îlots", () => {
    expect(layoutRecomputeWait(shown({ ilot: true }), state({ crisis: 2 }), 300).wait).toBe(true);
    expect(layoutRecomputeWait(shown({ ilot: true }), state({ crisis: 2 }), 1600).wait).toBe(false);
    expect(layoutRecomputeWait(shown({ ilot: false }), state({ crisis: 2 }), 300).wait).toBe(false);
  });

  it("le reste (routes) garde son 1,5 s", () => {
    expect(layoutRecomputeWait(shown(), state(), 1000).wait).toBe(true);
    expect(layoutRecomputeWait(shown(), state(), 1600).wait).toBe(false);
  });
});
