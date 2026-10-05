"use strict";
// MOISSON VERSÉE À LA CHUTE (audit du 05/10, BUG-33).
//
// La composition « ruinGain × Rite de Passage × legs × vœu » était recopiée à
// quatre endroits (stèle, Édit/testament, farm hors ligne), et la ligne du
// Journal annonçait le gain BRUT : avec le Rite et le Pillage, « un linceul de
// 100 ruines » pour 156 versées. collapseHarvest est la source unique ; la
// ligne du Journal lit le crédit réel.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { state, setState, hydrateState, invalidateRenderCache } from "../state.js";
import { registerChoiceDialog } from "../choiceDialog.js";
import { runCollapseSequence, collapseCause } from "../events.js";
import { collapseHarvest, collapseHarvestBase } from "../mechanics/collapseHarvest.js";
import { EPITAPH_LEGACIES, epitaphLegacyById, epitaphRuinMultiplier } from "../../data/epitaphs.js";
import { cycleVowRuinMult } from "../../data/vows.js";
import { fmt } from "../utils.js";
import { D } from "../num.js";
import { MID_GAME_FIXTURE, FIXED_NOW } from "./fixtures.js";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
  setState(hydrateState(MID_GAME_FIXTURE));
  invalidateRenderCache("all");
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("collapseHarvest — rite × legs × vœu", () => {
  it("sans rite ni legs, la moisson est le gain (au vœu près)", () => {
    expect(collapseHarvestBase(D(100)).eq(100)).toBe(true);
    expect(collapseHarvest(D(100), null, "rupture").eq(D(100).mul(cycleVowRuinMult(state)).round())).toBe(true);
  });

  it("le Rite de Passage (+25 %) puis le legs s'appliquent, arrondis comme avant", () => {
    state.upgrades.rituel_effondrement = true;
    invalidateRenderCache("all");
    expect(collapseHarvestBase(D(100)).eq(125)).toBe(true);
    const pillage = epitaphLegacyById("plunder");
    const attendu = D(125).mul(epitaphRuinMultiplier(pillage, "rupture")).mul(cycleVowRuinMult(state)).round();
    expect(collapseHarvest(D(100), pillage, "rupture").eq(attendu)).toBe(true);
  });

  it("un gain négatif ou fractionnaire est borné et arrondi par le bas", () => {
    expect(collapseHarvestBase(D(-5)).eq(0)).toBe(true);
    expect(collapseHarvestBase(D(9.9)).eq(9)).toBe(true);
  });
});

describe("chute — la stèle, le crédit et le Journal disent le même chiffre", () => {
  it("chaque option de la stèle vaut collapseHarvest, et le crédit est l'option choisie", async () => {
    state.upgrades.rituel_effondrement = true;
    invalidateRenderCache("all");
    let options = null;
    const unregister = registerChoiceDialog((dialog) => {
      options = dialog.options;
      return Promise.resolve(dialog.options.find((o) => o.epitaphLegacyId === "plunder"));
    });
    const cause = collapseCause();
    const seq = runCollapseSequence(D(100), "manual");
    await vi.advanceTimersByTimeAsync(2000);
    await seq;
    unregister();

    expect(options).not.toBeNull();
    for (const option of options) {
      const legacy = EPITAPH_LEGACIES.find((l) => l.id === option.epitaphLegacyId);
      expect(D(option.ruinGain).eq(collapseHarvest(D(100), legacy, cause)), option.epitaphLegacyId).toBe(true);
    }
    const choisie = options.find((o) => o.epitaphLegacyId === "plunder");
    expect(D(state.prevCycle.ruinGain).eq(choisie.ruinGain)).toBe(true);
  });

  it("la ligne du Journal annonce la moisson CRÉDITÉE, pas le gain brut", async () => {
    state.upgrades.rituel_effondrement = true;
    state.testamentLegacyId = "plunder"; // testament gravé : pas de stèle
    invalidateRenderCache("all");
    const seq = runCollapseSequence(D(100), "manual");
    await vi.advanceTimersByTimeAsync(2000);
    await seq;

    const credite = D(state.prevCycle.ruinGain);
    expect(credite.gt(100), "le Rite et le Pillage majorent la moisson").toBe(true);
    const ligne = (state.history || []).find((l) => l.includes("linceul"));
    expect(ligne, "la ligne d'effondrement doit être écrite").toBeTruthy();
    expect(ligne).toContain(`linceul de ${fmt(credite)} ruines`);
    expect(ligne).not.toContain("linceul de 100 ruines");
  });
});
