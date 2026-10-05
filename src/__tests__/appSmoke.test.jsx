import { it, expect, beforeAll, afterAll, vi } from "vitest";
import { renderToString } from "react-dom/server";

// ── FUMÉE DE L'APPLICATION : <App/> se charge et se rend ───────────────────────
// Audit du 05/10 (TEST-4). App, la barre du haut, le panneau d'état de la cité,
// la feuille « Plus »… n'étaient chargés par AUCUN test : un import qui casse au
// chargement donnait un écran blanc en prod, la suite restait verte. Rendu SSR (le
// premier rendu, sans effets : la boucle de jeu ne démarre pas) sur une partie
// neuve, de milieu de partie et très tardive. Les vues, chargées à la demande
// (lazy), sont couvertes une par une par components/__tests__/ecransSmoke.test.jsx.

// useGameState s'appuie sur useSyncExternalStore sans instantané serveur : pour le
// rendu SSR du test, il lit simplement l'état courant (même mock que fallChoice).
vi.mock("../hooks/useGameState.js", async () => {
  const { state } = await import("../game/core/state.js");
  return { useGameState: (selector) => (selector ? selector(state) : state), shallowEqual: Object.is };
});

import App from "../App.jsx";
import * as st from "../game/core/state.js";
import { MID_GAME_FIXTURE, FIXED_NOW } from "../game/core/__tests__/fixtures.js";

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});
afterAll(() => {
  vi.useRealTimers();
  st.setState(st.defaultState());
});

const rendre = () => {
  st.invalidateRenderCache("all");
  return renderToString(<App />);
};

it("se rend sur une partie neuve", () => {
  st.setState(st.defaultState());
  expect(rendre().length).toBeGreaterThan(0);
});

it("se rend en milieu de partie", () => {
  st.setState(st.hydrateState(MID_GAME_FIXTURE));
  expect(rendre().length).toBeGreaterThan(0);
});

it("se rend très tard dans la partie (1e320, ère 40)", () => {
  st.setState(st.hydrateState({
    ...MID_GAME_FIXTURE, population: "1e320", food: "1e330", gold: "1e330", knowledge: "1e330",
    infrastructure: "1e310", ruins: "1e200", bestEraIndex: 40, cycles: 400, grandResetCount: 11,
  }));
  expect(rendre().length).toBeGreaterThan(0);
});
