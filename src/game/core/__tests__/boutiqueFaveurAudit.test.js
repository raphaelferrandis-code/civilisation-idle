"use strict";
// Boutique de Faveur — deux trouvailles de l'audit du 2026-10-05 :
//   BUG-68 : avec le Char du Soleil (Bénédiction permanente), la Bénédiction
//            restait en vente et coûtait 30 min de recettes pour rien ;
//   BUG-69 : les héritages payés en Faveur (buyUpgrade) échappaient au registre
//            « Faveur dépensée à la Boutique » de la Chronique.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { state, setState, hydrateState, invalidateRenderCache, setGamePaused, setCollapseInProgress } from "../state.js";
import { buyFaveurItem, faveurShopItems, blessingMultiplier } from "../actions/faveurShop.js";
import { buyUpgrade } from "../actions/building.js";
import { upgradeById } from "../state.js";
import { BLESSING_MULT, FAVEUR_ECHELLE } from "../balance.js";
import { MID_GAME_FIXTURE, FIXED_NOW } from "./fixtures.js";

const FAVEUR_START = 100000 * FAVEUR_ECHELLE;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
  setState(hydrateState(MID_GAME_FIXTURE));
  setGamePaused(false);
  setCollapseInProgress(false);
  state.faveur = FAVEUR_START;
  state.templeArtifacts = {};
  invalidateRenderCache("all");
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Bénédiction et Char du Soleil (BUG-68)", () => {
  it("sans le Char : en vente, achetable", () => {
    expect(faveurShopItems()[0].maxed).toBe(false);
    expect(buyFaveurItem("blessing")).toBe(true);
    expect(state.faveur).toBeLessThan(FAVEUR_START);
  });

  it("avec le Char : « Complet », refusée sans débit ni Bénédiction « en cours »", () => {
    state.templeArtifacts = { char: true };
    expect(blessingMultiplier()).toBe(BLESSING_MULT); // déjà permanente
    expect(faveurShopItems()[0].maxed).toBe(true);
    expect(buyFaveurItem("blessing")).toBe(false);
    expect(state.faveur).toBe(FAVEUR_START);
    // Pas de blessingUntil posé : la clepsydre (refus « bonus ») reste libre.
    expect((state.blessingUntil || 0) > Date.now()).toBe(false);
    expect(blessingMultiplier()).toBe(BLESSING_MULT);
  });
});

describe("héritages payés en Faveur au registre de la Chronique (BUG-69)", () => {
  it("buyUpgrade d'un héritage en Faveur compte la dépense à la Boutique", () => {
    const id = "conservateurs_ruines";
    const cost = upgradeById[id].cost.faveur;
    expect(cost).toBeGreaterThan(0);
    const before = state.chronicleStats?.faveurSpentShop || 0;
    expect(buyUpgrade(id)).toBe(true);
    expect(state.chronicleStats.faveurSpentShop).toBe(before + cost);
    expect(state.faveur).toBe(FAVEUR_START - cost);
  });

  it("un achat refusé ne compte rien", () => {
    state.faveur = 0;
    const before = state.chronicleStats?.faveurSpentShop || 0;
    expect(buyUpgrade("conservateurs_ruines")).toBe(false);
    expect(state.chronicleStats?.faveurSpentShop || 0).toBe(before);
  });
});
