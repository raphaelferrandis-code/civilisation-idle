import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderToString } from "react-dom/server";

// useGameState s'appuie sur useSyncExternalStore sans instantané serveur : pour
// le rendu SSR du test, il lit simplement l'état courant.
vi.mock("../../../hooks/useGameState.js", async () => {
  const { state } = await import("../../../game/core/state.js");
  return { useGameState: (selector) => selector(state), shallowEqual: Object.is };
});

import TestamentSeals from "../TestamentSeals.jsx";
import PrestigeView from "../../views/PrestigeView.jsx";
import * as stateModule from "../../../game/core/state.js";
import { collapseCause } from "../../../game/core/events.js";
import { MID_GAME_FIXTURE, FIXED_NOW } from "../../../game/core/__tests__/fixtures.js";

// « Choisir sa chute » (Lot 2) : rendu SSR de ce que le joueur lit sur la page
// Effondrement — la chute annoncée et les legs (Testament), et la chute que
// DÉCLARE chaque édit. Garde née d'une séance où aucun serveur de dev n'était
// disponible pour vérifier à l'œil.

const { state, setState, hydrateState, invalidateRenderCache } = stateModule;
const clean = (html) => html.replace(/<!-- -->/g, "");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
  setState(hydrateState(MID_GAME_FIXTURE));
  invalidateRenderCache("all");
});
afterEach(() => { vi.useRealTimers(); });

describe("Testament — legs sur un foyer, pour tout le cycle", () => {
  it("annonce la chute et détaille le legs gravé par ses foyers", () => {
    state.testamentLegacyId = "granaries";
    const html = clean(renderToString(<TestamentSeals />));
    expect(html).toMatch(/Chute annoncée|Foretold fall/);
    expect(html).toMatch(/Subsistance|Subsistence/);
    expect(html).not.toMatch(/\d+ min/); // plus de durée en minutes
  });

  it("le Pillage annonce sa dette d'Inégalités", () => {
    state.testamentLegacyId = "plunder";
    const html = clean(renderToString(<TestamentSeals />));
    expect(html).toMatch(/(Inégalités|Inequality) \+6%/);
  });
});

describe("page Effondrement en crise — chaque édit déclare sa chute", () => {
  it("les trois édits disent la chute qu'ils déclarent", () => {
    state.instability = 1;
    state.crisisLimitAnnounced = true;
    state.crisisOpenedAt = FIXED_NOW;
    invalidateRenderCache("all");
    const html = clean(renderToString(<PrestigeView />));
    const declared = html.match(/edict-cause[^>]*>[^<]+/g) || [];
    expect(declared.length).toBe(3);
    expect(declared.join(" | ")).toMatch(/famine/);
    expect(declared.join(" | ")).toMatch(/usure du temps/);
    expect(declared.join(" | ")).toMatch(/rupture/);
  });

  it("sceller un édit change la chute annoncée", () => {
    state.declaredFallCause = "time";
    expect(collapseCause()).toBe("time");
    state.declaredFallCause = null;
    expect(collapseCause()).not.toBe(undefined);
  });
});
