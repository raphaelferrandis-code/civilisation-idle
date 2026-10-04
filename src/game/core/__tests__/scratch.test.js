"use strict";
// Tickets à gratter (jeu du temple) — moteur. Mise et gain en FAVEUR. Lot 1 des
// gains « vrai casino » (2026-10-04) : la mise (le prix du ticket) est LIBRE entre
// les limites de la table, et les cotes sont FIXES (plus de planches du graveur).
// L'issue est tirée par UN Math.random pondéré (table SCRATCH_PRIZES, poids sur
// 1 000 000), la grille 3×3 est peinte pour matcher. Gagner = payRound(mise ×
// payoutMult). Chaque ticket nourrit la cagnotte PARTAGÉE (state.icarusPotFaveur)
// sur son edge, sans jamais la rafler ; le Soleil est le GROS LOT (×5 000), la
// Vénus offre un vol d'Icare à la mise du ticket. Effet DIFFÉRÉ (defer + apply
// idempotent) jusqu'à la révélation par grattage.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { state, setState, hydrateState, invalidateRenderCache, resetTemporaryRunState } from "../state.js";
import { playScratch, scratchGrid } from "../actions.js";
import { scratchRtpRef, scratchPrizes, scratchOdds } from "../actions/scratch.js";
import { tableLimits, potCap } from "../actions/maisonTable.js";
import { ICARUS_RTP, ICARUS_FREE_FLIGHTS_MAX, TEMPLE_POT_RECYCLE, SCRATCH_HISTORY_LEN, SCRATCH_PRIZES } from "../balance.js";
import { MID_GAME_FIXTURE, FIXED_NOW } from "./fixtures.js";

const FAVEUR_START = 500;
const TOTAL = SCRATCH_PRIZES.reduce((s, p) => s + p.weight, 0);
const PRIZE = Object.fromEntries(SCRATCH_PRIZES.map((p) => [p.symbol, p]));

// Valeur de Math.random qui force une issue : le MILIEU de l'intervalle cumulé du
// symbole (drawPrize parcourt la table dans l'ordre). Dérivée de la table, pour ne
// pas recopier des bornes à la main.
function uOf(symbol) {
  let acc = 0;
  for (const p of SCRATCH_PRIZES) {
    if (p.symbol === symbol) return (acc + p.weight / 2) / TOTAL;
    acc += p.weight;
  }
  throw new Error(`symbole inconnu : ${symbol}`);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
  setState(hydrateState(MID_GAME_FIXTURE)); // ère record 5 : limite haute 95
  state.faveur = FAVEUR_START; // couvre toutes les mises (monnaie fermée)
  state.icarusPotFaveur = 0;
  state.icarusFreeFlights = [];
  state.templeArtifacts = {};
  state.scratchHistory = [];
  invalidateRenderCache("all");
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// Force l'issue (le PREMIER random, celui de drawPrize), puis fige TOUS les
// suivants à 0.999 : la grille reste déterministe ET payRound arrondit toujours
// vers le BAS — sans ça, un gain fractionnaire rendrait le test intermittent (le
// piège documenté du mockReturnValueOnce qui retombe sur le vrai hasard).
function play(stake, symbol, opts) {
  vi.spyOn(Math, "random").mockReturnValue(0.999).mockReturnValueOnce(uOf(symbol));
  const res = playScratch(stake, opts);
  Math.random.mockRestore();
  return res;
}

describe("Tickets à gratter — moteur", () => {
  it("paie la mise EN FAVEUR à l'achat, refuse sans solde", () => {
    play(20, "blank");
    expect(state.faveur).toBe(FAVEUR_START - 20);
    state.faveur = 19;
    expect(play(20, "blank")).toBeNull(); // mise impayable → refus
    expect(state.faveur).toBe(19);
  });

  it("la mise est libre : refusée sous 1, entière, plafonnée à la limite haute", () => {
    // Sous la limite basse (ou illisible, comme un ancien id de mise) : pas de ticket.
    for (const bad of [0, 0.9, -5, NaN, undefined, "obole"]) {
      expect(playScratch(bad), String(bad)).toBeNull();
    }
    expect(state.faveur).toBe(FAVEUR_START);
    expect(state.scratchHistory).toEqual([]);
    // Au-dessus de la limite haute : le ticket coûte la limite, pas plus.
    const { max } = tableLimits();
    const res = play(max * 100, "blank");
    expect(res.stakeFaveur).toBe(max);
    expect(state.faveur).toBe(FAVEUR_START - max);
    // Une mise fractionnaire est ramenée à l'entier inférieur.
    expect(play(12.7, "blank").stakeFaveur).toBe(12);
    expect(state.faveur).toBe(FAVEUR_START - max - 12);
  });

  it("un ticket gagnant crédite payRound(mise × payoutMult) en Faveur", () => {
    const res = play(8, "laurier"); // laurier ×4
    expect(res.win).toBe(true);
    expect(res.faveurGain).toBe(8 * PRIZE.laurier.payoutMult);
    expect(state.faveur).toBe(FAVEUR_START - 8 + 8 * PRIZE.laurier.payoutMult);
  });

  it("defer : rien appliqué avant apply(), et apply() est idempotent", () => {
    // PAS le harnais play() ici : payRound tire son random À L'APPLY (différé),
    // le mock doit donc rester vivant jusqu'aux apply().
    vi.spyOn(Math, "random").mockReturnValue(0.999).mockReturnValueOnce(uOf("amphore")); // amphore ×2
    const res = playScratch(8, { render: false, defer: true });
    expect(res.win).toBe(true);
    // La mise est DÉJÀ payée (comme castAugury/launchIcarus), le gain dort, et la
    // cagnotte comme l'historique attendent la révélation.
    expect(state.faveur).toBe(FAVEUR_START - 8);
    expect(state.icarusPotFaveur).toBe(0);
    expect(state.scratchHistory).toEqual([]);
    const expected = FAVEUR_START - 8 + 8 * PRIZE.amphore.payoutMult;
    res.apply();
    expect(state.faveur).toBe(expected);
    res.apply(); // flush idempotent
    expect(state.faveur).toBe(expected);
    expect(state.scratchHistory).toEqual(["amphore"]);
    Math.random.mockRestore();
  });

  it("un ticket nourrit la cagnotte SUR L'EDGE (et non sur la mise perdue)", () => {
    const stake = 20;
    const feed = stake * TEMPLE_POT_RECYCLE * (1 - scratchRtpRef());
    play(stake, "blank");
    expect(state.icarusPotFaveur).toBeCloseTo(feed, 9);
    expect(state.faveur).toBe(FAVEUR_START - stake);
    // …et un ticket GAGNANT verse autant : le versement ne dépend pas de l'issue,
    // c'est ce qui rend l'espérance exacte (cf. feedPot).
    state.icarusPotFaveur = 0;
    play(stake, "olive");
    expect(state.icarusPotFaveur).toBeCloseTo(feed, 9);
  });

  it("la cagnotte reste bornée à son plafond (24 h de recettes, jamais sous 5 000)", () => {
    state.icarusPotFaveur = potCap() - 0.1; // le versement dépasse le plafond
    play(20, "blank");
    expect(state.icarusPotFaveur).toBe(potCap());
  });

  it("trois Vénus offrent un vol d'Icare À LA MISE du ticket (plafonnée par la table)", () => {
    const res = play(20, "venus");
    expect(res.freeFlight).toBe(true);
    expect(res.faveurGain).toBe(20 * PRIZE.venus.payoutMult);
    expect(state.icarusFreeFlights).toEqual([20]);
    // Un ticket misé au-dessus de la limite est plafonné, son billet aussi.
    const { max } = tableLimits();
    play(max * 10, "venus");
    expect(state.icarusFreeFlights).toEqual([20, max]);
  });

  it("file de vols pleine : la Vénus paie son lot, sans billet", () => {
    state.icarusFreeFlights = new Array(ICARUS_FREE_FLIGHTS_MAX).fill(4);
    const res = play(20, "venus");
    expect(res.freeFlight).toBe(false);
    expect(state.faveur).toBe(FAVEUR_START - 20 + 20 * PRIZE.venus.payoutMult);
    expect(state.icarusFreeFlights).toEqual(new Array(ICARUS_FREE_FLIGHTS_MAX).fill(4));
  });

  it("trois Soleils : le GROS LOT, ×5 000 la mise — sans vol ni rafle", () => {
    state.icarusPotFaveur = 1000;
    const res = play(10, "soleil");
    expect(res.payoutMult).toBe(5000);
    expect(res.faveurGain).toBe(50000);
    expect(state.faveur).toBe(FAVEUR_START - 10 + 50000);
    // Le billet du Soleil (avant le lot 1) a disparu : seule la Vénus offre un vol.
    expect(res.freeFlight).toBe(false);
    expect(res.sunFlight).toBeUndefined();
    expect(state.icarusFreeFlights).toEqual([]);
    // La cella n'est PAS reprise : cette table nourrit le pot, jamais l'inverse.
    // Elle y verse même sa part d'edge au passage, comme sur tout autre ticket.
    expect(state.icarusPotFaveur).toBeCloseTo(1000 + 10 * TEMPLE_POT_RECYCLE * (1 - scratchRtpRef()), 9);
  });

  it("l'historique est capé à SCRATCH_HISTORY_LEN et effacé au cycle", () => {
    for (let i = 0; i < SCRATCH_HISTORY_LEN + 5; i++) play(4, "blank");
    expect(state.scratchHistory.length).toBe(SCRATCH_HISTORY_LEN);
    resetTemporaryRunState(state);
    expect(state.scratchHistory).toEqual([]);
  });
});

describe("Tickets à gratter — la table des lots (cotes fixes)", () => {
  it("rend ~75,0 % : un ticket sur quatre gagne, le Soleil paie ×5 000 (1 sur 100 000)", () => {
    expect(TOTAL).toBe(1_000_000);
    // Le retour NOMINAL (les lots seuls) vaut exactement 75 %…
    const nominal = SCRATCH_PRIZES.reduce((s, p) => s + (p.weight / TOTAL) * p.payoutMult, 0);
    expect(nominal).toBeCloseTo(0.75, 12);
    // …et le vol offert de la Vénus s'y ajoute, compté au RTP d'Icare (≈ 75,02 %).
    expect(scratchRtpRef()).toBeCloseTo(nominal + scratchOdds("venus") * ICARUS_RTP, 12);
    expect(scratchRtpRef()).toBeCloseTo(0.7502, 4);
    // Un ticket sur quatre gagne (25,9 %).
    expect(1 - scratchOdds("blank")).toBeCloseTo(0.259, 3);
    // Le Soleil : le gros lot, 1 ticket sur 100 000.
    expect(PRIZE.soleil.payoutMult).toBe(5000);
    expect(scratchOdds("soleil")).toBeCloseTo(1e-5, 12);
    // Seule la Vénus offre un vol.
    expect(SCRATCH_PRIZES.filter((p) => p.freeFlight).map((p) => p.symbol)).toEqual(["venus"]);
    // L'invariant de la cagnotte : paiement différé compris, la table reste sous 1.
    expect(scratchRtpRef() + TEMPLE_POT_RECYCLE * (1 - scratchRtpRef())).toBeLessThan(1);
  });

  it("les cotes sont FIXES : aucun achat ne touche la table (plus de planches du graveur)", () => {
    const rtp = scratchRtpRef();
    expect(scratchPrizes()).toBe(SCRATCH_PRIZES);
    // Un niveau de graveur resté dans l'état, le stylet et les artefacts du gratteux
    // n'y changent rien : ils vendent du geste, pas des chances.
    state.graveurLevel = 5;
    state.styletLevel = 3;
    state.templeArtifacts = { coin: true, relance: true };
    expect(scratchPrizes()).toBe(SCRATCH_PRIZES);
    expect(scratchRtpRef()).toBe(rtp);
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
  it("re-type scratchHistory (garde les chaînes) et refuse une cagnotte négative ou illisible", () => {
    const s = hydrateState({ ...MID_GAME_FIXTURE, scratchHistory: ["olive", 42, "soleil", null], icarusPotFaveur: -50 });
    expect(s.scratchHistory).toEqual(["olive", "soleil"]);
    expect(s.icarusPotFaveur).toBe(0);
    expect(hydrateState({ ...MID_GAME_FIXTURE, icarusPotFaveur: "abc" }).icarusPotFaveur).toBe(0);
  });
});
