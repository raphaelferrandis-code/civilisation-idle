import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Audit 2026-10-05, PERF-25 — l'exclusion des arbres (places, terre-pleins, ponts) se
// recalculait pour chaque arbre à chaque frame (0,4 à 1,5 ms en vue large), alors
// qu'elle ne dépend que du plan et des ponts : le verdict est mémorisé sur l'arbre.
// Les ponts et la forêt sont remplacés par des doublures qui COMPTENT les appels.
const bridge = vi.hoisted(() => ({ calls: 0, list: { id: 1 }, blocks: () => false }));
const wild = vi.hoisted(() => ({ trees: [] }));
const plaza = vi.hoisted(() => ({ boxes: [] }));
vi.mock("../isoBridge.js", async (orig) => ({
  ...(await orig()),
  bridgeGeoms: () => bridge.list,
  bridgeBlocks: (wx, wy, m) => { bridge.calls += 1; return bridge.blocks(wx, wy, m); },
  pushIsoBridgeItems: () => {},
}));
vi.mock("../isoWildForest.js", async (orig) => ({ ...(await orig()), isoWildForest: () => wild.trees }));
vi.mock("../isoPlaza.js", async (orig) => ({ ...(await orig()), isoPlazaBoxes: () => plaza.boxes, isoPlazaBox: () => null }));

import { state } from "../../../core/state.js";
import { CM } from "../../layout.js";
import { collectIsoItems } from "../isoLiveCollect.js";

const T = 32;
const KEYS = ["lodActive", "ships", "citizens", "vehicles", "riotDraw", "riotFading", "born", "TILE", "layout", "wonderIsle", "_plaisirsBox"];
let saved, savedWonders, L;
const bake = () => ({
  T, L, band: 4, z: 1, smokeK: 0, eraIdx: 13,
  b: { gx0: 0, gx1: 60, gy0: 0, gy1: 60 },
  dvVis: () => true,
});
const trees = (items) => items.filter((it) => it.kind === "tree").map((it) => it.tr);

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, CM[k]]));
  savedWonders = state.wonders;
  state.wonders = [];
  Object.assign(CM, { lodActive: true, ships: [], citizens: [], vehicles: [], riotDraw: null, riotFading: null, born: {}, TILE: T });
  L = { tiles: [], critters: [], trees: [], terrePlein: [], roadMap: new Map(), river: null, counts: { eraBand: 4, eraIndex: 13 }, gridN: 60 };
  for (let i = 0; i < 40; i += 1) L.trees.push({ gx: i, gy: 10 });
  wild.trees = [];
  for (let i = 0; i < 40; i += 1) wild.trees.push({ gx: i, gy: 30, jx: 0.1, jy: -0.1 });
  CM.layout = L;
  bridge.calls = 0; bridge.list = { id: 1 }; bridge.blocks = () => false;
  plaza.boxes = [];
});
afterEach(() => {
  for (const k of KEYS) CM[k] = saved[k];
  state.wonders = savedWonders;
});

describe("PERF-25 — le verdict d'exclusion des arbres, mémorisé", () => {
  it("se calcule une fois par arbre, puis plus jamais tant que le plan et les ponts tiennent", () => {
    expect(trees(collectIsoItems(bake(), 1000))).toHaveLength(80);
    expect(bridge.calls).toBe(80);
    bridge.calls = 0;
    for (let f = 0; f < 5; f += 1) expect(trees(collectIsoItems(bake(), 1016 + f * 16))).toHaveLength(80);
    expect(bridge.calls).toBe(0);
  });

  it("des ponts neufs refont le verdict (et l'appliquent)", () => {
    collectIsoItems(bake(), 1000);
    bridge.calls = 0;
    // Le pont couvre désormais les colonnes 5 à 9 (des deux rangées).
    bridge.list = { id: 2 };
    bridge.blocks = (wx) => wx > 5 * T && wx < 10 * T;
    const got = trees(collectIsoItems(bake(), 1016));
    expect(bridge.calls).toBe(80);
    expect(got).toHaveLength(70);
    expect(got.some((tr) => tr.gx >= 5 && tr.gx <= 9)).toBe(false);
  });

  it("un plan neuf (places, terre-pleins) refait le verdict", () => {
    collectIsoItems(bake(), 1000);
    // Une place autour de (20, 10) : dégagement de 1,5 case.
    plaza.boxes = [{ gx0: 19, gx1: 21, gy0: 9, gy1: 11 }];
    const got = trees(collectIsoItems(bake(), 1016));
    expect(got.filter((tr) => tr.gy === 10 && tr.gx >= 18 && tr.gx <= 22)).toHaveLength(0);
    expect(got).toHaveLength(75);
    // Un terre-plein vertical en x = 29 (arbres de la colonne 30, à moins d'une case).
    L.terrePlein = [{ axis: "v", x: 29, y0: 0, y1: 40 }];
    expect(trees(collectIsoItems(bake(), 1032)).filter((tr) => tr.gx === 30)).toHaveLength(0);
  });
});
