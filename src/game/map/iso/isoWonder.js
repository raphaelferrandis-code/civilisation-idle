"use strict";
// ── LES MERVEILLES AU TRI PEINTRE (docs/PLAN-MERVEILLES.md) ───────────────────
//
// Les merveilles refaites « comme le pont » (Raph, 2026-10-01) : chaque recette de
// wonderBake.js cuit un raster en iso exact, dans la matière de l'ère de la ville
// (wonderKits.js) ; ce module le pose sur la carte.
//
// Placement : le CONTRAT de l'ancien sprite est gardé tel quel — socle carré de
// côté cmWonderBaseTiles × T CENTRÉ sur la case de l'emplacement (wonderFootWorld,
// branche pavée), hauteur au plus cmWonderHeightTiles × T. L'emprise réservée, le
// parvis, la foule qui s'attroupe et le survol ne bougent donc pas.
//
// Tri : le raster est découpé en TRANCHES verticales. Chacune est triée au bord
// AVANT du socle dans sa colonne d'écran (le point le plus au sud-est du carré sur
// cette verticale) : un badaud au pied de la face sud passe devant, un badaud au
// nord du monument disparaît derrière, à toutes les colonnes — un seul point de
// tri (l'ancien pied du sprite) faisait l'un OU l'autre.
//
// Les objets ANIMÉS ou tirés d'une planche (flammes, statues) sont posés au dessin
// par iso/isoProps.js, la même main que ceux du pont.
import { state } from '../../core/state.js';
import { CM, CM_WONDERS, cmWonderActiveIds, cmWonderSlot, cmWonderBaseTiles, cmWonderHeightTiles, cmWonderExtent } from '../layout.js';
import { worldToScreen } from './projection.js';
import { wonderKitForBand } from './wonderKits.js';
import { WINTER } from '../seasonMode.js';
import { bakeMausoleum, bakeColumn, bakePalace, bakeCathedral, bakeNeedle, bakeEye, bakeEyeCore } from './wonderBake.js';
import { drawSunShadow } from './isoSunShadow.js';
import { lightCtx, lightCutImage } from '../lightLayer.js';
import { drawFlame, drawSpriteProp, glowAt, hexToRgbStr } from './isoProps.js';
// Les bannières claquent dans le même vent que celles de la ville (session « petite vie »).
import { drawVieFlag } from './isoVie.js';
import { placePlan, gardenPlan, bakePlaceGround, bakeDecor } from './wonderPlace.js';
import { isleModel, bakeIsleBase, islePlan, bakeIsleTall } from './wonderIsle.js';
import { noteReflection } from './isoReflect.js';
import { setWonderPlacePainter, wonderGroundSet } from './isoWonderGround.js';

// Une recette par merveille (wonderBake.js).
const RECIPES = {
  dynasty1: bakeMausoleum,
  pop1m: bakeColumn,
  era_kingdom: bakePalace,
  era_empire: bakeCathedral,
  era_mega: bakeNeedle,
  era_singularity: bakeEye,
};
// Molette de dev : `__wonderTune.band = n` force la matière d'une ère ; `.slice`
// = largeur des tranches du tri.
export const wonderTune = { slice: 8, band: null };
export function wonderHasRecipe(id) { return !!RECIPES[id]; }

function tierOf(w, L) {
  const pv = CM.previewWonder;
  if (pv && pv.id === w.id) return Math.max(1, Math.min(5, pv.tier | 0));
  return Math.max(1, Math.min(5, ((L.wonderTiers && L.wonderTiers[w.id]) | 0) || 1));
}
function bandOf(L) {
  if (wonderTune.band != null) return wonderTune.band | 0;
  return (L.counts && L.counts.eraBand) | 0;
}

// ── Cuisson (une par merveille × rang × ère) ─────────────────────────────────
function rasterCanvas(R) {
  const cv = document.createElement('canvas');
  cv.width = R.w; cv.height = R.h;
  cv.getContext('2d').putImageData(new ImageData(R.data, R.w, R.h), 0, 0);
  return cv;
}
// Colonnes non vides et boîte d'encre (survol, découpe).
function inkOf(R) {
  const col = new Uint8Array(R.w);
  let x0 = R.w, y0 = R.h, x1 = -1, y1 = -1;
  for (let i = 0; i < R.w; i += 1) {
    for (let j = 0; j < R.h; j += 1) {
      if (!R.data[(j * R.w + i) * 4 + 3]) continue;
      col[i] = 1;
      if (i < x0) x0 = i; if (i > x1) x1 = i; if (j < y0) y0 = j; if (j > y1) y1 = j;
    }
  }
  return { col, box: x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } };
}
const _bakes = new Map();
// L'hiver se cuit à part : la neige tient sur les dessus et les toits au soleil.
const winterNow = () => CM.season === WINTER;
function bakeFor(id, tier, band, B, Hmax, opts = {}) {
  if (typeof document === 'undefined') return null;
  const wtr = winterNow();
  const key = id + ':' + tier + ':' + band + ':' + B.toFixed(2) + ':' + Hmax.toFixed(1) + (wtr ? ':w' : '') + (opts.lift ? ':L' + opts.lift : '');
  let e = _bakes.get(key);
  if (e) return e;
  const out = RECIPES[id](wonderKitForBand(band, wtr), tier, B, Hmax, opts);
  const ink = inkOf(out.R);
  e = { key, R: out.R, cv: rasterCanvas(out.R), cvN: out.N ? rasterCanvas(out.N) : null, occ: ink.col, box: ink.box, props: out.props || [],
    core: out.core || null, coreK: wonderKitForBand(band, wtr), frames: new Map() };
  // Le cœur animé (Œil) compte dans la boîte de survol.
  if (e.core && e.box) {
    const f0 = coreFrame(e, 0), R0 = f0.R, ix = R0.ox - out.R.ox, iy = R0.oy - out.R.oy;
    const x0 = Math.min(e.box.x, ix), y0 = Math.min(e.box.y, iy);
    const x1 = Math.max(e.box.x + e.box.w, ix + R0.w), y1 = Math.max(e.box.y + e.box.h, iy + R0.h);
    e.box = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  // Peu de clés vivent à la fois (une par merveille) ; un aperçu qui balaie rangs
  // et ères en crée d'autres : on borne.
  if (_bakes.size > 24) _bakes.delete(_bakes.keys().next().value);
  _bakes.set(key, e);
  return e;
}

// Images du cœur animé, cuites à la demande (32 pas par tour, ~8 s le tour).
const CORE_F = 32, CORE_MS = 250;
function coreFrame(e, f) {
  let fr = e.frames.get(f);
  if (!fr) {
    const out = bakeEyeCore(e.coreK, e.core, f, CORE_F);
    fr = { R: out.R, cv: rasterCanvas(out.R), cvN: out.N ? rasterCanvas(out.N) : null };
    e.frames.set(f, fr);
  }
  return fr;
}

// ── Modèle d'une merveille posée ─────────────────────────────────────────────
function modelOf(w, wi) {
  const L = CM.layout;
  if (!L) return null;
  const T = CM.TILE;
  const tier = tierOf(w, L), band = bandOf(L);
  const slot = cmWonderSlot(wi, L.gridN, L.cx, L.cy);
  const B = cmWonderBaseTiles(w.id, tier) * T;
  const Hmax = cmWonderHeightTiles(w.id, tier) * T;
  // L'AIGUILLE se dresse au centre de son ÎLOT construit (wonderIsle.js) : le fuseau
  // creusé dans le fleuve par layout.js, centré sur le sample le plus proche du slot
  // — pas forcément sur le slot lui-même.
  const il = w.id === 'era_mega' && L.river && L.river.islands && L.river.islands[0];
  const isle = il ? isleModel(tier, il) : null;
  const bk = bakeFor(w.id, tier, band, B, Hmax, isle ? { lift: isle.top } : {});
  if (!bk) return null;
  const cx = il ? il.x * T : (slot.gx + 0.5) * T, cy = il ? il.y * T : (slot.gy + 0.5) * T;
  return { w, wi, tier, band, B, half: B / 2, slot, cx, cy, bk, il, isle };
}

// ── L'îlot de l'Aiguille (wonderIsle.js) ─────────────────────────────────────
const _isles = new Map();
function isleFor(m) {
  if (!m.il || typeof document === 'undefined') return null;
  const wtr = winterNow(), il = m.il;
  const key = m.tier + ':' + m.band + ':' + (wtr ? 'w' : '') + ':' + il.rx + ':' + il.ry + ':' + il.tx.toFixed(3) + ':' + il.ty.toFixed(3);
  let e = _isles.get(key);
  if (e) return e;
  const K = wonderKitForBand(m.band, wtr);
  const base = bakeIsleBase(K, m.tier, il);
  const plan = islePlan(K, m.tier, il);
  const kinds = new Map();
  e = {
    key, M: base.M, R: base.R, cv: rasterCanvas(base.R), cvR: rasterCanvas(base.Rr), box: inkOf(base.R).box, props: plan.props,
    talls: plan.talls.map((q) => {
      if (!kinds.has(q.kind)) {
        const t = bakeIsleTall(q.kind, K, m.tier);
        kinds.set(q.kind, { R: t.R, cv: rasterCanvas(t.R), cvN: t.N ? rasterCanvas(t.N) : null, props: t.props });
      }
      return { ...q, ...kinds.get(q.kind) };
    }),
  };
  // Profondeur du point le plus au nord-ouest de l'île (rochers compris) : la base
  // se peint avant tout ce qui se tient dessus.
  const M = base.M;
  e.backD = -Math.hypot(M.RX * (M.tx + M.ty), M.RY * (M.tx - M.ty)) - 20;
  // Bord AVANT de l'île sur une verticale d'écran X (local) : pour savoir si un
  // bateau passe devant (on le redessine) ou derrière (l'île le cache déjà).
  e.frontAt = (X) => {
    let best = -Infinity;
    for (let k = 0; k < 96; k += 1) {
      const a = (k / 96) * 2 * Math.PI;
      const u = M.RX * 1.08 * Math.cos(a), v = M.RY * 1.1 * Math.sin(a);
      const x = u * M.tx - v * M.ty, y = u * M.ty + v * M.tx;
      if (Math.abs(x - y - X) < 6 && x + y > best) best = x + y;
    }
    return best;
  };
  if (_isles.size > 8) _isles.delete(_isles.keys().next().value);
  _isles.set(key, e);
  return e;
}

// ── Le lieu (wonderPlace.js) ─────────────────────────────────────────────────
// Le carré pavé : le parvis taillé au socle (L.wonderPaveR, structure de ville),
// sinon la même formule — demi-socle + 1,5 case.
function townPave(m) {
  const L = CM.layout;
  const pr = L && L.wonderPaveR && L.wonderPaveR[m.w.id];
  return pr != null && Number.isFinite(pr) ? pr : null;
}
function placeCells(m) {
  const pr = townPave(m);
  return pr != null ? pr : Math.ceil(m.B / CM.TILE / 2 + 1.5);
}
const _places = new Map();
function placeFor(m) {
  if (m.w.id === 'era_mega' || typeof document === 'undefined') return null;
  const P = placeCells(m), half = (P + 0.5) * CM.TILE;
  const wtr = winterNow();
  // Là où le sol a pavé TOUTE l'emprise (hors structure de ville, et l'aperçu
  // __showWonder), l'anneau au-delà du lieu devient un jardin (gardenPlan). En
  // structure de ville il est déjà une pelouse (L.townGreen) : on n'y touche pas.
  const L = CM.layout, wg = L && wonderGroundSet(L);
  const ring = (dx, dy) => wg && wg.has((m.slot.gx + dx) + ',' + (m.slot.gy + dy));
  const ext = ring(P + 1, 0) || ring(0, P + 1) || ring(-P - 1, 0) ? cmWonderExtent(m.w.id, m.tier).halfW : 0;
  const key = m.w.id + ':' + m.tier + ':' + m.band + ':' + P + ':' + ext + (wtr ? ':w' : '');
  let e = _places.get(key);
  if (e) return e;
  const K = wonderKitForBand(m.band, wtr);
  const plan = placePlan(m.w.id, m.tier, K, m.B, half);
  const G = bakePlaceGround(plan, half);
  let garden = null, decor = plan.decor;
  if (ext > P) {
    const ho = (ext + 0.5) * CM.TILE, gp = gardenPlan(K, half, ho), GG = bakePlaceGround(gp, ho);
    garden = { ext, G: GG, cv: rasterCanvas(GG) };
    decor = decor.concat(gp.decor);
  }
  const kinds = new Map();
  e = {
    key, P, half, G, cv: rasterCanvas(G), props: plan.props, garden,
    decor: decor.map((d) => {
      const k = d.kind + ':' + (d.s || 0);
      if (!kinds.has(k)) { const R = bakeDecor(d.kind, K, d.s); kinds.set(k, { R, cv: rasterCanvas(R) }); }
      return { ...d, ...kinds.get(k) };
    }),
  };
  if (_places.size > 24) _places.delete(_places.keys().next().value);
  _places.set(key, e);
  return e;
}
// Peint les lieux d'une fournée du sol (isoWonderGround) : chaque cellule du parvis
// de la fournée qui tombe dans un lieu en reçoit sa part, découpée au losange — les
// cellules d'artère ou de route restent ce qu'elles sont.
function drawWonderPlaces(ctx, cells, hw, hh) {
  if (!cells.length || !CM.layout || !Array.isArray(state.wonders)) return;
  const T = CM.TILE, kx = hw / T, ky = (2 * hh) / T;
  const gx0 = cells[0], gy0 = cells[1], px0 = cells[2], py0 = cells[3];
  const toBake = (wx, wy) => ({ x: px0 + (wx - gx0 * T - (wy - gy0 * T)) * kx, y: py0 + (wx - gx0 * T + (wy - gy0 * T)) * 0.5 * ky });
  const active = cmWonderActiveIds(state), pv = CM.previewWonder;
  for (let wi = 0; wi < CM_WONDERS.length; wi += 1) {
    const w = CM_WONDERS[wi];
    if (!wonderHasRecipe(w.id) || !(active.has(w.id) || (pv && pv.id === w.id))) continue;
    const m = modelOf(w, wi);
    const pl = m && placeFor(m);
    if (!pl) continue;
    // Le lieu (cellules à ≤ P de l'emplacement), puis le jardin (au-delà).
    const layer = (G, cv, inRing) => {
      let n = 0;
      ctx.save();
      ctx.beginPath();
      for (let i = 0; i < cells.length; i += 4) {
        const d = Math.max(Math.abs(cells[i] - m.slot.gx), Math.abs(cells[i + 1] - m.slot.gy));
        if (!inRing(d)) continue;
        const px = cells[i + 2], py = cells[i + 3];
        ctx.moveTo(px, py); ctx.lineTo(px + hw, py + hh); ctx.lineTo(px, py + 2 * hh); ctx.lineTo(px - hw, py + hh); ctx.closePath();
        n += 1;
      }
      if (n) {
        ctx.clip();
        const o = toBake(m.cx + G.oy + G.ox / 2, m.cy + G.oy - G.ox / 2);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(cv, o.x, o.y, G.w * kx, G.h * ky);
      }
      ctx.restore();
    };
    layer(pl.G, pl.cv, (d) => d <= pl.P);
    if (pl.garden) layer(pl.garden.G, pl.garden.cv, (d) => d > pl.P && d <= pl.garden.ext);
  }
}
setWonderPlacePainter(drawWonderPlaces);
// Coin haut-gauche ÉCRAN du raster (repère local : X = x − y, Y = (x + y)/2).
function originScreen(m) {
  const R = m.bk.R;
  return worldToScreen(m.cx + R.oy + R.ox / 2, m.cy + R.oy - R.ox / 2);
}
// Profondeur du BORD AVANT du socle sur la verticale locale X (px monde) : le point
// du carré |x|,|y| ≤ half le plus au sud-est sur x − y = X a x + y = 2·half − |X|.
function frontDepth(m, X) {
  return m.cx + m.cy + 2 * m.half - Math.abs(X);
}
// Érection : 1,4 s en douceur depuis la naissance (même horloge que l'ancien sprite).
function riseOf(w, now) {
  const born = CM.born['wonder:' + w.id];
  const p = born ? Math.max(0, Math.min(1, (now - born) / 1400)) : 1;
  return p * p * (3 - 2 * p);
}

// ── Tri peintre ──────────────────────────────────────────────────────────────
export function pushIsoWonderItems(items, w, wi) {
  const m = modelOf(w, wi);
  if (!m) return;
  const R = m.bk.R, S = wonderTune.slice;
  // Cull : la boîte d'encre à l'écran, avec une marge pour l'ombre portée.
  const o = originScreen(m), z = CM.cam.zoom, bx = m.bk.box;
  if (!bx) return;
  const sx0 = o.x + bx.x * z, sy0 = o.y + bx.y * z, sw = bx.w * z, sh = bx.h * z;
  if (sx0 > CM.cw + sh * 0.6 || sx0 + sw + sh * 0.6 < 0 || sy0 > CM.ch || sy0 + sh < 0) return;
  // L'ÎLOT de l'Aiguille : sa base d'un bloc, sous tout ce qui se tient dessus (même
  // l'ombre de l'Aiguille), puis tours, arbres et feux à leur pied ; les bateaux qui
  // passent DEVANT l'île sont redessinés après elle (la flotte est peinte avant la
  // passe vivante, l'île la recouvrirait).
  const isl = isleFor(m);
  m.isl = isl;
  if (isl) {
    CM.wonderIsle = true;
    items.push({ d: m.cx + m.cy + isl.backD, kind: 'wonderSeg', w, wi, m, part: 'isle' });
    for (let ti = 0; ti < isl.talls.length; ti += 1) {
      const q = isl.talls[ti];
      items.push({ d: m.cx + m.cy + q.x + q.y, kind: 'wonderSeg', w, wi, m, part: 'itall', ti });
    }
    for (let pi = 0; pi < isl.props.length; pi += 1) {
      const pr = isl.props[pi];
      items.push({ d: m.cx + m.cy + pr.x + pr.y + 0.2, kind: 'wonderSeg', w, wi, m, part: 'iprop', pi });
    }
    for (const sh of (CM.ships || [])) {
      const hb = sh._hull;
      if (!hb) continue;
      const x = hb.wx - m.cx, y = hb.wy - m.cy;
      if (Math.abs(x) > isl.M.RX + 80 || Math.abs(y) > isl.M.RX + 80) continue;
      const f = isl.frontAt(x - y);
      if (f === -Infinity || x + y <= f) continue;
      items.push({ d: hb.wx + hb.wy, kind: 'wonderSeg', w, wi, m, part: 'iship', sh });
    }
  }
  // Ombre et reflet : une fois, sous tout le monument.
  items.push({ d: m.cx + m.cy - 2 * m.half - 1, kind: 'wonderSeg', w, wi, m, part: 'shadow' });
  for (let c0 = 0; c0 < R.w; c0 += S) {
    const c1 = Math.min(R.w, c0 + S);
    let any = false;
    for (let i = c0; i < c1; i += 1) if (m.bk.occ[i]) { any = true; break; }
    if (!any) continue;
    const Xa = R.ox + c0, Xb = R.ox + c1;
    const minAbs = Xa <= 0 && Xb >= 0 ? 0 : Math.min(Math.abs(Xa), Math.abs(Xb));
    items.push({ d: frontDepth(m, minAbs), kind: 'wonderSeg', w, wi, m, part: 'slice', c0, c1 });
  }
  // Le cœur animé de l'Œil : après la tranche centrale (rien du monument devant lui).
  if (m.bk.core) items.push({ d: frontDepth(m, 0) + 0.3, kind: 'wonderSeg', w, wi, m, part: 'core' });
  // Le lieu : décor en relief et objets posés, chacun à son pied.
  const pl = placeFor(m);
  m.pl = pl;
  if (pl) {
    for (let di = 0; di < pl.decor.length; di += 1) {
      const dc = pl.decor[di];
      items.push({ d: m.cx + m.cy + dc.x + dc.y, kind: 'wonderSeg', w, wi, m, part: 'decor', di });
    }
    for (let pi = 0; pi < pl.props.length; pi += 1) {
      const pr = pl.props[pi];
      items.push({ d: m.cx + m.cy + pr.x + pr.y + 0.2, kind: 'wonderSeg', w, wi, m, part: 'pprop', pi });
    }
  }
  // Objets : juste après la tranche qui les porte.
  for (let pi = 0; pi < m.bk.props.length; pi += 1) {
    const pr = m.bk.props[pi];
    const X = pr.rx != null ? R.ox + pr.rx : pr.x - pr.y;
    items.push({ d: frontDepth(m, X) + 0.5, kind: 'wonderSeg', w, wi, m, part: 'prop', pi });
  }
}

export function drawIsoWonderSeg(ctx, it, now) {
  // Le modèle est celui calculé au tri de CETTE frame (porté par l'item).
  const m = it.m || modelOf(it.w, it.wi);
  if (!m) return;
  const R = m.bk.R, cv = m.bk.cv, z = CM.cam.zoom;
  const o = originScreen(m);
  const e = riseOf(it.w, now);
  if (e <= 0.01) return;
  // Le monument SORT DE TERRE : on découvre le raster par le bas.
  const cut = Math.floor(R.h * (1 - e));
  const prevSm = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  const y0 = Math.round(o.y + cut * z), y1 = Math.round(o.y + R.h * z);
  if (it.part === 'shadow') {
    if (e >= 0.98) {
      const x0 = Math.round(o.x), x1 = Math.round(o.x + R.w * z);
      // Pas de reflet pour l'Aiguille : son îlot (session du fleuve) est entre elle
      // et l'eau, le reflet se posait sur le sable.
      drawSunShadow(ctx, cv, x0, y0, x1 - x0, y1 - y0, 0, 0, R.w, R.h, 'column', it.w.id !== 'era_mega');
    }
    // Survol : la boîte d'encre réellement dessinée (même idiome que l'ancien sprite).
    const bx = m.bk.box;
    if (bx && CM._wonderBoxes) {
      const top = Math.max(bx.y, cut);
      CM._wonderBoxes.push({ dx: o.x + bx.x * z, dy: o.y + top * z, dw: bx.w * z, dh: (bx.y + bx.h - top) * z, wi: it.wi });
    }
  } else if (it.part === 'slice') {
    const x0 = Math.round(o.x + it.c0 * z), x1 = Math.round(o.x + it.c1 * z);
    if (x1 > x0 && y1 > y0) {
      ctx.drawImage(cv, it.c0, cut, it.c1 - it.c0, R.h - cut, x0, y0, x1 - x0, y1 - y0);
      lightCutImage(cv, x0, y0, x1 - x0, y1 - y0, it.c0, cut, it.c1 - it.c0, R.h - cut);
      // LA NUIT : vitres et vitraux allumés, lanternes, filets lumineux — déposés
      // APRÈS la découpe de la tranche (sinon elle les effacerait elle-même).
      const nf = CM.nightF || 0;
      if (m.bk.cvN && nf > 0.03) {
        const lc = lightCtx(x0, y0, x1, y1);
        if (lc) {
          lc.globalAlpha = Math.min(1, nf * 1.15);
          lc.drawImage(m.bk.cvN, it.c0, cut, it.c1 - it.c0, R.h - cut, x0, y0, x1 - x0, y1 - y0);
          lc.globalAlpha = 1;
        }
      }
    }
  } else if (it.part === 'isle') {
    const isl = m.isl || isleFor(m);
    if (isl) {
      const B2 = isl.R, q = worldToScreen(m.cx + B2.oy + B2.ox / 2, m.cy + B2.oy - B2.ox / 2);
      const bcut = Math.floor(B2.h * (1 - e));
      const dx = Math.round(q.x), dy = Math.round(q.y + bcut * z), dw = Math.round(q.x + B2.w * z) - dx, dh = Math.round(q.y + B2.h * z) - dy;
      if (dh > 0) {
        // Le quai se reflète dans le fleuve, comme le pont et les quais.
        if (e >= 0.98) noteReflection(ctx, isl.cvR, dx, dy, dw, dh, 0, bcut, B2.w, B2.h - bcut, 'column', 'water');
        ctx.drawImage(isl.cv, 0, bcut, B2.w, B2.h - bcut, dx, dy, dw, dh);
        lightCutImage(isl.cv, dx, dy, dw, dh, 0, bcut, B2.w, B2.h - bcut);
      }
      const bx = isl.box;
      if (bx && CM._wonderBoxes) CM._wonderBoxes.push({ dx: q.x + bx.x * z, dy: q.y + Math.max(bx.y, bcut) * z, dw: bx.w * z, dh: (bx.y + bx.h - Math.max(bx.y, bcut)) * z, wi: it.wi });
    }
  } else if (it.part === 'itall' && e >= 0.6) {
    const isl = m.isl || isleFor(m), q = isl && isl.talls[it.ti];
    if (q) {
      const R2 = q.R, s = worldToScreen(m.cx + q.x + R2.oy + R2.ox / 2, m.cy + q.y + R2.oy - R2.ox / 2, q.h);
      const dx = Math.round(s.x), dy = Math.round(s.y), dw = Math.round(s.x + R2.w * z) - dx, dh = Math.round(s.y + R2.h * z) - dy;
      drawSunShadow(ctx, q.cv, dx, dy, dw, dh, 0, 0, R2.w, R2.h, 'column', false);
      ctx.drawImage(q.cv, dx, dy, dw, dh);
      lightCutImage(q.cv, dx, dy, dw, dh);
      const nf = CM.nightF || 0;
      if (q.cvN && nf > 0.03) {
        const lc = lightCtx(dx, dy, dx + dw, dy + dh);
        if (lc) { lc.globalAlpha = Math.min(1, nf * 1.15); lc.drawImage(q.cvN, dx, dy, dw, dh); lc.globalAlpha = 1; }
      }
      // Ce qu'elle porte (drapeau, feu, lanterne) : à son sommet, juste après elle.
      for (const pr of q.props) drawWonderProp(ctx, m, { ...pr, x: q.x + pr.x, y: q.y + pr.y, h: q.h + pr.h }, z, now, it.ti * 13 + 5);
    }
  } else if (it.part === 'iprop' && e >= 0.98) {
    const isl = m.isl || isleFor(m), pr = isl && isl.props[it.pi];
    if (pr) drawWonderProp(ctx, m, pr, z, now, it.pi);
  } else if (it.part === 'iship') {
    const hb = it.sh._hull;
    if (hb) {
      const prevA = ctx.globalAlpha;
      ctx.globalAlpha = hb.a == null ? 1 : hb.a;
      ctx.drawImage(hb.img, hb.bx, hb.by, hb.dw, hb.dw);
      ctx.globalAlpha = prevA;
    }
  } else if (it.part === 'core' && e >= 0.98) {
    const fr = coreFrame(m.bk, Math.floor(now / CORE_MS) % CORE_F), C = fr.R;
    const q = worldToScreen(m.cx + C.oy + C.ox / 2, m.cy + C.oy - C.ox / 2);
    const dx = Math.round(q.x), dy = Math.round(q.y), dw = Math.round(q.x + C.w * z) - dx, dh = Math.round(q.y + C.h * z) - dy;
    ctx.drawImage(fr.cv, dx, dy, dw, dh);
    lightCutImage(fr.cv, dx, dy, dw, dh);
    const nf = CM.nightF || 0;
    if (fr.cvN && nf > 0.03) {
      const lc = lightCtx(dx, dy, dx + dw, dy + dh);
      if (lc) { lc.globalAlpha = Math.min(1, nf * 1.15); lc.drawImage(fr.cvN, dx, dy, dw, dh); lc.globalAlpha = 1; }
    }
  } else if (it.part === 'decor') {
    const pl = m.pl || placeFor(m), dc = pl && pl.decor[it.di];
    if (dc) {
      const R2 = dc.R, q = worldToScreen(m.cx + dc.x + R2.oy + R2.ox / 2, m.cy + dc.y + R2.oy - R2.ox / 2);
      const dx = Math.round(q.x), dy = Math.round(q.y), dw = Math.round(q.x + R2.w * z) - dx, dh = Math.round(q.y + R2.h * z) - dy;
      drawSunShadow(ctx, dc.cv, dx, dy, dw, dh, 0, 0, R2.w, R2.h, 'column', true);
      ctx.drawImage(dc.cv, dx, dy, dw, dh);
      lightCutImage(dc.cv, dx, dy, dw, dh);
    }
  } else if ((it.part === 'prop' || it.part === 'pprop') && e >= 0.98) {
    const pl = it.part === 'pprop' ? m.pl || placeFor(m) : null;
    const pr = it.part === 'pprop' ? pl && pl.props[it.pi] : m.bk.props[it.pi];
    if (pr) {
      const p = pr.rx != null ? { x: o.x + pr.rx * z, y: o.y + pr.ry * z } : null;
      drawWonderProp(ctx, m, pr, z, now, it.pi, p);
    }
  }
  ctx.imageSmoothingEnabled = prevSm;
}

// Un objet posé (flamme, statue, drapeau, lueur, jet d'eau, balise, halo, faisceau)
// au point monde (m.cx + x, m.cy + y, h) — ou au point écran `at` déjà calculé.
function drawWonderProp(ctx, m, pr, z, now, seed, at = null) {
  const p = at || worldToScreen(m.cx + pr.x, m.cy + pr.y, pr.h);
  const K = wonderKitForBand(m.band);
  if (pr.prop === 'flame') {
    drawFlame(ctx, p.x, p.y, z, now, pr.small ? 0.8 : pr.big ? 1.6 : 1, (pr.x * 0.37 + pr.y * 0.11) % 3);
  } else if (pr.prop === 'flag') {
    drawVieFlag(ctx, p.x, p.y, { k: z, now, poleH: pr.poleH || 10, w: pr.fw || 6, h: pr.fh || 4, cols: K.pal.banner, swallow: true, seed: seed * 7 + m.wi });
  } else if (pr.prop === 'glow') {
    glowAt(p.x, p.y, Math.max(6, CM.TILE * z * (pr.big ? 1.1 : 0.6)), hexToRgbStr(K.pal.glow), 0.85);
  } else if (pr.prop === 'jet') {
    drawJet(ctx, p.x, p.y, z, now, seed);
  } else if (pr.prop === 'beacon') {
    // Balise d'aviation : un feu rouge qui bat la seconde.
    const on = Math.floor((now + m.wi * 317) / 600) % 2 === 0;
    const sz = Math.max(1, Math.round(z * 1.5));
    ctx.fillStyle = on ? '#ff3b2e' : '#6a1a14';
    ctx.fillRect(Math.round(p.x - sz / 2), Math.round(p.y - sz), sz, sz);
    if (on) glowAt(p.x, p.y - sz / 2, Math.max(5, CM.TILE * z * 0.3), '255,70,50', 0.9);
  } else if (pr.prop === 'halo') {
    // Halo des âges cosmiques : un anneau de lumière qui flotte et respire.
    const bob = Math.sin(now / 900 + m.wi) * 2 * z, r = pr.r * z;
    ctx.save();
    ctx.globalAlpha = 0.55 + 0.25 * Math.sin(now / 600 + m.wi);
    ctx.strokeStyle = K.pal.glow;
    ctx.lineWidth = Math.max(1, Math.round(z));
    ctx.beginPath();
    ctx.ellipse(Math.round(p.x), Math.round(p.y + bob), r * Math.SQRT2, r / Math.SQRT2, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    glowAt(p.x, p.y + bob, r * 1.6, hexToRgbStr(K.pal.glow), 0.6);
  } else if (pr.prop === 'beam') {
    drawBeam(p.x, p.y, z, hexToRgbStr(K.pal.glow));
  } else {
    drawSpriteProp(ctx, { era: pr.prop === 'statue' ? K.statueEra : K.propEra, ...pr }, p, z);
  }
}

// JET D'EAU d'une fontaine du lieu : une gerbe de quelques pixels qui monte et
// retombe en quatre temps (même rythme que les fontaines des places).
const JET = [[0, -7], [0, -6], [0, -5], [-1, -6], [1, -6], [-2, -4], [2, -4], [-3, -2], [3, -2]];
function drawJet(ctx, x, y, z, now, seed) {
  const f = Math.floor(now / 130 + seed) % 4;
  const s = Math.max(1, Math.round(z));
  for (let k = 0; k < JET.length; k += 1) {
    if ((k + f) % 4 === 0) continue;
    const [dx, dy] = JET[k];
    ctx.fillStyle = k < 3 ? '#eef8ff' : '#bfe0f0';
    ctx.fillRect(Math.round(x + dx * s), Math.round(y + (dy + (k > 4 ? f * 0.5 : 0)) * s), s, s);
  }
}

// FAISCEAU vers le ciel (Aiguille, rang V) : une colonne de lumière dans le calque
// de nuit, qui pâlit en montant.
function drawBeam(x, y, z, col) {
  const nf = CM.nightF || 0;
  if (nf <= 0.03) return;
  const w = Math.max(3, 4 * z), H = Math.max(120, y + 20);
  const lc = lightCtx(x - w * 3, y - H, x + w * 3, y);
  if (!lc) return;
  const g = lc.createLinearGradient(0, y, 0, y - H);
  g.addColorStop(0, `rgba(${col},${(0.7 * nf).toFixed(3)})`);
  g.addColorStop(1, `rgba(${col},0)`);
  lc.fillStyle = g;
  lc.fillRect(x - w / 2, y - H, w, H);
  lc.globalAlpha = 0.35;
  lc.fillRect(x - w * 1.5, y - H * 0.6, w * 3, H * 0.6);
  lc.globalAlpha = 1;
}

// ── Sondes ───────────────────────────────────────────────────────────────────
// __wonderTune.band = n → force la matière
// d'une ère (null : celle de la ville) ; __wonderBakes() vide le cache de cuisson.
if (typeof window !== 'undefined') {
  window.__wonderTune = wonderTune;
  window.__wonderBakes = () => { const n = _bakes.size; _bakes.clear(); return n; };
  window.__wonderPlaces = () => [..._places.values()].map((e) => ({ key: e.key, P: e.P, garden: e.garden ? e.garden.ext : 0, decor: e.decor.length }));
}
