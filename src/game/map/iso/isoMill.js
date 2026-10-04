"use strict";
// ── LES MOULINS À VENT SUR LA CARTE (docs/PLAN-TERROIR.md, T3) ───────────────
//
// Pose les moulins cuits par millBake.js : sol de terre tassée, ombre, tour, puis
// la POSE d'ailes du moment (une image cuite parmi MILL_FRAMES — rien ne tourne au
// blit, les pixels restent nets). Chaque moulin a sa phase et sa cadence (±8 %) :
// une rangée de moulins ne bat pas à l'unisson.
//
// Remplace, à TOUTES les bandes, la scène d'avant (cityEngineSprites, bloc
// `water_mills` : tour PixelLab + croix vue de face tournée dans le plan de
// l'écran) — un moulin par ère, cf. millBake.js. Molette :
// __millTune({ on, band, period }).
import { CM, cmHash } from '../layout.js';
import { worldToScreen } from './projection.js';
import { wonderKitForBand } from './wonderKits.js';
import { WINTER } from '../seasonMode.js';
import {
  bakeMillGround, bakeMillTower, bakeMillSails, bakeMillBarn, millSailsNight, millTowerAt, MILL_FRAMES,
} from './millBake.js';
import { drawSunShadow } from './isoSunShadow.js';
import { lightCtx, lightCutImage } from '../lightLayer.js';
import { HOVER_GOLD } from './isoPalette.js';

export const millTune = { on: true, band: null, period: 1700 };   // ms par quart de tour

function rasterCanvas(R) {
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, R.w); cv.height = Math.max(1, R.h);
  cv.getContext('2d').putImageData(new ImageData(R.data, R.w, R.h), 0, 0);
  return cv;
}
// Silhouette dorée (survol) : l'image teinte, posée en croix d'un pixel autour.
function goldOf(cv) {
  const g = document.createElement('canvas');
  g.width = cv.width; g.height = cv.height;
  const c = g.getContext('2d');
  c.drawImage(cv, 0, 0);
  c.globalCompositeOperation = 'source-in';
  c.fillStyle = HOVER_GOLD;
  c.fillRect(0, 0, g.width, g.height);
  return g;
}
const layer = (R) => ({ R, cv: rasterCanvas(R) });

// ── Cuisson (une par bande × hiver) ─────────────────────────────────────────
const _bakes = new Map();
function bakesFor(band, winter) {
  const key = band + (winter ? ':w' : '');
  let e = _bakes.get(key);
  if (e) return e;
  const K = wonderKitForBand(band, winter);
  const tw = bakeMillTower(K, band);
  e = {
    K, band,
    ground: layer(bakeMillGround(band, 3)),
    tower: { ...layer(tw.R), N: tw.N ? rasterCanvas(tw.N) : null },
    sails: [],
    barns: new Map(),
  };
  e.tower.gold = goldOf(e.tower.cv);
  for (let f = 0; f < MILL_FRAMES; f += 1) {
    const R = bakeMillSails(K, f, band);
    // Le calque de nuit AVANT le canvas : nightOf rend leur alpha aux pixels marqués.
    const N = band >= 7 ? millSailsNight(R, K) : null;
    const s = layer(R);
    s.N = N ? rasterCanvas(N) : null;
    s.gold = goldOf(s.cv);
    e.sails.push(s);
  }
  _bakes.set(key, e);
  return e;
}
function barnFor(e, size) {
  let b = e.barns.get(size);
  if (!b) { const bk = bakeMillBarn(e.K, size, e.band); b = { ...layer(bk.R), N: bk.N ? rasterCanvas(bk.N) : null }; e.barns.set(size, b); }
  return b;
}
// Calque de nuit d'une image posée en (p) : fenêtres et lumières marquées.
function nightBlit(N, p) {
  const nf = CM.nightF || 0;
  if (!N || nf <= 0.03) return;
  const lc = lightCtx(p.dx, p.dy, p.dx + p.dw, p.dy + p.dh);
  if (!lc) return;
  const sm = lc.imageSmoothingEnabled;
  lc.imageSmoothingEnabled = false;
  lc.globalAlpha = Math.min(1, nf * 1.15);
  lc.drawImage(N, p.dx, p.dy, p.dw, p.dh);
  lc.globalAlpha = 1;
  lc.imageSmoothingEnabled = sm;
}

// Pose un raster du repère local dont l'origine (0, 0, 0) tombe en `o` (écran).
function place(o, R, z) {
  const dx = Math.round(o.x + R.ox * z), dy = Math.round(o.y + R.oy * z);
  return { dx, dy, dw: Math.round(o.x + (R.ox + R.w) * z) - dx, dh: Math.round(o.y + (R.oy + R.h) * z) - dy };
}

// Dessine le moulin de la tuile `t` ; rend la boîte d'encre écran (survol) ou
// false (molette coupée → la scène d'avant prend le relais).
export function drawIsoMill(ctx, t, now) {
  if (!millTune.on || typeof document === 'undefined') return false;
  const L = CM.layout;
  const band = Math.max(0, Math.min(9, millTune.band != null ? millTune.band | 0 : ((L && L.counts && L.counts.eraBand) | 0)));
  const e = bakesFor(band, CM.season === WINTER);
  const T = CM.TILE, z = CM.cam.zoom, sz = t.size || 1;
  const cxW = (t.gx + sz / 2) * T, cyW = (t.gy + sz / 2) * T;
  const prevSm = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  // La HALLE (2-3 cases) : la tour, et sa grange contre elle au nord-est.
  const ta = millTowerAt(sz);
  const tx = cxW + ta.x, ty = cyW + ta.y;
  const o = worldToScreen(tx, ty);
  // Le sol d'abord (terre tassée : la cour de la grange, le pied de la tour) —
  // TOUT le sol avant tout volume, sinon une tache de terre mord sur la grange.
  if (sz >= 2) {
    const gb = place(worldToScreen(tx + 22, ty - 20), e.ground.R, z);
    ctx.drawImage(e.ground.cv, gb.dx, gb.dy, gb.dw, gb.dh);
  }
  const g = place(o, e.ground.R, z);
  ctx.drawImage(e.ground.cv, g.dx, g.dy, g.dw, g.dh);
  if (sz >= 2) {
    const b = barnFor(e, sz), pb = place(worldToScreen(cxW, cyW), b.R, z);
    drawSunShadow(ctx, b.cv, pb.dx, pb.dy, pb.dw, pb.dh, 0, 0, b.R.w, b.R.h, 'column', false);
    ctx.drawImage(b.cv, pb.dx, pb.dy, pb.dw, pb.dh);
    lightCutImage(b.cv, pb.dx, pb.dy, pb.dw, pb.dh);
    nightBlit(b.N, pb);
  }
  // Puis l'ombre de la tour, la tour, les ailes.
  const tw = e.tower, p = place(o, tw.R, z);
  // Pose d'ailes : phase et cadence propres à l'instance.
  const sd = cmHash('mill:' + t.gx + ':' + t.gy) >>> 0;
  const period = millTune.period * (0.92 + ((sd >>> 8) % 17) / 100);
  const f = Math.floor((((now || 0) / period) + (sd % 1000) / 1000) * MILL_FRAMES) % MILL_FRAMES;
  const sl = e.sails[(f + MILL_FRAMES) % MILL_FRAMES], ps = place(o, sl.R, z);
  if (CM.hover && CM.hover.tile === t) {
    const k = Math.max(1, Math.round(z));
    for (const [ox, oy] of [[-k, 0], [k, 0], [0, -k], [0, k]]) {
      ctx.drawImage(tw.gold, p.dx + ox, p.dy + oy, p.dw, p.dh);
      ctx.drawImage(sl.gold, ps.dx + ox, ps.dy + oy, ps.dw, ps.dh);
    }
  }
  drawSunShadow(ctx, tw.cv, p.dx, p.dy, p.dw, p.dh, 0, 0, tw.R.w, tw.R.h, 'column', false);
  ctx.drawImage(tw.cv, p.dx, p.dy, p.dw, p.dh);
  lightCutImage(tw.cv, p.dx, p.dy, p.dw, p.dh);
  ctx.drawImage(sl.cv, ps.dx, ps.dy, ps.dw, ps.dh);
  lightCutImage(sl.cv, ps.dx, ps.dy, ps.dw, ps.dh);
  // La nuit : fenêtres, feu de nacelle, pales de lumière (calque de lumière).
  nightBlit(tw.N, p);
  nightBlit(sl.N, ps);
  ctx.imageSmoothingEnabled = prevSm;
  const x0 = Math.min(p.dx, ps.dx), y0 = Math.min(p.dy, ps.dy);
  const x1 = Math.max(p.dx + p.dw, ps.dx + ps.dw), y1 = Math.max(p.dy + p.dh, ps.dy + ps.dh);
  return { dx: x0, dy: y0, dw: x1 - x0, dh: y1 - y0 };
}

if (typeof window !== 'undefined') {
  window.__millTune = (o) => { if (o) Object.assign(millTune, o); _bakes.clear(); return { ...millTune }; };
}
