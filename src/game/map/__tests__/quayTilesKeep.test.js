import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { CM } from "../layout.js";
import { paintQuays, ensureQuayGeo } from "../iso/isoQuay.js";

// Audit 2026-10-05, PERF-10 — la clé des tuiles du quai portait l'horodatage du
// layout et la couleur du bas-fond du coloris d'eau : chaque recalcul de la ville et
// chaque changement de temps jetait toute la cuisson, recuite à 24 tuiles par image
// SANS repli (quai troué quelques images). Ces gardes :
//  · une ville recalculée dont le quai n'a pas bougé ne recuit RIEN ;
//  · un changement de couleur ou de dessin (quai resté en place) recuit en douceur,
//    l'ancienne cuisson tenant l'écran (aucune case de quai ne manque, à aucune image) ;
//  · un fleuve DÉPLACÉ ne montre jamais l'ancien quai à côté de l'eau.

// Canvas factice : on compte les cuissons (une par tuile non vide) et les poses. Une
// cuisson « coûte » 10 ms à l'horloge factice (`clock`, branchée au besoin sur
// performance.now) ; une tuile vide ne coûte rien.
let baked = 0, clock = 0;
class FakeCanvas {
  constructor(w, h) { this.width = w; this.height = h; baked += 1; clock += 10; }
  getContext() {
    const S = this.width;
    return {
      setTransform() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, fill() {}, fillRect() {},
      getImageData: () => ({ data: new Uint8ClampedArray(S * S * 4) }), putImageData() {},
    };
  }
}
function screenCtx() {
  const c = { imageSmoothingEnabled: false, draws: 0 };
  c.drawImage = () => { c.draws += 1; };
  return c;
}
const T = 20;
function layout(hwAt = () => 2, dy = 0) {
  const samples = [];
  for (let i = 0; i <= 60; i += 1) samples.push({ x: i, y: 30 + dy + Math.sin(i / 9) * 3, hw: hwAt(i) });
  const urbanSet = new Set(), roadSet = new Set();
  for (let x = 0; x <= 60; x += 1) for (let y = 24; y <= 38; y += 1) urbanSet.add(x + "," + y);
  for (let x = 0; x <= 60; x += 1) { roadSet.add(x + ",25"); roadSet.add(x + ",36"); }
  return { river: { present: true, samples }, counts: { eraBand: 4, eraIndex: 13 }, urbanSet, roadSet, roadMap: new Map(), tiles: [] };
}
const relayout = (L) => { CM.layoutRecomputeAt += 1; CM.layout = L; };

beforeEach(() => {
  baked = 0;
  vi.stubGlobal("OffscreenCanvas", FakeCanvas);
  CM.TILE = T;
  CM.cam = { x: 30 * T, y: 30 * T, zoom: 1 };
  CM.cw = 900; CM.ch = 600; CM.dpr = 1;
  CM.collapseAt = 0; CM.lodActive = false;
  CM.quayGate = null;
  CM.layoutRecomputeAt = 5000 + Math.floor(Math.random() * 1e6);
  CM.waterShore = { quay: ["rgba(150,184,180,0.50)", "rgba(202,224,214,0.62)"] };
  CM.layout = layout();
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); CM.layout = null; CM.quayGate = null; });

// Peint jusqu'à ce que plus rien ne se cuise ; rend le nombre de poses à l'équilibre.
function settle(maxFrames = 200) {
  for (let f = 0; f < maxFrames; f += 1) {
    const b0 = baked, ctx = screenCtx();
    paintQuays(ctx);
    if (baked === b0) return ctx.draws;
  }
  throw new Error("la cuisson du quai ne se termine pas");
}

describe("PERF-10 — le quai garde sa cuisson", () => {
  it("un recalcul de la ville qui ne touche pas au quai ne recuit aucune tuile", () => {
    const draws = settle();
    expect(draws).toBeGreaterThan(3);
    const g0 = ensureQuayGeo(CM.layout);
    baked = 0;
    relayout(layout());                        // nouveaux objets, même contenu
    const ctx = screenCtx();
    paintQuays(ctx);
    expect(baked).toBe(0);
    expect(ctx.draws).toBe(draws);
    // La géométrie, elle, est bien la nouvelle (les promeneurs et les volées la lisent).
    expect(ensureQuayGeo(CM.layout)).not.toBe(g0);
  });

  it("un changement de coloris recuit en douceur : l'ancienne cuisson tient l'écran", () => {
    const draws = settle();
    // Une seule tuile non vide recuite par image (budget de 6 ms, 10 ms la cuisson).
    vi.spyOn(performance, "now").mockImplementation(() => clock);
    CM.waterShore = { quay: ["rgba(120,150,160,0.50)", "rgba(190,210,220,0.62)"] };
    baked = 0;
    let frames = 0, idle = 0;
    for (; frames < 300 && idle < 3; frames += 1) {
      const b0 = baked, ctx = screenCtx();
      paintQuays(ctx);
      expect(ctx.draws, "case de quai manquante pendant la recuisson").toBe(draws);
      expect(baked - b0).toBeLessThanOrEqual(1);
      idle = baked === b0 ? idle + 1 : 0;
    }
    expect(baked).toBe(draws);                 // tout a été recuit, une fois
    expect(frames).toBeGreaterThan(draws);
  });

  it("quai resté en place mais redessiné (nouvelle bande) : recuit sans trou", () => {
    const draws = settle();
    baked = 0;
    const L = layout();
    L.counts = { eraBand: 5, eraIndex: 17 };      // fonte : autre promenade, autre mur
    relayout(L);
    vi.spyOn(performance, "now").mockImplementation(() => clock);
    const ctx = screenCtx();
    paintQuays(ctx);
    expect(baked).toBe(1);
    expect(ctx.draws).toBe(draws);
    vi.restoreAllMocks();
    settle();
    expect(baked).toBeGreaterThan(1);
  });

  it("quai qui s'élargit sur place (nouvelle bande) : la case qui reçoit du quai neuf n'attend pas", () => {
    // Ce fleuve-là (décalé de 0,6 case) : la promenade de la fonte, plus large que
    // celle du marbre, déborde sur une case restée VIDE à la bande 4. Une ancienne
    // case vide ne tient rien à l'écran : elle ne doit pas servir de repli.
    CM.layout = layout(undefined, 0.6);
    const draws4 = settle();
    const L = layout(undefined, 0.6);
    L.counts = { eraBand: 5, eraIndex: 17 };
    relayout(L);
    vi.spyOn(performance, "now").mockImplementation(() => clock);
    const ctx = screenCtx();
    paintQuays(ctx);
    vi.restoreAllMocks();
    const draws5 = settle();
    expect(draws5).toBeGreaterThan(draws4);      // le cas étudié existe bien
    expect(ctx.draws, "case de quai neuve laissée vide").toBe(draws5);
  });

  it("fleuve DÉPLACÉ (la grille a grandi) : jamais d'ancien quai posé à côté de l'eau", () => {
    settle();
    baked = 0;
    const L = layout();
    for (const s of L.river.samples) { s.x += 6; s.y += 6; }
    relayout(L);
    const ctx = screenCtx();
    paintQuays(ctx);
    // Seules les tuiles neuves sont posées (la recuisson d'avant, 24 par image).
    expect(ctx.draws).toBe(baked);
    expect(baked).toBeGreaterThan(0);
  });
});
