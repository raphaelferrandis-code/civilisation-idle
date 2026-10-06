// L'ÉDIT D'EFFONDREMENT ARRIVE RÉGLÉ SUR « DURÉE » (audit 2026-10-05, BUG-78,
// décision de Raph). Sur « 100 % », un cycle dont la cible de Rupture plafonne
// sous la bascule (0,86–0,99 mesurés) ne tombait jamais : plus de 12 h figé.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { state, setState, hydrateState, invalidateRenderCache, setGamePaused, setCollapseInProgress } from "../state.js";
import { buyUpgrade } from "../actions/building.js";
import { checkNodeAvailability } from "../mechanics/upgrades.js";
import { MID_GAME_FIXTURE, FIXED_NOW } from "./fixtures.js";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
  setGamePaused(false);
  setCollapseInProgress(false);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// Le premier palier de la Cendre (il ouvre celui de l'Édit), de quoi le payer.
function setupBeforeEdict(extra = {}) {
  setState(hydrateState({
    ...MID_GAME_FIXTURE, cycles: 12, ruins: 1e6,
    upgrades: { conseil_de_crise: true, rites_feu_court: true },
    ...extra
  }));
  invalidateRenderCache("all");
}

describe("BUG-78 — l'Édit s'achète avec le déclencheur « Durée »", () => {
  it("l'ancien réglage par défaut (« 100 % ») passe à « Durée » à l'achat", () => {
    setupBeforeEdict();
    expect(state.crisisDoctrine.autoCollapse.trigger).toBe("rupture100");
    expect(checkNodeAvailability("edit_effondrement")).toBe("available");
    expect(buyUpgrade("edit_effondrement")).toBe(true);
    expect(state.crisisDoctrine.autoCollapse.trigger).toBe("temps");
  });

  it("une fois l'Édit possédé, le choix du joueur n'est plus touché", () => {
    setupBeforeEdict({ upgrades: { conseil_de_crise: true, rites_feu_court: true, edit_effondrement: true },
      crisisDoctrine: { autoCollapse: { enabled: true, trigger: "rupture100" } } });
    expect(buyUpgrade("edit_effondrement")).toBe(false); // pas deux fois
    expect(state.crisisDoctrine.autoCollapse.trigger).toBe("rupture100");
  });
});
