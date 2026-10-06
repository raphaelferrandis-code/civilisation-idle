// CADENCE DE LA BOUCLE (audit du 2026-10-05, PERF-57 ; décision de Raph : B). La
// tolérance du saut d'image est une demi-vsync MESURÉE (au plus 8 ms) : sur un écran
// rapide, le plafond « 60 » ne doit plus tourner à 72-82 i/s, et la cadence doit
// rester RÉGULIÈRE (même nombre de vsyncs entre deux images, pas de 2-3-2-3).
import { describe, it, expect } from "vitest";

import { makeVsyncEstimator, CADENCE_TOL_MAX } from "../frameCadence.js";

// Rejoue la règle de frameBody sur `sec` secondes de rappels rAF à `hz`, avec un
// bruit d'horloge de ±`jit` ms. Rend { fps, pas } : images acceptées par seconde
// (après 2 s de mise en route) et nombres de vsyncs entre deux images acceptées.
function rejoue(hz, capFps, { sec = 12, jit = 0.02 } = {}) {
  const est = makeVsyncEstimator();
  const vs = 1000 / hz, cap = 1000 / capFps;
  let last = 0, lastRaf = 0, n = 0, prevK = -1;
  const pas = new Set();
  const total = Math.round(sec * hz);
  for (let k = 1; k <= total; k += 1) {
    const now = k * vs + (((k * 7919) % 13) / 6 - 1) * jit;
    if (lastRaf) est.note(now - lastRaf);
    lastRaf = now;
    if (now - last < cap - est.tolerance()) continue;
    last = now;
    if (now >= 2000) {
      n += 1;
      if (prevK >= 0) pas.add(k - prevK);
      prevK = k;
    }
  }
  return { fps: n / (sec - 2), pas: [...pas] };
}

describe("tolérance d'une demi-vsync estimée", () => {
  it("sans mesure : 8 ms, comme avant ; 60 Hz : 8 ms (inchangé)", () => {
    const est = makeVsyncEstimator();
    expect(est.tolerance()).toBe(CADENCE_TOL_MAX);
    for (let i = 0; i < 10; i += 1) est.note(1000 / 60);
    expect(est.tolerance()).toBe(8);
  });

  it("plafond 60 : 60 → 60, 120 → 60, 144 → 72, 165 → 55, 240 → 60, toujours régulier", () => {
    for (const [hz, want] of [[60, 60], [120, 60], [144, 72], [165, 55], [240, 60]]) {
      const r = rejoue(hz, 60);
      expect(Math.abs(r.fps - want)).toBeLessThan(1);
      expect(r.pas).toHaveLength(1);
    }
  });

  it("plafond 30 : 60 → 30, 144 → 29, 240 → 30", () => {
    for (const [hz, want] of [[60, 30], [144, 28.8], [240, 30]]) {
      const r = rejoue(hz, 30);
      expect(Math.abs(r.fps - want)).toBeLessThan(1);
      expect(r.pas).toHaveLength(1);
    }
  });

  it("une image lourde ou un onglet caché ne faussent pas la mesure", () => {
    const est = makeVsyncEstimator();
    for (let i = 0; i < 30; i += 1) est.note(1000 / 144);
    est.note(41); est.note(5000); est.note(0); est.note(-3);
    expect(est.vsync()).toBeCloseTo(1000 / 144, 6);
  });

  it("un changement d'écran est suivi (minimum GLISSANT)", () => {
    const est = makeVsyncEstimator(60);
    for (let i = 0; i < 200; i += 1) est.note(1000 / 240);
    for (let i = 0; i < 130; i += 1) est.note(1000 / 60);
    expect(est.vsync()).toBeCloseTo(1000 / 60, 6);
    expect(est.tolerance()).toBe(8);
  });
});
