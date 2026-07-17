"use strict";
// Le Vol d'Icare (crash game du temple) — loi du jeu (MONNAIE FERMÉE
// 2026-07-16) : C = (1-EDGE)/U (borné [1, CAP]) tiré à l'envol ; m(t) = e^(K·t).
// Mise et GAIN en FAVEUR : payout = round(mise × m) → RTP = 1-EDGE par
// construction. La chute nourrit la cagnotte (part de la mise) ; se poser à
// ×JACKPOT+ la rafle. EDGE = 0.18 (odds très bas early) → C = 0.82 / U. Vol
// résolu par un setTimeout moteur (autoritaire, même scène fermée).

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { state, setState, hydrateState, invalidateRenderCache, resetTemporaryRunState } from "../state.js";
import {
  launchIcarus,
  cashOutIcarus,
  icarusStakes,
  icarusFlying,
  icarusMultiplierAt,
  icarusLastOutcome,
  icarusPotFaveur
} from "../actions.js";
import { __resetIcarusForTests } from "../actions/icarus.js";
import { potRakeShare, potRake, potRecycle, payRound } from "../actions/templePot.js";
import { icarusEffectiveEdge } from "../actions/icarus.js";
import { toNum } from "../num.js";
import { ICARUS_EDGE, ICARUS_POT_CAP_FAVEUR, ICARUS_HISTORY_LEN, TEMPLE_POT_RECYCLE, TEMPLE_POT_RECYCLE_CAP } from "../balance.js";
import { MID_GAME_FIXTURE, FIXED_NOW } from "./fixtures.js";

const FAVEUR_START = 200;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
  setState(hydrateState(MID_GAME_FIXTURE));
  state.faveur = FAVEUR_START; // les mises sont en Faveur (monnaie fermée)
  __resetIcarusForTests();
  invalidateRenderCache("all");
});

afterEach(() => {
  __resetIcarusForTests();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// Un vol dont le point de crash est TIRÉ via U (Math.random mocké une fois).
function launch(stakeId, u) {
  vi.spyOn(Math, "random").mockReturnValueOnce(u);
  const res = launchIcarus(stakeId);
  Math.random.mockRestore();
  return res;
}

describe("Vol d'Icare — moteur (monnaie fermée)", () => {
  it("paie la mise EN FAVEUR à l'envol (l'or ne bouge plus), refuse un second vol", () => {
    const stake = icarusStakes().find((s) => s.id === "plume");
    const goldBefore = toNum(state.gold);
    expect(launch("plume", 0.01)).toBeTruthy(); // C = 82 : tout le temps de voler
    expect(state.faveur).toBe(FAVEUR_START - stake.faveur);
    expect(toNum(state.gold)).toBeCloseTo(goldBefore, 0); // plus de mise en or
    expect(icarusFlying()).toBe(true);
    expect(launchIcarus("plume")).toBeNull(); // un seul Icare à la fois
  });

  it("la courbe double toutes les 5 s (K = ln2/5)", () => {
    expect(icarusMultiplierAt(5000)).toBeCloseTo(2, 5);
    expect(icarusMultiplierAt(10000)).toBeCloseTo(4, 5);
  });

  it("se poser paie round(mise × m) et révèle le point de crash", () => {
    const stake = icarusStakes().find((s) => s.id === "plume");
    launch("plume", 0.01); // C = 82
    vi.advanceTimersByTime(5000); // m ≈ ×2.00
    const out = cashOutIcarus();
    expect(out.type).toBe("cashout");
    expect(out.m).toBeCloseTo(2, 2);
    expect(out.faveur).toBe(Math.round(stake.faveur * out.m));
    expect(state.faveur).toBe(FAVEUR_START - stake.faveur + out.faveur);
    expect(out.crashPoint).toBeCloseTo(82, 0); // near-miss : le soleil est révélé
    expect(icarusFlying()).toBe(false);
    expect(cashOutIcarus()).toBeNull(); // le vol est résolu
  });

  it("la chute (timer moteur) brûle la mise et nourrit la cagnotte SUR L'EDGE", () => {
    const stake = icarusStakes().find((s) => s.id === "plume");
    launch("plume", 0.5); // C = 1.64 → chute à ~3.6 s
    vi.advanceTimersByTime(6000);
    const out = icarusLastOutcome();
    expect(out.type).toBe("crash");
    expect(out.crashPoint).toBeCloseTo(1.64, 2);
    expect(state.faveur).toBe(FAVEUR_START - stake.faveur); // rien ne revient
    // Le versement suit l'EDGE (mise × recycle × edge), plus une part de la MISE :
    // 4 × 0.6 × 0.18 = 0.432 au lieu de 4 × 0.4 = 1.6. C'est ce qui tue l'imprimante.
    expect(state.icarusPotFaveur).toBeCloseTo(stake.faveur * TEMPLE_POT_RECYCLE * ICARUS_EDGE, 6);
    expect(icarusFlying()).toBe(false);
  });

  it("INVARIANT : rtp_total = base + recycle × (1 − base) < 1, cagnotte comprise", () => {
    // La preuve en une ligne, verrouillée. Le pot revient intégralement au joueur
    // (paiement différé), donc tout ce qui y entre compte dans le RTP réel.
    for (const wings of [0, 3, 6]) {
      state.wingLevel = wings;
      const rtpBase = 1 - icarusEffectiveEdge();
      const total = rtpBase + potRecycle() * (1 - rtpBase);
      expect(total).toBeLessThan(1);
    }
    // …y compris avec l'osselet du noyé, qui CLAMPE le recycle au lieu de doubler
    // une part de mise (c'était la config à 133,4 %).
    state.templeArtifacts = { noye: true };
    expect(potRecycle()).toBe(TEMPLE_POT_RECYCLE_CAP);
    expect(potRecycle()).toBeLessThan(1); // A10 : LE point de défaillance unique
    state.templeArtifacts = {};
    state.wingLevel = 0;
  });

  it("le soleil peut frapper au décollage (C = 1)", () => {
    launch("plume", 0.999); // (1-edge)/U < 1 → C = 1
    vi.advanceTimersByTime(50);
    const out = icarusLastOutcome();
    expect(out.type).toBe("crash");
    expect(out.crashPoint).toBe(1);
  });

  it("se poser à ×10+ emporte une part de la cagnotte AU PRORATA de la mise", () => {
    const stake = icarusStakes().find((s) => s.id === "plume");
    state.icarusPotFaveur = 1000;
    invalidateRenderCache("all");
    expect(icarusPotFaveur()).toBe(1000);
    launch("plume", 0.05); // C = 17.6
    vi.advanceTimersByTime(16700); // m ≈ ×10.03
    const out = cashOutIcarus();
    expect(out.m).toBeGreaterThanOrEqual(10);
    // Plume (4) sur RAFLE_MISE_PLEINE (25) = 16 % — la petite mise n'emporte plus
    // TOUT le magot (c'était l'imprimante mesurée par A9 : Icare ×10 à 118,7 %).
    expect(potRakeShare(stake.faveur)).toBeCloseTo(0.16, 6);
    expect(out.jackpotFaveur).toBe(160);
    // Le reste SURVIT à la rafle, puis ce vol y verse sa part d'edge (rafle PUIS
    // versement : on emporte sa part de ce qui était là, ensuite le temple prélève).
    expect(state.icarusPotFaveur).toBeCloseTo(840 + stake.faveur * TEMPLE_POT_RECYCLE * ICARUS_EDGE, 6);
    expect(state.faveur).toBe(FAVEUR_START - stake.faveur + out.faveur + out.jackpotFaveur);
  });

  it("la mise pleine (Hécatombe) vide la cella, la Plume non : la mise est une décision", () => {
    const heca = icarusStakes().find((s) => s.id === "hecatombe");
    expect(potRakeShare(heca.faveur)).toBe(1);
    state.faveur = FAVEUR_START;
    state.icarusPotFaveur = 1000;
    launch("hecatombe", 0.05); // C = 17.6
    vi.advanceTimersByTime(16700); // m ≈ ×10.03
    const out = cashOutIcarus();
    expect(out.jackpotFaveur).toBe(1000);
    // Vidée par la rafle, puis re-nourrie par la part d'edge de CE vol.
    expect(state.icarusPotFaveur).toBeCloseTo(heca.faveur * TEMPLE_POT_RECYCLE * ICARUS_EDGE, 6);
  });

  it("payRound est NON BIAISÉ : E[payRound(x)] = x (ce que Math.round n'était pas)", () => {
    // Math.round(4 × 1,4) = 6 au lieu de 5,6, soit +7,1 % — plus que l'edge aux ailes
    // 6 (4,2 %). Ce seul biais faisait passer rtp_base à 102,6 %, et aucun recyclage
    // ne peut rattraper un rtp_base > 1. C'était la DERNIÈRE imprimante du temple.
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

  it("un vol offert (Coup de Vénus) ne coûte rien et paie en Faveur", () => {
    state.icarusFreeFlights = ["plume"];
    launch("plume", 0.01); // C = 88
    expect(state.faveur).toBe(FAVEUR_START); // le temple paie la mise
    expect(state.icarusFreeFlights).toEqual([]);
    vi.advanceTimersByTime(5000);
    const out = cashOutIcarus();
    expect(out.faveur).toBeGreaterThan(0);
    expect(state.faveur).toBe(FAVEUR_START + out.faveur);
  });

  it("un vol offert ne vaut QUE pour sa mise (le billet du Soleil suit le ticket)", () => {
    // La file porte des ids de mise depuis le 2026-07-17 : une Hécatombe offerte ne
    // paie pas une Plume, et une Plume offerte ne paie pas une Hécatombe.
    state.icarusFreeFlights = ["hecatombe"];
    state.faveur = FAVEUR_START;
    launch("plume", 0.01);
    expect(state.faveur).toBe(FAVEUR_START - 4); // la Plume est bien DÉBITÉE
    expect(state.icarusFreeFlights).toEqual(["hecatombe"]); // le billet reste
    vi.advanceTimersByTime(5000);
    cashOutIcarus();
    // …et il sert bien quand on prend la bonne mise.
    const before = state.faveur;
    launch("hecatombe", 0.01);
    expect(state.faveur).toBe(before); // le temple paie
    expect(state.icarusFreeFlights).toEqual([]);
  });

  it("hydratation : cagnotte de Faveur bornée, historique re-typé", () => {
    const s = hydrateState({ icarusPotFaveur: 999999, icarusHistory: [2.4, "junk", -3, 1.1, Infinity] });
    expect(s.icarusPotFaveur).toBe(ICARUS_POT_CAP_FAVEUR);
    expect(s.icarusHistory).toEqual([2.4, 1.1]);
    expect(hydrateState({ icarusPotFaveur: -5 }).icarusPotFaveur).toBe(0);
    expect(hydrateState({}).icarusHistory).toEqual([]);
  });

  it("reset de cycle : historique effacé, cagnotte de Faveur SURVIT", () => {
    launch("plume", 0.5);
    vi.advanceTimersByTime(6000); // chute → cagnotte nourrie + historique
    expect(state.icarusHistory.length).toBe(1);
    const pot = state.icarusPotFaveur;
    resetTemporaryRunState(state);
    expect(state.icarusHistory).toEqual([]);
    expect(state.icarusPotFaveur).toBe(pot);
  });

  it("l'historique est capé", () => {
    for (let i = 0; i < ICARUS_HISTORY_LEN + 4; i++) {
      launch("plume", 0.5);
      vi.advanceTimersByTime(6000);
    }
    expect(state.icarusHistory.length).toBe(ICARUS_HISTORY_LEN);
  });
});
