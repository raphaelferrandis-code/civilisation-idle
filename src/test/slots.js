// Pilotage de la machine à sous dans les tests (audit 2026-10-05, TEST-9) — slots.test.js
// et slotsSeriesBonus.test.js en avaient chacun leur copie, avec deux pas de balayage
// différents.
import { vi } from "vitest";
import { spinSlots, slotsWindow, slotsEvaluate } from "../game/core/actions/slots.js";
import { SLOTS_REELS } from "../game/core/balance.js";

// Des arrêts qui donnent une fenêtre voulue. 29⁵ est trop grand pour tout parcourir :
// on balaie les trois premiers rouleaux et un arrêt sur trois des deux derniers (au
// pire 2,4 millions d'évaluations, quelques secondes). `known` : des arrêts déjà
// trouvés, revérifiés d'abord — la recherche brute de « 3 bar » coûte 1,5 million
// d'évaluations (TEST-8) ; si les rouleaux changent, on retombe sur la recherche.
// Rend null si aucune fenêtre ne convient : à l'appelant de l'exiger (TEST-13), jamais
// de `if (!st) return` qui ferait passer un test vide.
export function stopsWhere(pred, known = null) {
  if (known && pred(slotsEvaluate(slotsWindow(known)), known)) return known;
  const L = SLOTS_REELS.map((r) => r.length);
  for (let a = 0; a < L[0]; a += 1) for (let b = 0; b < L[1]; b += 1) for (let c = 0; c < L[2]; c += 1) {
    for (let d = 0; d < L[3]; d += 3) for (let e = 0; e < L[4]; e += 3) {
      const st = [a, b, c, d, e];
      if (pred(slotsEvaluate(slotsWindow(st)), st)) return st;
    }
  }
  return null;
}

// Le tirage Math.random qui arrête chaque rouleau au milieu de l'arrêt voulu.
const rnd = (stops) => stops.map((s, r) => (s + 0.5) / SLOTS_REELS[r].length);

// Un tour aux arrêts voulus : `tail` = les tirages suivants (roue, Hold & Win…), puis
// `rest` pour tout le reste.
export function spinWith(stops, stake, tail = [], opts = {}, rest = 0.999) {
  const seq = [...rnd(stops), ...tail];
  const spy = vi.spyOn(Math, "random").mockImplementation(() => (seq.length ? seq.shift() : rest));
  try {
    return spinSlots(stake, opts);
  } finally {
    spy.mockRestore();
  }
}
