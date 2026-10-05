import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { state, setState, defaultState, invalidateRenderCache } from "../state.js";
import { sedimentTiers, sedimentTierIndex, cycleAgeSec, ruinGain } from "../mechanics.js";

// BUG-51 (audit du 05/10) : l'encart d'état gardait une copie à la main des
// paliers de sédiment — fausse avec « Limon des âges » — et comptait l'âge du
// cycle sur Date.now(), là où la moisson le fige en crise terminale. La table
// et l'horloge sont désormais celles du moteur, lues par les deux.

const NOW = 1_800_000_000_000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  setState(defaultState());
  invalidateRenderCache("all");
});
afterEach(() => { vi.useRealTimers(); });

const pcts = (tiers) => tiers.map((t) => Math.round((t.mult - 1) * 100));

describe("paliers de sédiment partagés (BUG-51)", () => {
  it("table par défaut : 1 h, 8 h, 1 j, 3 j, 7 j — +2/15/45/135/400 %", () => {
    const t = sedimentTiers();
    expect(t.map((p) => p.secs)).toEqual([3600, 28800, 86400, 259200, 604800]);
    expect(pcts(t)).toEqual([2, 15, 45, 135, 400]);
    expect(sedimentTierIndex(2400, t)).toBe(-1);
    expect(sedimentTierIndex(604800, t)).toBe(4);
  });

  it("« Limon des âges » : paliers deux fois plus tôt, +5/25/80/220/600 %", () => {
    state.upgrades.limon_des_ages = true;
    invalidateRenderCache("all");
    const t = sedimentTiers();
    expect(t.map((p) => p.secs)).toEqual([1800, 14400, 43200, 129600, 302400]);
    expect(pcts(t)).toEqual([5, 25, 80, 220, 600]);
    // 40 min de cycle : le premier palier est déjà franchi (il ne l'est pas sans le nœud).
    expect(sedimentTierIndex(2400, t)).toBe(0);
  });

  it("la moisson applique le palier de la table partagée", () => {
    state.upgrades.limon_des_ages = true;
    invalidateRenderCache("all");
    state.cyclePeaks = { ...state.cyclePeaks, population: 1e9 };
    state.cycleStartedAt = NOW - 1700 * 1000;   // juste avant le 1er palier boosté
    const avant = ruinGain(true).toNumber();
    state.cycleStartedAt = NOW - 1900 * 1000;   // juste après : ×1,05
    const apres = ruinGain(true).toNumber();
    expect(apres).toBeGreaterThan(avant);
  });

  it("l'âge du cycle est figé en crise terminale, comme la moisson", () => {
    state.cycleStartedAt = NOW - 3000 * 1000;
    expect(cycleAgeSec()).toBeCloseTo(3000, 6);
    state.crisisLimitAnnounced = true;
    state.crisisOpenedAt = NOW - 1000 * 1000;
    vi.setSystemTime(NOW + 3600 * 1000);
    expect(cycleAgeSec()).toBeCloseTo(2000, 6);
  });
});
