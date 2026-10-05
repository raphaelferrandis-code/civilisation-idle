"use strict";
// Audit du 2026-10-05, lot 5 (Mythes, tranche 2) :
//  - BUG-77 : sous Sisyphe, l'automate qui bâtit lâche le rocher sans que rien
//             ne le dise — le journal nomme désormais l'automate ;
//  - BUG-22 : recharger pendant une crise narrative la sautait sans effet (un
//             « Atlas prend le coup » gratuit à chaque F5) ;
//  - BUG-74 : le Script du Phénix écrivait « effondrement déclenché » avant que
//             collapse() ne refuse, à chaque tick d'une cité trop jeune ;
//  - SAV-13 : la relecture du journal gardait les 48 PLUS ANCIENNES lignes, et la
//             migration de l'arbre des Ruines en ajoutait une 49e.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  state, setState, hydrateState, defaultState, invalidateRenderCache, resetTemporaryRunState,
  setGamePaused, setCollapseInProgress, setMourning, collapseInProgress
} from "../state.js";
import { D } from "../num.js";
import { registerChoiceDialog } from "../choiceDialog.js";
import { checkCrisisThresholds } from "../actions/crisis.js";
import { checkAutomateRules, getAutomateRules, checkAutoScriptRules, getAutoScriptRules } from "../actions/automation.js";
import { buyBuilding } from "../actions/building.js";
import { sisyphePousser } from "../actions/myths.js";
import { ruinGain } from "../mechanics.js";
import { MID_GAME_FIXTURE, FIXED_NOW } from "./fixtures.js";

const lastLine = () => String(state.history[state.history.length - 1]);
// Une save, telle que l'autosave ou le beforeunload l'écrivent, puis relue.
const reload = () => {
  const saved = JSON.parse(JSON.stringify(state));
  setGamePaused(false); // module frais au rechargement
  setState(hydrateState(saved));
  invalidateRenderCache("all");
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
  setGamePaused(false);
  setCollapseInProgress(false);
});

afterEach(() => {
  registerChoiceDialog(null);
  setGamePaused(false);
  setCollapseInProgress(false);
  setMourning(false);
  vi.useRealTimers();
});

describe("BUG-77 — Sisyphe : le journal dit quand un automate lâche le rocher", () => {
  const sisypheEnMontee = () => {
    setState(hydrateState({
      ...MID_GAME_FIXTURE,
      hephHeritage: true,
      activeMythId: "mythe_de_sisyphe",
      crisisThresholds: { _25: true, _50: true, _75: true },
      mythsCompleted: {}
    }));
    invalidateRenderCache("all");
    sisyphePousser("food");
    expect(state.sisypheCran).toBe(1);
  };

  it("un automate qui bâtit en montée : rocher au pied, et la ligne nomme l'automate", () => {
    sisypheEnMontee();
    getAutomateRules().find((r) => r.id === "auto_buy_city").enabled = true;
    checkAutomateRules();
    expect(state.sisypheCran).toBe(0);              // la règle M5 ne change pas
    // (la ligne agrégée des mécanismes automatiques peut suivre)
    expect(state.history.some((l) => String(l).includes("un automate a bâti"))).toBe(true);
    expect(state.history.some((l) => String(l).includes("les mains quittent le rocher"))).toBe(false);
  });

  it("une main qui bâtit en montée garde sa ligne d'avant", () => {
    sisypheEnMontee();
    expect(buyBuilding("foragers")).toBe(true);
    expect(state.sisypheCran).toBe(0);
    expect(lastLine()).toContain("les mains quittent le rocher");
  });
});

describe("BUG-22 — recharger pendant une crise narrative la repropose", () => {
  // Cité au palier 25 % : aucune posture automatique (pas de Conseil de crise).
  const auPalier25 = () => {
    setState(defaultState());
    state.instability = 0.3;
    state.crisisThresholds = {};
    invalidateRenderCache("all");
  };

  it("modale ouverte, save, rechargement : la même crise est reproposée", async () => {
    auPalier25();
    const vues = [];
    // Le joueur ferme le jeu : la modale ne répond jamais.
    registerChoiceDialog((dialog) => { vues.push(dialog.id); return new Promise(() => {}); });
    checkCrisisThresholds();
    await Promise.resolve();
    expect(vues).toHaveLength(1);
    expect(state.crisisThresholds._25).toBe(true);  // le verrou empêche un 2e tir…
    expect(state.pendingCrisisSlot).toBe("_25");    // …mais il est réversible
    expect(state.recentCrisisIds.at(-1)).toBe(vues[0]);

    reload();
    expect(state.pendingCrisisSlot).toBeNull();
    expect(state.crisisThresholds._25).toBeUndefined();
    expect(state.recentCrisisIds).not.toContain(vues[0]); // pas de nouveau tirage au sort

    state.instability = 0.3;
    checkCrisisThresholds();
    await Promise.resolve();
    expect(vues).toHaveLength(2);
    expect(vues[1]).toBe(vues[0]);
  });

  it("choix appliqué : plus rien en attente, la crise ne revient pas au rechargement", async () => {
    auPalier25();
    let apply = null;
    registerChoiceDialog((dialog) => {
      const choice = dialog.options.find((o) => typeof o.apply === "function");
      apply = choice;
      return Promise.resolve(choice);
    });
    checkCrisisThresholds();
    await Promise.resolve();
    await Promise.resolve();
    expect(apply).not.toBeNull();
    expect(state.pendingCrisisSlot).toBeNull();
    reload();
    expect(state.crisisThresholds._25).toBe(true);
    let rouverte = false;
    registerChoiceDialog(() => { rouverte = true; return new Promise(() => {}); });
    checkCrisisThresholds();
    await Promise.resolve();
    expect(rouverte).toBe(false);
  });

  it("vieilles saves et valeurs farfelues : le verrou et les crises récentes sont gardés", () => {
    const sans = hydrateState({ crisisThresholds: { _25: true }, recentCrisisIds: ["a", "b"] });
    expect(sans.crisisThresholds).toEqual({ _25: true });
    expect(sans.recentCrisisIds).toEqual(["a", "b"]);
    expect(sans.pendingCrisisSlot).toBeNull();
    for (const bad of ["_99", 42, { slot: "_25" }]) {
      const out = hydrateState({ crisisThresholds: { _25: true }, recentCrisisIds: ["a", "b"], pendingCrisisSlot: bad });
      expect(out.crisisThresholds).toEqual({ _25: true });
      expect(out.recentCrisisIds).toEqual(["a", "b"]);
      expect(out.pendingCrisisSlot).toBeNull();
    }
  });

  it("le cycle neuf repart sans crise en attente", () => {
    setState(defaultState());
    state.pendingCrisisSlot = "_50";
    resetTemporaryRunState(state);
    expect(state.pendingCrisisSlot).toBeNull();
  });
});

describe("BUG-74 — Script du Phénix : la ligne seulement si la chute part", () => {
  const regleRupture = () => {
    const rule = getAutoScriptRules().find((r) => r.id === "rule_rupture");
    rule.enabled = true;
    rule.threshold = 1;
    return rule;
  };

  it("cité trop jeune (gain nul) : aucune chute, aucune ligne, même tick après tick", () => {
    setState(defaultState());
    state.cycleStartedAt = FIXED_NOW;
    state.instability = 0.5;
    invalidateRenderCache("all");
    expect(D(ruinGain(true)).floor().lte(0)).toBe(true); // précondition : collapse() refuse
    regleRupture();
    const avant = state.history.length;
    for (let i = 0; i < 5; i += 1) checkAutoScriptRules();
    expect(collapseInProgress).toBe(false);
    expect(state.history.length).toBe(avant);
  });

  it("gain positif : la chute part et la ligne s'écrit une fois", () => {
    setState(hydrateState(MID_GAME_FIXTURE));
    invalidateRenderCache("all");
    expect(D(ruinGain(true)).floor().gt(0)).toBe(true);
    regleRupture();
    const avant = state.history.length;
    checkAutoScriptRules();
    expect(collapseInProgress).toBe(true);
    expect(state.history.length).toBe(avant + 1);
    expect(lastLine()).toContain("effondrement déclenché");
  });
});

describe("SAV-13 — le journal garde ses 48 lignes les plus récentes", () => {
  it("relecture d'un journal trop long : les plus récentes restent, dans l'ordre", () => {
    const lignes = Array.from({ length: 60 }, (_, i) => `ligne ${i}`);
    const out = hydrateState({ history: lignes });
    expect(out.history).toHaveLength(48);
    expect(out.history[0]).toBe("ligne 12");
    expect(out.history[47]).toBe("ligne 59");
  });

  it("migration de l'arbre des Ruines sur un journal plein : 48 lignes, le remboursement en dernier", () => {
    const plein = Array.from({ length: 48 }, (_, i) => `ligne ${i}`);
    const out = hydrateState({ history: plein, upgrades: { root_cellars: true } });
    expect(out.history).toHaveLength(48);
    expect(out.history[47]).toContain("Arbre des Ruines");
    // Et le rechargement suivant ne la perd plus.
    expect(hydrateState(JSON.parse(JSON.stringify(out))).history[47]).toContain("Arbre des Ruines");
  });
});
