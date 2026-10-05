// saveVersion N'EST PLUS CRUE SUR PAROLE (audit 2026-10-05, SAV-11).
// migrate() partait de 0 pour toute saveVersion non entière (absente, null,
// « abc », 7.0001, {}) : les migrations 5 et 6 — qui ne sont pas idempotentes —
// rejouaient sur une save déjà en v7. Faveur ×1 000, cadeaux de rang rendus une
// deuxième fois, cagnotte, caisse, vols offerts, planchers et registre ×1 000.
// Négative, la boucle comptait jusqu'à 0 : −1e9 figeait la page 5 minutes avant
// tout rendu, −1e12 pour toujours, à chaque lancement. Et le nuage lisait la
// version autrement (`Number() || 0`) que migrate (Number.isInteger).
import { describe, it, expect } from "vitest";

import { hydrateState, migrate, resolveSaveVersion, CURRENT_SAVE_VERSION } from "../state.js";
import { isFutureSave, saveVersionOf } from "../saveKey.js";
import { FAVEUR_ECHELLE } from "../balance.js";
import { MID_GAME_FIXTURE } from "./fixtures.js";

// Une vraie save v7 sérialisée, avec de la Faveur partout et des cadeaux de rang
// déjà possédés (colombier, serres, automatisation des osselets) : la migration 5
// les rembourserait, la 6 multiplierait tout.
function v7Save() {
  const s = hydrateState({
    ...MID_GAME_FIXTURE,
    saveVersion: CURRENT_SAVE_VERSION,
    faveur: 5_000_000, icarusPotFaveur: 200_000, trunkFaveur: 30_000,
    icarusFreeFlights: [4_000, 10_000],
    templeArtifacts: { colombier: true, serres: true },
    templeAuto: { osselets: { unlocked: true, on: true, faveurFloor: 50_000 } },
    maisonRank: 2, maisonReputation: 12,
  });
  return JSON.parse(JSON.stringify(s));
}

const money = (s) => ({
  faveur: s.faveur, pot: s.icarusPotFaveur, trunk: s.trunkFaveur, flights: s.icarusFreeFlights,
  floor: s.templeAuto?.osselets?.faveurFloor, earned: s.chronicleStats?.faveurEarned,
  giftRefund: s.maisonGiftRefund, refund: s.maisonRefund,
});

describe("SAV-11 — une saveVersion abîmée ne rejoue plus les migrations", () => {
  const reference = money(hydrateState(v7Save()));

  it("la save de référence garde sa Faveur telle quelle", () => {
    expect(reference.faveur).toBe(5_000_000);
    expect(reference.giftRefund).toBe(0);
  });

  for (const [label, sv] of [
    ["absente", undefined], ["null", null], ["« 7 » en chaîne", "7"], ["7.0001", 7.0001],
    ["{}", {}], ["« abc »", "abc"], ["négative (−1)", -1], ["true", true], ["[]", []],
  ]) {
    it(`saveVersion ${label} : Faveur, cagnotte, caisse, vols, planchers et registre intacts`, () => {
      const raw = v7Save();
      if (sv === undefined) delete raw.saveVersion; else raw.saveVersion = sv;
      const out = hydrateState(raw);
      expect(money(out)).toEqual(reference);
      expect(out.saveVersion).toBe(CURRENT_SAVE_VERSION);
    });
  }

  it("saveVersion −1e12 (et 1e400 → Infinity) : hydratation immédiate, sans boucle", () => {
    for (const sv of [-1e12, -1e9, Number.MIN_SAFE_INTEGER]) {
      const raw = v7Save();
      raw.saveVersion = sv;
      const t0 = performance.now();
      const out = hydrateState(raw);
      // Avant : 316 s pour −1e9, jamais pour −1e12. Large marge pour la CI.
      expect(performance.now() - t0).toBeLessThan(500);
      expect(out.faveur).toBe(5_000_000);
    }
    const text = JSON.stringify(v7Save()).replace(/"saveVersion":\d+/, '"saveVersion":1e400');
    const parsed = JSON.parse(text);
    expect(parsed.saveVersion).toBe(Infinity);
    expect(isFutureSave(parsed)).toBe(false);
    expect(hydrateState(parsed).faveur).toBe(5_000_000);
  });

  it("une save v7 déclarée à tort plus ancienne (6, 5, 0) ne rejoue pas ce qu'elle porte déjà", () => {
    for (const sv of [6, 5, 4, 0]) {
      const raw = v7Save();
      raw.saveVersion = sv;
      expect(money(hydrateState(raw)), `saveVersion ${sv}`).toEqual(reference);
    }
  });
});

describe("SAV-11 — les vraies vieilles saves migrent toujours", () => {
  it("v0 sans aucun témoin : « absente = v0 », la Faveur passe à l'échelle", () => {
    const out = migrate({ population: 1234, faveur: 5 });
    expect(out.faveur).toBe(5 * FAVEUR_ECHELLE);
    expect(out.population).toBe("1234");
  });

  it("v4 sans saveVersion : les achats de chances sont remboursés, puis mis à l'échelle", () => {
    const out = migrate({ faveur: 10, wingLevel: 1 });
    expect(out.maisonRefund).toBe(90 * FAVEUR_ECHELLE);
    expect(out.faveur).toBe(100 * FAVEUR_ECHELLE);
  });

  it("v6 sans saveVersion (rang de la Maison, pas de roue) : seule l'échelle ×1 000 s'applique", () => {
    const out = migrate({ faveur: 42, maisonRank: 1, maisonReputation: 2, templeArtifacts: { colombier: true } });
    expect(out.faveur).toBe(42 * FAVEUR_ECHELLE); // le colombier n'est PAS remboursé une 2e fois
    expect(out.maisonGiftRefund).toBeUndefined();
  });

  it("la version de départ : déclarée si elle est saine, jamais sous le témoin", () => {
    expect(resolveSaveVersion({ saveVersion: 3 })).toBe(3);
    expect(resolveSaveVersion({ saveVersion: "5" })).toBe(5);
    expect(resolveSaveVersion({ saveVersion: 99 })).toBe(CURRENT_SAVE_VERSION);
    expect(resolveSaveVersion({ saveVersion: -4 })).toBe(0);
    expect(resolveSaveVersion({ saveVersion: 2, maisonRank: 0 })).toBe(6);
    expect(resolveSaveVersion({ roueAt: 0 })).toBe(7);
  });
});

describe("SAV-11 — une seule lecture de saveVersion (migrate, garde « plus récente », nuage)", () => {
  it("saveVersionOf : un entier, ou NaN", () => {
    expect(saveVersionOf({ saveVersion: 7 })).toBe(7);
    expect(saveVersionOf({ saveVersion: "8" })).toBe(8);
    for (const sv of [undefined, null, "", "abc", 7.5, {}, [], true]) {
      expect(saveVersionOf({ saveVersion: sv }), JSON.stringify(sv)).toBeNaN();
    }
    expect(saveVersionOf(null)).toBeNaN();
  });

  it("isFutureSave suit la même lecture", () => {
    expect(isFutureSave({ saveVersion: CURRENT_SAVE_VERSION + 1 })).toBe(true);
    expect(isFutureSave({ saveVersion: String(CURRENT_SAVE_VERSION + 1) })).toBe(true);
    expect(isFutureSave({ saveVersion: String(CURRENT_SAVE_VERSION) })).toBe(false);
    expect(isFutureSave({ saveVersion: -3 })).toBe(false);
    // 7.5 n'est pas une version : avant, le nuage la tenait pour « plus récente »
    // pendant que migrate la prenait pour une v0.
    expect(isFutureSave({ saveVersion: CURRENT_SAVE_VERSION + 0.5 })).toBe(false);
  });
});
