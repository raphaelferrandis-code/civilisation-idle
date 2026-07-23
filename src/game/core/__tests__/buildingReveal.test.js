"use strict";
// LATCH DE RÉVÉLATION DES BÂTIMENTS (D6).
//
// L'apparition économique était muette. Le latch l'annonce, mais il porte un
// piège que seule sa PERSISTANCE règle : `isUnlocked` retombe à faux à chaque
// effondrement, puisque la chute vide state.buildings et remet les pics au
// socle. Un latch par cycle rejouerait donc la même rafale d'annonces toutes
// les deux ou trois minutes, ce qui serait pire que le silence d'origine.

import { describe, it, expect, beforeEach } from "vitest";

import { state, setState, defaultState, hydrateState, GR_PERSISTENT_FIELDS } from "../state.js";
import { Decimal } from "../num.js";
import { refreshBuildingReveal, isUnlocked } from "../mechanics.js";
import { buildings } from "../../data/buildings.js";

const roundTrip = (s) => hydrateState(JSON.parse(JSON.stringify(s)));

beforeEach(() => { setState(defaultState()); });

describe("refreshBuildingReveal — on n'annonce jamais deux fois", () => {
  it("rend les bâtiments fraîchement révélés, puis plus rien", () => {
    const premier = refreshBuildingReveal();
    expect(premier.length, "une partie neuve doit révéler au moins les Cueilleurs").toBeGreaterThan(0);
    expect(refreshBuildingReveal(), "rien de neuf au tick suivant").toEqual([]);
  });

  it("n'annonce que ce qui est réellement déverrouillé", () => {
    refreshBuildingReveal();
    for (const b of buildings) {
      if (state.revealedBuildings[b.id]) {
        expect(isUnlocked(b), `${b.id} est latché mais pas déverrouillé`).toBe(true);
      }
    }
  });

  it("un seuil franchi plus tard produit bien une annonce", () => {
    refreshBuildingReveal();
    const avant = Object.keys(state.revealedBuildings).length;
    // Un pic de devise très haut débloque tout ce qui ne dépend que de lui.
    state.cyclePeaks = { population: new Decimal("1e12"), food: new Decimal("1e12"), gold: new Decimal("1e12"), knowledge: new Decimal("1e12"), infrastructure: new Decimal("1e12") };
    const fresh = refreshBuildingReveal();
    expect(fresh.length, "de nouveaux bâtiments doivent apparaître").toBeGreaterThan(0);
    expect(Object.keys(state.revealedBuildings).length).toBe(avant + fresh.length);
  });

  it("chaque entrée rendue porte un nom affichable", () => {
    // Le message du tick lit b.name : une entrée sans nom écrirait « undefined »
    // dans la Chronique.
    for (const b of refreshBuildingReveal()) expect(b.name).toBeTruthy();
  });
});

describe("refreshBuildingReveal — LE piège : la chute ne doit pas rejouer la rafale", () => {
  it("le cycle complet chute puis remontée ne réannonce rien", () => {
    // ⚠ LE SCÉNARIO DOIT ALLER JUSQU'À LA REMONTÉE. Une première version de ce
    // test s'arrêtait à la chute, pics remis à zéro : tout était alors
    // reverrouillé, donc il n'y avait mécaniquement rien à réannoncer et le
    // test passait même avec un latch SANS MÉMOIRE. C'est en le cassant
    // exprès que ça s'est vu.
    const pics = { population: new Decimal("1e12"), food: new Decimal("1e12"), gold: new Decimal("1e12"), knowledge: new Decimal("1e12"), infrastructure: new Decimal("1e12") };
    state.cyclePeaks = { ...pics };
    state.cycles = 20;
    refreshBuildingReveal();
    const annonces = Object.keys(state.revealedBuildings);
    expect(annonces.length, "le cycle 1 doit révéler beaucoup").toBeGreaterThan(5);

    // La chute : les bâtiments partent, les pics retombent au socle.
    for (const id of Object.keys(state.buildings)) state.buildings[id] = 0;
    state.cyclePeaks = { population: new Decimal(0), food: new Decimal(0), gold: new Decimal(0), knowledge: new Decimal(0), infrastructure: new Decimal(0) };
    refreshBuildingReveal();

    // La remontée : le joueur reproduit, les seuils sont refranchis. C'est ICI
    // qu'un latch par cycle rejouerait toute la rafale.
    state.cyclePeaks = { ...pics };
    expect(refreshBuildingReveal(), "AUCUNE réannonce après remontée").toEqual([]);
    expect(Object.keys(state.revealedBuildings).sort()).toEqual(annonces.sort());
  });
});

describe("revealedBuildings — persistance", () => {
  it("survit au rechargement", () => {
    refreshBuildingReveal();
    const avant = { ...state.revealedBuildings };
    expect(roundTrip(state).revealedBuildings).toEqual(avant);
  });

  it("survit au Grand Reset", () => {
    // Sans cette entrée, le premier tick d'après un Grand Reset rejouerait
    // toute la découverte à un joueur qui connaît le jeu par cœur.
    expect(GR_PERSISTENT_FIELDS).toContain("revealedBuildings");
  });

  it("est un objet plein sur une partie neuve, jamais null", () => {
    expect(defaultState().revealedBuildings).toEqual({});
  });

  it("une sauvegarde corrompue ne casse pas l'hydratation", () => {
    for (const pourri of ["nope", 42, null, [1, 2]]) {
      const s = defaultState();
      s.revealedBuildings = pourri;
      expect(roundTrip(s).revealedBuildings).toEqual({});
    }
  });

  it("une sauvegarde d'avant D6 repart d'une map vide", () => {
    const s = defaultState();
    delete s.revealedBuildings;
    expect(roundTrip(s).revealedBuildings).toEqual({});
  });
});
