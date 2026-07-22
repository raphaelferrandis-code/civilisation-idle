"use strict";
// JAUGES CHIFFREES DES SCEAUX (B9). Ce qui se teste ici, c'est qu'une jauge ne
// CONTREDIT jamais le bouton pose a cote d'elle : un Grand Reset efface les
// sources de six sceaux sur onze alors que grClaimed, lui, survit.

import { describe, it, expect, beforeEach } from "vitest";
import { state, setState, hydrateState } from "../state.js";
import {
  GRAND_RESET_MILESTONES, grandResetMilestoneProgress,
  grPopulationTarget, grEraTarget
} from "../mechanics/grandResetMilestones.js";
import { D } from "../num.js";

const sceau = (gr) => GRAND_RESET_MILESTONES.find((m) => m.gr === gr);

beforeEach(() => {
  setState(hydrateState({}));
  state.instability = 0.1;
});

describe("ce qui se jauge et ce qui ne se jauge pas", () => {
  it("rend null sur les sceaux BINAIRES : il n'y a rien a compter", () => {
    // L'Olympe qui se prononce, le jackpot d'Icare, le premier Mythe : une
    // jauge a 0 % ou 100 % n'enseigne rien et remplace une gravure par du bruit.
    expect(grandResetMilestoneProgress(sceau(3))).toBeNull();
    expect(grandResetMilestoneProgress(sceau(5))).toBeNull();
    expect(grandResetMilestoneProgress(sceau(7))).toBeNull();
  });

  it("chiffre les sceaux comptables", () => {
    state.cycles = 4;
    const p = grandResetMilestoneProgress(sceau(1));
    expect(p.current).toBe(4);
    expect(p.target).toBe(10);
    expect(p.ratio).toBeCloseTo(0.4, 6);
  });

  it("borne le ratio a 1 meme au-dela de la cible", () => {
    state.cycles = 999;
    expect(grandResetMilestoneProgress(sceau(1)).ratio).toBe(1);
  });
});

describe("le Rayonnement se jauge en LOG, sinon la barre ment", () => {
  it("ne part pas deja remplie sur une partie neuve", () => {
    // Population de depart = 10 (state.js). Un ratio log10 naif afficherait
    // 1/6 = 17 % des la premiere seconde.
    state.cyclePeaks = { population: D(10) };
    expect(grandResetMilestoneProgress(sceau(4)).ratio).toBe(0);
  });

  it("ne rend ni NaN ni -Infinity sur un pic a zero", () => {
    state.cyclePeaks = { population: D(0) };
    const r = grandResetMilestoneProgress(sceau(4)).ratio;
    expect(Number.isFinite(r)).toBe(true);
    expect(r).toBe(0);
  });

  it("progresse par ordres de grandeur et atteint 1 a la cible", () => {
    const cible = grPopulationTarget(); // 1e6 a 0 sceau reclame
    state.cyclePeaks = { population: D(1000) };
    const mi = grandResetMilestoneProgress(sceau(4)).ratio;
    expect(mi).toBeGreaterThan(0.3);
    expect(mi).toBeLessThan(0.7);
    state.cyclePeaks = { population: D(cible) };
    expect(grandResetMilestoneProgress(sceau(4)).ratio).toBe(1);
  });
});

describe("LE PIEGE : un Grand Reset efface les sources, pas les sceaux", () => {
  it("un sceau RECLAME reste plein alors que sa source est repartie de zero", () => {
    // Apres un GR : cycles revient a 0 (absent de GR_PERSISTENT_FIELDS) tandis
    // que grClaimed survit. Sans court-circuit, la jauge afficherait 0 % sur une
    // rangee qui porte la coche.
    state.cycles = 0;
    state.grClaimed = { 1: true };
    const p = grandResetMilestoneProgress(sceau(1));
    expect(p.ratio).toBe(1);
    expect(p.acquis).toBe(true);
  });

  it("un sceau PRET reste plein meme si sa cible a bouge entre-temps", () => {
    // Les cibles 4 et 10 sont RELATIVES au nombre de sceaux reclames : un joueur
    // qui a latche le sceau 4 a 1e6 puis reclame 3 sceaux verrait, sur une
    // rangee « prete a reclamer », une jauge a un milliemme de la nouvelle cible.
    state.grRevealed = { 4: true };
    state.grClaimed = {};
    state.grandResetCount = 3;
    state.cyclePeaks = { population: D(1e6) };
    expect(grPopulationTarget()).toBeGreaterThan(1e6); // la cible a bien monte
    const p = grandResetMilestoneProgress(sceau(4));
    expect(p.ratio).toBe(1);
    expect(p.acquis).toBe(true);
  });

  it("les cibles relatives suivent bien le nombre de sceaux reclames", () => {
    state.grandResetCount = 0;
    const c0 = grEraTarget();
    state.grandResetCount = 5;
    expect(grEraTarget()).toBeGreaterThan(c0);
  });

  it("un sceau NON acquis n'est PAS court-circuite", () => {
    state.cycles = 2;
    state.grClaimed = {};
    state.grRevealed = {};
    const p = grandResetMilestoneProgress(sceau(1));
    expect(p.acquis).toBe(false);
    expect(p.ratio).toBeCloseTo(0.2, 6);
  });
});
