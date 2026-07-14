"use strict";
// Chancellerie (onglet Régulation, 2026-07-13) — mécaniques des 4 piliers :
//  - Faveur des augures : chaque revers consécutif adoucit le prochain jet
//    (plafonné GAMBLE_P_MAX), remise à zéro au gain ; historique capé.
//  - Registre des édits : chaque acte dépose une entrée factuelle (cap, reset
//    par cycle) et un marqueur d'annales.
//  - Intendance : consignes « si Rupture > X % → édit », mêmes coûts/fatigue
//    que le joueur, cooldown par consigne, slots gatés par la progression.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { state, setState, hydrateState, invalidateRenderCache, resetTemporaryRunState } from "../state.js";
import { runCrisisAction, setStewardClause, tickSteward, stewardSlotCount, castAugury, doubleAugury, auguryCost, auguryBaseOdds } from "../actions.js";
import { clemencyBonus, regulationContext } from "../mechanics.js";
import { annalsWindow, resetAnnals } from "../annals.js";
import { toNum } from "../num.js";
import { GAMBLE_P_MAX, GAMBLE_HISTORY_LEN, REGUL_LEDGER_MAX, STEWARD_COOLDOWN_MS, AUGURY_FAVEUR, AUGURY_POT_FEED_HOLLOW, AUGURY_POT_FEED_DOG } from "../balance.js";
import { MID_GAME_FIXTURE, FIXED_NOW } from "./fixtures.js";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
  setState(hydrateState(MID_GAME_FIXTURE));
  // Les coûts d'édit s'ancrent sur la PRODUCTION (≈25-28 s de vivres ≈ 150 k) :
  // le stock de la fixture (80 k) ne couvre aucun édit — on regonfle pour que
  // les tests exercent l'exécution, pas la disette.
  state.food = 1e9;
  resetAnnals();
  invalidateRenderCache("all");
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// Force l'issue du prochain pari (via castAugury classique). Zones pour
// prayForRain, odds RÉDUITES (base 0.55 × 0.6 = 0.33) : r≈0.5 → jet CREUX (0),
// r≈0.99 → le CHIEN (2, compte double), r≈0.01 → Vénus (gagné, 1).
function rollGamble(id, randomValue) {
  vi.spyOn(Math, "random").mockReturnValue(randomValue);
  castAugury(id, "classique", { render: false });
  Math.random.mockRestore();
}
const BASE = () => auguryBaseOdds("prayForRain"); // ≈ 0.33

describe("Clémence des augures (pitié sur série noire)", () => {
  it("monte de 5 pts par revers consécutif et retombe au gain", () => {
    expect(clemencyBonus("prayForRain", BASE())).toBe(0);
    rollGamble("prayForRain", 0.5); // jet creux
    rollGamble("prayForRain", 0.5); // jet creux
    expect(state.gambleHistory.prayForRain).toEqual([0, 0]);
    expect(clemencyBonus("prayForRain", BASE())).toBeCloseTo(0.10, 10);
    rollGamble("prayForRain", 0.01); // Vénus → gagné, remet à zéro
    expect(state.gambleHistory.prayForRain).toEqual([0, 0, 1]);
    expect(clemencyBonus("prayForRain", BASE())).toBe(0);
  });

  it("le Chien compte DOUBLE dans la Clémence (pitié des dieux)", () => {
    rollGamble("prayForRain", 0.99); // le Chien
    expect(state.gambleHistory.prayForRain).toEqual([2]);
    expect(clemencyBonus("prayForRain", BASE())).toBeCloseTo(0.10, 10); // 2 crans d'un coup
  });

  it("est plafonnée par GAMBLE_P_MAX et l'historique reste capé", () => {
    for (let i = 0; i < GAMBLE_HISTORY_LEN + 3; i++) rollGamble("prayForRain", 0.999);
    expect(state.gambleHistory.prayForRain).toHaveLength(GAMBLE_HISTORY_LEN);
    expect(clemencyBonus("prayForRain", BASE())).toBeLessThanOrEqual(GAMBLE_P_MAX - BASE() + 1e-9);
  });

  it("un pari NE touche PAS la Rupture (jeux découplés)", () => {
    const before = state.instability;
    rollGamble("prayForRain", 0.5); // creux
    expect(state.instability).toBeCloseTo(before, 10);
    rollGamble("prayForRain", 0.99); // Chien
    expect(state.instability).toBeCloseTo(before, 10);
    // Les paris n'écrivent plus dans le registre des édits (économie à part).
    expect((state.regulLedger || []).some((e) => e.kind === "gambleLoss")).toBe(false);
  });
});

describe("Registre des édits & annales", () => {
  it("chaque acte dépose une entrée factuelle + un marqueur d'annales", () => {
    runCrisisAction("rationing", { render: false });
    const entry = state.regulLedger[state.regulLedger.length - 1];
    expect(entry.id).toBe("rationing");
    expect(entry.kind).toBe("soothe");
    expect(entry.foyer).toBe("scarcity");
    expect(entry.delta).toBeGreaterThan(0);
    expect(entry.by).toBeNull();
    const { marks } = annalsWindow();
    expect(marks.some((m) => m.kind === "soothe" && m.id === "rationing")).toBe(true);
  });

  it("est capé à REGUL_LEDGER_MAX", () => {
    for (let i = 0; i < REGUL_LEDGER_MAX + 10; i++) {
      state.food = 1e9; // les coûts escaladent : on regonfle pour payer chaque édit
      runCrisisAction("rationing", { render: false });
    }
    expect(state.regulLedger).toHaveLength(REGUL_LEDGER_MAX);
  });

  it("reset par cycle : registre et jets effacés, consignes CONSERVÉES, Faveur SURVIT", () => {
    runCrisisAction("rationing", { render: false });
    rollGamble("prayForRain", 0.99);
    state.faveur = 42; // gagnée aux jeux : c'est une monnaie méta
    setStewardClause(0, { actionId: "rationing", threshold: 0.65, enabled: true });
    resetTemporaryRunState(state);
    expect(state.regulLedger).toEqual([]);
    expect(state.gambleHistory).toEqual({});
    expect(state.faveur).toBe(42); // la Faveur survit à l'effondrement
    expect(state.stewardClauses[0]).toMatchObject({ actionId: "rationing", enabled: true });
    expect(annalsWindow().marks).toEqual([]);
  });

  it("hydratation : entrées re-typées, seuils ramenés aux crans, jets 0/1/2", () => {
    const s = hydrateState({
      regulLedger: [{ id: "rationing", kind: "soothe", delta: 0.2 }, { pas: "de champ id" }, "junk"],
      gambleHistory: { prayForRain: [1, 0, 2, "x"], "bad id!": [1] },
      stewardClauses: [{ threshold: 0.9, actionId: "rationing", enabled: true, lastAt: 123 }],
      faveur: 77
    });
    expect(s.regulLedger).toHaveLength(1);
    expect(s.regulLedger[0].id).toBe("rationing");
    expect(s.gambleHistory.prayForRain).toEqual([1, 0, 2, 1]); // 2 = le Chien (légitime), 'x' → 1
    expect(s.gambleHistory["bad id!"]).toBeUndefined();
    expect(s.stewardClauses[0].threshold).toBe(0.65); // 0.9 hors crans → défaut
    expect(s.stewardClauses[0].enabled).toBe(true);
    expect(s.faveur).toBe(77);
  });
});

describe("Table des augures — gains en Faveur (jeux découplés)", () => {
  it("mise en ressources, gain de Faveur ×costMult du rite", () => {
    const classCost = toNum(auguryCost("prayForRain", "classique").food);
    expect(toNum(auguryCost("prayForRain", "prudent").food)).toBeCloseTo(classCost * 0.6, 3);

    // Vénus classique → Faveur base × 1, vol d'Icare offert, mise dépensée.
    const foodBefore = toNum(state.food);
    vi.spyOn(Math, "random").mockReturnValue(0.01);
    const venus = castAugury("prayForRain", "classique", { render: false });
    Math.random.mockRestore();
    expect(venus.tier).toBe("venus");
    expect(venus.faveurGain).toBe(AUGURY_FAVEUR.venus); // ×1
    expect(state.faveur).toBe(AUGURY_FAVEUR.venus);
    expect(venus.freeFlight).toBe(true);
    expect(state.icarusFreeFlights).toBe(1);
    expect(new Set(venus.bones).size).toBe(4);
    expect(toNum(state.food)).toBeCloseTo(foodBefore - classCost, 0);
  });

  it("le Grand Sacrifice paie ×2, l'Offrande prudente ×0.6", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.01);
    const grand = castAugury("prayForRain", "grand", { render: false });
    Math.random.mockRestore();
    expect(grand.faveurGain).toBe(Math.round(AUGURY_FAVEUR.venus * 2));
    vi.spyOn(Math, "random").mockReturnValue(0.01);
    const prudent = castAugury("prayForRain", "prudent", { render: false });
    Math.random.mockRestore();
    expect(prudent.faveurGain).toBe(Math.round(AUGURY_FAVEUR.venus * 0.6));
  });

  it("perdre = consolation plate + la cagnotte d'Icare s'épaissit (Chien plus lourd)", () => {
    expect(state.icarusPotFaveur).toBe(0);
    const seconds = 28; // prayForRain
    vi.spyOn(Math, "random").mockReturnValue(0.5); // creux
    const hollow = castAugury("prayForRain", "classique", { render: false });
    Math.random.mockRestore();
    expect(hollow.faveurGain).toBe(AUGURY_FAVEUR.hollow); // consolation plate
    expect(state.icarusPotFaveur).toBeCloseTo(seconds * AUGURY_POT_FEED_HOLLOW, 6);

    vi.spyOn(Math, "random").mockReturnValue(0.99); // Chien
    const dog = castAugury("prayForRain", "classique", { render: false });
    Math.random.mockRestore();
    expect(dog.faveurGain).toBe(AUGURY_FAVEUR.dog); // le Chien console un peu plus
    expect(state.icarusPotFaveur).toBeCloseTo(seconds * AUGURY_POT_FEED_HOLLOW + seconds * AUGURY_POT_FEED_DOG, 6);
  });

  it("defer : rien n'est appliqué avant apply() (anti-spoiler UI)", () => {
    const foodBefore = toNum(state.food);
    vi.spyOn(Math, "random").mockReturnValue(0.01); // Vénus
    const res = castAugury("prayForRain", "classique", { render: false, defer: true });
    Math.random.mockRestore();
    // Le coût est payé à l'envol, mais AUCUN gain tant qu'apply() dort.
    expect(toNum(state.food)).toBeLessThan(foodBefore);
    expect(state.faveur || 0).toBe(0);
    expect(state.icarusFreeFlights || 0).toBe(0);
    expect(state.gambleHistory.prayForRain).toBeUndefined();
    expect(res.faveurGain).toBe(0);
    // À la révélation : tout s'applique d'un coup, une seule fois (idempotent).
    res.apply();
    expect(res.faveurGain).toBe(AUGURY_FAVEUR.venus);
    expect(state.faveur).toBe(AUGURY_FAVEUR.venus);
    expect(state.icarusFreeFlights).toBe(1);
    expect(state.gambleHistory.prayForRain).toEqual([1]);
    res.apply(); // flush après révélation : sans effet
    expect(state.faveur).toBe(AUGURY_FAVEUR.venus);
    expect(state.gambleHistory.prayForRain).toEqual([1]);
  });

  it("quitte ou double : gagné double la Faveur, perdu la reprend (historique intact)", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.01);
    const win = castAugury("prayForRain", "classique", { render: false });
    Math.random.mockRestore();
    expect(state.faveur).toBe(win.faveurGain);
    expect(state.gambleHistory.prayForRain).toEqual([1]);

    vi.spyOn(Math, "random").mockReturnValue(0.2); // < AUGURY_DOUBLE_P → gagné
    const dbl = doubleAugury("prayForRain", win.faveurGain, { render: false });
    Math.random.mockRestore();
    expect(dbl.win).toBe(true);
    expect(state.faveur).toBe(win.faveurGain * 2);
    expect(state.gambleHistory.prayForRain).toEqual([1]); // le double n'est pas un jet de table
  });

  it("quitte ou double perdu : la Faveur gagnée est reprise", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.01);
    const win = castAugury("prayForRain", "classique", { render: false });
    Math.random.mockRestore();
    const faveurAfterWin = state.faveur;

    vi.spyOn(Math, "random").mockReturnValue(0.9); // ≥ AUGURY_DOUBLE_P → perdu
    const dbl = doubleAugury("prayForRain", win.faveurGain, { render: false });
    Math.random.mockRestore();
    expect(dbl.win).toBe(false);
    expect(state.faveur).toBe(faveurAfterWin - win.faveurGain);
  });
});

describe("Intendance", () => {
  it("le slot 1 est constitué à l'Ère IV, le slot 2 attend un mythe", () => {
    expect(stewardSlotCount(regulationContext())).toBe(1);
    setStewardClause(1, { actionId: "rationing", enabled: true });
    expect((state.stewardClauses || []).length).toBeLessThanOrEqual(1); // slot 2 refusé
  });

  it("intervient au seuil, signe le registre, puis respecte son cooldown", () => {
    setStewardClause(0, { actionId: "rationing", threshold: 0.65, enabled: true });
    state.instability = 0.7;
    tickSteward();
    const entries = state.regulLedger.filter((e) => e.by);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ id: "rationing", kind: "soothe" });
    expect(typeof entries[0].by).toBe("string");

    // Rappel immédiat : cooldown → aucune nouvelle intervention.
    state.instability = 0.9;
    tickSteward();
    expect(state.regulLedger.filter((e) => e.by)).toHaveLength(1);

    // Après le cooldown, elle repart.
    vi.setSystemTime(FIXED_NOW + STEWARD_COOLDOWN_MS + 1000);
    state.food = 1e9;
    tickSteward();
    expect(state.regulLedger.filter((e) => e.by)).toHaveLength(2);
  });

  it("reste en veille sous le seuil, fatiguée, ou sans de quoi payer", () => {
    setStewardClause(0, { actionId: "rationing", threshold: 0.65, enabled: true });

    state.instability = 0.5; // sous le seuil
    tickSteward();
    expect(state.regulLedger.filter((e) => e.by)).toHaveLength(0);

    state.instability = 0.8;
    state.regulFatigue = 0.8; // administration épuisée
    tickSteward();
    expect(state.regulLedger.filter((e) => e.by)).toHaveLength(0);

    state.regulFatigue = 0;
    state.food = 0; // Rationner coûte des vivres : impayable
    invalidateRenderCache("all");
    tickSteward();
    expect(state.regulLedger.filter((e) => e.by)).toHaveLength(0);
  });

  it("une consigne sans édit choisi ne peut pas être armée", () => {
    setStewardClause(0, { enabled: true });
    expect(state.stewardClauses[0].enabled).toBe(false);
    setStewardClause(0, { actionId: "rationing" });
    setStewardClause(0, { enabled: true });
    expect(state.stewardClauses[0].enabled).toBe(true);
    setStewardClause(0, { actionId: null });
    expect(state.stewardClauses[0].enabled).toBe(false);
  });
});
