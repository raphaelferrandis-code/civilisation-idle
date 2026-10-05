"use strict";
// VERSION ANGLAISE DU MOTEUR (audit 2026-10-05, I18N-3 et I18N-2).
//
// I18N-3 : deux décisions se lisaient sur le LIBELLÉ affiché. Le Grand Reset
// comparait `choice.label === "Annuler"` : traduit, « Cancel » passait dans la
// branche « réclamer » — un Grand Reset irréversible au lieu d'une annulation.
// Les Ruines actives comparaient « Aucune Ruine active » : en anglais, l'option
// « aucune » gardait les cases cochées (ChoiceDialog renvoie `{ ...option,
// selectedIds }`). Les options portent désormais des MARQUES (claim / cancel /
// none / deal) ; ces tests rendent les dialogues en anglais et cliquent comme un
// joueur, par le libellé qu'il lit.
//
// I18N-2 : les messages du moteur (journal, toasts) étaient en français nu dans
// la version anglaise.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { state, setState, hydrateState, buildGrandResetState, setGamePaused, setCollapseInProgress } from "../state.js";
import { registerChoiceDialog } from "../choiceDialog.js";
import { setLang } from "../i18n.js";
import { performGrandReset, rewardCitizenThought } from "../actions/building.js";
import { chooseActiveRuins, negotiateOrDeal } from "../actions/myths.js";
import { chronicle, chronicleBuilding } from "../actions/utils.js";
import { runCrisisAction } from "../actions/crisis.js";
import { ACTIVE_RUIN_DEFINITIONS } from "../../data/activeRuins.js";
import { buildings } from "../../data/buildings.js";
import { MID_GAME_FIXTURE, FIXED_NOW } from "./fixtures.js";

const allHeritages = Object.fromEntries(ACTIVE_RUIN_DEFINITIONS.map((d) => [d.stateKey, true]));
const lastLine = () => String(state.history[state.history.length - 1]);
// Clique l'option dont le libellé affiché vaut `label`, comme le ferait le joueur.
const clickLabel = (label, extra = {}) => (d) => {
  const option = d.options.find((o) => o.label === label);
  if (!option) throw new Error(`option « ${label} » absente : ${d.options.map((o) => o.label).join(" / ")}`);
  return Promise.resolve({ ...option, selectedIds: [], ...extra });
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  setState(hydrateState(MID_GAME_FIXTURE));
  // Le choix des Ruines actives laisse le jeu en pause (ses appelants la lèvent).
  setGamePaused(false);
  setCollapseInProgress(false);
  setLang("en");
});
afterEach(() => {
  setLang("fr");
  registerChoiceDialog(null);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("I18N-3 — les décisions ne lisent plus le libellé affiché", () => {
  it("Grand Reset en anglais : « Cancel » annule (avant : il lançait le reset)", async () => {
    setState(hydrateState({ ...MID_GAME_FIXTURE, grRevealed: { 1: true }, grandResetCount: 0 }));
    let seen = null;
    registerChoiceDialog((d) => { seen = d; return clickLabel("Cancel")(d); });
    await performGrandReset(1);
    expect(seen.options.map((o) => o.label)).toEqual(["Claim the seal", "Cancel"]);
    expect(seen.body).toMatch(/^You claim the /);
    expect(state.grandResetCount || 0).toBe(0);
    expect(state.grClaimed?.[1]).toBeFalsy();
    expect(String(state.population)).toBe("50000"); // la cité est intacte
  });

  it("Grand Reset en anglais : « Claim the seal » réclame bien le sceau", async () => {
    setState(hydrateState({ ...MID_GAME_FIXTURE, grRevealed: { 1: true }, grandResetCount: 0 }));
    registerChoiceDialog(clickLabel("Claim the seal"));
    const done = performGrandReset(1);
    await vi.advanceTimersByTimeAsync(1500); // le deuil d'1,3 s avant le reset
    await done;
    expect(state.grandResetCount).toBe(1);
    expect(state.grClaimed?.[1]).toBe(true);
    expect(lastLine()).toMatch(/^Grand Reset x1: everything has been erased/);
  });

  it("Ruines actives en anglais : « No Active Ruins » ignore les cases cochées", async () => {
    setState(hydrateState({ ...MID_GAME_FIXTURE, ...allHeritages, activeRuinIds: ["enee"] }));
    const checked = ACTIVE_RUIN_DEFINITIONS.slice(0, 2).map((d) => d.id);
    let seen = null;
    // ChoiceDialog renvoie l'option cliquée AVEC la sélection cochée.
    registerChoiceDialog((d) => { seen = d; return clickLabel("No Active Ruins", { selectedIds: checked })(d); });
    const ids = await chooseActiveRuins({ required: false });
    expect(seen.title).toBe("Active Ruins");
    expect(ids).toEqual([]);
    expect(state.activeRuinIds).toEqual([]);
  });

  it("Ruines actives en anglais : « Confirm » garde la sélection", async () => {
    setState(hydrateState({ ...MID_GAME_FIXTURE, ...allHeritages, activeRuinIds: [] }));
    const checked = ACTIVE_RUIN_DEFINITIONS.slice(0, 2).map((d) => d.id).filter((id) => id !== "atrides");
    registerChoiceDialog(clickLabel("Confirm", { selectedIds: checked }));
    const ids = await chooseActiveRuins({ required: false });
    expect(ids).toEqual(checked);
  });

  it("Caravane de l'Âge d'Or en anglais : « Haggle » puis « Accept » concluent le marché", async () => {
    setState(hydrateState({ ...MID_GAME_FIXTURE, activeMythId: "mythe_age_or", gold: 1e12, orDealsClosed: 0 }));
    const clicks = ["Haggle", "Accept"];
    const prices = [];
    registerChoiceDialog((d) => { prices.push(d.options[0].detail); return clickLabel(clicks.shift())(d); });
    vi.spyOn(Math, "random").mockReturnValue(0.99); // patience maximale : il ne part pas au 1er marchandage
    await negotiateOrDeal();
    expect(clicks).toEqual([]);
    expect(prices.length).toBe(2);
    expect(prices[1]).not.toBe(prices[0]); // le marchandage a fait baisser le prix
    expect(state.orDealsClosed).toBe(1);
  });
});

describe("I18N-2 — les messages du moteur parlent anglais", () => {
  it("préfixe de la Chronique, jalons de bâtiments, sans nom mis en minuscules", () => {
    chronicle("Test.");
    expect(lastLine()).toMatch(/^Year \d+, .+: Test\.$/);
    const scribes = buildings.find((b) => b.id === "scribes");
    chronicleBuilding(scribes, 0, 1);
    expect(lastLine()).toContain(`The first ${scribes.name} offer their services`);
    const watch = buildings.find((b) => b.id === "watch");
    chronicleBuilding(watch, 0, 1);
    expect(lastLine()).toContain("A militia forms beneath our ramparts");
  });

  it("bulle d'habitant : récompense et ligne du journal en anglais", () => {
    const reward = rewardCitizenThought("lightning", { name: "Alix" });
    expect(reward).toMatch(/^\+.+ Treasury$/);
    expect(lastLine()).toMatch(/^Windfall: Alix pours their good fortune into the treasury/);
  });

  it("édit de régulation et annonce du Grand Reset", () => {
    expect(buildGrandResetState(5, 11).history[0]).toContain("Ragnarok's x4 Ruins");
    expect(buildGrandResetState(5, 11).history[0]).not.toMatch(/effacé|Ruines/);
    // Édit de régulation (Rationnement) : la dépêche est en anglais.
    const before = state.history.length;
    runCrisisAction("rationing", { render: false });
    expect(state.history.length).toBe(before + 1);
    expect(lastLine()).toContain("The storehouses have been sealed and rationed");
  });

  it("refus d'un sceau pas encore débloqué : le journal le dit en anglais", async () => {
    await performGrandReset(2);
    expect(lastLine()).toMatch(/seal is not unlocked yet\. Grow your civilization/);
  });
});
