// Audit du 2026-10-05, BUG-94 — quayJoin rendait le raccord de la PREMIÈRE rive coupée
// par un port dans [x0, x1], sans savoir quel port l'appelait. Le Vieux-Port est rive N
// (masque minus) ; un terminal de commerce posé rive S en face de lui (masque plus)
// répondait à sa place : raccords du bassin effacés (le « trou d'eau » du 2026-10-04
// revenait) ou calés sur la rive d'en face, en travers du fleuve.
// Fleuve synthétique ouest → est (y = 40, demi-largeur 3 : rive N à 37, rive S à 43).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { CM } from "../layout.js";
import { quayWallTune } from "../quaysAndRiot.js";
import { quayJoin } from "../iso/portBerths.js";

let saved;
beforeAll(() => { saved = { layout: CM.layout, at: CM.layoutRecomputeAt, gate: CM.quayGate }; });
afterAll(() => { CM.layout = saved.layout; CM.layoutRecomputeAt = saved.at; CM.quayGate = saved.gate; });

// Vieux-Port rive N sur x 26..33 ; commerce rive S sur `tradeS` = [xa, xb] (ou rien).
function setup(tradeS) {
  const sm = [];
  for (let x = 0; x <= 80; x += 0.5) sm.push({ x, y: 40, hw: 3 });
  const n0 = sm.length;
  CM.layout = { river: { present: true, samples: sm } };
  CM.layoutRecomputeAt = 94001;
  const drawPlus = new Uint8Array(n0).fill(1), drawMinus = new Uint8Array(n0).fill(1);
  const dockPlus = new Uint8Array(n0), dockMinus = new Uint8Array(n0);
  for (let i = 0; i < n0; i += 1) {
    const x = sm[i].x;
    if (x >= 26 && x <= 33) { dockMinus[i] = 1; drawMinus[i] = 0; }
    if (tradeS && x >= tradeS[0] && x <= tradeS[1]) { dockPlus[i] = 1; drawPlus[i] = 0; }
  }
  // Même clé que quaysAndRiot.gateKey : ensureQuayGate garde notre masque.
  const key = CM.layoutRecomputeAt + (quayWallTune.full ? ":f" : ":u") + ":p" + (+quayWallTune.portGap || 0);
  CM.quayGate = { key, drawPlus, drawMinus, dockPlus, dockMinus };
  return sm;
}

describe("BUG-94 — le raccord de quai se lit sur la rive du port qui le demande", () => {
  it("Vieux-Port seul : raccords sur la rive N, des deux côtés", () => {
    const j = quayJoin(setup(null), 26, 33, -1);
    expect(j.yL).toBe(37);
    expect(j.yR).toBe(37);
  });

  it("commerce rive S qui couvre le bassin : le Vieux-Port garde ses raccords rive N", () => {
    const sm = setup([22, 38]);
    const old = quayJoin(sm, 26, 33, -1);
    expect(old.yL).toBe(37);
    expect(old.yR).toBe(37);
    // … et le terminal a les siens, rive S.
    const trade = quayJoin(sm, 21.5, 38.5, 1);
    expect(trade.yL).toBe(43);
    expect(trade.yR).toBe(43);
  });

  it("commerce rive S qui effleure le bord ouest : pas de raccord tiré de la rive d'en face", () => {
    const j = quayJoin(setup([20, 25.5]), 26, 33, -1);
    expect(j.yL).toBe(37);
    expect(j.yR).toBe(37);
  });
});
