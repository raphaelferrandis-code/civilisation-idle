import { describe, it, expect } from "vitest";
import { decideTickCredit } from "../offlineCredit.js";
import { state, setState, hydrateState, save } from "../state.js";
import { applyOfflineProgress } from "../main.js";

// M16/M17 de l'audit 2026-07-21 : le temps hors-ligne (onglet caché, veille PC)
// était quasi perdu. Le cœur du correctif est double : la DÉCISION par tick
// (decideTickCredit) et la DISCIPLINE d'ancre (lastTick posé au crédit, plus par
// save()) — les deux garantissent qu'aucune seconde n'est ni perdue ni comptée deux fois.

describe("decideTickCredit — régime de crédit d'un tick", () => {
  it("onglet caché → skip (le retour créditera toute l'absence d'un coup)", () => {
    expect(decideTickCredit(1, true)).toEqual({ mode: "skip", seconds: 0 });
    expect(decideTickCredit(3600, true)).toEqual({ mode: "skip", seconds: 0 });
  });

  it("jeu normal (petit écart, visible) → live borné à 1 s", () => {
    expect(decideTickCredit(1, false)).toEqual({ mode: "live", seconds: 1 });
    expect(decideTickCredit(0.5, false)).toEqual({ mode: "live", seconds: 0.5 });
    expect(decideTickCredit(8, false)).toEqual({ mode: "live", seconds: 1 }); // clamp
  });

  it("écart mural anormal ET visible (veille / gel) → offline avec l'écart réel", () => {
    expect(decideTickCredit(3600, false)).toEqual({ mode: "offline", seconds: 3600 });
    expect(decideTickCredit(10.5, false)).toEqual({ mode: "offline", seconds: 10.5 });
    expect(decideTickCredit(10, false)).toEqual({ mode: "live", seconds: 1 }); // pile au seuil = live
  });
});

describe("discipline de lastTick (anti perte / anti double-comptage)", () => {
  it("applyOfflineProgress recale lastTick à ~maintenant (sinon re-crédit au calcul suivant)", () => {
    setState(hydrateState({}));
    state.lastTick = Date.now() - 3600 * 1000; // 1 h d'absence
    applyOfflineProgress(3600);
    expect(Date.now() - state.lastTick).toBeLessThan(2000); // recalé sur l'instant
  });

  it("save() ne touche PLUS lastTick (sinon l'auto-save d'un onglet caché masque l'absence — M16)", () => {
    setState(hydrateState({}));
    const frozen = Date.now() - 12345;
    state.lastTick = frozen;
    save();
    expect(state.lastTick).toBe(frozen);
  });
});
