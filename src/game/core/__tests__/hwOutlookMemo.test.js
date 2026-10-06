// LA CLÉ DE MÉMO DU HOLD & WIN (audit du 2026-10-05, STRUCT-13 / jeux #9).
// hwOutlook mémorisait sous `k * 10 + r` : unique tant que SLOTS_HW.respins ≤ 10. À
// 11 relances, (k, 11) et (k + 1, 1) partageaient la clé ; le résultat ne restait
// juste que parce que le parcours en profondeur ne relisait jamais l'entrée écrasée
// (vérifié de 11 à 40 relances). La clé est désormais en base (respins + 1), unique
// quel que soit l'ordre du calcul. Garde : la version mémorisée rend exactement ce
// que rend la même récurrence SANS mémo, y compris au-delà de 10 relances.
import { describe, it, expect } from "vitest";
import { hwOutlook } from "../actions/slotsMath.js";
import { SLOTS_HW } from "../balance.js";

// La même récurrence que hwOutlook, sans aucun cache : exponentielle, mais juste par
// construction. Les grilles restent donc petites.
function referenceOutlook(k0, hw, cells) {
  const binom = (n, k) => { let c = 1; for (let i = 0; i < k; i += 1) c = (c * (n - i)) / (i + 1); return c; };
  const go = (k, r) => {
    if (k >= cells) return { coins: cells, full: 1 };
    if (r <= 0) return { coins: k, full: 0 };
    const m = cells - k, p = hw.pNew;
    let coins = 0, full = 0;
    for (let j = 0; j <= m; j += 1) {
      const pj = binom(m, j) * p ** j * (1 - p) ** (m - j);
      const nx = j > 0 ? go(k + j, hw.respins) : go(k, r - 1);
      coins += pj * nx.coins; full += pj * nx.full;
    }
    return { coins, full };
  };
  return go(k0, hw.respins);
}

describe("hwOutlook — mémo fidèle quel que soit le nombre de relances", () => {
  it.each([3, 11, 12])("respins = %i : identique à la récursion sans mémo", (respins) => {
    const hw = { ...SLOTS_HW, respins, pNew: 0.1 };
    for (const k0 of [1, 2, 3]) {
      const ref = referenceOutlook(k0, hw, 5);
      const got = hwOutlook(k0, hw, 5);
      expect(got.coins).toBeCloseTo(ref.coins, 12);
      expect(got.full).toBeCloseTo(ref.full, 12);
    }
  });

  it("le réglage livré (SLOTS_HW, grille de 15) est inchangé", () => {
    // respins = 3 : la vraie machine, comparée à la récurrence sans mémo.
    const o = hwOutlook(6, SLOTS_HW);
    const ref = referenceOutlook(6, SLOTS_HW, 15);
    expect(o.coins).toBeCloseTo(ref.coins, 12);
    expect(o.full).toBeCloseTo(ref.full, 12);
  });
});
