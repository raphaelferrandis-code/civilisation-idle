"use strict";
// BILAN DE FIN DE CYCLE (D9). Deux invariants, tous deux faciles à casser :
//   - `prevCycle` doit survivre au rechargement, sinon l'écart avec le cycle
//     précédent est inaffichable au premier cycle qui suit un F5 ;
//   - `lastCycleReport` ne doit JAMAIS survivre au rechargement, sinon un F5
//     rejoue l'annonce d'une chute déjà passée à l'écran.

import { describe, it, expect } from "vitest";

import { defaultState, hydrateState, normalizePrevCycle } from "../state.js";

const roundTrip = (s) => hydrateState(JSON.parse(JSON.stringify(s)));

describe("prevCycle — le bilan du cycle précédent traverse la sauvegarde", () => {
  it("est nul sur une partie neuve", () => {
    expect(defaultState().prevCycle).toBeNull();
  });

  it("survit à un rechargement", () => {
    const s = defaultState();
    s.prevCycle = { cycleSec: 842.5, ruinGain: "1.5e21", peakPop: "3.2e9", cause: "famine" };
    expect(roundTrip(s).prevCycle).toEqual(s.prevCycle);
  });

  it("les montants restent des CHAÎNES : ce bilan s'affiche, il ne se calcule pas", () => {
    const s = defaultState();
    s.prevCycle = { cycleSec: 10, ruinGain: "1e300", peakPop: "1e40", cause: "time" };
    const back = roundTrip(s).prevCycle;
    expect(typeof back.ruinGain).toBe("string");
    expect(back.ruinGain).toBe("1e300");
  });

  it("un bilan corrompu ne casse pas l'hydratation", () => {
    expect(normalizePrevCycle(undefined)).toBeNull();
    expect(normalizePrevCycle("nope")).toBeNull();
    const bad = normalizePrevCycle({ cycleSec: NaN, ruinGain: 42, peakPop: null, cause: 7 });
    expect(bad.cycleSec).toBe(0);
    expect(bad.ruinGain).toBe("0");
    expect(bad.peakPop).toBe("0");
    expect(bad.cause).toBe("");
  });
});

describe("lastCycleReport — une annonce ne se rejoue pas", () => {
  it("est nul sur une partie neuve", () => {
    expect(defaultState().lastCycleReport).toBeNull();
  });

  it("est REMIS À NULL au rechargement, même s'il figurait dans la sauvegarde", () => {
    const s = defaultState();
    s.lastCycleReport = { year: 120, dynasty: "Atrides", cause: "famine", peakPop: "1e6", cycleSec: 300, ruinGain: "1e9" };
    expect(roundTrip(s).lastCycleReport).toBeNull();
  });
});
