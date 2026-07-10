"use strict";
// Invariants du LAYOUT « ronds » de l'arbre des ruines (fonction pure).
// Garantit : positions finies/uniques, pas de chevauchement (tous couples),
// bijection avec les nœuds visibles, déterminisme, et HONNÊTETÉ (les rayons
// relient un nœud d'orbite à son propre cœur de rond, intra-palier).

import { describe, it, expect } from "vitest";
import { computeRuinTreeLayout, LAYOUT } from "../layout.js";
import {
  PRESTIGE_TREE,
  PRESTIGE_TREE_BRANCHES,
  PRESTIGE_DOGMAS,
} from "../../../../game/data/upgrades.js";

const allIds = new Set(PRESTIGE_TREE.map((n) => n.id));

describe("Layout arbre de ruines — positions", () => {
  it("place chaque nœud visible à une position finie", () => {
    const { nodes } = computeRuinTreeLayout(allIds);
    expect(nodes.length).toBe(PRESTIGE_TREE.length);
    for (const n of nodes) {
      expect(Number.isFinite(n.x), n.id).toBe(true);
      expect(Number.isFinite(n.y), n.id).toBe(true);
    }
  });

  it("ne place aucun nœud en doublon de coordonnées exactes", () => {
    const { nodes } = computeRuinTreeLayout(allIds);
    const keys = nodes.map((n) => `${n.x.toFixed(3)},${n.y.toFixed(3)}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("ne fait chevaucher aucun couple de nœuds (distance ≥ somme des rayons)", () => {
    const { nodes } = computeRuinTreeLayout(allIds);
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dist = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
        const minGap = nodes[i].r + nodes[j].r; // tangents au minimum
        expect(dist, `${nodes[i].id}↔${nodes[j].id}`).toBeGreaterThanOrEqual(minGap);
      }
    }
  });
});

describe("Layout arbre de ruines — déterminisme & bijection", () => {
  it("est déterministe (mêmes entrées → mêmes sorties)", () => {
    const a = computeRuinTreeLayout(allIds);
    const b = computeRuinTreeLayout(allIds);
    expect(JSON.stringify(a.nodes)).toBe(JSON.stringify(b.nodes));
  });

  it("ne place que des ids visibles, et tous", () => {
    const { nodes } = computeRuinTreeLayout(allIds);
    expect(new Set(nodes.map((n) => n.id))).toEqual(allIds);
  });

  it("recalcule l'éventail sur les seuls nœuds visibles (pas de trou)", () => {
    // Cache le 1er nœud de chaque branche : le reste reste placé et fini.
    const hidden = new Set(allIds);
    for (const b of PRESTIGE_TREE_BRANCHES) hidden.delete(b.tiers[0][0]);
    const { nodes } = computeRuinTreeLayout(hidden);
    expect(nodes.length).toBe(hidden.size);
    for (const n of nodes) expect(Number.isFinite(n.x) && Number.isFinite(n.y)).toBe(true);
  });
});

describe("Layout arbre de ruines — honnêteté du graphe", () => {
  it("relie chaque rayon à son nœud d'orbite (cœur → nœud, intra-palier)", () => {
    const { edges, nodes } = computeRuinTreeLayout(allIds);
    const node = Object.fromEntries(nodes.map((n) => [n.id, n]));
    for (const e of edges) {
      const n = node[e.id];
      expect(n, e.id).toBeTruthy();
      expect(n.branch, e.id).toBe(e.branch);
      expect(n.tier, e.id).toBe(e.tier); // jamais de saut inter-palier
      // Le rayon est clippé : son extrémité 1 est sur le CONTOUR du nœud.
      expect(Math.abs(Math.hypot(e.x1 - n.x, e.y1 - n.y) - LAYOUT.NODE_R), e.id).toBeLessThan(1e-6);
      expect(Number.isFinite(e.x2) && Number.isFinite(e.y2)).toBe(true);
    }
  });

  it("ancre dogmes et sceaux à leur rond, capstone en cœur achetable", () => {
    // Depuis la refonte, les dogmes vont par PAIRES exclusives posées de part
    // et d'autre du rond : chaque dogme est soit AU centre d'un rond (dogme
    // seul), soit à distance bornée du centre le plus proche (membre de paire).
    const { dogmas, seals, ronds, nodes } = computeRuinTreeLayout(allIds);
    const rondKey = new Set(ronds.map((r) => `${r.x.toFixed(2)},${r.y.toFixed(2)}`));
    const pairOffsetMax = LAYOUT.ORBIT_R + LAYOUT.NODE_R + LAYOUT.DOGMA_R + 8 + 1e-6;
    for (const d of dogmas) {
      const nearest = Math.min(...ronds.map((r) => Math.hypot(d.x - r.x, d.y - r.y)));
      expect(nearest, d.id).toBeLessThanOrEqual(pairOffsetMax);
    }
    for (const s of seals) expect(rondKey.has(`${s.x.toFixed(2)},${s.y.toFixed(2)}`)).toBe(true);
    const caps = nodes.filter((n) => n.capstone);
    expect(caps.length).toBeGreaterThan(0);
    for (const c of caps) expect(rondKey.has(`${c.x.toFixed(2)},${c.y.toFixed(2)}`), c.id).toBe(true);
  });

  it("expose les fils d'exclusion conflictsWith (paires de dogmes intra-branche)", () => {
    const { exclusionLinks } = computeRuinTreeLayout(allIds);
    expect(exclusionLinks.length).toBeGreaterThan(0);
    const dogmaBranch = Object.fromEntries(PRESTIGE_DOGMAS.map((d) => [d.id, d.branch]));
    for (const link of exclusionLinks) {
      const [a, b] = link.ids;
      // Les exclusions de la refonte sont les paires de dogmes d'une même branche.
      expect(dogmaBranch[a], a).toBeTruthy();
      expect(dogmaBranch[b], b).toBeTruthy();
      expect(dogmaBranch[a]).toBe(dogmaBranch[b]);
      expect(Number.isFinite(link.a.x) && Number.isFinite(link.b.y)).toBe(true);
    }
  });
});

describe("Layout arbre de ruines — dogmes", () => {
  it("place les dogmes par requiredPurchases croissant (rayon monotone par branche)", () => {
    // Les membres d'une même paire partagent leur requiredPurchases (même rond,
    // même rayon) : la monotonie se vérifie entre PALIERS distincts.
    const { dogmas } = computeRuinTreeLayout(allIds);
    expect(dogmas.length).toBe(PRESTIGE_DOGMAS.length);
    const byBranch = {};
    for (const d of dogmas) (byBranch[d.branch] ||= []).push(d);
    for (const branch of Object.keys(byBranch)) {
      const byReq = {};
      for (const d of byBranch[branch]) {
        (byReq[d.requiredPurchases] ||= []).push(Math.hypot(d.x, d.y));
      }
      const levels = Object.keys(byReq).map(Number).sort((a, b) => a - b);
      for (let i = 1; i < levels.length; i++) {
        const r0 = Math.max(...byReq[levels[i - 1]]);
        const r1 = Math.min(...byReq[levels[i]]);
        expect(r1, `${branch}`).toBeGreaterThan(r0);
      }
    }
  });

  it("respecte le rayon de capstone agrandi", () => {
    const { nodes } = computeRuinTreeLayout(allIds);
    const caps = nodes.filter((n) => n.capstone);
    expect(caps.length).toBeGreaterThan(0);
    for (const c of caps) expect(c.r).toBe(LAYOUT.CAPSTONE_R);
  });
});
