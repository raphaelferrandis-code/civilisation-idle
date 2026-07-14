"use strict";
// Legs d'épitaphe — deux invariants issus de la remédiation "Lot A" :
//  1. DURÉE UNIQUE : epitaphLegacyDurationMs() est la seule source de vérité
//     (8 min de base, amplifiée par « Épitaphes profondes ») ; l'effet et
//     l'affichage doivent expirer au même instant.
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
import { activeEpitaphLegacy, epitaphLegacyDurationMs } from "../mechanics.js";
import { EPITAPH_LEGACY_DURATION_MS, epitaphLegacyById, epitaphLegacyChips } from "../../data/epitaphs.js";
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

describe("epitaphLegacyDurationMs — durée effective unique", () => {
  it("8 min de base, 20 min avec « Épitaphes profondes »", () => {
    expect(epitaphLegacyDurationMs()).toBe(EPITAPH_LEGACY_DURATION_MS);
    state.upgrades.epitaphes_profondes = true;
    invalidateRenderCache("all");
    expect(epitaphLegacyDurationMs()).toBe(EPITAPH_LEGACY_DURATION_MS * 2.5);
  });

  it("un legs vieux de 10 min n'est actif QU'avec l'upgrade (8 < 10 < 20 min)", () => {
    state.activeEpitaphLegacy = {
      id: "granaries", cause: "famine", chosenCycle: 3,
      startedAt: FIXED_NOW - 10 * 60 * 1000
    };
    expect(activeEpitaphLegacy()).toBeNull();

    state.upgrades.epitaphes_profondes = true;
    invalidateRenderCache("all");
    expect(activeEpitaphLegacy()?.definition.id).toBe("granaries");
  });
});

describe("extinction du legs — ligne de Chronique puis consommation", () => {
  // Neutralise les crises narratives (dialogues async) pendant les ticks du test.
  const markAllThresholds = () =>
    (state.crisisThresholds = Object.fromEntries(CRISIS_EVENTS.map((e) => [e.id, true])));

  it("à l'expiration : une ligne au Journal, l'état consommé, jamais de re-post", () => {
    markAllThresholds();
    state.activeEpitaphLegacy = { id: "granaries", cause: "famine", chosenCycle: 3, startedAt: FIXED_NOW - 9 * 60 * 1000 };
    tick(1);
    expect(state.activeEpitaphLegacy).toBeNull();
    const fadedLines = () => (state.history || []).filter((line) => line.includes("s'efface")).length;
    expect(fadedLines()).toBe(1);
    tick(1);
    expect(fadedLines()).toBe(1);
  });

  it("un legs encore actif n'est ni consommé ni annoncé", () => {
    markAllThresholds();
    state.activeEpitaphLegacy = { id: "granaries", cause: "famine", chosenCycle: 3, startedAt: FIXED_NOW - 60 * 1000 };
    tick(1);
    expect(state.activeEpitaphLegacy?.id).toBe("granaries");
    expect((state.history || []).some((line) => line.includes("s'efface"))).toBe(false);
  });

  it("le Pillage (aucun effet fenêtré) s'éteint sans ligne", () => {
    markAllThresholds();
    state.activeEpitaphLegacy = { id: "plunder", cause: "avarice", chosenCycle: 3, startedAt: FIXED_NOW - 9 * 60 * 1000 };
    tick(1);
    expect(state.activeEpitaphLegacy).toBeNull();
    expect((state.history || []).some((line) => line.includes("s'efface"))).toBe(false);
  });
});

describe("epitaphLegacyChips — renfort d'affinité matérialisé", () => {
  it("favorisé : « +25% → +40% » (base → renforcé), marqué boosted", () => {
    const favoredChips = epitaphLegacyChips(epitaphLegacyById("granaries"), "famine");
    const boosted = favoredChips.find((chip) => chip.boosted);
    expect(boosted.label).toContain("+25% → +40%");
    expect(boosted.kind).toBe("gain");
  });

  it("non favorisé : la valeur seule, sans flèche", () => {
    const plainChips = epitaphLegacyChips(epitaphLegacyById("granaries"), "rupture");
    expect(plainChips.some((chip) => chip.label.includes("→"))).toBe(false);
    expect(plainChips.some((chip) => chip.boosted)).toBe(false);
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

  it("applique le multiplicateur de ruines du legs (Lois ×0.85) comme le dialogue", () => {
    const gainedWithoutLegacy = offlineRuinsGained();
    const gainedWithLaws = offlineRuinsGained({
      nextEpitaphLegacy: { id: "laws", cause: "rupture", chosenCycle: 9, startedAt: FIXED_NOW - 3600 * 1000 }
    });

    expect(gainedWithoutLegacy).toBeGreaterThan(0);
    // Assertion EXACTE (même arrondi entier que le moteur) : le gain projeté de
    // cette fixture est petit (~13 ruines), un ratio approché serait du bruit.
    expect(gainedWithLaws).toBe(Math.round(gainedWithoutLegacy * 0.85));
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

  it("le testament prime sur la dernière volonté (Granges ×0.9 malgré Lois en attente)", () => {
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
