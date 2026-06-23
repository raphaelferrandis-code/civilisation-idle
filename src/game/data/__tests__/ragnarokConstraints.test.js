"use strict";
// G-05 — Intégrité des données : les contraintes de la finale Ragnarok (« survivre
// sous les 13 contraintes ») référencent des ids de mythes par chaîne. Un renommage
// d'id de mythe sans mettre à jour cette liste casserait silencieusement la finale.
// (L'arbre de prestige est déjà couvert par ruinTree.structure ; ceci complète le
// pendant côté mythes.)

import { describe, it, expect } from "vitest";
import { RAGNAROK_CONSTRAINTS, MYTHS, RAGNAROK_ID, getMythById } from "../myths.js";

describe("RAGNAROK_CONSTRAINTS", () => {
  it("chaque contrainte résout un mythe existant", () => {
    for (const id of RAGNAROK_CONSTRAINTS) {
      expect(getMythById(id), `la contrainte « ${id} » ne résout aucun mythe`).toBeTruthy();
    }
  });

  it("n'a pas de doublon", () => {
    expect(new Set(RAGNAROK_CONSTRAINTS).size).toBe(RAGNAROK_CONSTRAINTS.length);
  });

  it("ne s'inclut pas elle-même (Ragnarok n'est pas une de ses propres contraintes)", () => {
    expect(RAGNAROK_CONSTRAINTS).not.toContain(RAGNAROK_ID);
  });

  it("couvre tous les mythes sauf Ragnarok", () => {
    const nonRagnarok = MYTHS.filter((m) => m.id !== RAGNAROK_ID).map((m) => m.id).sort();
    expect([...RAGNAROK_CONSTRAINTS].sort()).toEqual(nonRagnarok);
  });
});
