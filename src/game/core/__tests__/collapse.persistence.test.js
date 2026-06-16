"use strict";
// Garde-fou §1.3 : runCollapseSequence ne doit muter AUCUN état survivant à un
// rechargement AVANT que le joueur ait choisi son épitaphe (await openChoiceDialog).
// Sinon un F5 pendant le deuil/dialogue corromprait la sauvegarde (état à moitié
// effondré). La seule mutation autorisée avant l'await est setMourning(true), que
// hydrateState neutralise (mourning: false) — ce test échoue si une écriture
// persistée NON neutralisée se glisse avant le dialogue.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { state, setState, hydrateState, invalidateRenderCache } from "../state.js";
import { registerChoiceDialog } from "../choiceDialog.js";
import { runCollapseSequence } from "../events.js";
import { D } from "../num.js";
import { MID_GAME_FIXTURE, FIXED_NOW } from "./fixtures.js";

// Image de l'état telle qu'elle serait RECHARGÉE (save → JSON → hydrate, comme un F5).
// On compare cette image (et non le state vivant) car mourning, muté avant le dialogue,
// est volontairement remis à false par hydrateState : c'est précisément l'invariant.
const reloadImage = (s) => JSON.stringify(hydrateState(JSON.parse(JSON.stringify(s))));

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

describe("runCollapseSequence — aucune mutation persistée avant le choix d'épitaphe (§1.3)", () => {
  it("un reload pendant le dialogue redonne exactement l'état pré-effondrement", async () => {
    const beforeCollapse = reloadImage(state);

    let atDialog = null;
    const unregister = registerChoiceDialog((dialog) => {
      // Le dialogue d'épitaphe vient de s'ouvrir : on photographie l'image rechargée.
      atDialog = reloadImage(state);
      expect(dialog.options.length).toBeGreaterThan(0);
      return new Promise(() => {}); // jamais résolu → completeCollapse n'est pas atteint
    });

    // On n'attend pas la séquence : elle reste suspendue sur le dialogue (promesse
    // pendante). Le .catch évite un rejet non géré si elle lançait avant le dialogue.
    runCollapseSequence(D(100), "manual").catch(() => {});
    await vi.advanceTimersByTimeAsync(2000); // passe le deuil (setTimeout) → ouvre le dialogue

    unregister();
    expect(atDialog).not.toBeNull();
    expect(atDialog).toBe(beforeCollapse);
  });
});
