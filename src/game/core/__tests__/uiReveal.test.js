"use strict";
// LE JEU QUI SE DÉVOILE (uiReveal.js).
//
// Deux promesses, et chacune a son piège :
//  1. Un joueur installé ne perd RIEN : hors de la toute première partie, tout
//     est visible, quels que soient les drapeaux (une vieille sauvegarde n'en a
//     aucun).
//  2. Ce qui est montré ne se cache plus jamais : l'or dépensé jusqu'au dernier
//     sou ne doit pas faire disparaître la case Trésor.

import { describe, it, expect, beforeEach } from "vitest";

import { state, setState, defaultState, hydrateState } from "../state.js";
import { refreshOnboarding, ONBOARDING_PRESSURE_THRESHOLD } from "../onboarding.js";
import {
  UI_REVEAL_KEYS,
  REVEAL_FRESH_MS,
  REVEAL_META_ERA,
  refreshUiReveal,
  uiRevealComplete,
  uiRevealed,
  uiRevealFresh,
  uiRevealSignature,
  normalizeUiReveal,
  UI_REVEAL_ANNOUNCE
} from "../uiReveal.js";

const NO_FACTS = {
  gold: false, knowledge: false, infrastructure: false,
  plaisirs: false, shopKnowledge: false, shopInfra: false, buyAmounts: false
};
const T0 = 1_000_000;

beforeEach(() => { setState(defaultState()); });

describe("la première minute", () => {
  it("une partie neuve ne montre rien de ce qui peut attendre", () => {
    for (const key of UI_REVEAL_KEYS) expect(uiRevealed(state, key), key).toBe(false);
  });

  it("au premier tick d'une partie neuve, rien ne se dévoile", () => {
    expect(refreshUiReveal(state, NO_FACTS, T0)).toEqual([]);
  });
});

describe("chaque élément entre à son moment", () => {
  it("la jauge de Rupture arrive avec la 2e étape des Premiers pas", () => {
    refreshOnboarding(state, 1);
    expect(refreshUiReveal(state, NO_FACTS, T0)).toEqual(["gauge"]);
    expect(uiRevealed(state, "gauge")).toBe(true);
    expect(uiRevealed(state, "tension")).toBe(false);
  });

  it("la tension (Régulation, Effondrement) arrive au premier quart de Rupture", () => {
    state.instability = ONBOARDING_PRESSURE_THRESHOLD;
    refreshOnboarding(state, 1);
    const fresh = refreshUiReveal(state, NO_FACTS, T0);
    expect(fresh).toContain("tension");
    expect(uiRevealed(state, "tension")).toBe(true);
  });

  it("une crise terminale dévoile la tension même sans Premiers pas", () => {
    // L'onglet Effondrement est alors le SEUL accessible : il ne peut pas manquer.
    state.crisisLimitAnnounced = true;
    refreshUiReveal(state, NO_FACTS, T0);
    expect(uiRevealed(state, "tension")).toBe(true);
  });

  it("le temps du cycle et la sauvegarde arrivent au Grand Feu (ère 1)", () => {
    state.bestEraIndex = REVEAL_META_ERA - 1;
    refreshUiReveal(state, NO_FACTS, T0);
    expect(uiRevealed(state, "meta")).toBe(false);
    state.bestEraIndex = REVEAL_META_ERA;
    refreshUiReveal(state, NO_FACTS, T0 + 1);
    expect(uiRevealed(state, "meta")).toBe(true);
  });

  it("les faits fournis par le tick dévoilent leur clé, et seulement elle", () => {
    const fresh = refreshUiReveal(state, { ...NO_FACTS, gold: true, shopKnowledge: true }, T0);
    expect(fresh.sort()).toEqual(["gold", "shopKnowledge"]);
    expect(uiRevealed(state, "gold")).toBe(true);
    expect(uiRevealed(state, "knowledge")).toBe(false);
  });
});

describe("ce qui est montré ne se cache plus", () => {
  it("l'or dépensé jusqu'au dernier sou ne retire pas la case Trésor", () => {
    refreshUiReveal(state, { ...NO_FACTS, gold: true }, T0);
    expect(refreshUiReveal(state, NO_FACTS, T0 + 1000)).toEqual([]);
    expect(uiRevealed(state, "gold")).toBe(true);
  });

  it("l'horodatage du dévoilement ne bouge plus", () => {
    refreshUiReveal(state, { ...NO_FACTS, gold: true }, T0);
    refreshUiReveal(state, { ...NO_FACTS, gold: true }, T0 + 9000);
    expect(state.onboarding.reveal.gold).toBe(T0);
  });

  it("survit à la sauvegarde", () => {
    refreshUiReveal(state, { ...NO_FACTS, infrastructure: true }, T0);
    const loaded = hydrateState(JSON.parse(JSON.stringify(state)));
    expect(uiRevealed(loaded, "infrastructure")).toBe(true);
    expect(uiRevealed(loaded, "gold")).toBe(false);
  });
});

describe("un joueur installé ne perd rien", () => {
  it("après le premier effondrement, tout est visible", () => {
    state.cycles = 1;
    for (const key of UI_REVEAL_KEYS) expect(uiRevealed(state, key), key).toBe(true);
  });

  it("une vieille sauvegarde sans drapeaux de dévoilement voit tout", () => {
    const old = { ...defaultState(), cycles: 3, onboarding: { built: true, pressureSeen: true, collapsed: true } };
    const loaded = hydrateState(JSON.parse(JSON.stringify(old)));
    expect(loaded.onboarding.reveal).toEqual({});
    for (const key of UI_REVEAL_KEYS) expect(uiRevealed(loaded, key), key).toBe(true);
  });

  it("après un Grand Reset aussi (cycles repart à 0, le drapeau à vie reste)", () => {
    state.onboarding.collapsed = true;
    state.cycles = 0;
    for (const key of UI_REVEAL_KEYS) expect(uiRevealed(state, key), key).toBe(true);
  });

  it("hors première partie, aucune animation d'entrée", () => {
    refreshUiReveal(state, { ...NO_FACTS, gold: true }, T0);
    state.cycles = 1;
    expect(uiRevealFresh(state, "gold", T0 + 10)).toBe(false);
  });
});

describe("mécanique", () => {
  it("l'animation d'entrée ne dure que la fenêtre de fraîcheur", () => {
    refreshUiReveal(state, { ...NO_FACTS, gold: true }, T0);
    expect(uiRevealFresh(state, "gold", T0 + 10)).toBe(true);
    expect(uiRevealFresh(state, "gold", T0 + REVEAL_FRESH_MS + 1)).toBe(false);
  });

  it("la signature ne change qu'au dévoilement", () => {
    const a = uiRevealSignature(state);
    refreshUiReveal(state, NO_FACTS, T0);
    expect(uiRevealSignature(state)).toBe(a);
    refreshUiReveal(state, { ...NO_FACTS, gold: true }, T0);
    expect(uiRevealSignature(state)).not.toBe(a);
  });

  it("« complet » une fois toutes les clés posées, ce qui coupe le calcul au tick", () => {
    expect(uiRevealComplete(state)).toBe(false);
    state.onboarding.built = true;
    state.onboarding.pressureSeen = true;
    state.bestEraIndex = REVEAL_META_ERA;
    const all = Object.fromEntries(Object.keys(NO_FACTS).map((k) => [k, true]));
    refreshUiReveal(state, all, T0);
    expect(uiRevealComplete(state)).toBe(true);
  });

  it("la normalisation ne garde que les clés connues aux horodatages valides", () => {
    expect(normalizeUiReveal({ gold: 12, pirate: 5, knowledge: -1, tension: "x", meta: Infinity })).toEqual({ gold: 12 });
    expect(normalizeUiReveal(null)).toEqual({});
  });

  it("chaque annonce a son texte dans les deux langues", () => {
    for (const [key, a] of Object.entries(UI_REVEAL_ANNOUNCE)) {
      expect(UI_REVEAL_KEYS, key).toContain(key);
      expect(a.label.fr, key).toBeTruthy();
      expect(a.label.en, key).toBeTruthy();
    }
  });
});
