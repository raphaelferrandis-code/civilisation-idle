// LA FENÊTRE DES RUINES ACTIVES (audit 2026-10-05, BUG-1).
// openChoiceDialog recopiait huit champs nommés et jetait les autres : les cases
// (multiSelectOptions) et la sélection de départ (defaultSelectedIds) n'arrivaient
// jamais à ChoiceDialog. Sous Antée, l'unique « Valider » exige 4 cases : bouton
// grisé à vie, fenêtre impossible à fermer, Antée inaccomplissable — donc ni
// Ragnarök ni sceau XI. Le `label` se perdait aussi (« Crise active » partout).
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import * as stateModule from "../state.js";
const { state, setState, hydrateState } = stateModule;
import { registerChoiceDialog, expectChoiceDialog } from "../choiceDialog.js";
import { openChoiceDialog } from "../events.js";
import { chooseActiveRuins, activateMyth, resumeActiveRuinsChoiceIfPending } from "../actions/myths.js";
import { ACTIVE_RUIN_DEFINITIONS, ANTEE_MIN_ACTIVE_RUINS } from "../../data/activeRuins.js";
import { MYTHS } from "../../data/myths.js";
import { MID_GAME_FIXTURE, FIXED_NOW } from "./fixtures.js";

// Tous les Héritages qui peuvent devenir des Ruines actives.
const allHeritages = Object.fromEntries(ACTIVE_RUIN_DEFINITIONS.map((d) => [d.stateKey, true]));
const someHeritages = (n) => Object.fromEntries(ACTIVE_RUIN_DEFINITIONS.slice(0, n).map((d) => [d.stateKey, true]));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  expectChoiceDialog(false);
  registerChoiceDialog(null);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("openChoiceDialog transmet le dialogue entier", () => {
  it("garde les champs inconnus de l'ancienne liste (cases, sélection, label)", async () => {
    let seen = null;
    registerChoiceDialog((d) => { seen = d; return Promise.resolve(d.options[0]); });
    await openChoiceDialog({
      label: { fr: "Grand Reset", en: "Grand Reset" },
      title: "t", body: "b",
      multiSelectOptions: [{ id: "a", label: "A" }],
      defaultSelectedIds: ["a"],
      options: [{ label: "OK" }]
    });
    expect(seen.multiSelectOptions).toEqual([{ id: "a", label: "A" }]);
    expect(seen.defaultSelectedIds).toEqual(["a"]);
    expect(seen.label).toEqual({ fr: "Grand Reset", en: "Grand Reset" });
    // Les défauts d'avant restent posés.
    expect(seen.mourning).toBe(false);
    expect(seen.preventClose).toBe(false);
    expect(seen.variant).toBe("");
  });
});

describe("chooseActiveRuins sous Antée", () => {
  it("la fenêtre reçoit les cases et la sélection de départ, et la validation à 4 scelle les Ruines", async () => {
    setState(hydrateState({ ...MID_GAME_FIXTURE, ...allHeritages, activeRuinIds: ["enee"] }));
    let seen = null;
    registerChoiceDialog((d) => {
      seen = d;
      const ids = d.multiSelectOptions.slice(0, ANTEE_MIN_ACTIVE_RUINS).map((o) => o.id);
      return Promise.resolve({ ...d.options[0], selectedIds: ids });
    });
    const ids = await chooseActiveRuins({ required: true, title: "Antée - Ruines actives" });
    expect(Array.isArray(seen.multiSelectOptions)).toBe(true);
    expect(seen.multiSelectOptions.length).toBe(ACTIVE_RUIN_DEFINITIONS.length);
    expect(seen.defaultSelectedIds).toEqual(["enee"]);
    expect(seen.preventClose).toBe(true);
    expect(seen.options[0].minSelected).toBe(ANTEE_MIN_ACTIVE_RUINS);
    expect(seen.label).toEqual({ fr: "Ruines actives", en: "Active Ruins" });
    expect(ids.length).toBe(ANTEE_MIN_ACTIVE_RUINS);
    expect(state.activeRuinIds.length).toBe(ANTEE_MIN_ACTIVE_RUINS);
    expect(state.pendingActiveRuinsChoice).toBe(false);
  });

  it("filet : moins d'Héritages que le seuil — Antée refuse le pacte AVANT le reset, sans fenêtre", async () => {
    const antee = MYTHS.find((m) => m.id === "mythe_d_antee");
    const actsDone = Object.fromEntries(MYTHS.filter((m) => m.act === 1 || m.act === 2).map((m) => [m.id, true]));
    setState(hydrateState({
      ...MID_GAME_FIXTURE, ...someHeritages(ANTEE_MIN_ACTIVE_RUINS - 1),
      grandResetCount: 3, mythsCompleted: actsDone, activeMythId: null, cycles: 77
    }));
    let opened = 0;
    registerChoiceDialog((d) => { opened += 1; return Promise.resolve(d.options[0]); });
    await activateMyth(antee.id);
    expect(opened).toBe(0);
    expect(state.activeMythId).toBeNull();
    expect(String(state.population)).toBe("50000"); // aucun reset : la cité est intacte
  });

  it("filet : reprise au démarrage d'un choix d'Antée sans assez d'Héritages — pacte abandonné, pas de fenêtre", async () => {
    setState(hydrateState({
      ...MID_GAME_FIXTURE, ...someHeritages(2),
      activeMythId: "mythe_d_antee", pendingActiveRuinsChoice: true
    }));
    let opened = 0;
    registerChoiceDialog((d) => { opened += 1; return Promise.resolve(d.options[0]); });
    await resumeActiveRuinsChoiceIfPending();
    expect(opened).toBe(0);
    expect(state.activeMythId).toBeNull();
    expect(state.pendingActiveRuinsChoice).toBe(false);
  });
});

// LA REPRISE AU DÉMARRAGE (audit 2026-10-05, BUG-4). L'effet d'App qui lance
// startGameLoop tournait AVANT celui qui branche l'interface de choix : la reprise
// d'un choix interrompu recevait la réponse par défaut (« Valider », rien de
// coché) — Ruines actives effacées, pacte d'Antée perdu en silence. App branche
// désormais l'interface d'abord ; choiceDialog.js garde aussi en file une demande
// faite avant le branchement quand l'interface est annoncée (main.jsx).
describe("reprise du choix avant le branchement de l'interface", () => {
  it("une demande faite avant l'enregistrement est servie par l'interface, pas par le choix par défaut", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expectChoiceDialog();
    const answer = openChoiceDialog({ title: "t", body: "b", options: [{ label: "A" }, { label: "B" }] });
    let seen = null;
    registerChoiceDialog((d) => { seen = d; return Promise.resolve(d.options[1]); });
    const result = await answer;
    expect(seen?.title).toBe("t");
    expect(result.label).toBe("B");
    expect(result.uiUnavailable).toBeUndefined();
    expect(err).not.toHaveBeenCalled();
  });

  it("sous Antée : la reprise au démarrage ouvre la fenêtre et garde la sélection du joueur", async () => {
    setState(hydrateState({
      ...MID_GAME_FIXTURE, ...allHeritages,
      activeMythId: "mythe_d_antee", pendingActiveRuinsChoice: true, activeRuinIds: ["enee"]
    }));
    expectChoiceDialog();
    // startGameLoop lance la reprise SANS l'attendre — avant le branchement.
    const resumed = resumeActiveRuinsChoiceIfPending();
    let seen = null;
    registerChoiceDialog((d) => {
      seen = d;
      return Promise.resolve({ ...d.options[0], selectedIds: d.multiSelectOptions.slice(0, ANTEE_MIN_ACTIVE_RUINS).map((o) => o.id) });
    });
    await resumed;
    expect(seen?.preventClose).toBe(true);
    expect(seen?.defaultSelectedIds).toEqual(["enee"]);
    expect(state.activeRuinIds.length).toBe(ANTEE_MIN_ACTIVE_RUINS);
    expect(state.pendingActiveRuinsChoice).toBe(false);
    expect(state.activeMythId).toBe("mythe_d_antee");
  });

  it("deux demandes en file : servies l'une après l'autre, jamais deux fenêtres à la fois", async () => {
    expectChoiceDialog();
    const first = openChoiceDialog({ title: "1", options: [{ label: "x" }] });
    const second = openChoiceDialog({ title: "2", options: [{ label: "y" }] });
    const open = [];
    let release = null;
    registerChoiceDialog((d) => {
      open.push(d.title);
      return new Promise((resolve) => { release = () => resolve(d.options[0]); });
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(open).toEqual(["1"]);
    release();
    expect((await first).label).toBe("x");
    await Promise.resolve();
    await Promise.resolve();
    expect(open).toEqual(["1", "2"]);
    release();
    expect((await second).label).toBe("y");
  });

  it("sans annonce d'interface (tests, headless) : réponse par défaut immédiate, comme avant", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const answer = await openChoiceDialog({ title: "t", options: [{ label: "A" }] });
    expect(answer.uiUnavailable).toBe(true);
  });
});
