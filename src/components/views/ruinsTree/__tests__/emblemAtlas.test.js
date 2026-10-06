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
import { PRESTIGE_TREE } from "../../../../game/data/upgrades.js";

const PUB = path.resolve(__dirname, "../../../../../public");
const ART = path.resolve(__dirname, "../../../../../art/emblemes-ruines");
const RUINS = path.join(PUB, "pixelart/ui/ruins");

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

  // Audit 2026-10-05, ASSET-3 : les emblèmes que le jeu ne sert plus un par un sont
  // rangés dans art/emblemes-ruines/. Seuls restent livrés les @32 des COURONNES,
  // que le registre demande par un chemin construit (`node-${capId}@32.png`).
  it("le registre trouve l'emblème @32 livré de chaque couronne", () => {
    const caps = PRESTIGE_TREE.filter((n) => n.capstone).map((n) => n.id);
    expect(caps.length).toBeGreaterThanOrEqual(4);
    const absents = caps.filter((id) => !fs.existsSync(path.join(RUINS, `node-${id}@32.png`)));
    expect(absents).toEqual([]);
  });

  it("scripts/bakeRuinsEmblems.mjs trouve la source de chaque case (@24, ou @32 pour une couronne)", () => {
    const caps = new Set(PRESTIGE_TREE.filter((n) => n.capstone).map((n) => n.id));
    const absents = EMBLEM_ATLAS.order.filter((id) => {
      const f = `node-${id}@${caps.has(id) ? 32 : 24}.png`;
      return !fs.existsSync(path.join(ART, f)) && !fs.existsSync(path.join(RUINS, f));
    });
    expect(absents).toEqual([]);
  });
});
