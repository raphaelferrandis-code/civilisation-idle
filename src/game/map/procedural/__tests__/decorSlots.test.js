import { describe, it, expect } from "vitest";

import { createBuildingPlacer, placeCategorySlotted } from "../buildingGenerator.js";

// Filet anti-régression de la « Voie A » : un bâtiment décoratif, une fois
// apparu, NE BOUGE PLUS — seul son design (variant) évolue avec l'ère.
// On rejoue des « frames » (usedKeys/tiles/live frais) en gardant le même
// `store` persistant (= state.cityMapSlots), comme le runtime entre deux recomputes.

const N = 20;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function makeWorld({ eraBand }) {
  const core = { x: 10, y: 10 };
  const roadKey = new Set();
  for (let x = 2; x <= 17; x += 1) roadKey.add(x + ",10"); // grand-rue E-O
  for (let y = 2; y <= 17; y += 1) roadKey.add("10," + y); // grand-rue N-S
  const cells = [];
  for (let gx = 0; gx < N; gx += 1) for (let gy = 0; gy < N; gy += 1) {
    if (roadKey.has(gx + "," + gy)) continue;
    cells.push({ gx, gy, d2: (gx - core.x) ** 2 + (gy - core.y) ** 2 });
  }
  const plan = {
    core, order: 1, chaos: 0,
    anchors: [{ label: "habitat-0-0", kind: "habitat", gx: 10, gy: 8, r: 4, band: 0, strength: 1.2 }],
    plazas: []
  };
  const placer = createBuildingPlacer({
    cells, plan, roadKey,
    counts: { eraBand },
    personality: { variantBias: null, buildingBias: {} },
    seed: 4242, nearSet: new Set(), N, requireRoad: true
  });
  return { core, roadKey, placer };
}

// Rejoue une frame : structures frères fraîches, `store` persistant partagé.
// `blocked` simule des cellules devenues inconstructibles (route/bâtiment posé).
function runFrame(world, store, category, count, { blocked } = {}) {
  const { core, roadKey, placer } = world;
  const usedKeys = new Set();
  const tiles = [];
  const live = new Set();
  const cellFree = (gx, gy) => {
    if (gx < 0 || gy < 0 || gx >= N || gy >= N) return false;
    const k = gx + "," + gy;
    if (usedKeys.has(k) || roadKey.has(k)) return false;
    if (blocked && blocked.has(k)) return false;
    for (let dx = -1; dx <= 1; dx += 1) for (let dy = -1; dy <= 1; dy += 1) {
      if (roadKey.has((gx + dx) + "," + (gy + dy))) return true; // road-adjacence
    }
    return false;
  };
  placeCategorySlotted(category, count, {
    ordered: placer.orderedList(category),
    store, live, cx: core.x, cy: core.y, N, cycle: 0,
    cellFree,
    chooseVariant: placer.chooseVariant,
    quarterKindAt: placer.quarterKindAt,
    quarterIdAt: placer.quarterIdAt,
    pushTile: (t) => { tiles.push(t); usedKeys.add(t.gx + "," + t.gy); },
    clamp
  });
  return { tiles, live };
}

// Position (clé "gx,gy") de chaque index, lue depuis le store core-relatif.
function posByIndex(store, core, category, count) {
  const out = {};
  for (let i = 0; i < count; i += 1) {
    const s = store["0:dec_" + category + ":" + i];
    if (s) out[i] = (core.x + s.dx) + "," + (core.y + s.dy);
  }
  return out;
}

describe("buildingGenerator — placement décoratif persistant (Voie A)", () => {
  it("clés de slot compatibles avec le regex de save (cycle:id:index)", () => {
    const store = {};
    runFrame(makeWorld({ eraBand: 2 }), store, "house", 5);
    const re = /^\d+:[a-z_]+:\d+$/; // = normalizeCityMapSlots (state.js)
    const keys = Object.keys(store);
    expect(keys.length).toBe(5);
    for (const k of keys) expect(re.test(k), `clé "${k}" rejetée au reload`).toBe(true);
  });

  it("position figée quand le nombre de bâtiments augmente", () => {
    const world = makeWorld({ eraBand: 2 });
    const store = {};
    runFrame(world, store, "house", 10);
    const p10 = posByIndex(store, world.core, "house", 10);
    runFrame(world, store, "house", 30); // même store : frame suivante, ville plus grande
    const p30 = posByIndex(store, world.core, "house", 30);
    expect(Object.keys(p10).length).toBe(10);
    expect(Object.keys(p30).length).toBe(30);
    for (let i = 0; i < 10; i += 1) {
      expect(p30[i], `house#${i} a bougé en grandissant`).toBe(p10[i]);
    }
  });

  it("position figée mais design qui évolue avec l'ère", () => {
    const store = {};
    const r2 = runFrame(makeWorld({ eraBand: 2 }), store, "house", 24);
    const pos2 = posByIndex(store, { x: 10, y: 10 }, "house", 24);
    const varAt2 = Object.fromEntries(r2.tiles.map((t) => [t.key, t.variant]));

    // Même monde (seed/cells/routes identiques), ère avancée → mêmes positions réutilisées.
    const r6 = runFrame(makeWorld({ eraBand: 6 }), store, "house", 24);
    const pos6 = posByIndex(store, { x: 10, y: 10 }, "house", 24);
    const varAt6 = Object.fromEntries(r6.tiles.map((t) => [t.key, t.variant]));

    for (let i = 0; i < 24; i += 1) {
      expect(pos6[i], `house#${i} a bougé au passage d'ère`).toBe(pos2[i]);
    }
    const changed = Object.keys(varAt2).filter((k) => varAt6[k] && varAt6[k] !== varAt2[k]);
    expect(changed.length, "aucun design n'a évolué avec l'ère").toBeGreaterThan(0);
  });

  it("refit local : invalider une cellule sauvée ne déplace que cet index", () => {
    const world = makeWorld({ eraBand: 2 });
    const store = {};
    runFrame(world, store, "house", 20);
    const before = posByIndex(store, world.core, "house", 20);
    // L'index 5 voit sa cellule occupée (route/bâtiment) à la frame suivante.
    runFrame(world, store, "house", 20, { blocked: new Set([before[5]]) });
    const after = posByIndex(store, world.core, "house", 20);
    expect(after[5], "house#5 aurait dû se replacer").not.toBe(before[5]);
    for (let i = 0; i < 20; i += 1) {
      if (i === 5) continue;
      expect(after[i], `house#${i} a bougé alors que seul #5 était invalidé`).toBe(before[i]);
    }
  });
});
