"use strict";
// LES COMPTES DE LA CITÉ (B3).
//
// Le bilan ne rejoue PAS la longue queue de multiplicateurs de rates() : il
// calcule des PARTS sur les bases et les applique au débit réel. Deux choses
// peuvent donc mentir, et deux seulement :
//
//   1. la somme des lignes ne retombe pas sur le débit affiché — l'écran
//      contredirait alors le nombre lisible en haut, ce qui est précisément le
//      travers que l'arbitrage sur le dénominateur voulait éviter ;
//   2. la RÉPARTITION est fausse — la somme tombe juste mais l'attribution
//      entre bâtiments est décalée, parce que ma recomposition de la base a
//      dérivé de celle du moteur (une synergie oubliée, Babel appliqué à la
//      mauvaise catégorie, le bonus d'Héphaïstos posé sur la mauvaise
//      ressource). Ce cas est SILENCIEUX, et c'est le vrai sujet de ce fichier.
//
// Le point 2 se verrouille par le socle : sur un état SANS aucun bâtiment, le
// socle est à lui seul 100 % du débit, donc sa formule est confrontée au moteur.

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";

import { state, setState, defaultState, hydrateState, invalidateRenderCache } from "../state.js";
import { Decimal, toNum } from "../num.js";
import { rates } from "../mechanics.js";
import { getBuildingSums } from "../mechanics/production/buildingOutput.js";
import { productionBreakdown, BREAKDOWN_RESOURCES } from "../mechanics/production/productionBreakdown.js";
import { MID_GAME_FIXTURE, FIXED_NOW } from "./fixtures.js";

const proche = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

beforeAll(() => { vi.spyOn(Date, "now").mockReturnValue(FIXED_NOW); });
afterAll(() => { vi.restoreAllMocks(); });
beforeEach(() => { setState(hydrateState(MID_GAME_FIXTURE)); invalidateRenderCache("all"); });

describe("productionBreakdown — la somme retombe sur le débit affiché", () => {
  for (const res of BREAKDOWN_RESOURCES) {
    it(`${res} : lignes + socle + additif = rates().${res}`, () => {
      const { rows, socle, additif, total, degrade } = productionBreakdown(res);
      if (degrade) {
        // Débit nul ou non fini : on n'invente pas de parts.
        expect(rows.every((r) => r.value === 0)).toBe(true);
        return;
      }
      const somme = rows.reduce((acc, r) => acc + r.value, 0) + socle.value + additif;
      expect(proche(somme, total), `${res} : somme=${somme} total=${total}`).toBe(true);
      expect(proche(total, toNum(rates()[res]))).toBe(true);
    });
  }

  it("les parts font 1", () => {
    const { rows, socle, degrade } = productionBreakdown("food");
    expect(degrade).toBe(false);
    const parts = rows.reduce((acc, r) => acc + r.share, 0) + socle.share;
    expect(proche(parts, 1)).toBe(true);
  });

  it("les lignes sont classées de la plus grosse à la plus petite", () => {
    const { rows } = productionBreakdown("food");
    for (let i = 1; i < rows.length; i++) expect(rows[i - 1].value).toBeGreaterThanOrEqual(rows[i].value);
  });
});

// ── LES DEUX ANCRAGES SUR LE MOTEUR ─────────────────────────────────────────
// Sans eux, tout ce fichier serait décoratif, et je l'ai vérifié : une première
// version passait 14/14 alors que j'avais SUPPRIMÉ la synergie de jalon du
// calcul, puis faussé la formule du socle. Les deux dérives étaient invisibles
// parce que les tests confrontaient le bilan à LUI-MÊME — les parts somment à 1
// et retombent sur le total quelle que soit la base, c'est le principe même de
// la mise à l'échelle. Il faut comparer les bases BRUTES à ce que le moteur
// calcule de son côté.

describe("ancrage 1 — la base par catégorie égale celle du moteur", () => {
  it("chaque catégorie de getBuildingSums est retrouvée bâtiment par bâtiment", () => {
    // getBuildingSums est LA somme que rates() consomme. Si ma recomposition
    // par bâtiment oublie un facteur (synergie de jalon, rives fécondes), les
    // deux divergent ici, et seulement ici.
    const sums = getBuildingSums();
    expect(sums.overflow, "fixture attendue sous le plafond float").toBe(false);

    for (const res of BREAKDOWN_RESOURCES) {
      const champ = { population: "pop", food: "food", gold: "gold", knowledge: "knowledge", infrastructure: "infra" }[res];
      const { rows } = productionBreakdown(res);
      const parCategorie = {};
      for (const r of rows) parCategorie[r.category] = (parCategorie[r.category] || 0) + r.base;

      for (const [cat, catSums] of Object.entries(sums.baseSumsByCategory)) {
        const attendu = catSums[champ];
        const obtenu = parCategorie[cat] || 0;
        expect(
          proche(obtenu, attendu, 1e-9),
          `${res} / ${cat} : bilan=${obtenu} moteur=${attendu}`
        ).toBe(true);
      }
    }
  });
});

describe("ancrage 2 — la formule du socle est confrontée au débit du moteur", () => {
  it("sur un état neuf sans bâtiment, la base du socle EST le débit de Nourriture", () => {
    // Mesuré : sur defaultState sans bâtiment, la queue de la Nourriture vaut
    // exactement 1, donc rates().food est le socle NU. C'est ce qui permet de
    // comparer ma formule au moteur sans la comparer à elle-même.
    setState(defaultState());
    for (const id of Object.keys(state.buildings)) state.buildings[id] = 0;
    invalidateRenderCache("all");

    const { socle, rows } = productionBreakdown("food");
    expect(rows.length, "aucun bâtiment ne doit contribuer").toBe(0);
    expect(
      proche(socle.base, toNum(rates().food), 1e-12),
      `socle=${socle.base} débit du moteur=${toNum(rates().food)}`
    ).toBe(true);
  });

  it("sans aucun bâtiment, le socle porte tout le débit", () => {
    for (const id of Object.keys(state.buildings)) state.buildings[id] = 0;
    invalidateRenderCache("all");

    for (const res of ["population", "food"]) {
      const { rows, socle, total, degrade } = productionBreakdown(res);
      expect(degrade, `${res} devrait produire quelque chose`).toBe(false);
      expect(rows.length, `${res} : aucun bâtiment ne doit contribuer`).toBe(0);
      expect(proche(socle.value, total), `${res} : socle=${socle.value} total=${total}`).toBe(true);
    }
  });

  it("le Savoir et l'Infrastructure n'ont AUCUN socle", () => {
    // rates.js démarre knowledge et infra à 0 : leur inventer un socle
    // décalerait toutes les parts de ces deux ressources.
    for (const res of ["knowledge", "infrastructure"]) {
      expect(productionBreakdown(res).socle.value).toBe(0);
    }
  });

  it("l'Or n'a pas de socle sous 25 habitants", () => {
    state.population = new Decimal(10);
    invalidateRenderCache("all");
    expect(productionBreakdown("gold").socle.value).toBe(0);
  });
});

describe("productionBreakdown — la théocratie ne se met pas à l'échelle", () => {
  it("elle sort du lot en ligne séparée, car elle s'AJOUTE après le multiplicateur", () => {
    state.upgrades.trait_theocracy = true;
    state.gold = new Decimal(100000);
    invalidateRenderCache("all");

    const { rows, socle, additif, total } = productionBreakdown("knowledge");
    expect(additif).toBeGreaterThan(0);
    // Sans traitement à part, ce terme serait réparti entre les bâtiments et
    // chacun se verrait attribuer du Savoir qu'il ne produit pas.
    const somme = rows.reduce((acc, r) => acc + r.value, 0) + socle.value + additif;
    expect(proche(somme, total)).toBe(true);
  });
});

describe("productionBreakdown — cas dégradés", () => {
  it("un débit nul ne produit ni NaN ni part inventée", () => {
    // Énée dégradé met la Nourriture et l'Or à zéro.
    state.activeMythId = "mythe_d_enee";
    state.eneeDegraded = true;
    invalidateRenderCache("all");

    const b = productionBreakdown("food");
    expect(b.degrade).toBe(true);
    expect(b.rows.every((r) => Number.isFinite(r.value) && r.value === 0)).toBe(true);
    expect(Number.isFinite(b.socle.value)).toBe(true);
  });

  it("une ressource inconnue lève au lieu de rendre du vide", () => {
    expect(() => productionBreakdown("faveur")).toThrow(/ressource inconnue/);
  });

  it("aucune ligne ne porte de valeur non finie, même très haut", () => {
    state.ruins = new Decimal("1e40");
    state.infrastructure = new Decimal("1e30");
    invalidateRenderCache("all");
    for (const res of BREAKDOWN_RESOURCES) {
      const { rows, socle } = productionBreakdown(res);
      for (const r of rows) expect(Number.isFinite(r.value), `${res}/${r.key}`).toBe(true);
      expect(Number.isFinite(socle.value)).toBe(true);
    }
  });
});
