"use strict";
// Mythe d'Atlas et Édit d'effondrement (audit du 2026-10-05, BUG-79) : la page
// Effondrement promet qu'on « ne repose pas le monde » (chute manuelle coupée),
// mais les seuils « temps » et « usure » de l'Édit, eux, rompaient l'essai en
// cours. Tant que le pacte tient (ni sacré, ni écrasé), ils ne tirent plus.
// La crise terminale garde sa grâce puis sa chute : sous Atlas, c'est la SEULE
// sortie (collapse("manual") est refusé), et l'essai y est gelé de toute façon.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as stateModule from "../state.js";
import { checkAutoCollapse, applyOfflineProgress } from "../main.js";
import { autoCollapseDelay } from "../mechanics.js";
import { ATLAS_SHOULDER_TARGET, isMythCompleted } from "../../data/myths.js";
import { MID_GAME_FIXTURE, FIXED_NOW } from "./fixtures.js";

const { state, setState, hydrateState, invalidateRenderCache, setGamePaused, setCollapseInProgress } = stateModule;

function setup({ trigger = "temps", atlas = true, crushed = false, ...extra } = {}) {
  setState(hydrateState({
    ...MID_GAME_FIXTURE, instability: 0.5, timeWear: 0.95, cycles: 12,
    upgrades: { conseil_de_crise: true, edit_effondrement: true },
    cycleStartedAt: FIXED_NOW - 20 * 60_000, // 20 min de cycle : le seuil « temps » (10 min) est passé
    crisisDoctrine: { autoCollapse: { enabled: true, trigger, timeSeconds: 600, usureThreshold: 0.9, prepare: false } },
    ...extra
  }));
  if (atlas) {
    state.activeMythId = "mythe_d_atlas";
    state.atlasFardeau = crushed ? 100 : 60;
    state.atlasEpaules = 7;
    state.atlasCrushed = crushed;
  }
  invalidateRenderCache("all");
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
  setGamePaused(false);
  setCollapseInProgress(false);
});

afterEach(async () => {
  // Laisse finir un deuil lancé (pas de carte en test), puis rend la main.
  await vi.advanceTimersByTimeAsync(3000);
  setGamePaused(false);
  setCollapseInProgress(false);
  vi.useRealTimers();
});

describe("Édit d'effondrement sous Atlas (BUG-79)", () => {
  it("témoin sans Mythe : le seuil « temps » effondre", () => {
    setup({ atlas: false });
    checkAutoCollapse();
    expect(stateModule.collapseInProgress).toBe(true);
  });

  it("essai d'Atlas en cours : ni « temps » ni « usure » ne reposent le monde", () => {
    setup({ trigger: "temps" });
    checkAutoCollapse();
    expect(stateModule.collapseInProgress).toBe(false);
    expect(state.activeMythId).toBe("mythe_d_atlas");

    setup({ trigger: "usure" }); // Usure 0,95 ≥ seuil 0,9
    checkAutoCollapse();
    expect(stateModule.collapseInProgress).toBe(false);
  });

  it("ciel écrasé : le pacte est rompu, l'Édit reprend la main", () => {
    setup({ trigger: "temps", crushed: true });
    checkAutoCollapse();
    expect(stateModule.collapseInProgress).toBe(true);
  });

  it("crise terminale sous Atlas : grâce, puis la chute (seule sortie)", () => {
    setup({ trigger: "temps", instability: 1, crisisLimitAnnounced: true, crisisOpenedAt: FIXED_NOW - 10_000 });
    checkAutoCollapse();
    expect(stateModule.collapseInProgress).toBe(false); // la grâce court encore
    vi.setSystemTime(FIXED_NOW + autoCollapseDelay());
    checkAutoCollapse();
    expect(stateModule.collapseInProgress).toBe(true);
  });
});

// Le farm hors ligne rejoue l'Édit par son propre chemin (simulateAwayCrises) :
// sans la même retenue, fermer le jeu une dizaine de secondes faisait tirer au
// premier pas le seuil « temps » retenu en ligne, Fardeau encore sous 100 — et
// l'Édit rompait un essai que le jeu en ligne laissait vivre.
describe("Édit sous Atlas, farm hors ligne (BUG-79)", () => {
  const atlasFarm = ({ atlas = true } = {}) => {
    setup({ trigger: "temps", hephHeritage: true, atlas });
    if (atlas) state.atlasFardeau = 25; // essai vivant, 7 épaulées (< objectif)
  };

  it("témoin sans Mythe : la même absence courte effondre au premier pas", () => {
    atlasFarm({ atlas: false });
    const cycles = state.cycles;
    applyOfflineProgress(11);
    expect(state.cycles).toBe(cycles + 1);
  });

  it("absence courte : le seuil « temps » ne rompt pas l'essai", () => {
    atlasFarm();
    expect(state.atlasEpaules).toBeLessThan(ATLAS_SHOULDER_TARGET);
    const cycles = state.cycles;
    applyOfflineProgress(11); // pas de 10 s puis 1 s : Fardeau 25 → 58, jamais écrasé
    expect(state.cycles).toBe(cycles);
    expect(state.activeMythId).toBe("mythe_d_atlas");
    expect(state.atlasCrushed).toBe(false);
  });

  it("absence longue : personne n'épaule, le ciel écrase l'essai, puis l'Édit reprend la main", () => {
    atlasFarm();
    const cycles = state.cycles;
    applyOfflineProgress(3600);
    expect(state.cycles).toBeGreaterThan(cycles); // le farm a repris après l'écrasement
    expect(isMythCompleted("mythe_d_atlas")).toBe(false);
  });
});
