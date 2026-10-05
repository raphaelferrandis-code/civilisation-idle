import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderToString } from "react-dom/server";

// useGameState s'appuie sur useSyncExternalStore sans instantané serveur : pour
// le rendu SSR du test, il lit simplement l'état courant.
vi.mock("../../../hooks/useGameState.js", async () => {
  const { state } = await import("../../../game/core/state.js");
  return { useGameState: (selector) => selector(state), shallowEqual: Object.is };
});

import CityStatusPanel from "../CityStatusPanel.jsx";
import { state, setState, defaultState, invalidateRenderCache, renderCache } from "../../../game/core/state.js";

// BUG-51 (audit du 05/10) : les carrés de sédiment de l'encart d'état suivaient
// une copie à la main des paliers (fausse avec « Limon des âges ») et une
// horloge qui avançait en crise terminale, quand la moisson est gelée.

const NOW = 1_800_000_000_000;
const laps = (html) => ({
  done: (html.match(/csp-lap-done/g) || []).length,
  empty: (html.match(/csp-lap-empty/g) || []).length
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  setState(defaultState());
  state.cycles = 3; // hors première partie : l'Usure est dévoilée
  renderCache.tickNow = NOW;
  invalidateRenderCache("all");
});
afterEach(() => { vi.useRealTimers(); });

describe("encart d'état — paliers de sédiment du moteur (BUG-51)", () => {
  it("40 min de cycle : aucun palier sans le nœud, le premier avec « Limon des âges »", () => {
    state.cycleStartedAt = NOW - 2400 * 1000;
    expect(laps(renderToString(<CityStatusPanel />)).done).toBe(0);
    state.upgrades.limon_des_ages = true;
    invalidateRenderCache("all");
    expect(laps(renderToString(<CityStatusPanel />))).toEqual({ done: 1, empty: 4 });
  });

  it("crise terminale : les carrés restent sur l'âge figé de la moisson", () => {
    state.cycleStartedAt = NOW - 2 * 3600 * 1000;           // 2 h de cycle
    state.crisisLimitAnnounced = true;
    state.crisisOpenedAt = NOW - 1.5 * 3600 * 1000;          // crise ouverte à 30 min
    vi.setSystemTime(NOW);
    renderCache.tickNow = NOW;
    // À 30 min, le palier d'une heure n'est pas atteint : aucun carré.
    expect(laps(renderToString(<CityStatusPanel />)).done).toBe(0);
  });
});
