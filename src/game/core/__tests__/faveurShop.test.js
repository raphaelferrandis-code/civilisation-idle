"use strict";
// Boutique de Faveur (couche 2) — dépenser la Faveur :
//   • Dés pipés   : +odds osselets PERMANENT (auguryBaseOdds), coût croissant, capé.
//   • Ailes cirées: −edge Icare PERMANENT (icarusEffectiveEdge), capé au plancher.
//   • Bénédiction : +prod TEMPORAIRE (crisisProductionMultiplier), expire, reset au cycle.
// Boosters permanents = survivent à l'effondrement ; bénédiction = effet de run.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { state, setState, hydrateState, invalidateRenderCache, resetTemporaryRunState, buildGrandResetState } from "../state.js";
import { buyFaveurItem, faveurShopItems, auguryBaseOdds, icarusEffectiveEdge, blessingMultiplier } from "../actions.js";
import { crisisProductionMultiplier } from "../mechanics/production/crisisLevers.js";
import {
  DICE_BOOST_STEP, DICE_BOOST_MAX_LEVEL, DICE_COST_BASE,
  WING_STEP, WING_MAX_LEVEL, ICARUS_EDGE, ICARUS_EDGE_FLOOR,
  BLESSING_MULT, BLESSING_COST, BLESSING_DURATION_S
} from "../balance.js";
import { MID_GAME_FIXTURE, FIXED_NOW } from "./fixtures.js";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
  setState(hydrateState(MID_GAME_FIXTURE));
  state.faveur = 100000; // de quoi acheter
  invalidateRenderCache("all");
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Boutique — dés pipés (odds osselets)", () => {
  it("monte les odds de +2 pts par niveau, coût croissant, spend Faveur", () => {
    const before = auguryBaseOdds("prayForRain");
    const f0 = state.faveur;
    expect(buyFaveurItem("dice")).toBe(true);
    expect(state.diceLevel).toBe(1);
    expect(state.faveur).toBe(f0 - DICE_COST_BASE);
    expect(auguryBaseOdds("prayForRain")).toBeCloseTo(before + DICE_BOOST_STEP, 10);
    // Coût du 2e niveau > 1er.
    const items = faveurShopItems();
    expect(items[0].cost).toBeGreaterThan(DICE_COST_BASE);
  });

  it("est plafonnée au niveau max", () => {
    for (let i = 0; i < DICE_BOOST_MAX_LEVEL + 3; i++) { state.faveur = 1e9; buyFaveurItem("dice"); }
    expect(state.diceLevel).toBe(DICE_BOOST_MAX_LEVEL);
    expect(faveurShopItems()[0].maxed).toBe(true);
    expect(buyFaveurItem("dice")).toBe(false);
  });
});

describe("Boutique — ailes cirées (edge Icare)", () => {
  it("abaisse l'edge par niveau, capé au plancher", () => {
    expect(icarusEffectiveEdge()).toBeCloseTo(ICARUS_EDGE, 10);
    buyFaveurItem("wing");
    expect(state.wingLevel).toBe(1);
    expect(icarusEffectiveEdge()).toBeCloseTo(ICARUS_EDGE - WING_STEP, 10);
    for (let i = 0; i < WING_MAX_LEVEL + 3; i++) { state.faveur = 1e9; buyFaveurItem("wing"); }
    expect(state.wingLevel).toBe(WING_MAX_LEVEL);
    expect(icarusEffectiveEdge()).toBeGreaterThanOrEqual(ICARUS_EDGE_FLOOR - 1e-9);
  });
});

describe("Boutique — bénédiction (prod temporaire)", () => {
  it("active un multiplicateur de production, expire, et cumule en durée", () => {
    expect(blessingMultiplier()).toBe(1);
    expect(crisisProductionMultiplier("food")).toBeCloseTo(1, 10);
    expect(buyFaveurItem("blessing")).toBe(true);
    expect(state.faveur).toBe(100000 - BLESSING_COST);
    expect(blessingMultiplier()).toBeCloseTo(BLESSING_MULT, 10);
    expect(crisisProductionMultiplier("food")).toBeCloseTo(BLESSING_MULT, 10);

    // Re-achat pendant qu'elle est active → PROLONGE (cumule la durée).
    buyFaveurItem("blessing");
    expect(state.blessingUntil).toBeCloseTo(FIXED_NOW + 2 * BLESSING_DURATION_S * 1000, -2);

    // Après expiration : retour à 1.
    vi.advanceTimersByTime(2 * BLESSING_DURATION_S * 1000 + 1000);
    expect(blessingMultiplier()).toBe(1);
    expect(crisisProductionMultiplier("food")).toBeCloseTo(1, 10);
  });

  it("refuse l'achat sans assez de Faveur", () => {
    state.faveur = BLESSING_COST - 1;
    expect(buyFaveurItem("blessing")).toBe(false);
    expect(state.blessingUntil || 0).toBe(0);
  });
});

describe("Boutique — persistance", () => {
  it("dés/ailes SURVIVENT à l'effondrement, la bénédiction est effacée", () => {
    buyFaveurItem("dice");
    buyFaveurItem("wing");
    buyFaveurItem("blessing");
    resetTemporaryRunState(state);
    expect(state.diceLevel).toBe(1);   // permanent
    expect(state.wingLevel).toBe(1);   // permanent
    expect(state.blessingUntil).toBe(0); // temporaire → effacé
    expect(state.blessingMult).toBe(1);
  });

  it("dés/ailes SURVIVENT au Grand Reset (augments ÉTERNELS), la Faveur se re-gagne", () => {
    state.diceLevel = 4;
    state.wingLevel = 2;
    state.faveur = 500;
    const fresh = buildGrandResetState(2);
    expect(fresh.diceLevel).toBe(4);   // augment éternel (GR_PERSISTENT_FIELDS)
    expect(fresh.wingLevel).toBe(2);   // augment éternel
    expect(fresh.faveur).toBe(0);      // le carburant se re-gagne à chaque cycle GR
  });

  it("hydratation : niveaux bornés, bénédiction re-typée", () => {
    const s = hydrateState({ diceLevel: 999, wingLevel: -3, blessingMult: 50, faveur: 500 });
    expect(s.diceLevel).toBe(DICE_BOOST_MAX_LEVEL);
    expect(s.wingLevel).toBe(0);
    expect(s.blessingMult).toBe(10); // clamp finiteNumber max=10 : valeur EXACTE, pas une borne
    expect(s.faveur).toBe(500);
  });
});
