"use strict";
// Crises « qui comptent » (pilote 2026-10) : une option de crise dépose une part
// ABSOLUE sur le foyer de la crise jusqu'à la chute (state.foyerShift), au lieu
// de pousser l'aiguille de la jauge — qui revenait vers la cible en quelques
// secondes. On verrouille : l'effet sur la CIBLE, la protection par la réforme,
// le gain de « profiter » (préparation de chute), le critère « stabilisée », le
// tirage par foyer dominant, la projection affichée, et l'honnêteté des étiquettes.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import * as stateModule from "../state.js";
const { state, setState, hydrateState, invalidateRenderCache, setGamePaused, resetTemporaryRunState } = stateModule;
// Importer main.js enregistre le pont world.js↔core (registerWorldEffects),
// nécessaire pour que les apply() des crises agissent sur l'état.
import "../main.js";
import { autoResolveCrisisEvent, openCrisisEvent, pickCrisisEvent } from "../actions/crisis.js";
import { pressureBreakdown } from "../mechanics.js";
import { registerChoiceDialog } from "../choiceDialog.js";
import { CRISIS_POOL } from "../../data/world.js";
import { CRISIS_TREAT_SHIFT, CRISIS_PROFIT_SHIFT, CRISIS_PROFIT_PREP, COLLAPSE_PREP_MAX } from "../balance.js";
import { MID_GAME_FIXTURE, FIXED_NOW } from "./fixtures.js";

const PILOTS = CRISIS_POOL.filter((e) => (e.options || []).some((o) => typeof o.foyerShift === "number"));
const byStance = (ev, stance) => ev.options.find((o) => o.stance === stance);
const target = () => { invalidateRenderCache("all"); return pressureBreakdown().total; };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
  setState(hydrateState(MID_GAME_FIXTURE));
  setGamePaused(false);
  invalidateRenderCache("all");
});

afterEach(() => {
  registerChoiceDialog(null);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("crises qui comptent — données", () => {
  it("le pilote existe et chaque crise y a une option traiter + une option profiter sur SON foyer", () => {
    expect(PILOTS.length).toBeGreaterThanOrEqual(3);
    for (const ev of PILOTS) {
      const treat = byStance(ev, "stabiliser");
      const profit = byStance(ev, "temporiser");
      expect(treat.foyer).toBe(ev.foyer);
      expect(profit.foyer).toBe(ev.foyer);
      expect(treat.foyerShift).toBeCloseTo(-CRISIS_TREAT_SHIFT[ev.threshold], 9);
      expect(profit.foyerShift).toBeCloseTo(CRISIS_PROFIT_SHIFT[ev.threshold], 9);
      expect(profit.prep).toBeCloseTo(CRISIS_PROFIT_PREP[ev.threshold], 9);
    }
  });

  it("les étiquettes disent les vrais montants (foyer, Ruines)", () => {
    for (const ev of PILOTS) {
      for (const o of ev.options) {
        const labels = o.effects.map((e) => e.label).join(" | ");
        expect(labels).toContain(`${Math.round(Math.abs(o.foyerShift) * 100)}%`);
        if (o.stance === "temporiser") expect(labels).toContain(`+${Math.round(o.prep * 100)}%`);
      }
    }
  });

  it("toutes les crises du pool déclarent leur foyer", () => {
    for (const ev of CRISIS_POOL) {
      expect(["scarcity", "inequality", "complexity", "dissent"]).toContain(ev.foyer);
    }
  });
});

describe("crises qui comptent — moteur", () => {
  it("la part déposée déplace la CIBLE (pas seulement l'aiguille), et la réforme l'amortit", () => {
    const base = target();
    state.foyerShift.inequality = 0.10;
    const raw = target() - base;
    expect(raw).toBeGreaterThan(0.05);
    // Même dette sur un foyer réformé à 50 % : la moitié seulement passe.
    state.foyerReform.inequality = 0.5;
    const reformedBase = (() => { state.foyerShift.inequality = 0; return target(); })();
    state.foyerShift.inequality = 0.10;
    const reformed = target() - reformedBase;
    expect(reformed).toBeCloseTo(raw * 0.5, 2);
  });

  it("un foyer ne devient jamais négatif", () => {
    state.foyerShift.dissent = -1;
    invalidateRenderCache("all");
    expect(pressureBreakdown().dissent).toBe(0);
  });

  it("traiter : production payée, foyer allégé, crise comptée comme stabilisée", () => {
    const ev = PILOTS[0];
    const treat = byStance(ev, "stabiliser");
    state.cycleCrisesResolved = 0;
    autoResolveCrisisEvent(ev, "stabiliser");
    expect(state.foyerShift[ev.foyer]).toBeCloseTo(treat.foyerShift, 9);
    expect(state.crisisProduction[treat.malusRes]).toBeLessThan(1);
    expect(state.cycleCrisesResolved).toBe(1);
  });

  it("profiter : préparation de chute gagnée, foyer alourdi, crise NON stabilisée", () => {
    const ev = PILOTS[0];
    const profit = byStance(ev, "temporiser");
    state.cycleCrisesResolved = 0;
    state.collapsePreparation = 0;
    autoResolveCrisisEvent(ev, "temporiser");
    expect(state.foyerShift[ev.foyer]).toBeCloseTo(profit.foyerShift, 9);
    expect(state.collapsePreparation).toBeCloseTo(profit.prep, 9);
    expect(state.cycleCrisesResolved).toBe(0);
  });

  it("la préparation gagnée en profitant respecte le plafond des édits", () => {
    state.collapsePreparation = COLLAPSE_PREP_MAX - 0.01;
    autoResolveCrisisEvent(PILOTS[0], "temporiser");
    expect(state.collapsePreparation).toBe(COLLAPSE_PREP_MAX);
  });

  it("la dette repart de zéro à chaque cycle", () => {
    state.foyerShift.scarcity = 0.3;
    resetTemporaryRunState(state);
    expect(state.foyerShift.scarcity).toBe(0);
  });

  it("une sauvegarde garde la dette signée, bornée à [-1, 1]", () => {
    const h = hydrateState({ ...MID_GAME_FIXTURE, foyerShift: { scarcity: -0.2, inequality: 5, complexity: "x" } });
    expect(h.foyerShift.scarcity).toBeCloseTo(-0.2, 9);
    expect(h.foyerShift.inequality).toBe(1);
    expect(h.foyerShift.complexity).toBe(0);
    expect(h.foyerShift.dissent).toBe(0);
  });
});

describe("crises qui comptent — tirage et fenêtre", () => {
  it("le tirage préfère une crise du foyer qui pèse le plus", () => {
    // Dissidence rendue écrasante : la crise du palier 25 % doit en parler.
    state.foyerShift.dissent = 0.9;
    state.recentCrisisIds = [];
    expect(pickCrisisEvent(0.25).foyer).toBe("dissent");
  });

  it("la variété passe avant : une crise déjà vue n'est pas reprise pour son foyer", () => {
    state.foyerShift.dissent = 0.9;
    const dissent25 = CRISIS_POOL.filter((e) => e.threshold === 0.25 && e.foyer === "dissent").map((e) => e.id);
    state.recentCrisisIds = dissent25;
    expect(pickCrisisEvent(0.25).foyer).not.toBe("dissent");
  });

  it("la fenêtre montre où chaque option met la cible, sans rien appliquer", async () => {
    const ev = PILOTS[0];
    let shown = null;
    registerChoiceDialog((dialog) => { shown = dialog; return Promise.resolve(dialog.options[0]); });
    const before = { ...state.foyerShift };
    const baseTarget = target();
    const pending = openCrisisEvent(ev);
    const chip = (o) => o.effects.find((e) => /Rupture/.test(e.label));
    expect(shown).not.toBeNull();
    const treatShown = shown.options.find((o) => o.stance === "stabiliser");
    const profitShown = shown.options.find((o) => o.stance === "temporiser");
    const pctOf = (o) => Number(chip(o).label.match(/(\d+)/)[1]);
    expect(pctOf(treatShown)).toBeLessThanOrEqual(Math.round(baseTarget * 100));
    expect(pctOf(profitShown)).toBeGreaterThan(pctOf(treatShown));
    // Projeter n'a rien laissé dans l'état.
    expect(state.foyerShift).toEqual(before);
    await pending;
  });
});
