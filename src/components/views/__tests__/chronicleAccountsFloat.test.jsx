import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderToString } from "react-dom/server";

// useGameState s'appuie sur useSyncExternalStore sans instantané serveur : pour
// le rendu SSR du test, il lit simplement l'état courant.
vi.mock("../../../hooks/useGameState.js", async () => {
  const { state } = await import("../../../game/core/state.js");
  return { useGameState: (selector) => selector(state), shallowEqual: Object.is };
});

import ChronicleView from "../ChronicleView.jsx";
import * as stateModule from "../../../game/core/state.js";
import { Decimal } from "../../../game/core/num.js";
import { MID_GAME_FIXTURE, FIXED_NOW } from "../../../game/core/__tests__/fixtures.js";

// « Les Comptes de la cité » au-delà du float (audit du 05/10, BUG-37) : le
// débit de Nourriture dépassait 1,8e308, tout passait en « dégradé » et l'écran
// disait « Aucune production ». Au-delà, les Comptes rendent des Decimal : le
// rendu ne doit ni lever (piège de coercition de num.js en dev) ni mentir.

const { state, setState, hydrateState, invalidateRenderCache } = stateModule;
const clean = (html) => html.replace(/<!-- -->/g, "");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
  setState(hydrateState(MID_GAME_FIXTURE));
  invalidateRenderCache("all");
});
afterEach(() => { vi.useRealTimers(); });

describe("Chronique — les Comptes de la cité au-delà du float", () => {
  it("un débit de Nourriture > 1,8e308 se répartit au lieu d'afficher « Aucune production »", () => {
    state.ruins = new Decimal("1e1000"); // Nourriture ≈ 2e312/s (racine du multiplicateur)
    invalidateRenderCache("all");
    const html = clean(renderToString(<ChronicleView />));
    expect(html).toMatch(/Les Comptes de la cité|The City Accounts/);
    expect(html).not.toMatch(/Aucune production de|No .* production right now/);
    // Le total s'écrit en notation scientifique (fmt sur un Decimal), pas « — ».
    expect(html).toMatch(/compte-row--total[\s\S]*?e31\d/);
  });
});
