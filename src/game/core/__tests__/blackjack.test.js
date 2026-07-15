"use strict";
// Vingt-et-un (jeu du temple) — moteur (gains en Faveur, jeu DÉCOUPLÉ) : mise en
// OR, GAIN en Faveur = secondes × mult × ICARUS_FAVEUR_K. Tour par tour (tirer/
// rester), état module éphémère. Le croupier tire jusqu'à 17 ; un naturel paie
// 3:2. Une main perdue nourrit la cagnotte PARTAGÉE. Sabot INJECTABLE en test
// (options.deck, tiré du DÉBUT) → flux déterministe sans piloter le hasard.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { state, setState, hydrateState, invalidateRenderCache, resetTemporaryRunState } from "../state.js";
import {
  dealBlackjack,
  hitBlackjack,
  standBlackjack,
  blackjackStakes,
  blackjackActive,
  blackjackLastOutcome,
  blackjackResult,
  handValue,
  isBlackjack
} from "../actions.js";
import { __resetBlackjackForTests } from "../actions/blackjack.js";
import { toNum } from "../num.js";
import { ICARUS_FAVEUR_K, BLACKJACK_POT_FEED, BLACKJACK_HISTORY_LEN } from "../balance.js";
import { MID_GAME_FIXTURE } from "./fixtures.js";

const C = (rank, suit = "olive") => ({ rank, suit });

beforeEach(() => {
  setState(hydrateState(MID_GAME_FIXTURE));
  state.gold = 1e9;
  state.faveur = 0;
  state.icarusPotFaveur = 0;
  state.blackjackHistory = [];
  __resetBlackjackForTests();
  invalidateRenderCache("all");
});

afterEach(() => {
  __resetBlackjackForTests();
  vi.restoreAllMocks();
});

describe("Vingt-et-un — valeur de main (helpers purs)", () => {
  it("compte les As en 11 puis les dégrade à 1 pour éviter de crever", () => {
    expect(handValue([C("A"), C("K")])).toBe(21);
    expect(handValue([C("A"), C("A"), C("9")])).toBe(21); // 11 + 1 + 9
    expect(handValue([C("A"), C("5"), C("K")])).toBe(16); // 1 + 5 + 10
    expect(handValue([C("K"), C("Q"), C("5")])).toBe(25); // crève, pas d'As
  });

  it("isBlackjack : 21 en DEUX cartes seulement", () => {
    expect(isBlackjack([C("A"), C("K")])).toBe(true);
    expect(isBlackjack([C("A"), C("5"), C("5")])).toBe(false); // 21 en 3 cartes
    expect(isBlackjack([C("K"), C("9")])).toBe(false);
  });

  it("blackjackResult tranche toutes les issues", () => {
    expect(blackjackResult([C("A"), C("K")], [C("9"), C("7")])).toBe("blackjack");
    expect(blackjackResult([C("K"), C("9")], [C("K"), C("7")])).toBe("win");
    expect(blackjackResult([C("K"), C("7")], [C("K"), C("9")])).toBe("lose");
    expect(blackjackResult([C("K"), C("9")], [C("K"), C("9")])).toBe("push");
    expect(blackjackResult([C("K"), C("Q"), C("5")], [C("5"), C("6")])).toBe("lose"); // joueur crève
    expect(blackjackResult([C("K"), C("9")], [C("K"), C("Q"), C("5")])).toBe("win");  // croupier crève
    expect(blackjackResult([C("A"), C("K")], [C("A"), C("Q")])).toBe("push");         // deux naturels
    expect(blackjackResult([C("K"), C("Q")], [C("A"), C("K")])).toBe("lose");         // naturel croupier
  });
});

describe("Vingt-et-un — flux stateful (sabot injecté)", () => {
  it("paie la mise EN OR à la distribution", () => {
    const stake = blackjackStakes().find((s) => s.id === "royale");
    const before = toNum(state.gold);
    dealBlackjack("royale", { deck: [C("K"), C("9"), C("10"), C("6"), C("5")] });
    expect(toNum(state.gold)).toBeCloseTo(before - toNum(stake.gold), 0);
  });

  it("un naturel se résout d'emblée et paie 3:2", () => {
    const h = dealBlackjack("legere", { deck: [C("A"), C("K"), C("9"), C("7")] });
    expect(h.resolved).toBe(true);
    const out = blackjackLastOutcome();
    expect(out.result).toBe("blackjack");
    expect(state.faveur).toBe(Math.round(40 * 2.5 * ICARUS_FAVEUR_K)); // 15
    expect(blackjackActive()).toBe(false);
  });

  it("tirer et crever = perdu + cagnotte nourrie", () => {
    dealBlackjack("legere", { deck: [C("K"), C("Q"), C("9"), C("7"), C("K")] }); // joueur 20, croupier 16
    expect(blackjackActive()).toBe(true);
    hitBlackjack(); // tire le K → 30, crève
    expect(blackjackLastOutcome().result).toBe("lose");
    expect(state.faveur).toBe(0);
    expect(state.icarusPotFaveur).toBeCloseTo(40 * BLACKJACK_POT_FEED, 5); // 20
  });

  it("rester : le croupier tire jusqu'à 17 puis on compare", () => {
    // joueur 19 ; croupier 16 → tire le K → 26, crève → joueur gagne
    dealBlackjack("legere", { deck: [C("K"), C("9"), C("10"), C("6"), C("K")] });
    standBlackjack();
    expect(blackjackLastOutcome().result).toBe("win");
    expect(state.faveur).toBe(Math.round(40 * 2 * ICARUS_FAVEUR_K)); // 12
  });

  it("égalité : la Faveur d'un push = secondes × 1 × K", () => {
    dealBlackjack("legere", { deck: [C("K"), C("9"), C("K"), C("9")] }); // 19 vs 19
    standBlackjack();
    expect(blackjackLastOutcome().result).toBe("push");
    expect(state.faveur).toBe(Math.round(40 * 1 * ICARUS_FAVEUR_K)); // 6
  });

  it("un changement de cycle (effondrement) abandonne la main en cours", () => {
    dealBlackjack("legere", { deck: [C("K"), C("9"), C("10"), C("6"), C("5")] }); // reste en jeu
    expect(blackjackActive()).toBe(true);
    const faveurBefore = state.faveur;
    state.cycles = (state.cycles || 0) + 1; // effondrement : nouveau cycle
    expect(blackjackActive()).toBe(false);       // la main du cycle mort n'est plus vivante
    expect(hitBlackjack()).toBeNull();           // …et ne peut plus être jouée
    expect(standBlackjack()).toBeNull();
    expect(state.faveur).toBe(faveurBefore);     // aucune Faveur créditée pour une mise abandonnée
    // On peut redistribuer une main neuve dans le nouveau cycle.
    expect(dealBlackjack("legere", { deck: [C("A"), C("K"), C("9"), C("7")] })).toBeTruthy();
  });

  it("une seule main à la fois", () => {
    dealBlackjack("legere", { deck: [C("K"), C("9"), C("10"), C("6"), C("5")] }); // reste en jeu
    expect(blackjackActive()).toBe(true);
    expect(dealBlackjack("legere", { deck: [C("A"), C("K"), C("2"), C("3")] })).toBeNull();
  });

  it("l'historique est capé et effacé au cycle ; la cagnotte survit", () => {
    for (let i = 0; i < BLACKJACK_HISTORY_LEN + 4; i += 1) {
      dealBlackjack("legere", { deck: [C("K"), C("7"), C("K"), C("9")] }); // 17 vs 19 → lose
      standBlackjack();
    }
    expect(state.blackjackHistory.length).toBe(BLACKJACK_HISTORY_LEN);
    const potBefore = state.icarusPotFaveur;
    expect(potBefore).toBeGreaterThan(0);
    resetTemporaryRunState(state);
    expect(state.blackjackHistory).toEqual([]);
    expect(state.icarusPotFaveur).toBe(potBefore); // cagnotte partagée, persistante
  });
});

describe("Vingt-et-un — hydratation défensive", () => {
  it("re-type blackjackHistory (garde les chaînes)", () => {
    const s = hydrateState({ ...MID_GAME_FIXTURE, blackjackHistory: ["win", 3, "lose", null, "blackjack"] });
    expect(s.blackjackHistory).toEqual(["win", "lose", "blackjack"]);
  });
});
