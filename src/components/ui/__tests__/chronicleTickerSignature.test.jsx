import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderToString } from "react-dom/server";

// useGameState s'appuie sur useSyncExternalStore sans instantané serveur : pour
// le rendu SSR du test, il lit simplement l'état courant.
vi.mock("../../../hooks/useGameState.js", async () => {
  const { state } = await import("../../../game/core/state.js");
  return { useGameState: (selector) => selector(state), shallowEqual: Object.is };
});
// La figure est-elle dans la cité ? (paroles/figures.js ; la vraie se teste avec la rue,
// map/__tests__/parolesFigures.test.js.)
const H = vi.hoisted(() => ({ present: false }));
vi.mock("../../../game/map/paroles/figures.js", async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, findFigure: (key) => (H.present ? { key } : null) };
});

import ChronicleTicker from "../ChronicleTicker.jsx";
import { state, setState, defaultState, renderCache } from "../../../game/core/state.js";
import { getNotifEnabled, setNotifEnabled } from "../../../game/core/main.js";

// LA SIGNATURE MÈNE À SA FIGURE (docs/PLAN-ECOUTER-PARLER.md, lot 6) : sous un article
// signé par une figure de la Chronique qui vit dans la cité, son nom est un bouton qui la
// fait retrouver sur la carte ; sinon, la signature reste un texte.

const NOW = 1_800_000_000_000;
let before;
beforeEach(() => {
  before = getNotifEnabled();
  setNotifEnabled(true);
  setState(defaultState());
  renderCache.tickNow = NOW;
  H.present = false;
});
afterEach(() => { setNotifEnabled(before); });

const dispatch = (articleId) => {
  state.chronicleEntries = [{ id: "d1", articleId, date: "An 3", publishedAt: NOW - 5_000, isNew: true }];
};
const render = () => renderToString(<ChronicleTicker />).replace(/<!-- -->/g, "");

describe("bandeau-dépêche : la signature d'une figure", () => {
  it("Khael est dans la cité : sa signature est un bouton", () => {
    dispatch("p3_gold_statues");
    H.present = true;
    const html = render();
    expect(html).toMatch(/<button type="button" class="ticker-author-link"[^>]*>Khael, juge autoproclamé<\/button>/);
  });

  it("Khael n'y est pas : sa signature reste un texte", () => {
    dispatch("p3_gold_statues");
    const html = render();
    expect(html).toMatch(/Khael, juge autoproclamé/);
    expect(html).not.toMatch(/ticker-author-link/);
  });

  it("un article signé par un habitant ordinaire : la signature reste un texte", () => {
    H.present = true;
    state.chronicleEntries = [{ id: "d2", title: "Dépêche du jour", text: "Le grain rentre.", author: "Garin, forgeron", date: "An 3", publishedAt: NOW - 5_000, isNew: true }];
    const html = render();
    expect(html).toMatch(/Garin, forgeron/);
    expect(html).not.toMatch(/ticker-author-link/);
  });
});
