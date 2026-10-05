// LE PONT NE COMPOSE PLUS SON CADRE VIDE, ET NE DÉCOUPE PLUS LE FLEUVE HORS CHAMP
// (audit du 05/10, PERF-35 et PERF-37). L'image, elle, ne bouge pas d'un pixel.
//
// PERF-35 — les calques (tablier, amont, aval) partagent un cadre vide à ~90 % : le
// tablier se posait en entier, les tranches sur toute sa hauteur. Ils ne posent plus
// que leurs rangées occupées (le tablier : ses bandes de colonnes non vides), et
// SEULEMENT à une échelle device entière (rowCrop.js). Gardes : au zoom 2, l'image
// rendue au nearest est identique à celle des poses d'avant ; au zoom 1,375 rien
// n'est rogné.
// PERF-37 — le dessous du pont recalculait les berges, reprojetait et découpait deux
// fois le fleuve ENTIER par travée et par frame, même hors champ. Gardes : à l'écran,
// la suite d'appels Canvas est EXACTEMENT celle de l'ancien code (recopié ici) ; hors
// champ, plus aucun appel.
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { CM } from '../layout.js';
import { worldToScreen } from '../iso/projection.js';
import { bridgeGeoms, bridgeTune, pushIsoBridgeItems, drawIsoBridgeSeg, drawIsoBridgeUnder } from '../iso/isoBridge.js';
import { sunShadowAlpha, SUN_SHADOW } from '../iso/isoSunShadow.js';

class FakeImageData {
  constructor(a, b, c) {
    if (typeof a === 'number') { this.width = a; this.height = b; this.data = new Uint8ClampedArray(a * b * 4); }
    else { this.data = a; this.width = b; this.height = c ?? a.length / 4 / b; }
  }
}
const saved = {};
beforeAll(() => {
  for (const k of ['Image', 'document', 'ImageData']) saved[k] = globalThis[k];
  globalThis.Image = class { set src(s) { this._src = s; } get src() { return this._src; } };
  globalThis.ImageData = FakeImageData;
  // Un canvas qui garde ce qu'on y a posé (putImageData) : le rendu simulé le relit.
  globalThis.document = {
    createElement: () => {
      const cv = { width: 0, height: 0, _data: null };
      cv.getContext = () => ({ putImageData(img) { cv._data = img; }, drawImage() {}, clearRect() {}, getImageData: () => null });
      return cv;
    },
  };
  saved.CM = { layout: CM.layout, TILE: CM.TILE, cam: CM.cam, cw: CM.cw, ch: CM.ch, dpr: CM.dpr, ctx: CM.ctx, bridgeSpans: CM.bridgeSpans, nightF: CM.nightF };
});
afterAll(() => {
  for (const k of ['Image', 'document', 'ImageData']) globalThis[k] = saved[k];
  Object.assign(CM, saved.CM);
});
afterEach(() => { CM.layout = null; CM.bridgeSpans = null; });

// Le fleuve droit est-ouest et le pont de bridgeModel.test.js (bande 4 : portes, arches).
const T = 32;
function setup(zoom, camX = 5.5 * T, camY = 10 * T) {
  CM.TILE = T; CM.cw = 1400; CM.ch = 1000; CM.dpr = 1; CM.nightF = 0;
  CM.cam = { x: camX, y: camY, zoom };
  const samples = [];
  for (let x = -5; x <= 20; x += 1) samples.push({ x, y: 10, hw: 3 });
  const cells = [];
  for (let gy = 7; gy <= 12; gy += 1) for (const gx of [5, 6]) cells.push({ gx, gy, rank: 'main' });
  CM.layout = { counts: { eraBand: 4, eraIndex: 22 }, river: { present: true, samples } };
  CM.layoutRecomputeAt = (CM.layoutRecomputeAt || 0) + 1;
  CM.bridgeSpans = [{ vertical: true, gx0: 5, gx1: 6, gy0: 7, gy1: 12, cells, exits: [] }];
}

function poses(items, aligned) {
  const calls = [];
  const ctx = {
    imageSmoothingEnabled: false, globalAlpha: 1,
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: aligned ? 0 : 0.5, f: aligned ? 0 : 0.5 }),
    drawImage: (img, sx, sy, sw, sh, dx, dy, dw, dh) => calls.push({ img, sx, sy, sw, sh, dx, dy, dw, dh }),
    // Le tablier pose aussi son ombre de parapet (un polygone) : sans effet ici.
    save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, fill() {},
  };
  for (const it of items) if (it.part === 'deck' || it.part === 'back' || it.part === 'front') drawIsoBridgeSeg(ctx, it, 0);
  return calls;
}
// Rendu au nearest (dpr 1) : pour chaque pixel et chaque calque, le texel montré.
function render(calls, W, H) {
  const out = new Map();
  for (const c of calls) {
    const R = c.img._data;
    if (!R) continue;
    let o = out.get(c.img);
    if (!o) { o = new Int32Array(W * H).fill(-1); out.set(c.img, o); }
    const px0 = Math.max(0, Math.ceil(c.dx - 0.5)), px1 = Math.min(W, Math.ceil(c.dx + c.dw - 0.5));
    const py0 = Math.max(0, Math.ceil(c.dy - 0.5)), py1 = Math.min(H, Math.ceil(c.dy + c.dh - 0.5));
    for (let py = py0; py < py1; py += 1) {
      const v = Math.floor(c.sy + (py + 0.5 - c.dy) * c.sh / c.dh);
      for (let px = px0; px < px1; px += 1) {
        const u = Math.floor(c.sx + (px + 0.5 - c.dx) * c.sw / c.dw);
        const k = v * R.width + u;
        if (R.data[k * 4 + 3]) o[py * W + px] = k;
      }
    }
  }
  return out;
}

describe('pont : calques recadrés sur leurs rangées, image identique (PERF-35)', () => {
  it('zoom 2 : tablier en bandes, tranches rognées, même image qu avant', () => {
    setup(2);
    const items = [];
    pushIsoBridgeItems(items, { gx0: -100, gx1: 100, gy0: -100, gy1: 100 }, 0);
    const crop = poses(items, true), full = poses(items, false);
    expect(full.length).toBeGreaterThan(5);
    expect(crop.length).toBeGreaterThan(full.length);           // le tablier, en bandes
    const area = (cs) => cs.reduce((s, c) => s + c.dw * c.dh, 0);
    expect(area(crop)).toBeLessThan(area(full) * 0.5);
    const a = render(crop, CM.cw, CM.ch), b = render(full, CM.cw, CM.ch);
    expect([...a.keys()].length).toBe([...b.keys()].length);
    let diff = 0, lit = 0;
    for (const [img, rb] of b) {
      const ra = a.get(img);
      for (let k = 0; k < rb.length; k += 1) { if (ra[k] !== rb[k]) diff += 1; if (rb[k] >= 0) lit += 1; }
    }
    expect(lit).toBeGreaterThan(2000);
    expect(diff).toBe(0);
  });

  it('zoom 1,375 : rien n est rogné', () => {
    setup(1.375);
    const items = [];
    pushIsoBridgeItems(items, { gx0: -100, gx1: 100, gy0: -100, gy1: 100 }, 0);
    const crop = poses(items, true), full = poses(items, false);
    expect(crop).toEqual(full);
  });
});

// L'ancien dessous du pont, tel quel (avant le 2026-10-05).
function edgesOf(samples) {
  const left = [], right = [];
  for (let i = 0; i < samples.length; i += 1) {
    const p = samples[i], o = samples[Math.max(0, i - 1)], q = samples[Math.min(samples.length - 1, i + 1)];
    let tx = q.x - o.x, ty = q.y - o.y;
    const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    const nx = -ty, ny = tx, hw = p.hw || 0;
    left.push({ x: (p.x + nx * hw) * T, y: (p.y + ny * hw) * T });
    right.push({ x: (p.x - nx * hw) * T, y: (p.y - ny * hw) * T });
  }
  return { left, right };
}
function underAvant(ctx) {
  const ms = bridgeGeoms(), rv = CM.layout.river, z = CM.cam.zoom;
  const sun = sunShadowAlpha(), edges = edgesOf(rv.samples);
  const P = (m, l, t, h = 0) => (m.vertical ? worldToScreen(t, l, h) : worldToScreen(l, t, h));
  const ribbon = (dy) => {
    ctx.beginPath();
    edges.left.forEach((p, i) => { const s = worldToScreen(p.x, p.y); if (i) ctx.lineTo(s.x, s.y + dy); else ctx.moveTo(s.x, s.y + dy); });
    for (let i = edges.right.length - 1; i >= 0; i -= 1) { const s = worldToScreen(edges.right[i].x, edges.right[i].y); ctx.lineTo(s.x, s.y + dy); }
    ctx.closePath();
  };
  for (const m of ms) {
    if (!(m.fB > m.fA)) continue;
    ctx.save(); ribbon(0); ctx.clip(); ribbon(m.hq * z); ctx.clip();
    const quad = (l0, l1, t0, t1) => {
      const q = [P(m, l0, t0, -m.hq), P(m, l1, t0, -m.hq), P(m, l1, t1, -m.hq), P(m, l0, t1, -m.hq)];
      ctx.beginPath(); ctx.moveTo(q[0].x, q[0].y); for (let i = 1; i < 4; i += 1) ctx.lineTo(q[i].x, q[i].y);
      ctx.closePath(); ctx.fill();
    };
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = bridgeTune.underA; ctx.fillStyle = bridgeTune.under;
    quad(m.fA - T, m.fB + T, m.tUp, m.tDn);
    if (sun > 0 && m.vertical) {
      const k = 0.894 * SUN_SHADOW.len;
      ctx.fillStyle = SUN_SHADOW.col; ctx.globalAlpha = sun;
      quad(m.fA, m.fB, m.tDn, m.tDn + k * m.hq);
      const Q = m.K.parapet;
      if (Q && Q.h) { ctx.globalAlpha = sun * (Q.type === 'wall' ? 1 : 0.5); quad(m.fA, m.fB, m.tDn + k * m.hq, m.tDn + k * (m.hq + Q.h)); }
    }
    ctx.restore();
  }
}
// Un contexte qui consigne TOUT, valeurs comprises (styles posés au moment des appels).
function journal() {
  const log = [];
  const st = { globalCompositeOperation: 'source-over', globalAlpha: 1, fillStyle: '#000' };
  const ctx = {};
  for (const k of Object.keys(st)) Object.defineProperty(ctx, k, { get: () => st[k], set: (v) => { st[k] = v; log.push([k, v]); } });
  for (const f of ['save', 'restore', 'beginPath', 'moveTo', 'lineTo', 'closePath', 'clip', 'fill']) ctx[f] = (...a) => log.push([f, ...a]);
  return { ctx, log };
}

describe('dessous du pont : même tracé à l écran, rien hors champ (PERF-37)', () => {
  it('à l écran : la suite d appels est celle de l ancien code, au flottant près', () => {
    for (const zoom of [1, 2.375]) {
      setup(zoom);
      const a = journal(), b = journal();
      CM.ctx = a.ctx; drawIsoBridgeUnder();
      underAvant(b.ctx);
      expect(a.log.filter((e) => e[0] === 'clip').length).toBe(2);
      expect(a.log).toEqual(b.log);
      // Deux frames de suite : mêmes appels (les berges gardées ne vieillissent pas).
      const c = journal();
      CM.ctx = c.ctx; drawIsoBridgeUnder();
      expect(c.log).toEqual(b.log);
    }
  });

  it('pont hors champ : ni tracé, ni découpe', () => {
    setup(2, 60 * T, -40 * T);
    const a = journal();
    CM.ctx = a.ctx; drawIsoBridgeUnder();
    expect(a.log).toEqual([]);
  });
});
