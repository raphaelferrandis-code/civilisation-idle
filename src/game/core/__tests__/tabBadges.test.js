"use strict";
// PASTILLES D'ATTENTION (B10). Ce qui se teste ici, c'est la RETENUE : une
// pastille qui reste allumee en permanence n'informe plus de rien, et le seul
// moyen de le garantir est de ne badger que le gratuit et le du.

import { describe, it, expect, beforeEach } from "vitest";
import { state, setState, hydrateState } from "../state.js";
import { tabBadgeCounts, tabBadgeSignature, parseTabBadges, freeDogmaChoiceCount } from "../mechanics/tabBadges.js";
import { PRESTIGE_DOGMAS } from "../../data/upgrades.js";
import { PRESTIGE_TREE } from "../../data/upgrades.js";
import { D } from "../num.js";

beforeEach(() => {
  setState(hydrateState({}));
  state.instability = 0.1;
});

// Achete assez de noeuds d'une branche pour ouvrir ses dogmes de palier I.
function ouvrirDogmes(branche, combien) {
  const noeuds = PRESTIGE_TREE.filter((n) => n.branch === branche).slice(0, combien);
  for (const n of noeuds) state.upgrades[n.id] = true;
  return noeuds.length;
}

describe("sceaux du Grand Reset", () => {
  it("badge l'onglet Effondrement quand un sceau est reclamable", () => {
    state.grRevealed = { 1: true, 2: true };
    state.grClaimed = {};
    expect(tabBadgeCounts().prestige).toBe(2);
  });

  it("ne badge pas un sceau deja reclame", () => {
    state.grRevealed = { 1: true, 2: true };
    state.grClaimed = { 1: true };
    expect(tabBadgeCounts().prestige).toBe(1);
  });

  it("aucune pastille quand il n'y a rien a reclamer", () => {
    expect(tabBadgeCounts().prestige).toBeUndefined();
    expect(tabBadgeSignature()).toBe("");
  });
});

describe("dogmes gratuits", () => {
  it("compte les DECISIONS et non les entrees : les dogmes vont par paires exclusives", () => {
    const branche = PRESTIGE_DOGMAS[0].branch;
    const seuil = PRESTIGE_DOGMAS[0].requiredPurchases;
    const paire = PRESTIGE_DOGMAS.filter((d) => d.branch === branche && d.requiredPurchases === seuil);
    expect(paire.length, "ce palier n'est pas une paire, le test ne prouve rien").toBe(2);
    ouvrirDogmes(branche, seuil);
    // Les deux dogmes sont disponibles, mais c'est UN choix a faire.
    expect(freeDogmaChoiceCount()).toBe(1);
  });

  it("s'eteint des que le choix est fait", () => {
    const branche = PRESTIGE_DOGMAS[0].branch;
    ouvrirDogmes(branche, PRESTIGE_DOGMAS[0].requiredPurchases);
    expect(tabBadgeCounts().ruinsView).toBe(1);
    state.upgrades[PRESTIGE_DOGMAS[0].id] = true;
    // Le jumeau devient « blocked » (conflictsWith), donc plus aucun choix ouvert.
    expect(tabBadgeCounts().ruinsView).toBeUndefined();
  });

  it("ne badge PAS un noeud payant abordable : le joueur epargne volontairement", () => {
    // Regression de conception : badger `available` allumerait la pastille en
    // permanence en milieu de partie, et reprocherait au joueur d'epargner.
    state.ruins = D("1e12");
    expect(tabBadgeCounts().ruinsView).toBeUndefined();
  });
});

describe("gardes", () => {
  it("aucune pastille pendant une crise ouverte", () => {
    state.grRevealed = { 1: true };
    expect(tabBadgeCounts().prestige).toBe(1);
    // crisisOpen() = instabilite >= 1 ou usure >= 1. Les onglets sont alors
    // verrouilles, et l'echelle des sceaux n'est meme pas rendue.
    state.instability = 1;
    expect(tabBadgeCounts()).toEqual({});
    expect(tabBadgeSignature()).toBe("");
  });

  it("la signature fait l'aller-retour sans perte", () => {
    state.grRevealed = { 1: true, 2: true, 3: true };
    ouvrirDogmes(PRESTIGE_DOGMAS[0].branch, PRESTIGE_DOGMAS[0].requiredPurchases);
    const sig = tabBadgeSignature();
    expect(parseTabBadges(sig)).toEqual(tabBadgeCounts());
    expect(sig).toContain("prestige:3");
  });

  it("la signature est STABLE entre deux appels identiques (sinon la sidebar se re-rend au tick)", () => {
    state.grRevealed = { 1: true };
    expect(tabBadgeSignature()).toBe(tabBadgeSignature());
  });
});
