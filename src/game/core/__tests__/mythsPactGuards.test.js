"use strict";
// Audit 2026-10-05, lot 7.
//   BUG-108 : la vue des Mythes écrivait state.babelCategory AVANT activateMyth,
//             qui peut refuser le pacte (pause, deuil d'un effondrement auto) —
//             la catégorie changeait hors de toute action, pacte refusé.
//   BUG-109 : runTerminalCrisisAction modifiait state.terminalPreparations EN
//             PLACE : la Veille, abonnée à l'objet, ne voyait pas le rite.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as stateModule from "../state.js";
import "../main.js";
import { activateMyth } from "../actions/myths.js";
import { runTerminalCrisisAction } from "../actions/crisis.js";
import { rates } from "../mechanics.js";
import { MYTHS } from "../../data/myths.js";
import { D, toNum } from "../num.js";
import { MID_GAME_FIXTURE, FIXED_NOW } from "./fixtures.js";

const { state, setState, hydrateState, invalidateRenderCache, setGamePaused, setCollapseInProgress } = stateModule;

// Acte I accompli : Babel (acte II) est ouvert.
const babelReady = () => {
  const act1 = Object.fromEntries(MYTHS.filter((m) => m.act === 1).map((m) => [m.id, true]));
  setState(hydrateState({ ...MID_GAME_FIXTURE, grandResetCount: 1, mythsCompleted: act1, babelCategory: null }));
  invalidateRenderCache("all");
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  setGamePaused(false);
  setCollapseInProgress(false);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("BUG-108 — la catégorie de Babel n'est posée que si le pacte est scellé", () => {
  it("jeu en pause : pacte refusé, catégorie intacte", async () => {
    babelReady();
    setGamePaused(true);
    expect(await activateMyth("mythe_de_babel", { babelCategory: "knowledge" })).toBe(false);
    expect(state.babelCategory).toBe(null);
    expect(state.activeMythId).toBeFalsy();
  });

  it("deuil d'un effondrement automatique : pacte refusé, catégorie intacte", async () => {
    babelReady();
    setCollapseInProgress(true);
    expect(await activateMyth("mythe_de_babel", { babelCategory: "infra" })).toBe(false);
    expect(state.babelCategory).toBe(null);
  });

  it("pacte scellé : la catégorie choisie survit au reset du cycle", async () => {
    babelReady();
    expect(await activateMyth("mythe_de_babel", { babelCategory: "knowledge" })).toBe(true);
    expect(state.activeMythId).toBe("mythe_de_babel");
    expect(state.babelCategory).toBe("knowledge");
  });

  it("une catégorie inconnue n'est pas écrite", async () => {
    babelReady();
    await activateMyth("mythe_de_babel", { babelCategory: "n'importe" });
    expect(state.babelCategory).toBe(null);
  });
});

describe("BUG-109 — le rite de la chute remplace l'objet des préparations", () => {
  it("nouvelle référence, rite et palier inscrits", () => {
    setState(hydrateState(MID_GAME_FIXTURE));
    state.instability = 1;
    state.crisisLimitAnnounced = true;
    state.crisisOpenedAt = FIXED_NOW;
    state.terminalPreparations = { used: {}, riteTier: -1 };
    invalidateRenderCache("all");
    state.food = D(toNum(rates().food) * 1000);
    const before = state.terminalPreparations;
    runTerminalCrisisAction("exodus", 0);
    expect(state.terminalPreparations).not.toBe(before);
    expect(state.terminalPreparations.used.exodus).toBe(true);
    expect(state.terminalPreparations.riteTier).toBe(0);
    // L'ancien objet n'est pas touché (personne ne le lit plus, mais une mutation
    // en place serait le défaut lui-même).
    expect(before.used.exodus).toBeUndefined();
  });
});
