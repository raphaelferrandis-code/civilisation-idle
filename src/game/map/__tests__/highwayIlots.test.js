// L'AUTOROUTE DE L'ARTÈRE EN VILLE PAR ÎLOTS (audit 2026-10-05, BUG-16 ; choix A' de
// Raph). Son plan n'était calculé que sous `townOn`, faux aux bandes 2 à 9 depuis la
// ville par îlots : L.highway valait toujours null, l'autoroute validée le 02/10 avait
// disparu des bandes 6 à 9. Rebranchée au-dessus du cardo, SANS dégagement : seul
// l'échangeur prend du terrain, et ne déloge qu'une fois.
// Même méthode que ilotLayout.test.js : on fait grandir l'état GLOBAL.
import { describe, it, expect, beforeEach } from "vitest";
import { ILOT_MODE } from "../layout.js";
import { state, normalizeCityCore } from "../../core/state.js";
import { ROAD_MEMORY } from "../roadMemory.js";
import { vergeCells } from "../procedural/highwayPlan.js";
import { growCity as grow } from "../../../test/city.js";

const BUILT = new Set(["house", "enginehome", "engine"]);
const occupied = (L) => {
  const out = new Set();
  for (const t of L.tiles) {
    if (!BUILT.has(t.type)) continue;
    const sx = t.spanX || t.size || 1, sy = t.spanY || t.size || 1;
    for (let a = 0; a < sx; a += 1) for (let b = 0; b < sy; b += 1) out.add((t.gx + a) + "," + (t.gy + b));
  }
  return out;
};

beforeEach(() => {
  ROAD_MEMORY.on = true; ILOT_MODE.on = true;
  state.cityRoads = null; state.cityCore = null; state.cityMapSlots = {}; state.cityArchetype = null; state.cityPersonality = null; state.riverWP = null;
  state.wonders = [];
});

describe("l'autoroute de l'artère en ville par îlots", () => {
  it("présente à la bande 6, sur le cardo ; l'échangeur seul déloge, une fois, puis plus rien ne bouge", () => {
    const L5 = grow(27, 60);
    expect(L5.counts.eraBand).toBe(5);
    expect(L5.highway).toBeNull();
    const before = JSON.parse(JSON.stringify(state.cityMapSlots));
    const L = grow(30, 60);
    expect(L.counts.eraBand).toBe(6);
    const H = L.highway;
    expect(H, "autoroute à la bande 6 en mode îlots").toBeTruthy();
    expect(H.ax).toBe(Math.round(L.river.bridge.x));       // le tablier couvre le cardo
    expect(H.interchange, "échangeur").toBeTruthy();
    expect(state.cityCore.highway).toEqual({ sign: H.interchange.sign, dy: H.interchange.yc - L.cy });
    // … et le reste au rechargement : normalizeCityCore reconstruit la fiche champ par
    // champ (sans lui, chaque partie ouverte replanifiait ses îlots et rejouait le choix).
    expect(normalizeCityCore(JSON.parse(JSON.stringify(state.cityCore))).highway).toEqual(state.cityCore.highway);
    // Les pelouses : aucun bâtiment, en herbe (sauf une rue d'îlot qui les traverse).
    const occ = occupied(L);
    const lawn = H.lawn;
    expect(lawn.filter((k) => occ.has(k)), "bâtiments sur l'échangeur").toEqual([]);
    expect(lawn.filter((k) => !L.townGreen.has(k) && !L.roadSet.has(k))).toEqual([]);
    // SANS dégagement (A') : les maisons bordent toujours le cardo sous le tablier.
    const verge = vergeCells(H).filter((k) => !lawn.includes(k));
    expect(verge.some((k) => occ.has(k)), "bâtiments le long du tablier").toBe(true);
    // Seuls les bâtiments posés sous l'échangeur ont bougé ; aucun n'a disparu.
    const rel = lawn.map((k) => k.split(",").map(Number)).map(([x, y]) => [x - L.cx, y - L.cy]);
    const x0 = Math.min(...rel.map((p) => p[0])) - 2, x1 = Math.max(...rel.map((p) => p[0]));
    const y0 = Math.min(...rel.map((p) => p[1])) - 2, y1 = Math.max(...rel.map((p) => p[1]));
    const moved = [], gone = [];
    for (const [k, v] of Object.entries(before)) {
      const a = state.cityMapSlots[k];
      if (!a) gone.push(k);
      else if (a.dx !== v.dx || a.dy !== v.dy) moved.push(k);
    }
    expect(gone).toEqual([]);
    expect(moved.length, "relogés sous l'échangeur").toBeGreaterThan(0);
    const far = moved.filter((k) => { const v = before[k]; return v.dx < x0 || v.dx > x1 || v.dy < y0 || v.dy > y1; });
    expect(far, "bâtiments déplacés hors de l'échangeur").toEqual([]);
    // Le calcul suivant : même échangeur, plus aucun déplacement.
    const slots = JSON.stringify(state.cityMapSlots);
    const L2 = grow(30, 60);
    expect(L2.highway.interchange).toEqual(H.interchange);
    expect(JSON.stringify(state.cityMapSlots)).toBe(slots);
  });
});
