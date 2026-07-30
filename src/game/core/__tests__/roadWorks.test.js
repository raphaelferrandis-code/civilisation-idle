import { describe, it, expect, beforeEach } from "vitest";

import { state, setState, defaultState, hydrateState, invalidateRenderCache, buildingById } from "../state.js";
import { D } from "../num.js";
import {
  buyRoadWorkCore, tickRoadWorks, roadWorkCost, roadWorksCount, roadNextInfo, roadWorkDuration,
  roadTilePrice
} from "../actions/roadWorks.js";
import { buyBuildingCore, buyableInMass, buyAllAffordable } from "../actions/building.js";
import {
  ROAD_WORK_QUEUE_MAX, ROAD_TILE_COST_BASE, ROAD_COST_ERA_ANCHOR, ROAD_TILE_COST_MIN,
  ROAD_WIDEN_COST_MULT, ROAD_NEXT_FALLBACK_TILES, ROAD_WORK_TIME_MAX,
  ROAD_WORKS_BANK_MAX
} from "../balance.js";
import { eras } from "../../data/world.js";

// Chantiers de voirie (design validé 2026-07-28) : 1 achat = 1 chantier
// (raccord entier puis élargissement), coût ∝ tuiles ancré sur l'ère, cadence
// par le TEMPS de pose (file bornée), complétion → buildings.roads += 1. La
// carte rejoue le compteur ; ici on verrouille la partie SIM.

beforeEach(() => { setState(defaultState()); invalidateRenderCache("all"); });

const giveKnowledge = (n) => { state.knowledge = D(n); };
// L'ère se lit sur la POPULATION : c'est le seul levier pour cadrer un prix.
const setEra = (i) => { state.population = D(eras[i].at); };

describe("chantiers de voirie — coût", () => {
  it("le coût suit les tuiles du prochain chantier écrit par la carte", () => {
    state.roadNext = { kind: "link", tiles: 14, targetId: null, toRank: null };
    expect(roadWorkCost().toNumber()).toBeCloseTo(roadTilePrice().toNumber() * 14, 9);
  });

  it("un élargissement coûte plus cher selon le rang visé", () => {
    state.roadNext = { kind: "widen", tiles: 10, targetId: null, toRank: "main" };
    expect(roadWorkCost().toNumber())
      .toBeCloseTo(roadTilePrice().toNumber() * 10 * ROAD_WIDEN_COST_MULT.main, 9);
  });

  it("sans calcul de carte, une estimation raisonnable donne quand même un prix", () => {
    state.roadNext = null;
    expect(roadNextInfo().tiles).toBe(ROAD_NEXT_FALLBACK_TILES);
    expect(roadWorkCost().gt(0)).toBe(true);
  });

  it("réseau achevé : l'achat reste possible au prix plat de la réserve", () => {
    state.roadNext = { kind: "done", tiles: 0, targetId: null, toRank: null };
    // Prix plat d'un chantier moyen (l'achat partira en réserve).
    expect(roadWorkCost().toNumber())
      .toBeCloseTo(roadTilePrice().toNumber() * ROAD_NEXT_FALLBACK_TILES, 9);
  });

  // ── Régression d'équilibrage (2026-07-31) ────────────────────────────────
  // Le prix était ancré sur l'ère 0 alors que le savoir ne coule qu'à partir de
  // l'ère 3 : mesuré sur partie neuve, un chantier valait 480 k de savoir à
  // l'ère 3 (9 h de production) et 5,3 M à l'ère 4 — la rangée était morte
  // toute la première heure. Ces bornes verrouillent l'ordre de grandeur.
  it("la tuile est cotée à l'ère d'ancrage, et pas au-delà avant", () => {
    setEra(ROAD_COST_ERA_ANCHOR);
    expect(roadTilePrice().toNumber()).toBeCloseTo(ROAD_TILE_COST_BASE, 6);
    // Avant l'ancre le prix RETOMBE, jusqu'au plancher : la voirie des premières
    // ères est un petit achat, pas un mur.
    setEra(0);
    expect(roadTilePrice().toNumber()).toBe(ROAD_TILE_COST_MIN);
    setEra(2);
    const era2 = roadTilePrice().toNumber();
    expect(era2).toBeLessThan(ROAD_TILE_COST_BASE);
    expect(era2).toBeGreaterThanOrEqual(ROAD_TILE_COST_MIN);
  });

  it("reste payable sur la production de savoir réelle du début de partie", () => {
    // Mesures sonde d'affordabilité (partie neuve, achat glouton) : savoir/s
    // et taille de vague typique observées sur la carte.
    const MESURES = [
      { era: 3, savoirParSec: 14, tuiles: 12 },
      { era: 4, savoirParSec: 293, tuiles: 12 }
    ];
    for (const m of MESURES) {
      setEra(m.era);
      state.roadNext = { kind: "link", tiles: m.tuiles, targetId: null, toRank: null };
      const secondes = roadWorkCost().toNumber() / m.savoirParSec;
      // Un chantier vaut au plus 2 min de production — jamais des heures.
      expect(secondes).toBeLessThan(120);
      // …et coûte quand même quelque chose : ce n'est pas un clic gratuit.
      expect(secondes).toBeGreaterThan(5);
    }
  });
});

describe("chantiers de voirie — file et tick", () => {
  it("achat : encaisse, met en file, ne touche PAS le compteur avant complétion", () => {
    state.roadNext = { kind: "link", tiles: 5, targetId: "granaries_city", toRank: null };
    giveKnowledge(roadWorkCost());
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

  it("réserve : à réseau achevé l'achat se STOCKE, puis le tick le lance tout seul", () => {
    state.roadNext = { kind: "done", tiles: 0, count: 0, targetId: null, toRank: null };
    giveKnowledge("1e9");
    // L'achat ne va pas en file : il part en réserve (prépayé).
    expect(buyRoadWorkCore()).toBe(true);
    expect(state.roadWorksBank).toBe(1);
    expect(state.roadWorks.active).toBeNull();
    // La ville grandit : la carte repropose un raccord → le tick lance le
    // chantier prépayé de lui-même, sans re-clic ni nouveau paiement.
    const before = D(state.knowledge).toString();
    state.roadNext = { kind: "link", tiles: 4, count: 1, targetId: null, toRank: null };
    tickRoadWorks(0.001);
    expect(state.roadWorksBank).toBe(0);
    expect(state.roadWorks.active).toBeTruthy();
    expect(state.roadWorks.active.tiles).toBe(4);
    expect(D(state.knowledge).toString()).toBe(before);
    // Et il se termine comme un chantier normal.
    tickRoadWorks(state.roadWorks.active.total + 1);
    expect(Math.floor(state.buildings.roads)).toBe(1);
  });

  it("réserve : plafonnée — au cap, plus rien à vendre", () => {
    state.roadNext = { kind: "done", tiles: 0, count: 0, targetId: null, toRank: null };
    giveKnowledge("1e18");
    state.roadWorksBank = ROAD_WORKS_BANK_MAX;
    expect(roadWorkCost()).toBeNull();
    expect(buyRoadWorkCore()).toBe(false);
    expect(state.roadWorksBank).toBe(ROAD_WORKS_BANK_MAX);
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

  it("« Tout acheter » sert la voirie par son guichet : file remplie, hors du glouton", () => {
    // Hors du GLOUTON (pas d'ordre de prix) et du délai B5…
    expect(buyableInMass(buildingById.roads)).toBe(false);
    // …mais la touche E remplit la file de chantiers.
    state.roadNext = { kind: "link", tiles: 5, count: 1, targetId: null, toRank: null };
    giveKnowledge("1e9");
    const n = buyAllAffordable("infra");
    expect(roadWorksCount()).toBe(ROAD_WORK_QUEUE_MAX);
    expect(n).toBeGreaterThanOrEqual(ROAD_WORK_QUEUE_MAX);
  });

  it("« Tout acheter » à réseau achevé : la réserve se remplit jusqu'au cap", () => {
    state.roadNext = { kind: "done", tiles: 0, count: 0, targetId: null, toRank: null };
    giveKnowledge("1e12");
    buyAllAffordable("infra");
    expect(state.roadWorksBank).toBe(ROAD_WORKS_BANK_MAX);
    expect(roadWorksCount()).toBe(0);
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
