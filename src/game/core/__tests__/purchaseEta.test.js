"use strict";
// DÉLAI AVANT ACHAT (B5). Ce qui se teste ici, c'est que le délai ne MENT jamais :
// ni « imminent » sur une cible sans revenu, ni « ∞ » sur une cible qui arrive.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { state, setState, hydrateState, invalidateRenderCache } from "../state.js";
import { purchaseEta, ETA_READY, ETA_NO_INCOME, ETA_SECONDS, ETA_UNREACHABLE, ETA_MAX_SECONDS } from "../mechanics/purchaseEta.js";
import { rates } from "../mechanics/production/rates.js";
import { quantizeEta, fmtEta, fmtSecs } from "../utils.js";
import { setLang } from "../i18n.js";
import { D } from "../num.js";

beforeEach(() => {
  setState(hydrateState({}));
  state.instability = 0.1;
  // Les taux sont mis en cache par frame : sans invalidation, un test lit le
  // cache du précédent et les assertions deviennent aléatoires selon l'ordre.
  invalidateRenderCache("all");
});

describe("purchaseEta — le délai ne ment pas", () => {
  it("dit READY quand tout est déjà payable", () => {
    state.food = D(1000);
    expect(purchaseEta({ food: D(10) }).kind).toBe(ETA_READY);
  });

  it("chiffre le délai au débit courant", () => {
    // 100 cueilleurs produisent une nourriture bien réelle ; on mesure contre
    // le vrai rates() plutôt que d'inventer un débit.
    state.buildings = { ...state.buildings, foragers: 100 };
    state.food = D(0);
    invalidateRenderCache("all");
    const res = purchaseEta({ food: D(1000) });
    expect(res.kind).toBe(ETA_SECONDS);
    expect(res.seconds).toBeGreaterThan(0);
    expect(Number.isFinite(res.seconds)).toBe(true);
  });

  it("REFUSE de dire « imminent » sur une devise sans revenu (division par zéro)", () => {
    // Le piège : break_infinity rend Decimal(0) sur x/0, pas Infinity. Sans le
    // garde, ce cas donnerait 0 seconde, donc « achetable tout de suite ».
    expect(D(100).div(D(0)).toNumber()).toBe(0); // le piège, verrouillé
    state.buildings = Object.fromEntries(Object.keys(state.buildings).map((k) => [k, 0]));
    state.population = D(1); // sous 25 → l'Or vaut exactement 0/s (rates.js)
    state.gold = D(0);
    invalidateRenderCache("all");
    const res = purchaseEta({ gold: D(500) });
    expect(res.kind).toBe(ETA_NO_INCOME);
    expect(res.currency).toBe("gold");
  });

  it("traite les Ruines comme une devise sans revenu : rates() n'en produit aucune", () => {
    // ruin_architects se paie en partie en Ruines (extraCost). Elles arrivent
    // par effondrement, jamais par un débit — donc jamais d'ETA chiffré.
    state.ruins = D(0);
    const res = purchaseEta({ ruins: D(85) });
    expect(res.kind).toBe(ETA_NO_INCOME);
    expect(res.currency).toBe("ruins");
  });

  it("garde le MAXIMUM des devises et non la moyenne", () => {
    state.buildings = { ...state.buildings, foragers: 200, scribes: 50 };
    state.food = D(0);
    state.knowledge = D(0);
    invalidateRenderCache("all");
    const seule = purchaseEta({ knowledge: D(1e6) });
    const deux = purchaseEta({ food: D(1), knowledge: D(1e6) });
    expect(deux.kind).toBe(ETA_SECONDS);
    expect(deux.seconds).toBe(seule.seconds); // la plus lente commande
  });

  it("cesse de chiffrer au-delà du plafond au lieu d'annoncer 61 millions de jours", () => {
    // Cas vu en jeu : « payable dans 61638217 j 1 h ». Exact, et inutile — à ce
    // régime la réponse est de faire grandir la production, pas d'attendre.
    state.buildings = { ...state.buildings, foragers: 1 };
    state.food = D(0);
    invalidateRenderCache("all");
    expect(purchaseEta({ food: D("1e30") }).kind).toBe(ETA_UNREACHABLE);
    expect(purchaseEta({ food: D("1e400") }).kind).toBe(ETA_UNREACHABLE);
  });

  it("chiffre encore juste SOUS le plafond : la coupure ne mange pas de délai tenable", () => {
    state.buildings = { ...state.buildings, foragers: 100 };
    state.food = D(0);
    invalidateRenderCache("all");
    const r = rates();
    // Une cible atteignable en ~1 h doit rester chiffrée.
    const cible = D(r.food).mul(3600);
    const res = purchaseEta({ food: cible });
    expect(res.kind).toBe(ETA_SECONDS);
    expect(res.seconds).toBeGreaterThan(3000);
    expect(res.seconds).toBeLessThan(ETA_MAX_SECONDS);
  });

  it("ignore les devises déjà couvertes", () => {
    state.buildings = { ...state.buildings, foragers: 100 };
    state.food = D(1e9);
    state.gold = D(0);
    state.population = D(1); // Or à 0/s
    invalidateRenderCache("all");
    // La nourriture est couverte : elle ne doit pas masquer le manque d'Or.
    expect(purchaseEta({ food: D(10), gold: D(1) }).kind).toBe(ETA_NO_INCOME);
  });
});

describe("quantification — c'est elle qui protège la mémoïsation de la boutique", () => {
  it("arrondit au pas supérieur : 5 s, puis la minute, puis l'heure", () => {
    expect(quantizeEta(1)).toBe(5);
    expect(quantizeEta(5)).toBe(5);
    expect(quantizeEta(6)).toBe(10);
    expect(quantizeEta(59)).toBe(60);
    expect(quantizeEta(61)).toBe(120);
    expect(quantizeEta(3599)).toBe(3600);
    expect(quantizeEta(3601)).toBe(7200);
  });

  it("un délai qui décroît d'une seconde ne change PAS le libellé", () => {
    // C'est l'invariant de perf : la signature d'abonnement est bâtie sur le
    // libellé. S'il bougeait chaque seconde, la boutique se re-rendrait à 1 Hz.
    expect(fmtEta(600)).toBe(fmtEta(599));
    expect(fmtEta(42)).toBe(fmtEta(41));
  });

  it("ne rend jamais « 0 s »", () => {
    expect(fmtEta(0)).toBe("5 s");
    expect(fmtEta(-10)).toBe("5 s");
  });
});

describe("fmtSecs et fmtEta parlent la langue du joueur", () => {
  afterEach(() => setLang("fr"));

  it("fmtSecs traduit, au lieu du français en dur dans une phrase anglaise", () => {
    setLang("fr");
    expect(fmtSecs(30)).toBe("moins d'1 min");
    expect(fmtSecs(86400 + 3600)).toBe("1 j 1 h");
    setLang("en");
    expect(fmtSecs(30)).toBe("less than 1 min");
    expect(fmtSecs(86400 + 3600)).toBe("1 d 1 h");
  });

  it("fmtEta délègue à fmtSecs au-dessus de la minute : une seule écriture des heures", () => {
    setLang("fr");
    expect(fmtEta(7200)).toBe(fmtSecs(7200));
    setLang("en");
    expect(fmtEta(7200)).toBe(fmtSecs(7200));
  });
});
