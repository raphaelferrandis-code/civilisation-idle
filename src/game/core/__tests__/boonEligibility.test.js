"use strict";
// AUBAINES — LE TIRAGE DANS LE VIDE (D10, correctif seul, sans jauge).
//
// Le tirage était uniforme sur les cinq aubaines, puis abandonnait si la
// ressource choisie ne produisait rien. Or c'est un état COURANT et non un cas
// limite : sur une partie neuve, TROIS ressources sur cinq rendent zéro (l'Or
// reste à 0/s tant que le Rayonnement est sous 25, le Savoir et
// l'Infrastructure n'ont aucun socle). Trois tirages sur cinq tombaient donc
// dans le vide.
//
// Et l'horloge avait DÉJÀ été reprogrammée avant le tirage : le joueur
// repartait pour un intervalle complet — jusqu'à trente minutes — sans avoir
// rien reçu ni le moindre signe qu'une aubaine avait été tentée.

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";

import { state, setState, defaultState, invalidateRenderCache } from "../state.js";
import { D, toNum } from "../num.js";
import { tick } from "../actions.js";
import { rates } from "../mechanics.js";
import { BOONS } from "../../data/boons.js";
import { FIXED_NOW } from "./fixtures.js";

const RESSOURCES = ["population", "food", "gold", "knowledge", "infrastructure"];
const solde = () => Object.fromEntries(RESSOURCES.map((r) => [r, D(state[r])]));
const creditees = (avant) => RESSOURCES.filter((r) => D(state[r]).sub(avant[r]).gt(1));

beforeAll(() => { vi.spyOn(Date, "now").mockReturnValue(FIXED_NOW); });
afterAll(() => { vi.restoreAllMocks(); });
beforeEach(() => { setState(defaultState()); invalidateRenderCache("all"); });

describe("sur une partie neuve, trois aubaines sur cinq ne rapporteraient RIEN", () => {
  it("le décor du bug : seules la Nourriture et le Rayonnement produisent", () => {
    // Si ce test tombe, c'est l'équilibrage de départ qui a bougé — et les
    // deux tests suivants ne prouveraient plus ce qu'ils prétendent.
    const r = rates();
    const rentables = BOONS.filter((b) => D(r[b.resource]).max(0).mul(b.seconds).floor().gt(0));
    expect(rentables.map((b) => b.resource).sort()).toEqual(["food", "population"]);
  });
});

describe("le tirage ne vise plus que ce qui rapporte", () => {
  // On balaie tout le domaine de Math.random. Avec l'ancien code, chaque valeur
  // tombant sur l'Or, le Savoir ou l'Infrastructure ne créditait rien.
  for (const alea of [0.0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 0.99]) {
    it(`random=${alea} : une ressource est bel et bien créditée`, () => {
      state.nextBoonAt = FIXED_NOW - 1;
      const rnd = vi.spyOn(Math, "random").mockReturnValue(alea);
      const avant = solde();
      tick(0.001); // production négligeable devant une aubaine (110 s de revenu)
      const gagnees = creditees(avant);
      rnd.mockRestore();

      expect(gagnees.length, `aucune ressource créditée pour random=${alea}`).toBe(1);
      // Et jamais une ressource qui ne produit pas : ce serait un crédit inventé.
      expect(["food", "population"]).toContain(gagnees[0]);
      // L'horloge n'est reprogrammée QUE sur un vrai crédit.
      expect(state.nextBoonAt).toBeGreaterThan(FIXED_NOW);
    });
  }
});

describe("la taille du trou que le correctif bouche", () => {
  it("l'ANCIEN tirage aurait rendu trois fois sur cinq dans le vide", () => {
    // On rejoue l'ancienne sélection — uniforme sur les cinq, sans filtre — et
    // on compte celles qui n'auraient rien crédité. C'est la mesure du défaut,
    // et elle explique pourquoi il passait inaperçu : rien ne s'affichait, donc
    // il n'y avait rien à remarquer.
    const r = rates();
    const vides = BOONS.filter((b) => D(r[b.resource]).max(0).mul(b.seconds).floor().lte(0));
    expect(vides.map((b) => b.resource).sort()).toEqual(["gold", "infrastructure", "knowledge"]);
    // Et chacune coûtait au joueur l'intervalle entier, l'horloge étant
    // reprogrammée AVANT le tirage.
    expect(vides.length / BOONS.length).toBeGreaterThanOrEqual(0.6);
  });

  // ⚠ LE CAS « AUCUNE AUBAINE ÉLIGIBLE » N'EST PAS TESTÉ, et c'est délibéré :
  // il n'est pas constructible depuis un état de jeu ordinaire. Mesuré, le
  // Rayonnement garde un socle de 0,04/s qu'aucun des leviers essayés
  // n'annule — ni Énée dégradé, ni population à zéro, ni famine : l'aubaine de
  // Rayonnement rend toujours au moins 5. La garde `if (!eligibles.length)` est
  // donc un filet de sécurité pour les multiplicateurs extrêmes de fin de
  // partie, pas un chemin courant. Écrire un test qui la « couvre » en
  // truquant rates() n'aurait prouvé que le trucage.
});

describe("aucun crédit fantôme", () => {
  it("le gain crédité vaut bien les secondes de production annoncées", () => {
    state.nextBoonAt = FIXED_NOW - 1;
    const r = rates();
    const rnd = vi.spyOn(Math, "random").mockReturnValue(0);
    const avant = solde();
    tick(0.001);
    rnd.mockRestore();

    const gagnee = creditees(avant)[0];
    const boon = BOONS.find((b) => b.resource === gagnee);
    const attendu = toNum(D(r[gagnee]).mul(boon.seconds).floor());
    const recu = toNum(D(state[gagnee]).sub(avant[gagnee]));
    // Tolérance large : le tick crédite AUSSI sa production normale sur dt.
    expect(recu).toBeGreaterThanOrEqual(attendu * 0.99);
    expect(recu).toBeLessThan(attendu * 1.05 + 10);
  });
});
