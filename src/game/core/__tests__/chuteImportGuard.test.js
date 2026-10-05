"use strict";
// PAS DE PARTIE REMPLACÉE PENDANT LA CHUTE (docs/PLAN-CHUTE.md).
// runCollapseSequence attend la carte (vague, nuit, noir : ~13 à 18 s), puis appelle
// completeCollapse sur l'état ALORS en place. Un import ou un emplacement chargé
// pendant ce temps tombait donc à la fin de la séquence, avec le gain de l'ancienne
// partie. importSave et loadSlot refusent tant que la chute est en cours
// (collapseUnderway : collapseInProgress, ou state.chute pendant que la carte la joue).
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  state, setState, hydrateState, invalidateRenderCache, setCollapseInProgress, setChuteCinematic,
  collapseInProgress, collapseUnderway
} from "../state.js";
import { importSave } from "../main.js";
import { loadSlot } from "../saveSlots.js";
import { SAVE_KEY, PENDING_LOAD_KEY } from "../saveKey.js";
import { encodeSaveText } from "../utils.js";
import { MID_GAME_FIXTURE, FIXED_NOW } from "./fixtures.js";

const other = () => JSON.stringify({ ...MID_GAME_FIXTURE, cityName: "Ailleurs", cycles: 99 });
let store;
// La partie chargée attend le rechargement qui la met en place (SAV-8).
const pendingCity = () => (store.has(PENDING_LOAD_KEY) ? JSON.parse(store.get(PENDING_LOAD_KEY)).save.cityName : null);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
  setState(hydrateState({ ...MID_GAME_FIXTURE, cityName: "Ici" }));
  invalidateRenderCache("all");
  store = new Map([[`${SAVE_KEY}-slot0`, other()]]);
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
  };
});
afterEach(() => {
  setCollapseInProgress(false);
  setChuteCinematic(false);
  delete globalThis.localStorage;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("import et emplacement pendant la chute", () => {
  it("refusés du déclenchement à la stèle (collapseInProgress), la séquence garde ses verrous", () => {
    setCollapseInProgress(true);
    expect(collapseUnderway()).toBe(true);
    expect(importSave(encodeSaveText(other()))).toBe(false);
    expect(loadSlot(0)).toBe(false);
    expect(state.cityName).toBe("Ici");
    expect(pendingCity()).toBe(null);        // rien n'attend le rechargement non plus
    expect(collapseInProgress).toBe(true);   // importSave ne relâche plus le verrou
  });

  it("refusés tant que la carte joue la chute (state.chute), lever compris", () => {
    setChuteCinematic(true);
    expect(collapseUnderway()).toBe(true);
    expect(importSave(encodeSaveText(other()))).toBe(false);
    expect(loadSlot(0)).toBe(false);
    expect(state.cityName).toBe("Ici");
  });

  it("hors chute, rien ne change : l'emplacement se charge, l'import passe", () => {
    expect(collapseUnderway()).toBe(false);
    expect(loadSlot(0)).toBe(true);
    expect(pendingCity()).toBe("Ailleurs");
    store.delete(PENDING_LOAD_KEY);
    expect(importSave(encodeSaveText(other()))).toBe(true);
    expect(pendingCity()).toBe("Ailleurs");
  });
});
