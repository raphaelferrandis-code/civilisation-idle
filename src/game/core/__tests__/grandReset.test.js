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
    const fresh = buildGrandResetState(3);
    for (const f of GR_PERSISTENT_FIELDS) {
      if (sentinels[f] instanceof Decimal) {
        expect(fresh[f] instanceof Decimal && fresh[f].eq(sentinels[f]), `${f} non préservé`).toBe(true);
      } else {
        expect(fresh[f], `${f} non préservé`).toEqual(sentinels[f]);
      }
    }
  });

  it("tout héritage permanent (*Heritage) de defaultState figure dans GR_PERSISTENT_FIELDS", () => {
    // Barre la CLASSE de bug (déjà survenue : olympus, puis eneeHeritage) : un
    // déblocage mythique `xxxHeritage` absent de la liste est silencieusement
    // effacé au 1er Grand Reset — et comme mythsCompleted survit, le mythe reste
    // « complété » donc l'héritage est IRRÉCUPÉRABLE. Ce test énumère
    // dynamiquement les champs *Heritage : aucun ne doit manquer à la liste.
    const base = defaultState();
    const heritageFields = Object.keys(base).filter((k) => /Heritage$/.test(k));
    expect(heritageFields.length, "aucun champ *Heritage trouvé — filtre cassé ?").toBeGreaterThan(5);
    for (const f of heritageFields) {
      expect(
        GR_PERSISTENT_FIELDS.includes(f),
        `${f} absent de GR_PERSISTENT_FIELDS → effacé au Grand Reset`
      ).toBe(true);
    }
  });

  it("préserve la méta-progression Olympe (profil débloqué) à travers un GR", () => {
    // Régression: olympus était absent de GR_PERSISTENT_FIELDS → effacé au GR.
    state.olympus = { ...state.olympus, unlockedProfile: "batisseur", totalPlayedSeconds: 9999 };
    const fresh = buildGrandResetState(2);
    expect(fresh.olympus.unlockedProfile).toBe("batisseur");
    expect(fresh.olympus.totalPlayedSeconds).toBe(9999);
  });

  it("réinitialise ce qui n'est PAS un héritage permanent (ruines, bâtiments, Faveur, cagnotte)", () => {
    state.ruins = new Decimal(99999);
    state.buildings = { ...state.buildings, foragers: 50 };
    state.faveur = 500;            // monnaie des jeux du temple : se re-gagne au GR
    state.icarusPotFaveur = 1200;  // cagnotte du temple : se re-nourrit au GR
    const fresh = buildGrandResetState(2);
    expect(fresh.ruins.eq(0)).toBe(true);
    expect(fresh.buildings.foragers).toBe(0);
    // Garde-fou : si quelqu'un ajoutait faveur/icarusPotFaveur à GR_PERSISTENT_FIELDS
    // (carburant éternel au lieu de se re-gagner), ce test le signalerait.
    expect(fresh.faveur).toBe(0);
    expect(fresh.icarusPotFaveur).toBe(0);
  });

  it("calcule grandResetCount et l'history (plus de coût de légitimité)", () => {
    const fresh = buildGrandResetState(4);
    expect(fresh.grandResetCount).toBe(4);
    expect(fresh.history[0]).toContain("Grand Reset x4");
    // La légitimité a été supprimée : le state frais n'en porte plus la trace.
    expect("legitimacy" in fresh).toBe(false);
  });

  it("ne mute pas le state courant (fonction pure)", () => {
    state.atlasHeritage = true;
    state.ruins = new Decimal(777);
    buildGrandResetState(2);
    expect(state.atlasHeritage).toBe(true);      // inchangé
    expect(state.ruins.eq(777)).toBe(true);      // inchangé
  });
});
