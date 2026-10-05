"use strict";
// ATLAS SE GAGNE À LA SOURIS (audit 2026-10-05, BUG-2).
// La récupération d'ÉPAULER était une échéance MURALE (Date.now() + 15 s) alors que
// le bouton se rafraîchit au tick (1 Hz) : un clic arrive forcément quelques ms
// après un tick, l'échéance tombait juste après le 15e, et le bouton ne se
// rallumait qu'au 16e — +48 de Fardeau pour −45. Fardeau aux clics 72, 75 … 99, puis
// cité écrasée à la 10e épaulée, quel que soit le réflexe : Ragnarök et fin du jeu
// verrouillés. La récupération se compte désormais en ticks de JEU.
//
// Ce test joue la partie comme l'interface : la vraie boucle tick(1), la crise
// réglée sans pause (doctrine automatique), et un clic au PREMIER tick où le bouton
// est actif (même formule que CityView), avec un temps de réaction humain.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import * as stateModule from "../state.js";
const { state, setState, hydrateState, invalidateRenderCache, setGamePaused } = stateModule;
import "../main.js"; // pont world.js ↔ core (registerWorldEffects) pour les apply() des crises
import { tick } from "../actions/tick.js";
import { atlasEpauler } from "../actions/myths.js";
import { registerChoiceDialog } from "../choiceDialog.js";
import { isMythCompleted } from "../../data/myths.js";
import { ATLAS_COUNT_THRESHOLD, ATLAS_SHOULDER_TARGET, ATLAS_SHOULDER_RELIEF } from "../../data/myths.js";
import { MID_GAME_FIXTURE, FIXED_NOW } from "./fixtures.js";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  registerChoiceDialog((d) => Promise.resolve((d.options || []).find((o) => o.stance === "stabiliser") || d.options[0]));
});
afterEach(() => {
  registerChoiceDialog(null);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// Bouton actif ? — la formule de CityView.jsx (atlasCdLeft).
const buttonActive = () => Math.max(0, state.atlasShoulderCdTicks || 0) <= 0;

async function playAtlas(reactionMs) {
  setState(hydrateState({
    ...MID_GAME_FIXTURE,
    mythsCompleted: {},
    activeMythId: "mythe_d_atlas",
    atlasFardeau: 0, atlasEpaules: 0, atlasCrushed: false,
    // Doctrine automatique : les crises se règlent sans dialogue ni pause.
    upgrades: { ...MID_GAME_FIXTURE.upgrades, conseil_de_crise: true },
    crisisDoctrine: { p25: "stabiliser", p50: "stabiliser", p75: "stabiliser" }
  }));
  setGamePaused(false);
  invalidateRenderCache("all");
  const fardeauAtClicks = [];
  for (let s = 0; s < 400; s += 1) {
    // Tick 1 Hz de main.js : l'horloge murale avance d'une seconde, tick(1).
    vi.setSystemTime(Date.now() + 1000);
    tick(1);
    await Promise.resolve();
    if (state.atlasCrushed || isMythCompleted("mythe_d_atlas")) break;
    // Un joueur attentif tient la Rupture et l'Usure loin du terminal : seul le
    // geste d'Atlas est jugé ici.
    state.instability = Math.min(state.instability, 0.2);
    state.timeWear = 0;
    if (buttonActive() && (state.atlasFardeau || 0) >= ATLAS_COUNT_THRESHOLD) {
      vi.setSystemTime(Date.now() + reactionMs); // le clic arrive APRÈS le tick
      fardeauAtClicks.push(Math.round(state.atlasFardeau));
      atlasEpauler();
      vi.setSystemTime(Date.now() - reactionMs);
    }
  }
  return { fardeauAtClicks, done: isMythCompleted("mythe_d_atlas"), crushed: state.atlasCrushed };
}

describe("Atlas — 12 épaulées au premier tick actif, sans marge sur le soulagement", () => {
  it.each([150, 20, 1])("réaction de %i ms : Mythe accompli, Fardeau stable aux clics", async (reactionMs) => {
    expect(ATLAS_SHOULDER_RELIEF).toBe(45); // la marge 45 → 48 reste une décision de Raph
    const res = await playAtlas(reactionMs);
    expect(res.crushed).toBe(false);
    expect(res.done).toBe(true);
    expect(res.fardeauAtClicks.length).toBe(ATLAS_SHOULDER_TARGET);
    // Dérive NULLE : le bouton se rallume pile quand le Fardeau a regagné les 45.
    expect(new Set(res.fardeauAtClicks).size).toBe(1);
  });
});
