"use strict";
// Invariant de préservation du Grand Reset : tout champ de GR_PERSISTENT_FIELDS
// DOIT survivre à un GR ; tout le reste DOIT être réinitialisé.
// buildGrandResetState() est la partie PURE de performGrandReset (la séquence
// async à dialogue n'est pas testable ici). Ce test ne peut pas deviner un champ
// OUBLIÉ dans la liste — mais il fige l'invariant, attrape toute régression de la
// recopie, et documente le contrat « ajouter ici tout nouvel héritage permanent ».

import { describe, it, expect, beforeEach } from "vitest";
import {
  state, setState, hydrateState, defaultState,
  buildGrandResetState, GR_PERSISTENT_FIELDS
} from "../state.js";
import { Decimal } from "../num.js";

// Valeur sentinelle distincte du defaultState, adaptée au type du champ.
function sentinelFor(def, field) {
  if (def instanceof Decimal) return new Decimal(123456);
  if (Array.isArray(def)) return [{ s: field }];
  if (def !== null && typeof def === "object") return { s: field };
  if (typeof def === "boolean") return true;   // tous les héritages défaut = false
  if (typeof def === "number") return 4242;
  return "SENTINEL_" + field;                  // string / null
}

beforeEach(() => {
  setState(hydrateState({}));
});

describe("Grand Reset — préservation des héritages", () => {
  it("recopie tous les GR_PERSISTENT_FIELDS", () => {
    const base = defaultState();
    const sentinels = {};
    for (const f of GR_PERSISTENT_FIELDS) {
      const v = sentinelFor(base[f], f);
      sentinels[f] = v;
      state[f] = v;
    }
    const fresh = buildGrandResetState(3, 0);
    for (const f of GR_PERSISTENT_FIELDS) {
      if (sentinels[f] instanceof Decimal) {
        expect(fresh[f] instanceof Decimal && fresh[f].eq(sentinels[f]), `${f} non préservé`).toBe(true);
      } else {
        expect(fresh[f], `${f} non préservé`).toEqual(sentinels[f]);
      }
    }
  });

  it("réinitialise ce qui n'est PAS un héritage permanent (ruines, bâtiments)", () => {
    state.ruins = new Decimal(99999);
    state.buildings = { ...state.buildings, foragers: 50 };
    const fresh = buildGrandResetState(2, 0);
    expect(fresh.ruins.eq(0)).toBe(true);
    expect(fresh.buildings.foragers).toBe(0);
  });

  it("calcule grandResetCount, legitimacy (− coût) et l'history", () => {
    state.legitimacy = 100;
    const fresh = buildGrandResetState(4, 30);
    expect(fresh.grandResetCount).toBe(4);
    expect(fresh.legitimacy).toBe(70);
    expect(fresh.history[0]).toContain("Grand Reset x4");
  });

  it("plancher la legitimacy à 0 si le coût dépasse l'acquis", () => {
    state.legitimacy = 10;
    const fresh = buildGrandResetState(5, 50);
    expect(fresh.legitimacy).toBe(0);
  });

  it("ne mute pas le state courant (fonction pure)", () => {
    state.atlasHeritage = true;
    state.ruins = new Decimal(777);
    buildGrandResetState(2, 0);
    expect(state.atlasHeritage).toBe(true);      // inchangé
    expect(state.ruins.eq(777)).toBe(true);      // inchangé
  });
});
