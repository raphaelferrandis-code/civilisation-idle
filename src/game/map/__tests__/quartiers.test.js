// LES QUARTIERS ET LEURS REPÈRES (docs/PLAN-LISIBILITE.md, Q+R, 2026-10-06) — « je vois
// la ville, pas les quartiers de la ville ». Une ville NÉE avec ses quartiers (fiche `q`)
// groupe ses halles par famille, un quart de ville chacune, et chaque quartier a UN repère
// (3×3, seul sur son îlot) ; les autres halles plafonnent à 2×2. Une fiche d'avant ne
// change pas (sa ville ne se réorganise pas).
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ILOT_QUARTERS } from "../ilotLayout.js";
import { CM_QUARTER_OF } from "../cityBuildings.js";
import { state } from "../../core/state.js";
import { growCity as grow } from "../../../test/city.js";

const Q0 = { ...ILOT_QUARTERS };
beforeEach(() => {
  state.cityRoads = null; state.cityCore = null; state.cityMapSlots = {}; state.cityArchetype = null; state.cityPersonality = null; state.riverWP = null;
  state.wonders = [];
});
afterEach(() => { Object.assign(ILOT_QUARTERS, Q0); });

// Les halles : la tuile moteur NON-annexe (groupIndex 1) de chaque bâtiment des îlots.
const hallsOf = (L) => L.tiles.filter((t) => t.type === "engine" && t.groupIndex === 1 && CM_QUARTER_OF[t.buildingId] && !t.body);
const isLandmark = (L, t) => [...(L.landmarks || [])].some((k) => t.key.includes(":" + k + ":"));

describe("les quartiers d'une ville neuve", () => {
  it("bande 5 : halles dans leur quartier, quatre repères 3×3 seuls sur leur îlot, les autres ≤ 2×2", () => {
    const L = grow(27);
    expect(L.counts.eraBand).toBe(5);
    expect(state.cityCore.ilot.q).toBe(1);
    expect(typeof L.quarterAt).toBe("function");
    const halls = hallsOf(L);
    expect(halls.length).toBeGreaterThan(15);
    const home = halls.filter((t) => L.quarterAt(t.gx, t.gy) === CM_QUARTER_OF[t.buildingId]).length;
    expect(home / halls.length, "halles chez elles").toBeGreaterThan(0.8);
    const lms = halls.filter((t) => isLandmark(L, t));
    expect(lms.length).toBe(4);
    expect(new Set(lms.map((t) => CM_QUARTER_OF[t.buildingId])).size).toBe(4);
    for (const t of lms) {
      expect(t.size, t.buildingId).toBe(ILOT_QUARTERS.lmSize);
      // Seul sur son îlot : aucune habitation dans le carré 6×6 qui l'entoure (îlot 4×4 + rues).
      const near = L.tiles.filter((u) => (u.type === "house" || u.type === "enginehome" || u.body) && Math.abs(u.gx - t.gx - 1) <= 2 && Math.abs(u.gy - t.gy - 1) <= 2);
      expect(near.length, "habitations sur l'îlot du repère " + t.buildingId).toBe(0);
    }
    for (const t of halls) if (!isLandmark(L, t)) expect(t.size || 1, t.buildingId).toBeLessThanOrEqual(ILOT_QUARTERS.hallCap);
    // Le repère est le meilleur de sa famille parmi les présents (la bourse avant le marché…).
    expect(lms.map((t) => t.buildingId).sort()).toEqual(["granaries_city", "imperial_exchanges", "ministries", "universities"].sort());
  });

  it("puis plus rien ne bouge, et les repères restent les mêmes", () => {
    grow(27);
    const slots = JSON.stringify(state.cityMapSlots), lm = JSON.stringify(state.cityCore.ilot.lm);
    grow(27);
    expect(JSON.stringify(state.cityMapSlots)).toBe(slots);
    expect(JSON.stringify(state.cityCore.ilot.lm)).toBe(lm);
  });

  it("une fiche d'avant (sans quartiers) ne se réorganise pas", () => {
    ILOT_QUARTERS.on = false;
    grow(27);
    expect(state.cityCore.ilot.q).toBeFalsy();
    const slots = JSON.stringify(state.cityMapSlots);
    ILOT_QUARTERS.on = true;
    const L = grow(27);
    expect(L.quarterAt).toBeNull();
    expect(JSON.stringify(state.cityMapSlots)).toBe(slots);
  });
});
