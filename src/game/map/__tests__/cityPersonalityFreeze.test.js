// LE PROFIL DE LA VILLE NE BASCULE PLUS EN COURS DE CYCLE (audit 2026-10-05, BUG-15).
// Les poids du tirage suivent les achats : sur un achat quelconque, le profil changeait
// (« modeste → fastueuse »), 610 maisons sur 692 changeaient de dessin d'un coup et le
// libellé « cité … » aussi. Le profil tiré au premier calcul du cycle est figé dans
// `state.cityPersonality`, remis à null à l'effondrement.
import { describe, it, expect, beforeEach } from "vitest";
import { computeCityLayout, ILOT_MODE } from "../layout.js";
import { computeCityPersonality, PERSONALITIES } from "../procedural/cityPersonality.js";
import { state, hydrateState, resetTemporaryRunState } from "../../core/state.js";
import { D } from "../../core/num.js";
import { eras } from "../../data/world.js";
import { ROAD_MEMORY } from "../roadMemory.js";

const IDS = Object.keys(state.buildings);
const at = (k) => { const b = {}; for (const id of IDS) b[id] = k; return b; };
// Une graine dont le tirage NON figé change de profil entre 20 et 30 achats par type.
function flippingSeed() {
  for (let sd = 1; sd < 500; sd += 1) {
    const seed = (sd * 2654435761) >>> 0;
    if (computeCityPersonality(seed, { buildings: at(20) }).id !== computeCityPersonality(seed, { buildings: at(30) }).id) return seed;
  }
  return 0;
}
function grow(seed, k) {
  const pop = D(eras[21].at);
  Object.assign(state, { cycles: 1, mapSeed: seed, population: pop, knowledge: pop.mul(0.05), infrastructure: pop.mul(0.1), instability: 0, timeWear: 0 });
  for (const id of IDS) state.buildings[id] = id === "roads" ? 10 : k;
  return computeCityLayout(state);
}

beforeEach(() => {
  ROAD_MEMORY.on = true; ILOT_MODE.on = true;
  state.cityRoads = null; state.cityCore = null; state.cityMapSlots = {}; state.cityArchetype = null; state.cityPersonality = null; state.riverWP = null;
});

describe("profil de la ville figé pour le cycle", () => {
  it("un achat ne fait plus basculer le profil, ni le dessin des maisons", () => {
    const seed = flippingSeed();
    expect(seed, "graine qui bascule").not.toBe(0);
    const A = grow(seed, 20);
    expect(state.cityPersonality).toBe(A.personality.id);
    const B = grow(seed, 30);
    expect(B.personality.id, "profil après l'achat").toBe(A.personality.id);
    // Le libellé de la Cité (CityView) relit le même profil.
    expect(computeCityPersonality(seed, state).label).toBe(B.personality.label);
    // Les maisons restées à leur place gardent leur dessin.
    const byPos = (L) => new Map(L.tiles.filter((t) => t.type === "house" || t.type === "enginehome").map((t) => [(t.gx - L.cx) + "," + (t.gy - L.cy), t.variant]));
    const a = byPos(A), b = byPos(B);
    let same = 0, changed = 0;
    for (const [k, v] of a) { if (!b.has(k)) continue; if (b.get(k) === v) same += 1; else changed += 1; }
    expect(same).toBeGreaterThan(100);
    expect(changed, "maisons qui changent de dessin").toBe(0);
  }, 60000);

  it("la surcouche de crise reste dynamique", () => {
    const seed = flippingSeed();
    state.cityPersonality = computeCityPersonality(seed, { buildings: at(20) }).id;
    const calm = computeCityPersonality(seed, { ...state, instability: 0, timeWear: 0 });
    const crisis = computeCityPersonality(seed, { ...state, instability: 1, timeWear: 0 });
    expect(crisis.id).toBe(calm.id);
    expect(crisis.overlayId).toBe("effondrement");
    computeCityPersonality(seed, { ...state, instability: 0, timeWear: 0 });   // l'hystérésis retombe
  });

  it("survit au rechargement, s'oublie au nouveau cycle", () => {
    const id = Object.keys(PERSONALITIES)[3];
    expect(hydrateState({ cityPersonality: id }).cityPersonality).toBe(id);
    expect(hydrateState({ cityPersonality: "inconnue" }).cityPersonality).toBe(null);
    expect(hydrateState({ cityPersonality: "constructor" }).cityPersonality).toBe(null);
    expect(hydrateState({}).cityPersonality).toBe(null);
    const s = { cityPersonality: id };
    resetTemporaryRunState(s);
    expect(s.cityPersonality).toBe(null);
  });
});
