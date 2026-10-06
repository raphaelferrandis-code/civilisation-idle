"use strict";
// LA CHUTE (docs/PLAN-CHUTE.md) — la cité suivante naît dans la MÊME vallée, au milieu
// des ruines de celle qui tombe : même graine, même fleuve, même cœur ; les ruines
// relevées par la carte pendant la chute entrent dans la sauvegarde APRÈS la stèle.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { state, setState, hydrateState, invalidateRenderCache, normalizeCityRelics, RELIC_CAP, commitCityName } from "../state.js";
import { generateCityName } from "../../map/procedural/cityName.js";
import { newCitySeed } from "../../map/procedural/seedManager.js";
import { registerChoiceDialog } from "../choiceDialog.js";
import { runCollapseSequence } from "../events.js";
import { setChuteHandlers } from "../../map/cityMapBridge.js";
import { resetCivilization } from "../actions/myths.js";
import { D } from "../num.js";
import { MID_GAME_FIXTURE, FIXED_NOW } from "./fixtures.js";

const RIVER = [{ dy: 2 }, { dy: 3 }, { dy: 3 }, { dy: 1.5 }, { dy: 1.5 }, { dy: 2 }];
// Un relevé au format v2 (iso/isoChute.js, recordRelics → state.js, packCityRelics).
const relicsOf = (seed, n = 3) => ({
  v: 2, seed,
  keys: ["h|domus|0||0", "p|courthouses-basilica-grand"],
  forms: [[0, 1, 1, -1750, -3325, 4990, 5880], [1, 1, 1, -1750, -3325, 4990, 5880]],
  items: Array.from({ length: n }, (_, i) => [i - 5, -3, i % 2]).flat(),
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
  // Audit du 05/10, CHUTE-4 (choix B de Raph) : la grille n'est plus gardée (maxN), le
  // fleuve garde sa largeur de pose (riverN) — la plus grande des deux.
  it("garde graine, fleuve, cœur et largeur de pose du fleuve ; efface grille et îlots ; prend les ruines relevées", async () => {
    const name0 = state.cityName;
    const fresh = relicsOf(12345, 4);
    await collapseWith(() => fresh);
    expect(state.mapSeed).toBe(12345);
    expect(state.riverWP).toEqual(RIVER);
    expect(state.cityCore).toEqual({ seed: 12345, dx: -1.5, dy: -4, bx: -2, riverN: 96 });
    expect(state.cityRelics).toBe(fresh);
    expect(state.cityName).not.toBe(name0);
  });

  it("la largeur de pose du fleuve ne recule pas d'une chute à l'autre", async () => {
    state.cityCore = { seed: 12345, dx: -1.5, dy: -4, bx: -2, maxN: 40, riverN: 96 };
    await collapseWith(() => null);
    expect(state.cityCore.riverN).toBe(96);
    expect(state.cityCore.maxN).toBeUndefined();
    // Elle survit au rechargement (normalizeCityCore).
    const reloaded = hydrateState(JSON.parse(JSON.stringify(state)));
    expect(reloaded.cityCore.riverN).toBe(96);
  });

  it("une sauvegarde sans largeur de pose n'en invente pas au rechargement", () => {
    const reloaded = hydrateState(JSON.parse(JSON.stringify({ ...MID_GAME_FIXTURE, mapSeed: 7, cityCore: { seed: 7, dx: 0, dy: 0, bx: 0, maxN: 50 } })));
    expect(reloaded.cityCore.maxN).toBe(50);
    expect("riverN" in reloaded.cityCore).toBe(false);
  });

  it("une chute non regardée (rien de relevé) garde les ruines d'avant", async () => {
    const old = relicsOf(12345, 2);
    state.cityRelics = old;
    await collapseWith(() => null);
    expect(state.mapSeed).toBe(12345);
    expect(state.cityRelics).toBe(old);
  });

  it("un nom vidé tire un nom neuf, pas celui de la graine (gardée d'un cycle à l'autre)", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.123);
    state.cityName = "  ";
    commitCityName();
    expect(state.cityNameCustom).toBe(false);
    expect(state.cityName).toBe(generateCityName(newCitySeed()));   // mêmes tirages, même seed
    expect(state.cityName).not.toBe(generateCityName(12345));
  });

  it("un pacte de Mythe (resetCivilization) repart sans les ruines : sa grille est neuve", () => {
    state.cityRelics = relicsOf(12345, 3);
    resetCivilization();
    expect(state.cityCore).toBeNull();
    expect(state.cityRelics).toBeNull();
    expect(state.mapSeed).toBe(12345);
  });

  // Repli SANS CARTE seulement (ici, layout.js n'est pas chargé) : en jeu, le relevé du
  // vestige pose toujours la fiche avant — cf. chuteValleeCarte.test.js.
  it("sans carte ni fiche de cœur pour cette graine : nouvelle vallée, sans ruines", async () => {
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
    expect(normalizeCityRelics({ v: 2, keys: [], forms: [], items: [] })).toBeNull();
    expect(normalizeCityRelics({ v: 3, keys: ["h|x|0||0"], forms: [[0, 1, 1, 0, 0, 100, 100]], items: [0, 0, 0] })).toBeNull();
    expect(normalizeCityRelics({ v: 2, keys: ["h|x|0||0"], items: [0, 0, 0] })).toBeNull();   // sans formes
    expect(normalizeCityRelics({ v: 1, keys: ["h|x|0||0"], items: [[0, 0, 1, 1, 5, 0, 0, 1, 1, 0]] })).toBeNull();
    const ok = normalizeCityRelics({ v: 1, seed: 3, n: 40, keys: ["h|x|0||0"], items: [[0, 0, 1, 1, 0, 0, 0, 1, 1, 0], ["a"], [1, 2]] });
    expect(ok.items).toEqual([0, 0, 0]);
    // v2 : une forme abîmée (clé inconnue, longueur fausse), un numéro de forme qui
    // ne mène à rien ou n'est pas entier — ces items-là tombent, pas les autres.
    const v2 = normalizeCityRelics({ v: 2, seed: 3, keys: ["h|x|0||0"],
      forms: [[0, 1, 1, 0, 0, 100, 100], [5, 1, 1, 0, 0, 100, 100], ["a"]],
      items: [0, 0, 1, 1, 1, 2, 2, 2, 9, 3, 3, 0.5, 5, 5, 0, 7] });
    expect(v2).toEqual({ v: 2, seed: 3, keys: ["h|x|0||0"], forms: [[0, 1, 1, 0, 0, 100, 100]], items: [5, 5, 0] });
  });

  it("une emprise ou un cadre absurde est écarté (la carte parcourt sx × sy cases par ruine)", () => {
    const keys = ["h|x|0||0"];
    const good = [4, -3, 3, 3, 0, -60, -140, 176, 160, 1];
    const absurd = [
      [0, 0, 1e6, 1e6, 0, 0, 0, -5, 1e9, 0],     // emprise de mille milliards de cases
      [0, 0, 17, 1, 0, 0, 0, 10, 10, 0],          // plus large que tout bâtiment
      [900, 0, 1, 1, 0, 0, 0, 10, 10, 0],         // hors de toute grille
      [0, 0, 1, 1, 0, 5000, 0, 10, 10, 0],        // cadre à des lieues de sa case
      [0, 0, 1, 1, 0, 0, 0, -5, 10, 0],           // largeur négative
      [0, 0, 1, 1, 0, 0, 0, 10, 1e9, 0],          // hauteur démesurée
    ];
    const r = normalizeCityRelics({ v: 1, seed: 3, n: 40, keys, items: [...absurd, good] });
    expect(r).toEqual({ v: 2, seed: 3, keys, forms: [[0, 3, 3, -6000, -14000, 17600, 16000]], items: [4, -3, 0] });
    expect(normalizeCityRelics({ v: 1, seed: 3, n: 40, keys, items: absurd })).toBeNull();
    // Les mêmes bornes au format v2 (cadre en centièmes).
    const v2 = normalizeCityRelics({ v: 2, seed: 3, keys,
      forms: [[0, 17, 1, 0, 0, 1000, 1000], [0, 1, 1, 500000, 0, 1000, 1000], [0, 1, 1, 0, 0, -500, 1000], [0, 3, 3, -6000, -14000, 17600, 16000]],
      items: [0, 0, 0, 0, 0, 1, 0, 0, 2, 900, 0, 3, 4, -3, 3] });
    expect(v2).toEqual(r);
    // Plafonné au relevé de la carte (RELIC_CAP).
    const many = Array.from({ length: RELIC_CAP + 50 }, (_, i) => [i % 50, -3, 1, 1, 0, 0, 0, 10, 10, 0]);
    expect(normalizeCityRelics({ v: 1, seed: 3, n: 40, keys, items: many }).items).toHaveLength(RELIC_CAP * 3);
    const many2 = Array.from({ length: RELIC_CAP + 50 }, (_, i) => [i % 50, -3, 0]).flat();
    expect(normalizeCityRelics({ v: 2, seed: 3, keys, forms: [[0, 1, 1, 0, 0, 1000, 1000]], items: many2 }).items).toHaveLength(RELIC_CAP * 3);
  });

  // Audit du 05/10, CHUTE-14 : ~108 Ko au plafond en v1, resérialisés à chaque autosave.
  it("un relevé v1 se range en v2 : mêmes cadres au bit près, même ordre, sans n ni clé inutile", () => {
    const v1 = { v: 1, seed: 3, n: 40, keys: ["h|domus|0||0", "h|tronqué|0||0", "p|courthouses-basilica-grand"],
      items: [
        [-5, -3, 1, 1, 0, -17.5, -33.25, 49.9, 58.8, 0],
        [4, 2, 3, 3, 2, -60.07, -140.13, 176.01, 160.3, 1],
        [4, 2, 3, 3, 2, -12.33, -96.5, 40.2, 51.17, 1],
        [-4, -3, 1, 1, 0, -17.5, -33.25, 49.9, 58.8, 0],
      ] };
    const r = normalizeCityRelics(JSON.parse(JSON.stringify(v1)));
    expect(r).toEqual({ v: 2, seed: 3, keys: ["h|domus|0||0", "p|courthouses-basilica-grand"],
      forms: [[0, 1, 1, -1750, -3325, 4990, 5880], [1, 3, 3, -6007, -14013, 17601, 16030], [1, 3, 3, -1233, -9650, 4020, 5117]],
      items: [-5, -3, 0, 4, 2, 1, 4, 2, 2, -4, -3, 0] });
    // Déplié, chaque ruine rend EXACTEMENT les flottants du v1 (x / 100) : la carte
    // (relicsFor, paintRelic) les dessine au même pixel, dans le même ordre.
    const back = [];
    for (let i = 0; i < r.items.length; i += 3) {
      const f = r.forms[r.items[i + 2]];
      back.push([r.items[i], r.items[i + 1], f[1], f[2], r.keys[f[0]], f[3] / 100, f[4] / 100, f[5] / 100, f[6] / 100]);
    }
    expect(back).toEqual(v1.items.map((it) => [...it.slice(0, 4), v1.keys[it[4]], ...it.slice(5, 9)]));
    // Rechargée à son tour, une sauvegarde v2 se range à l'identique.
    expect(normalizeCityRelics(JSON.parse(JSON.stringify(r)))).toEqual(r);
  });
});
