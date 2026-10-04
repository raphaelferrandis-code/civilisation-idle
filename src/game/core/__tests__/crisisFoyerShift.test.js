"use strict";
// Crises « qui comptent » (2026-10, les 15 crises) : une option de crise dépose une part
// ABSOLUE sur le foyer de la crise jusqu'à la chute (state.foyerShift), au lieu
// de pousser l'aiguille de la jauge — qui revenait vers la cible en quelques
// secondes. On verrouille : l'effet sur la CIBLE, la protection par la réforme,
// le gain de « profiter » (préparation de chute), le critère « stabilisée », le
// tirage par foyer dominant, la projection affichée, et l'honnêteté des étiquettes.
// Puis (2026-10-04) les crises « à caractère » : chiffres propres à chaque crise
// autour de la référence du palier, et déplacements vers un second foyer.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import * as stateModule from "../state.js";
const { state, setState, hydrateState, invalidateRenderCache, setGamePaused, resetTemporaryRunState } = stateModule;
// Importer main.js enregistre le pont world.js↔core (registerWorldEffects),
// nécessaire pour que les apply() des crises agissent sur l'état.
import "../main.js";
import { autoResolveCrisisEvent, openCrisisEvent, pickCrisisEvent } from "../actions/crisis.js";
import { pressureBreakdown, rates } from "../mechanics.js";
import { registerChoiceDialog } from "../choiceDialog.js";
import { CRISIS_POOL, crisisOptionShifts } from "../../data/world.js";
import { CRISIS_TREAT_SHIFT, CRISIS_PROFIT_SHIFT, CRISIS_PROFIT_PREP, COLLAPSE_PREP_MAX } from "../balance.js";
import { MID_GAME_FIXTURE, FIXED_NOW } from "./fixtures.js";

const PILOTS = CRISIS_POOL.filter((e) => (e.options || []).some((o) => typeof o.foyerShift === "number"));
const byStance = (ev, stance) => ev.options.find((o) => o.stance === stance);
const target = () => { invalidateRenderCache("all"); return pressureBreakdown().total; };
// La cible vers laquelle DÉRIVE la jauge (celle de la pastille « Rupture visée »).
const drift = () => { invalidateRenderCache("all"); return Math.max(0, rates().instability); };
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const net = (o) => Object.values(crisisOptionShifts(o)).reduce((a, b) => a + b, 0);

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
  it("chaque crise a une option traiter + une option profiter sur SON foyer", () => {
    // Toutes converties : plus aucune option ne pousse l'aiguille de la jauge.
    expect(PILOTS.length).toBe(CRISIS_POOL.length);
    for (const ev of PILOTS) {
      const treat = byStance(ev, "stabiliser");
      const profit = byStance(ev, "temporiser");
      expect(treat.foyer).toBe(ev.foyer);
      expect(profit.foyer).toBe(ev.foyer);
      // Posture : traiter allège TOUJOURS le foyer de la crise, profiter l'alourdit.
      expect(treat.foyerShift).toBeLessThan(0);
      expect(profit.foyerShift).toBeGreaterThan(0);
      expect(profit.prep).toBeGreaterThan(0);
      // Un déplacement porte sur un AUTRE foyer, et ne dépasse pas la part principale.
      for (const o of [treat, profit]) {
        if (!o.side) continue;
        expect(o.side.foyer).not.toBe(ev.foyer);
        expect(Math.abs(o.side.shift)).toBeLessThanOrEqual(Math.abs(o.foyerShift) + 0.01);
      }
    }
  });

  it("chaque palier garde la référence en moyenne (balance.js), chaque crise a son caractère", () => {
    for (const t of [0.25, 0.5, 0.75]) {
      const tier = PILOTS.filter((e) => e.threshold === t);
      const treats = tier.map((e) => byStance(e, "stabiliser"));
      const profits = tier.map((e) => byStance(e, "temporiser"));
      expect(Math.abs(mean(treats.map((o) => -net(o))) - CRISIS_TREAT_SHIFT[t])).toBeLessThan(0.015);
      expect(Math.abs(mean(profits.map(net)) - CRISIS_PROFIT_SHIFT[t])).toBeLessThan(0.015);
      expect(Math.abs(mean(profits.map((o) => o.prep)) - CRISIS_PROFIT_PREP[t])).toBeLessThan(0.03);
      // Pas de copier-coller : au moins trois profils différents par palier.
      const profiles = new Set(tier.map((e) => e.options.map((o) => JSON.stringify([o.foyerShift, o.side, o.prep, o.malus])).join()));
      expect(profiles.size).toBeGreaterThanOrEqual(3);
    }
    // Des déplacements dans les deux postures, et dans les deux sens.
    const sides = PILOTS.flatMap((e) => e.options.filter((o) => o.side));
    expect(sides.some((o) => o.stance === "stabiliser")).toBe(true);
    expect(sides.some((o) => o.stance === "temporiser")).toBe(true);
    expect(sides.some((o) => o.side.shift < 0)).toBe(true);
  });

  it("les étiquettes disent les vrais montants (foyer, Ruines)", () => {
    for (const ev of PILOTS) {
      for (const o of ev.options) {
        const labels = o.effects.map((e) => e.label).join(" | ");
        expect(labels).toContain(`${Math.round(Math.abs(o.foyerShift) * 100)}%`);
        if (o.stance === "stabiliser") expect(labels).toContain(`−${Math.round(o.malus * 100)}%`);
        if (o.side) {
          const sign = o.side.shift < 0 ? "−" : "+";
          expect(labels).toContain(`${sign}${Math.round(Math.abs(o.side.shift) * 100)}%`);
          // La pastille du second foyer : verte s'il s'allège, rouge s'il s'alourdit.
          const sideChip = o.effects[o.effects.length - 1];
          expect(sideChip.kind).toBe(o.side.shift < 0 ? "gain" : "cost");
        }
        // « Jusqu'à la chute » vit en infobulle des pastilles de foyer, pas en phrase.
        expect(o.effects.filter((e) => /Subsistance|Inégalités|Complexité|Dissidence/.test(e.label)).every((e) => e.tip)).toBe(true);
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

  it("un déplacement dépose ses DEUX parts (foyer de la crise + second foyer)", () => {
    const ev = PILOTS.find((e) => byStance(e, "stabiliser").side);
    const treat = byStance(ev, "stabiliser");
    state.cycleCrisesResolved = 0;
    autoResolveCrisisEvent(ev, "stabiliser");
    expect(state.foyerShift[ev.foyer]).toBeCloseTo(treat.foyerShift, 9);
    expect(state.foyerShift[treat.side.foyer]).toBeCloseTo(treat.side.shift, 9);
    // Une crise traitée en déplaçant compte quand même comme stabilisée.
    expect(state.cycleCrisesResolved).toBe(1);
  });

  it("ce que vaut un déplacement dépend de la cité : un foyer réformé encaisse moins", () => {
    // « Plafonner les prix » : Inégalités allégées, Subsistance alourdie.
    const ev = CRISIS_POOL.find((e) => e.id === "market_hoarding");
    const treat = byStance(ev, "stabiliser");
    expect(treat.side.foyer).toBe("scarcity");
    const effect = () => {
      const fs0 = { ...state.foyerShift };
      const before = target();
      for (const [k, v] of Object.entries(crisisOptionShifts(treat))) state.foyerShift[k] += v;
      const after = target();
      state.foyerShift = fs0;
      return after - before;
    };
    // Gros foyer d'Inégalités pour que l'allègement porte entièrement, et une
    // cible loin au-dessus de la mitigation (sinon le total plancher à 0 masque tout).
    state.foyerShift.inequality = 0.3;
    state.foyerShift.complexity = 0.5;
    const bare = effect();
    state.foyerReform.scarcity = 0.6;
    const scarcityReformed = effect();
    state.foyerReform.scarcity = 0;
    // (À 60 %, −5 % × 0,4 + 2 % = 0 pile : le déplacement s'annule. À 70 %, il coûte.)
    state.foyerReform.inequality = 0.7;
    const inequalityReformed = effect();
    // Subsistance réformée : la part reportée ne passe qu'à 40 % → traiter allège plus.
    expect(scarcityReformed).toBeLessThan(bare);
    // Inégalités réformées : l'allègement ne passe qu'à 30 % → traiter ALOURDIT la cible.
    expect(inequalityReformed).toBeGreaterThan(bare);
    expect(inequalityReformed).toBeGreaterThan(0);
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
    const baseTarget = drift();
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
    // Plus de phrase sous la fenêtre (aucune explication à l'écran).
    expect(shown.footnote).toBeFalsy();
    await pending;
  });

  it("la pastille dit EXACTEMENT où la jauge va dériver après le choix, déplacement compris", async () => {
    let checked = 0;
    for (const ev of PILOTS.filter((e) => e.options.some((o) => o.side))) {
      for (const stance of ["stabiliser", "temporiser"]) {
        setState(hydrateState(MID_GAME_FIXTURE));
        setGamePaused(false);
        state.foyerShift.inequality = 0.2;
        state.foyerShift.dissent = 0.2;
        invalidateRenderCache("all");
        let shown = null;
        registerChoiceDialog((dialog) => { shown = dialog; return Promise.resolve(dialog.options.find((o) => o.stance === stance)); });
        await openCrisisEvent(ev);
        const picked = shown.options.find((o) => o.stance === stance);
        const label = picked.effects.find((e) => /Rupture/.test(e.label)).label;
        expect(Number(label.match(/(\d+)/)[1])).toBe(Math.round(drift() * 100));
        checked++;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(16);
  });
});
