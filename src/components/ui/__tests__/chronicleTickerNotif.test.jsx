import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderToString } from "react-dom/server";

// useGameState s'appuie sur useSyncExternalStore sans instantané serveur : pour
// le rendu SSR du test, il lit simplement l'état courant.
vi.mock("../../../hooks/useGameState.js", async () => {
  const { state } = await import("../../../game/core/state.js");
  return { useGameState: (selector) => selector(state), shallowEqual: Object.is };
});

import ChronicleTicker from "../ChronicleTicker.jsx";
import { state, setState, defaultState, renderCache } from "../../../game/core/state.js";
import { getNotifEnabled, setNotifEnabled } from "../../../game/core/main.js";

// Options › « Notifications du fil » (audit du 05/10, BUG-55) : le réglage
// s'enregistrait mais personne ne le lisait — couper les messages ne coupait rien.

const NOW = 1_800_000_000_000;
let before;
beforeEach(() => {
  before = getNotifEnabled();
  setState(defaultState());
  state.chronicleEntries = [{ id: "d1", title: "Dépêche du jour", text: "Le grain rentre.", date: "An 3", publishedAt: NOW - 5_000, isNew: true }];
  renderCache.tickNow = NOW;
});
afterEach(() => { setNotifEnabled(before); });

const render = () => renderToString(<ChronicleTicker />).replace(/<!-- -->/g, "");

describe("bandeau-dépêche — réglage « Notifications du fil »", () => {
  it("activé : la dépêche fraîche s'affiche", () => {
    setNotifEnabled(true);
    expect(render()).toMatch(/Dépêche du jour/);
  });

  it("désactivé : le bandeau ne se monte pas", () => {
    setNotifEnabled(false);
    expect(render()).toBe("");
  });
});
