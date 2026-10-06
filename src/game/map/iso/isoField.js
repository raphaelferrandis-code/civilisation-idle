// LE CHAMP — un patchwork de parcelles cultivées, façon TheoTown.
//
// Extrait d'isoRenderer.js le 2026-08-23 (Q10). Chaque emprise agricole se découpe
// en parcelles, chacune avec sa culture et ses sillons, à un stade qui suit la
// saison. Chaque parcelle est cuite une fois (fieldBake.js, sous budget) puis
// blitée par la passe VIVANTE du peintre (isoLivePaint), pas par le sol cuit.
//
// ⚠ EXTRACTION PURE — AUCUN PIXEL NE CHANGE. Couture mesurée avant la coupe :
// ZÉRO dépendance entrante, une seule sortante. Vérifiée ligne à ligne contre la
// version commitée.
import { CM } from '../layout.js';
import { worldToScreen } from './projection.js';
import { bakeFieldParcel } from './fieldBake.js';
import { wonderKitForBand } from './wonderKits.js';
import { lightCtx } from '../lightLayer.js';
import { bakeBudgetOk, bakeTimed } from './bakeBudget.js';

// ── LE TERROIR AU PIXEL (docs/PLAN-TERROIR.md, T2) ───────────────────────────
// Chaque parcelle du terroir est CUITE par fieldBake.js (lanières, rangs d'un
// pixel, clôture de l'ère, récolte) puis posée à la grille, comme le pont et les
// merveilles — à toutes les bandes. (Le patchwork vectoriel d'avant, drawIsoField,
// qui ne servait plus que d'« avant » à la molette __fieldTune({ on: false }), a été
// retiré le 2026-10-06, audit MORT-13.) Molette d'aperçu : __fieldTune({ band }).
export const fieldTune = { band: null };
const _fieldBakes = new Map();
// Cellules de TOUTES les parcelles (mémoïsé sur le plan) : une limite entre deux
// parcelles ne porte qu'UNE haie — celle du côté nord/ouest de la parcelle du
// sud/est ; les bords sud et est n'en portent que face à la campagne.
function fieldCellsOf(L) {
  if (L._fieldCells) return L._fieldCells;
  const s = new Set();
  for (const t of L.tiles || []) {
    if (t.type !== 'engine' || t.buildingId !== 'irrigated_fields') continue;
    const sx = t.spanX || t.size || 1, sy = t.spanY || t.size || 1;
    for (let ax = 0; ax < sx; ax += 1) for (let ay = 0; ay < sy; ay += 1) s.add((t.gx + ax) + ',' + (t.gy + ay));
  }
  L._fieldCells = s;
  return s;
}
function hedgesOf(t, sx, sy, L) {
  const T = CM.TILE, cells = fieldCellsOf(L);
  const open = (n, at) => {
    const out = [];
    for (let k = 0; k < n; k += 1) {
      if (cells.has(at(k))) continue;
      const last = out[out.length - 1];
      if (last && last[1] === k * T) last[1] = (k + 1) * T; else out.push([k * T, (k + 1) * T]);
    }
    return out;
  };
  return {
    n: [[0, sx * T]], w: [[0, sy * T]],
    s: open(sx, (k) => (t.gx + k) + ',' + (t.gy + sy)),
    e: open(sy, (k) => (t.gx + sx) + ',' + (t.gy + k)),
  };
}
function fieldCanvas(R) {
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, R.w); cv.height = Math.max(1, R.h);
  cv.getContext('2d').putImageData(new ImageData(R.data, R.w, R.h), 0, 0);
  return cv;
}
// Les haies d'une parcelle et sa CLÉ, gardées sur la tuile pour son plan (audit du
// 05/10, PERF-49) : hedgesOf et JSON.stringify tournaient à chaque frame et pour
// chaque parcelle, alors qu'ils ne dépendent que du plan (fieldCellsOf, mémoïsé sur
// lui ; un plan neuf vient toujours avec son horodatage de recalcul), de la tuile et
// de la taille de case. Le plan lui-même n'est pas retenu par la tuile.
function parcelOf(t, sx, sy, L) {
  const T = CM.TILE, at = CM.layoutRecomputeAt;
  const m = t._fieldP;
  if (m && m.at === at && m.T === T && m.sx === sx && m.sy === sy && m.gx === t.gx && m.gy === t.gy) return m;
  const hedges = hedgesOf(t, sx, sy, L);
  t._fieldP = { at, T, sx, sy, gx: t.gx, gy: t.gy, hedges, key: t.gx + ',' + t.gy + ':' + sx + 'x' + sy + ':' + JSON.stringify(hedges) };
  return t._fieldP;
}
// UNE ENTRÉE PAR PARCELLE (audit du 05/10, PERF-50) : la bande et la saison ne sont
// plus dans la clé mais dans l'entrée. Au changement de saison (ou de bande), la
// parcelle recuit EN PLACE — les saisons passées ne s'empilaient plus jamais, la
// limite de 48 n'étant pas atteinte avec un seul terroir — et, au-delà du budget de
// cuisson de l'image (bakeBudget.js), garde son image d'avant une image ou deux au
// lieu de tout recuire dans la même (10 à 30 ms par terroir). Une parcelle jamais
// montrée cuit tout de suite, comme avant. Du raster cuit, on ne garde que la boîte :
// ses pixels sont dans le canvas.
function bakeParcel(t, spanX, spanY, b, season, hedges) {
  const seed = (Math.imul(t.gx + 7, 73856093) ^ Math.imul(t.gy + 3, 19349663)) >>> 0;
  const { R, N, pivots } = bakeFieldParcel(spanX, spanY, { band: b, K: wonderKitForBand(b, season === 3), season, seed, hedges });
  return { b, season, R: { ox: R.ox, oy: R.oy, w: R.w, h: R.h }, cv: fieldCanvas(R), N: N ? fieldCanvas(N) : null, pivots };
}
export function drawIsoFieldPixel(ctx, t, spanX, spanY, band, now = 0) {
  if (typeof document === 'undefined') return false;
  const L = CM.layout;
  if (!L) return false;
  const b = Math.max(0, Math.min(9, fieldTune.band != null ? fieldTune.band | 0 : band | 0));
  const season = CM.season | 0;
  const P = parcelOf(t, spanX, spanY, L);
  let e = _fieldBakes.get(P.key);
  if (!e || ((e.b !== b || e.season !== season) && bakeBudgetOk())) {
    const ne = bakeTimed(() => bakeParcel(t, spanX, spanY, b, season, P.hedges));
    if (!e && _fieldBakes.size > 48) _fieldBakes.delete(_fieldBakes.keys().next().value);
    _fieldBakes.set(P.key, ne);
    e = ne;
  }
  const T = CM.TILE, z = CM.cam.zoom, o = worldToScreen(t.gx * T, t.gy * T), R = e.R;
  const dx = Math.round(o.x + R.ox * z), dy = Math.round(o.y + R.oy * z);
  const dw = Math.round(o.x + (R.ox + R.w) * z) - dx, dh = Math.round(o.y + (R.oy + R.h) * z) - dy;
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(e.cv, dx, dy, dw, dh);
  ctx.imageSmoothingEnabled = prev;
  if (e.pivots && e.pivots.length) drawFieldPivots(ctx, e.pivots, o, z, now);
  // La nuit (âges cosmiques) : les rangs de plantes de lumière et les piquets luisent.
  const nf = CM.nightF || 0;
  if (e.N && nf > 0.03) {
    const lc = lightCtx(dx, dy, dx + dw, dy + dh);
    if (lc) {
      const sm = lc.imageSmoothingEnabled;
      lc.imageSmoothingEnabled = false;
      lc.globalAlpha = Math.min(1, nf * 1.1);
      lc.drawImage(e.N, dx, dy, dw, dh);
      lc.globalAlpha = 1;
      lc.imageSmoothingEnabled = sm;
    }
  }
  return true;
}
// LES RAMPES DES PIVOTS (néon) : elles tournent autour de leur tour, un tour en
// ~45 s, chacune partie de son angle cuit. Même repère que le raster de la
// parcelle (x, y en px monde depuis le coin de la tuile ; un point (x, y, h) tombe
// à o + ((x − y)·z, ((x + y)/2 − h)·z)) : la rampe se pose pile sur ses ornières.
// Cran d'ambiance « aucune » : l'angle cuit, immobile.
const PIVOT = { period: 45000, rail: '#c8d0d8', leg: '#7d8690' };
function drawFieldPivots(ctx, pivots, o, z, now) {
  const live = (CM.ambianceK ?? 1) > 0;
  const S = (x, y, h) => [Math.round(o.x + (x - y) * z), Math.round(o.y + ((x + y) / 2 - h) * z)];
  const lw = Math.max(1, Math.round(z));
  ctx.save();
  ctx.lineWidth = lw;
  for (const pv of pivots) {
    const a = pv.a + (live ? (now / PIVOT.period) * Math.PI * 2 : 0);
    const da = Math.cos(a) * pv.r, db = Math.sin(a) * pv.r;
    const ex = pv.x + (pv.alongX ? da : db), ey = pv.y + (pv.alongX ? db : da);
    const p0 = S(pv.x, pv.y, 4), p1 = S(ex, ey, 3);
    ctx.strokeStyle = PIVOT.rail;
    ctx.beginPath(); ctx.moveTo(p0[0] + 0.5, p0[1] + 0.5); ctx.lineTo(p1[0] + 0.5, p1[1] + 0.5); ctx.stroke();
    ctx.strokeStyle = PIVOT.leg;
    for (let t = 0.33; t < 1; t += 0.33) {
      const x = pv.x + (ex - pv.x) * t, y = pv.y + (ey - pv.y) * t;
      const b0 = S(x, y, 0), b1 = S(x, y, 3.5);
      ctx.beginPath(); ctx.moveTo(b0[0] + 0.5, b0[1]); ctx.lineTo(b1[0] + 0.5, b1[1]); ctx.stroke();
    }
  }
  ctx.restore();
}
if (import.meta.env?.DEV && typeof window !== 'undefined') {
  window.__fieldTune = (o) => { if (o) Object.assign(fieldTune, o); _fieldBakes.clear(); return { ...fieldTune }; };
}

