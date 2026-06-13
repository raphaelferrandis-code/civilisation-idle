"use strict";
// Filet de sécurité contre la classe de bug "champ écrit dans le code mais
// absent de l'hydratation" : hydrateState reconstruit l'état champ par champ,
// donc tout champ oublié est silencieusement perdu au rechargement (cas réel :
// activeEpitaphLegacy/nextEpitaphLegacy, perdus pendant la fenêtre du legs).

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

import { defaultState, hydrateState, normalizeEpitaphLegacy } from "../state.js";
import { EPITAPH_LEGACIES } from "../../data/epitaphs.js";
import { FIXED_NOW } from "./fixtures.js";

beforeAll(() => {
  vi.spyOn(Date, "now").mockReturnValue(FIXED_NOW);
});

afterAll(() => {
  vi.restoreAllMocks();
});

// Simule un cycle save → JSON.parse → hydrateState, comme un F5 du joueur.
const roundTrip = (state) => hydrateState(JSON.parse(JSON.stringify(state)));

describe("hydrateState — round-trip de sauvegarde", () => {
  it("conserve exactement les clés du state d'origine", () => {
    const original = defaultState();
    const hydrated = roundTrip(original);
    expect(Object.keys(hydrated).sort()).toEqual(Object.keys(original).sort());
  });

  it("préserve le legs d'épitaphe actif et le legs en attente", () => {
    const original = defaultState();
    original.activeEpitaphLegacy = {
      id: EPITAPH_LEGACIES[0].id,
      cause: "famine",
      chosenCycle: 4,
      startedAt: FIXED_NOW - 60_000
    };
    original.nextEpitaphLegacy = {
      id: EPITAPH_LEGACIES[1].id,
      cause: "time",
      chosenCycle: 5,
      startedAt: FIXED_NOW
    };
    const hydrated = roundTrip(original);
    expect(hydrated.activeEpitaphLegacy).toEqual(original.activeEpitaphLegacy);
    expect(hydrated.nextEpitaphLegacy).toEqual(original.nextEpitaphLegacy);
  });

  it("préserve publishedAt des dépêches de la Chronique", () => {
    const original = defaultState();
    original.chronicleEntries = [{
      id: "p1_test",
      title: "TITRE",
      text: "Texte.",
      author: "Claude, gardien du feu",
      age: "Campement",
      date: "An 12",
      category: "Crise",
      isNew: true,
      publishedAt: FIXED_NOW - 30_000
    }];
    const hydrated = roundTrip(original);
    expect(hydrated.chronicleEntries[0].publishedAt).toBe(FIXED_NOW - 30_000);
  });
});

describe("normalizeEpitaphLegacy", () => {
  it("rejette un id inconnu ou une forme invalide", () => {
    expect(normalizeEpitaphLegacy({ id: "legs_inconnu", cause: "famine" })).toBeNull();
    expect(normalizeEpitaphLegacy("granaries")).toBeNull();
    expect(normalizeEpitaphLegacy(null)).toBeNull();
  });

  it("normalise les champs d'un legs valide", () => {
    const out = normalizeEpitaphLegacy({
      id: "granaries",
      cause: "famine",
      chosenCycle: "3",
      startedAt: FIXED_NOW - 1000
    });
    expect(out).toEqual({
      id: "granaries",
      cause: "famine",
      chosenCycle: 3,
      startedAt: FIXED_NOW - 1000
    });
  });
});
