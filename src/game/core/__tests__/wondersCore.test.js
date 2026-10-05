"use strict";
// BUG-12 (audit du 2026-10-05) : les rangs de merveille n'étaient gravés que par
// la boucle rAF de la carte (cmCheckWonders). Carte démontée, onglet caché,
// dialogue ouvert ou absence : aucun rang Population/Ère, sceau GR II retardé.
// Le cœur grave désormais les rangs au tick et au seuil de completeCollapse, sur
// le PIC du cycle. Aucun test ici ne monte la carte.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { state, setState, hydrateState, invalidateRenderCache, setGamePaused } from "../state.js";
import { tick } from "../actions/tick.js";
import { completeCollapse } from "../actions/crisis.js";
import { checkWonders } from "../actions/wonders.js";
import { checkWonderTiers, wonderTierOf } from "../mechanics/wonders.js";
import { applyOfflineProgress } from "../main.js";
import { D } from "../num.js";
import { MID_GAME_FIXTURE, FIXED_NOW } from "./fixtures.js";
// Pas de crise narrative (25/50/75 %) : aucun dialogue ne doit s'ouvrir.
import { neutralizeCrises } from "../../../test/core.js";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
  setState(hydrateState(MID_GAME_FIXTURE));
  setGamePaused(false);
  state.wonders = [];
  state.wonderTiers = {};
  invalidateRenderCache("all");
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("merveilles gravées par le cœur, sans carte (BUG-12)", () => {
  it("le tick grave une merveille franchie et la chronique l'annonce", () => {
    neutralizeCrises();
    state.population = D(2e6);
    tick(1);
    expect(state.wonders).toContain("pop1m");
    expect(state.wonderTiers.pop1m).toBe(1);
    // cycles = 4 dans la fixture : le Mausolée (≥ 1 effondrement) aussi.
    expect(state.wonders).toContain("dynasty1");
    expect(state.history.some((line) => String(line).includes("Merveille érigée"))).toBe(true);
  });

  it("le PIC du cycle compte, pas la valeur de l'instant", () => {
    // Population retombée (dépenses, crise) mais sommet du cycle à 2e13 et ère 22 :
    // la vérification lancée maintenant voit encore le sommet réellement atteint.
    state.population = D(50_000);
    state.cyclePeaks.population = D(2e13);
    state.cyclePeaks.eraIndex = 22;
    checkWonderTiers(state);
    expect(state.wonderTiers.pop1m).toBe(2);
    expect(state.wonderTiers.era_kingdom).toBe(2);
  });

  it("completeCollapse grave le cycle qui tombe AVANT de remettre ses pics à zéro", () => {
    state.population = D(50_000);
    state.cyclePeaks.population = D(5e6);
    completeCollapse(D(10), "Dynastie d'essai", "Épitaphe d'essai", "manual");
    expect(state.wonders).toContain("pop1m");
    // Le pic a bien été remis à zéro ensuite : sans la gravure en tête de
    // completeCollapse, le rang était perdu pour de bon.
    expect(D(state.cyclePeaks.population).lt(1e6)).toBe(true);
  });

  it("une merveille ne régresse jamais", () => {
    state.wonders = ["pop1m"];
    state.wonderTiers = { pop1m: 3 };
    state.population = D(2e6);
    state.cyclePeaks.population = D(2e6);
    expect(checkWonders()).toBe(1 /* seul le Mausolée monte */);
    expect(state.wonderTiers.pop1m).toBe(3);
  });

  it("vieille sauvegarde : une merveille listée sans rang compte pour le rang I", () => {
    state.wonders = ["era_empire"];
    state.wonderTiers = {};
    expect(wonderTierOf(state, "era_empire")).toBe(1);
    checkWonderTiers(state);
    expect(state.wonderTiers.era_empire).toBe(1);
  });

  it("au-delà du float (pic à 1e330) : rang V, sans NaN", () => {
    state.cyclePeaks.population = D("1e330");
    checkWonderTiers(state);
    expect(state.wonderTiers.pop1m).toBe(5);
  });

  it("farm hors ligne (Édit, aucune carte) : la chute simulée grave le rang du cycle", () => {
    const departed = FIXED_NOW - 2 * 3600 * 1000;
    setState(hydrateState({
      population: 2e6, food: 4e6, gold: 2e6, knowledge: 3e5, infrastructure: 3e4,
      ruins: 5000, cycles: 10, instability: 0.3, timeWear: 0.1,
      bestEraIndex: 6, cyclePeaks: { population: 2e6, knowledge: 3e5, infrastructure: 3e4, eraIndex: 6 },
      cycleStartedAt: departed, lastTick: departed,
      buildings: { foragers: 30, granaries_city: 20, caravans: 12, markets: 8, irrigated_fields: 6 },
      upgrades: { conseil_de_crise: true, edit_effondrement: true },
      hephHeritage: true,
      crisisDoctrine: { p25: "stabiliser", p50: "stabiliser", p75: "stabiliser", autoCollapse: { enabled: true, trigger: "temps", timeSeconds: 600, usureThreshold: 0.9, prepare: false } },
      wonders: [], wonderTiers: {}
    }));
    invalidateRenderCache("all");
    const cyclesBefore = state.cycles;
    applyOfflineProgress(2 * 3600);
    expect(state.cycles).toBeGreaterThan(cyclesBefore); // le farm a bien fait tomber la cité
    expect(state.wonders).toContain("pop1m");
    expect(state.wonderTiers.pop1m).toBeGreaterThanOrEqual(1);
    expect(state.wonderTiers.dynasty1).toBeGreaterThanOrEqual(1);
  });
});
