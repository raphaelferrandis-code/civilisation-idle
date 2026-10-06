// Audit du 2026-10-05, PERF-10 (choix A de Raph) — LA CUISSON DES PORTS ANCRÉE AU PORT.
// Quand la grille grandit, le layout recentre la ville : les ports se translatent d'un
// nombre entier de cases, et leurs cuissons (port de commerce ~200 ms, Vieux-Port ~85 ms,
// ponton ~25 ms) se refaisaient dans la même image — leur grain (écume, dalles, briques)
// se lisait sur les coordonnées monde absolues. Il se lit désormais depuis l'ancre du
// port : la scène translatée cuit la MÊME image, décalée, et la cuisson se garde.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { CM } from "../layout.js";
import { bakeBoxes, shiftBake, anchorStats, forgetAnchoredBakes, h01 } from "../iso/isoBoxBake.js";
import { TRADE, drawTradePort } from "../iso/isoTradePort.js";
import { OLDPORT, drawOldPort, paintOldPortUnder } from "../iso/isoOldPort.js";
import { PIER, drawPortPier } from "../iso/isoPier.js";

// Un faux canevas qui GARDE ses pixels (putImageData), et un contexte qui note ce qu'on
// y pose (drawImage d'un canevas cuit : ses pixels et sa position à l'écran).
const generic = {
  get(t, k) {
    if (k in t) return t[k];
    if (typeof k === "string" && /^[a-z]/.test(k)) return () => {};
    return undefined;
  },
  set(t, k, v) { t[k] = v; return true; },
};
class FakeOC {
  constructor(w, h) { this.width = w; this.height = h; this._data = null; }
  getContext() {
    const cv = this;
    return new Proxy({ canvas: cv, putImageData(img) { cv._data = img.data; } }, generic);
  }
}
class FakeImageData {
  constructor(a, b, c) {
    if (a instanceof Uint8ClampedArray) { this.data = a; this.width = b; this.height = c || a.length / 4 / b; }
    else { this.width = a; this.height = b; this.data = new Uint8ClampedArray(a * b * 4); }
  }
}
function recorder() {
  const out = [];
  const ctx = new Proxy({
    canvas: { width: 1, height: 1 }, globalAlpha: 1, globalCompositeOperation: "source-over", imageSmoothingEnabled: false,
    drawImage(cv, x, y, w, h) { if (cv && cv._data) out.push({ data: cv._data, X: x, Y: y, w, h }); },
  }, generic);
  return { ctx, out };
}
const sameBytes = (a, b) => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
};

// Fleuve synthétique sinueux (ouest → est), et trois ports : le terminal de commerce
// (rive nord), le bassin du Vieux-Port, un ponton de pierre. `k` : la translation (en
// cases) que fait la croissance de grille ; `dy` : un fleuve qui se réshape.
const riverY = (x) => 40 + 1.5 * Math.sin(x / 6);
function layout(k = 0, { dy = 0, band = 6, eraIndex = 31 } = {}) {
  const samples = [];
  for (let x = 0; x <= 100; x += 1) samples.push({ x: x + k, y: riverY(x) + k + dy * (x / 100), hw: 3 });
  const edge = [];
  for (let i = 0; i < 10; i += 1) edge.push(Math.floor(riverY(40 + i) - 3) - 1 + k);
  const tiles = [
    { buildingId: "river_ports", type: "engine", gx: 40 + k, gy: edge[0] - 3, spanX: 10, spanY: 4, level: 30,
      tradePort: { x0: 40 + k, len: 10, side: "N", depth: 4, edge } },
    { buildingId: "river_ports", type: "engine", gx: 20 + k, gy: 31 + k, spanX: 6, spanY: 4, oldPort: { gx: 20 + k, gy: 31 + k, w: 6, h: 4 } },
    { buildingId: "river_ports", type: "engine", gx: 62 + k, gy: 34 + k, spanX: 2, spanY: 2 },
  ];
  return { mapSeed: 11, river: { present: true, samples, cells: new Set(), banks: new Set() }, counts: { eraBand: band, eraIndex }, tiles };
}
const DRAW = {
  commerce: (ctx, L) => drawTradePort(ctx, L.tiles[0], 6, 31, 1000),
  docks: (ctx, L) => drawTradePort(ctx, L.tiles[0], 5, 25, 1000),
  vieuxPort: (ctx, L) => { paintOldPortUnder(ctx, 1000); drawOldPort(ctx, L.tiles[1], 6, 1000); },
  ponton: (ctx, L) => drawPortPier(ctx, L.tiles[2], 2, 2, 5, 25),
};
function shot(kind, L) {
  CM.layout = L;
  const r = recorder();
  DRAW[kind](r.ctx, L);
  return r.out;
}

let saved;
beforeAll(() => {
  saved = {
    oc: globalThis.OffscreenCanvas, id: globalThis.ImageData, layout: CM.layout, cam: CM.cam, cw: CM.cw, ch: CM.ch, dpr: CM.dpr,
    collapse: CM.collapseAt, trade: { ...TRADE }, old: { ...OLDPORT }, pier: { ...PIER },
  };
  globalThis.OffscreenCanvas = FakeOC;
  if (!saved.id) globalThis.ImageData = FakeImageData;
  CM.cam = { x: 0, y: 0, zoom: 1 }; CM.cw = 20000; CM.ch = 20000; CM.dpr = 1;
  // L'effondrement coupe remous, ombres et reflets du bassin : seuls ses calques cuits
  // sont posés (ce qu'on compare).
  CM.collapseAt = 1;
  // Ni ombre ni reflet (des calques que ces poses ne montrent pas) ; l'encre et l'écume
  // restent : elles sont dans le corps.
  Object.assign(TRADE, { on: true, shadow: false, reflect: false, ink: true });
  Object.assign(OLDPORT, { on: true, shadow: false, reflect: false, ink: true });
  Object.assign(PIER, { shadow: false, reflect: false, foam: true });
});
afterAll(() => {
  globalThis.OffscreenCanvas = saved.oc; globalThis.ImageData = saved.id;
  Object.assign(CM, { layout: saved.layout, cam: saved.cam, cw: saved.cw, ch: saved.ch, dpr: saved.dpr, collapseAt: saved.collapse });
  Object.assign(TRADE, saved.trade); Object.assign(OLDPORT, saved.old); Object.assign(PIER, saved.pier);
});

describe("PERF-10 — la cuisson ancrée au port", () => {
  it("bakeBoxes : une scène translatée (écume comprise) cuit la même image, décalée de (dX − dY, (dX + dY)/2)", () => {
    // Un pieu dans l'eau (son écume) et un tablier ; le grain du peintre se lit depuis l'ancre.
    const scene = (X, Y) => [
      { part: "pile", X0: X + 40, X1: X + 44, Y0: Y + 20, Y1: Y + 24, Z0: 0, Z1: 18 },
      { part: "deck", X0: X + 10, X1: X + 60, Y0: Y + 4, Y1: Y + 20, Z0: 14, Z1: 18 },
    ];
    const bake = (X, Y) => bakeBoxes(scene(X, Y), {
      shade: (hit, wx, wy) => { const r = 120 + Math.floor(h01(Math.floor(wx - X), Math.floor(wy - Y), 3) * 100); return [r, r, 90 + hit.face * 40]; },
      isWater: (wx, wy) => wy - Y > 18,
      foam: (b) => b.part === "pile", origin: { X, Y },
    });
    const A = bake(3200, 2848), B = bake(3200 + 32, 2848 + 64);
    for (const k of ["body", "shadow"]) {
      expect(B[k].AX0 - A[k].AX0).toBe(32 - 64);
      expect(B[k].AY0 - A[k].AY0).toBe((32 + 64) / 2);
      expect(sameBytes(A[k].cv._data, B[k].cv._data)).toBe(true);
    }
    // L'écume est bien là (des pixels clairs à demi opaques au pied du pieu).
    expect(A.body.cv._data.some((v, i) => i % 4 === 3 && v === 150)).toBe(true);
    // shiftBake place la première où la seconde a cuit.
    const S = shiftBake(A, 32, 64);
    expect([S.body.AX0, S.body.AY0, S.shadow.AX0, S.shadow.AY0]).toEqual([B.body.AX0, B.body.AY0, B.shadow.AX0, B.shadow.AY0]);
  });

  for (const kind of Object.keys(DRAW)) {
    it(`${kind} : gardé quand la ville se translate, et identique à une cuisson fraîche à la nouvelle place`, () => {
      forgetAnchoredBakes();
      const c0 = anchorStats.cuites, g0 = anchorStats.gardees;
      const A = shot(kind, layout(0));
      expect(A.length).toBeGreaterThan(0);
      expect(anchorStats.cuites).toBe(c0 + 1);
      // La grille grandit : tout glisse d'une case en x et en y. Rien n'est recuit.
      const B = shot(kind, layout(1));
      expect(anchorStats.cuites).toBe(c0 + 1);
      expect(anchorStats.gardees).toBe(g0 + 1);
      expect(B.length).toBe(A.length);
      B.forEach((b, i) => {
        expect(b.data === A[i].data).toBe(true);          // les mêmes canevas
        expect(b.X - A[i].X).toBe(0);                     // (32 − 32) px d'art au zoom 1
        expect(b.Y - A[i].Y).toBe(32);                    // (32 + 32) / 2
      });
      // Cuisson FRAÎCHE de la scène translatée de deux cases : les mêmes pixels.
      forgetAnchoredBakes();
      const C = shot(kind, layout(2));
      expect(anchorStats.cuites).toBe(c0 + 2);
      expect(C.length).toBe(A.length);
      C.forEach((c, i) => {
        // (Comparaisons en booléens : `not.toBe` sur deux tableaux de pixels coûte ~1 s.)
        expect(c.data === A[i].data).toBe(false);
        expect(sameBytes(c.data, A[i].data)).toBe(true);
        expect([c.X - A[i].X, c.Y - A[i].Y]).toEqual([0, 64]);
      });
    });
  }

  it("un fleuve qui se réshape sous le port (premier cycle : il s'étire avec la grille) : la cuisson se refait", () => {
    // (Des places neuves : le cache par géométrie absolue rendrait celles déjà vues.)
    forgetAnchoredBakes();
    const c0 = anchorStats.cuites;
    shot("commerce", layout(5));
    shot("commerce", layout(6, { dy: 0.05 }));
    expect(anchorStats.cuites).toBe(c0 + 2);
    shot("commerce", layout(7));                        // translation pure : gardée
    expect(anchorStats.cuites).toBe(c0 + 2);
  });
});
