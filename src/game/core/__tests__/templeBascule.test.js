"use strict";
// LA BASCULE (2026-07-17, arbitrage Raphaël : « imprimante volontaire ») —
// le temple devient une imprimante de Faveur ASSUMÉE en fin de course :
//  - les coffres du temple (state.coffreLevel) : mise × 10^rang, gains au
//    prorata, clampStakeMult est LE garde-fou unique (saves trafiquées incluses) ;
//  - la refente du vingt-et-un : légalisée comme rang d'imprimante (100,3 % de
//    base en jeu parfait), un 21 refendu paie ×2 et non ×2,5 ;
//  - les reliques du trésor : le Char (Bénédiction permanente), la Corne (×2) et
//    l'Œil d'or (×4) paient DANS LA CITÉ (production) ;
//  - l'automatisation mise au coffre (stakePow), bornée au rang possédé.
// Le débit de l'imprimante reste borné par cadence × mise × marge (bench A14).

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { state, setState, hydrateState, invalidateRenderCache, setNotifyPaused } from "../state.js";
import {
  castAugury,
  playScratch,
  tickTempleAutomation, setTempleAuto
} from "../actions.js";
import {
  dealBlackjack, standBlackjack, blackjackLastOutcome, blackjackHand,
  doubleBlackjack, splitBlackjack, __resetBlackjackForTests
} from "../actions/blackjack.js";
import { resolveIcarusHeadless } from "../actions/icarus.js";
import { clampStakeMult } from "../actions/templePot.js";
import { grantFreeFlight, freeFlightCount } from "../actions/templeFlights.js";
import { buyFaveurItem, templeRelicProdMult, blessingMultiplier } from "../actions/faveurShop.js";
import { crisisProductionMultiplier } from "../mechanics/production/crisisLevers.js";
import {
  AUGURY_STAKES,
  COFFRE_MAX_LEVEL, COFFRE_COST_BASE, COFFRE_COST_GROWTH,
  BLESSING_MULT, RELIC_CORNE_PROD_MULT, RELIC_OEIL_PROD_MULT
} from "../balance.js";
import { MID_GAME_FIXTURE, FIXED_NOW } from "./fixtures.js";

const FAVEUR_START = 50_000;
const C = (rank, suit = "olive") => ({ rank, suit });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
  setState(hydrateState(MID_GAME_FIXTURE));
  state.bestEraIndex = 4; // toutes les ères de jeu ouvertes
  state.faveur = FAVEUR_START;
  state.templeArtifacts = {};
  state.coffreLevel = 0;
  state.icarusPotFaveur = 0;
  state.icarusFreeFlights = [];
  __resetBlackjackForTests(); // la main est un état MODULE : elle survit entre tests
  invalidateRenderCache("all");
});

afterEach(() => {
  setNotifyPaused(false);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ── Les coffres : clampStakeMult est le garde-fou UNIQUE ─────────────────────
describe("Coffres du temple — clampStakeMult", () => {
  it("sans coffre, tout multiplicateur retombe à ×1", () => {
    expect(clampStakeMult(1)).toBe(1);
    expect(clampStakeMult(10)).toBe(1);
    expect(clampStakeMult(1e8)).toBe(1);
    expect(clampStakeMult(NaN)).toBe(1);
    expect(clampStakeMult(-5)).toBe(1);
  });

  it("au rang N, autorise jusqu'à ×10^N et clampe au-delà (puissances de 10 seules)", () => {
    state.coffreLevel = 2;
    expect(clampStakeMult(10)).toBe(10);
    expect(clampStakeMult(100)).toBe(100);
    expect(clampStakeMult(1000)).toBe(100);   // clampé au rang possédé
    expect(clampStakeMult(30)).toBe(10);      // pas une puissance de 10 → arrondi log10
    // Save trafiquée : coffreLevel hors bornes, le clamp tient quand même.
    state.coffreLevel = 999;
    expect(clampStakeMult(10 ** (COFFRE_MAX_LEVEL + 3))).toBe(10 ** COFFRE_MAX_LEVEL);
  });

  it("l'achat en boutique monte d'un rang au prix ×10 (temps de farm constant)", () => {
    state.faveur = COFFRE_COST_BASE;
    expect(buyFaveurItem("coffre")).toBe(true);
    expect(state.coffreLevel).toBe(1);
    expect(state.faveur).toBe(0);
    // Rang suivant : ×COFFRE_COST_GROWTH — trop cher, refusé sans débit.
    state.faveur = COFFRE_COST_BASE * COFFRE_COST_GROWTH - 1;
    expect(buyFaveurItem("coffre")).toBe(false);
    expect(state.coffreLevel).toBe(1);
    expect(state.faveur).toBe(COFFRE_COST_BASE * COFFRE_COST_GROWTH - 1);
  });
});

// ── La mise au coffre traverse les 4 moteurs ─────────────────────────────────
describe("Coffres — les moteurs misent ×10^rang, gains au prorata", () => {
  it("osselets : mise ×10 débitée, ×10 refusé sans le rang", () => {
    state.coffreLevel = 1;
    vi.spyOn(Math, "random").mockReturnValue(0.5); // creux (perte)
    const res = castAugury("prayForRain", "classique", { render: false, silent: true, stakeMult: 10 });
    expect(res).not.toBeNull();
    expect(res.stake).toBe(AUGURY_STAKES.classique * 10);
    expect(state.faveur).toBe(FAVEUR_START - AUGURY_STAKES.classique * 10);
    // Sans le rang : le clamp retombe à ×1, la mise de base part seule.
    state.coffreLevel = 0;
    state.faveur = FAVEUR_START;
    state.gambleHistory = {}; // la Clémence du premier revers rabaisserait la mise
    castAugury("prayForRain", "classique", { render: false, silent: true, stakeMult: 10 });
    expect(state.faveur).toBe(FAVEUR_START - AUGURY_STAKES.classique);
  });

  it("Icare : crash à ×10 perd 40, et un vol offert ne vaut qu'au coffre ×1", () => {
    state.coffreLevel = 1;
    vi.spyOn(Math, "random").mockReturnValue(0.999); // u≈1 → crash ~×1 → perdu vs cible 2
    const res = resolveIcarusHeadless("plume", 2, { stakeMult: 10 });
    expect(res).not.toBeNull();
    expect(state.faveur).toBe(FAVEUR_START - 4 * 10);
    // Un billet en file N'EST PAS consommé à ×10 : la Faveur est débitée.
    expect(grantFreeFlight("plume")).toBe(true);
    state.faveur = FAVEUR_START;
    resolveIcarusHeadless("plume", 2, { stakeMult: 10 });
    expect(freeFlightCount("plume")).toBe(1); // le billet attend un vol ×1
    expect(state.faveur).toBe(FAVEUR_START - 40);
  });

  it("gratteux : ticket perdant à ×10 = mise ×10 partie", () => {
    state.coffreLevel = 1;
    vi.spyOn(Math, "random").mockReturnValue(0.1); // blank (perte)
    const res = playScratch("obole", { render: false, silent: true, stakeMult: 10 });
    expect(res).not.toBeNull();
    expect(res.stakeFaveur).toBe(40);
    expect(state.faveur).toBe(FAVEUR_START - 40);
  });

  it("vingt-et-un : la donne débite mise ×10, UNE seule fois", () => {
    state.coffreLevel = 1;
    dealBlackjack("legere", { deck: [C("K"), C("9"), C("10"), C("6"), C("5")] });
    expect(state.faveur).toBe(FAVEUR_START - 4); // ×1 par défaut
    standBlackjack();
    state.faveur = FAVEUR_START;
    dealBlackjack("legere", { deck: [C("K"), C("9"), C("10"), C("6"), C("K")] , stakeMult: 10 });
    expect(state.faveur).toBe(FAVEUR_START - 40);
    standBlackjack(); // l'oracle 16 tire le K → crève → win ×2 sur la mise ×10
    expect(blackjackLastOutcome().result).toBe("win");
    expect(state.faveur).toBe(FAVEUR_START - 40 + 80);
  });
});

// ── La refente : le rang d'imprimante du vingt-et-un ─────────────────────────
describe("La refente (artefact, légalisée 2026-07-17)", () => {
  it("refusée sans l'artefact ou sans paire", () => {
    dealBlackjack("legere", { deck: [C("8"), C("8"), C("9"), C("7"), C("2"), C("3"), C("K")] });
    expect(blackjackHand().canSplit).toBe(false); // pas d'artefact
    expect(splitBlackjack()).toBeNull();
    standBlackjack();
    state.templeArtifacts = { refente: true };
    dealBlackjack("legere", { deck: [C("K"), C("9"), C("10"), C("6"), C("5")] });
    expect(blackjackHand().canSplit).toBe(false); // K-9 : pas une paire
    expect(splitBlackjack()).toBeNull();
    standBlackjack();
  });

  it("les figures se refendent entre elles (K-Q comptent 10-10)", () => {
    state.templeArtifacts = { refente: true };
    dealBlackjack("legere", { deck: [C("K"), C("Q"), C("9"), C("7"), C("5"), C("4"), C("2")] });
    expect(blackjackHand().canSplit).toBe(true);
  });

  it("refend en 2 mains, débite la 2e mise, résout main par main (net agrégé)", () => {
    state.templeArtifacts = { refente: true };
    // Donne 8-8 contre 9-7 (16). Refente → [8,2]=10 et [8,3]=11. L'oracle tire
    // le K → 26, crève : les DEUX mains gagnent ×2.
    dealBlackjack("legere", { deck: [C("8"), C("8"), C("9"), C("7"), C("2"), C("3"), C("K")] });
    expect(state.faveur).toBe(FAVEUR_START - 4);
    const h = splitBlackjack();
    expect(h.split).toBe(true);
    expect(h.hands.length).toBe(2);
    expect(state.faveur).toBe(FAVEUR_START - 8); // la seconde mise est partie
    standBlackjack(); // main 1 → passe à la main 2
    expect(blackjackHand().active).toBe(1);
    standBlackjack(); // main 2 → l'oracle joue, tout se résout
    const out = blackjackLastOutcome();
    expect(out.split).toBe(true);
    expect(out.results.map((r) => r.result)).toEqual(["win", "win"]);
    expect(out.faveurGain).toBe(16);
    expect(out.stakeFaveur).toBe(8);
    expect(state.faveur).toBe(FAVEUR_START - 8 + 16);
  });

  it("un 21 en 2 cartes APRÈS refente paie ×2, pas ×2,5 (pas un naturel)", () => {
    state.templeArtifacts = { refente: true };
    // As-As contre 9-8 (17, l'oracle reste). Refente → [A,K]=21 et [A,Q]=21.
    dealBlackjack("legere", { deck: [C("A"), C("A"), C("9"), C("8"), C("K"), C("Q")] });
    splitBlackjack();
    standBlackjack();
    standBlackjack();
    const out = blackjackLastOutcome();
    expect(out.results.map((r) => r.result)).toEqual(["win", "win"]); // PAS "blackjack"
    expect(out.faveurGain).toBe(16); // ×2 par main — ×2,5 aurait rendu 20
  });

  it("DAS : le double reste permis sur chaque main refendue", () => {
    state.templeArtifacts = { refente: true, double: true };
    // 8-8 contre 9-7. Refente → [8,3]=11 et [8,2]=10. Double sur la main 1 :
    // mise 8, tire le K → 21, passe. Main 2 : reste à 10. L'oracle tire la
    // dame → 26, crève : main 1 rend 16, main 2 rend 8.
    dealBlackjack("legere", { deck: [C("8"), C("8"), C("9"), C("7"), C("3"), C("2"), C("K"), C("Q")] });
    splitBlackjack();
    const h = doubleBlackjack();
    expect(h.active).toBe(1); // le double a soldé la main 1
    expect(state.faveur).toBe(FAVEUR_START - 12); // 4 + 4 (refente) + 4 (double)
    standBlackjack();
    const out = blackjackLastOutcome();
    expect(out.faveurGain).toBe(24);
    expect(state.faveur).toBe(FAVEUR_START - 12 + 24);
  });
});

// ── Les reliques : l'imprimante paie dans la cité ────────────────────────────
describe("Les reliques du trésor", () => {
  it("Corne ×2 et Œil ×4 multiplient la production (×8 les deux)", () => {
    expect(templeRelicProdMult()).toBe(1);
    const base = crisisProductionMultiplier("food");
    state.templeArtifacts = { corne: true };
    expect(templeRelicProdMult()).toBe(RELIC_CORNE_PROD_MULT);
    expect(crisisProductionMultiplier("food")).toBeCloseTo(base * RELIC_CORNE_PROD_MULT, 12);
    state.templeArtifacts = { corne: true, oeil: true };
    expect(templeRelicProdMult()).toBe(RELIC_CORNE_PROD_MULT * RELIC_OEIL_PROD_MULT);
    expect(crisisProductionMultiplier("food")).toBeCloseTo(base * RELIC_CORNE_PROD_MULT * RELIC_OEIL_PROD_MULT, 12);
  });

  it("le Char du Soleil rend la Bénédiction permanente (plus d'expiration)", () => {
    state.blessingUntil = 0; // aucune bénédiction en cours
    expect(blessingMultiplier()).toBe(1);
    const base = crisisProductionMultiplier("food");
    state.templeArtifacts = { char: true };
    expect(blessingMultiplier()).toBe(BLESSING_MULT);
    expect(crisisProductionMultiplier("food")).toBeCloseTo(base * BLESSING_MULT, 12);
  });
});

// ── L'automatisation mise au coffre (stakePow) ───────────────────────────────
describe("Auto au coffre — stakePow borné au rang possédé", () => {
  beforeEach(() => {
    state.templeAuto = hydrateState({ ...MID_GAME_FIXTURE, templeAuto: {} }).templeAuto;
  });

  it("setTempleAuto clampe stakePow au rang de coffre", () => {
    state.templeAuto.gratteux.unlocked = true;
    state.coffreLevel = 2;
    setTempleAuto("gratteux", { stakePow: 5 });
    expect(state.templeAuto.gratteux.stakePow).toBe(2);
    state.coffreLevel = 0;
    setTempleAuto("gratteux", { stakePow: 1 });
    expect(state.templeAuto.gratteux.stakePow).toBe(0);
  });

  it("le tick joue à mise ×10^stakePow, plancher compté sur la mise pleine", () => {
    state.coffreLevel = 1;
    state.templeAuto.gratteux = { unlocked: true, on: true, stakeId: "obole", tempo: "mesure", faveurFloor: 0, lastAt: 0, stakePow: 1 };
    state.faveur = 100;
    vi.spyOn(Math, "random").mockReturnValue(0.1); // blank (perte)
    tickTempleAutomation();
    expect(state.faveur).toBe(100 - 40); // obole ×10
    // Plancher : la réserve doit tenir APRÈS la mise ×10 → 70 − 40 < 50, l'auto dort.
    state.templeAuto.gratteux.lastAt = 0;
    state.templeAuto.gratteux.faveurFloor = 50;
    state.faveur = 70;
    tickTempleAutomation();
    expect(state.faveur).toBe(70); // pas joué
  });

  it("hydratation : stakePow reçoit 0 par défaut et reste borné", () => {
    const s = hydrateState({ templeAuto: { gratteux: { unlocked: true, on: true, stakePow: 99 } } });
    expect(s.templeAuto.gratteux.stakePow).toBeLessThanOrEqual(COFFRE_MAX_LEVEL);
    expect(s.templeAuto.osselets.stakePow).toBe(0);
  });
});
