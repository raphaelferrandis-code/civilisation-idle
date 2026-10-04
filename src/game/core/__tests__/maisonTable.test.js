"use strict";
// LA TABLE DE LA MAISON — lot 1 des gains « vrai casino » (2026-10-04,
// docs/PLAN-GAINS-CASINO.md). Les cotes ne bougent plus ; ce qui grandit, c'est la
// Maison : ses recettes suivent l'ère record, la limite haute des tables suit les
// recettes, la mise est libre entre 1 et cette limite. Remplace templeBascule.test.js
// (les Coffres, la bascule et la refente-artefact ont disparu) ; on en garde les
// reliques, et la refente devenue règle de base.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { state, setState, hydrateState, migrate, migrateFreeFlights, invalidateRenderCache, CURRENT_SAVE_VERSION } from "../state.js";
import {
  maisonEraIndex, recettesPerHour, caisseCap, tableLimits, clampStake, autoStake,
  blessingCost, potCap, chipValueAt, chipIndexOf, chipRack, chipPile
} from "../actions/maisonTable.js";
import { potRakeShare } from "../actions/templePot.js";
import {
  dealBlackjack, standBlackjack, blackjackLastOutcome, blackjackHand,
  doubleBlackjack, splitBlackjack, __resetBlackjackForTests
} from "../actions/blackjack.js";
import { templeRelicProdMult, blessingMultiplier } from "../actions/faveurShop.js";
import { artifactTree, buyArtifactNode } from "../actions/templeAutomation.js";
import { crisisProductionMultiplier } from "../mechanics/production/crisisLevers.js";
import { eras } from "../../data/world.js";
import { BLESSING_MULT, RELIC_CORNE_PROD_MULT, RELIC_OEIL_PROD_MULT, POT_CAP_MIN } from "../balance.js";
import { MID_GAME_FIXTURE, FIXED_NOW } from "./fixtures.js";

const FAVEUR_START = 50_000;
const C = (rank, suit = "olive") => ({ rank, suit });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
  setState(hydrateState(MID_GAME_FIXTURE));
  state.bestEraIndex = 4; // toutes les tables ouvertes (limite haute 65)
  state.faveur = FAVEUR_START;
  state.templeArtifacts = {};
  state.icarusPotFaveur = 0;
  state.icarusFreeFlights = [];
  __resetBlackjackForTests(); // la main est un état MODULE : elle survit entre tests
  invalidateRenderCache("all");
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ── Les recettes suivent l'ère record ─────────────────────────────────────────
describe("Recettes de la Maison", () => {
  it("valent l'ancien tronc à l'Ère II (120/h), puis ~×1,4 par ère", () => {
    state.bestEraIndex = 2;
    expect(recettesPerHour()).toBeCloseTo(120, 0); // seuil de l'Ère II : 4 018 (réf. 4 000)
    expect(caisseCap()).toBe(60);
    state.bestEraIndex = 3;
    expect(recettesPerHour()).toBeCloseTo(178, 0);
    state.bestEraIndex = 10;
    expect(recettesPerHour()).toBeCloseTo(2247, 0);
  });

  it("ne descendent jamais sous la base, et montent à chaque ère (jusqu'aux transcendantes)", () => {
    state.bestEraIndex = 0;
    expect(recettesPerHour()).toBe(120);
    let prev = 0;
    for (let e = 2; e < eras.length; e += 7) {
      const r = recettesPerHour(e);
      expect(Number.isFinite(r)).toBe(true); // les seuils au-delà de 1e308 passent par log10
      expect(r).toBeGreaterThanOrEqual(prev);
      prev = r;
    }
  });

  it("suivent l'ère RECORD (bornée), pas la population du moment", () => {
    state.bestEraIndex = 10;
    const avant = recettesPerHour();
    state.population = MID_GAME_FIXTURE.population; // la ville du moment ne compte pas
    expect(recettesPerHour()).toBe(avant);
    state.bestEraIndex = 9999; // save trafiquée : bornée à la dernière ère
    expect(maisonEraIndex()).toBe(eras.length - 1);
    state.bestEraIndex = -3;
    expect(maisonEraIndex()).toBe(0);
  });

  it("la Bénédiction coûte 30 min de recettes, la cagnotte plafonne à 24 h (jamais sous 5 000)", () => {
    state.bestEraIndex = 2;
    expect(blessingCost()).toBe(60);
    expect(potCap()).toBe(POT_CAP_MIN);
    state.bestEraIndex = 20;
    expect(blessingCost()).toBe(Math.round(recettesPerHour() * 0.5));
    expect(potCap()).toBeCloseTo(recettesPerHour() * 24, 6);
  });
});

// ── Les limites de table et la mise libre ─────────────────────────────────────
describe("Limites de table", () => {
  it("haute = 15 min de recettes, arrondie à deux chiffres ; basse = 1", () => {
    state.bestEraIndex = 2;
    expect(tableLimits()).toEqual({ min: 1, max: 30, base: 30 }); // Habitué : la table ouverte = la salle commune
    state.bestEraIndex = 3;
    expect(tableLimits().max).toBe(44);
    state.bestEraIndex = 10;
    expect(tableLimits().max).toBe(560);
    state.bestEraIndex = 20;
    expect(tableLimits().max).toBe(15000);
  });

  it("clampStake : entière, refusée sous 1, plafonnée à la limite", () => {
    state.bestEraIndex = 2; // limite 30
    expect(clampStake(0)).toBe(0);
    expect(clampStake(0.6)).toBe(0);
    expect(clampStake(-5)).toBe(0);
    expect(clampStake(NaN)).toBe(0);
    expect(clampStake(undefined)).toBe(0);
    expect(clampStake(12.7)).toBe(12);
    expect(clampStake(30)).toBe(30);
    expect(clampStake(1e9)).toBe(30);
  });

  it("autoStake : une part de la limite (min, ¼, ½, max)", () => {
    state.bestEraIndex = 10; // limite 560
    expect(autoStake("min")).toBe(1);
    expect(autoStake("quart")).toBe(140);
    expect(autoStake("moitie")).toBe(280);
    expect(autoStake("max")).toBe(560);
    expect(autoStake("inconnu")).toBe(1);
  });

  it("la rafle de la cagnotte suit la mise rapportée à la limite (la mise max rafle tout)", () => {
    state.bestEraIndex = 2; // limite 30
    expect(potRakeShare(3)).toBeCloseTo(0.1, 12);
    expect(potRakeShare(30)).toBe(1);
    expect(potRakeShare(300)).toBe(1); // bornée à 1
    state.templeArtifacts = { serres: true };
    expect(potRakeShare(3)).toBeCloseTo(0.15, 12);
  });
});

// ── Les jetons ────────────────────────────────────────────────────────────────
describe("Jetons", () => {
  it("la série des casinos : 1, 5, 25, 100, 500, 2 500, 10 000…", () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(chipValueAt)).toEqual([1, 5, 25, 100, 500, 2500, 10000]);
    expect(chipIndexOf(500)).toBe(4);
    expect(chipIndexOf(7)).toBe(-1);
  });

  it("le râtelier : les cinq plus gros jetons sous la limite", () => {
    expect(chipRack(30)).toEqual([1, 5, 25]);
    expect(chipRack(560)).toEqual([1, 5, 25, 100, 500]);
    expect(chipRack(15000)).toEqual([25, 100, 500, 2500, 10000]);
  });

  it("la pile : la mise décomposée du plus gros au plus petit, bornée", () => {
    expect(chipPile(137, [1, 5, 25, 100])).toEqual([100, 25, 5, 5, 1, 1]);
    expect(chipPile(1000, [1], 14).length).toBe(14);
  });
});

// ── La migration 4 → 5 : les achats de chances sont remboursés ───────────────
describe("Migration 4 → 5 (remboursement)", () => {
  it("rembourse dés, ailes, planches, Coffres, ivoire, double, refente — aux derniers prix", () => {
    const out = migrate({
      saveVersion: 4, faveur: 10,
      diceLevel: 2, wingLevel: 1, graveurLevel: 0, coffreLevel: 1,
      templeArtifacts: { ivoire: true, double: true, noye: true }
    });
    // dés 130 + 189, aile 90, coffre 16 000, ivoire 300, double 1 200.
    expect(out.maisonRefund).toBe(17909);
    expect(out.faveur).toBe(10 + 17909);
    expect(out.templeArtifacts).toEqual({ noye: true });
    expect("diceLevel" in out).toBe(false);
    expect("coffreLevel" in out).toBe(false);
    expect(out.saveVersion).toBe(CURRENT_SAVE_VERSION);
  });

  it("une save sans achat de chance ne reçoit rien (et n'annonce rien)", () => {
    const out = migrate({ saveVersion: 4, faveur: 42, templeArtifacts: { voix: true } });
    expect(out.faveur).toBe(42);
    expect(out.maisonRefund).toBeUndefined();
  });

  it("l'hydratation garde le remboursement à annoncer et oublie les champs retirés", () => {
    const s = hydrateState({ ...MID_GAME_FIXTURE, saveVersion: 4, faveur: 0, wingLevel: 2 });
    expect(s.faveur).toBe(90 + 162);
    expect(s.maisonRefund).toBe(252);
    expect(s.wingLevel).toBeUndefined();
  });

  it("les vols offerts deviennent des montants (ids et anciens entiers)", () => {
    expect(migrateFreeFlights(["plume", "hecatombe", "inconnu"])).toEqual([4, 25]);
    expect(migrateFreeFlights(3)).toEqual([4, 4, 4]);
    expect(migrateFreeFlights([12, 0, "aile", -3])).toEqual([12, 10]);
  });
});

// ── Le vingt-et-un : double et refente sont des règles de base ───────────────
describe("La refente (règle de base depuis le lot 1)", () => {
  it("refusée sans paire", () => {
    dealBlackjack(4, { deck: [C("K"), C("9"), C("10"), C("6"), C("5")] });
    expect(blackjackHand().canSplit).toBe(false); // K-9 : pas une paire
    expect(splitBlackjack()).toBeNull();
    standBlackjack();
  });

  it("les figures se refendent entre elles (K-Q comptent 10-10), sans artefact", () => {
    dealBlackjack(4, { deck: [C("K"), C("Q"), C("9"), C("7"), C("5"), C("4"), C("2")] });
    expect(blackjackHand().canSplit).toBe(true);
  });

  it("refend en 2 mains, débite la 2e mise, résout main par main (net agrégé)", () => {
    // Donne 8-8 contre 9-7 (16). Refente → [8,2]=10 et [8,3]=11. L'oracle tire
    // le K → 26, crève : les DEUX mains gagnent ×2.
    dealBlackjack(4, { deck: [C("8"), C("8"), C("9"), C("7"), C("2"), C("3"), C("K")] });
    expect(state.faveur).toBe(FAVEUR_START - 4);
    const h = splitBlackjack();
    expect(h.split).toBe(true);
    expect(h.hands.length).toBe(2);
    expect(state.faveur).toBe(FAVEUR_START - 8); // la seconde mise est partie
    standBlackjack(); // main 1 → passe à la main 2
    expect(blackjackHand().active).toBe(1);
    standBlackjack(); // main 2 → l'oracle joue, tout se résout
    const out = blackjackLastOutcome();
    expect(out.results.map((r) => r.result)).toEqual(["win", "win"]);
    expect(out.faveurGain).toBe(16);
    expect(state.faveur).toBe(FAVEUR_START - 8 + 16);
  });

  it("un 21 en 2 cartes APRÈS refente paie comme un gain simple (pas un naturel)", () => {
    // As-As contre 9-8 (17, l'oracle reste). Refente → [A,K]=21 et [A,Q]=21.
    dealBlackjack(4, { deck: [C("A"), C("A"), C("9"), C("8"), C("K"), C("Q")] });
    splitBlackjack();
    standBlackjack();
    standBlackjack();
    const out = blackjackLastOutcome();
    expect(out.results.map((r) => r.result)).toEqual(["win", "win"]); // PAS "blackjack"
    expect(out.faveurGain).toBe(16); // ×2 par main
  });

  it("DAS : le double reste permis sur chaque main refendue", () => {
    // 8-8 contre 9-7. Refente → [8,3]=11 et [8,2]=10. Double sur la main 1 :
    // mise 8, tire le K → 21, passe. Main 2 : reste à 10. L'oracle tire la
    // dame → 26, crève : main 1 rend 16, main 2 rend 8.
    dealBlackjack(4, { deck: [C("8"), C("8"), C("9"), C("7"), C("3"), C("2"), C("K"), C("Q")] });
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

// ── Les reliques : les tables financent la cité ──────────────────────────────
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

  it("lot 3 : une relique à chaque ×10 du prix, chaque nouvelle ×1,25 (les sept : ×19,5)", () => {
    const tresor = artifactTree().find((l) => l.id === "tresor");
    expect(tresor.nodes.map((n) => [n.id, n.cost])).toEqual([
      ["char", 1e6], ["lyre", 1e7], ["miroir", 1e8], ["corne", 1e9], ["toison", 1e10], ["pomme", 1e11], ["oeil", 1e12]
    ]);
    state.templeArtifacts = { lyre: true };
    expect(templeRelicProdMult()).toBeCloseTo(1.25, 12);
    state.templeArtifacts = { char: true, lyre: true, miroir: true, corne: true, toison: true, pomme: true, oeil: true };
    expect(templeRelicProdMult()).toBeCloseTo(RELIC_CORNE_PROD_MULT * RELIC_OEIL_PROD_MULT * Math.pow(1.25, 4), 9);
    // L'échelle : la Lyre suit le Char, la Corne suit le Miroir.
    state.templeArtifacts = {};
    state.faveur = 2e9;
    expect(buyArtifactNode("lyre")).toBe(false);
    expect(buyArtifactNode("char")).toBe(true);
    expect(buyArtifactNode("lyre")).toBe(true);
    expect(buyArtifactNode("corne")).toBe(false);
    expect(buyArtifactNode("miroir")).toBe(true);
    expect(buyArtifactNode("corne")).toBe(true);
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
