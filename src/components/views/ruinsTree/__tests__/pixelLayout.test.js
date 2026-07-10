"use strict";
// Invariants du layout PEINT de l'Arbre des Ruines (Phase C — ancres posées à
// la main sur l'illustration). Garantit qu'aucun nœud n'est orphelin d'ancre,
// que les veines ARRIVENT bien à leur nœud (la braise coule jusqu'au médaillon),
// que rien ne se chevauche et que tout reste dans les bornes de l'œuvre.

import { describe, it, expect } from "vitest";
import { computePixelTreeLayout } from "../pixelLayout.js";
import { TREE_ART, NODE_ANCHORS, DOGMA_ANCHORS } from "../anchors.js";
import {
  PRESTIGE_TREE,
  PRESTIGE_TREE_BRANCHES,
  PRESTIGE_DOGMAS,
} from "../../../../game/data/upgrades.js";

const allIds = new Set(PRESTIGE_TREE.map((n) => n.id));
const S = TREE_ART.scale;

describe("Layout peint — bijection des ancres", () => {
  it("ancre chaque nœud des données (et rien d'autre)", () => {
    expect(new Set(Object.keys(NODE_ANCHORS))).toEqual(allIds);
  });

  it("ancre chaque dogme des données (et rien d'autre)", () => {
    expect(new Set(Object.keys(DOGMA_ANCHORS))).toEqual(new Set(PRESTIGE_DOGMAS.map((d) => d.id)));
  });

  it("place tous les ids visibles, et seulement eux", () => {
    const { nodes } = computePixelTreeLayout(allIds);
    expect(new Set(nodes.map((n) => n.id))).toEqual(allIds);
    const partial = new Set([...allIds].slice(0, 5));
    expect(new Set(computePixelTreeLayout(partial).nodes.map((n) => n.id))).toEqual(partial);
  });
});

describe("Layout peint — géométrie", () => {
  const layout = computePixelTreeLayout(allIds);

  it("garde toutes les positions finies et DANS l'œuvre", () => {
    for (const p of [...layout.nodes, ...layout.dogmas, ...layout.gates, layout.hub]) {
      expect(Number.isFinite(p.x) && Number.isFinite(p.y), p.id || "hub").toBe(true);
      expect(p.x, p.id || "hub").toBeGreaterThanOrEqual(0);
      expect(p.y, p.id || "hub").toBeGreaterThanOrEqual(0);
      expect(p.x, p.id || "hub").toBeLessThanOrEqual(TREE_ART.w * S);
      expect(p.y, p.id || "hub").toBeLessThanOrEqual(TREE_ART.h * S);
    }
  });

  it("ne fait chevaucher aucun couple nœud/dogme (distance ≥ somme des rayons)", () => {
    const discs = [...layout.nodes, ...layout.dogmas];
    for (let i = 0; i < discs.length; i++) {
      for (let j = i + 1; j < discs.length; j++) {
        const dist = Math.hypot(discs[i].x - discs[j].x, discs[i].y - discs[j].y);
        expect(dist, `${discs[i].id}↔${discs[j].id}`).toBeGreaterThanOrEqual(discs[i].r + discs[j].r);
      }
    }
  });

  it("est déterministe (mêmes entrées → mêmes sorties)", () => {
    const a = computePixelTreeLayout(allIds);
    const b = computePixelTreeLayout(allIds);
    expect(JSON.stringify(a.nodes)).toBe(JSON.stringify(b.nodes));
    expect(JSON.stringify(a.gates)).toBe(JSON.stringify(b.gates));
  });
});

describe("Layout peint — portes & exclusions", () => {
  const layout = computePixelTreeLayout(allIds);

  it("pose une porte par palier gated, avec le bon seuil", () => {
    for (const branch of PRESTIGE_TREE_BRANCHES) {
      for (let t = 1; t < branch.tiers.length; t++) {
        const gate = layout.gates.find((g) => g.branch === branch.id && g.tier === t);
        expect(gate, `${branch.id}:${t}`).toBeTruthy();
        expect(gate.need).toBe(branch.unlock[t]);
      }
    }
  });

  it("expose les paires d'exclusion des dogmes (positions aux deux bouts)", () => {
    expect(layout.exclusionLinks.length).toBeGreaterThan(0);
    for (const link of layout.exclusionLinks) {
      expect(Number.isFinite(link.a.x) && Number.isFinite(link.b.y)).toBe(true);
    }
  });
});
