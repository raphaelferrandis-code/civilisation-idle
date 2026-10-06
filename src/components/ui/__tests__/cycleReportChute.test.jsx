import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderToString } from "react-dom/server";

// useGameState s'appuie sur useSyncExternalStore sans instantané serveur : pour
// le rendu SSR du test, il lit simplement l'état courant.
vi.mock("../../../hooks/useGameState.js", async () => {
  const { state } = await import("../../../game/core/state.js");
  return { useGameState: (selector) => selector(state), shallowEqual: Object.is };
});
// Le rendu serveur ne lance pas les effets : ici, chaque effet part au rendu, comme
// au montage — c'est lui qui arme le minuteur du bandeau.
vi.mock("react", async (importOriginal) => {
  const React = await importOriginal();
  return { ...React, useEffect: (effect) => { effect(); } };
});

import CycleReportBanner from "../CycleReportBanner.jsx";
import { state, setState, defaultState } from "../../../game/core/state.js";

// Bilan de cycle et chute sur la carte (audit du 05/10, CHUTE-11, choix de Raph) : le
// bilan, rempli au noir juste avant le lever, surgissait sur le lever et y mangeait
// presque toutes ses 9 s. Il attend désormais la fin du lever, et ses 9 s ne courent
// qu'à partir de là.
const REPORT = { year: 312, dynasty: "Akkad", cause: "famine", peakPop: "12000", cycleSec: 300, ruinGain: "50", prevCycleSec: null, prevRuinGain: null, at: 0 };
const render = () => renderToString(<CycleReportBanner />).replace(/<!-- -->/g, "");

beforeEach(() => {
  vi.useFakeTimers();
  setState(defaultState());
  state.lastCycleReport = { ...REPORT };
});
afterEach(() => { vi.useRealTimers(); });

describe("bilan de cycle — la chute sur la carte", () => {
  it("pendant la chute et son lever : ni bandeau, ni minuteur", () => {
    state.chute = true;
    expect(render()).toBe("");
    vi.advanceTimersByTime(60_000);
    expect(state.lastCycleReport).not.toBeNull();   // il attend, il ne s'efface pas
  });

  it("à la fin du lever : il paraît, et ses 9 s partent de là", () => {
    state.chute = true;
    render();
    vi.advanceTimersByTime(20_000);
    state.chute = false;
    expect(render()).toMatch(/Akkad/);
    vi.advanceTimersByTime(8_900);
    expect(state.lastCycleReport).not.toBeNull();
    vi.advanceTimersByTime(200);
    expect(state.lastCycleReport).toBeNull();
  });
});
