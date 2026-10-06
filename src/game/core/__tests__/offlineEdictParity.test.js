// LE FARM HORS LIGNE REJOUE LA GRÂCE ET « PRÉPARER » (audit 2026-10-05, BUG-76,
// décision de Raph : parité). En ligne, l'Édit attend autoCollapseDelay() après
// l'annonce de la crise terminale, et tente Rationner puis Réformes si
// « préparer » est coché. Hors ligne, la chute tombait au pas même de l'annonce :
// fermer le jeu farmait plus vite que le laisser ouvert, et le réglage était ignoré.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { state, setState, hydrateState, invalidateRenderCache, setGamePaused, setCollapseInProgress } from "../state.js";
import { applyOfflineProgress } from "../main.js";
import { dismissIdleReport } from "../idleReport.js";
import { autoCollapseDelay } from "../mechanics.js";
import { FIXED_NOW } from "./fixtures.js";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  setGamePaused(false);
  setCollapseInProgress(false);
});

afterEach(() => {
  dismissIdleReport();
  setGamePaused(false);
  setCollapseInProgress(false);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const GRACE_SEC = autoCollapseDelay() / 1000;

// Cité du farm (auto-achat + Édit « rupture100 »), en crise terminale ouverte à
// l'instant du départ : la grâce entière reste à courir pendant l'absence.
const terminalFarm = (t, prepare, extra = {}) => ({
  population: 100000, food: 400000, gold: 200000, knowledge: 30000, infrastructure: 3000,
  ruins: 5000, cycles: 10, instability: 1, timeWear: 0.3, bestEraIndex: 6,
  cyclePeaks: { population: 120000, knowledge: 35000, infrastructure: 3500, eraIndex: 6 },
  buildings: { foragers: 30, granaries_city: 20, caravans: 12, markets: 8, irrigated_fields: 6 },
  upgrades: { conseil_de_crise: true, edit_effondrement: true },
  hephHeritage: true, crisisLimitAnnounced: true, crisisOpenedAt: t,
  crisisDoctrine: { p25: "stabiliser", p50: "stabiliser", p75: "stabiliser", autoCollapse: { enabled: true, trigger: "rupture100", timeSeconds: 3600, usureThreshold: 0.9, prepare } },
  cycleStartedAt: t - 3_600_000, lastTick: t,
  ...extra
});

function runAbsence(seconds, prepare, extra) {
  const departed = FIXED_NOW - seconds * 1000;
  vi.setSystemTime(departed);
  setState(hydrateState(terminalFarm(departed, prepare, extra)));
  vi.setSystemTime(FIXED_NOW);
  invalidateRenderCache("all");
  const before = { cycles: state.cycles, rationing: state.crisisActions.rationing || 0, reforms: state.crisisActions.reforms || 0 };
  applyOfflineProgress(seconds);
  return before;
}

describe("BUG-76 — le farm hors ligne attend la grâce terminale, comme le jeu ouvert", () => {
  it("absence plus courte que la grâce : la cité n'est pas encore tombée", () => {
    const before = runAbsence(GRACE_SEC - 20, false);
    expect(state.cycles).toBe(before.cycles);
    expect(state.crisisLimitAnnounced).toBe(true);
  });

  it("absence qui couvre la grâce : l'Édit effondre", () => {
    const before = runAbsence(GRACE_SEC + 20, false);
    expect(state.cycles).toBe(before.cycles + 1);
  });
});

describe("BUG-76 — « préparer » s'applique pendant l'absence", () => {
  it("préparer coché et Rationnement payable : la crise est tentée au lieu de la chute", () => {
    const before = runAbsence(GRACE_SEC + 20, true);
    expect(state.crisisActions.rationing + state.crisisActions.reforms).toBeGreaterThan(before.rationing + before.reforms);
    expect(state.cycles).toBe(before.cycles); // la chute est reportée d'une grâce
  });

  it("préparer coché mais rien de payable : l'Édit effondre après la grâce", () => {
    const before = runAbsence(GRACE_SEC + 20, true, { food: 0, gold: 0, knowledge: 0, infrastructure: 0 });
    expect(state.crisisActions.rationing + state.crisisActions.reforms).toBe(before.rationing + before.reforms);
    expect(state.cycles).toBe(before.cycles + 1);
  });
});
