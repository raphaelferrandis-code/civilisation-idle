"use strict";
// LE VŒU DU CYCLE (D2). On teste la logique PURE (forme des vœux, tirage, report,
// multiplicateur conditionnel, latch) sur des états factices. Les vœux de crises
// lisent state.cycleCrisesResolved directement, sans horloge ni ère globales —
// ils servent donc de banc d'essai déterministe pour le latch et l'avancement.

import { describe, it, expect } from "vitest";
import {
  CYCLE_VOWS, vowById, rollCycleVow,
  cycleVowRuinMult, cycleVowStatus, refreshCycleVowDone,
} from "../vows.js";

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

  it("tire jusqu'à trois candidats, aucun prêté au départ", () => {
    const cv = rollCycleVow(fakeState());
    expect(cv.offered.length).toBeGreaterThanOrEqual(2);
    expect(cv.offered.length).toBeLessThanOrEqual(3);
    expect(cv.chosen).toBeNull();
    expect(cv.done).toBe(false);
    for (const o of cv.offered) expect(vowById(o.id)).toBeTruthy();
  });

  it("reconduit le vœu prêté lors d'une chute automatique hors ligne", () => {
    const prev = { offered: [], chosen: { id: "vigilance", target: 2, base: 0 }, done: true };
    const cv = rollCycleVow(fakeState({ cycleVow: prev }), { reconduct: true });
    expect(cv.chosen.id).toBe("vigilance");
    expect(cv.done).toBe(false);
  });

  it("le multiplicateur ne s'applique QUE si le vœu est tenu", () => {
    const notDone = fakeState({ cycleVow: { chosen: { id: "fermete", target: 4, base: 0 }, done: false } });
    expect(cycleVowRuinMult(notDone)).toBe(1);
    const done = fakeState({ cycleVow: { chosen: { id: "fermete", target: 4, base: 0 }, done: true } });
    expect(cycleVowRuinMult(done)).toBe(vowById("fermete").ruinMult);
    expect(cycleVowRuinMult(fakeState())).toBe(1); // aucun vœu prêté
  });

  it("latche « tenu » dès l'objectif atteint, une seule fois", () => {
    const s = fakeState({
      cycleCrisesResolved: 1,
      cycleVow: { offered: [], chosen: { id: "vigilance", target: 2, base: 0 }, done: false },
    });
    expect(refreshCycleVowDone(s)).toBe(false);        // 1 < 2 : pas encore
    expect(cycleVowStatus(s).progress).toBeCloseTo(0.5, 5);
    s.cycleCrisesResolved = 2;
    expect(refreshCycleVowDone(s)).toBe(true);          // 2 ≥ 2 : latch
    expect(s.cycleVow.done).toBe(true);
    expect(refreshCycleVowDone(s)).toBe(false);         // déjà tenu : pas de re-latch
  });

  it("un id de vœu inconnu (sauvegarde d'une autre version) se résout en « aucun vœu »", () => {
    const s = fakeState({ cycleVow: { chosen: { id: "__disparu__", target: 1, base: 0 }, done: true } });
    expect(cycleVowRuinMult(s)).toBe(1);
    expect(cycleVowStatus(s)).toBeNull();
  });
});
