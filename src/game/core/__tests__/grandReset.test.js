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
  buildGrandResetState, resetTemporaryRunState, GR_PERSISTENT_FIELDS
} from "../state.js";
import {
  GRAND_RESET_PROD_BASE, GRAND_RESET_RUIN_BASE,
  grandResetProductionMult, grandResetRuinGainMult
} from "../balance.js";
import { selectClaimableSeals } from "../mechanics/grandResetMilestones.js";
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

  it("resetTemporaryRunState n'efface AUCUN champ de GR_PERSISTENT_FIELDS", () => {
    // Barre la CLASSE de bug qu'a subie `prometheeBraisiers` : un héritage PERMANENT
    // rangé par erreur parmi les traqueurs de run. resetTemporaryRunState tourne à la
    // FIN de completeCollapse, ~95 lignes APRÈS applyHeritage — donc l'effondrement
    // qui accorde l'héritage l'effaçait aussitôt, et comme mythsCompleted survit, le
    // Mythe restait « complété » : héritage IRRÉCUPÉRABLE sans migration de save.
    // Le test *Heritage ci-dessus ne l'attrapait pas (le champ ne finit pas par
    // « Heritage »), d'où cette garde qui porte sur la liste entière.
    const base = defaultState();
    const s = defaultState();
    const sentinels = {};
    for (const f of GR_PERSISTENT_FIELDS) {
      const v = sentinelFor(base[f], f);
      sentinels[f] = v;
      s[f] = v;
    }
    resetTemporaryRunState(s);
    const effaces = GR_PERSISTENT_FIELDS.filter((f) => {
      const v = sentinels[f];
      return v instanceof Decimal ? !(s[f] instanceof Decimal && s[f].eq(v)) : s[f] !== v;
    });
    expect(effaces, `champs persistants effacés par une fin de cycle : ${effaces.join(", ")}`).toEqual([]);
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

// Lot de sceaux (2026-07-22) : quand plusieurs sceaux sont prêts, le joueur les
// coche et les réclame dans UN SEUL reset au lieu d'enchaîner les effacements.
// Le lot doit rester strictement équivalent aux resets un par un.
describe("Grand Reset — réclamation par lot", () => {
  // Mime ce que fait performGrandReset autour de buildGrandResetState : marque
  // les sceaux réclamés sur le state courant, puis bascule sur le state frais.
  function claim(seals) {
    const list = selectClaimableSeals(seals);
    if (!list.length) return;
    if (!state.grClaimed) state.grClaimed = {};
    for (const n of list) state.grClaimed[n] = true;
    setState(buildGrandResetState((state.grandResetCount || 0) + list.length, list));
  }

  beforeEach(() => {
    // Les sceaux 1, 2 et 3 sont bankés (découverts), aucun réclamé.
    state.grRevealed = { 1: true, 2: true, 3: true };
    state.grClaimed = {};
  });

  it("ne retient que les sceaux réclamables, dédoublonnés et ordonnés", () => {
    state.grClaimed = { 2: true };
    expect(selectClaimableSeals([3, 1, 3, 2, 9, 99])).toEqual([1, 3]);
    // 2 est déjà réclamé, 9 n'est pas banké, 99 n'existe pas.
  });

  it("accepte un numéro seul (le bouton d'une rangée) comme une liste d'un", () => {
    expect(selectClaimableSeals(1)).toEqual([1]);
    expect(selectClaimableSeals(9)).toEqual([]);
    expect(selectClaimableSeals(undefined)).toEqual([]);
  });

  it("laisse le Ragnarök hors du lot tant que le pacte final n'est pas honoré", () => {
    state.grRevealed = { 1: true, 11: true };
    expect(selectClaimableSeals([1, 11])).toEqual([1]);
    state.ragnarokHeritage = true;
    expect(selectClaimableSeals([1, 11])).toEqual([1, 11]);
  });

  it("un lot de 3 sceaux vaut exactement 3 resets d'affilée", () => {
    claim([1, 2, 3]);
    const batch = { count: state.grandResetCount, claimed: { ...state.grClaimed } };

    setState(hydrateState({}));
    state.grRevealed = { 1: true, 2: true, 3: true };
    state.grClaimed = {};
    claim(1); claim(2); claim(3);

    expect(state.grandResetCount).toBe(batch.count);
    expect(state.grClaimed).toEqual(batch.claimed);
    // Le multiplicateur ne dépend QUE du compte : pas de perte à grouper.
    expect(grandResetProductionMult(state.grandResetCount))
      .toBe(Math.pow(GRAND_RESET_PROD_BASE, 3));
  });

  it("le récit du lot annonce la production ET le x4 du Ragnarök", () => {
    // Régression : l'ancien texte en ou-exclusif taisait la production quand le
    // sceau 11 était réclamé, et inventait le x4 quand le 11e rang ne l'était pas.
    const avecRagnarok = buildGrandResetState(11, [4, 11]).history[0];
    expect(avecRagnarok).toContain("production");
    expect(avecRagnarok).toContain("x4 Ruines du Ragnarok");

    const sansRagnarok = buildGrandResetState(11, [4, 7]).history[0];
    expect(sansRagnarok).toContain("production");
    expect(sansRagnarok).not.toContain("Ragnarok");
  });
});

// Les deux bases du Grand Reset ont été DÉCOUPLÉES (2026-07-18). Une base unique
// se sabotait elle-même : la monter pour rendre le sceau attractif multipliait
// aussi la moisson, dont le stock re-entre dans ruinMultiplier et
// unspentRuinsPower. Ce test interdit de les re-fusionner par inadvertance.
describe("Grand Reset — bases production / moisson découplées", () => {
  it("chaque base gouverne SA courbe, et elles ne sont pas la même", () => {
    expect(GRAND_RESET_PROD_BASE).not.toBe(GRAND_RESET_RUIN_BASE);
    for (const n of [0, 1, 3, 7, 11]) {
      expect(grandResetProductionMult(n)).toBe(Math.pow(GRAND_RESET_PROD_BASE, n));
      expect(grandResetRuinGainMult(n)).toBe(Math.pow(GRAND_RESET_RUIN_BASE, n));
    }
  });

  it("la production récompense plus fort que la moisson (l'arbitrage du sceau)", () => {
    // Le sceau est PERMANENT, le stock de ruines non : c'est ce qui justifie
    // d'avoir déplacé de la puissance des Ruines vers le Grand Reset.
    expect(GRAND_RESET_PROD_BASE).toBeGreaterThan(GRAND_RESET_RUIN_BASE);
    expect(grandResetProductionMult(11)).toBeGreaterThan(grandResetRuinGainMult(11));
  });

  it("compteur nul ou négatif : les deux courbes valent 1 (pas de bonus fantôme)", () => {
    for (const n of [0, -1, null, undefined]) {
      expect(grandResetProductionMult(n)).toBe(1);
      expect(grandResetRuinGainMult(n)).toBe(1);
    }
  });
});
