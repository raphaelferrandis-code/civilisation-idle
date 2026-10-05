import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderToString } from "react-dom/server";

// useGameState s'appuie sur useSyncExternalStore sans instantané serveur : pour
// le rendu SSR du test, il lit simplement l'état courant.
vi.mock("../../../hooks/useGameState.js", async () => {
  const { state } = await import("../../../game/core/state.js");
  return { useGameState: (selector) => selector(state), shallowEqual: Object.is };
});

// Débits de fin de partie, au-delà du float : les lots et le prix le suivent.
vi.mock("../../../game/core/mechanics.js", async (importOriginal) => {
  const orig = await importOriginal();
  const { D } = await import("../../../game/core/num.js");
  return {
    ...orig,
    rates: () => ({ gold: D("1e400"), food: D("1e400"), knowledge: D(1), infrastructure: D(1), population: D(1) })
  };
});

import ComptoirView from "../ComptoirView.jsx";
import { state, setState, defaultState } from "../../../game/core/state.js";
import { D } from "../../../game/core/num.js";

// BUG-111 (audit du 05/10) : la désactivation des boutons comparait en float.
// Au-delà de ~1,8e308, toNum rend Infinity des deux côtés, `Infinity < Infinity`
// est faux : bouton actif, puis comptoirBuy refusait sans rien dire.

const disabledCount = (html) => (html.match(/<button[^>]*disabled/g) || []).length;

beforeEach(() => { setState(defaultState()); });

describe("Comptoir au-delà du float (BUG-111)", () => {
  it("Trésor et Nourriture insuffisants : les quatre boutons sont grisés", () => {
    state.gold = D("1e401");   // prix d'un lot : 1e400 × 60 × 1,5 = 9e401
    state.food = D("1e401");   // lot de nourriture : 1e400 × 60 = 6e401
    expect(disabledCount(renderToString(<ComptoirView />))).toBe(4);
  });

  it("de quoi payer : les quatre boutons sont actifs", () => {
    state.gold = D("1e410");
    state.food = D("1e410");
    expect(disabledCount(renderToString(<ComptoirView />))).toBe(0);
  });
});
