// MYTHES : CE QU'UN RECHARGEMENT OU UNE PAUSE NE DOIT PAS CASSER (audit 2026-10-05, lot 5).
//   BUG-5  — Cadmos : une save prise modale « Nommer l'Âge » ouverte rechargeait
//            cadmosPromptPending à true, rien ne rouvrait la modale, et chaque tick
//            sortait avant les crises, les automates et la crise terminale.
//            Une réponse tardive (Édit qui effondre modale ouverte) s'inscrivait
//            dans la Chronique du cycle suivant.
//   BUG-25 — Ruine active « Pacte signé d'office » : signée par le verbe joueur,
//            gardé par la pause du choix des Ruines actives, elle ne s'appliquait
//            jamais (fardeau gratuit, Antée compris).
//   SAV-10 — hydrateState plafonnait la dette des Atrides et la Pente du rocher
//            à MAX_SAFE_INTEGER : 1e100 redevenait 9e15 au rechargement.
import { describe, it, expect, afterEach } from "vitest";

import * as stateModule from "../state.js";
const { state, setState, hydrateState, resetTemporaryRunState, setGamePaused } = stateModule;
import { registerChoiceDialog } from "../choiceDialog.js";
import { tick } from "../actions/tick.js";
import { promptCadmosAgeName, chooseActiveRuins, activateAtridesPact } from "../actions/myths.js";
import { ACTIVE_RUIN_DEFINITIONS, ANTEE_MIN_ACTIVE_RUINS } from "../../data/activeRuins.js";
import { roundTrip } from "../../../test/core.js";

// chooseActiveRuins laisse le jeu en pause (ses appelants le relancent).
afterEach(() => {
  registerChoiceDialog(null);
  setGamePaused(false);
});

// Laisse les `await` des promesses déjà résolues se dérouler.
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

// Save prise PENDANT la modale de Cadmos (autosave 10 s / beforeunload) : le
// palier « population:25 » a reçu son nom, « population:60 » attend le sien.
function cadmosSaveMidPrompt(extra = {}) {
  return JSON.parse(JSON.stringify({
    activeMythId: "mythe_de_cadmos",
    grandResetCount: 1,
    population: 100,
    cadmosPromptPending: true,
    cadmosTriggeredMilestones: { "population:25": true, "population:60": true },
    cadmosChronicle: [{ id: "c1", name: "Âge du Blé", word: "Blé", orientation: "food", milestoneType: "population", threshold: 25, cycle: 0 }],
    cycleStartedAt: Date.now() - 60_000,
    lastTick: Date.now(),
    ...extra
  }));
}

describe("BUG-5 — Cadmos : la modale « Nommer l'Âge » survit au rechargement", () => {
  it("hydrateState baisse le drapeau et rend le palier en attente, sans toucher aux paliers nommés", () => {
    const hydrated = hydrateState(cadmosSaveMidPrompt());
    expect(hydrated.cadmosPromptPending).toBe(false);
    expect(hydrated.cadmosTriggeredMilestones).toEqual({ "population:25": true });
    // Sans modale en vol, les paliers déclenchés restent tels quels.
    const calm = hydrateState(cadmosSaveMidPrompt({ cadmosPromptPending: false }));
    expect(calm.cadmosTriggeredMilestones).toEqual({ "population:25": true, "population:60": true });
  });

  it("au premier tick, le palier est reproposé ; une fois nommé, crises et seuils reprennent", async () => {
    setState(hydrateState(cadmosSaveMidPrompt()));
    state.instability = 0.6;
    state.crisisThresholds = {};
    const asked = [];
    // On répond à Cadmos ; toute autre fenêtre (crise) reste ouverte.
    registerChoiceDialog((dialog) => {
      if (dialog.variant !== "cadmos") return new Promise(() => {});
      asked.push(dialog);
      return Promise.resolve(dialog.options[0]);
    });
    for (let i = 0; i < 5; i++) {
      tick(1);
      await flush();
    }
    expect(asked.length).toBe(1);
    expect(state.cadmosChronicle.map((e) => `${e.milestoneType}:${e.threshold}`)).toEqual(["population:25", "population:60"]);
    expect(state.cadmosPromptPending).toBe(false);
    // Le tick ne sort plus avant checkCrisisThresholds : le seuil de 25 % est franchi.
    expect(state.crisisThresholds._25).toBe(true);
  });

  it("une réponse arrivée après un effondrement n'est pas gravée dans le cycle suivant", async () => {
    setState(hydrateState(cadmosSaveMidPrompt({ cadmosPromptPending: false, cadmosChronicle: [], cadmosTriggeredMilestones: {} })));
    let answer;
    registerChoiceDialog((dialog) => new Promise((resolve) => { answer = () => resolve(dialog.options[0]); }));
    const pending = promptCadmosAgeName({ type: "population", threshold: 25, value: 100 });
    expect(state.cadmosPromptPending).toBe(true);
    // L'Édit effondre la cité, modale ouverte : nouveau cycle, Mythe levé.
    state.cycles = (state.cycles || 0) + 1;
    resetTemporaryRunState(state);
    state.activeMythId = null;
    answer();
    await pending;
    expect(state.cadmosChronicle).toEqual([]);
    expect(state.cadmosCycleBonuses).toEqual({ food: 0, gold: 0, stability: 0 });
    expect(state.cadmosPromptPending).toBe(false);
  });

  it("même cycle, Mythe terminé : rien n'est gravé mais le drapeau est levé (sinon chaque tick resterait bloqué)", async () => {
    setState(hydrateState(cadmosSaveMidPrompt({ cadmosPromptPending: false, cadmosChronicle: [], cadmosTriggeredMilestones: {} })));
    let answer;
    registerChoiceDialog((dialog) => new Promise((resolve) => { answer = () => resolve(dialog.options[0]); }));
    const pending = promptCadmosAgeName({ type: "population", threshold: 25, value: 100 });
    state.activeMythId = null;
    answer();
    await pending;
    expect(state.cadmosChronicle).toEqual([]);
    expect(state.cadmosPromptPending).toBe(false);
  });

  it("témoin : une réponse dans le même cycle est gravée comme avant", async () => {
    setState(hydrateState(cadmosSaveMidPrompt({ cadmosPromptPending: false, cadmosChronicle: [], cadmosTriggeredMilestones: {} })));
    registerChoiceDialog((dialog) => Promise.resolve(dialog.options[0]));
    await promptCadmosAgeName({ type: "population", threshold: 25, value: 100 });
    expect(state.cadmosChronicle.length).toBe(1);
    expect(state.cadmosChronicle[0].threshold).toBe(25);
    expect(state.cadmosPromptPending).toBe(false);
  });
});

describe("BUG-25 — la Ruine active « Pacte signé d'office » scelle bien le pacte", () => {
  it("hors Mythe : choisie dans la fenêtre (jeu en pause), le pacte est scellé", async () => {
    setState(hydrateState({ atridesHeritage: true, cycleStartedAt: Date.now() }));
    registerChoiceDialog((dialog) => Promise.resolve({ ...dialog.options[0], selectedIds: ["atrides"] }));
    await chooseActiveRuins({ required: false });
    expect(state.activeRuinIds).toEqual(["atrides"]);
    expect(state.atridesPactActive).toBe(true);
  });

  it("sous Antée : porté parmi les fardeaux, le pacte est scellé aussi", async () => {
    const heritages = Object.fromEntries(ACTIVE_RUIN_DEFINITIONS.map((d) => [d.stateKey, true]));
    setState(hydrateState({ ...heritages, activeMythId: "mythe_d_antee", cycleStartedAt: Date.now() }));
    registerChoiceDialog((dialog) => {
      const others = dialog.multiSelectOptions.map((o) => o.id).filter((id) => id !== "atrides");
      return Promise.resolve({ ...dialog.options[0], selectedIds: ["atrides", ...others.slice(0, ANTEE_MIN_ACTIVE_RUINS - 1)] });
    });
    await chooseActiveRuins({ required: true });
    expect(state.activeRuinIds).toContain("atrides");
    expect(state.atridesPactActive).toBe(true);
  });

  it("non choisie : pas de pacte ; et le bouton du joueur reste gardé sous un Mythe", async () => {
    setState(hydrateState({ atridesHeritage: true, cycleStartedAt: Date.now() }));
    registerChoiceDialog((dialog) => Promise.resolve({ ...dialog.options[1], selectedIds: [] }));
    await chooseActiveRuins({ required: false });
    expect(state.atridesPactActive).toBe(false);
    state.activeMythId = "mythe_d_antee";
    activateAtridesPact();
    expect(state.atridesPactActive).toBe(false);
  });
});

describe("SAV-10 — dette des Atrides et Pente du rocher au-delà de 9e15", () => {
  // La Pente, elle, a un plafond de jeu depuis BUG-35 (×20, au cran et à
  // l'hydratation) : une save d'avant à 1e17 y revient, sans retomber à ×1.
  it("un aller-retour JSON → hydrateState garde 1e100 de dette ; une Pente à 1e17 revient au plafond ×20", () => {
    const out = roundTrip({ atridesDebt: 1e100, sisypheMult: 1e17 });
    expect(out.atridesDebt).toBe(1e100);
    expect(out.sisypheMult).toBe(20);
    expect(roundTrip({ sisypheMult: 7.4 }).sisypheMult).toBe(7.4);
  });

  it("garde aussi la dette plafonnée par le tick (Number.MAX_VALUE)", () => {
    expect(roundTrip({ atridesDebt: Number.MAX_VALUE }).atridesDebt).toBe(Number.MAX_VALUE);
  });

  it("les valeurs invalides retombent toujours sur leurs défauts", () => {
    const out = roundTrip({ atridesDebt: -5, sisypheMult: 0.5 });
    expect(out.atridesDebt).toBe(0);
    expect(out.sisypheMult).toBe(1);
    const bad = hydrateState({ atridesDebt: "abc", sisypheMult: Infinity });
    expect(bad.atridesDebt).toBe(0);
    expect(bad.sisypheMult).toBe(1);
  });
});
