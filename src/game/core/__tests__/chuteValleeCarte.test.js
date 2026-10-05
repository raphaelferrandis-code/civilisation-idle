"use strict";
// LA MÊME VALLÉE, CARTE BRANCHÉE (docs/PLAN-CHUTE.md). Dans chuteVallee.test.js, le
// relevé du vestige n'est pas branché (layout.js n'est pas chargé) : c'est le seul
// cas où completeCollapse ne trouve pas de fiche de cœur. EN JEU, captureCurrentVestige
// recalcule la ville juste avant — ce qui pose la fiche pour la graine courante : une
// sauvegarde sans fiche (ou avec la fiche d'une autre graine) passe donc dans la vallée
// à sa première chute. Ce test le dit pour que personne ne compte sur le repli.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { state, setState, hydrateState, invalidateRenderCache } from "../state.js";
import { registerChoiceDialog } from "../choiceDialog.js";
import { runCollapseSequence } from "../events.js";
import { setChuteHandlers } from "../../map/cityMapBridge.js";
import "../../map/layout.js";   // branche le relevé du vestige (setCaptureVestigeHandler)
import { D } from "../num.js";
import { MID_GAME_FIXTURE, FIXED_NOW } from "./fixtures.js";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
  setState(hydrateState(MID_GAME_FIXTURE));
  invalidateRenderCache("all");
  state.mapSeed = 12345;
  state.riverWP = null;
  state.cityRoads = null;
});
afterEach(() => {
  setChuteHandlers(null);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("la même vallée, carte branchée", () => {
  it("une sauvegarde sans fiche de cœur pour sa graine passe quand même dans la vallée", async () => {
    state.cityCore = { seed: 999, dx: 0, dy: 0, bx: 0 };
    setChuteHandlers({ fall: () => null, capture: () => true, take: () => null, rise: (f) => f && f(), abort: () => {} });
    const unregister = registerChoiceDialog((dialog) => Promise.resolve(dialog.options[0]));
    const seq = runCollapseSequence(D(100), "manual");
    await vi.advanceTimersByTimeAsync(2000);
    await seq;
    unregister();
    expect(state.mapSeed).toBe(12345);
    expect(state.cityCore && state.cityCore.seed).toBe(12345);
    expect(state.vestiges.length).toBeGreaterThan(0);
  }, 30000);
});
