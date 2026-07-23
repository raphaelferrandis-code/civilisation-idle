"use strict";
// ANATOMIE DU MULTIPLICATEUR GLOBAL (B2).
//
// La décomposition RECOPIE le produit de globalMultiplier au lieu de le
// partager : l'ordre des facteurs y est verrouillé bit-à-bit par
// decimal.parity et economy.golden, et refactoriser le produit pour le
// mutualiser déplacerait les derniers chiffres. Le prix de ce choix est une
// duplication qui peut dériver en silence — un 17e facteur ajouté au produit et
// oublié dans la décomposition, et l'écran mentirait sans que rien ne bronche.
//
// C'EST TOUT L'OBJET DE CE FICHIER : la porte qui rend la duplication tenable.

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";

import { state, setState, hydrateState, invalidateRenderCache } from "../state.js";
import { Decimal } from "../num.js";
import { globalMultiplier, globalMultiplierBreakdown } from "../mechanics.js";
import { MID_GAME_FIXTURE, FIXED_NOW } from "./fixtures.js";

// Les 16 facteurs du produit, DANS L'ORDRE. Toute modification de cette liste
// doit refléter une modification du produit de globalMultipliers.js, et
// réciproquement.
const CLES_ATTENDUES = [
  "ruins", "market", "roads", "infra", "recurringAge", "ruinEffects",
  "ruinTree", "unspentRuins", "grandReset", "icare", "atrides", "pact",
  "nextRunPenalty", "enee", "olympus", "fimbul"
];

const SCENARIOS = [
  { nom: "baseline mid-game", patch: () => {} },
  {
    nom: "arbre des ruines allumé (agrégat ruinTree ≠ 1)",
    patch: () => {
      state.upgrades.oral_tradition = true;
      state.upgrades.foundation_ghosts = true;
    }
  },
  {
    nom: "mythe du chaos (ruins et grandReset neutralisés à 1)",
    patch: () => { state.activeMythId = "mythe_du_chaos"; }
  },
  {
    nom: "valeurs hautes sous le plafond float",
    patch: () => {
      state.ruins = new Decimal("1e40");
      state.infrastructure = new Decimal("1e30");
    }
  }
];

beforeAll(() => {
  // globalScalarFactors lit Date.now() : fenêtres Atrides (120 s), Énée et
  // Cendres fertiles. Sans horloge figée, le total et les sous-facteurs
  // pourraient être calculés de part et d'autre d'une expiration.
  vi.spyOn(Date, "now").mockReturnValue(FIXED_NOW);
});

afterAll(() => { vi.restoreAllMocks(); });

beforeEach(() => { setState(hydrateState(MID_GAME_FIXTURE)); });

describe("globalMultiplierBreakdown — la pile se multiplie à son propre total", () => {
  for (const scenario of SCENARIOS) {
    it(scenario.nom, () => {
      scenario.patch();
      invalidateRenderCache("all");

      const { factors, product } = globalMultiplierBreakdown();
      const total = globalMultiplier();

      // LA porte anti-dérive. Un facteur ajouté au produit de
      // globalMultipliers.js sans être ajouté ici fait échouer cette ligne dès
      // qu'il vaut autre chose que 1.
      const ecart = Math.abs(product - total);
      expect(
        ecart <= 1e-12 * Math.max(1, Math.abs(total)),
        `produit de la pile=${product} total=${total} Δ=${ecart.toExponential(3)}`
      ).toBe(true);

      // Et le contrôle structurel, qui attrape le cas où le facteur oublié vaut
      // exactement 1 dans cette fixture : la liste des clés est figée.
      expect(factors.map((f) => f.key)).toEqual(CLES_ATTENDUES);
      for (const f of factors) {
        expect(typeof f.value, `${f.key} doit être un number`).toBe("number");
        expect(f.label, `${f.key} doit avoir un libellé`).toBeTruthy();
        expect(f.label.fr, `${f.key} doit avoir un libellé fr`).toBeTruthy();
        expect(f.label.en, `${f.key} doit avoir un libellé en`).toBeTruthy();
      }
    });
  }
});

describe("globalMultiplierBreakdown — l'Arbre des Ruines reste un seul facteur", () => {
  it("ses quatre composantes se multiplient à l'agrégat, sans entrer dans le produit", () => {
    // Les éclater dans le produit changerait l'associativité, donc les derniers
    // chiffres, donc les instantanés d'economy.golden. Ils sont exposés pour
    // l'affichage SEULEMENT, et cette égalité est ce qui rend l'affichage honnête.
    invalidateRenderCache("all");
    const { factors, parts } = globalMultiplierBreakdown();
    const agregat = factors.find((f) => f.key === "ruinTree").value;
    const produitDesParts = parts.reduce((acc, p) => acc * p.value, 1);
    expect(Math.abs(produitDesParts - agregat)).toBeLessThanOrEqual(1e-12 * Math.max(1, agregat));
    expect(parts.map((p) => p.key)).toEqual(["braise", "vestiges", "regrowth", "abyssDogma"]);
    for (const p of parts) expect(p.label?.fr, `${p.key} doit avoir un libellé`).toBeTruthy();
  });
});

describe("globalMultiplierBreakdown — le débordement se voit au lieu de se taire", () => {
  it("un facteur non fini rend le produit non fini, il n'est pas silencieusement remplacé", () => {
    // En fin de partie ruins^0.62 déborde le float et rates() bascule sur le
    // chemin Decimal. L'écran doit pouvoir DIRE que le nombre a quitté le
    // domaine, pas afficher « inf » ni un total bricolé.
    // 1e308 ne suffit PAS : ruins^0.62 y vaut encore 1e191, parfaitement fini.
    // Le débordement demande ruins > 10^(308/0.62), soit ~1e497.
    state.ruins = new Decimal("1e600");
    state.infrastructure = new Decimal("1e600");
    invalidateRenderCache("all");

    const { factors, product } = globalMultiplierBreakdown();
    const nonFinis = factors.filter((f) => !Number.isFinite(f.value));
    expect(nonFinis.length, "au moins un facteur doit déborder à ce niveau").toBeGreaterThan(0);
    expect(Number.isFinite(product)).toBe(false);
    // Et le total du moteur déborde de la même façon : l'écran ne peut pas
    // afficher un fini là où le jeu calcule un infini.
    expect(Number.isFinite(globalMultiplier())).toBe(false);
  });
});
