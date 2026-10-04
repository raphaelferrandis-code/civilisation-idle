"use strict";
// Vingt-et-un (jeu du temple) — moteur. Mise et GAIN en FAVEUR = payRound(mise ×
// mult), le push rend exactement la mise. Tour par tour (tirer/rester/doubler/
// refendre), état module éphémère. Le croupier tire jusqu'à 17. Lot 1 des gains
// « vrai casino » (2026-10-04) : la mise est LIBRE entre les limites de la table,
// un naturel paie 6 contre 5 (×2,2), le double et la refente sont des règles de
// base (plus d'artefacts), et chaque main nourrit la cagnotte PARTAGÉE sur l'edge
// de référence (la bascule au-dessus de 100 % a disparu). Sabot INJECTABLE en
// test (options.deck, tiré du DÉBUT) → flux déterministe sans piloter le hasard.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { state, setState, hydrateState, invalidateRenderCache, resetTemporaryRunState } from "../state.js";
import {
  dealBlackjack,
  hitBlackjack,
  standBlackjack,
  blackjackActive,
  blackjackHand,
  blackjackLastOutcome,
  blackjackResult,
  handValue,
  isBlackjack
} from "../actions.js";
import {
  __resetBlackjackForTests,
  purgeBlackjackHand,
  doubleBlackjack,
  splitBlackjack,
  basicAction,
  resolveBlackjackHeadless
} from "../actions/blackjack.js";
import { tableLimits } from "../actions/maisonTable.js";
import {
  BLACKJACK_RTP_REF,
  BLACKJACK_RTP_AUTO,
  BLACKJACK_HISTORY_LEN,
  BLACKJACK_MULT,
  TEMPLE_POT_RECYCLE
} from "../balance.js";
import { MID_GAME_FIXTURE } from "./fixtures.js";

const C = (rank, suit = "olive") => ({ rank, suit });
const FAVEUR_START = 500;
// Une petite mise (l'ancienne « légère » valait 4) et une grosse (l'ancien « grand
// jeu », 25), toutes deux sous la limite haute de la fixture (95 à l'ère 5).
const MISE = 4;
const GROS = 25;
// Ce qu'une main verse à la cagnotte : la part recyclée de l'edge de référence.
const feedOf = (stake) => stake * TEMPLE_POT_RECYCLE * (1 - BLACKJACK_RTP_REF);

beforeEach(() => {
  setState(hydrateState(MID_GAME_FIXTURE));
  state.faveur = FAVEUR_START; // couvre toutes les mises (monnaie fermée)
  state.icarusPotFaveur = 0;
  state.blackjackHistory = [];
  state.templeArtifacts = {}; // double et refente : plus besoin d'artefact
  __resetBlackjackForTests();
  invalidateRenderCache("all");
});

afterEach(() => {
  __resetBlackjackForTests();
  vi.restoreAllMocks();
});

describe("Vingt-et-un — purge de la main au Grand Reset (2b de l'audit)", () => {
  it("purgeBlackjackHand tue une main VIVANTE (sinon elle se résout contre la cité neuve)", () => {
    dealBlackjack(MISE, { deck: [C("K"), C("9"), C("10"), C("6"), C("5")] }); // joueur 19 → main en jeu
    expect(blackjackActive()).toBe(true);
    purgeBlackjackHand();
    expect(blackjackActive()).toBe(false);
  });
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
  it("paie la mise EN FAVEUR à la distribution, refuse sans solde", () => {
    dealBlackjack(GROS, { deck: [C("K"), C("9"), C("10"), C("6"), C("5")] });
    expect(state.faveur).toBe(FAVEUR_START - GROS);
    __resetBlackjackForTests();
    state.faveur = GROS - 1;
    expect(dealBlackjack(GROS, { deck: [C("K"), C("9"), C("10"), C("6")] })).toBeNull();
    expect(state.faveur).toBe(GROS - 1);
  });

  it("la mise est libre : refusée sous 1, entière, plafonnée à la limite haute", () => {
    // Sous la limite basse (ou illisible, comme un ancien id de mise) : pas de donne.
    for (const bad of [0, 0.5, -10, NaN, undefined, "legere"]) {
      expect(dealBlackjack(bad, { deck: [C("K"), C("9"), C("10"), C("6")] }), String(bad)).toBeNull();
    }
    expect(state.faveur).toBe(FAVEUR_START);
    expect(blackjackActive()).toBe(false);
    // Au-dessus de la limite haute : la main se joue à la limite, pas plus.
    const { max } = tableLimits();
    const h = dealBlackjack(max * 100, { deck: [C("K"), C("9"), C("10"), C("6"), C("5")] });
    expect(h.stakeFaveur).toBe(max);
    expect(state.faveur).toBe(FAVEUR_START - max);
    __resetBlackjackForTests();
    expect(dealBlackjack(7.9, { deck: [C("K"), C("9"), C("10"), C("6"), C("5")] }).stakeFaveur).toBe(7);
  });

  it("un naturel se résout d'emblée et paie 6 contre 5 (×2,2 la mise)", () => {
    expect(BLACKJACK_MULT.blackjack).toBe(2.2);
    const h = dealBlackjack(5, { deck: [C("A"), C("K"), C("9"), C("7")] });
    expect(h.resolved).toBe(true);
    const out = blackjackLastOutcome();
    expect(out.result).toBe("blackjack");
    expect(out.faveurGain).toBe(11); // 5 × 2,2
    expect(state.faveur).toBe(FAVEUR_START - 5 + 11);
    expect(blackjackActive()).toBe(false);
  });

  it("un naturel fractionnaire passe par payRound (4 × 2,2 = 8,8 → 8 ou 9, espérance exacte)", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.9); // 0,9 ≥ 0,8 : arrondi vers le bas
    dealBlackjack(MISE, { deck: [C("A"), C("K"), C("9"), C("7")] });
    expect(blackjackLastOutcome().faveurGain).toBe(8);
    Math.random.mockReturnValue(0.5); // 0,5 < 0,8 : arrondi vers le haut
    dealBlackjack(MISE, { deck: [C("A"), C("K"), C("9"), C("7")] });
    expect(blackjackLastOutcome().faveurGain).toBe(9);
    expect(state.faveur).toBe(FAVEUR_START - 2 * MISE + 8 + 9);
  });

  it("tirer et crever = perdu ; la main nourrit la cagnotte sur l'edge de référence", () => {
    dealBlackjack(MISE, { deck: [C("K"), C("Q"), C("9"), C("7"), C("K")] }); // joueur 20, croupier 16
    expect(blackjackActive()).toBe(true);
    hitBlackjack(); // tire le K → 30, crève
    expect(blackjackLastOutcome().result).toBe("lose");
    expect(state.faveur).toBe(FAVEUR_START - MISE);
    // Plus de bascule : la référence (le jeu parfait, majoré) reste SOUS 1, l'auto
    // encore en dessous — il y a donc un edge, et la cagnotte en reçoit sa part.
    expect(BLACKJACK_RTP_REF).toBeLessThan(1);
    expect(BLACKJACK_RTP_AUTO).toBeLessThan(BLACKJACK_RTP_REF);
    expect(state.icarusPotFaveur).toBeGreaterThan(0);
    expect(state.icarusPotFaveur).toBeCloseTo(feedOf(MISE), 12);
  });

  it("rester : le croupier tire jusqu'à 17 puis on compare (gagner paie ×2)", () => {
    // joueur 19 ; croupier 16 → tire le K → 26, crève → joueur gagne
    dealBlackjack(MISE, { deck: [C("K"), C("9"), C("10"), C("6"), C("K")] });
    standBlackjack();
    expect(blackjackLastOutcome().result).toBe("win");
    expect(state.faveur).toBe(FAVEUR_START - MISE + MISE * 2);
  });

  it("égalité : le push rend EXACTEMENT la mise (solde inchangé)", () => {
    dealBlackjack(MISE, { deck: [C("K"), C("9"), C("K"), C("9")] }); // 19 vs 19
    standBlackjack();
    expect(blackjackLastOutcome().result).toBe("push");
    expect(state.faveur).toBe(FAVEUR_START);
  });

  it("un changement de cycle (effondrement) abandonne la main en cours", () => {
    dealBlackjack(MISE, { deck: [C("K"), C("9"), C("10"), C("6"), C("5")] }); // reste en jeu
    expect(blackjackActive()).toBe(true);
    const faveurBefore = state.faveur;
    state.cycles = (state.cycles || 0) + 1; // effondrement : nouveau cycle
    expect(blackjackActive()).toBe(false);       // la main du cycle mort n'est plus vivante
    expect(hitBlackjack()).toBeNull();           // …et ne peut plus être jouée
    expect(standBlackjack()).toBeNull();
    expect(doubleBlackjack()).toBeNull();
    expect(state.faveur).toBe(faveurBefore);     // aucune Faveur créditée pour une mise abandonnée
    // On peut redistribuer une main neuve dans le nouveau cycle.
    expect(dealBlackjack(MISE, { deck: [C("A"), C("K"), C("9"), C("7")] })).toBeTruthy();
  });

  it("une seule main à la fois", () => {
    dealBlackjack(MISE, { deck: [C("K"), C("9"), C("10"), C("6"), C("5")] }); // reste en jeu
    expect(blackjackActive()).toBe(true);
    expect(dealBlackjack(MISE, { deck: [C("A"), C("K"), C("2"), C("3")] })).toBeNull();
  });

  it("l'historique est capé et effacé au cycle ; la cagnotte survit", () => {
    state.icarusPotFaveur = 37; // cagnotte pré-remplie
    const hands = BLACKJACK_HISTORY_LEN + 4;
    for (let i = 0; i < hands; i += 1) {
      dealBlackjack(MISE, { deck: [C("K"), C("7"), C("K"), C("9")] }); // 17 vs 19 → lose
      standBlackjack();
    }
    expect(state.blackjackHistory.length).toBe(BLACKJACK_HISTORY_LEN);
    const pot = 37 + hands * feedOf(MISE); // chaque main a versé sa part d'edge
    expect(state.icarusPotFaveur).toBeCloseTo(pot, 9);
    resetTemporaryRunState(state);
    expect(state.blackjackHistory).toEqual([]);
    expect(state.icarusPotFaveur).toBeCloseTo(pot, 9); // cagnotte partagée, persistante
  });
});

describe("Vingt-et-un — double et refente, règles de base (lot 1)", () => {
  it("le double est permis SANS artefact : mise doublée, UNE carte, la main passe", () => {
    // 5-6 (11) contre 9-7 (16). Double : le K → 21 ; l'oracle tire le K → 26, crève.
    dealBlackjack(MISE, { deck: [C("5"), C("6"), C("9"), C("7"), C("K"), C("K")] });
    expect(blackjackHand().canDouble).toBe(true);
    const h = doubleBlackjack();
    expect(h.doubled).toBe(true);
    expect(h.stakeFaveur).toBe(2 * MISE);
    expect(h.player).toHaveLength(3); // une seule carte de plus
    expect(h.resolved).toBe(true);
    expect(blackjackLastOutcome().result).toBe("win");
    expect(state.faveur).toBe(FAVEUR_START - 2 * MISE + 2 * (2 * MISE)); // ×2 sur la mise doublée
    expect(state.icarusPotFaveur).toBeCloseTo(feedOf(2 * MISE), 12);
  });

  it("la refente est permise SANS artefact sur une paire (la seconde mise est débitée)", () => {
    // Le détail de la refente (figures, 21 refendu, DAS) vit dans maisonTable.test.js.
    dealBlackjack(MISE, { deck: [C("8"), C("8"), C("9"), C("7"), C("2"), C("3"), C("K")] });
    expect(blackjackHand().canSplit).toBe(true);
    const h = splitBlackjack();
    expect(h.split).toBe(true);
    expect(h.hands).toHaveLength(2);
    expect(state.faveur).toBe(FAVEUR_START - 2 * MISE);
  });

  it("ni double ni refente quand la Faveur ne couvre pas la seconde mise", () => {
    state.faveur = 2 * MISE - 1; // de quoi payer la mise, pas de quoi la doubler
    dealBlackjack(MISE, { deck: [C("8"), C("8"), C("9"), C("7"), C("2"), C("3"), C("K")] });
    const h = blackjackHand();
    expect(h.canDouble).toBe(false);
    expect(h.canSplit).toBe(false);
    expect(doubleBlackjack()).toBeNull();
    expect(splitBlackjack()).toBeNull();
    expect(state.faveur).toBe(MISE - 1);
    expect(blackjackActive()).toBe(true); // la main continue, simplement
  });
});

describe("Vingt-et-un — l'automatisation (main headless)", () => {
  // 6-5 (11) contre un 6 (et un 10 caché : 16). Puis le K, puis le 9.
  const elevenVsSix = () => [C("6"), C("5"), C("6"), C("10"), C("K"), C("9")];

  it("double quand la Mesure le dit et que la Faveur couvre la seconde mise", () => {
    expect(basicAction([C("6"), C("5")], C("6"), { allowDouble: true })).toBe("double");
    // Mise 10 doublée à 20 ; le K → 21 ; l'oracle (16) tire le 9 → 25, crève.
    const out = resolveBlackjackHeadless(10, { deck: elevenVsSix() });
    expect(out).toEqual({ result: "win", faveurGain: 40, stakeFaveur: 20, doubled: true });
    expect(state.faveur).toBe(FAVEUR_START - 20 + 40);
    expect(state.icarusPotFaveur).toBeCloseTo(feedOf(20), 12); // la mise doublée nourrit le pot
    // Sans main interactive, sans historique, sans série.
    expect(blackjackActive()).toBe(false);
    expect(state.blackjackHistory).toEqual([]);
  });

  it("sans la Faveur pour la seconde mise, elle joue la main simple", () => {
    state.faveur = 19; // la mise (10) passe, sa doublure non (il resterait 9)
    // 11 : la base TIRE (le K → 21) et reste ; l'oracle (16) tire le 9 → 25, crève.
    const out = resolveBlackjackHeadless(10, { deck: elevenVsSix() });
    expect(out).toEqual({ result: "win", faveurGain: 20, stakeFaveur: 10, doubled: false });
    expect(state.faveur).toBe(19 - 10 + 20);
  });

  it("ne refend jamais : une paire se joue en une seule main", () => {
    // 8-8 (16) contre K-7 (17) : la base tire le 5 → 21, l'oracle reste à 17.
    const out = resolveBlackjackHeadless(10, { deck: [C("8"), C("8"), C("K"), C("7"), C("5")] });
    expect(out).toEqual({ result: "win", faveurGain: 20, stakeFaveur: 10, doubled: false });
    expect(state.faveur).toBe(FAVEUR_START - 10 + 20);
  });

  it("mise libre : refusée sous 1, plafonnée à la limite haute", () => {
    expect(resolveBlackjackHeadless(0)).toBeNull();
    expect(resolveBlackjackHeadless(0.5)).toBeNull();
    expect(state.faveur).toBe(FAVEUR_START);
    const { max } = tableLimits();
    // K-9 (19) contre K-8 (18) : la base reste, l'oracle aussi → gagné, sans double.
    const out = resolveBlackjackHeadless(max * 100, { deck: [C("K"), C("9"), C("K"), C("8")] });
    expect(out).toEqual({ result: "win", faveurGain: 2 * max, stakeFaveur: max, doubled: false });
    expect(state.faveur).toBe(FAVEUR_START - max + 2 * max);
  });
});

describe("Vingt-et-un — hydratation défensive", () => {
  it("re-type blackjackHistory (garde les chaînes)", () => {
    const s = hydrateState({ ...MID_GAME_FIXTURE, blackjackHistory: ["win", 3, "lose", null, "blackjack"] });
    expect(s.blackjackHistory).toEqual(["win", "lose", "blackjack"]);
  });
});
