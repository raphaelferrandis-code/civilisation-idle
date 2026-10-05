import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { state } from "../../../core/state.js";
import { CM, CM_WONDERS, cmWonderSlot } from "../../layout.js";
import { worldToScreen } from "../projection.js";
import { inkBlit, pushIsoWonderItems, drawIsoWonderSeg } from "../isoWonder.js";

// Audit 2026-10-05 — le décor des lieux des merveilles.
//  · PERF-33 : une pièce de décor hors champ n'entre plus au tri (cull pièce par
//    pièce), et les items sont réutilisés d'une frame à l'autre (pool).
//  · PERF-34 : le raster n'est plus blitté que sur son encre, et seulement là où
//    c'est identique au pixel (côtés impairs, dpr entier — mesuré GPU et logiciel).

// ── inkBlit : la même transformation que le blit plein ─────────────────────────
// Modèle du blit SANS lissage : chaque pixel dont le centre tombe dans la
// destination prend le texel le plus proche de l'antécédent de ce centre.
function blit(out, OW, src, SW, sx, sy, sw, sh, dx, dy, dw, dh) {
  const kx = dw / sw, ky = dh / sh;
  for (let Y = Math.ceil(dy - 0.5); Y + 0.5 < dy + dh; Y += 1) {
    for (let X = Math.ceil(dx - 0.5); X + 0.5 < dx + dw; X += 1) {
      const u = Math.floor(sx + (X + 0.5 - dx) / kx), v = Math.floor(sy + (Y + 0.5 - dy) / ky);
      const a = src[v * SW + u];
      if (a) out[Y * OW + X] = a;              // source-over d'un texel opaque
    }
  }
}
function raster(W, H, box) {
  const s = new Uint32Array(W * H);
  for (let y = box.y; y < box.y + box.h; y += 1) for (let x = box.x; x < box.x + box.w; x += 1) s[y * W + x] = 1 + ((x * 37 + y * 11) % 251);
  return s;
}
// Nombre de pixels qui diffèrent (toEqual sur 10⁵ cases est trop lent).
function diff(a, b) {
  let n = 0;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) n += 1;
  return n;
}

describe("PERF-34 — blit rogné à l'encre", () => {
  const saved = { dpr: CM.dpr };
  afterEach(() => { CM.dpr = saved.dpr; });

  it("pose exactement les mêmes pixels que le blit plein (zooms 0,25 à 4)", () => {
    CM.dpr = 1;
    const W = 61, H = 79, box = { x: 22, y: 47, w: 13, h: 27 }, src = raster(W, H, box);
    const OW = 340;
    let rogne = 0;
    for (let i = 0; i < 80; i += 1) {
      const z = 0.25 + i * 0.0472, ox = 7.3 + (i * 3.17) % 11, oy = 5.1 + (i * 1.93) % 9;
      const dx = Math.round(ox), dy = Math.round(oy), dw = Math.round(ox + W * z) - dx, dh = Math.round(oy + H * z) - dy;
      const a = new Uint32Array(OW * OW), b = new Uint32Array(OW * OW);
      blit(a, OW, src, W, 0, 0, W, H, dx, dy, dw, dh);
      const r = inkBlit(box, 0, 0, W, H, dx, dy, dw, dh);
      expect(r).not.toBeNull();
      // Destination ENTIÈRE, dans le cadre, plus petite que lui.
      for (const k of [4, 5, 6, 7]) expect(Number.isInteger(r[k])).toBe(true);
      expect(r[4]).toBeGreaterThanOrEqual(dx); expect(r[5]).toBeGreaterThanOrEqual(dy);
      expect(r[4] + r[6]).toBeLessThanOrEqual(dx + dw); expect(r[5] + r[7]).toBeLessThanOrEqual(dy + dh);
      if (r[6] * r[7] < dw * dh) rogne += 1;
      blit(b, OW, src, W, r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7]);
      expect(diff(a, b), `zoom ${z.toFixed(3)}`).toBe(0);
    }
    expect(rogne).toBe(80);
  });

  it("garde le blit plein là où l'identité n'est pas prouvée", () => {
    const box = { x: 10, y: 10, w: 5, h: 5 };
    CM.dpr = 1;
    expect(inkBlit(box, 0, 0, 60, 79, 0, 0, 60, 79)).toBeNull();   // côté pair
    expect(inkBlit(box, 0, 0, 61, 80, 0, 0, 61, 80)).toBeNull();
    expect(inkBlit(null, 0, 0, 61, 79, 0, 0, 61, 79)).toBeNull();  // pas d'encre connue
    expect(inkBlit(box, 0, 0, 61, 79, 0, 0, 61, 79)).not.toBeNull();
    CM.dpr = 2;
    expect(inkBlit(box, 0, 0, 61, 79, 0, 0, 61, 79)).not.toBeNull();
    CM.dpr = 1.25;                                                   // dpr fractionnaire
    expect(inkBlit(box, 0, 0, 61, 79, 0, 0, 61, 79)).toBeNull();
  });

  it("suit un rectangle source partiel (base de l'îlot qui sort de terre)", () => {
    CM.dpr = 1;
    const W = 101, H = 165, box = { x: 30, y: 12, w: 41, h: 140 }, src = raster(W, H, box);
    const OW = 500;
    for (const [z, cut] of [[1, 0], [1.7, 33], [0.6, 81], [2.3, 0]]) {
      const sh = H - cut, dx = 3, dy = Math.round(4 + cut * z), dw = Math.round(3 + W * z) - dx, dh = Math.round(4 + H * z) - dy;
      if (!(sh & 1)) continue;
      const a = new Uint32Array(OW * OW), b = new Uint32Array(OW * OW);
      blit(a, OW, src, W, 0, cut, W, sh, dx, dy, dw, dh);
      const r = inkBlit(box, 0, cut, W, sh, dx, dy, dw, dh);
      expect(r).not.toBeNull();
      blit(b, OW, src, W, r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7]);
      expect(diff(a, b), `zoom ${z}, rangées ${cut}+`).toBe(0);
    }
  });
});

// ── La passe vivante, avec un DOM factice ──────────────────────────────────────
const T = 32;
const fakeCanvas = () => ({ width: 0, height: 0, getContext: () => ({ putImageData() {}, createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }) }) });
const saved = { wonders: state.wonders };
function scene() {
  CM.TILE = T;
  CM.cw = 1200; CM.ch = 800; CM.dpr = 1; CM.capture = null; CM.season = 1; CM.previewWonder = null;
  CM.born = {}; CM.ships = []; CM.nightF = 0;
  CM.layout = { gridN: 120, cx: 60, cy: 60, counts: { eraBand: 4, eraIndex: 13 }, wonderTiers: { dynasty1: 1 }, river: null, roadSet: new Set() };
  state.wonders = ["dynasty1"];
}
const WI = CM_WONDERS.findIndex((w) => w.id === "dynasty1");
const look = () => { const items = []; pushIsoWonderItems(items, CM_WONDERS[WI], WI); return items; };
// Caméra sur le centre de l'emplacement, décalée de (dx, dy) px monde.
function camOn(zoom, dx = 0, dy = 0) {
  const s = cmWonderSlot(WI, 120, 60, 60);
  CM.cam = { x: (s.gx + 0.5) * T + dx, y: (s.gy + 0.5) * T + dy, zoom };
}
// Boîte ÉCRAN d'une pièce, recalculée ici à la main (même formule que le dessin).
function pieceBox(m, dc) {
  const R2 = dc.R, z = CM.cam.zoom, q = worldToScreen(m.cx + dc.x + R2.oy + R2.ox / 2, m.cy + dc.y + R2.oy - R2.ox / 2);
  const x = Math.round(q.x), y = Math.round(q.y);
  return { x, y, w: Math.round(q.x + R2.w * z) - x, h: Math.round(q.y + R2.h * z) - y };
}

describe("PERF-33 — le décor des lieux au tri peintre", () => {
  beforeEach(() => {
    vi.stubGlobal("document", { createElement: fakeCanvas });
    vi.stubGlobal("ImageData", class { constructor(d, w, h) { this.data = d; this.width = w; this.height = h; } });
    scene();
  });
  afterEach(() => {
    vi.unstubAllGlobals(); vi.restoreAllMocks();
    state.wonders = saved.wonders; CM.layout = null; CM._wonderBoxes = undefined;
  });

  it("une pièce hors champ n'entre pas au tri ; toute pièce à l'écran y entre", () => {
    let culled = 0, seen = 0;
    // On fait défiler le lieu à travers le bord gauche de l'écran, au zoom 2.
    for (let k = 0; k <= 12; k += 1) {
      CM._wonderBoxes = [];
      camOn(2, k * 25, -k * 25);
      const items = look();
      if (!items.length) continue;
      const m = items[0].m, pl = m.pl;
      expect(pl && pl.decor.length).toBeGreaterThan(40);
      const kept = new Set(items.filter((it) => it.part === "decor").map((it) => it.di));
      pl.decor.forEach((dc, di) => {
        const b = pieceBox(m, dc);
        const onScreen = b.x < CM.cw && b.y < CM.ch && b.x + b.w > 0 && b.y + b.h > 0;
        if (onScreen) expect(kept.has(di), `pièce ${di} à l'écran, cran ${k}`).toBe(true);
        if (!kept.has(di)) culled += 1;
        seen += 1;
      });
    }
    expect(seen).toBeGreaterThan(0);
    expect(culled).toBeGreaterThan(seen / 5);   // le cull sert vraiment
  });

  it("les items sont réutilisés d'une frame à l'autre", () => {
    camOn(1);
    CM._wonderBoxes = [];
    const a = look();
    expect(a.length).toBeGreaterThan(60);
    const prev = new Set(a);
    CM._wonderBoxes = [];
    const b = look();
    expect(b.length).toBe(a.length);
    expect(b.every((it) => prev.has(it))).toBe(true);
    // Chaque item garde la forme commune (un seul ensemble de clés).
    expect(new Set(b.map((it) => Object.keys(it).join(","))).size).toBe(1);
  });

  it("la queue du pool ne retient pas le modèle (ni ses cuissons) d'une frame plus chargée", () => {
    camOn(1);
    CM._wonderBoxes = [];
    const a = look();
    // Puis une vue serrée, le lieu à cheval sur le bord : des pièces coupées, moins d'items.
    let b = null;
    for (let k = 1; k <= 12 && !b; k += 1) {
      CM._wonderBoxes = [];
      camOn(2, k * 25, -k * 25);
      const got = look();
      if (got.length && got.length < a.length) b = got;
    }
    expect(b).toBeTruthy();
    const kept = new Set(b);
    const tail = a.filter((it) => !kept.has(it));
    expect(tail.length).toBeGreaterThan(0);
    expect(tail.every((it) => it.m === null && it.sh === null)).toBe(true);
    expect(b.every((it) => it.m)).toBe(true);
  });

  it("le dessin d'une pièce pose son encre au dpr entier, le blit plein sinon", () => {
    camOn(1.5);
    CM._wonderBoxes = [];
    const calls = [];
    const ctx = { imageSmoothingEnabled: true, globalAlpha: 1, globalCompositeOperation: "source-over", drawImage: (...a) => calls.push(a) };
    const dec = look().find((it) => it.part === "decor");
    expect(dec).toBeTruthy();
    const b = pieceBox(dec.m, dec.m.pl.decor[dec.di]);
    drawIsoWonderSeg(ctx, dec, 5000);
    expect(calls).toHaveLength(1);
    const c = calls[0];
    expect(c).toHaveLength(9);
    expect(c.slice(5).every(Number.isInteger)).toBe(true);
    expect(c[7] * c[8]).toBeLessThan(b.w * b.h);
    CM.dpr = 1.25;
    calls.length = 0;
    drawIsoWonderSeg(ctx, dec, 5000);
    expect(calls[0]).toEqual([dec.m.pl.decor[dec.di].cv, b.x, b.y, b.w, b.h]);
  });
});
