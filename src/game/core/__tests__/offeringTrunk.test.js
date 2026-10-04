"use strict";
// LA CAISSE DE LA MAISON (ex-tronc des offrandes, monnaie fermée 2026-07-16) — la
// source de Faveur hors jeux : goutte-à-goutte plafonné, calculé à la volée depuis
// un timestamp (offline-safe), relevé d'un clic, plein à l'amorce (et donc aux
// migrations de save), survivant à l'effondrement, reparti plein au Grand Reset.
// Lot 1 des gains « vrai casino » (2026-10-04, docs/PLAN-GAINS-CASINO.md) : le
// débit et le plafond suivent les RECETTES de la Maison, donc l'ère RECORD de la
// ville (bestEraIndex) — 2 Faveur/min et 60 de plafond à l'Ère II (l'ancien
// tronc), ~×1,4 par ère ensuite, et toujours 30 min pour se remplir.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { state, setState, hydrateState, resetTemporaryRunState, buildGrandResetState } from "../state.js";
import { trunkValue, trunkCap, collectTrunk, recettesPerHour } from "../actions.js";
import { recettesPerSecond } from "../actions/maisonTable.js";
import { CAISSE_INITIAL, AUTO_TRUNK_UNLOCK_COST } from "../balance.js";
import { setTempleAuto, unlockTempleAuto, tickTempleAutomation, templeAutoThroughput } from "../actions.js";
import { MID_GAME_FIXTURE, FIXED_NOW } from "./fixtures.js";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
  setState(hydrateState(MID_GAME_FIXTURE));
  state.bestEraIndex = 2; // Ère II : la Maison ouvre, aux recettes de l'ancien tronc
  state.faveur = 0;
  state.trunkFaveur = 0;
  state.trunkAt = FIXED_NOW;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Caisse de la Maison", () => {
  it("goutte au fil du temps réel et PLAFONNE (l'AFK ne farme pas)", () => {
    expect(trunkValue()).toBe(0);
    vi.setSystemTime(FIXED_NOW + 120_000); // 2 min
    expect(trunkValue()).toBeCloseTo(120 * recettesPerSecond(), 9);
    vi.setSystemTime(FIXED_NOW + 10 * 3600_000); // 10 h
    expect(trunkValue()).toBe(trunkCap());
  });

  it("à l'Ère II : 2 Faveur/min et 60 de plafond (l'ancien tronc), pleine en 30 min", () => {
    expect(recettesPerSecond() * 60).toBeCloseTo(2, 2);
    expect(trunkCap()).toBe(60);
    expect(trunkCap()).toBe(CAISSE_INITIAL); // l'amorce remplit la caisse de l'Ère II
    vi.setSystemTime(FIXED_NOW + 29 * 60_000);
    expect(trunkValue()).toBeLessThan(trunkCap());
    vi.setSystemTime(FIXED_NOW + 31 * 60_000);
    expect(trunkValue()).toBe(trunkCap());
  });

  it("grandit avec l'ère RECORD : plus vite et plus haut, toujours 30 min pour se remplir", () => {
    let prevRate = 0;
    let prevCap = 0;
    for (const era of [2, 5, 10, 20]) {
      state.bestEraIndex = era;
      const rate = recettesPerSecond();
      const cap = trunkCap();
      expect(rate).toBeGreaterThan(prevRate);
      expect(cap).toBeGreaterThan(prevCap);
      expect(cap).toBe(Math.round(recettesPerHour() * 0.5)); // 30 min de recettes
      expect(cap / rate).toBeCloseTo(1800, -1);            // le remplissage reste de 30 min
      prevRate = rate;
      prevCap = cap;
    }
    // L'Ère V (la fixture) : ~380/h, soit 6,3 Faveur/min et un plafond de 190.
    state.bestEraIndex = 5;
    expect(recettesPerSecond() * 60).toBeCloseTo(6.33, 2);
    expect(trunkCap()).toBe(190);
    vi.setSystemTime(FIXED_NOW + 10 * 60_000);
    expect(trunkValue()).toBeCloseTo(600 * recettesPerSecond(), 9); // ~63, quand l'Ère II en donnait ~20
    vi.setSystemTime(FIXED_NOW + 10 * 3600_000);
    expect(trunkValue()).toBe(190);
  });

  it("le nouveau débit vaut pour la caisse EN COURS, borné par le plafond", () => {
    // Débit et plafond sont lus au moment du calcul : franchir une ère profite à la
    // caisse qui se remplit, au plus 30 min de recettes « rétroactives ».
    vi.setSystemTime(FIXED_NOW + 20 * 60_000);
    const atEra2 = trunkValue(); // ~40
    expect(atEra2).toBeCloseTo(1200 * recettesPerSecond(), 9);
    state.bestEraIndex = 5;
    expect(trunkValue()).toBeCloseTo(1200 * recettesPerSecond(), 9); // ~127
    expect(trunkValue()).toBeGreaterThan(atEra2);
    vi.setSystemTime(FIXED_NOW + 5 * 3600_000);
    expect(trunkValue()).toBe(trunkCap());
  });

  it("la relève encaisse les Faveurs ENTIÈRES et garde la fraction", () => {
    // On choisit une durée qui laisse une fraction (75 s à ~2/min ≈ 2,5).
    const elapsedS = 75;
    vi.setSystemTime(FIXED_NOW + elapsedS * 1000);
    const total = elapsedS * recettesPerSecond();
    const whole = Math.floor(total);
    const frac = total - whole;
    expect(frac).toBeGreaterThan(0); // le test perd son sens si la durée tombe rond
    const gain = collectTrunk({ render: false, silent: true });
    expect(gain).toBe(whole);
    expect(state.faveur).toBe(whole);
    expect(state.trunkFaveur).toBeCloseTo(frac, 9);
    expect(state.trunkAt).toBe(FIXED_NOW + elapsedS * 1000);
    // Rien à relever (< 1) : no-op sans mutation.
    expect(collectTrunk({ render: false, silent: true })).toBe(0);
    expect(state.faveur).toBe(whole);
  });

  it("amorce : une save SANS champs caisse la découvre PLEINE (migration douce)", () => {
    const s = hydrateState({});
    expect(s.trunkFaveur).toBe(CAISSE_INITIAL);
    expect(s.trunkAt).toBe(0); // « pas encore relevée »
    setState(s);
    expect(trunkValue()).toBe(trunkCap()); // pleine dès l'ouverture de la Maison
    // Une save trafiquée ne déborde pas : la lecture plafonne.
    setState(hydrateState({ trunkFaveur: 1e9, trunkAt: FIXED_NOW }));
    expect(trunkValue()).toBe(trunkCap());
  });

  it("jamais relevée : PLEINE au plafond du moment, même si l'ère record a monté depuis l'amorce", () => {
    // Régression du lot 1 : l'amorce (60) valait l'ancien plafond ; une caisse jamais
    // relevée (trunkAt = 0) restait figée à 60 sous un plafond de 190 à l'Ère V, et
    // l'auto-relève, qui attend le plafond, ne la relevait jamais.
    state.trunkFaveur = CAISSE_INITIAL;
    state.trunkAt = 0;
    state.bestEraIndex = 5;
    expect(trunkCap()).toBeGreaterThan(CAISSE_INITIAL);
    expect(trunkValue()).toBe(trunkCap());
    expect(collectTrunk({ render: false, silent: true })).toBe(Math.floor(trunkCap()));
    expect(state.trunkAt).toBe(FIXED_NOW); // relevée : le goutte-à-goutte repart d'ici
    expect(trunkValue()).toBeLessThan(1);
  });

  it("survit à l'effondrement (débit compris) et repart PLEINE au Grand Reset", () => {
    state.bestEraIndex = 5;
    const cap = trunkCap();
    state.trunkFaveur = 7.25;
    resetTemporaryRunState(state);
    expect(state.trunkFaveur).toBe(7.25);
    expect(trunkCap()).toBe(cap); // l'ère RECORD survit : un effondrement ne vide pas la salle
    const gr = buildGrandResetState(1);
    expect(gr.trunkFaveur).toBe(CAISSE_INITIAL);
    // Le Grand Reset ramène l'ère record à 0 : la caisse neuve est pleine à son plafond.
    setState(gr);
    expect(trunkCap()).toBe(CAISSE_INITIAL);
    expect(trunkValue()).toBe(trunkCap());
  });

  it("auto-relève : se paie en Faveur, vide la caisse quand elle frôle le plafond", () => {
    state.faveur = AUTO_TRUNK_UNLOCK_COST;
    expect(unlockTempleAuto("tronc")).toBe(true);
    expect(state.faveur).toBe(0);
    expect(state.templeAuto.tronc).toMatchObject({ unlocked: true, on: true });
    // Le badge annonce les recettes de la Maison, à la minute.
    expect(templeAutoThroughput("tronc")).toBeCloseTo(recettesPerHour() / 60, 9);

    // Caisse loin du plafond : l'auto ne relève pas.
    vi.setSystemTime(FIXED_NOW + 5 * 60_000);
    tickTempleAutomation();
    expect(state.faveur).toBe(0);

    // Caisse quasi pleine : relève automatique au tick.
    vi.setSystemTime(FIXED_NOW + 40 * 60_000);
    tickTempleAutomation();
    expect(state.faveur).toBe(trunkCap());
    expect(trunkValue()).toBeLessThan(1);

    // Suspendue (on=false) : la caisse plafonne sans être relevée.
    setTempleAuto("tronc", { on: false });
    vi.setSystemTime(FIXED_NOW + 120 * 60_000);
    tickTempleAutomation();
    expect(state.faveur).toBe(trunkCap()); // inchangé
    expect(trunkValue()).toBe(trunkCap());
  });

  it("auto-relève à une ère plus haute : le seuil suit le plafond (une grosse caisse « quasi pleine »)", () => {
    state.bestEraIndex = 10; // ~2 250/h, plafond ~1 120
    state.faveur = AUTO_TRUNK_UNLOCK_COST;
    expect(unlockTempleAuto("tronc")).toBe(true);
    // 25 min : ~936 dans la caisse, bien au-delà de l'ancien plafond de 60 mais
    // encore loin du sien (le seuil est à 2 % sous le plafond) : pas de relève.
    vi.setSystemTime(FIXED_NOW + 25 * 60_000);
    tickTempleAutomation();
    expect(state.faveur).toBe(0);
    vi.setSystemTime(FIXED_NOW + 31 * 60_000); // pleine
    tickTempleAutomation();
    expect(state.faveur).toBe(trunkCap());
    expect(trunkCap()).toBeGreaterThan(1000);
  });
});
