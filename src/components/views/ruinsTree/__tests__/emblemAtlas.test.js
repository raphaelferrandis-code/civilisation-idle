"use strict";
// L'atlas des emblèmes repeints (emblemAtlas.js + emblems.png, générés par
// scripts/bakeRuinsEmblems.mjs) : une case par nœud et par dogme ancrés, une
// ligne par état, et une image à la bonne taille. Un nœud ajouté sans relancer
// le script laisserait une case vide (nœud invisible) : ce test l'attrape.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { EMBLEM_ATLAS } from "../emblemAtlas.js";
import { NODE_ANCHORS, DOGMA_ANCHORS } from "../anchors.js";

const PUB = path.resolve(__dirname, "../../../../../public");

describe("Atlas des emblèmes", () => {
  it("a une colonne par nœud et par dogme ancrés, sans doublon", () => {
    const ids = [...Object.keys(NODE_ANCHORS), ...Object.keys(DOGMA_ANCHORS)];
    expect(new Set(EMBLEM_ATLAS.order)).toEqual(new Set(ids));
    expect(EMBLEM_ATLAS.order.length).toBe(ids.length);
  });

  it("a les quatre états attendus par TreeNode", () => {
    expect(EMBLEM_ATLAS.states).toEqual(["lit", "avail", "dim", "locked"]);
  });

  it("pointe vers une image aux dimensions de la grille", () => {
    const buf = fs.readFileSync(path.join(PUB, EMBLEM_ATLAS.src));
    expect(buf.readUInt32BE(16)).toBe(EMBLEM_ATLAS.order.length * EMBLEM_ATLAS.cell);
    expect(buf.readUInt32BE(20)).toBe(EMBLEM_ATLAS.states.length * EMBLEM_ATLAS.cell);
  });
});
