"use strict";
// G-25 : la chaîne « tick → crisisOpen (Rupture/Usure = 1) → triggerCollapseChoices »
//        n'était atteinte par AUCUN test (les fixtures restent sous le seuil).
// G-23 : le chemin interactif APRÈS le dialogue d'épitaphe (choix du legs → écriture
//        de state.nextEpitaphLegacy → completeCollapse) n'était pas exercé
//        (collapse.persistence laisse la promesse du dialogue pendante).

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { state, setState, hydrateState, invalidateRenderCache } from "../state.js";
import { registerChoiceDialog } from "../choiceDialog.js";
import { runCollapseSequence } from "../events.js";
import { tick } from "../actions/tick.js";
import { CRISIS_EVENTS } from "../../data/world.js";
import { D } from "../num.js";
import { MID_GAME_FIXTURE, FIXED_NOW } from "./fixtures.js";

// Neutralise les crises NARRATIVES (25/50/75 %) pour isoler le déclencheur terminal :
// tous les seuils déjà marqués → checkCrisisThresholds ne tire rien (ni dialogue).
const markAllThresholds = () =>
  (state.crisisThresholds = Object.fromEntries(CRISIS_EVENTS.map((e) => [e.id, true])));

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

describe("tick → effondrement terminal (G-25)", () => {
  it("déclenche triggerCollapseChoices quand crisisOpen (Usure = 1)", () => {
    markAllThresholds();
    state.timeWear = 1; // crisisOpen() = true ; l'Usure est un cliquet (ne redescend pas dans le tick)
    expect(state.crisisLimitAnnounced).toBeFalsy();
    tick(1);
    expect(state.crisisLimitAnnounced).toBe(true);
  });

  it("ne déclenche PAS sous le seuil (Rupture/Usure < 1)", () => {
    markAllThresholds();
    state.timeWear = 0;
    state.instability = 0.3;
    tick(1);
    expect(state.crisisLimitAnnounced).toBeFalsy();
  });
});

describe("runCollapseSequence — chemin post-épitaphe (G-23)", () => {
  it("choisir un legs écrit state.nextEpitaphLegacy et complète l'effondrement", async () => {
    const cyclesBefore = state.cycles;
    let capturedOptions = null;
    const unregister = registerChoiceDialog((dialog) => {
      capturedOptions = dialog.options;
      return Promise.resolve(dialog.options[0]); // choisit le 1er legs proposé
    });

    const seq = runCollapseSequence(D(100), "manual");
    await vi.advanceTimersByTimeAsync(2000); // passe le deuil (setTimeout) → ouvre + résout le dialogue
    await seq;                                // la séquence va jusqu'au bout (promptActiveRuins early-return)
    unregister();

    expect(capturedOptions).not.toBeNull();
    expect(capturedOptions.length).toBeGreaterThan(0);
    const chosenId = capturedOptions[0].epitaphLegacyId;

    expect(state.nextEpitaphLegacy).toBeTruthy();
    expect(state.nextEpitaphLegacy.id).toBe(chosenId);
    expect(typeof state.nextEpitaphLegacy.cause).toBe("string");
    expect(state.nextEpitaphLegacy.chosenCycle).toBe(cyclesBefore);
    // La séquence s'est terminée proprement (deuil levé).
    expect(state.mourning).toBe(false);
  });
});
