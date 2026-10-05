"use strict";
// VERSION ANGLAISE : TEXTES PERSISTÉS ET LIBELLÉS DE RÈGLES (audit 2026-10-05,
// I18N-6 et I18N-7).
//
// I18N-6 : la sauvegarde gardait des textes dans la langue du moment. Le titre
// final du Ragnarök (bandeau permanent) est désormais un DRAPEAU affiché via tr() ;
// sa ligne de journal part en queue (en tête, slice(0, 48) la jetait au log
// suivant, sans qu'elle ait jamais été vue) ; un Âge de Cadmos se reconnaît à son
// orientation et à l'index de son mot, et son nom est recomposé à l'affichage ;
// `eraName` des vestiges (jamais lu) n'est plus écrit.
//
// I18N-7 : les règles du Script et des automates s'affichaient avec un `label`
// français sans accents (« Acheter bati. (Cite) »). Le libellé vient d'une table
// par id, en {fr, en}, lue par les Options ET par la ligne de journal du Script.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import {
  state, setState, hydrateState, setGamePaused, setCollapseInProgress,
  normalizeCadmosChronicle, defaultAutoScriptRules, defaultAutomateRules, RULE_LABELS
} from "../state.js";
import { registerChoiceDialog } from "../choiceDialog.js";
import { setLang, tr } from "../i18n.js";
import { log } from "../actions/utils.js";
import { promptCadmosAgeName, engraveCadmosEpitaph } from "../actions/myths.js";
import { checkAutoScriptRules } from "../actions/automation.js";
import { completeCollapse } from "../actions/crisis.js";
import { D } from "../num.js";
import {
  getMythById, RAGNAROK_ID, RAGNAROK_FINAL_TITLE, RAGNAROK_FINAL_TITLE_TEXT,
  cadmosAgeName, cadmosOrientationLabel, cadmosWordIndex
} from "../../data/myths.js";
import { MID_GAME_FIXTURE, FIXED_NOW } from "./fixtures.js";

const lastLine = () => String(state.history[state.history.length - 1]);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  setState(hydrateState(MID_GAME_FIXTURE));
  setGamePaused(false);
  setCollapseInProgress(false);
  setLang("en");
});
afterEach(() => {
  setLang("fr");
  setCollapseInProgress(false);
  registerChoiceDialog(null);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("I18N-6 — titre final du Ragnarök", () => {
  it("le titre stocké reste un drapeau, le texte affiché suit la langue", () => {
    getMythById(RAGNAROK_ID).applyHeritage();
    expect(state.finalChronicleTitle).toBe(RAGNAROK_FINAL_TITLE); // sauvegardes inchangées
    expect(tr(RAGNAROK_FINAL_TITLE_TEXT)).toBe("Under the Gaze of Ragnarok");
    setLang("fr");
    expect(tr(RAGNAROK_FINAL_TITLE_TEXT)).toBe("Sous le regard du Ragnarok");
  });

  it("la ligne finale part en QUEUE du journal et survit à un journal plein", () => {
    state.history = Array.from({ length: 48 }, (_, i) => `ligne ${i}`);
    getMythById(RAGNAROK_ID).applyHeritage();
    expect(lastLine()).toBe("Under the Gaze of Ragnarok: all the Myths are completed.");
    expect(state.history.length).toBe(48);
    // Avant : ajoutée en tête, le log suivant la jetait sans qu'elle ait été lue.
    log("suite");
    expect(state.history.slice(-5)).toContain("Under the Gaze of Ragnarok: all the Myths are completed.");
  });

  it("pas de doublon, que la ligne déjà écrite soit française ou anglaise", () => {
    state.history = ["Sous le regard du Ragnarok : tous les Mythes sont accomplis."];
    getMythById(RAGNAROK_ID).applyHeritage();
    expect(state.history.length).toBe(1);
  });
});

describe("I18N-6 — Âges de Cadmos recomposés dans la langue du moment", () => {
  it("une entrée d'avant l'index (nommée en français) s'affiche en anglais", () => {
    const [old] = normalizeCadmosChronicle([{
      id: "cadmos_1", name: "L'Âge des Comptoirs", word: "Comptoirs",
      orientation: "gold", orientationLabel: "Trésor"
    }]);
    expect(old.wordIndex).toBeUndefined();
    expect(cadmosWordIndex(old)).toBe(0);
    expect(cadmosAgeName(old)).toBe("The Age of Counting-Houses");
    expect(cadmosOrientationLabel(old)).toBe("Treasury");
  });

  it("une entrée nommée en anglais s'affiche en français, et l'index survit à la sauvegarde", () => {
    setLang("fr");
    const [entry] = normalizeCadmosChronicle([{
      id: "cadmos_2", name: "The Age of Barns", word: "Barns", wordIndex: 0,
      orientation: "food", orientationLabel: "Food"
    }]);
    expect(entry.wordIndex).toBe(0);
    expect(cadmosAgeName(entry)).toBe("L'Âge des Granges");
    expect(cadmosOrientationLabel(entry)).toBe("Nourriture");
  });

  it("un mot inconnu garde le nom figé au choix (aucune perte)", () => {
    const entry = { name: "L'Âge des Mystères", word: "Mystères", orientation: "food" };
    expect(cadmosAgeName(entry)).toBe("L'Âge des Mystères");
  });

  it("le tirage reconnaît les mots récents et les Âges déjà nommés dans les DEUX langues", async () => {
    state.activeMythId = "mythe_de_cadmos";
    state.cadmosPromptPending = false;
    // Il ne reste qu'un mot libre par orientation, en mêlant formes fr et en.
    state.cadmosRecentWords = [
      "Granges", "Harvests", "Sillons", "Orchards", "Entrepôts",       // food → Semences / Seeds
      "Counting-Houses", "Marchands", "Caravans", "Monnaies", "Wharves", // gold → Balances / Scales
      "Veilleurs", "Sentinels", "Lois", "Ramparts", "Serments"         // stability → Archives
    ];
    // « Seeds » déjà nommé (entrée anglaise sans index) : le tirage passe au mot suivant.
    state.cadmosChronicle = [{ id: "c0", name: "The Age of Seeds", word: "Seeds", orientation: "food", orientationLabel: "Food" }];
    let seen = null;
    registerChoiceDialog((d) => {
      seen = d;
      return Promise.resolve(d.options.find((o) => o.cadmosAge.orientation === "gold"));
    });
    await promptCadmosAgeName({ type: "population", threshold: 25 });
    const byOrientation = Object.fromEntries(seen.options.map((o) => [o.cadmosAge.orientation, o]));
    expect(byOrientation.food.label).toBe("The Age of Barns");
    expect(byOrientation.gold.label).toBe("The Age of Scales");
    expect(byOrientation.stability.label).toBe("The Age of Archives");
    // L'Âge retenu est stocké par ses clés stables : index + forme française.
    const chosen = state.cadmosChronicle[state.cadmosChronicle.length - 1];
    expect(chosen.wordIndex).toBe(5);
    expect(chosen.word).toBe("Balances");
    expect(state.cadmosRecentWords[0]).toBe("Balances");
    // Rechargée en français, la même entrée parle français.
    setLang("fr");
    expect(cadmosAgeName(normalizeCadmosChronicle([chosen])[0])).toBe("L'Âge des Balances");
  });

  it("la stèle de Cadmos, à l'effondrement, nomme les Âges dans la langue du moment", () => {
    state.cadmosChronicle = [{ id: "c8", name: "L'Âge des Lois", word: "Lois", orientation: "stability", orientationLabel: "Stabilité" }];
    completeCollapse(D(1), "Test", "epitaph", "manual");
    expect(state.history.some((line) => line.includes("The stele of Cadmus keeps the memory of our passage engraved forever: The Age of Laws."))).toBe(true);
  });

  it("graver une épitaphe nomme l'Âge dans la langue du moment", () => {
    state.cadmosHeritage = true;
    state.cadmosPermanentEpitaphs = [];
    state.cadmosLastRunChronicle = [{ id: "c9", name: "L'Âge des Lois", word: "Lois", orientation: "stability", orientationLabel: "Stabilité" }];
    engraveCadmosEpitaph("c9");
    expect(lastLine()).toBe("Epitaph engraved: The Age of Laws. Its orientation becomes a permanent Name of Power.");
  });
});

describe("I18N-7 — libellés des règles du Script et des automates", () => {
  it("chaque règle par défaut a son libellé {fr, en} ; les défauts n'en portent plus", () => {
    for (const rule of [...defaultAutoScriptRules(), ...defaultAutomateRules()]) {
      expect(rule.label).toBeUndefined();
      expect(RULE_LABELS[rule.id]?.fr).toBeTruthy();
      expect(RULE_LABELS[rule.id]?.en).toBeTruthy();
    }
    expect(RULE_LABELS.auto_buy_city.fr).toBe("Acheter un bâtiment (Cité) si abordable");
    expect(RULE_LABELS.rule_time.fr).toBe("Effondrer après");
  });

  it("le `label` français d'une vieille sauvegarde n'est pas relu", () => {
    setState(hydrateState({
      ...MID_GAME_FIXTURE,
      autoScriptRules: [{ id: "rule_rupture", type: "rupture", label: "Effondrer si Rupture atteint", unit: "%", threshold: 50, enabled: true }]
    }));
    const rule = state.autoScriptRules.find((r) => r.id === "rule_rupture");
    expect(rule.label).toBeUndefined();
    expect(rule.enabled).toBe(true);
    expect(rule.threshold).toBe(50);
  });

  it("la ligne de journal du Script est écrite en anglais, avec le libellé de la table", () => {
    setState(hydrateState({
      ...MID_GAME_FIXTURE,
      autoScriptRules: [{ id: "rule_rupture", enabled: true, threshold: 50 }]
    }));
    state.instability = 0.6;
    // La ligne ne s'écrit plus que si la chute part VRAIMENT (BUG-74) : on la
    // laisse partir, sa séquence reste suspendue sur les minuteurs simulés.
    checkAutoScriptRules();
    expect(lastLine()).toBe("Script: “Collapse when Rupture reaches 50%”, collapse triggered.");
  });

  it("… et en français, accents compris", () => {
    setLang("fr");
    setState(hydrateState({
      ...MID_GAME_FIXTURE,
      autoScriptRules: [{ id: "rule_time", enabled: true, threshold: 10 }]
    }));
    state.cycleStartedAt = Date.now() - 11 * 60_000;
    checkAutoScriptRules();
    expect(lastLine()).toBe("Script : « Effondrer après 10 min », effondrement déclenché.");
  });
});
