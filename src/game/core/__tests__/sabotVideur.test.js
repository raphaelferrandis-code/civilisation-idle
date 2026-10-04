"use strict";
// LE SABOT ET LE VIDEUR DU VINGT-ET-UN (2026-10-04, lot 4 de docs/PLAN-NUIT-DES-PLAISIRS.md).

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { state, setState, hydrateState, invalidateRenderCache, CURRENT_SAVE_VERSION } from "../state.js";
import {
  dealBlackjack, standBlackjack, blackjackHand, blackjackSabot, vraiCompte, hiLo, RANKS, BLACKJACK_SUITS,
  __resetBlackjackForTests
} from "../actions/blackjack.js";
import { videurBarre, videurBarreMin, videurOeil } from "../actions/videur.js";
import { tableLimits } from "../actions/maisonTable.js";
import { BLACKJACK_SABOT_JEUX, BLACKJACK_SABOT_PENETRATION, VIDEUR_BANNI_MIN } from "../balance.js";
import { MID_GAME_FIXTURE, FIXED_NOW } from "./fixtures.js";

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
  setState(hydrateState(MID_GAME_FIXTURE));
  state.bestEraIndex = 10;
  state.faveur = 1e15;
  state.bjSoupcon = 0;
  state.bjMises = [];
  state.bjHaut = null;
  state.bjBas = null;
  state.bjAverti = false;
  state.bjBarreJusqua = 0;
  invalidateRenderCache("all");
  __resetBlackjackForTests();
  vi.spyOn(Math, "random").mockImplementation(mulberry32(11));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  __resetBlackjackForTests();
});

// Une main jouée sur-le-champ (le joueur reste) ; rend les cartes vues, ou null.
function main(mise) {
  const h = dealBlackjack(mise);
  if (!h) return null;
  const fin = h.resolved ? blackjackHand() : standBlackjack();
  return [...fin.hands.flatMap((x) => x.cards), ...fin.dealer];
}

describe("Le sabot", () => {
  it("un sabot entier compte zéro (Hi-Lo)", () => {
    let t = 0;
    for (let d = 0; d < BLACKJACK_SABOT_JEUX; d += 1) for (const s of BLACKJACK_SUITS) for (const r of RANKS) t += hiLo({ rank: r, suit: s });
    expect(t).toBe(0);
  });

  it("garde ses cartes d'une main à l'autre, jusqu'à la carte de coupe", () => {
    const { min, max } = tableLimits();
    const mise = Math.max(min, Math.floor(max / 20));
    const vues = new Map();
    let n = 0, mains = 0, compte = 0;
    // Le premier sabot : battu neuf à la première donne.
    let cartes = main(mise);
    expect(blackjackSabot().neuf).toBe(true);
    for (;;) {
      for (const c of cartes) { const k = c.rank; vues.set(k, (vues.get(k) || 0) + 1); n += 1; compte += hiLo(c); }
      mains += 1;
      // Le vrai compte que voit le moteur est celui des cartes sorties.
      const s = blackjackSabot();
      if (s.reste > 0) expect(vraiCompte() * ((BLACKJACK_SABOT_JEUX * 52 - n) / 52)).toBeCloseTo(compte, 6);
      cartes = main(mise);
      if (blackjackSabot().neuf) break; // la carte de coupe : un sabot neuf
    }
    // Aucune carte n'est sortie plus de fois qu'elle n'existe dans le sabot.
    for (const r of RANKS) expect(vues.get(r) || 0).toBeLessThanOrEqual(BLACKJACK_SABOT_JEUX * 4);
    // Le sabot a été joué jusqu'à la coupe (trois quarts), pas plus loin.
    const total = BLACKJACK_SABOT_JEUX * 52;
    expect(n).toBeGreaterThanOrEqual(Math.round(total * BLACKJACK_SABOT_PENETRATION));
    expect(n).toBeLessThan(Math.round(total * BLACKJACK_SABOT_PENETRATION) + 20);
    expect(mains).toBeGreaterThan(30);
  });
});

describe("Le videur", () => {
  it("un joueur qui varie ses mises au hasard n'est jamais inquiété", () => {
    const { min, max } = tableLimits();
    const petite = Math.max(min, Math.floor(max / 40)), grosse = petite * 5;
    const hasard = mulberry32(99);
    let oeil = 0;
    for (let i = 0; i < 1500; i += 1) {
      expect(main(hasard() < 0.15 ? grosse : petite)).not.toBeNull();
      if (videurOeil()) oeil += 1;
    }
    expect(videurBarre()).toBe(false);
    expect(oeil).toBe(0);
  });

  it("un compteur discret (deux fois plus sur un sabot riche) passe sous le radar", () => {
    const { min, max } = tableLimits();
    const petite = Math.max(min, Math.floor(max / 40)), grosse = petite * 2;
    for (let i = 0; i < 1500; i += 1) expect(main(vraiCompte() >= 2 ? grosse : petite)).not.toBeNull();
    expect(videurBarre()).toBe(false);
  });

  it("un compteur qui mise gros sur un sabot riche est raccompagné, et la table lui est fermée", () => {
    const { min, max } = tableLimits();
    const petite = Math.max(min, Math.floor(max / 40)), grosse = petite * 8;
    let mains = 0, vuOeil = false;
    while (!videurBarre() && mains < 2000) {
      const mise = vraiCompte() >= 2 ? grosse : petite;
      const r = main(mise);
      if (videurOeil()) vuOeil = true;
      if (r) mains += 1;
    }
    expect(videurBarre()).toBe(true);
    expect(vuOeil).toBe(true);
    expect(mains).toBeLessThan(600);
    expect(state.history.some((l) => l.includes("videur"))).toBe(true);
    // Fermée : la donne est refusée, la mise n'est pas prise.
    const f0 = state.faveur;
    expect(dealBlackjack(petite)).toBeNull();
    expect(state.faveur).toBe(f0);
    expect(videurBarreMin()).toBe(VIDEUR_BANNI_MIN);
    // Rouverte après la porte.
    vi.setSystemTime(Date.now() + VIDEUR_BANNI_MIN * 60 * 1000 + 1);
    expect(videurBarre()).toBe(false);
    expect(main(petite)).not.toBeNull();
  });

  it("le soupçon et la porte survivent à la sauvegarde", () => {
    state.bjSoupcon = 2.5;
    state.bjMises = [100, 100, 800];
    state.bjHaut = { m: 3.2, n: 9 };
    state.bjBas = { m: 1.1, n: 14 };
    state.bjBarreJusqua = FIXED_NOW + 1000;
    const s = hydrateState({ ...JSON.parse(JSON.stringify(state)), saveVersion: CURRENT_SAVE_VERSION });
    expect(s.bjSoupcon).toBe(2.5);
    expect(s.bjMises).toEqual([100, 100, 800]);
    expect(s.bjHaut).toEqual({ m: 3.2, n: 9 });
    expect(s.bjBas).toEqual({ m: 1.1, n: 14 });
    expect(s.bjBarreJusqua).toBe(FIXED_NOW + 1000);
  });
});
