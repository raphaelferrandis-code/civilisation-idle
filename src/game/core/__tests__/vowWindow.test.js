"use strict";
// Revue du 2026-10-04 — quatre trous dans les vœux et les rites de la chute :
//  1. le vœu se « prêtait » quand l'objectif était déjà atteint (an 60, 3 crises) ;
//  2. les vœux de durée vieillissaient pendant la crise terminale gelée ;
//  3. une chute simulée hors ligne reconduisait un vœu de crises/de rite
//     impossible à tenir (×VOW_FAIL_MULT à chaque chute) ;
//  4. une crise terminale fermée puis rouverte offrait un second rite.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as stateModule from "../state.js";
import { chooseCycleVow } from "../main.js";
import { runTerminalCrisisAction, triggerCollapseChoices, resumeAfterCrisisOutcome } from "../actions/crisis.js";
import { terminalRiteSealed } from "../mechanics.js";
import { cycleVowStatus, cycleVowChoosable, rollCycleVow, VOW_CHOICE_WINDOW_YEARS } from "../../data/vows.js";
import { D } from "../num.js";
import { MID_GAME_FIXTURE, FIXED_NOW } from "./fixtures.js";

const { state, setState, hydrateState, invalidateRenderCache, setGamePaused } = stateModule;
const MIN = 60 * 1000;
const offer = (ids) => ({ offered: ids.map((id) => ({ id, target: id === "veille" ? 60 : 3, base: 0 })), chosen: null, done: false, broken: false });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
  setState(hydrateState(MID_GAME_FIXTURE));
  setGamePaused(false);
  state.food = D(1e15); state.gold = D(1e15); state.knowledge = D(1e15);
  state.crisisThresholds = {};
  state.crisisLimitAnnounced = false;
  state.crisisOpenedAt = null;
  state.cycleStartedAt = FIXED_NOW;
  invalidateRenderCache("all");
});
afterEach(() => { vi.useRealTimers(); });

describe("la fenêtre du choix du vœu", () => {
  it("se prête au début du cycle", () => {
    state.cycleVow = offer(["veille", "fermete"]);
    state.cycleStartedAt = FIXED_NOW - 3 * MIN; // an 4
    expect(cycleVowChoosable(state)).toBe(true);
    expect(chooseCycleVow("veille")).toBe(true);
    expect(state.cycleVow.chosen.id).toBe("veille");
  });

  it("se ferme passé l'an VOW_CHOICE_WINDOW_YEARS", () => {
    state.cycleVow = offer(["veille", "fermete"]);
    state.cycleStartedAt = FIXED_NOW - 61 * MIN; // an 62 : « La veille » déjà tenue
    expect(cycleVowChoosable(state)).toBe(false);
    expect(chooseCycleVow("veille")).toBe(false);
    expect(state.cycleVow.chosen).toBeNull();
    state.cycleStartedAt = FIXED_NOW - VOW_CHOICE_WINDOW_YEARS * MIN; // an WINDOW + 1
    expect(cycleVowChoosable(state)).toBe(false);
  });

  it("se ferme dès le premier palier de crise franchi, et en crise terminale", () => {
    state.cycleVow = offer(["fermete"]);
    state.crisisThresholds = { _25: true };
    expect(chooseCycleVow("fermete")).toBe(false);
    state.crisisThresholds = {};
    state.crisisLimitAnnounced = true;
    state.crisisOpenedAt = FIXED_NOW;
    expect(chooseCycleVow("fermete")).toBe(false);
    expect(state.cycleVow.chosen).toBeNull();
  });
});

describe("les vœux de durée sur l'horloge figée", () => {
  it("la cité gelée en crise terminale ne vieillit pas", () => {
    state.cycleStartedAt = FIXED_NOW - 40 * MIN; // an 41
    state.cycleVow = { offered: [], chosen: { id: "grand_age", target: 180, base: 0 }, done: false, broken: false };
    state.crisisLimitAnnounced = true;
    state.crisisOpenedAt = FIXED_NOW;
    vi.setSystemTime(FIXED_NOW + 150 * MIN); // 2 h 30 devant l'autel / jeu fermé
    const st = cycleVowStatus(state);
    expect(st.cur).toBe(41);
    expect(st.kept).toBe(false);
  });

  it("« Le feu court » ne se rompt pas pendant qu'on délibère", () => {
    state.cycleStartedAt = FIXED_NOW - 12 * MIN; // an 13
    state.cycleVow = { offered: [], chosen: { id: "feu_court", target: 15, base: 0 }, done: false, broken: false };
    state.crisisLimitAnnounced = true;
    state.crisisOpenedAt = FIXED_NOW;
    vi.setSystemTime(FIXED_NOW + 10 * MIN);
    expect(cycleVowStatus(state).broken).toBe(false);
  });
});

describe("chute simulée hors ligne", () => {
  const prev = (id) => ({ cycleVow: { offered: [], chosen: { id, target: 3, base: 0 }, done: false, broken: false } });

  it("ne reconduit pas un vœu de crises ou de rite qu'elle ne peut pas tenir", () => {
    for (const id of ["fermete", "audace", "grand_rite"]) {
      const cv = rollCycleVow(prev(id), { reconduct: true, offline: true });
      expect(cv.chosen).toBeNull();
    }
  });

  it("reconduit les autres, et tous en ligne", () => {
    expect(rollCycleVow({ ...prev("veille"), cycleStartedAt: Date.now() }, { reconduct: true, offline: true }).chosen.id).toBe("veille");
    expect(rollCycleVow(prev("fermete"), { reconduct: true, offline: false }).chosen.id).toBe("fermete");
  });
});

describe("un rite par chute", () => {
  it("une crise terminale rouverte dans le même cycle n'offre pas un second rite", () => {
    state.instability = 1;
    state.terminalPreparations = { used: {}, riteTier: -1 };
    triggerCollapseChoices(false);
    runTerminalCrisisAction("exodus", 0);
    expect(terminalRiteSealed()).toBe(true);
    const prep = state.collapsePreparation;
    // Le Rationnement forcé de l'Édit (« préparer ») ferme la crise, la jauge remonte.
    resumeAfterCrisisOutcome();
    triggerCollapseChoices(false);
    expect(terminalRiteSealed()).toBe(true);
    runTerminalCrisisAction("exodus", 0);
    expect(state.collapsePreparation).toBe(prep);
  });

  it("le palier retenu pour « Le grand rite » est le plus haut accompli", () => {
    state.terminalPreparations = { used: {}, riteTier: 2 };
    state.instability = 1;
    triggerCollapseChoices(false);
    // Un rite plus modeste (si le moteur le permettait) n'efface pas le Total.
    state.terminalPreparations.used = {};
    runTerminalCrisisAction("exodus", 0);
    expect(state.terminalPreparations.riteTier).toBe(2);
  });
});
