"use strict";
// Boutique de Faveur (couche 2) — dépenser la Faveur gagnée aux tables.
// Lot 1 des gains « vrai casino » (2026-10-04, docs/PLAN-GAINS-CASINO.md) : plus rien
// ne s'y achète qui touche aux CHANCES. Les dés pipés, les ailes cirées, les planches
// du graveur et les Coffres ont disparu (la Faveur qu'ils ont coûtée est rendue par
// la migration 4 → 5, cf. maisonTable.test.js). Restent :
//   • Bénédiction : +prod TEMPORAIRE (crisisProductionMultiplier), expire, reset au
//     cycle — au prix de 30 min de recettes de la Maison (blessingCost), qui suit
//     l'ère RECORD de la ville ;
//   • Stylet du sacristain : augment de GESTE au gratteux, par niveaux, ÉTERNEL
//     (survit à l'effondrement et au Grand Reset).

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  state, setState, hydrateState, invalidateRenderCache, resetTemporaryRunState, buildGrandResetState,
  CURRENT_SAVE_VERSION
} from "../state.js";
import {
  buyFaveurItem, buyTempleArtifact, faveurShopItems, blessingMultiplier, blessingCost, recettesPerHour,
  icarusEffectiveEdge, auguryRiteOdds, auguryPaytable
} from "../actions.js";
import { crisisProductionMultiplier } from "../mechanics/production/crisisLevers.js";
import {
  BLESSING_MULT, BLESSING_DURATION_S, BLESSING_COST_H,
  STYLET_MAX_LEVEL, STYLET_COST_BASE, STYLET_COST_GROWTH,
  ICARUS_EDGE, AUGURY_RTP, AUGURY_RITE_BETS
} from "../balance.js";
import { MID_GAME_FIXTURE, FIXED_NOW } from "./fixtures.js";

const FAVEUR_START = 100000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
  setState(hydrateState(MID_GAME_FIXTURE));
  state.faveur = FAVEUR_START; // de quoi acheter
  state.templeArtifacts = {};
  invalidateRenderCache("all");
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Boutique — l'étal (faveurShopItems)", () => {
  it("ne propose plus que la Bénédiction, à son prix courant", () => {
    const items = faveurShopItems();
    expect(items.map((i) => i.id)).toEqual(["blessing"]);
    const b = items[0];
    expect(b.kind).toBe("blessing");
    expect(b.cost).toBe(blessingCost());
    expect(b.cost).toBe(Math.round(recettesPerHour() * BLESSING_COST_H)); // 30 min de recettes
    expect(b.canAfford).toBe(true);
    expect(b.active).toBe(false);
    expect(b.endsAt).toBe(0);
    state.faveur = b.cost - 1;
    expect(faveurShopItems()[0].canAfford).toBe(false);
    state.faveur = b.cost;
    expect(faveurShopItems()[0].canAfford).toBe(true);
    buyFaveurItem("blessing");
    const apres = faveurShopItems()[0];
    expect(apres.active).toBe(true);
    expect(apres.endsAt).toBe(FIXED_NOW + BLESSING_DURATION_S * 1000);
  });

  it("les achats de CHANCES ont disparu : refusés, rien n'est débité", () => {
    for (const id of ["dice", "wing", "graveur", "coffre", "bidon"]) {
      expect(buyFaveurItem(id)).toBe(false);
    }
    // Le dé d'ivoire et les Coffres ne sont plus des artefacts ; le double et la
    // refente du vingt-et-un sont devenus des règles de base.
    for (const id of ["dice", "wing", "ivoire", "coffre", "double", "refente"]) {
      expect(buyTempleArtifact(id)).toBe(false);
    }
    expect(state.faveur).toBe(FAVEUR_START);
    expect(state.templeArtifacts).toEqual({});
    expect(state.diceLevel).toBeUndefined();
    expect(state.wingLevel).toBeUndefined();
  });

  it("les cotes sont FIXES : un vieux niveau de dés ou d'ailes n'y touche plus", () => {
    // Save trafiquée (ou d'avant la migration) : les anciens niveaux ne sont plus
    // lus par personne. Les osselets gardent leur chance, Icare son edge de 3 %.
    state.diceLevel = 13;
    state.wingLevel = 8;
    expect(auguryRiteOdds("classique")).toBe(AUGURY_RITE_BETS.classique.p);
    expect(auguryPaytable("prayForRain", "classique").rtp).toBeCloseTo(AUGURY_RTP, 12);
    expect(icarusEffectiveEdge()).toBe(ICARUS_EDGE);
  });
});

describe("Boutique — bénédiction (prod temporaire)", () => {
  it("active un multiplicateur de production, expire, et cumule en durée", () => {
    const cost = blessingCost();
    const depense = state.chronicleStats.faveurSpentShop;
    expect(blessingMultiplier()).toBe(1);
    expect(crisisProductionMultiplier("food")).toBeCloseTo(1, 10);
    expect(buyFaveurItem("blessing")).toBe(true);
    expect(state.faveur).toBe(FAVEUR_START - cost);
    expect(state.chronicleStats.faveurSpentShop).toBe(depense + cost); // registre de la Chronique
    expect(blessingMultiplier()).toBeCloseTo(BLESSING_MULT, 10);
    expect(crisisProductionMultiplier("food")).toBeCloseTo(BLESSING_MULT, 10);

    // Re-achat pendant qu'elle est active → PROLONGE (cumule la durée).
    expect(buyFaveurItem("blessing")).toBe(true);
    expect(state.faveur).toBe(FAVEUR_START - 2 * cost);
    expect(state.blessingUntil).toBe(FIXED_NOW + 2 * BLESSING_DURATION_S * 1000);

    // Après expiration : retour à 1.
    vi.advanceTimersByTime(2 * BLESSING_DURATION_S * 1000 + 1000);
    expect(blessingMultiplier()).toBe(1);
    expect(crisisProductionMultiplier("food")).toBeCloseTo(1, 10);
  });

  it("refuse l'achat sans assez de Faveur ; au prix exact, passe", () => {
    const cost = blessingCost();
    state.faveur = cost - 1;
    expect(buyFaveurItem("blessing")).toBe(false);
    expect(state.faveur).toBe(cost - 1);
    expect(state.blessingUntil || 0).toBe(0);
    state.faveur = cost;
    expect(buyFaveurItem("blessing")).toBe(true);
    expect(state.faveur).toBe(0);
  });

  it("son prix suit l'ère RECORD de la ville : 60 à l'Ère II, puis 30 min de recettes", () => {
    state.bestEraIndex = 2;
    expect(blessingCost()).toBe(60);              // l'ancien prix fixe, à l'ouverture de la Maison
    state.bestEraIndex = 10;
    expect(blessingCost()).toBe(1123);            // Bourg des artisans : 2 247 recettes/h
    expect(faveurShopItems()[0].cost).toBe(1123); // l'étal affiche le prix courant
    state.bestEraIndex = 20;
    expect(blessingCost()).toBe(Math.round(recettesPerHour() * BLESSING_COST_H)); // ~31 000
    // L'achat débite le prix COURANT.
    state.bestEraIndex = 10;
    expect(buyFaveurItem("blessing")).toBe(true);
    expect(state.faveur).toBe(FAVEUR_START - 1123);
    // L'ère RECORD, pas la ville du moment : un effondrement ne fait pas baisser le prix…
    resetTemporaryRunState(state);
    expect(blessingCost()).toBe(1123);
    // … le Grand Reset, si : l'ère record retombe, le prix avec elle.
    setState(buildGrandResetState(2));
    expect(blessingCost()).toBe(60);
  });
});

describe("Boutique — le stylet (augment à niveaux)", () => {
  it("s'achète par niveaux à coût croissant, plafonné au max", () => {
    let attendu = FAVEUR_START;
    for (let niveau = 0; niveau < STYLET_MAX_LEVEL; niveau += 1) {
      const cost = Math.round(STYLET_COST_BASE * Math.pow(STYLET_COST_GROWTH, niveau)); // 120, 204, 347
      expect(buyFaveurItem("stylet")).toBe(true);
      attendu -= cost;
      expect(state.styletLevel).toBe(niveau + 1);
      expect(state.faveur).toBe(attendu);
    }
    expect(buyFaveurItem("stylet")).toBe(false); // plafonné
    expect(state.faveur).toBe(attendu);
  });

  it("refuse le niveau sans assez de Faveur", () => {
    state.faveur = STYLET_COST_BASE - 1;
    expect(buyFaveurItem("stylet")).toBe(false);
    expect(state.styletLevel).toBe(0);
    expect(state.faveur).toBe(STYLET_COST_BASE - 1);
  });
});

describe("Boutique — persistance", () => {
  it("le stylet SURVIT à l'effondrement, la bénédiction est effacée", () => {
    buyFaveurItem("stylet");
    buyFaveurItem("blessing");
    resetTemporaryRunState(state);
    expect(state.styletLevel).toBe(1);     // permanent
    expect(state.blessingUntil).toBe(0);   // temporaire → effacé
    expect(state.blessingMult).toBe(1);
    expect(blessingMultiplier()).toBe(1);
  });

  it("le stylet SURVIT au Grand Reset (augment ÉTERNEL), la Faveur se re-gagne", () => {
    state.styletLevel = 2;
    state.faveur = 500;
    const fresh = buildGrandResetState(2);
    expect(fresh.styletLevel).toBe(2);    // augment éternel (GR_PERSISTENT_FIELDS)
    expect(fresh.faveur).toBe(0);         // le carburant se re-gagne à chaque cycle GR
    expect(fresh.blessingUntil).toBe(0);
  });

  it("hydratation : bénédiction re-typée, stylet borné, les niveaux supprimés oubliés", () => {
    // Save déjà au format courant : les champs retirés ne sont que du bruit (rien à
    // rembourser, cf. la migration 4 → 5 pour les vraies saves d'avant le lot 1).
    const s = hydrateState({
      saveVersion: CURRENT_SAVE_VERSION, faveur: 500,
      styletLevel: 99, blessingMult: 50, blessingUntil: -5,
      diceLevel: 4, wingLevel: 2, graveurLevel: 1, coffreLevel: 1
    });
    expect(s.styletLevel).toBe(STYLET_MAX_LEVEL);
    expect(s.blessingMult).toBe(10); // clamp finiteNumber max=10 : valeur EXACTE, pas une borne
    expect(s.blessingUntil).toBe(0);
    expect(s.faveur).toBe(500);
    expect(s.maisonRefund).toBe(0);
    for (const champ of ["diceLevel", "wingLevel", "graveurLevel", "coffreLevel"]) {
      expect(s[champ]).toBeUndefined();
    }
  });
});
