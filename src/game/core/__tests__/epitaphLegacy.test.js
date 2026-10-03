"use strict";
// Legs d'épitaphe :
//  1. TOUT LE CYCLE (« Choisir sa chute », 2026-10) : le legs agit jusqu'à la
//     chute suivante (avant : une fenêtre de 8 min) ; « Épitaphes profondes »
//     renforce ses BIENFAITS (pas ses contreparties) ; le Pillage endette la
//     cité suivante (foyer Inégalités) au lieu de pousser l'aiguille.
//  2. PARITÉ OFFLINE : les effondrements hors-ligne (simulateAwayCrises)
//     re-gravent la « dernière volonté » (nextEpitaphLegacy) avec le MÊME
//     multiplicateur de ruines que le dialogue, et rafraîchissent la cause
//     d'affinité sur la chute courante.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import * as stateModule from "../state.js";
const { state, setState, hydrateState, invalidateRenderCache, setGamePaused } = stateModule;
// Importer main.js enregistre le pont world.js↔core (cf. crisisDoctrine.test.js).
import { applyOfflineProgress } from "../main.js";
import { tick } from "../actions/tick.js";
import { activeEpitaphLegacy, epitaphLegacyAmp } from "../mechanics.js";
import { epitaphLegacyEffect } from "../mechanics/production/mythEffects.js";
import { completeCollapse } from "../actions/crisis.js";
import { epitaphLegacyById, epitaphLegacyChips } from "../../data/epitaphs.js";
import { D } from "../num.js";
import { CRISIS_EVENTS } from "../../data/world.js";
import { toNum } from "../num.js";
import { MID_GAME_FIXTURE, FIXED_NOW } from "./fixtures.js";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
  setState(hydrateState(MID_GAME_FIXTURE));
  setGamePaused(false);
  invalidateRenderCache("all");
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("legs d'épitaphe — tout le cycle", () => {
  // Neutralise les crises narratives (dialogues async) pendant les ticks du test.
  const markAllThresholds = () =>
    (state.crisisThresholds = Object.fromEntries(CRISIS_EVENTS.map((e) => [e.id, true])));

  it("un legs gravé il y a 3 h agit encore, et le tick ne le consomme jamais", () => {
    markAllThresholds();
    state.activeEpitaphLegacy = { id: "granaries", cause: "famine", chosenCycle: 3, startedAt: FIXED_NOW - 3 * 3600 * 1000 };
    expect(activeEpitaphLegacy()?.definition.id).toBe("granaries");
    tick(1);
    expect(state.activeEpitaphLegacy?.id).toBe("granaries");
    expect(epitaphLegacyEffect().foodMult).toBeGreaterThan(1);
  });

  it("un legs gravé « dans le futur » (horloge virtuelle de la Clepsydre) n'agit pas", () => {
    state.activeEpitaphLegacy = { id: "granaries", cause: "famine", chosenCycle: 3, startedAt: FIXED_NOW + 60 * 1000 };
    expect(activeEpitaphLegacy()).toBeNull();
  });

  it("« Épitaphes profondes » renforce les bienfaits de moitié, pas les contreparties", () => {
    state.activeEpitaphLegacy = { id: "granaries", cause: "rupture", chosenCycle: 3, startedAt: FIXED_NOW };
    const plain = epitaphLegacyEffect();
    state.upgrades.epitaphes_profondes = true;
    invalidateRenderCache("all");
    expect(epitaphLegacyAmp()).toBeCloseTo(0.5, 9);
    const deep = epitaphLegacyEffect();
    expect(deep.foodMult - 1).toBeCloseTo((plain.foodMult - 1) * 1.5, 9);
    expect(deep.goldMult).toBeCloseTo(plain.goldMult, 9); // contrepartie inchangée
  });

  it("le Pillage endette la cité suivante (Inégalités), sans toucher l'aiguille", () => {
    state.nextEpitaphLegacy = { id: "plunder", cause: "avarice", chosenCycle: state.cycles, startedAt: FIXED_NOW };
    completeCollapse(D(1), "Test", "épitaphe", "auto_collapse");
    const plunder = epitaphLegacyById("plunder");
    expect(state.foyerShift.inequality).toBeCloseTo(plunder.effects.foyerShift.inequality, 9);
    expect(state.instability).toBe(0);
  });
});

describe("epitaphLegacyChips — renfort d'affinité matérialisé", () => {
  it("favorisé : « −3% → −5% » sur la Subsistance (base → renforcé), marqué boosted", () => {
    const favoredChips = epitaphLegacyChips(epitaphLegacyById("granaries"), "famine");
    const boosted = favoredChips.find((chip) => chip.boosted);
    expect(boosted.label).toContain("Subsistance −3% → −5%");
    expect(boosted.kind).toBe("gain");
  });

  it("non favorisé : la valeur seule, sans flèche", () => {
    const plainChips = epitaphLegacyChips(epitaphLegacyById("granaries"), "rupture");
    expect(plainChips.some((chip) => chip.label.includes("→"))).toBe(false);
    expect(plainChips.some((chip) => chip.boosted)).toBe(false);
  });

  it("les chips suivent « Épitaphes profondes » (même source que le moteur)", () => {
    const deepChips = epitaphLegacyChips(epitaphLegacyById("granaries"), "rupture", 0.5);
    expect(deepChips.some((chip) => chip.label.includes("+15%"))).toBe(true); // Nourriture +10 % × 1,5
    const plunderDeep = epitaphLegacyChips(epitaphLegacyById("plunder"), "rupture", 0.5);
    expect(plunderDeep.some((chip) => chip.kind === "cost" && chip.label.includes("+6%"))).toBe(true); // dette non amplifiée
  });

  it("le Pillage annonce sa dette", () => {
    const chips = epitaphLegacyChips(epitaphLegacyById("plunder"), "avarice");
    expect(chips.some((chip) => chip.kind === "cost" && chip.label.includes("Inégalités +6%"))).toBe(true);
  });
});

describe("farm hors-ligne — la dernière volonté est re-gravée à l'identique", () => {
  // Même fixture de farm que crisisDoctrine.test.js : cycle déjà vieux de 2 h et
  // déclencheur "temps" à 180 s → l'effondrement part au premier pas de 10 s, sur
  // un état PRÉ-effondrement identique d'un run à l'autre. 60 s d'absence = un
  // seul effondrement, donc le gain isole exactement le multiplicateur du legs.
  const farmState = (overrides = {}) => hydrateState({
    population: 100000, food: 400000, gold: 200000, knowledge: 30000, infrastructure: 3000,
    ruins: 5000, cycles: 10, instability: 0.3, timeWear: 0.1,
    bestEraIndex: 6, cyclePeaks: { population: 120000, knowledge: 35000, infrastructure: 3500, eraIndex: 6 },
    cycleStartedAt: FIXED_NOW - 2 * 3600 * 1000, lastTick: FIXED_NOW - 2 * 3600 * 1000,
    buildings: { foragers: 30, granaries_city: 20, caravans: 12, markets: 8, irrigated_fields: 6 },
    upgrades: { conseil_de_crise: true, edit_effondrement: true },
    hephHeritage: true,
    crisisDoctrine: { p25: "stabiliser", p50: "stabiliser", p75: "stabiliser", autoCollapse: { enabled: true, trigger: "temps", timeSeconds: 180, usureThreshold: 0.9, prepare: false } },
    ...overrides
  });

  const offlineRuinsGained = (overrides) => {
    setState(farmState(overrides));
    invalidateRenderCache("all");
    const before = toNum(state.ruins);
    applyOfflineProgress(60);
    return toNum(state.ruins) - before;
  };

  it("applique le multiplicateur de ruines du legs (l'Ordre ×0.9) comme le dialogue", () => {
    const gainedWithoutLegacy = offlineRuinsGained();
    const gainedWithLaws = offlineRuinsGained({
      nextEpitaphLegacy: { id: "laws", cause: "rupture", chosenCycle: 9, startedAt: FIXED_NOW - 3600 * 1000 }
    });

    expect(gainedWithoutLegacy).toBeGreaterThan(0);
    // Assertion EXACTE (même arrondi entier que le moteur) : le gain projeté de
    // cette fixture est petit (~13 ruines), un ratio approché serait du bruit.
    expect(gainedWithLaws).toBe(Math.round(gainedWithoutLegacy * 0.9));
  });

  it("re-grave le legs pour le cycle suivant avec la cause de CETTE chute", () => {
    offlineRuinsGained({
      nextEpitaphLegacy: { id: "laws", cause: "cause_perimee", chosenCycle: 9, startedAt: FIXED_NOW - 3600 * 1000 }
    });

    expect(state.activeEpitaphLegacy?.id).toBe("laws");
    expect(["famine", "time", "rupture", "avarice"]).toContain(state.activeEpitaphLegacy.cause);
    expect(state.nextEpitaphLegacy.cause).toBe(state.activeEpitaphLegacy.cause);
  });

  it("sans dernière volonté : aucun legs actif, gain de base inchangé", () => {
    offlineRuinsGained();
    expect(state.activeEpitaphLegacy).toBeNull();
  });

  it("le testament prime sur la dernière volonté (le Grain ×0.9 malgré l'Ordre en attente)", () => {
    const gainedWithoutLegacy = offlineRuinsGained();
    const gainedWithTestament = offlineRuinsGained({
      testamentLegacyId: "granaries",
      nextEpitaphLegacy: { id: "laws", cause: "rupture", chosenCycle: 9, startedAt: FIXED_NOW - 3600 * 1000 }
    });

    expect(gainedWithTestament).toBe(Math.round(gainedWithoutLegacy * 0.9));
    expect(state.activeEpitaphLegacy?.id).toBe("granaries");
    expect(state.testamentLegacyId).toBe("granaries");
  });
});
