"use strict";
// Tickets à gratter (jeu du temple) — moteur (MONNAIE FERMÉE 2026-07-16) :
//   mise et gain en FAVEUR. L'issue est tirée par UN Math.random pondéré
//   (table SCRATCH_PRIZES), la grille 3×3 est peinte pour matcher. Gagner =
//   round(mise × payoutMult). Un ticket perdant nourrit la cagnotte PARTAGÉE
//   (part de mise, state.icarusPotFaveur) ; le Soleil la rafle. Effet DIFFÉRÉ
//   (defer + apply idempotent) jusqu'à la révélation par grattage.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { state, setState, hydrateState, invalidateRenderCache, resetTemporaryRunState } from "../state.js";
import { playScratch, scratchGrid } from "../actions.js";
import { scratchRtpRef, scratchPrizesEff } from "../actions/scratch.js";
import { ICARUS_POT_CAP_FAVEUR, TEMPLE_POT_RECYCLE, SCRATCH_HISTORY_LEN, SCRATCH_STAKES } from "../balance.js";
import { MID_GAME_FIXTURE, FIXED_NOW } from "./fixtures.js";

const STAKE_OF = (id) => SCRATCH_STAKES.find((s) => s.id === id).faveur;
const FAVEUR_START = 500;

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
  state.faveur = FAVEUR_START; // couvre toutes les mises (monnaie fermée)
  state.icarusPotFaveur = 0;
  state.scratchHistory = [];
  invalidateRenderCache("all");
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// Force l'issue via u (le PREMIER random, celui de drawPrize), puis fige TOUS les
// suivants à 0.999 : la grille reste déterministe ET payRound arrondit toujours
// vers le BAS (0.999 ≥ toute fraction) — sans ça, un gain fractionnaire
// (drachme × olive = 9,6) rendrait le test intermittent (le piège documenté du
// mockReturnValueOnce qui retombe sur le vrai hasard).
function play(stakeId, u, opts) {
  vi.spyOn(Math, "random").mockReturnValue(0.999).mockReturnValueOnce(u);
  const res = playScratch(stakeId, opts);
  Math.random.mockRestore();
  return res;
}

describe("Tickets à gratter — moteur", () => {
  it("paie la mise EN FAVEUR à l'achat, refuse sans solde", () => {
    play("talent", U.blank);
    expect(state.faveur).toBe(FAVEUR_START - STAKE_OF("talent"));
    state.faveur = STAKE_OF("talent") - 1;
    expect(play("talent", U.blank)).toBeNull(); // mise impayable → refus
    expect(state.faveur).toBe(STAKE_OF("talent") - 1);
  });

  it("un ticket gagnant crédite payRound(mise × payoutMult) en Faveur", () => {
    play("drachme", U.olive); // olive ×1.2 → 9,6 ; le harnais fige payRound au floor
    const stake = STAKE_OF("drachme");
    expect(state.faveur).toBe(FAVEUR_START - stake + Math.floor(stake * 1.2));
  });

  it("defer : rien appliqué avant apply(), et apply() est idempotent", () => {
    // PAS le harnais play() ici : payRound tire son random À L'APPLY (différé),
    // le mock doit donc rester vivant jusqu'aux apply() — le relâcher avant
    // rendait le test intermittent (19,2 arrondi 20 une fois sur cinq).
    vi.spyOn(Math, "random").mockReturnValue(0.999).mockReturnValueOnce(U.amphore); // amphore ×2.4
    const res = playScratch("drachme", { render: false, defer: true });
    const stake = STAKE_OF("drachme");
    expect(res.win).toBe(true);
    // La mise est DÉJÀ payée (comme castAugury/launchIcarus), le gain dort.
    expect(state.faveur).toBe(FAVEUR_START - stake);
    const expected = FAVEUR_START - stake + Math.floor(stake * 2.4);
    res.apply();
    expect(state.faveur).toBe(expected);
    res.apply(); // flush idempotent
    expect(state.faveur).toBe(expected);
    Math.random.mockRestore();
  });

  it("un ticket nourrit la cagnotte SUR L'EDGE (et non sur la mise perdue)", () => {
    const stake = STAKE_OF("talent");
    const feed = stake * TEMPLE_POT_RECYCLE * (1 - scratchRtpRef("talent"));
    play("talent", U.blank);
    expect(state.icarusPotFaveur).toBeCloseTo(feed, 5);
    expect(state.faveur).toBe(FAVEUR_START - stake);
    // …et un ticket GAGNANT verse autant : le versement ne dépend pas de l'issue,
    // c'est ce qui rend l'espérance exacte (cf. feedPot).
    state.icarusPotFaveur = 0;
    play("talent", U.olive);
    expect(state.icarusPotFaveur).toBeCloseTo(feed, 5);
  });

  it("scratchRtpRef est dérivé de la table effective (arrondi réel + vols comptés)", () => {
    for (const id of ["obole", "drachme", "talent"]) {
      expect(scratchRtpRef(id)).toBeLessThan(1);
      // L'invariant, sur les 3 mises.
      expect(scratchRtpRef(id) + TEMPLE_POT_RECYCLE * (1 - scratchRtpRef(id))).toBeLessThan(1);
    }
  });

  it("les planches du graveur : le winrate monte, les LOTS ne bougent pas (contrat des dés)", () => {
    const base = scratchPrizesEff();
    const rtp0 = scratchRtpRef("obole");
    state.graveurLevel = 5;
    const eff = scratchPrizesEff();
    // Les paiements sont IDENTIQUES à tous les niveaux…
    for (let i = 0; i < base.length; i++) {
      expect(eff[i].symbol).toBe(base[i].symbol);
      expect(eff[i].payoutMult).toBe(base[i].payoutMult);
    }
    // …le poids total est conservé (le tirage garde sa base de 1000)…
    const tot = eff.reduce((s, p) => s + p.weight, 0);
    expect(tot).toBeCloseTo(base.reduce((s, p) => s + p.weight, 0), 9);
    // …le blank maigrit, chaque gagnant grossit, et le RTP suit sans dépasser 1.
    expect(eff.find((p) => p.symbol === "blank").weight).toBeLessThan(730);
    expect(eff.find((p) => p.symbol === "olive").weight).toBeGreaterThan(138);
    const rtp5 = scratchRtpRef("obole");
    expect(rtp5).toBeGreaterThan(rtp0);
    expect(rtp5).toBeLessThan(1);
    expect(rtp5 + TEMPLE_POT_RECYCLE * (1 - rtp5)).toBeLessThan(1);
    state.graveurLevel = 0;
  });

  it("la cagnotte reste bornée à ICARUS_POT_CAP_FAVEUR", () => {
    state.icarusPotFaveur = ICARUS_POT_CAP_FAVEUR - 0.1; // le versement dépasse le cap
    play("talent", U.blank);
    expect(state.icarusPotFaveur).toBe(ICARUS_POT_CAP_FAVEUR);
  });

  it("trois Soleils NE raflent PLUS la cagnotte : ils offrent un vol à la mise du ticket", () => {
    state.icarusPotFaveur = 1000;
    const res = play("talent", U.soleil); // soleil ×15, sunFlight
    const stake = STAKE_OF("talent");
    expect(res.sunFlight).toBe(true);
    expect(res.jackpotFaveur).toBeUndefined(); // le champ a disparu avec la rafle
    // La cella n'est PAS reprise : cette table nourrit le pot, jamais l'inverse.
    // Elle y verse même sa part d'edge au passage, comme sur tout autre ticket.
    expect(state.icarusPotFaveur).toBeGreaterThan(1000);
    expect(state.faveur).toBe(FAVEUR_START - stake + Math.round(stake * 15));
    // Le billet suit le ticket : un talent envoie à l'Hécatombe, pas à la Plume.
    expect(state.icarusFreeFlights).toEqual(["hecatombe"]);
  });

  it("le billet du Soleil suit la mise du ticket (obole → plume)", () => {
    const res = play("obole", U.soleil);
    expect(res.sunFlight).toBe(true);
    expect(state.icarusFreeFlights).toEqual(["plume"]);
  });

  it("trois Vénus offrent un vol d'Icare (toujours une Plume, quelle que soit la mise)", () => {
    const res = play("talent", U.venus);
    expect(res.freeFlight).toBe(true);
    expect(state.icarusFreeFlights).toEqual(["plume"]);
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
