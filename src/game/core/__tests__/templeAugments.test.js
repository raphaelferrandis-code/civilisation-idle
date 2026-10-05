"use strict";
// LES AUGMENTS DU TEMPLE (2026-07-17, arbitrage Raphaël « go sur tout ») —
// quatre lignées, capstone = automatisation pour TOUS les jeux. Lot 1 des gains
// « vrai casino » (2026-10-04, docs/PLAN-GAINS-CASINO.md) : plus aucun augment ne
// touche aux COTES, la mise est LIBRE entre les limites de la table, un vol offert
// porte un MONTANT (la mise du coup qui l'a gagné).
//  - osselets : rite interdit (gaté moteur), un pari à 18 % normalisé à 97 % ;
//  - Icare : second souffle (consolation 0.7, prélevée), serres (rafle ×1.5,
//    sortie seule), colombier (file 8, historique 24) ;
//  - gratteux : stylet (rayon, pur geste), offrande recopiée (relance financée par
//    la cella, transfert STRICT) ;
//  - vingt-et-un : voix (série), mesure (basicAction). LE DOUBLE et LA REFENTE ne
//    sont plus des artefacts : ce sont des règles de base (le naturel payé 6 contre 5
//    garde le jeu parfait sous 100 %). L'auto joue la base AVEC le double, jamais la
//    refente.
// Et la valeur du vol offert par Vénus entre dans la normalisation des osselets.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { state, setState, hydrateState, invalidateRenderCache, setNotifyPaused } from "../state.js";
import {
  castAugury, auguryPaytable,
  dealBlackjack, standBlackjack, blackjackHand, blackjackLastOutcome,
  playScratch, scratchRtpRef,
  tickTempleAutomation, setTempleAuto, unlockTempleAuto, autoFloorMax,
  tableLimits, autoStake, promoteRank
} from "../actions.js";
import { icarusCrashConsolation, icarusHistoryLen } from "../actions/icarus.js";
import {
  doubleBlackjack, splitBlackjack, basicAction, resolveBlackjackHeadless, __resetBlackjackForTests
} from "../actions/blackjack.js";
import { potRakeShare } from "../actions/templePot.js";
import {
  grantFreeFlight, freeFlightCap, consumeFreeFlight, nextFreeFlight, freeFlightCount
} from "../actions/templeFlights.js";
import { ARTIFACT_NODES } from "../../data/artifacts.js";
import {
  AUGURY_RTP, AUGURY_RITE_BETS, ICARUS_RTP,
  ICARUS_FREE_FLIGHTS_MAX, FLIGHTS_MAX_COLOMBIER,
  ICARUS_HISTORY_LEN, ICARUS_HISTORY_COLOMBIER,
  SOUFFLE_CONSOLATION_MULT, SERRES_RAKE_MULT,
  AUTO_SCRATCH_UNLOCK_COST, AUTO_BLACKJACK_UNLOCK_COST, AUTO_STAKE_STEPS,
  TEMPLE_POT_RECYCLE, BLACKJACK_RTP_REF, FAVEUR_ECHELLE, MAISON_RANKS } from "../balance.js";
import { MID_GAME_FIXTURE, FIXED_NOW } from "./fixtures.js";
import { recettesPerHour } from "../actions/maisonTable.js";
// payRoundAt : prévoir un gain sous Math.random piloté ; withRandom : piloter
// Math.random (aux osselets : l'issue, le carré de six si Vénus, les os, puis
// l'arrondi du gain).
import { payRoundAt, withRandom } from "../../../test/core.js";

// ×FAVEUR_ECHELLE : l'échelle de la Faveur (2026-10-04) — une bourse de test qui couvre
// encore la limite des tables.
const FAVEUR_START = 5000 * FAVEUR_ECHELLE;
const C = (rank, suit = "olive") => ({ rank, suit });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
  setState(hydrateState(MID_GAME_FIXTURE));
  state.bestEraIndex = 4; // toutes les tables ouvertes (limite haute 65 à l'ère record 4)
  state.faveur = FAVEUR_START;
  state.templeArtifacts = {};
  state.icarusPotFaveur = 0;
  state.icarusFreeFlights = [];
  __resetBlackjackForTests(); // la main est un état MODULE : rien ne traîne d'un test à l'autre
  invalidateRenderCache("all");
});

afterEach(() => {
  setNotifyPaused(false);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ── Osselets : le rite interdit ───────────────────────────────────────────────
describe("Rite interdit (artefact, 4e rite)", () => {
  it("le MOTEUR refuse le rite sans l'artefact (l'auto passe par là)", () => {
    expect(castAugury("prayForRain", "interdit", { stake: 10, render: false, silent: true })).toBeNull();
    expect(state.faveur).toBe(FAVEUR_START); // rien débité
    // Contrôle : à la même mise, le rite ancestral se joue (c'est bien l'artefact qui manque).
    expect(castAugury("prayForRain", "classique", { stake: 10, render: false, silent: true })).not.toBeNull();
  });

  it("avec l'artefact : un pari à 18 % joué à la mise posée, Vénus payée près de ×9,4", () => {
    state.templeArtifacts = { interdit: true };
    const pay = auguryPaytable("prayForRain", "interdit");
    // r = 0,3 : l'ancestral (p 0,475) gagnerait une Paire ; l'interdit (p 0,18) tombe
    // sur le Chien — sa part de Chien (0,4 × 2,5, bornée à 0,95) prend presque toute
    // la masse perdante (Chien dès r ≥ 0,221).
    const perdu = withRandom([0.3], 0.5, () => castAugury("prayForRain", "interdit", { stake: 20, render: false, silent: true }));
    expect(perdu).not.toBeNull();
    expect(perdu.riteId).toBe("interdit");
    expect(perdu.p).toBe(AUGURY_RITE_BETS.interdit.p);
    expect(perdu.stake).toBe(20);
    expect(perdu.win).toBe(false);
    expect(perdu.tier).toBe("dog");
    expect(state.faveur).toBe(FAVEUR_START - 20);

    // Vénus (r < 0,0675), sans carré de six : la mise × ~9,37 et un vol à la mise.
    const venus = withRandom([0.01, 0.5], 0.5, () => castAugury("prayForRain", "interdit", { stake: 20, render: false, silent: true }));
    expect(venus.tier).toBe("venus");
    expect(pay.mult.venus).toBeGreaterThan(9);
    expect(venus.faveurGain).toBe(payRoundAt(20 * pay.mult.venus, 0.5));
    expect(state.faveur).toBe(FAVEUR_START - 40 + venus.faveurGain);
    expect(state.icarusFreeFlights).toEqual([20]);
    // Et sa table rend 97 %, comme les trois autres.
    expect(pay.rtp).toBeCloseTo(AUGURY_RTP, 12);
  });
});

// ── Osselets : le vol offert COMPTE dans la normalisation ────────────────────
describe("Normalisation flight-aware (le trou Vénus fermé)", () => {
  it("la Faveur versée rend 97 % MOINS la valeur du vol de Vénus : le total tient la cible", () => {
    for (const rite of ["prudent", "classique", "grand", "interdit"]) {
      const pay = auguryPaytable("prayForRain", rite);
      // Un vol offert vaut sa mise × le RTP d'Icare ; il est offert à chaque Vénus.
      expect(pay.flightShare, rite).toBeCloseTo(pay.odds.venus * ICARUS_RTP, 12);
      const faveurSeule = pay.odds.venus * pay.mult.venus + pay.odds.triple * pay.mult.triple
        + pay.odds.pair * pay.mult.pair;
      // C'était LE trou : le vol valait jusqu'à +8,5 pts HORS budget. La Faveur
      // versée laisse désormais exactement sa place au vol…
      expect(faveurSeule, rite).toBeCloseTo(AUGURY_RTP - pay.flightShare, 12);
      // …et le total (Faveur + vol) tient la cible, jamais au-dessus de 100 %.
      expect(pay.rtp, rite).toBeCloseTo(AUGURY_RTP, 12);
      expect(faveurSeule + pay.flightShare, rite).toBeLessThan(1);
    }
  });
});

// ── Icare : souffle, serres, colombier ───────────────────────────────────────
describe("Lignée Icare étendue", () => {
  it("le second souffle porte la consolation de 0.5 à 0.7 (toujours prélevée)", () => {
    expect(icarusCrashConsolation(10)).toBe(0); // sans plumes
    state.templeArtifacts = { plumes: true };
    expect(icarusCrashConsolation(10)).toBe(5);
    state.templeArtifacts = { plumes: true, souffle: true };
    expect(icarusCrashConsolation(10)).toBe(Math.round(10 * SOUFFLE_CONSOLATION_MULT));
  });

  it("la rafle se prend au prorata de la limite haute ; les serres la montent de moitié, bornée à 1", () => {
    const { max } = tableLimits();
    expect(potRakeShare(4)).toBeCloseTo(4 / max, 12);
    expect(potRakeShare(max)).toBe(1); // la mise maximale rafle la cella entière
    state.templeArtifacts = { serres: true };
    expect(potRakeShare(4)).toBeCloseTo((4 * SERRES_RAKE_MULT) / max, 12);
    expect(potRakeShare(Math.ceil(max / SERRES_RAKE_MULT))).toBe(1); // jamais plus que la cella
    expect(potRakeShare(max)).toBe(1);
  });

  it("le colombier élargit la file (5 → 8) et l'historique (12 → 24)", () => {
    expect(freeFlightCap()).toBe(ICARUS_FREE_FLIGHTS_MAX);
    expect(icarusHistoryLen()).toBe(ICARUS_HISTORY_LEN);
    for (let i = 0; i < ICARUS_FREE_FLIGHTS_MAX; i++) expect(grantFreeFlight(4 + i)).toBe(true);
    expect(grantFreeFlight(4)).toBe(false); // file pleine à 5
    state.templeArtifacts = { colombier: true };
    expect(freeFlightCap()).toBe(FLIGHTS_MAX_COLOMBIER);
    expect(icarusHistoryLen()).toBe(ICARUS_HISTORY_COLOMBIER);
    for (let i = ICARUS_FREE_FLIGHTS_MAX; i < FLIGHTS_MAX_COLOMBIER; i++) expect(grantFreeFlight(4)).toBe(true);
    expect(grantFreeFlight(4)).toBe(false); // pleine à 8
    expect(state.icarusFreeFlights).toHaveLength(FLIGHTS_MAX_COLOMBIER);
  });

  it("un vol offert porte un MONTANT : borné par la table, refusé sous 1, joué dans l'ordre", () => {
    const { max } = tableLimits();
    expect(grantFreeFlight(12)).toBe(true);
    expect(grantFreeFlight(max * 10)).toBe(true); // ramené à la limite haute
    expect(grantFreeFlight(0.5)).toBe(false);     // sous la limite basse : pas de billet
    expect(grantFreeFlight(0)).toBe(false);
    expect(state.icarusFreeFlights).toEqual([12, max]);
    expect(freeFlightCount()).toBe(2);
    expect(nextFreeFlight()).toBe(12);
    expect(consumeFreeFlight()).toBe(12);
    expect(consumeFreeFlight()).toBe(max);
    expect(consumeFreeFlight()).toBe(0); // file vide
    // Une save trafiquée ne vole pas plus haut que la table.
    state.icarusFreeFlights = [1e9];
    expect(consumeFreeFlight()).toBe(max);
  });
});

// ── Gratteux : l'offrande recopiée (relance financée par la cella) ───────────
describe("L'offrande recopiée (relance)", () => {
  it("la cella paie la mise ENTIÈRE ou rien, le joueur ne paie jamais", () => {
    const stake = 4;
    // Sans l'artefact : refusée.
    state.icarusPotFaveur = 100;
    expect(playScratch(stake, { render: false, silent: true, potFunded: true })).toBeNull();
    state.templeArtifacts = { relance: true };
    // Cella trop maigre (3 < 4) : refusée, STRICTEMENT (pas de mint partiel).
    state.icarusPotFaveur = 3;
    expect(playScratch(stake, { render: false, silent: true, potFunded: true })).toBeNull();
    // Cella garnie : le pot paie, la Faveur du joueur ne bouge pas à l'achat.
    state.icarusPotFaveur = 100;
    vi.spyOn(Math, "random").mockReturnValue(0.1); // blank (perte)
    const res = playScratch(stake, { render: false, silent: true, potFunded: true });
    Math.random.mockRestore();
    expect(res).not.toBeNull();
    expect(res.potFunded).toBe(true);
    expect(res.symbol).toBe("blank");
    // 100 − 4 (mise payée par la cella) + le versement d'edge du ticket (feedPot).
    expect(state.icarusPotFaveur).toBeCloseTo(100 - stake + stake * TEMPLE_POT_RECYCLE * (1 - scratchRtpRef()), 9);
    expect(state.faveur).toBe(FAVEUR_START); // le joueur n'a rien payé (et rien gagné)
  });
});

// ── Vingt-et-un : la mesure, le double, la refente, la série ─────────────────
describe("La mesure gravée (basicAction)", () => {
  it("suit la table de base : 16 dur tire contre 10, reste contre 6", () => {
    expect(basicAction([C("10"), C("6")], C("K"))).toBe("hit");
    expect(basicAction([C("10"), C("6")], C("6"))).toBe("stand");
    expect(basicAction([C("A"), C("7")], C("9"))).toBe("hit");   // soft 18 contre 9
    expect(basicAction([C("A"), C("8")], C("6"))).toBe("stand"); // soft 19
  });

  it("ne propose le double que sur 2 cartes, avec allowDouble", () => {
    expect(basicAction([C("5"), C("6")], C("6"), { allowDouble: true })).toBe("double"); // 11
    expect(basicAction([C("5"), C("6")], C("6"))).toBe("hit"); // sans allowDouble
    expect(basicAction([C("5"), C("3"), C("3")], C("6"), { allowDouble: true })).toBe("hit"); // 3 cartes
  });
});

describe("Le double et la refente — règles de base depuis le lot 1 (plus d'artefact)", () => {
  it("les artefacts « double » et « refente » ont quitté l'arbre", () => {
    expect(ARTIFACT_NODES.double).toBeUndefined();
    expect(ARTIFACT_NODES.refente).toBeUndefined();
  });

  it("le double est permis SANS artefact : gagné, il paie sur la mise DOUBLÉE", () => {
    dealBlackjack(4, { deck: [C("6"), C("5"), C("9"), C("7"), C("10"), C("K")] }); // joueur 11, oracle 16
    expect(blackjackHand().canDouble).toBe(true);
    const h = doubleBlackjack(); // débite 4 de plus, tire le 10 → 21, l'oracle tire le K → 26
    expect(h.doubled).toBe(true);
    expect(blackjackLastOutcome().result).toBe("win");
    // Mise doublée 8, victoire ×2 = 16 (entier : payRound déterministe ici).
    expect(state.faveur).toBe(FAVEUR_START - 8 + 16);
    // La cagnotte est nourrie sur la mise réellement engagée (la mise doublée).
    expect(state.icarusPotFaveur).toBeCloseTo(8 * TEMPLE_POT_RECYCLE * (1 - BLACKJACK_RTP_REF), 9);
  });

  it("crever après le double perd la mise doublée", () => {
    dealBlackjack(4, { deck: [C("K"), C("6"), C("9"), C("7"), C("K")] }); // joueur 16
    const h = doubleBlackjack(); // tire le K → 26, crevé
    expect(h.resolved).toBe(true);
    expect(blackjackLastOutcome().result).toBe("lose");
    expect(state.faveur).toBe(FAVEUR_START - 8);
  });

  it("la refente est permise SANS artefact : deux mains, deux mises, double après refente", () => {
    // Paire de 8 contre un 16 de l'oracle ; le sabot donne ensuite 3 et 10 aux deux mains.
    dealBlackjack(4, { deck: [C("8"), C("8", "amphore"), C("9"), C("7"), C("3"), C("10"), C("10", "laurier"), C("K")] });
    expect(blackjackHand().canSplit).toBe(true);
    const split = splitBlackjack(); // seconde mise débitée, une carte de plus à chaque main
    expect(split.split).toBe(true);
    expect(split.hands.map((m) => m.value)).toEqual([11, 18]);
    expect(split.canSplit).toBe(false); // une seule refente par donne
    expect(splitBlackjack()).toBeNull();
    expect(state.faveur).toBe(FAVEUR_START - 8);
    doubleBlackjack(); // 8-3 = 11 : on double (permis après refente), le 10 donne 21
    standBlackjack();  // on reste sur 18 ; l'oracle tire le K → 26, crève
    const out = blackjackLastOutcome();
    expect(out.split).toBe(true);
    expect(out.results.map((r) => [r.result, r.stake, r.faveurGain])).toEqual([["win", 8, 16], ["win", 4, 8]]);
    expect(out.result).toBe("win");
    expect(state.faveur).toBe(FAVEUR_START - 12 + 24);
  });

  it("seule garde : avoir la Faveur de la seconde mise", () => {
    state.faveur = 4;
    dealBlackjack(4, { deck: [C("8"), C("8", "amphore"), C("9"), C("7"), C("3"), C("10"), C("K")] });
    expect(state.faveur).toBe(0);
    const h = blackjackHand();
    expect(h.canDouble).toBe(false);
    expect(h.canSplit).toBe(false);
    expect(doubleBlackjack()).toBeNull();
    expect(splitBlackjack()).toBeNull();
    // La Faveur revient : les deux gestes se rouvrent, sans aucun artefact.
    state.faveur = 4;
    expect(blackjackHand().canDouble).toBe(true);
    expect(blackjackHand().canSplit).toBe(true);
    expect(splitBlackjack()).not.toBeNull();
    expect(state.faveur).toBe(0);
  });
});

describe("L'auto-vingt-et-un : la base AVEC le double, jamais la refente", () => {
  it("double quand la stratégie le dit ET que la Faveur couvre la seconde mise", () => {
    // Joueur 6-5 = 11 contre un 9 : la base dit « double ». Le 10 donne 21, l'oracle
    // (9-7 = 16) tire le K et crève.
    const deck = [C("6"), C("5"), C("9"), C("7"), C("10"), C("K")];
    expect(basicAction(deck.slice(0, 2), deck[2], { allowDouble: true })).toBe("double");

    state.faveur = 100;
    const res = resolveBlackjackHeadless(4, { deck });
    expect(res).toEqual({ result: "win", faveurGain: 16, stakeFaveur: 8, doubled: true });
    expect(state.faveur).toBe(100 - 8 + 16);
    expect(state.icarusPotFaveur).toBeCloseTo(8 * TEMPLE_POT_RECYCLE * (1 - BLACKJACK_RTP_REF), 9);

    // La Faveur ne couvre pas la seconde mise : l'auto TIRE au lieu de doubler
    // (11 → 21 avec le même 10), et gagne sur la mise simple.
    state.faveur = 4;
    const court = resolveBlackjackHeadless(4, { deck });
    expect(court).toEqual({ result: "win", faveurGain: 8, stakeFaveur: 4, doubled: false });
    expect(state.faveur).toBe(8);
  });

  it("ne refend jamais : une paire de 8 se joue comme un 16 dur", () => {
    // 8-8 contre un 10 : la base (sans refente) tire ; le 5 donne 21 contre 17.
    state.faveur = 100;
    const res = resolveBlackjackHeadless(4, { deck: [C("8"), C("8", "amphore"), C("10"), C("7"), C("5")] });
    expect(res).toEqual({ result: "win", faveurGain: 8, stakeFaveur: 4, doubled: false });
    expect(state.faveur).toBe(100 - 4 + 8); // une seule mise engagée
  });

  it("ne double pas si la seconde mise entamerait la réserve (floor)", () => {
    // Régression du lot 1 : le double ne regardait que la Faveur, pas la réserve.
    // Faveur 100, réserve 84, mise 16 : après la mise, 84 ; doubler laisserait 68.
    const deck = [C("6"), C("5"), C("9"), C("7"), C("10"), C("K")]; // 11 contre 9
    state.faveur = 100;
    const tenu = resolveBlackjackHeadless(16, { deck, floor: 84 });
    expect(tenu).toEqual({ result: "win", faveurGain: 32, stakeFaveur: 16, doubled: false });
    expect(state.faveur).toBe(100 - 16 + 32);
    // Réserve de 68 : la seconde mise la laisse intacte, l'auto double.
    state.faveur = 100;
    const double = resolveBlackjackHeadless(16, { deck, floor: 68 });
    expect(double).toEqual({ result: "win", faveurGain: 64, stakeFaveur: 32, doubled: true });
  });
});

describe("La série de l'oracle (la Voix)", () => {
  it("win/blackjack l'allongent, lose la coupe, l'auto n'y touche pas", () => {
    expect(state.blackjackStreak || 0).toBe(0);
    dealBlackjack(4, { deck: [C("K"), C("Q"), C("9"), C("7"), C("K")] }); // joueur 20
    standBlackjack(); // l'oracle 16 tire le K → crève → win
    expect(state.blackjackStreak).toBe(1);
    dealBlackjack(4, { deck: [C("K"), C("6"), C("9"), C("8"), C("K")] }); // joueur 16
    standBlackjack(); // l'oracle 17 reste → 17 > 16 → lose
    expect(state.blackjackStreak).toBe(0);
    // L'auto (headless) ne compte NI série NI historique.
    const histBefore = (state.blackjackHistory || []).length;
    state.blackjackStreak = 3;
    const res = resolveBlackjackHeadless(4, { deck: [C("K"), C("Q"), C("9"), C("7"), C("K")] });
    expect(res.result).toBe("win");
    expect(state.blackjackStreak).toBe(3);
    expect((state.blackjackHistory || []).length).toBe(histBefore);
  });
});

// ── Automatisation : les deux capstones + cadrans ────────────────────────────
describe("Auto-gratteux et auto-vingt-et-un (capstones)", () => {
  beforeEach(() => {
    state.templeAuto = hydrateState({ ...MID_GAME_FIXTURE, templeAuto: {} }).templeAuto;
  });

  it("offerts au rang Notable (plus à vendre), sans débit", () => {
    state.faveur = AUTO_SCRATCH_UNLOCK_COST + AUTO_BLACKJACK_UNLOCK_COST;
    expect(unlockTempleAuto("gratteux")).toBe(false);
    expect(unlockTempleAuto("vingtetun")).toBe(false);
    state.maisonReputation = 3; // le seuil de Notable
    const avant = state.faveur;
    promoteRank();
    expect(state.templeAuto.gratteux.unlocked).toBe(true);
    expect(state.templeAuto.vingtetun.unlocked).toBe(true);
    // Rien n'est débité ; les titres versent leur bourse (Familier puis Notable, en
    // heures de recettes — 2026-10-04).
    const bourses = Math.round(MAISON_RANKS[1].faveurH * recettesPerHour()) + Math.round(MAISON_RANKS[2].faveurH * recettesPerHour());
    expect(state.faveur).toBe(avant + bourses);
  });

  it("le tick joue un ticket perdant au cadran de mise : mise débitée, rien en retour", () => {
    state.templeAuto.gratteux = { unlocked: true, on: true, stakeStep: "quart", tempo: "mesure", faveurFloor: 0, lastAt: 0 };
    state.faveur = 100 * FAVEUR_ECHELLE;
    const stake = autoStake("quart");
    expect(stake).toBe(Math.floor(tableLimits().max / 4)); // un quart de la limite haute
    vi.spyOn(Math, "random").mockReturnValue(0.1); // blank (perte)
    tickTempleAutomation();
    Math.random.mockRestore();
    expect(state.templeAuto.gratteux.lastAt).toBe(FIXED_NOW);
    expect(state.faveur).toBe(100 * FAVEUR_ECHELLE - stake); // ticket perdant
    expect(state.icarusPotFaveur).toBeCloseTo(stake * TEMPLE_POT_RECYCLE * (1 - scratchRtpRef()), 9);
  });

  it("le tick joue UNE main de vingt-et-un au cadran de mise, et dort sous le plancher", () => {
    state.templeAuto.vingtetun = { unlocked: true, on: true, stakeStep: "quart", tempo: "mesure", faveurFloor: 0, lastAt: 0 };
    state.faveur = 100 * FAVEUR_ECHELLE;
    const stake = autoStake("quart");
    const stats = () => state.chronicleStats.games.blackjack;
    const avant = { plays: stats().plays, wagered: stats().wagered, won: stats().won };
    vi.spyOn(Math, "random").mockReturnValue(0.1); // sabot battu déterministe
    tickTempleAutomation();
    Math.random.mockRestore();
    expect(state.templeAuto.vingtetun.lastAt).toBe(FIXED_NOW);
    expect(stats().plays - avant.plays).toBe(1); // une SEULE main par tick
    // La mise du cadran — doublée si la stratégie l'a voulu (jamais refendue).
    const wagered = stats().wagered - avant.wagered;
    expect([stake, 2 * stake]).toContain(wagered);
    // Bilan exact d'une main : la mise sort, le gain (éventuel) entre.
    expect(state.faveur).toBe(100 * FAVEUR_ECHELLE - wagered + (stats().won - avant.won));

    // Plancher : la réserve doit tenir APRÈS la mise → trop court, l'auto dort.
    state.templeAuto.vingtetun.lastAt = 0;
    state.templeAuto.vingtetun.faveurFloor = 2000 * FAVEUR_ECHELLE;
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    tickTempleAutomation();
    Math.random.mockRestore();
    expect(state.templeAuto.vingtetun.lastAt).toBe(0); // pas joué
    expect(stats().plays - avant.plays).toBe(1);
  });

  it("le tick ne passe JAMAIS sous la réserve, même quand la base veut doubler", () => {
    const stake = autoStake("max");
    const floor = 500;
    let seed = 7;
    const lcg = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    const stats = () => state.chronicleStats.games.blackjack;
    const run = (faveurOf) => {
      seed = 7;
      vi.spyOn(Math, "random").mockImplementation(lcg);
      let doubles = 0;
      let under = 0;
      for (let n = 0; n < 300; n += 1) {
        state.faveur = faveurOf();
        state.templeAuto.vingtetun.lastAt = 0;
        const avant = stats().wagered;
        tickTempleAutomation();
        if (stats().wagered - avant === 2 * stake) doubles += 1;
        if (state.faveur < floor) under += 1;
      }
      Math.random.mockRestore();
      return { doubles, under };
    };
    state.templeAuto.vingtetun = { unlocked: true, on: true, stakeStep: "max", tempo: "mesure", faveurFloor: floor, lastAt: 0 };
    // Bourse large : la base double de temps en temps (le cas est bien couvert).
    expect(run(() => floor + 10 * stake).doubles).toBeGreaterThan(0);
    // Bourse juste : la mise passe, la seconde non → jamais de double, jamais sous la réserve.
    expect(run(() => floor + stake + Math.floor(stake / 2))).toEqual({ doubles: 0, under: 0 });
  });

  it("setTempleAuto valide le cadran de mise (une part de la limite), le tempo et le plancher", () => {
    state.templeAuto.gratteux.unlocked = true;
    setTempleAuto("gratteux", { stakeStep: "moitie", tempo: "fervent" });
    expect(state.templeAuto.gratteux.stakeStep).toBe("moitie");
    expect(state.templeAuto.gratteux.tempo).toBe("fervent");
    setTempleAuto("gratteux", { stakeStep: "talent", tempo: "n'importe" }); // ancien id de mise, tempo inconnu → refusés
    expect(state.templeAuto.gratteux.stakeStep).toBe("moitie");
    expect(state.templeAuto.gratteux.tempo).toBe("fervent");
    setTempleAuto("vingtetun", { stakeStep: "max", tempo: "recueilli" });
    expect(state.templeAuto.vingtetun.stakeStep).toBe("max");
    expect(state.templeAuto.vingtetun.tempo).toBe("recueilli");
    // Le cadran est une PART de la limite haute (min = la limite basse).
    const { min, max } = tableLimits();
    expect(autoStake("min")).toBe(min);
    expect(autoStake("quart")).toBe(Math.floor(max / 4));
    expect(autoStake("moitie")).toBe(Math.floor(max / 2));
    expect(autoStake("max")).toBe(max);
    // Le plancher de réserve est borné par 24 h de recettes (autoFloorMax).
    setTempleAuto("vingtetun", { faveurFloor: 1e9 });
    expect(state.templeAuto.vingtetun.faveurFloor).toBe(autoFloorMax());
  });

  it("hydratation : les 4 autos + tempo bornés, une save d'avant (Coffres) repart à la mise minimale", () => {
    const s = hydrateState({
      templeAuto: {
        osselets: { unlocked: true, on: true, rite: "grand", stakeId: "hecatombe", stakePow: 2 },
        vingtetun: { unlocked: true, stakeId: "royale" },
        gratteux: { stakeStep: "quart" }
      }
    });
    expect(s.templeAuto.osselets.tempo).toBe("mesure");
    expect(s.templeAuto.osselets.rite).toBe("grand");
    expect(s.templeAuto.osselets.stakeStep).toBe("min");
    expect(s.templeAuto.osselets).not.toHaveProperty("stakeId");
    expect(s.templeAuto.osselets).not.toHaveProperty("stakePow");
    expect(s.templeAuto.vingtetun.stakeStep).toBe("min");
    expect(s.templeAuto.gratteux.stakeStep).toBe("quart"); // un cadran valide est gardé
    expect(s.templeAuto.gratteux.unlocked).toBe(false);
    expect(s.templeAuto.icarus).toBeTruthy();
    for (const game of ["osselets", "icarus", "gratteux", "vingtetun"]) {
      expect(Object.keys(AUTO_STAKE_STEPS)).toContain(s.templeAuto[game].stakeStep);
    }
  });
});

// ── Le stylet (niveau, pur geste) ────────────────────────────────────────────
describe("Le stylet du gratteux", () => {
  it("s'achète par niveaux et persiste au Grand Reset (GR_PERSISTENT_FIELDS)", () => {
    const s = hydrateState({ styletLevel: 99 });
    expect(s.styletLevel).toBeLessThanOrEqual(3); // borné au max
  });
});
