// LE LIEU DES PLAISIRS NE NOIE AUCUNE RUE (Raph 2026-10-04 : « vas-y pour les Plaisirs
// aussi »). Le lieu s'éloigne de la ville quand elle grandit et évase le lit autour de
// lui (+2,5 cases de demi-largeur, axe poussé de 1,4) : une place dont l'évasement
// mettrait sous l'eau une rue déjà mémorisée est sautée.
import { describe, it, expect, beforeEach } from "vitest";
import { ILOT_MODE } from "../layout.js";
import { state } from "../../core/state.js";
import { ROAD_MEMORY } from "../roadMemory.js";
import { growCity as grow } from "../../../test/city.js";

beforeEach(() => {
  ROAD_MEMORY.on = true; ILOT_MODE.on = true;
  state.cityRoads = null; state.cityCore = null; state.cityMapSlots = {}; state.cityArchetype = null; state.cityPersonality = null; state.riverWP = null;
});

describe("le lieu des Plaisirs et les rues", () => {
  it("une rue mémorisée que l'évasement noierait fait déplacer le lieu, et reste au sec", () => {
    grow(21);
    const L = grow(21);
    const p = L.river.plaisirs;
    expect(p).toBeTruthy();
    // Une case d'eau qui ne l'est QUE par l'évasement : à 5,8 cases de l'axe évasé,
    // en travers du courant (le lit d'origine s'arrête à 3,6 + 1,4 de poussée).
    let cell = null;
    for (const sgn of [1, -1]) {
      const x = Math.floor(p.x - sgn * 5.8 * p.ty), y = Math.floor(p.y + sgn * 5.8 * p.tx);
      if (L.river.isWater(x, y)) { cell = [x, y]; break; }
    }
    expect(cell, "case noyée par le seul évasement").toBeTruthy();
    // La rue « d'hier » sur cette case (sentier le long de X).
    state.cityRoads.cells.push(cell[0] - L.cx, cell[1] - L.cy, 8);
    const L2 = grow(21);
    const p2 = L2.river.plaisirs;
    expect(Math.hypot(p2.x - p.x, p2.y - p.y), "le lieu a pris une autre place").toBeGreaterThan(1);
    expect(L2.river.isWater(cell[0], cell[1]), "la rue n'est plus sous l'eau").toBe(false);
  });

  it("sans rue sur son chemin, le lieu garde sa place d'un calcul à l'autre", () => {
    grow(21);
    const L1 = grow(21);
    const L2 = grow(21);
    expect([L2.river.plaisirs.x, L2.river.plaisirs.y]).toEqual([L1.river.plaisirs.x, L1.river.plaisirs.y]);
  });
});
