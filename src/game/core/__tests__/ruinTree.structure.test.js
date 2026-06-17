"use strict";
// Invariants STRUCTURELS de l'arbre de ruines (refonte « paliers à choix ») :
// garantit qu'aucune régression de données ne réintroduit le softlock d'exclusion
// mutuelle, les inversions de coût, les capstones mal placés ou les nœuds start*
// morts. Tests purement données (aucun état de jeu nécessaire).

import { describe, it, expect } from "vitest";
import {
  upgrades,
  PRESTIGE_TREE,
  PRESTIGE_TREE_BRANCHES,
  PRESTIGE_DOGMAS,
  dogmaIds
} from "../../data/upgrades.js";

const byId = Object.fromEntries(upgrades.map((u) => [u.id, u]));
const ruinNonDogma = upgrades.filter((u) => u.group === "ruins" && !dogmaIds.has(u.id));

describe("Arbre de ruines — placement des nœuds", () => {
  it("place chaque upgrade de ruines (hors dogme) dans exactement un palier", () => {
    const treeIds = PRESTIGE_TREE.map((n) => n.id);
    // pas de doublon
    expect(new Set(treeIds).size).toBe(treeIds.length);
    // bijection avec les upgrades ruins non-dogme
    expect(new Set(treeIds)).toEqual(new Set(ruinNonDogma.map((u) => u.id)));
    expect(PRESTIGE_TREE).toHaveLength(ruinNonDogma.length);
  });

  it("ne référence que des upgrades existants", () => {
    for (const node of PRESTIGE_TREE) expect(byId[node.id], node.id).toBeTruthy();
  });
});

describe("Arbre de ruines — coûts monotones par branche", () => {
  it("ne décroît jamais le long des paliers (anti-inversion, anti-gating gratuit)", () => {
    for (const branch of PRESTIGE_TREE_BRANCHES) {
      let prev = -1;
      let prevId = "";
      for (const id of branch.tiers.flat()) {
        const cost = byId[id]?.cost?.ruins ?? 0;
        expect(cost, `${branch.id}: ${prevId}(${prev}) -> ${id}(${cost})`).toBeGreaterThanOrEqual(prev);
        prev = cost;
        prevId = id;
      }
    }
  });
});

describe("Arbre de ruines — capstones", () => {
  it("termine chaque grande branche par un nœud capstone", () => {
    for (const branch of PRESTIGE_TREE_BRANCHES) {
      if (branch.id === "veille") continue; // utilitaire, pas de capstone
      const lastId = branch.tiers.at(-1).at(-1);
      expect(byId[lastId]?.capstone, `${branch.id} se termine par ${lastId}`).toBe(true);
    }
  });

  it("ne marque capstone QUE des nœuds terminaux", () => {
    const terminalIds = new Set(
      PRESTIGE_TREE_BRANCHES.filter((b) => b.id !== "veille").map((b) => b.tiers.at(-1).at(-1))
    );
    for (const u of upgrades) {
      if (u.capstone) expect(terminalIds.has(u.id), `${u.id} capstone`).toBe(true);
    }
  });
});

describe("Arbre de ruines — anti-softlock (réachabilité sous conflit)", () => {
  // Avec la sélection à compteur, posséder un membre d'une paire conflictsWith
  // BLOQUE l'autre — mais ne doit JAMAIS empêcher un palier d'atteindre son seuil
  // `unlock` (sinon retour du softlock linéaire historique).
  function tierReachable(blocked) {
    for (const branch of PRESTIGE_TREE_BRANCHES) {
      for (let t = 0; t < branch.tiers.length; t++) {
        const need = branch.unlock[t] ?? 0;
        let buyableBelow = 0;
        for (let k = 0; k < t; k++) buyableBelow += branch.tiers[k].filter((id) => !blocked.has(id)).length;
        if (buyableBelow < need) return `${branch.id} palier ${t}: ${buyableBelow} achetables < unlock ${need}`;
      }
    }
    return null;
  }

  const conflictPairs = upgrades.filter((u) => u.conflictsWith).map((u) => [u.id, u.conflictsWith]);

  it("existe au moins une paire conflictsWith (le choix exclusif est préservé)", () => {
    expect(conflictPairs.length).toBeGreaterThan(0);
  });

  it("garde chaque branche traversable quel que soit le membre choisi", () => {
    for (const [, twin] of conflictPairs) {
      expect(tierReachable(new Set([twin])), `twin bloqué: ${twin}`).toBeNull();
    }
  });

  it("garde chaque branche traversable même si TOUS les twins sont bloqués", () => {
    const allTwins = new Set(conflictPairs.map(([, twin]) => twin));
    expect(tierReachable(allTwins)).toBeNull();
  });

  it("ne place les paires conflictsWith que dans des paliers à marge (jamais critiques)", () => {
    // chaque palier hébergeant un nœud conflictsWith doit garder assez de nœuds
    // pour qu'au pire son retrait n'empêche pas le palier SUIVANT de s'ouvrir.
    for (const branch of PRESTIGE_TREE_BRANCHES) {
      for (let t = 0; t < branch.tiers.length - 1; t++) {
        const need = branch.unlock[t + 1] ?? 0;
        let below = 0;
        for (let k = 0; k <= t; k++) {
          below += branch.tiers[k].filter((id) => !byId[id]?.conflictsWith).length;
        }
        // below = nœuds non-conflictuels jusqu'au palier t inclus
        expect(below, `${branch.id} palier ${t + 1}`).toBeGreaterThanOrEqual(need);
      }
    }
  });
});

describe("Arbre de ruines — dogmes & start*", () => {
  it("rend chaque dogme atteignable (requiredPurchases <= taille de branche)", () => {
    for (const dogma of PRESTIGE_DOGMAS) {
      const branch = PRESTIGE_TREE_BRANCHES.find((b) => b.id === dogma.branch);
      expect(branch, dogma.id).toBeTruthy();
      expect(dogma.requiredPurchases).toBeLessThanOrEqual(branch.tiers.flat().length);
    }
  });

  it("n'a aucun nœud start* plat coûteux (les morts sont indexés sur le pic)", () => {
    for (const u of upgrades) {
      if (u.effectType && /^start/.test(u.effectType) && !/PctPeak$/.test(u.effectType)) {
        expect((u.cost?.ruins ?? 0), `${u.id} start* plat`).toBeLessThanOrEqual(1000);
      }
    }
  });

  it("expose des seuils unlock cohérents (unlock[0] = 0, croissants)", () => {
    for (const branch of PRESTIGE_TREE_BRANCHES) {
      expect(branch.unlock).toHaveLength(branch.tiers.length);
      expect(branch.unlock[0]).toBe(0);
      for (let t = 1; t < branch.unlock.length; t++) {
        expect(branch.unlock[t]).toBeGreaterThanOrEqual(branch.unlock[t - 1]);
      }
    }
  });
});
