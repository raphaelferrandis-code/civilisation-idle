"use strict";
// PAS DES JALONS (B8). `milestoneStepSize()` tombe de 25 à 20 avec le capstone
// « Ville-Monde ». L'ACHAT lisait déjà la bonne valeur, mais deux autres
// endroits la codaient en dur à 25 : la barre de progression de la boutique et
// le seuil de la Chronique. Résultat, une fois le capstone acquis, l'affichage
// et le journal sautaient un palier sur cinq pendant que le jeu, lui, les
// appliquait. Cette suite interdit qu'un 25 en dur revienne.

import { describe, it, expect, beforeEach } from "vitest";

import { state, setState, defaultState, hydrateState, renderCache } from "../state.js";
import { milestoneStepSize, stepBuyAmount, buildingBatchCost } from "../mechanics.js";
import { chronicleBuilding } from "../actions/utils.js";
import { buildings } from "../../data/buildings.js";

const anyBuilding = buildings.find((b) => b.id !== "watch" && b.id !== "bureaucracy");

function grantCapstone(on) {
  state.upgrades = on ? { ville_monde: true } : {};
  // La mémo des effets de ruines est indexée sur la signature des upgrades
  // possédées : elle se réinvalide donc seule, mais on la nettoie par sûreté.
  renderCache.cachedRuinEffects = null;
  renderCache.cachedRuinEffectsSignature = null;
}

// Nombre de lignes de Chronique produites par un achat qui mène à `newCount`.
function linesFor(newCount, amount = 1) {
  state.history = [];
  chronicleBuilding(anyBuilding, newCount - amount, newCount);
  return state.history.length;
}

beforeEach(() => {
  setState(defaultState());
  state.history = [];
});

describe("milestoneStepSize — source unique du pas", () => {
  it("vaut 25 sans le capstone", () => {
    grantCapstone(false);
    expect(milestoneStepSize()).toBe(25);
  });

  it("tombe à 20 avec Ville-Monde", () => {
    grantCapstone(true);
    expect(milestoneStepSize()).toBe(20);
  });
});

describe("chronicleBuilding — le journal suit le pas réel", () => {
  it("sans capstone : ligne à 25, silence à 20", () => {
    grantCapstone(false);
    expect(linesFor(25)).toBe(1);
    expect(linesFor(20)).toBe(0);
  });

  it("AVEC capstone : ligne à 20, et toujours à 40", () => {
    grantCapstone(true);
    expect(linesFor(20)).toBe(1);
    expect(linesFor(40)).toBe(1);
  });

  it("AVEC capstone : 25 n'est plus un palier, donc plus de ligne", () => {
    // Contrôle négatif : c'est exactement le symptôme du 25 codé en dur.
    grantCapstone(true);
    expect(linesFor(25)).toBe(0);
  });

  it("un lot au moins aussi gros que le pas produit UNE ligne, pas une par palier", () => {
    grantCapstone(true);
    expect(linesFor(100, 100)).toBe(1);
  });

  it("le tout premier achat garde sa ligne de fondation", () => {
    grantCapstone(true);
    expect(linesFor(1)).toBe(1);
  });
});

describe("mode Palier — la quantité mène EXACTEMENT au prochain jalon", () => {
  const at = (count) => { state.buildings[anyBuilding.id] = count; };

  it("depuis zéro, achète un pas entier", () => {
    grantCapstone(false);
    at(0);
    expect(stepBuyAmount(anyBuilding)).toBe(25);
  });

  it("en cours de palier, n'achète QUE ce qui manque", () => {
    grantCapstone(false);
    at(18);
    expect(stepBuyAmount(anyBuilding)).toBe(7);
    at(24);
    expect(stepBuyAmount(anyBuilding)).toBe(1);
  });

  it("pile sur un jalon, repart pour un pas entier et ne rend jamais 0", () => {
    grantCapstone(false);
    at(25);
    expect(stepBuyAmount(anyBuilding)).toBe(25);
    at(50);
    expect(stepBuyAmount(anyBuilding)).toBe(25);
  });

  it("suit le capstone : le pas devient 20", () => {
    grantCapstone(true);
    at(0);
    expect(stepBuyAmount(anyBuilding)).toBe(20);
    at(33);
    expect(stepBuyAmount(anyBuilding)).toBe(7);
  });

  it("le coût du lot est bien celui de la quantité résolue, pas de 1", () => {
    // Le piège de la sentinelle : passée au parse numérique, 'step' vaut NaN et
    // retombe à 1, donc la boutique afficherait le prix d'UN achat.
    grantCapstone(false);
    at(10);
    const parStep = buildingBatchCost(anyBuilding, "step");
    const parQuinze = buildingBatchCost(anyBuilding, 15);
    const parUn = buildingBatchCost(anyBuilding, 1);
    for (const k of Object.keys(parQuinze)) {
      expect(parStep[k].toString()).toBe(parQuinze[k].toString());
    }
    expect(parStep[Object.keys(parUn)[0]].gt(parUn[Object.keys(parUn)[0]])).toBe(true);
  });

  it("la sentinelle survit au rechargement (elle retombait sur ×1)", () => {
    const s = defaultState();
    s.buyAmount = "step";
    expect(hydrateState(JSON.parse(JSON.stringify(s))).buyAmount).toBe("step");
    s.buyAmount = "max";
    expect(hydrateState(JSON.parse(JSON.stringify(s))).buyAmount).toBe("max");
    s.buyAmount = "n'importe quoi";
    expect(hydrateState(JSON.parse(JSON.stringify(s))).buyAmount).toBe(1);
  });
});
