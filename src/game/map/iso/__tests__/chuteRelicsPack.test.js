"use strict";
// LES RUINES RELEVÉES (docs/PLAN-CHUTE.md) — iso/isoChute.js, recordRelics, les range
// au format v2 de la sauvegarde (core/state.js, packCityRelics) : cadre en centièmes
// de pixel entiers (la précision du premier format), formes partagées, ordre du relevé
// gardé, plus de `n`. Le v1 pesait ~108 Ko au plafond, resérialisés à chaque autosave.
// (Audit du 05/10 : CHUTE-14.)
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Des maisons « prêtes » sans images : la ruine d'une maison est un cadre fixe autour
// de la boîte que le relevé lui donne (au zoom du relevé), noté sur la tuile.
vi.mock("../../pixelHouses.js", async (importOriginal) => ({
  ...(await importOriginal()),
  pixelHouseReady: () => true,
  pixelHouseRuin: (t, x, y, w, h) => {
    t._ruin = { key: t.k, tint: 0, model: null, vi: 0, x: x + 1.37, y: y - 2.11, w: w * 0.9, h: h * 1.3 };
    return t._ruin;
  },
}));

import { CM } from "../../layout.js";
import { worldToScreen } from "../projection.js";
import { state, normalizeCityRelics, RELIC_CAP } from "../../../core/state.js";
import { recordRelics, chuteCollect } from "../isoChute.js";

const T = CM.TILE;
const saved = {};
let savedRelics = null;
beforeEach(() => {
  for (const k of ["layout", "cam", "cw", "ch"]) saved[k] = CM[k];
  savedRelics = state.cityRelics;
});
afterEach(() => {
  Object.assign(CM, saved);
  state.cityRelics = savedRelics;
});

function city(N, houses) {
  const c = Math.floor(N / 2);
  const L = { tiles: houses.map(([gx, gy, k]) => ({ type: "house", gx, gy, k })), gridN: N, cx: c, cy: c,
    plan: { core: { x: c, y: c } }, mapSeed: 777, roadSet: new Set() };
  CM.layout = L;
  CM.cam = { x: (c + 0.5) * T, y: (c + 0.5) * T, zoom: 1 };
  CM.cw = 1200; CM.ch = 700;
  return L;
}
// Le cadre que le premier format aurait gardé (arrondi au centième), en centièmes.
function frameOf(t) {
  const z = CM.cam.zoom;
  CM.cam.zoom = 4;                      // le zoom du relevé
  const ref = worldToScreen(t.gx * T, t.gy * T);
  CM.cam.zoom = z;
  const c = (v) => Math.round(v * 100);
  return [c((t._ruin.x - ref.x) / 4), c((t._ruin.y - ref.y) / 4), c(t._ruin.w / 4), c(t._ruin.h / 4)];
}

describe("le relevé des ruines (format v2)", () => {
  it("partage clés et formes, garde l'ordre des tuiles et le cadre au centième", () => {
    const L = city(40, [[10, 12, "domus"], [11, 12, "domus"], [25, 9, "insula"], [13, 30, "domus"], [14, 14, "insula"]]);
    const R = recordRelics(L);
    expect(Object.keys(R).sort()).toEqual(["forms", "items", "keys", "seed", "v"]);
    expect(R.v).toBe(2);
    expect(R.seed).toBe(777);
    expect(R.keys).toEqual(["h|domus|0||0", "h|insula|0||0"]);
    expect(R.forms).toHaveLength(2);      // même modèle, même emprise : même forme
    expect(R.items).toEqual([-10, -8, 0, -9, -8, 0, 5, -11, 1, -7, 10, 0, -6, -6, 1]);
    L.tiles.forEach((t, i) => {
      const f = R.forms[R.items[i * 3 + 2]];
      expect(R.keys[f[0]]).toBe("h|" + t.k + "|0||0");
      expect(f.slice(1, 3)).toEqual([1, 1]);
      expect(f.slice(3)).toEqual(frameOf(t));
      expect(f.every(Number.isInteger)).toBe(true);
    });
    // La sauvegarde rechargée se range à l'identique.
    expect(normalizeCityRelics(JSON.parse(JSON.stringify(R)))).toEqual(R);
    // Et la carte du cycle suivant (même vallée, rien de bâti encore) rejoue chaque
    // ruine au cadre du premier format.
    state.cityRelics = R;
    const items = [];
    chuteCollect(items, { ...L, tiles: [] });
    const got = items.filter((it) => it.kind === "relic").map(({ r }) => [r.gx, r.gy, r.x, r.y, r.w, r.h]);
    expect(got).toEqual(L.tiles.map((t) => [t.gx, t.gy, ...frameOf(t).map((v) => v / 100)]));
  });

  it("au plafond : les ruines du cœur restent, clés et formes des tronquées partent, bien plus léger que le v1", () => {
    // 2 200 maisons autour du cœur (50, 50), 100 de plus dans un coin lointain.
    const houses = [];
    for (let gy = 28; gy < 72; gy += 1) for (let gx = 25; gx < 75; gx += 1) houses.push([gx, gy, "m" + ((gx * 7 + gy * 13) % 120)]);
    for (let gy = 0; gy < 10; gy += 1) for (let gx = 0; gx < 10; gx += 1) houses.push([gx, gy, "loin" + gx]);
    const R = recordRelics(city(100, houses));
    expect(R.items).toHaveLength(RELIC_CAP * 3);
    expect(R.keys.some((k) => k.includes("loin"))).toBe(false);
    for (let i = 0; i < R.items.length; i += 3) expect(Math.abs(R.items[i]) <= 25 && Math.abs(R.items[i + 1]) <= 22).toBe(true);
    expect(normalizeCityRelics(JSON.parse(JSON.stringify(R)))).toEqual(R);
    // Le même relevé au premier format (un item de 10 nombres par ruine, cadre en flottants).
    const v1 = { v: 1, seed: R.seed, n: 100, keys: R.keys, items: [] };
    for (let i = 0; i < R.items.length; i += 3) {
      const f = R.forms[R.items[i + 2]];
      v1.items.push([R.items[i], R.items[i + 1], f[1], f[2], f[0], f[3] / 100, f[4] / 100, f[5] / 100, f[6] / 100, 0]);
    }
    expect(normalizeCityRelics(v1)).toEqual(R);
    expect(JSON.stringify(R).length).toBeLessThan(JSON.stringify(v1).length * 0.5);
  });
});
