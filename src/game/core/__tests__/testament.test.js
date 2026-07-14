"use strict";
// Testament (arbitrages 2026-07-13) :
//  - EFFONDREMENT SILENCIEUX : avec un testament gravé, NI l'Édit (auto) NI le
//    HOLD (manuel) n'ouvrent de dialogue — le testament est gravé directement,
//    avec le multiplicateur de ruines du legs. L'auto sans testament répète la
//    dernière volonté ; le manuel sans testament ouvre la stèle (seul cas où le
//    choix reste à faire).
//  - PERSISTANCE : testamentLegacyId n'accepte que des ids valides à
//    l'hydratation et survit aux effondrements (permanent jusqu'à changement).

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { state, setState, hydrateState, invalidateRenderCache } from "../state.js";
import { registerChoiceDialog } from "../choiceDialog.js";
import { runCollapseSequence } from "../events.js";
import { D } from "../num.js";
import { toNum } from "../num.js";
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

// Déroule la séquence complète (deuil de 2 s compris) en refusant tout dialogue :
// le harnais échoue si la branche auto tente d'en ouvrir un.
async function runAutoCollapse(gain) {
  let dialogRequested = false;
  const unregister = registerChoiceDialog(() => {
    dialogRequested = true;
    return new Promise(() => {});
  });
  const seq = runCollapseSequence(D(gain), "auto_collapse");
  await vi.advanceTimersByTimeAsync(2000);
  await seq;
  unregister();
  return dialogRequested;
}

describe("hydratation — testamentLegacyId", () => {
  it("garde un id valide, rejette un id inconnu ou absent", () => {
    expect(hydrateState({ testamentLegacyId: "laws" }).testamentLegacyId).toBe("laws");
    expect(hydrateState({ testamentLegacyId: "n_existe_pas" }).testamentLegacyId).toBeNull();
    expect(hydrateState({}).testamentLegacyId).toBeNull();
  });
});

describe("runCollapseSequence auto_collapse — grave sans modale", () => {
  it("testament gravé : aucun dialogue, ×0.85 appliqué (Lois), legs actif, testament conservé", async () => {
    state.testamentLegacyId = "laws"; // ruinMult 0.85, jamais favorisé côté ruines
    const ruinsBefore = toNum(state.ruins);

    const dialogRequested = await runAutoCollapse(1000);

    expect(dialogRequested).toBe(false);
    expect(toNum(state.ruins) - ruinsBefore).toBe(850);
    expect(state.activeEpitaphLegacy?.id).toBe("laws");
    expect(["famine", "time", "rupture", "avarice"]).toContain(state.activeEpitaphLegacy.cause);
    expect(state.testamentLegacyId).toBe("laws"); // permanent de cycle en cycle
    expect(state.mourning).toBe(false);
    // Le Journal d'effondrement nomme le legs gravé (lot D).
    expect((state.history || []).some((line) => line.includes("Legs gravé : les Lois"))).toBe(true);
  });

  it("sans testament : répète la dernière volonté (×0.9 pour les Granges)", async () => {
    state.testamentLegacyId = null;
    state.nextEpitaphLegacy = { id: "granaries", cause: "rupture", chosenCycle: 3, startedAt: FIXED_NOW - 1000 };
    const ruinsBefore = toNum(state.ruins);

    const dialogRequested = await runAutoCollapse(1000);

    expect(dialogRequested).toBe(false);
    expect(toNum(state.ruins) - ruinsBefore).toBe(900);
    expect(state.activeEpitaphLegacy?.id).toBe("granaries");
  });

  it("ni testament ni dernière volonté : gain plein, aucun legs gravé", async () => {
    state.testamentLegacyId = null;
    state.nextEpitaphLegacy = null;
    const ruinsBefore = toNum(state.ruins);

    const dialogRequested = await runAutoCollapse(1000);

    expect(dialogRequested).toBe(false);
    expect(toNum(state.ruins) - ruinsBefore).toBe(1000);
    expect(state.activeEpitaphLegacy).toBeNull();
  });
});

describe("runCollapseSequence manuel — la stèle seulement sans testament", () => {
  it("HOLD avec testament : aucune modale, le testament est gravé directement", async () => {
    state.testamentLegacyId = "laws";
    const ruinsBefore = toNum(state.ruins);
    let dialogRequested = false;
    const unregister = registerChoiceDialog(() => {
      dialogRequested = true;
      return new Promise(() => {});
    });

    const seq = runCollapseSequence(D(1000), "manual");
    await vi.advanceTimersByTimeAsync(2000);
    await seq;
    unregister();

    expect(dialogRequested).toBe(false);
    expect(toNum(state.ruins) - ruinsBefore).toBe(850); // ×0.85 (Lois)
    expect(state.activeEpitaphLegacy?.id).toBe("laws");
    expect(state.testamentLegacyId).toBe("laws"); // permanent
    expect(state.mourning).toBe(false);
    // Trace côté joueur : le Journal nomme l'acte, au registre du manuel.
    expect((state.history || []).some((line) => line.includes("honorent le testament"))).toBe(true);
  });

  it("structure de la stèle (sans testament) : deux temporalités, bilan, dernière volonté marquée", async () => {
    state.testamentLegacyId = null;
    state.nextEpitaphLegacy = { id: "laws", cause: "rupture", chosenCycle: 3, startedAt: FIXED_NOW - 1000 };
    let captured = null;
    const unregister = registerChoiceDialog((dialog) => {
      captured = dialog;
      return Promise.resolve(dialog.options[0]);
    });

    const seq = runCollapseSequence(D(100), "manual");
    await vi.advanceTimersByTimeAsync(2000);
    await seq;
    unregister();

    // Sans testament, la stèle s'ouvre bel et bien.
    expect(captured).not.toBeNull();
    // Bilan gravé sous l'épitaphe : an + âge + pic de population.
    expect(captured.inscription).toContain("An ");
    expect(captured.inscription).toContain("pic ");
    // Chaque carte oppose « Maintenant » (ruines) à « Prochain cycle » (legs).
    for (const option of captured.options) {
      expect(option.rowLabelNow).toBeTruthy();
      expect(option.rowLabelNext).toBeTruthy();
    }
    // La dernière volonté (Lois) est marquée ↺.
    const lastWillFlags = captured.options.filter((o) => o.lastWill);
    expect(lastWillFlags).toHaveLength(1);
    expect(lastWillFlags[0].epitaphLegacyId).toBe("laws");
  });
});
