// PORTÉE « upgrades » DU CACHE DE RENDU (audit 2026-10-05, MORT-11 / economie).
// getBuildingSums lit des NŒUDS (milestoneStep de Ville-Monde, riverEngineMult) :
// la portée ciblée « upgrades » ne vidait pas _buildingSums, et un nœud posé
// laissait les débits périmés jusqu'au prochain achat de bâtiment (mesuré :
// 3 574 au lieu de 6 795 /s).
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { state, setState, hydrateState, invalidateRenderCache, bumpFrame } from "../state.js";
import { rates } from "../mechanics.js";
import { MID_GAME_FIXTURE, FIXED_NOW } from "./fixtures.js";

beforeAll(() => { vi.spyOn(Date, "now").mockReturnValue(FIXED_NOW); });
afterAll(() => { vi.restoreAllMocks(); });

describe("invalidateRenderCache(\"upgrades\")", () => {
  it("un nœud qui touche les sommes de bâtiments rafraîchit les débits", () => {
    setState(hydrateState({ ...MID_GAME_FIXTURE }));
    state.buildings.foragers = 40;
    invalidateRenderCache("all");
    bumpFrame();
    const before = rates().population.toNumber();
    state.upgrades.ville_monde = true;
    invalidateRenderCache("upgrades");
    bumpFrame();
    const scoped = rates().population.toNumber();
    invalidateRenderCache("all");
    bumpFrame();
    const full = rates().population.toNumber();
    expect(full).not.toBe(before);          // le nœud compte bien
    expect(scoped).toBe(full);              // la portée ciblée suffit
  });
});
