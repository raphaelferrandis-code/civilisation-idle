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
import { MID_GAME_FIXTURE, FIXED_NOW } from "../../../game/core/__tests__/fixtures.js";

// Registre de la Chronique (audit du 05/10, BUG-110) : le duel, les courses et
// la roue de la Maison étaient enregistrés mais jamais affichés — un joueur qui
// ne jouait qu'aux courses ne voyait même pas la section « Jeux du temple ».

const { state, setState, hydrateState, invalidateRenderCache, defaultChronicleStats } = stateModule;
const clean = (html) => html.replace(/<!-- -->/g, "");
const cards = (html) => (html.match(/class="chronicle-game-card"/g) || []).length;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
  setState(hydrateState(MID_GAME_FIXTURE));
  state.chronicleStats = defaultChronicleStats();
  invalidateRenderCache("all");
});
afterEach(() => { vi.useRealTimers(); });

describe("Chronique — chaque jeu enregistré a sa carte", () => {
  it("une carte par jeu du registre", () => {
    const games = state.chronicleStats.games;
    for (const g of Object.values(games)) g.plays = 1;
    const html = clean(renderToString(<ChronicleView />));
    expect(cards(html)).toBe(Object.keys(games).length);
  });

  it("des parties aux seules courses suffisent à montrer la section", () => {
    const c = state.chronicleStats.games.courses;
    c.plays = 3; c.wagered = 30; c.won = 120; c.outsiders = 1;
    const html = clean(renderToString(<ChronicleView />));
    expect(cards(html)).toBeGreaterThan(0);
    expect(html).toMatch(/1 outsiders|1 long shots/);
  });

  it("le duel compte ses victoires", () => {
    const d = state.chronicleStats.games.duel;
    d.plays = 5; d.gagnes = 2;
    const html = clean(renderToString(<ChronicleView />));
    expect(html).toMatch(/2 duels gagnés|2 duels won/);
  });

  it("la roue de la Maison a ses tuiles dans l'Économie de Faveur", () => {
    state.chronicleStats.roueSpins = 4;
    state.chronicleStats.roueBest = 0;
    const html = clean(renderToString(<ChronicleView />));
    expect(html).toMatch(/Tours de la roue de la Maison|House wheel spins/);
  });
});
