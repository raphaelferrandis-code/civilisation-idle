// LE CHAMP — un patchwork de parcelles cultivées, façon TheoTown.
//
// Extrait d'isoRenderer.js le 2026-08-23 (Q10). Chaque emprise agricole se découpe
// en parcelles, chacune avec sa culture et ses sillons, à un stade qui suit la
// saison. Le tout est cuit dans le bake du sol : ces champs ne bougent pas.
//
// ⚠ EXTRACTION PURE — AUCUN PIXEL NE CHANGE. Couture mesurée avant la coupe :
// ZÉRO dépendance entrante, une seule sortante (`drawIsoField`). Vérifiée ligne à
// ligne contre la version commitée.
import { CM } from '../layout.js';
import { fillWorldQuad } from './isoQuad.js';
import { rgb } from './isoPalette.js';
import { worldToScreen } from './projection.js';
import { bakeFieldParcel } from './fieldBake.js';
import { wonderKitForBand } from './wonderKits.js';
import { lightCtx } from '../lightLayer.js';
import { bakeBudgetOk, bakeTimed } from './bakeBudget.js';

// ── LE TERROIR AU PIXEL (docs/PLAN-TERROIR.md, T2) ───────────────────────────
// Chaque parcelle du terroir est CUITE par fieldBake.js (lanières, rangs d'un
// pixel, clôture de l'ère, récolte) puis posée à la grille, comme le pont et les
// merveilles — à toutes les bandes. Le patchwork vectoriel plus bas (drawIsoField)
// n'est plus que l'« avant » de la molette : __fieldTune({ on: false }).
export const fieldTune = { on: true, band: null };
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
  if (!fieldTune.on || typeof document === 'undefined') return false;
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
if (typeof window !== 'undefined') {
  window.__fieldTune = (o) => { if (o) Object.assign(fieldTune, o); _fieldBakes.clear(); return { ...fieldTune }; };
}

// ── CHAMP iso « façon TheoTown » : patchwork de parcelles cultivées ──────────
// Refonte du champ plat (retour Raph « améliore mes champs », réf TheoTown).
// L'emprise (losange) est PAVÉE de parcelles distinctes, séparées par des allées
// de terre : chacune tire une CULTURE (verts variés / blé doré / jachère brune)
// groupée en clusters 2×2 → parcelles voisines identiques (pas de damier bruité),
// puis porte des SILLONS iso-alignés (rangs diagonaux à l'écran) en corduroy —
// crête claire côté nord-ouest (lumière haut-gauche), vallée sombre côté sud-est.
// Palette + stades calqués sur la scène legacy (cityEngineSprites irrigated_fields)
// → DA cohérente ; 4 stades d'ère (rustique → hydroponie). 100 % espace-monde
// (parallélogrammes projetés) : aucune dépendance sprite, se pose même sur berge.
const FIELD_PAL = [
  { crop: [[74, 110, 42], [60, 94, 34], [90, 114, 50], [106, 122, 48]], ripe: [[154, 134, 54], [138, 122, 48]], fallow: [[106, 79, 44], [92, 69, 38]], fRoll: 4, rRoll: 2 },
  { crop: [[74, 124, 40], [60, 104, 32], [90, 138, 48], [111, 154, 56]], ripe: [[185, 162, 58], [200, 176, 72]], fallow: [[106, 79, 44]], fRoll: 2, rRoll: 3 },
  { crop: [[90, 138, 58], [74, 128, 48], [111, 154, 56], [127, 170, 66]], ripe: [[200, 176, 72], [212, 188, 82], [185, 162, 58]], fallow: [[106, 84, 48]], fRoll: 1, rRoll: 4 },
  { crop: [[63, 154, 85], [70, 168, 95], [82, 176, 106], [74, 168, 96]], ripe: [[127, 184, 74], [111, 176, 64]], fallow: [[58, 106, 82]], fRoll: 1, rRoll: 2 },
];
// Contraste des sillons par nature de parcelle : la jachère nue montre un fort
// corduroy labouré ; la culture verte, de fins rangs (plants) ; le blé mûr, des
// ondulations discrètes. liteW/darkW = largeur (fraction de période) de la crête
// éclairée puis de la vallée sombre ; sp = pas des rangs (tuiles).
const FIELD_FURROW = {
  fallow: { liteW: 0.34, lite: 1.16, darkW: 0.46, dark: 0.60, sp: 0.24 },
  crop: { liteW: 0.16, lite: 1.13, darkW: 0.30, dark: 0.80, sp: 0.26 },
  ripe: { liteW: 0.16, lite: 1.09, darkW: 0.20, dark: 0.86, sp: 0.30 },
};
export function drawIsoField(ctx, t, spanX, spanY, band, eraIdx) {
  const T = CM.TILE, gx = t.gx, gy = t.gy;
  const stage = eraIdx < 10 ? 0 : eraIdx < 20 ? 1 : eraIdx < 30 ? 2 : 3;
  const PAL = FIELD_PAL[stage];
  const dirt = stage === 3 ? [98, 108, 116] : [118, 94, 60];   // béton clair / terre battue (allées)
  // Fond d'allées : losange d'emprise en terre — visible dans les marges entre parcelles.
  const q = (x0, y0, x1, y1) => fillWorldQuad(ctx, x0 * T, y0 * T, x1 * T, y1 * T);
  ctx.fillStyle = rgb(dirt, 0.92);
  q(gx, gy, gx + spanX, gy + spanY);
  // Grille de parcelles (~2 tuiles/parcelle, bornée pour le coût de rendu).
  const pcx = Math.max(1, Math.min(5, Math.round(spanX / 2)));
  const pcy = Math.max(1, Math.min(4, Math.round(spanY / 2)));
  const pwx = spanX / pcx, pwy = spanY / pcy;
  const marg = Math.min(0.11, pwx * 0.09, pwy * 0.09);         // allée de terre entre parcelles
  const fhash = (a, b) => ((Math.imul((a + 1) | 0, 73856093) ^ Math.imul((b + 1) | 0, 19349663) ^ Math.imul(stage + 1, 83492791)) >>> 0);
  for (let ri = 0; ri < pcy; ri++) {
    for (let ci = 0; ci < pcx; ci++) {
      const cl = fhash(ci >> 1, ri >> 1);         // cluster 2×2 → parcelles voisines identiques
      const cell = fhash(ci, ri);
      const roll = cl % 12;
      let base, kind;
      if (roll < PAL.fRoll) { base = PAL.fallow[cell % PAL.fallow.length]; kind = 'fallow'; }
      else if (roll < PAL.fRoll + PAL.rRoll) { base = PAL.ripe[(cell >> 2) % PAL.ripe.length]; kind = 'ripe'; }
      else { base = PAL.crop[(cell >> 2) % PAL.crop.length]; kind = 'crop'; }
      const jit = 0.93 + ((cell % 100) / 100) * 0.13;          // léger vibrato de teinte parcelle à parcelle
      const x0 = gx + ci * pwx + marg, x1 = gx + (ci + 1) * pwx - marg;
      const y0 = gy + ri * pwy + marg, y1 = gy + (ri + 1) * pwy - marg;
      ctx.fillStyle = rgb(base, jit);
      q(x0, y0, x1, y1);                                        // corps de parcelle
      // Sillons iso-alignés : sens (le long de X ou de Y) décidé par le cluster.
      const alongY = ((cl >> 4) & 1) === 1;                     // true → rangs à x constant
      const lo = alongY ? x0 : y0, hi = alongY ? x1 : y1;
      const fp = FIELD_FURROW[kind];
      const rows = Math.max(2, Math.round((hi - lo) / fp.sp));
      const period = (hi - lo) / rows;
      for (let k = 0; k < rows; k++) {
        const a = lo + k * period;                             // crête (NO, éclairée) puis vallée (SE, sombre)
        const lb = a + period * fp.liteW, db = Math.min(hi, lb + period * fp.darkW);
        if (alongY) {
          ctx.fillStyle = rgb(base, fp.lite); q(a, y0, lb, y1);
          ctx.fillStyle = rgb(base, fp.dark); q(lb, y0, db, y1);
        } else {
          ctx.fillStyle = rgb(base, fp.lite); q(x0, a, x1, lb);
          ctx.fillStyle = rgb(base, fp.dark); q(x0, lb, x1, db);
        }
      }
      // Relief de planche surélevée : liséré éclairé sur les 2 arêtes HAUTES (nord —
      // lumière haut-gauche) et ombre sur les 2 arêtes BASSES (sud) → chaque parcelle
      // se détache de l'allée et « bombe » légèrement.
      const lip = Math.min(0.05, (x1 - x0) * 0.12, (y1 - y0) * 0.12);
      ctx.fillStyle = rgb(base, 1.28); q(x0, y0, x1, y0 + lip); q(x0, y0, x0 + lip, y1);
      ctx.fillStyle = rgb(base, 0.52); q(x0, y1 - lip, x1, y1); q(x1 - lip, y0, x1, y1);
    }
  }
}

