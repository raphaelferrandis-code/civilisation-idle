"use strict";
// LA CHUTE (docs/PLAN-CHUTE.md) — la cité suivante naît dans la MÊME vallée, au milieu
// des ruines de celle qui tombe : même graine, même fleuve, même cœur ; les ruines
// relevées par la carte pendant la chute entrent dans la sauvegarde APRÈS la stèle.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { state, setState, hydrateState, invalidateRenderCache, normalizeCityRelics } from "../state.js";
import { registerChoiceDialog } from "../choiceDialog.js";
import { runCollapseSequence } from "../events.js";
import { setChuteHandlers } from "../../map/cityMapBridge.js";
import { D } from "../num.js";
import { MID_GAME_FIXTURE, FIXED_NOW } from "./fixtures.js";

const RIVER = [{ dy: 2 }, { dy: 3 }, { dy: 3 }, { dy: 1.5 }, { dy: 1.5 }, { dy: 2 }];
const relicsOf = (seed, n = 3) => ({
  v: 1, seed, n: 80,
  keys: ["h|domus|0||0", "p|courthouses-basilica-grand"],
  items: Array.from({ length: n }, (_, i) => [i - 5, -3, 1, 1, i % 2, -17.5, -33.25, 49.9, 58.8, i % 2]),
});

async function collapseWith(take) {
  setChuteHandlers({ fall: () => null, capture: () => true, take, rise: (f) => f && f(), abort: () => {} });
  const unregister = registerChoiceDialog((dialog) => Promise.resolve(dialog.options[0]));
  const seq = runCollapseSequence(D(100), "manual");
  await vi.advanceTimersByTimeAsync(2000);
  await seq;
  unregister();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
  setState(hydrateState(MID_GAME_FIXTURE));
  invalidateRenderCache("all");
  state.mapSeed = 12345;
  state.riverWP = RIVER.map((p) => ({ ...p }));
  state.cityCore = { seed: 12345, dx: -1.5, dy: -4, bx: -2, maxN: 96, ilot: { v: 1, blocks: [] } };
  state.cityRoads = null;
  state.cityNameCustom = false;
});
afterEach(() => {
  setChuteHandlers(null);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("la même vallée", () => {
  it("garde graine, fleuve, cœur et grille ; efface les îlots ; prend les ruines relevées", async () => {
    const name0 = state.cityName;
    const fresh = relicsOf(12345, 4);
    await collapseWith(() => fresh);
    expect(state.mapSeed).toBe(12345);
    expect(state.riverWP).toEqual(RIVER);
    expect(state.cityCore).toEqual({ seed: 12345, dx: -1.5, dy: -4, bx: -2, maxN: 96 });
    expect(state.cityRelics).toBe(fresh);
    expect(state.cityName).not.toBe(name0);
  });

  it("une chute non regardée (rien de relevé) garde les ruines d'avant", async () => {
    const old = relicsOf(12345, 2);
    state.cityRelics = old;
    await collapseWith(() => null);
    expect(state.mapSeed).toBe(12345);
    expect(state.cityRelics).toBe(old);
  });

  it("sans fiche de cœur pour cette graine : nouvelle vallée, sans ruines", async () => {
    state.cityCore = { seed: 999, dx: 0, dy: 0, bx: 0 };
    state.cityRelics = relicsOf(12345, 2);
    await collapseWith(() => relicsOf(12345, 5));
    expect(state.mapSeed).not.toBe(12345);
    expect(state.riverWP).toBeNull();
    expect(state.cityRelics).toBeNull();
  });
});

describe("les ruines dans la sauvegarde", () => {
  it("survivent à un rechargement, la séquence de chute non", () => {
    const r = relicsOf(777, 3);
    const reloaded = hydrateState(JSON.parse(JSON.stringify({ ...MID_GAME_FIXTURE, cityRelics: r, chute: true })));
    expect(reloaded.cityRelics).toEqual(r);
    expect(reloaded.chute).toBe(false);
  });

  it("une forme abîmée ne casse rien : pas de ruines", () => {
    expect(normalizeCityRelics(null)).toBeNull();
    expect(normalizeCityRelics({ v: 2, keys: [], items: [] })).toBeNull();
    expect(normalizeCityRelics({ v: 1, keys: ["h|x|0||0"], items: [[0, 0, 1, 1, 5, 0, 0, 1, 1, 0]] })).toBeNull();
    const ok = normalizeCityRelics({ v: 1, seed: 3, n: 40, keys: ["h|x|0||0"], items: [[0, 0, 1, 1, 0, 0, 0, 1, 1, 0], ["a"], [1, 2]] });
    expect(ok.items).toHaveLength(1);
  });
});
