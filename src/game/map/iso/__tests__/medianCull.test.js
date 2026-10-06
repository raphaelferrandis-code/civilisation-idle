// LES TERRE-PLEINS NE SE DESSINENT QUE DANS LA TUILE CUITE (PERF-12, audit du 05/10).
//
// Le sol se cuit par tuiles (solPyramide.cookTile) et drawIsoMedians repassait,
// à CHAQUE tuile, tous les segments de la ville : à la Fonte, 3,7 ms et ~6 800
// gravillons par tuile, presque tous hors du canvas. Le culling (medianView) ne
// doit rien changer à ce qui TOUCHE le canvas : ces gardes cuisent toutes les
// tuiles d'un plan, culling allumé puis éteint (__medianCull = false), et
// comparent au bit près la suite des appels de dessin visibles — chemin, état,
// clip, motif compris. Un appel n'est déclaré invisible que si sa boîte (clip
// compris, trait gonflé de 6 épaisseurs) reste à plus d'un pixel du canvas.
import { describe, it, expect, afterEach } from 'vitest';
import { CM } from '../../layout.js';
import { drawIsoMedians } from '../isoStreet.js';
import { isoArt } from '../isoArt.js';
import { tileSideCss, gutterCss, camForTile, tileSpace } from '../solPyramide.js';

// Le harnais n'a pas de DOMMatrix : le motif du gazon n'en fait que la porter.
if (typeof globalThis.DOMMatrix === 'undefined') {
  globalThis.DOMMatrix = class { constructor(a) { this.a = a; } };
}
// Art « décodé » (faux) : sans lui, le chemin du gazon PixelLab ne serait jamais
// parcouru sous Node.
for (const [k, w, h] of [['median-lawn', 64, 64], ['median-lawn-winter', 64, 64]]) {
  const e = isoArt(k); e.ready = true; e.img = { naturalWidth: w, naturalHeight: h, k };
}

// Contexte ENREGISTREUR : suit transformation, chemin, clip et état.
function recCtx(W, H) {
  let st = { m: [1, 0, 0, 1, 0, 0], clip: [-Infinity, -Infinity, Infinity, Infinity], clipSig: '', fs: '#000', ss: '#000', lw: 1, gco: 'source-over', ise: true };
  const stack = [], log = [];
  let path = [], all = 0;
  const tp = (x, y) => [st.m[0] * x + st.m[2] * y + st.m[4], st.m[1] * x + st.m[3] * y + st.m[5]];
  const sty = (v) => (typeof v === 'string' ? v : 'pat' + (v.m ? v.m.a.join(',') : '-') + ':' + v.img.k);
  const pts = () => path.map((p) => p.join(',')).join(';');
  const box = (P, pad) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of P) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    return [x0 - pad, y0 - pad, x1 + pad, y1 + pad];
  };
  const rec = (op, b, extra) => {
    all += 1;
    const c = st.clip;
    const x0 = Math.max(b[0], c[0]), y0 = Math.max(b[1], c[1]), x1 = Math.min(b[2], c[2]), y1 = Math.min(b[3], c[3]);
    if (x1 < x0 || y1 < y0 || x1 < -1 || y1 < -1 || x0 > W + 1 || y0 > H + 1) return;
    log.push(op + '|' + st.gco + '|' + st.ise + '|' + st.clipSig + '|' + extra());
  };
  return {
    save() { stack.push({ ...st, m: st.m.slice(), clip: st.clip.slice() }); },
    restore() { if (stack.length) st = stack.pop(); },
    beginPath() { path = []; },
    closePath() {},
    moveTo(x, y) { path.push(tp(x, y)); },
    lineTo(x, y) { path.push(tp(x, y)); },
    translate(x, y) { st.m[4] += st.m[0] * x + st.m[2] * y; st.m[5] += st.m[1] * x + st.m[3] * y; },
    clip() {
      const b = box(path, 0);
      st.clip = [Math.max(st.clip[0], b[0]), Math.max(st.clip[1], b[1]), Math.min(st.clip[2], b[2]), Math.min(st.clip[3], b[3])];
      st.clipSig += '[' + pts() + ']';
    },
    fill() { rec('fill', box(path, 0), () => sty(st.fs) + '|' + pts()); },
    stroke() { rec('stroke', box(path, st.lw * 6), () => sty(st.ss) + '|' + st.lw + '|' + pts()); },
    fillRect(x, y, w, h) { rec('rect', box([tp(x, y), tp(x + w, y + h)], 0), () => sty(st.fs) + '|' + [x, y, w, h].join(',')); },
    drawImage(img, dx, dy, dw, dh) { rec('img', box([tp(dx, dy), tp(dx + dw, dy + dh)], 0), () => img.k + '|' + [dx, dy, dw, dh].join(',')); },
    createPattern(img) { return { img, m: null, setTransform(mm) { this.m = mm; } }; },
    get fillStyle() { return st.fs; }, set fillStyle(v) { st.fs = v; },
    get strokeStyle() { return st.ss; }, set strokeStyle(v) { st.ss = v; },
    get lineWidth() { return st.lw; }, set lineWidth(v) { st.lw = v; },
    get globalCompositeOperation() { return st.gco; }, set globalCompositeOperation(v) { st.gco = v; },
    get imageSmoothingEnabled() { return st.ise; }, set imageSmoothingEnabled(v) { st.ise = v; },
    out: () => ({ sig: log.join('\n'), vis: log.length, all }),
  };
}

// Un plan de 28 cases : deux boulevards de chaque sens, des façades le long de
// quelques tranches (sable, bordure et grilles ne se posent que là).
const T = 32, N = 28;
const SEGS = [
  { axis: 'h', y: 8, x0: 3, x1: 20 }, { axis: 'h', y: 20, x0: 6, x1: 16 },
  { axis: 'v', x: 12, y0: 2, y1: 24 }, { axis: 'v', x: 22, y0: 9, y1: 18 },
];
const tiles = [];
for (let x = 5; x <= 11; x += 1) tiles.push({ gx: x, gy: 7, spanX: 1, spanY: 1, buildingId: 'house' });
for (let y = 4; y <= 12; y += 1) tiles.push({ gx: 11, gy: y, spanX: 1, spanY: 1, buildingId: 'house' });
for (let y = 10; y <= 16; y += 1) tiles.push({ gx: 24, gy: y, spanX: 1, spanY: 1, buildingId: 'house' });
const plan = (band) => ({ gridN: N, counts: { eraBand: band }, terrePlein: SEGS, tiles });

// Cuit toutes les tuiles du plan au niveau z ; rend leurs empreintes visibles.
function cookAll(L, z) {
  CM.layout = L; CM.TILE = T; CM.dpr = 1;
  CM.cam = { x: 0, y: 0, zoom: z };
  const S = tileSideCss(1, z), side = S + 2 * gutterCss();
  const c = [tileSpace(0, 0, z), tileSpace(N * T, 0, z), tileSpace(0, N * T, z), tileSpace(N * T, N * T, z)];
  const xs = c.map((p) => p.x), ys = c.map((p) => p.y);
  const out = [];
  for (let ty = Math.floor(Math.min(...ys) / S); ty <= Math.floor(Math.max(...ys) / S); ty += 1) {
    for (let tx = Math.floor(Math.min(...xs) / S); tx <= Math.floor(Math.max(...xs) / S); tx += 1) {
      const cam = camForTile(tx, ty, S, z);
      CM.cam.x = cam.x; CM.cam.y = cam.y; CM.cw = side; CM.ch = side;
      const r = recCtx(side, side);
      drawIsoMedians(r, L.terrePlein, T, z);
      out.push(r.out());
    }
  }
  return out;
}

describe('terre-pleins : le culling de tuile ne change aucun pixel', () => {
  const saved = { cam: CM.cam, cw: CM.cw, ch: CM.ch, layout: CM.layout, season: CM.season, tile: CM.TILE, dpr: CM.dpr };
  afterEach(() => {
    delete globalThis.__medianCull;
    Object.assign(CM, { cam: saved.cam, cw: saved.cw, ch: saved.ch, layout: saved.layout, season: saved.season, TILE: saved.tile, dpr: saved.dpr });
  });

  // Culling allumé puis éteint, mémoïsé : la garde de coût relit la Fonte.
  const memo = new Map();
  const both = (band, season, z) => {
    const k = band + ':' + season + ':' + z;
    if (!memo.has(k)) {
      CM.season = season;
      const on = cookAll(plan(band), z);
      globalThis.__medianCull = false;
      const off = cookAll(plan(band), z);
      delete globalThis.__medianCull;
      memo.set(k, { on, off });
    }
    return memo.get(k);
  };

  // [bande, saison, zoom] : la Fonte (sable + gravillons) dans les deux saisons
  // et trois crans ; le gazon nu (Pierre), les bandes de tonte (Néon), le liseré
  // lumineux (cosmique). (La bande 0 sans kit — gazon moucheté et bacs de fleurs —
  // n'a plus de terre-plein dessiné depuis le 2026-10-06, cf. plus bas.)
  const CASES = [[5, 1, 1], [5, 3, 0.5], [5, 3, 2], [3, 1, 1], [6, 1, 2], [7, 3, 0.5]];
  it.each(CASES)('bande %i, saison %i, zoom %f : mêmes appels visibles, tuile par tuile', (band, season, z) => {
    const { on, off } = both(band, season, z);
    expect(on.length).toBe(off.length);
    let vis = 0;
    for (let i = 0; i < on.length; i += 1) {
      expect(on[i].vis).toBe(off[i].vis);
      expect(on[i].sig === off[i].sig).toBe(true);
      vis += on[i].vis;
    }
    expect(vis).toBeGreaterThan(0);                       // le plan est bien dessiné quelque part
  });

  // Audit du 05/10, MORT-13 : le terre-plein d'avant le kit (gazon moucheté, bacs
  // de fleurs flowerbed-N) est retiré. Sans kit — bandes 0-1, qui n'ont de toute
  // façon pas de boulevard —, drawIsoMedians ne dessine RIEN, même sur un plan qui
  // porterait une couture.
  it('sans kit (bandes 0-1) : aucun appel de dessin', () => {
    for (const band of [0, 1]) {
      CM.season = 1;
      const r = cookAll(plan(band), 1);
      expect(r.reduce((a, x) => a + x.all, 0), 'bande ' + band).toBe(0);
    }
  });

  // Gazon PixelLab pas encore décodé : l'aplat seul (motif null) prend le relais le
  // temps du chargement — mêmes gardes.
  it.each([[5, 1, 1]])('bande %i, saison %i, zoom %f, gazon pas décodé : mêmes appels visibles', (band, season, z) => {
    const art = isoArt('median-lawn');
    art.ready = false;
    try {
      CM.season = season;
      const on = cookAll(plan(band), z);
      globalThis.__medianCull = false;
      const off = cookAll(plan(band), z);
      expect(on.length).toBe(off.length);
      for (let i = 0; i < on.length; i += 1) expect(on[i].sig === off[i].sig).toBe(true);
      expect(on.reduce((a, x) => a + x.vis, 0)).toBeGreaterThan(0);
    } finally {
      art.ready = true;
    }
  });

  it('à la Fonte, une tuile ne paie plus les gravillons de toute la ville', () => {
    const { on, off } = both(5, 1, 1);
    const tot = (r) => r.reduce((a, x) => a + x.all, 0);
    // Mesuré : 1 appel de dessin sur 11 reste sur ce petit plan (ceux des tuiles
    // que la couture traverse, marge comprise), 1 sur 500 sur une vraie ville de
    // la Fonte ; la garde laisse de la place.
    expect(tot(on)).toBeLessThan(tot(off) * 0.15);
  });
});
