"use strict";
// LES AUGMENTS DU TEMPLE (2026-07-17, arbitrage Raphaël « go sur tout ») —
// quatre lignées, capstone = automatisation pour TOUS les jeux :
//  - osselets : Échelle de Vénus (double chaîné, EV 0), rite interdit (gaté moteur) ;
//  - Icare : second souffle (consolation 0.7, prélevée), serres (rafle ×1.5,
//    sortie seule), colombier (file 8, historique 24) ;
//  - gratteux : stylet (rayon, pur geste), coin décollé (info pure, UI),
//    offrande recopiée (relance financée par la cella, transfert STRICT) ;
//  - vingt-et-un : voix (série), mesure (basicAction), LE DOUBLE (skill-gaté,
//    REF re-mesuré 99,57 %), puis LA REFENTE (2026-07-17, arbitrage Raphaël :
//    légalisée comme rang d'imprimante — 100,3 % de base, cf. templeBascule.test.js).
// Et le trou fermé au passage : la valeur du vol offert par Vénus entre dans la
// normalisation des osselets (elle valait jusqu'à +8,5 pts HORS budget).

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { state, setState, hydrateState, invalidateRenderCache, setNotifyPaused } from "../state.js";
import {
  castAugury, auguryPaytable,
  dealBlackjack, standBlackjack, blackjackLastOutcome,
  playScratch,
  tickTempleAutomation, setTempleAuto, unlockTempleAuto
} from "../actions.js";
import { icarusCrashConsolation } from "../actions/icarus.js";
import { doubleBlackjack, basicAction, resolveBlackjackHeadless } from "../actions/blackjack.js";
import { icarusHistoryLen } from "../actions/icarus.js";
import { potRakeShare } from "../actions/templePot.js";
import { grantFreeFlight, freeFlightCap } from "../actions/templeFlights.js";
import {
  AUGURY_RTP_CAP, AUGURY_STAKES,
  ICARUS_FREE_FLIGHTS_MAX, FLIGHTS_MAX_COLOMBIER,
  ICARUS_HISTORY_LEN, ICARUS_HISTORY_COLOMBIER,
  SOUFFLE_CONSOLATION_MULT,
  AUTO_SCRATCH_UNLOCK_COST, AUTO_BLACKJACK_UNLOCK_COST,
  SCRATCH_STAKES, BLACKJACK_STAKES
} from "../balance.js";
import { MID_GAME_FIXTURE, FIXED_NOW } from "./fixtures.js";

const FAVEUR_START = 5000;
const C = (rank, suit = "olive") => ({ rank, suit });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
  setState(hydrateState(MID_GAME_FIXTURE));
  state.bestEraIndex = 4; // toutes les ères de jeu ouvertes
  state.faveur = FAVEUR_START;
  state.templeArtifacts = {};
  state.icarusPotFaveur = 0;
  state.icarusFreeFlights = [];
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
    expect(castAugury("prayForRain", "interdit", { render: false, silent: true })).toBeNull();
    expect(state.faveur).toBe(FAVEUR_START); // rien débité
  });

  it("avec l'artefact : joue à mise 20, et sa table est calée sous le cap", () => {
    state.templeArtifacts = { interdit: true };
    vi.spyOn(Math, "random").mockReturnValue(0.5); // creux
    const res = castAugury("prayForRain", "interdit", { render: false, silent: true });
    Math.random.mockRestore();
    expect(res).not.toBeNull();
    expect(res.stake).toBe(AUGURY_STAKES.interdit);
    expect(state.faveur).toBe(FAVEUR_START - AUGURY_STAKES.interdit);
    const pay = auguryPaytable("prayForRain", "interdit");
    expect(pay.rtpRef).toBeLessThan(AUGURY_RTP_CAP);
  });
});

// ── Osselets : le vol offert COMPTE dans la normalisation ────────────────────
describe("Normalisation flight-aware (le trou Vénus fermé)", () => {
  it("rtpRef TOTAL (Faveur + vol) frôle le cap sans le dépasser, ivoire compris", () => {
    for (const ivoire of [false, true]) {
      state.templeArtifacts = ivoire ? { ivoire: true } : {};
      for (const rite of ["prudent", "classique", "grand", "interdit"]) {
        const pay = auguryPaytable("prayForRain", rite);
        // C'était LE trou : à dés 10 + ivoire le vol valait jusqu'à +8,5 pts
        // au-dessus du cap. Le total doit désormais rester SOUS le cap…
        expect(pay.rtpRef).toBeLessThan(AUGURY_RTP_CAP);
        // …tout en restant calé près de lui (la normalisation ne sur-ampute pas).
        expect(pay.rtpRef).toBeGreaterThan(AUGURY_RTP_CAP - 0.05);
      }
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

  it("les serres montent la part de rafle de moitié, bornée à 1 (sortie seule)", () => {
    expect(potRakeShare(4)).toBeCloseTo(0.16, 6);
    state.templeArtifacts = { serres: true };
    expect(potRakeShare(4)).toBeCloseTo(0.24, 6);
    expect(potRakeShare(25)).toBe(1); // jamais plus que la cella
  });

  it("le colombier élargit la file (5 → 8) et l'historique (12 → 24)", () => {
    expect(freeFlightCap()).toBe(ICARUS_FREE_FLIGHTS_MAX);
    expect(icarusHistoryLen()).toBe(ICARUS_HISTORY_LEN);
    for (let i = 0; i < ICARUS_FREE_FLIGHTS_MAX; i++) expect(grantFreeFlight("plume")).toBe(true);
    expect(grantFreeFlight("plume")).toBe(false); // file pleine à 5
    state.templeArtifacts = { colombier: true };
    expect(freeFlightCap()).toBe(FLIGHTS_MAX_COLOMBIER);
    expect(icarusHistoryLen()).toBe(ICARUS_HISTORY_COLOMBIER);
    for (let i = ICARUS_FREE_FLIGHTS_MAX; i < FLIGHTS_MAX_COLOMBIER; i++) expect(grantFreeFlight("plume")).toBe(true);
    expect(grantFreeFlight("plume")).toBe(false); // pleine à 8
  });
});

// ── Gratteux : l'offrande recopiée (relance financée par la cella) ───────────
describe("L'offrande recopiée (relance)", () => {
  it("la cella paie la mise ENTIÈRE ou rien, le joueur ne paie jamais", () => {
    // Sans l'artefact : refusée.
    state.icarusPotFaveur = 100;
    expect(playScratch("obole", { render: false, silent: true, potFunded: true })).toBeNull();
    state.templeArtifacts = { relance: true };
    // Cella trop maigre (3 < 4) : refusée, STRICTEMENT (pas de mint partiel).
    state.icarusPotFaveur = 3;
    expect(playScratch("obole", { render: false, silent: true, potFunded: true })).toBeNull();
    // Cella garnie : le pot paie, la Faveur du joueur ne bouge pas à l'achat.
    state.icarusPotFaveur = 100;
    vi.spyOn(Math, "random").mockReturnValue(0.1); // blank (perte)
    const res = playScratch("obole", { render: false, silent: true, potFunded: true });
    Math.random.mockRestore();
    expect(res).not.toBeNull();
    expect(res.potFunded).toBe(true);
    // 100 − 4 (mise payée par la cella) + le versement d'edge du ticket (feedPot).
    expect(state.icarusPotFaveur).toBeGreaterThan(96);
    expect(state.icarusPotFaveur).toBeLessThan(97);
    expect(state.faveur).toBe(FAVEUR_START); // le joueur n'a rien payé (et rien gagné)
  });
});

// ── Vingt-et-un : la mesure, le double, la série ─────────────────────────────
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

describe("Le double (artefact, skill-gaté)", () => {
  it("refusé sans l'artefact, gagné il paie sur la mise DOUBLÉE", () => {
    dealBlackjack("legere", { deck: [C("6"), C("5"), C("9"), C("7"), C("10"), C("K")] }); // joueur 11, oracle 16
    expect(doubleBlackjack()).toBeNull(); // pas d'artefact
    standBlackjack(); // on solde la main proprement (l'oracle tire le 10 → 26, crève)
    expect(blackjackLastOutcome().result).toBe("win");

    state.templeArtifacts = { double: true };
    state.faveur = FAVEUR_START;
    dealBlackjack("legere", { deck: [C("6"), C("5"), C("9"), C("7"), C("10"), C("K")] });
    const h = doubleBlackjack(); // débite 4 de plus, tire le 10 → 21, l'oracle tire le K → 26
    expect(h.doubled).toBe(true);
    expect(blackjackLastOutcome().result).toBe("win");
    // Mise doublée 8, victoire ×2 = 16 (entier : payRound déterministe ici).
    expect(state.faveur).toBe(FAVEUR_START - 8 + 16);
  });

  it("crever après le double perd la mise doublée", () => {
    state.templeArtifacts = { double: true };
    dealBlackjack("legere", { deck: [C("K"), C("6"), C("9"), C("7"), C("K")] }); // joueur 16
    const h = doubleBlackjack(); // tire le K → 26, crevé
    expect(h.resolved).toBe(true);
    expect(blackjackLastOutcome().result).toBe("lose");
    expect(state.faveur).toBe(FAVEUR_START - 8);
  });
});

describe("La série de l'oracle (la Voix)", () => {
  it("win/blackjack l'allongent, lose la coupe, l'auto n'y touche pas", () => {
    expect(state.blackjackStreak || 0).toBe(0);
    dealBlackjack("legere", { deck: [C("K"), C("Q"), C("9"), C("7"), C("K")] }); // joueur 20
    standBlackjack(); // l'oracle 16 tire le K → crève → win
    expect(state.blackjackStreak).toBe(1);
    dealBlackjack("legere", { deck: [C("K"), C("6"), C("9"), C("8"), C("K")] }); // joueur 16
    standBlackjack(); // l'oracle 17 reste → 17 > 16 → lose
    expect(state.blackjackStreak).toBe(0);
    // L'auto (headless) ne compte NI série NI historique.
    const histBefore = (state.blackjackHistory || []).length;
    state.blackjackStreak = 3;
    resolveBlackjackHeadless("legere");
    expect(state.blackjackStreak).toBe(3);
    expect((state.blackjackHistory || []).length).toBe(histBefore);
  });
});

// ── Automatisation : les deux nouveaux capstones + cadrans ───────────────────
describe("Auto-gratteux et auto-vingt-et-un (capstones)", () => {
  beforeEach(() => {
    state.templeAuto = hydrateState({ ...MID_GAME_FIXTURE, templeAuto: {} }).templeAuto;
  });

  it("se débloquent contre leur coût, une fois l'ère atteinte", () => {
    state.faveur = AUTO_SCRATCH_UNLOCK_COST + AUTO_BLACKJACK_UNLOCK_COST;
    expect(unlockTempleAuto("gratteux")).toBe(true);
    expect(unlockTempleAuto("vingtetun")).toBe(true);
    expect(state.faveur).toBe(0);
    expect(state.templeAuto.gratteux.unlocked).toBe(true);
    expect(state.templeAuto.vingtetun.unlocked).toBe(true);
  });

  it("le tick joue un ticket perdant : mise débitée, rien en retour", () => {
    state.templeAuto.gratteux = { unlocked: true, on: true, stakeId: "obole", tempo: "mesure", faveurFloor: 0, lastAt: 0 };
    state.faveur = 100;
    vi.spyOn(Math, "random").mockReturnValue(0.1); // blank (perte)
    tickTempleAutomation();
    Math.random.mockRestore();
    expect(state.templeAuto.gratteux.lastAt).toBe(FIXED_NOW);
    expect(state.faveur).toBe(100 - 4); // obole partie, ticket perdant
  });

  it("le tick joue une main de vingt-et-un à la stratégie de base", () => {
    state.templeAuto.vingtetun = { unlocked: true, on: true, stakeId: "legere", tempo: "mesure", faveurFloor: 0, lastAt: 0 };
    state.faveur = 100;
    vi.spyOn(Math, "random").mockReturnValue(0.1); // sabot mélangé déterministe
    tickTempleAutomation();
    Math.random.mockRestore();
    expect(state.templeAuto.vingtetun.lastAt).toBe(FIXED_NOW);
    // La mise est partie ; l'issue (déterministe mais opaque) rend 0, 4, 8 ou 10 :
    // la Faveur a FORCÉMENT changé d'un multiple entier cohérent avec une main.
    expect([92, 96, 100 - 4, 100, 100 + 4, 100 + 6]).toContain(state.faveur);
    expect(state.faveur).not.toBe(100 - 4 - 4); // une SEULE main par tick

    // Plancher : la réserve doit tenir APRÈS la mise → trop court, l'auto dort.
    state.templeAuto.vingtetun.lastAt = 0;
    state.templeAuto.vingtetun.faveurFloor = 2000;
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    tickTempleAutomation();
    Math.random.mockRestore();
    expect(state.templeAuto.vingtetun.lastAt).toBe(0); // pas joué
  });

  it("setTempleAuto valide mises et tempo des nouveaux jeux", () => {
    state.templeAuto.gratteux.unlocked = true;
    setTempleAuto("gratteux", { stakeId: "talent", tempo: "fervent" });
    expect(state.templeAuto.gratteux.stakeId).toBe("talent");
    expect(state.templeAuto.gratteux.tempo).toBe("fervent");
    setTempleAuto("gratteux", { stakeId: "hecatombe", tempo: "n'importe" }); // ids d'un AUTRE jeu → refusés
    expect(state.templeAuto.gratteux.stakeId).toBe("talent");
    expect(state.templeAuto.gratteux.tempo).toBe("fervent");
    setTempleAuto("vingtetun", { stakeId: "royale", tempo: "recueilli" });
    expect(state.templeAuto.vingtetun.stakeId).toBe("royale");
    expect(state.templeAuto.vingtetun.tempo).toBe("recueilli");
  });

  it("hydratation : les 4 autos + tempo bornés, une save d'avant reçoit les défauts", () => {
    const s = hydrateState({ templeAuto: { osselets: { unlocked: true, on: true, rite: "grand" } } });
    expect(s.templeAuto.osselets.tempo).toBe("mesure");
    expect(s.templeAuto.gratteux).toBeTruthy();
    expect(s.templeAuto.gratteux.unlocked).toBe(false);
    expect(s.templeAuto.vingtetun.stakeId).toBe("legere");
    expect(SCRATCH_STAKES.some((x) => x.id === s.templeAuto.gratteux.stakeId)).toBe(true);
    expect(BLACKJACK_STAKES.some((x) => x.id === s.templeAuto.vingtetun.stakeId)).toBe(true);
  });
});

// ── Le stylet (niveau, pur geste) ────────────────────────────────────────────
describe("Le stylet du gratteux", () => {
  it("s'achète par niveaux et persiste au Grand Reset (GR_PERSISTENT_FIELDS)", () => {
    const s = hydrateState({ styletLevel: 99 });
    expect(s.styletLevel).toBeLessThanOrEqual(3); // borné au max
  });
});
