"use strict";
// LE RANG DE LA MAISON — lot 2 des gains « vrai casino » (2026-10-04,
// docs/PLAN-GAINS-CASINO.md). La réputation est la perte théorique du joueur (mise ×
// avantage de la Maison), comptée en heures de recettes ; elle ne se perd jamais.
// Chaque titre multiplie par 10 la limite haute des tables (la salle commune des
// automatisations et la rafle de la cagnotte restent à la base) et offre ses cadeaux.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  state, setState, hydrateState, migrate, invalidateRenderCache,
  resetTemporaryRunState, buildGrandResetState, CURRENT_SAVE_VERSION
} from "../state.js";
import {
  recordWager, promoteRank, rankForReputation, rankProgress, maisonReputation, maisonRank,
  grantRankGifts, RANK_LABELS
} from "../actions/maisonRang.js";
import { recettesPerHour, tableLimits, clampStake, autoStake } from "../actions/maisonTable.js";
import { potRakeShare } from "../actions/templePot.js";
import { castAugury, auguryPaytable, doubleAugury } from "../actions/augures.js";
import { resolveIcarusHeadless } from "../actions/icarus.js";
import { playScratch, scratchRtpRef } from "../actions/scratch.js";
import { grantFreeFlight, freeFlightQueue } from "../actions/templeFlights.js";
import { tickTempleAutomation, setTempleAuto } from "../actions/templeAutomation.js";
import { MAISON_RANKS, AUGURY_RTP, ICARUS_EDGE, FLIGHTS_MAX_COLOMBIER, FAVEUR_ECHELLE } from "../balance.js";
import { MID_GAME_FIXTURE, FIXED_NOW } from "./fixtures.js";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
  setState(hydrateState(MID_GAME_FIXTURE));
  state.bestEraIndex = 10; // toutes les tables ouvertes, des recettes au-dessus du plancher
  state.faveur = 1e7;
  state.templeArtifacts = {};
  state.icarusFreeFlights = [];
  state.icarusPotFaveur = 0;
  state.maisonReputation = 0;
  state.maisonRank = 0;
  invalidateRenderCache("all");
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("La réputation : la perte théorique, en heures de recettes", () => {
  it("une mise payée ajoute mise × avantage ÷ recettes horaires", () => {
    const h = recordWager(1000, 0.97);
    expect(h).toBeCloseTo((1000 * 0.03) / recettesPerHour(), 12);
    expect(maisonReputation()).toBeCloseTo(h, 12);
    // Rien pour une mise nulle, un jeu sans avantage (le quitte ou double), un retour ≥ 1.
    expect(recordWager(0, 0.97)).toBe(0);
    expect(recordWager(1000, 1)).toBe(0);
    expect(recordWager(1000, 1.2)).toBe(0);
    expect(maisonReputation()).toBeCloseTo(h, 12);
  });

  it("la même mise pèse le même temps de caisse à toute ère", () => {
    state.bestEraIndex = 3;
    const lo = recordWager(recettesPerHour() * 0.25, 0.97);
    state.bestEraIndex = 25;
    const hi = recordWager(recettesPerHour() * 0.25, 0.97);
    expect(hi).toBeCloseTo(lo, 12); // un quart d'heure de recettes à 3 % = 0,0075 h
    expect(lo).toBeCloseTo(0.0075, 12);
  });

  it("les jeux l'alimentent sur leurs mises PAYÉES — pas les coups offerts", () => {
    const stake = tableLimits().base;
    vi.spyOn(Math, "random").mockReturnValue(0.9);
    castAugury("prayForRain", "classique", { stake, silent: true, render: false });
    Math.random.mockRestore();
    const afterAugury = maisonReputation();
    expect(afterAugury).toBeCloseTo((stake * (1 - AUGURY_RTP)) / recettesPerHour(), 9);

    // Un vol d'Icare payé compte à 3 %…
    resolveIcarusHeadless(stake, 2);
    const afterIcarus = maisonReputation();
    expect(afterIcarus - afterAugury).toBeCloseTo((stake * ICARUS_EDGE) / recettesPerHour(), 9);
    // …un vol OFFERT, rien.
    grantFreeFlight(stake);
    expect(resolveIcarusHeadless(0, 2, { free: true })).not.toBeNull();
    expect(maisonReputation()).toBeCloseTo(afterIcarus, 12);

    // Un ticket payé compte à l'avantage de la loterie (25 %) ; la relance de la cella, rien.
    playScratch(stake, { silent: true, render: false });
    const afterTicket = maisonReputation();
    expect(afterTicket - afterIcarus).toBeCloseTo((stake * (1 - scratchRtpRef())) / recettesPerHour(), 9);
    state.templeArtifacts.relance = true;
    state.icarusPotFaveur = stake * 10;
    expect(playScratch(stake, { silent: true, render: false, potFunded: true })).not.toBeNull();
    expect(maisonReputation()).toBeCloseTo(afterTicket, 12);

    // Le quitte ou double (sans avantage) ne compte pas.
    const before = maisonReputation();
    doubleAugury("prayForRain", stake, { silent: true, render: false });
    expect(maisonReputation()).toBeCloseTo(before, 12);
  });

  it("les automatisations comptent aussi (ce sont des mises payées)", () => {
    state.templeAuto.osselets = { ...state.templeAuto.osselets, unlocked: true, on: true, lastAt: 0, faveurFloor: 0 };
    setTempleAuto("osselets", { stakeStep: "max", tempo: "fervent" });
    vi.spyOn(Math, "random").mockReturnValue(0.9);
    tickTempleAutomation();
    Math.random.mockRestore();
    expect(maisonReputation()).toBeCloseTo((autoStake("max") * (1 - AUGURY_RTP)) / recettesPerHour(), 9);
  });
});

describe("Les titres", () => {
  it("cinq titres, seuils croissants, ×10 la limite à chacun", () => {
    expect(MAISON_RANKS.map((r) => r.id)).toEqual(["habitue", "familier", "notable", "mecene", "prince"]);
    expect(MAISON_RANKS.map((r) => r.mult)).toEqual([1, 10, 100, 1000, 10000]);
    for (let i = 1; i < MAISON_RANKS.length; i += 1) {
      expect(MAISON_RANKS[i].threshold).toBeGreaterThan(MAISON_RANKS[i - 1].threshold);
    }
    expect(RANK_LABELS.prince.fr).toBe("Prince de la Maison");
    // Prince à 40 h de réputation (75 avant la mesure des 20 h, 2026-10-04).
    expect([0, 0.49, 0.5, 2.99, 3, 15, 39.9, 40, 1e9].map(rankForReputation)).toEqual([0, 0, 1, 1, 2, 3, 3, 4, 4]);
  });

  it("monte titre par titre, chacun donne ses cadeaux UNE fois", () => {
    state.maisonReputation = 20; // au-delà de Mécène
    expect(promoteRank()).toBe(3);
    expect(maisonRank()).toBe(3);
    // Familier, Notable, Mécène : artefacts et automatisations.
    for (const id of ["colombier", "mesure", "echelle", "coin", "interdit", "solaires"]) {
      expect(state.templeArtifacts[id]).toBe(true);
    }
    expect(state.templeArtifacts.serres).toBeUndefined(); // Prince
    for (const jeu of ["osselets", "icarus", "gratteux", "vingtetun"]) {
      expect(state.templeAuto[jeu]).toMatchObject({ unlocked: true, on: false });
    }
    // Les vols offerts : à la limite de la salle commune, dans une file que le
    // colombier (offert AVANT les vols) a portée à 8.
    expect(freeFlightQueue()).toEqual(Array(FLIGHTS_MAX_COLOMBIER).fill(tableLimits().base));
    // Trois lignes de Chronique, une par titre.
    const lines = state.history.filter((l) => l.includes("t'élève au rang de"));
    expect(lines).toHaveLength(3);
    expect(lines[2]).toContain("Mécène");
    // Rien ne se redonne.
    state.icarusFreeFlights = [];
    expect(promoteRank()).toBe(0);
    expect(freeFlightQueue()).toEqual([]);
  });

  it("un cadeau déjà possédé (acheté avant le lot 2) ne se redonne pas", () => {
    state.templeArtifacts = { colombier: true };
    state.templeAuto.osselets.unlocked = true;
    state.templeAuto.osselets.on = true;
    const given = grantRankGifts(1);
    expect(given.gifts).toEqual(["mesure", "autoIcare"]);
    expect(state.templeAuto.osselets.on).toBe(true); // on ne touche pas à ce qu'on avait
  });

  it("rankProgress dit le titre, le suivant et le chemin fait", () => {
    state.maisonReputation = 1.75; // Familier, à mi-chemin de Notable (0,5 → 3)
    promoteRank();
    expect(rankProgress()).toMatchObject({ rank: 1, id: "familier", mult: 10, next: 2, nextId: "notable", from: 0.5, to: 3 });
    expect(rankProgress().frac).toBeCloseTo(0.5, 9);
    state.maisonReputation = 1000;
    promoteRank();
    expect(rankProgress()).toMatchObject({ rank: 4, id: "prince", next: null, frac: 1 });
  });
});

describe("Ce que le titre ouvre", () => {
  it("la limite haute ×10 par titre ; la salle commune et la rafle restent à la base", () => {
    const base = tableLimits().base;
    expect(tableLimits()).toEqual({ min: 1, max: base, base });
    state.maisonRank = 2;
    expect(tableLimits()).toEqual({ min: 1, max: base * 100, base });
    expect(clampStake(1e15)).toBe(base * 100);         // la main mise jusqu'à ×100
    expect(autoStake("max")).toBe(base);                // les automates restent en salle commune
    expect(potRakeShare(base)).toBe(1);                 // la limite de BASE rafle toute la cagnotte
    expect(potRakeShare(base / 10)).toBeCloseTo(0.1, 9);
  });

  it("les cotes ne bougent pas avec le titre", () => {
    const at0 = ["prudent", "classique", "grand"].map((r) => auguryPaytable("prayForRain", r));
    state.maisonRank = 4;
    const at4 = ["prudent", "classique", "grand"].map((r) => auguryPaytable("prayForRain", r));
    expect(at4).toEqual(at0);
  });
});

describe("Persistance", () => {
  it("la réputation et le titre survivent à l'effondrement ET au Grand Reset", () => {
    state.maisonReputation = 4.2;
    state.maisonRank = 2;
    resetTemporaryRunState(state);
    expect(state.maisonReputation).toBe(4.2);
    expect(state.maisonRank).toBe(2);
    const gr = buildGrandResetState(1);
    expect(gr.maisonReputation).toBe(4.2);
    expect(gr.maisonRank).toBe(2);
  });

  it("l'hydratation borne les champs", () => {
    expect(hydrateState({ maisonReputation: -3, maisonRank: 9 })).toMatchObject({ maisonReputation: 0, maisonRank: 4 });
    expect(hydrateState({ maisonReputation: "x", maisonRank: -1 })).toMatchObject({ maisonReputation: 0, maisonRank: 0 });
    expect(hydrateState({})).toMatchObject({ maisonReputation: 0, maisonRank: 0, maisonGiftRefund: 0 });
  });
});

describe("Migration 5 → 6 : les cadeaux de rang déjà achetés", () => {
  it("restent à soi, et leur Faveur revient", () => {
    const out = migrate({
      saveVersion: 5, faveur: 10,
      templeArtifacts: { colombier: true, serres: true, noye: true },
      templeAuto: { osselets: { unlocked: true, on: true }, icarus: { unlocked: true }, tronc: { unlocked: true } }
    });
    // colombier 200 + serres 550 + osselets 700 + Icare 350 ; le noyé et la sébile se vendent encore.
    // Puis la migration 6 → 7 passe la Faveur à l'échelle (×1 000).
    expect(out.maisonGiftRefund).toBe(1800 * FAVEUR_ECHELLE);
    expect(out.faveur).toBe(1810 * FAVEUR_ECHELLE);
    expect(out.templeArtifacts).toEqual({ colombier: true, serres: true, noye: true });
    expect(out.templeAuto.osselets).toMatchObject({ unlocked: true, on: true });
    expect(out.saveVersion).toBe(CURRENT_SAVE_VERSION);
  });

  it("sans cadeau acheté : rien à rendre, rien à annoncer", () => {
    const out = migrate({ saveVersion: 5, faveur: 42, templeArtifacts: { noye: true } });
    expect(out.faveur).toBe(42 * FAVEUR_ECHELLE);
    expect(out.maisonGiftRefund).toBeUndefined();
  });

  it("le remboursement est annoncé une fois, au premier tick", () => {
    setState(hydrateState({ ...MID_GAME_FIXTURE, saveVersion: 5, faveur: 0, templeArtifacts: { mesure: true } }));
    expect(state.faveur).toBe(250 * FAVEUR_ECHELLE);
    expect(state.maisonGiftRefund).toBe(250 * FAVEUR_ECHELLE);
    tickTempleAutomation();
    expect(state.maisonGiftRefund).toBe(0);
    expect(state.history.some((l) => l.includes("récompense désormais ses habitués"))).toBe(true);
    const n = state.history.length;
    tickTempleAutomation();
    expect(state.history.length).toBe(n);
  });
});
