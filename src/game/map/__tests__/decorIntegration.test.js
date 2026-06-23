import { describe, it, expect } from "vitest";

import { computeCityLayout } from "../layout.js";
import { defaultState } from "../../core/state.js";
import { D } from "../../core/num.js";

// Intégration de bout en bout de la « Voie A » via computeCityLayout (câblage
// réel : dispatcher, footprintFits, slotStore de l'état, purge, archétype figé).
// Les slots étant CORE-RELATIFS, on compare les offsets (dx,dy) — robustes à la
// croissance de la grille — pas les coordonnées absolues.

const houseKeys = (L) => L.tiles.filter((t) => t.type === "house").map((t) => t.key);

function decHouseOffsets(s) {
  const out = {};
  for (const [k, v] of Object.entries(s.cityMapSlots)) {
    if (/^\d+:dec_house:\d+$/.test(k)) out[k] = v.dx + "," + v.dy;
  }
  return out;
}

function bigCity({ pop, infra, know }) {
  const s = defaultState();
  s.cycles = 1;
  s.mapSeed = 0x51a7c0de; // seed fixe : ville reproductible (test déterministe)
  s.population = D(pop);
  s.infrastructure = D(infra);
  s.knowledge = D(know);
  s.buildings.foragers = 6;
  s.buildings.markets = 4;
  return s;
}

describe("layout — intégration placement persistant (Voie A)", () => {
  it("crée des slots dec_ valides, fige l'archétype, et est idempotent", () => {
    const s = bigCity({ pop: 80000, infra: 20000, know: 12000 });

    const L1 = computeCityLayout(s);
    expect(houseKeys(L1).length).toBeGreaterThan(0);

    const slotKeys = Object.keys(s.cityMapSlots);
    expect(slotKeys.length).toBeGreaterThan(0);
    const re = /^\d+:[a-z_]+:\d+$/; // = normalizeCityMapSlots (state.js) → survit au reload
    for (const k of slotKeys) expect(re.test(k), `clé "${k}" rejetée au reload`).toBe(true);
    expect(Object.keys(decHouseOffsets(s)).length).toBeGreaterThan(0);

    expect(typeof s.cityArchetype).toBe("string"); // Phase A : archétype figé
    const arch = s.cityArchetype;

    // Recompute immédiat → grille inchangée → positions absolues identiques.
    const L1b = computeCityLayout(s);
    expect(houseKeys(L1b).sort()).toEqual(houseKeys(L1).sort());
    expect(s.cityArchetype).toBe(arch);
  });

  it("la ville grandit sans déplacer l'existant (cœur figé, faubourgs vivants)", () => {
    const s = bigCity({ pop: 60000, infra: 15000, know: 9000 });

    computeCityLayout(s);
    const before = decHouseOffsets(s);
    const arch = s.cityArchetype;
    const beforeCount = Object.keys(before).length;

    // La population explose → beaucoup plus de maisons (faubourgs), même partie.
    s.population = D(400000);
    computeCityLayout(s);
    const after = decHouseOffsets(s);

    expect(Object.keys(after).length).toBeGreaterThanOrEqual(beforeCount); // ne rétrécit pas
    expect(s.cityArchetype).toBe(arch);                                    // plan inchangé
    // Chaque maison d'avant garde son offset core-relatif (ne bouge plus).
    const moved = Object.keys(before).filter((k) => after[k] !== before[k]);
    expect(moved, `${moved.length}/${beforeCount} maisons ont bougé`).toEqual([]);
  });
});
