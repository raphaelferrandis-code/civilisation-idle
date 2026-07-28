import { describe, it, expect, beforeEach } from "vitest";

import { state, setState, defaultState, hydrateState, invalidateRenderCache, buildingById } from "../state.js";
import { D } from "../num.js";
import {
  buyRoadWorkCore, tickRoadWorks, roadWorkCost, roadWorksCount, roadNextInfo, roadWorkDuration
} from "../actions/roadWorks.js";
import { buyBuildingCore, buyableInMass } from "../actions/building.js";
import {
  ROAD_WORK_QUEUE_MAX, ROAD_TILE_COST_BASE,
  ROAD_WIDEN_COST_MULT, ROAD_NEXT_FALLBACK_TILES, ROAD_WORK_TIME_MAX
} from "../balance.js";

// Chantiers de voirie (design validé 2026-07-28) : 1 achat = 1 chantier
// (raccord entier puis élargissement), coût ∝ tuiles ancré sur l'ère, cadence
// par le TEMPS de pose (file bornée), complétion → buildings.roads += 1. La
// carte rejoue le compteur ; ici on verrouille la partie SIM.

beforeEach(() => { setState(defaultState()); invalidateRenderCache("all"); });

const giveKnowledge = (n) => { state.knowledge = D(n); };

describe("chantiers de voirie — coût", () => {
  it("le coût suit les tuiles du prochain chantier écrit par la carte", () => {
    state.roadNext = { kind: "link", tiles: 14, targetId: null, toRank: null };
    // Ère 0 (partie neuve) : pas de croissance d'ère.
    expect(roadWorkCost().toNumber()).toBe(ROAD_TILE_COST_BASE * 14);
  });

  it("un élargissement coûte plus cher selon le rang visé", () => {
    state.roadNext = { kind: "widen", tiles: 10, targetId: null, toRank: "main" };
    expect(roadWorkCost().toNumber()).toBe(ROAD_TILE_COST_BASE * 10 * ROAD_WIDEN_COST_MULT.main);
  });

  it("sans calcul de carte, une estimation raisonnable donne quand même un prix", () => {
    state.roadNext = null;
    expect(roadNextInfo().tiles).toBe(ROAD_NEXT_FALLBACK_TILES);
    expect(roadWorkCost().gt(0)).toBe(true);
  });

  it("réseau achevé : rien à vendre", () => {
    state.roadNext = { kind: "done", tiles: 0, targetId: null, toRank: null };
    expect(roadWorkCost()).toBe(null);
    giveKnowledge("1e9");
    expect(buyRoadWorkCore()).toBe(false);
  });
});

describe("chantiers de voirie — file et tick", () => {
  it("achat : encaisse, met en file, ne touche PAS le compteur avant complétion", () => {
    state.roadNext = { kind: "link", tiles: 5, targetId: "granaries_city", toRank: null };
    giveKnowledge(ROAD_TILE_COST_BASE * 5);
    const before = state.buildings.roads || 0;
    expect(buyRoadWorkCore()).toBe(true);
    expect(state.knowledge.toNumber()).toBe(0);
    expect(state.buildings.roads || 0).toBe(before);
    expect(roadWorksCount()).toBe(1);
    expect(state.roadWorks.active.total).toBeCloseTo(roadWorkDuration(5, 0), 10);
  });

  it("la durée RAMPE : chaque chantier suivant est plus long, jamais une pose éclair", () => {
    // Le premier chantier n'est déjà pas instantané…
    expect(roadWorkDuration(1, 0)).toBeGreaterThanOrEqual(8);
    // …et l'index (chantiers de l'ère, file comprise) allonge strictement la pose.
    expect(roadWorkDuration(5, 1)).toBeGreaterThan(roadWorkDuration(5, 0));
    expect(roadWorkDuration(5, 20)).toBeGreaterThan(roadWorkDuration(5, 5));
    // Plafond de sécurité.
    expect(roadWorkDuration(500, 9999)).toBe(ROAD_WORK_TIME_MAX);
    // En file : le 2e chantier acheté porte l'index 1, donc une durée plus longue.
    state.roadNext = { kind: "link", tiles: 5, targetId: null, toRank: null };
    giveKnowledge("1e9");
    buyRoadWorkCore();
    buyRoadWorkCore();
    expect(state.roadWorks.queue[0].total).toBeCloseTo(roadWorkDuration(5, 1), 10);
    expect(state.roadWorks.queue[0].total).toBeGreaterThan(state.roadWorks.active.total);
  });

  it("l'équipe s'améliore avec l'ère : la pose par tuile se comprime", () => {
    // Même vague, ère 20 : nettement plus courte qu'à l'ère 0…
    expect(roadWorkDuration(400, 0, 20)).toBeLessThan(roadWorkDuration(400, 0, 0) / 2);
    // …et une grande vague de late game reste sous le plafond en pratique.
    expect(roadWorkDuration(400, 4, 30)).toBeLessThan(600);
  });

  it("la rampe se remet à zéro quand l'ère change (remontée post-Effondrement)", () => {
    state.roadNext = { kind: "link", tiles: 5, targetId: null, toRank: null };
    giveKnowledge("1e9");
    // Rampe chargée sur une AUTRE ère (comme après plusieurs chantiers puis un
    // passage d'ère) : l'achat suivant repart à l'index 0.
    state.roadWorksEra = { era: 7, count: 9 };
    buyRoadWorkCore();
    expect(state.roadWorks.active.total).toBeCloseTo(roadWorkDuration(5, 0), 10);
    expect(state.roadWorksEra.count).toBe(1);
    // Même ère : le compteur continue, lui.
    buyRoadWorkCore();
    expect(state.roadWorks.queue[0].total).toBeCloseTo(roadWorkDuration(5, 1), 10);
  });

  it("sans savoir, pas de chantier", () => {
    state.roadNext = { kind: "link", tiles: 5, targetId: null, toRank: null };
    giveKnowledge(1);
    expect(buyRoadWorkCore()).toBe(false);
    expect(roadWorksCount()).toBe(0);
  });

  it("la file est bornée à ROAD_WORK_QUEUE_MAX", () => {
    state.roadNext = { kind: "link", tiles: 3, targetId: null, toRank: null };
    giveKnowledge("1e9");
    for (let i = 0; i < ROAD_WORK_QUEUE_MAX; i += 1) expect(buyRoadWorkCore()).toBe(true);
    expect(buyRoadWorkCore()).toBe(false);
    expect(roadWorksCount()).toBe(ROAD_WORK_QUEUE_MAX);
  });

  it("le tick fait avancer puis compléter : buildings.roads monte d'un", () => {
    state.roadNext = { kind: "link", tiles: 3, targetId: null, toRank: null };
    giveKnowledge("1e9");
    buyRoadWorkCore();
    const total = state.roadWorks.active.total;
    tickRoadWorks(total / 2);
    expect(state.buildings.roads || 0).toBe(0);
    expect(state.roadWorks.active.left).toBeCloseTo(total / 2, 6);
    tickRoadWorks(total / 2 + 0.001);
    expect(state.buildings.roads).toBe(1);
    expect(state.roadWorks.active).toBe(null);
  });

  it("hors-ligne : un grand dt traverse la file entière, reliquat compris", () => {
    state.roadNext = { kind: "link", tiles: 3, targetId: null, toRank: null };
    giveKnowledge("1e9");
    for (let i = 0; i < 3; i += 1) buyRoadWorkCore();
    const totalAll = roadWorkDuration(3, 0) + roadWorkDuration(3, 1) + roadWorkDuration(3, 2);
    tickRoadWorks(totalAll + 1);
    expect(state.buildings.roads).toBe(3);
    expect(roadWorksCount()).toBe(0);
  });

  it("CONTRÔLE NÉGATIF : sans tick, rien ne se termine tout seul", () => {
    state.roadNext = { kind: "link", tiles: 3, targetId: null, toRank: null };
    giveKnowledge("1e9");
    buyRoadWorkCore();
    expect(state.buildings.roads || 0).toBe(0);
    tickRoadWorks(0);
    expect(state.buildings.roads || 0).toBe(0);
  });
});

describe("chantiers de voirie — intégration achat", () => {
  it("buyBuildingCore('roads') débouche sur le chantier (jamais sur le compteur direct)", () => {
    state.roadNext = { kind: "link", tiles: 4, targetId: null, toRank: null };
    giveKnowledge("1e9");
    expect(buyBuildingCore("roads")).toBe(true);
    expect(state.buildings.roads || 0).toBe(0);   // pas d'incrément direct
    expect(roadWorksCount()).toBe(1);
  });

  it("la voirie est exclue de l'achat de masse", () => {
    expect(buyableInMass(buildingById.roads)).toBe(false);
  });

  it("hydratation : une file sauvegardée revient saine, une corrompue est purgée", () => {
    const s = hydrateState({
      roadWorks: {
        active: { kind: "link", tiles: 5, total: 8, left: 3 },
        queue: [{ kind: "widen", tiles: 7, toRank: "avenue", total: 11.2, left: 11.2 }, { bad: true }]
      },
      roadNext: { kind: "widen", tiles: 9, toRank: "main" },
      roadWidened: 3.7
    });
    expect(s.roadWorks.active.left).toBe(3);
    expect(s.roadWorks.queue.length).toBe(1);
    expect(s.roadWorks.queue[0].toRank).toBe("avenue");
    expect(s.roadNext.tiles).toBe(9);
    expect(s.roadWidened).toBe(3);   // entier borné
  });
});
