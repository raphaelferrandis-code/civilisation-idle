"use strict";
// LE VŒU DU CYCLE (D2). On teste la logique PURE (forme des vœux, tirage, report,
// multiplicateur conditionnel, latch) sur des états factices. Les vœux de crises
// lisent state.cycleCrisesResolved directement, sans horloge ni ère globales —
// ils servent donc de banc d'essai déterministe pour le latch et l'avancement.

import { describe, it, expect } from "vitest";
import {
  CYCLE_VOWS, vowById, rollCycleVow,
  cycleVowRuinMult, cycleVowStatus, refreshCycleVow, breakCycleVow,
} from "../vows.js";
import { VOW_FAIL_MULT } from "../../core/balance.js";
import { CRISIS_EVENTS } from "../world.js";

const fakeState = (over = {}) => ({ cycleCrisesResolved: 0, cycleVow: null, ...over });

describe("vœux du cycle (D2)", () => {
  it("chaque vœu est bien formé et sa moisson est majorée", () => {
    const ids = new Set();
    for (const v of CYCLE_VOWS) {
      expect(typeof v.id).toBe("string");
      expect(ids.has(v.id)).toBe(false);
      ids.add(v.id);
      expect(v.ruinMult).toBeGreaterThan(1);
      expect(v.name.fr).toBeTruthy();
      expect(v.name.en).toBeTruthy();
      const { target } = v.roll(fakeState());
      expect(Number.isFinite(target)).toBe(true);
      const d = v.describe(target);
      expect(d.fr).toBeTruthy();
      expect(d.en).toBeTruthy();
      // Libellé COURT : la gouttière latérale n'a pas la place du libellé complet.
      const s = v.short(target);
      expect(s.fr).toBeTruthy();
      expect(s.en).toBeTruthy();
      expect(s.fr.length).toBeLessThanOrEqual(12);
    }
  });

  // Un vœu de crises ne peut pas demander plus de crises qu'un cycle n'en offre :
  // chaque palier de CRISIS_EVENTS ne s'ouvre qu'une fois par cycle. « La fermeté »
  // en demandait 4 pour 3 paliers — un vœu impossible, choisi puis jamais tenu.
  it("aucun vœu de crises ne dépasse le nombre de crises d'un cycle", () => {
    for (const v of CYCLE_VOWS.filter((x) => x.family === "crisis")) {
      expect(v.roll(fakeState()).target).toBeLessThanOrEqual(CRISIS_EVENTS.length);
    }
  });

  it("tire jusqu'à trois candidats, aucun prêté au départ", () => {
    const cv = rollCycleVow(fakeState());
    expect(cv.offered.length).toBeGreaterThanOrEqual(2);
    expect(cv.offered.length).toBeLessThanOrEqual(3);
    expect(cv.chosen).toBeNull();
    expect(cv.done).toBe(false);
    for (const o of cv.offered) expect(vowById(o.id)).toBeTruthy();
  });

  it("reconduit le vœu prêté lors d'une chute automatique hors ligne", () => {
    const prev = { offered: [], chosen: { id: "fermete", target: 3, base: 0 }, done: true, broken: true };
    const cv = rollCycleVow(fakeState({ cycleVow: prev }), { reconduct: true });
    expect(cv.chosen.id).toBe("fermete");
    expect(cv.done).toBe(false);
    expect(cv.broken).toBe(false); // nouveau cycle : le vœu repart intact
  });

  it("tenu : la moisson est majorée ; manqué : elle est réduite ; sans vœu : rien", () => {
    const missed = fakeState({ cycleCrisesResolved: 1, cycleVow: { chosen: { id: "fermete", target: 3, base: 0 }, done: false } });
    expect(cycleVowRuinMult(missed)).toBe(VOW_FAIL_MULT);
    const kept = fakeState({ cycleVow: { chosen: { id: "fermete", target: 3, base: 0 }, done: true } });
    expect(cycleVowRuinMult(kept)).toBe(vowById("fermete").ruinMult);
    expect(cycleVowRuinMult(fakeState())).toBe(1); // aucun vœu prêté : gratuit
  });

  it("un objectif atteint juste avant la chute compte (évalué en direct, sans attendre le tick)", () => {
    const s = fakeState({ terminalPreparations: { used: { exodus: true }, riteTier: 2 }, cycleVow: { chosen: { id: "grand_rite", target: 3, base: 0 }, done: false } });
    expect(cycleVowRuinMult(s)).toBe(vowById("grand_rite").ruinMult);
    s.terminalPreparations.riteTier = 1; // rite Drastique : vœu manqué
    expect(cycleVowRuinMult(s)).toBe(VOW_FAIL_MULT);
  });

  it("« aucun X » : tenu tant qu'on ne fait pas X, rompu au premier X", () => {
    const s = fakeState({ cycleVow: { chosen: { id: "sans_reforme", target: 0, base: 0 }, done: false } });
    expect(cycleVowStatus(s).kept).toBe(true);
    expect(breakCycleVow(s, "policy")).toBe(false); // une politique n'est pas une réforme
    expect(breakCycleVow(s, "reform")).toBe(true);
    expect(cycleVowStatus(s).broken).toBe(true);
    expect(cycleVowRuinMult(s)).toBe(VOW_FAIL_MULT);
    expect(breakCycleVow(s, "reform")).toBe(false); // déjà rompu : pas de nouvelle annonce
  });

  it("aucun acte ne rompt un vœu d'objectif", () => {
    const s = fakeState({ cycleVow: { chosen: { id: "fermete", target: 3, base: 0 }, done: false } });
    expect(breakCycleVow(s, "reform")).toBe(false);
    expect(breakCycleVow(s, "policy")).toBe(false);
  });

  it("latche « tenu » dès l'objectif atteint, une seule fois", () => {
    const s = fakeState({
      cycleCrisesProfited: 1,
      cycleVow: { offered: [], chosen: { id: "audace", target: 3, base: 0 }, done: false },
    });
    expect(refreshCycleVow(s)).toBe(null);             // 1 < 3 : pas encore
    expect(cycleVowStatus(s).progress).toBeCloseTo(1 / 3, 5);
    s.cycleCrisesProfited = 3;
    expect(refreshCycleVow(s)).toBe("kept");          // 3 ≥ 3 : latch
    expect(s.cycleVow.done).toBe(true);
    expect(refreshCycleVow(s)).toBe(null);             // déjà tenu : pas de re-latch
  });

  it("un id de vœu inconnu (sauvegarde d'une autre version) se résout en « aucun vœu »", () => {
    const s = fakeState({ cycleVow: { chosen: { id: "__disparu__", target: 1, base: 0 }, done: true } });
    expect(cycleVowRuinMult(s)).toBe(1);
    expect(cycleVowStatus(s)).toBeNull();
  });
});
