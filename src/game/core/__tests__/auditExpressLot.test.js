import { describe, it, expect } from "vitest";
import { state, setState, hydrateState, invalidateRenderCache, buildGrandResetState } from "../state.js";
import { resumeActiveRuinsChoiceIfPending } from "../actions/myths.js";
import { scarcityRawInstant, pressureBreakdown } from "../mechanics/production/pressure.js";

// Régressions du « lot express » de l'audit 2026-07-21. Les scénarios d'exploit
// et de perte y sont rejoués tels quels (M2 = Electron, M6 = automate et M7 =
// dialogue natif ne sont pas testables dans cette infra pure — vérifiés autrement).

describe("M20 — grRevealed ne révèle jamais de sceau jamais atteint (ordre-libre)", () => {
  it("save ORDRE-LIBRE (grClaimed présent) : legacyClaimedFromCount N'EST PAS appliqué", () => {
    // grClaimed {5,7}, grandResetCount 2 : sans la garde, grRevealed recevait
    // {1,2} → sceaux I/II réclamables sans condition, cliquet exploitable au F5.
    const s = hydrateState({ grClaimed: { 5: true, 7: true }, grandResetCount: 2 });
    expect(s.grRevealed[1]).toBeFalsy();
    expect(s.grRevealed[2]).toBeFalsy();
    expect(s.grRevealed[5]).toBe(true);
    expect(s.grRevealed[7]).toBe(true);
  });

  it("save LINÉAIRE (sans grClaimed) : la migration reste appliquée (N premiers révélés)", () => {
    const s = hydrateState({ grandResetCount: 2 });
    expect(s.grRevealed[1]).toBe(true);
    expect(s.grRevealed[2]).toBe(true);
    expect(s.grRevealed[3]).toBeFalsy();
  });
});

describe("M21 — les horodatages FUTURS survivent au reload (plus de clamp à « maintenant »)", () => {
  const FAR_FUTURE = 9000000000000; // ~an 2255, bien après Date.now() et sous MAX_SAFE_INTEGER

  it("atlasShoulderCdEnd : le cooldown d'ÉPAULER n'est plus rasé (fini le spam par reload)", () => {
    expect(hydrateState({ atlasShoulderCdEnd: FAR_FUTURE }).atlasShoulderCdEnd).toBe(FAR_FUTURE);
  });

  it("ragnarokArkNextAt : le cooldown de l'Arche n'est plus rasé (fini la triche par F5)", () => {
    expect(hydrateState({ ragnarokArkNextAt: FAR_FUTURE }).ragnarokArkNextAt).toBe(FAR_FUTURE);
  });

  it("atridesRenegotiate* : l'effet PAYÉ en cours et son cooldown survivent", () => {
    const s = hydrateState({ atridesRenegotiateActiveUntil: FAR_FUTURE, atridesRenegotiateCooldownEnd: FAR_FUTURE });
    expect(s.atridesRenegotiateActiveUntil).toBe(FAR_FUTURE);
    expect(s.atridesRenegotiateCooldownEnd).toBe(FAR_FUTURE);
  });
});

describe("M18 — la pression reste FINIE quand population*2.4 déborde le float", () => {
  // Fenêtre de débordement : population ∈ [7.5e307, 1.8e308] (ères transcendantes)
  // tandis que la Nourriture reste finie → population*2.4 = +Infinity, et le chemin
  // float rendait Infinity/Infinity = NaN, contaminant la Rupture à vie.
  it("scarcityRawInstant ne rend jamais NaN", () => {
    setState(hydrateState({ population: "1e308", food: "1e300" }));
    expect(Number.isFinite(scarcityRawInstant())).toBe(true);
  });

  it("pressureBreakdown().scarcity et .total restent finis", () => {
    setState(hydrateState({ population: "1e308", food: "1e300" }));
    state.scarcityRawEase = null; // force l'usage de scarcityRaw (le chemin corrigé), pas l'EMA
    invalidateRenderCache("all");
    const p = pressureBreakdown();
    expect(Number.isFinite(p.scarcity)).toBe(true);
    expect(Number.isFinite(p.total)).toBe(true);
  });
});

describe("nextBoonAt — un horodatage futur aberrant est borné à l'hydratation", () => {
  it("une valeur très au-delà de l'intervalle max est clampée (sinon aubaines bloquées à jamais)", () => {
    // Horloge système reculée après coup : nextBoonAt persisté à +30 jours.
    const aberrant = Date.now() + 30 * 24 * 3600 * 1000;
    const s = hydrateState({ nextBoonAt: aberrant });
    expect(s.nextBoonAt).toBeGreaterThan(0);
    expect(s.nextBoonAt).toBeLessThan(aberrant - 24 * 3600 * 1000); // clampé loin sous +30j
  });
});

describe("Grand Reset ordre-libre — le message du ×4 suit le SCEAU, pas le rang", () => {
  it("réclamer le sceau du Ragnarök (gr 11) en 5e annonce le ×4 Ruines", () => {
    expect(buildGrandResetState(5, 11).history[0]).toContain("x4 Ruines");
  });
  it("réclamer un autre sceau en 11e position n'annonce PAS le ×4", () => {
    expect(buildGrandResetState(11, 7).history[0]).not.toContain("x4 Ruines");
  });
});

describe("M15 — reprise du choix des Ruines actives", () => {
  it("sans choix en attente, resumeActiveRuinsChoiceIfPending est un no-op (ni modale, ni hang)", async () => {
    setState(hydrateState({}));
    state.pendingActiveRuinsChoice = false;
    await resumeActiveRuinsChoiceIfPending();
    expect(state.pendingActiveRuinsChoice).toBe(false);
  });
});
