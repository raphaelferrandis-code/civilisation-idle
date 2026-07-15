"use strict";
// Tickets à gratter (jeu du temple) — moteur (gains en Faveur, jeu DÉCOUPLÉ) :
//   la mise est en OR, l'issue est tirée par UN Math.random pondéré (table
//   SCRATCH_PRIZES), la grille 3×3 est peinte pour matcher. Gagner = secondes ×
//   payoutMult × ICARUS_FAVEUR_K en Faveur. Un ticket perdant nourrit la
//   cagnotte PARTAGÉE (state.icarusPotFaveur) ; le Soleil la rafle. Effet
//   DIFFÉRÉ (defer + apply idempotent) jusqu'à la révélation par grattage.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { state, setState, hydrateState, invalidateRenderCache, resetTemporaryRunState } from "../state.js";
import { playScratch, scratchStakes, scratchGrid } from "../actions.js";
import { toNum } from "../num.js";
import { ICARUS_FAVEUR_K, ICARUS_POT_CAP_FAVEUR, SCRATCH_POT_FEED, SCRATCH_HISTORY_LEN } from "../balance.js";
import { MID_GAME_FIXTURE, FIXED_NOW } from "./fixtures.js";

// Bornes cumulées de la table (poids /1000) → valeur de Math.random pour forcer
// une issue : blank<0.73, olive[0.73,0.868), amphore[0.868,0.938), laurier
// [0.938,0.974), trepied[0.974,0.991), chouette[0.991,0.996), venus[0.996,0.998),
// soleil[0.998,1). Le 1er random (drawPrize) est mocké ; la grille consomme
// ensuite du vrai hasard (spyOn rappelle l'original une fois la valeur once épuisée).
const U = { blank: 0.1, olive: 0.80, amphore: 0.90, laurier: 0.95, venus: 0.997, soleil: 0.999 };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
  setState(hydrateState(MID_GAME_FIXTURE));
  state.gold = 1e9; // couvre toutes les mises
  state.faveur = 0;
  state.icarusPotFaveur = 0;
  state.scratchHistory = [];
  invalidateRenderCache("all");
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// Force l'issue via u (le SEUL random d'issue) ; la grille reste aléatoire.
function play(stakeId, u, opts) {
  vi.spyOn(Math, "random").mockReturnValueOnce(u);
  const res = playScratch(stakeId, opts);
  Math.random.mockRestore();
  return res;
}

describe("Tickets à gratter — moteur", () => {
  it("paie la mise EN OR à l'achat", () => {
    const stake = scratchStakes().find((s) => s.id === "talent");
    const before = toNum(state.gold);
    play("talent", U.blank);
    expect(toNum(state.gold)).toBeCloseTo(before - toNum(stake.gold), 0);
  });

  it("un ticket gagnant crédite secondes × payoutMult × K en Faveur", () => {
    play("drachme", U.olive); // olive ×1.2, drachme 45 s
    expect(state.faveur).toBe(Math.round(45 * 1.2 * ICARUS_FAVEUR_K)); // 8
  });

  it("defer : rien appliqué avant apply(), et apply() est idempotent", () => {
    const res = play("drachme", U.amphore, { render: false, defer: true }); // amphore ×2.4
    expect(res.win).toBe(true);
    expect(state.faveur).toBe(0); // gain non appliqué…
    // …mais la mise est DÉJÀ payée (comme castAugury/launchIcarus)
    const expected = Math.round(45 * 2.4 * ICARUS_FAVEUR_K); // 16
    res.apply();
    expect(state.faveur).toBe(expected);
    res.apply(); // flush idempotent
    expect(state.faveur).toBe(expected);
  });

  it("un ticket perdant (vernis nu) nourrit la cagnotte partagée", () => {
    play("talent", U.blank); // 150 s
    expect(state.icarusPotFaveur).toBeCloseTo(150 * SCRATCH_POT_FEED, 5); // 75
    expect(state.faveur).toBe(0);
  });

  it("la cagnotte reste bornée à ICARUS_POT_CAP_FAVEUR", () => {
    state.icarusPotFaveur = ICARUS_POT_CAP_FAVEUR - 10;
    play("talent", U.blank);
    expect(state.icarusPotFaveur).toBe(ICARUS_POT_CAP_FAVEUR);
  });

  it("trois Soleils raflent la cagnotte partagée et la remettent à 0", () => {
    state.icarusPotFaveur = 1000;
    const res = play("talent", U.soleil); // soleil ×15, sweep
    expect(res.sweep).toBe(true);
    expect(res.jackpotFaveur).toBe(1000);
    expect(state.icarusPotFaveur).toBe(0);
    expect(state.faveur).toBe(Math.round(150 * 15 * ICARUS_FAVEUR_K) + 1000);
  });

  it("trois Vénus offrent un vol d'Icare", () => {
    const before = state.icarusFreeFlights || 0;
    const res = play("obole", U.venus);
    expect(res.freeFlight).toBe(true);
    expect(state.icarusFreeFlights).toBe(before + 1);
  });

  it("l'historique est capé à SCRATCH_HISTORY_LEN et effacé au cycle", () => {
    for (let i = 0; i < SCRATCH_HISTORY_LEN + 5; i++) play("obole", U.blank);
    expect(state.scratchHistory.length).toBe(SCRATCH_HISTORY_LEN);
    resetTemporaryRunState(state);
    expect(state.scratchHistory).toEqual([]);
  });
});

describe("scratchGrid — grille cosmétique qui matche l'issue", () => {
  it("un ticket gagnant aligne EXACTEMENT 3 fois le symbole, aucun autre triple", () => {
    for (let n = 0; n < 60; n++) {
      const grid = scratchGrid("laurier");
      expect(grid.length).toBe(9);
      const counts = {};
      grid.forEach((s) => { counts[s] = (counts[s] || 0) + 1; });
      expect(counts.laurier).toBe(3);
      for (const [s, c] of Object.entries(counts)) {
        if (s !== "laurier") expect(c).toBeLessThan(3);
      }
    }
  });

  it("un ticket perdant n'aligne AUCUN triple", () => {
    for (let n = 0; n < 60; n++) {
      const grid = scratchGrid(null);
      expect(grid.length).toBe(9);
      const counts = {};
      grid.forEach((s) => { counts[s] = (counts[s] || 0) + 1; });
      for (const c of Object.values(counts)) expect(c).toBeLessThan(3);
    }
  });
});

describe("Tickets à gratter — hydratation défensive", () => {
  it("re-type scratchHistory (garde les chaînes) et borne la cagnotte", () => {
    const s = hydrateState({ ...MID_GAME_FIXTURE, scratchHistory: ["olive", 42, "soleil", null], icarusPotFaveur: 9e9 });
    expect(s.scratchHistory).toEqual(["olive", "soleil"]);
    expect(s.icarusPotFaveur).toBeLessThanOrEqual(ICARUS_POT_CAP_FAVEUR);
  });
});
