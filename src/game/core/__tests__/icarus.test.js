"use strict";
// Le Vol d'Icare (crash game de la Maison) — loi du jeu : C = (1-EDGE)/U (borné
// [1, CAP]) tiré à l'envol ; m(t) = e^(K·t). Mise et GAIN en FAVEUR : payout =
// payRound(mise × m) → RTP = 1-EDGE par construction. La chute nourrit la
// cagnotte sur l'edge ; se poser à ×JACKPOT+ la rafle. Vol résolu par un
// setTimeout moteur (autoritaire, même scène fermée).
// Lot 1 des gains « vrai casino » (2026-10-04, docs/PLAN-GAINS-CASINO.md) :
//   • l'EDGE est FIXE à 3 % (plus d'ailes cirées) → C = 0,97 / U, RTP 97 % à
//     toute cible ;
//   • la mise est LIBRE entre les limites de la table (1 → 15 min de recettes de
//     la Maison : 44 à l'Ère III) — sous 1 refusée, au-dessus ramenée à la limite ;
//   • un vol offert porte un MONTANT (la mise du coup qui l'a gagné) ;
//   • la rafle se prend au prorata de la mise rapportée à la LIMITE HAUTE.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { state, setState, hydrateState, invalidateRenderCache, resetTemporaryRunState } from "../state.js";
import {
  launchIcarus,
  cashOutIcarus,
  resolveIcarusHeadless,
  icarusFlying,
  icarusFlightInfo,
  icarusMultiplierAt,
  icarusLastOutcome,
  icarusPotFaveur,
  icarusEffectiveEdge,
  tableLimits,
  potCap
} from "../actions.js";
import { __resetIcarusForTests } from "../actions/icarus.js";
import { potRakeShare, potRake, potRecycle, payRound } from "../actions/templePot.js";
import { toNum } from "../num.js";
import { ICARUS_EDGE, ICARUS_RTP, ICARUS_HISTORY_LEN, TEMPLE_POT_RECYCLE, TEMPLE_POT_RECYCLE_CAP } from "../balance.js";
import { MID_GAME_FIXTURE, FIXED_NOW } from "./fixtures.js";

const FAVEUR_START = 1000;
const LIMITE = 44; // limite haute de la table à l'Ère III (15 min de recettes, 2 chiffres significatifs)
const MISE = 10;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
  setState(hydrateState(MID_GAME_FIXTURE));
  state.bestEraIndex = 3; // Ère III : Icare ouvre, la table monte à 44
  state.faveur = FAVEUR_START; // les mises sont en Faveur (monnaie fermée)
  state.icarusPotFaveur = 0;
  state.icarusFreeFlights = [];
  __resetIcarusForTests();
  invalidateRenderCache("all");
});

afterEach(() => {
  __resetIcarusForTests();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// Un vol dont le point de crash est TIRÉ via U (Math.random mocké une fois).
function launch(stake, u, options) {
  vi.spyOn(Math, "random").mockReturnValueOnce(u);
  const res = launchIcarus(stake, options);
  Math.random.mockRestore();
  return res;
}

describe("Vol d'Icare — moteur (cotes fixes)", () => {
  it("paie la mise EN FAVEUR à l'envol (l'or ne bouge plus), refuse un second vol", () => {
    const goldBefore = toNum(state.gold);
    expect(launch(MISE, 0.01)).toBeTruthy(); // C = 97 : tout le temps de voler
    expect(state.faveur).toBe(FAVEUR_START - MISE);
    expect(toNum(state.gold)).toBeCloseTo(goldBefore, 0); // plus de mise en or
    expect(icarusFlying()).toBe(true);
    // La scène rouverte en plein vol relit la mise du vol en cours.
    expect(icarusFlightInfo()).toEqual({ stakeFaveur: MISE, freeFlight: false });
    expect(launchIcarus(MISE)).toBeNull(); // un seul Icare à la fois
    expect(state.faveur).toBe(FAVEUR_START - MISE); // …et le refus ne débite rien
  });

  it("la courbe double toutes les 5 s (K = ln2/5)", () => {
    expect(icarusMultiplierAt(5000)).toBeCloseTo(2, 5);
    expect(icarusMultiplierAt(10000)).toBeCloseTo(4, 5);
  });

  it("se poser paie payRound(mise × m) et révèle le point de crash", () => {
    launch(MISE, 0.01); // C = 97
    vi.advanceTimersByTime(5000); // m = ×2 tout rond
    const out = cashOutIcarus();
    expect(out.type).toBe("cashout");
    expect(out.m).toBe(2);
    expect(out.faveur).toBe(MISE * 2); // payout entier : payRound n'a rien à arrondir
    expect(state.faveur).toBe(FAVEUR_START - MISE + out.faveur);
    expect(out.crashPoint).toBeCloseTo(97, 6); // near-miss : le soleil est révélé
    expect(icarusFlying()).toBe(false);
    expect(icarusFlightInfo()).toBeNull();
    expect(cashOutIcarus()).toBeNull(); // le vol est résolu
  });

  it("la chute (timer moteur) brûle la mise et nourrit la cagnotte SUR L'EDGE", () => {
    launch(MISE, 0.5); // C = 0,97 / 0,5 = 1,94 → chute à ~4,8 s
    vi.advanceTimersByTime(6000);
    const out = icarusLastOutcome();
    expect(out.type).toBe("crash");
    expect(out.crashPoint).toBeCloseTo(1.94, 6);
    expect(state.faveur).toBe(FAVEUR_START - MISE); // rien ne revient
    // Le versement suit l'EDGE (mise × recycle × edge) : 10 × 0,6 × 0,03 = 0,18.
    expect(out.potGainFaveur).toBeCloseTo(MISE * TEMPLE_POT_RECYCLE * ICARUS_EDGE, 9);
    expect(state.icarusPotFaveur).toBeCloseTo(MISE * TEMPLE_POT_RECYCLE * ICARUS_EDGE, 9);
    expect(icarusFlying()).toBe(false);
  });

  it("le soleil frappe au décollage dans 3 % des vols (C = 1 dès que U ≥ 0,97)", () => {
    launch(MISE, 0.999); // 0,97/U < 1 → C = 1
    vi.advanceTimersByTime(50);
    const out = icarusLastOutcome();
    expect(out.type).toBe("crash");
    expect(out.crashPoint).toBe(1);
    // La frontière est exactement 1 − edge.
    launch(MISE, 1 - ICARUS_EDGE);
    vi.advanceTimersByTime(50);
    expect(icarusLastOutcome().crashPoint).toBe(1);
  });

  it("RTP 0,97 À TOUTE CIBLE : la loi C = 0,97/U paie T avec la probabilité 0,97/T", () => {
    // L'edge ne s'achète plus : 3 %, point. On balaie U sur une grille régulière
    // de N points : la part des U où C > T est la probabilité 0,97/T (à 1/N près),
    // le gain vaut T × la mise, d'où un retour de 0,97 quelle que soit la cible —
    // même ×1, puisque 3 % des vols brûlent au décollage. Le headless rejoue la
    // MÊME loi que le vol interactif (même tirage, même paiement, même versement).
    expect(ICARUS_EDGE).toBe(0.03); // la cible du plan : Icare à 97 %
    expect(icarusEffectiveEdge()).toBe(ICARUS_EDGE);
    expect(1 - ICARUS_EDGE).toBeCloseTo(ICARUS_RTP, 12);
    state.faveur = 1e9;
    const N = 4000;
    const rnd = vi.spyOn(Math, "random");
    for (const T of [1, 1.5, 2, 5, 10]) {
      let staked = 0;
      let won = 0;
      for (let i = 0; i < N; i++) {
        // U seul est piloté ; mise × T est entier, payRound n'a rien à arrondir.
        rnd.mockReturnValueOnce((i + 0.5) / N);
        const out = resolveIcarusHeadless(MISE, T);
        staked += out.stakeFaveur;
        if (out.type === "cashout") won += out.faveur;
      }
      expect(won / staked).toBeCloseTo(0.97, 3);
    }
  });

  it("INVARIANT : rtp_total = base + recycle × (1 − base) < 1, cagnotte comprise", () => {
    // La preuve en une ligne, verrouillée. Le pot revient intégralement au joueur
    // (paiement différé), donc tout ce qui y entre compte dans le RTP réel.
    const rtpBase = 1 - icarusEffectiveEdge();
    expect(rtpBase + potRecycle() * (1 - rtpBase)).toBeLessThan(1); // 0,97 + 0,6 × 0,03 = 0,988
    // …y compris avec l'osselet du noyé, qui CLAMPE le recycle au lieu de doubler
    // une part de mise (c'était la config à 133,4 %).
    state.templeArtifacts = { noye: true };
    expect(potRecycle()).toBe(TEMPLE_POT_RECYCLE_CAP);
    expect(potRecycle()).toBeLessThan(1); // A10 : LE point de défaillance unique
    expect(rtpBase + potRecycle() * (1 - rtpBase)).toBeLessThan(1); // 0,9955
  });
});

describe("Vol d'Icare — la mise libre", () => {
  it("une mise sous 1 (ou illisible) est REFUSÉE : ni débit, ni vol", () => {
    // « plume » : un ancien id de mise ne passe plus pour un montant.
    for (const bad of [0, 0.6, -5, NaN, undefined, "plume"]) {
      expect(launchIcarus(bad)).toBeNull();
      expect(resolveIcarusHeadless(bad, 2)).toBeNull();
    }
    expect(state.faveur).toBe(FAVEUR_START);
    expect(icarusFlying()).toBe(false);
  });

  it("une mise au-dessus de la limite est RAMENÉE à la limite, et arrondie à l'entier", () => {
    expect(tableLimits()).toEqual({ min: 1, max: LIMITE });
    launch(1e6, 0.01);
    expect(icarusFlightInfo().stakeFaveur).toBe(LIMITE);
    expect(state.faveur).toBe(FAVEUR_START - LIMITE); // débitée à la limite, pas à la demande
    __resetIcarusForTests();
    launch(12.9, 0.01);
    expect(icarusFlightInfo().stakeFaveur).toBe(12); // Faveur entière
    expect(state.faveur).toBe(FAVEUR_START - LIMITE - 12);
    __resetIcarusForTests();
    // La limite suit l'ère RECORD : la même demande mise plus haut dans une Maison
    // plus grande (Ère X : 560).
    state.bestEraIndex = 10;
    launch(1e6, 0.01);
    expect(icarusFlightInfo().stakeFaveur).toBe(tableLimits().max);
    expect(tableLimits().max).toBeGreaterThan(LIMITE);
  });

  it("une mise impayable est refusée (pas de « tapis » implicite au solde)", () => {
    state.faveur = 30;
    expect(launchIcarus(40)).toBeNull();
    expect(launchIcarus(1e6)).toBeNull(); // ramenée à 44, toujours au-dessus des 30 en poche
    expect(state.faveur).toBe(30);
    expect(launch(30, 0.01)).toBeTruthy(); // le solde exact passe
    expect(state.faveur).toBe(0);
  });
});

describe("Vol d'Icare — les vols offerts (des MONTANTS)", () => {
  it("un vol offert se joue à SON montant : la mise demandée est ignorée, rien n'est débité", () => {
    state.icarusFreeFlights = [12, 30];
    launch(LIMITE, 0.01, { free: true }); // C = 97
    expect(state.faveur).toBe(FAVEUR_START); // la Maison paie la mise
    expect(icarusFlightInfo()).toEqual({ stakeFaveur: 12, freeFlight: true });
    expect(state.icarusFreeFlights).toEqual([30]); // la file avance dans l'ordre
    vi.advanceTimersByTime(5000); // ×2
    const out = cashOutIcarus();
    expect(out.faveur).toBe(24); // le gain se calcule sur le montant du billet
    expect(state.faveur).toBe(FAVEUR_START + 24);
  });

  it("sans `free`, le billet attend dans la file et la mise est débitée", () => {
    state.icarusFreeFlights = [30];
    launch(MISE, 0.01);
    expect(state.faveur).toBe(FAVEUR_START - MISE);
    expect(state.icarusFreeFlights).toEqual([30]);
    expect(icarusFlightInfo().freeFlight).toBe(false);
  });

  it("`free` sans billet : refusé, sans retomber sur un vol payant", () => {
    expect(launchIcarus(MISE, { free: true })).toBeNull();
    expect(resolveIcarusHeadless(MISE, 2, { free: true })).toBeNull();
    expect(state.faveur).toBe(FAVEUR_START);
    expect(icarusFlying()).toBe(false);
  });

  it("le montant d'un billet est re-borné par la limite (une save trafiquée ne vole pas plus haut)", () => {
    state.icarusFreeFlights = [5000];
    launch(1, 0.01, { free: true });
    expect(icarusFlightInfo()).toEqual({ stakeFaveur: LIMITE, freeFlight: true });
    expect(state.icarusFreeFlights).toEqual([]);
  });

  it("headless : l'auto joue le billet à son montant, sans débit", () => {
    state.icarusFreeFlights = [20];
    vi.spyOn(Math, "random").mockReturnValueOnce(0.01); // C = 97 : la cible ×2 passe
    const out = resolveIcarusHeadless(MISE, 2, { free: true });
    expect(out).toMatchObject({ type: "cashout", m: 2, faveur: 40, freeFlight: true, stakeFaveur: 20 });
    expect(state.faveur).toBe(FAVEUR_START + 40);
    expect(state.icarusFreeFlights).toEqual([]);
  });
});

describe("Vol d'Icare — la cagnotte", () => {
  it("se poser à ×10+ emporte une part AU PRORATA de la mise rapportée à la LIMITE HAUTE", () => {
    const stake = 11; // un quart de la limite (44)
    const jackpots = state.icarusJackpots || 0;
    state.icarusPotFaveur = 1000;
    invalidateRenderCache("all");
    expect(icarusPotFaveur()).toBe(1000);
    launch(stake, 0.05); // C = 19,4
    vi.advanceTimersByTime(16700); // m ≈ ×10,12
    const out = cashOutIcarus();
    expect(out.m).toBeGreaterThanOrEqual(10);
    // 11 sur 44 = 25 % : la petite mise n'emporte plus TOUT le magot (c'était
    // l'imprimante mesurée par A9 : Icare ×10 à 118,7 %).
    expect(potRakeShare(stake)).toBeCloseTo(0.25, 12);
    expect(out.jackpotFaveur).toBe(250);
    // Le reste SURVIT à la rafle, puis ce vol y verse sa part d'edge (rafle PUIS
    // versement : on emporte sa part de ce qui était là, ensuite la Maison prélève).
    expect(state.icarusPotFaveur).toBeCloseTo(750 + stake * TEMPLE_POT_RECYCLE * ICARUS_EDGE, 9);
    expect(state.faveur).toBe(FAVEUR_START - stake + out.faveur + out.jackpotFaveur);
    expect(state.icarusJackpots).toBe(jackpots + 1); // jalon du Grand Reset VII
  });

  it("la mise MAX vide la cella, une petite mise non : la mise est une décision", () => {
    expect(potRakeShare(LIMITE)).toBe(1);
    state.icarusPotFaveur = 1000;
    launch(LIMITE, 0.05); // C = 19,4
    vi.advanceTimersByTime(16700); // m ≈ ×10,12
    const out = cashOutIcarus();
    expect(out.jackpotFaveur).toBe(1000);
    // Vidée par la rafle, puis re-nourrie par la part d'edge de CE vol.
    expect(state.icarusPotFaveur).toBeCloseTo(LIMITE * TEMPLE_POT_RECYCLE * ICARUS_EDGE, 9);
    // La référence est la limite de l'ère RECORD : dans une Maison plus grande, la
    // même mise ne rafle plus qu'une part (Ère X : 44 sur 560).
    state.bestEraIndex = 10;
    expect(potRakeShare(LIMITE)).toBeCloseTo(LIMITE / tableLimits().max, 12);
    expect(potRakeShare(LIMITE)).toBeLessThan(0.1);
  });

  it("payRound est NON BIAISÉ : E[payRound(x)] = x (ce que Math.round n'était pas)", () => {
    // Math.round(4 × 1,4) = 6 au lieu de 5,6, soit +7,1 % — plus du double de l'edge
    // d'Icare (3 %). Ce seul biais suffit à pousser rtp_base au-dessus de 1, et aucun
    // recyclage ne peut rattraper un rtp_base > 1. C'était la DERNIÈRE imprimante.
    expect(Math.round(4 * 1.4)).toBe(6); // le biais, documenté
    let real = 0;
    try {
      const seq = [0.1, 0.3, 0.5, 0.7, 0.9];
      let i = 0;
      real = Math.random;
      vi.spyOn(Math, "random").mockImplementation(() => seq[i++ % seq.length]);
      // x = 5.6 → base 5, frac 0.6 → +1 si random < 0.6 : 3 fois sur 5.
      const outs = [0, 0, 0, 0, 0].map(() => payRound(5.6));
      expect(outs).toEqual([6, 6, 6, 5, 5]);
      expect(outs.reduce((a, b) => a + b, 0) / 5).toBeCloseTo(5.6, 6); // espérance EXACTE
    } finally {
      if (real) Math.random.mockRestore();
    }
    // Entier exact : jamais de bruit là où il n'y a rien à arrondir.
    expect(payRound(40)).toBe(40);
    expect(payRound(0)).toBe(0);
  });

  it("la rafle ne peut jamais emporter plus que la cella (part bornée à 1)", () => {
    // Contrôle négatif : une mise absurde ne crée pas de Faveur depuis un pot vide.
    expect(potRakeShare(10_000)).toBe(1);
    expect(potRake(0, 25)).toEqual({ rake: 0, left: 0 });
    expect(potRake(7, 4).rake).toBeLessThanOrEqual(7);
    // La fraction reste dans la cella, rien ne se perd ni ne se crée à l'arrondi.
    const { rake, left } = potRake(1000, 4);
    expect(rake + left).toBe(1000);
  });

  it("la cagnotte plafonne à potCap() (24 h de recettes, jamais sous 5 000)", () => {
    expect(potCap()).toBe(5000); // Ère III : 24 h de recettes < 5 000
    state.icarusPotFaveur = potCap() - 0.05;
    launch(MISE, 0.5);
    vi.advanceTimersByTime(6000); // chute → versement de 0,18, écrêté au plafond
    expect(state.icarusPotFaveur).toBe(potCap());
  });

  it("hydratation : cagnotte assainie (le plafond s'applique au versement), historique re-typé", () => {
    // Plus de plafond fixe : il suit les recettes de la Maison (potCap), lu à chaque
    // versement. L'hydratation ne fait que rejeter le négatif et l'illisible.
    const s = hydrateState({ icarusPotFaveur: 4321.5, icarusHistory: [2.4, "junk", -3, 1.1, Infinity] });
    expect(s.icarusPotFaveur).toBe(4321.5);
    expect(s.icarusHistory).toEqual([2.4, 1.1]);
    expect(hydrateState({ icarusPotFaveur: -5 }).icarusPotFaveur).toBe(0);
    expect(hydrateState({ icarusPotFaveur: "junk" }).icarusPotFaveur).toBe(0);
    expect(hydrateState({}).icarusHistory).toEqual([]);
  });

  it("reset de cycle : historique et vols offerts effacés, cagnotte de Faveur SURVIT", () => {
    launch(MISE, 0.5);
    vi.advanceTimersByTime(6000); // chute → cagnotte nourrie + historique
    expect(state.icarusHistory.length).toBe(1);
    state.icarusFreeFlights = [12];
    const pot = state.icarusPotFaveur;
    resetTemporaryRunState(state);
    expect(state.icarusHistory).toEqual([]);
    expect(state.icarusFreeFlights).toEqual([]);
    expect(state.icarusPotFaveur).toBe(pot);
  });

  it("l'historique est capé", () => {
    for (let i = 0; i < ICARUS_HISTORY_LEN + 4; i++) {
      launch(1, 0.5);
      vi.advanceTimersByTime(6000);
    }
    expect(state.icarusHistory.length).toBe(ICARUS_HISTORY_LEN);
  });
});
