"use strict";
// ── LE KIT DE BATEAUX, CÔTÉ JEU — cache des cuissons et pose à l'écran ──────────
// (docs/PLAN-BATEAUX.md §3, §7)
//
// boatBake.js cuit un bateau à un cap ; boatKits.js dit quels bateaux existent ;
// ce module fait le lien avec la carte : il choisit le modèle d'un bateau (métier
// de l'ère + tirage par bateau), cuit à la demande les 32 caps et leurs poses
// d'animation, garde les canvas en cache, et pose bateau + reflet + ombre.
//
// C'est aussi l'API promise à la session « port » (son indirection
// `drawMooredHull`) : `drawBoat` et `boatFootprint`.
//
// BUDGET DE CUISSON : une cuisson coûte ~10 ms. Une flotte qui vire peut en
// demander plusieurs dans la même frame ; au-delà du budget, un bateau garde sa
// dernière image (un cap de retard pendant une frame ne se voit pas, un hoquet
// de 50 ms si).
//
// Molette : __boatKit({ on, budget }) — on:false rend les sprites PixelLab.

import { CM } from '../layout.js';
import { worldToScreen } from './projection.js';
import { bakeBoat, dirIndex, dirTheta, h32 } from './boatBake.js';
import { BOAT_MODELS, fleetFor } from './boatKits.js';
import { noteReflectionImage } from './isoReflect.js';
import { HOVER } from './boatKitsCosmic.js';
import { drawHoverGlow } from './boatFx.js';
import { drawSunShadow } from './isoSunShadow.js';
import { snapDev } from '../blitSnap.js';
import { agentFrameIso } from '../agents.js';
import { crewSpec, crewDir } from './boatCrew.js';

export const BOATKIT = { on: true, budget: 3 };
if (typeof window !== 'undefined') {
  window.__boatKit = (o) => { if (o) Object.assign(BOATKIT, o); return { ...BOATKIT, cached: _cache.size }; };
}

const CACHE_MAX = 900;
const _cache = new Map();
let _frame = -1, _spent = 0;

// Raster RGBA → canvas CARRÉ (côté = la plus grande dimension), image calée en
// haut à gauche. Carré parce que le pont redessine la coque d'un bateau sorti de
// sous lui avec un `drawImage(img, bx, by, dw, dw)` (isoBridge, part 'ship') : un
// canvas carré y passe tel quel.
function toCanvas(R) {
  if (typeof document === 'undefined') return null;
  const side = Math.max(R.w, R.h);
  const cv = document.createElement('canvas');
  cv.width = side; cv.height = side;
  cv.getContext('2d').putImageData(new ImageData(R.data, R.w, R.h), 0, 0);
  return cv;
}

// Modèle d'un bateau de la flotte : métier → liste de l'ère → tirage stable par
// bateau (tous les marchands d'une époque ne sont plus des clones).
export function boatSpecFor(sh, band) {
  if (!BOATKIT.on) return null;
  const fl = fleetFor(band);
  if (!fl) return null;
  const role = sh.kind === 'fisher' ? 'fisher' : (sh.kind || 'trade');
  const list = fl[role] || fl.trade;
  if (!list || !list.length) return null;
  // Les bateaux de service prennent le modèle de leur RANG (police, puis pompiers) :
  // tirés au hasard, deux patrouilles de police pouvaient se croiser sans pompiers.
  const id = role === 'service' && sh.svc != null ? list[sh.svc % list.length] : list[h32(sh.id | 0, 17, 3) % list.length];
  return { id, seed: h32(sh.id | 0, 23, 5) % 9973 };
}

// Bateau d'amarrage (port) : le modèle signature de l'ère, tiré au lieu.
export function mooredSpecFor(band, key) {
  if (!BOATKIT.on) return null;
  const fl = fleetFor(band);
  if (!fl || !fl.trade || !fl.trade.length) return null;
  return { id: fl.trade[0], seed: h32(Math.round(key * 100) | 0, 29, 7) % 9973 };
}

export function boatFootprint(spec) {
  const M = spec && BOAT_MODELS[spec.id];
  if (!M) return null;
  return { len: M.len / 32, beam: M.beam / 32, speed: M.speed || null, mode: M.service || null };
}
// Équivalent de l'ancien `sizeMul` (coque = 0,7 × sizeMul tuiles) : le sillage,
// l'ellipse de nuit et la voie de navigation se règlent encore dessus.
export function boatSizeMul(spec) {
  const M = spec && BOAT_MODELS[spec.id];
  return M ? M.len / (0.7 * 32) : 1;
}
export function boatModel(spec) {
  return (spec && BOAT_MODELS[spec.id]) || null;
}
export function boatHasLights(spec) {
  const M = spec && BOAT_MODELS[spec.id];
  return !!(M && M.lights);
}

// Pose d'animation courante : indice de pose et phase (rad) transmise au kit.
function animPose(M, state, now, salt) {
  const A = M.anim;
  if (!A || (A.still && A.still.includes(state))) return { f: 0, k: 1.2 };
  const t = (now || 0) / 1000 / A.period + (salt % 97) / 97;
  const f = Math.floor((t - Math.floor(t)) * A.frames) % A.frames;
  return { f, k: (f / A.frames) * Math.PI * 2 };
}

// Cuisson en cache. `force` passe outre le budget (première image d'un bateau).
function getBake(spec, dir, state, pose, force, now, empty = false) {
  const key = spec.id + '|' + spec.seed + '|' + dir + '|' + state + '|' + pose.f + (empty ? '|v' : '');
  let e = _cache.get(key);
  if (e) {
    _cache.delete(key); _cache.set(key, e);      // LRU : remis en queue
    return e;
  }
  // Le budget se compte PAR FRAME : `now` est le même pour tous les bateaux d'une frame.
  if (now !== _frame) { _frame = now; _spent = 0; }
  if (!force && _spent >= BOATKIT.budget) return null;
  _spent += 1;
  const M = BOAT_MODELS[spec.id];
  const b = bakeBoat(M, dirTheta(dir), { variant: M.variant(spec.seed), state, k: pose.k, empty });
  e = {
    cv: toCanvas(b.img), w: b.img.w, h: b.img.h, ox: b.img.ox, oy: b.img.oy,
    rcv: toCanvas(b.refl), rw: b.refl.w, rh: b.refl.h, rox: b.refl.ox, roy: b.refl.oy,
    anchors: b.anchors,
    crew: b.crew, mcv: crewMaskCanvas(b.crew),
  };
  _cache.set(key, e);
  if (_cache.size > CACHE_MAX) _cache.delete(_cache.keys().next().value);
  return e;
}

// ── L'ÉQUIPAGE : les habitants de l'ère, découpés par leur coque ───────────────
// Les masques d'une cuisson (boatBake.crewMasks), empilés en une planche : opaque là
// où le bateau passe devant le marin.
function crewMaskCanvas(crew) {
  if (!crew || !crew.length || typeof document === 'undefined') return null;
  const w = crew[0].w, h = crew[0].h;
  const data = new Uint8ClampedArray(w * h * crew.length * 4);
  crew.forEach((cr, n) => {
    for (let k = 0; k < w * h; k += 1) if (cr.mask[k]) data[(n * w * h + k) * 4 + 3] = 255;
  });
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h * crew.length;
  cv.getContext('2d').putImageData(new ImageData(data, w, cv.height), 0, 0);
  return cv;
}

// Chaque marin est peint dans une toile de travail À LA GRILLE DEVICE (comme les
// habitants à terre : même bande, même finesse à tous les zooms), on y efface ce que
// le masque dit caché, puis on la pose. Le masque est mis à l'échelle EXACTEMENT
// comme l'image du bateau (k = dw / côté) : ses bords tombent sur ceux du plat-bord.
let _crewCv = null;
function drawCrew(ctx, e, M, bx, by, k, z, band) {
  if (!e.crew || !e.crew.length || !e.mcv) return;
  const d = CM.dpr || 1;
  if (!_crewCv) _crewCv = document.createElement('canvas');
  const cv = _crewCv;
  for (let n = 0; n < e.crew.length; n += 1) {
    const cr = e.crew[n];
    const sp = crewSpec(band, M, cr);
    const F = agentFrameIso(sp.name, crewDir(cr.phi), z, sp.scale);
    if (!F) continue;
    const ex0 = bx + (cr.x0 - e.ox) * k, ey0 = by + (cr.y0 - e.oy) * k;
    const mx = Math.floor(ex0 * d) / d, my = Math.floor(ey0 * d) / d;
    const W = Math.ceil((cr.w * k + ex0 - mx) * d), H = Math.ceil((cr.h * k + ey0 - my) * d);
    if (cv.width < W || cv.height < H) { cv.width = Math.max(cv.width, W); cv.height = Math.max(cv.height, H); }
    const g = cv.getContext('2d');
    g.setTransform(d, 0, 0, d, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, W / d + 1, H / d + 1);
    g.imageSmoothingEnabled = false;
    const fx = bx + (cr.X - e.ox) * k, fy = by + (cr.Y - e.oy) * k;
    const left = snapDev(fx - F.drawH / 2), top = snapDev(fy - F.feetF * F.drawH);
    g.drawImage(F.img, 0, 0, F.fh, F.fh, left - mx, top - my, F.drawH, F.drawH);
    g.globalCompositeOperation = 'destination-out';
    g.drawImage(e.mcv, 0, n * cr.h, cr.w, cr.h, ex0 - mx, ey0 - my, cr.w * k, cr.h * k);
    g.globalCompositeOperation = 'source-over';
    ctx.drawImage(cv, 0, 0, W, H, mx, my, W / d, H / d);
  }
}

// États de la flotte → états du kit (le kit ne connaît que ce qui change le
// dessin : voile serrée à quai, filet relevé au mouillage).
function kitState(spec, state) {
  if (state === 'dock' || state === 'board') return 'dock';
  if (state === 'salute') return 'salute';
  // La navette des Plaisirs : au retour, presque vide ; à la Maison, ses passagers sont montés.
  if (state === 'return' || state === 'unload') return state;
  if (state === 'anchor' || state === 'fish') return spec.id === 'scapha' ? 'anchor' : 'cruise';
  return 'cruise';
}

/**
 * Pose un bateau du kit. (x, y) = point de flottaison à l'écran (origine du
 * repère bateau), theta = cap MONDE (rad), z = zoom. `memo` (le bateau de la
 * flotte, ou n'importe quel objet stable) garde la dernière image quand le budget
 * de cuisson de la frame est épuisé.
 * Rend { img, bx, by, dw, dh, anchors (écran) } ou null.
 */
export function drawBoat(ctx, spec, x, y, theta, z, now, opts = {}) {
  const M = spec && BOAT_MODELS[spec.id];
  if (!M) return null;
  const state = kitState(spec, opts.state);
  const pose = animPose(M, state, now, spec.seed);
  const dir = dirIndex(theta);
  const memo = opts.memo || null;
  let e = getBake(spec, dir, state, pose, !memo || !memo._kitBake, now, !!opts.empty);
  if (!e && memo) e = memo._kitBake;
  if (!e || !e.cv) return null;
  if (memo) memo._kitBake = e;
  const side = e.cv.width;
  const bx = snapDev(x + e.ox * z), by = snapDev(y + e.oy * z);
  const dw = snapDev(side * z);
  const dh = dw;
  if (opts.reflect !== false && e.rcv) {
    noteReflectionImage(ctx, e.rcv, snapDev(x + e.rox * z), snapDev(y + e.roy * z), snapDev(e.rcv.width * z), snapDev(e.rcv.height * z));
  }
  // LÉVITATION (Démiurge) : un halo sur l'eau sous la coque, et l'ombre portée
  // descend jusqu'à l'eau (son pivot est le pied de chaque colonne de l'image, qui
  // est ici le dessous de la coque, HOVER px plus haut).
  if (M.hover && opts.reflect !== false) drawHoverGlow(ctx, x, y, z, M.len * 0.5, M.glow || '#ffffff', now, spec.seed);
  const prevSm = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  drawSunShadow(ctx, e.cv, bx, by + (M.hover ? snapDev(HOVER * z) : 0), dw, dh, 0, 0, 0, 0, 'column', false);
  ctx.drawImage(e.cv, bx, by, dw, dh);
  // L'équipage par-dessus, découpé par ce qui passe devant lui. L'ère des habits est
  // celle de la ville (un bateau de l'ère d'avant qui finit sa route s'est rhabillé).
  const band = opts.band != null ? opts.band : ((CM.layout && CM.layout.counts && CM.layout.counts.eraBand) | 0);
  const crew = e.crew && e.crew.length ? (c2) => drawCrew(c2, e, M, bx, by, dw / side, z, band) : null;
  if (crew) crew(ctx);
  ctx.imageSmoothingEnabled = prevSm;
  const anchors = {};
  const lamps = [];
  for (const [k, a] of Object.entries(e.anchors || {})) {
    anchors[k] = { x: x + a.X * z, y: y + a.Y * z };
    if (k.startsWith('lamp')) lamps.push(anchors[k]);
  }
  // `crew` : le pont redessine la coque d'un bateau sorti de sous lui (isoBridge,
  // part 'ship') — et ses marins avec.
  return { img: e.cv, bx, by, dw, dh, anchors, model: M, crew, lamps: lamps.length ? lamps : null };
}

// ── À QUAI : L'API DES PORTS (session « port et plage », drawMooredHull) ──────────
// Leurs navires et bateaux amarrés (terminal de commerce, bassin du Vieux-Port)
// parlent en RÔLES de leur table (container, steam, sail, fisher, motorboat, dinghy,
// rowboat). On les traduit en modèles de l'ère : les cargos de la flotte au
// terminal, la PLAISANCE à quai dans le bassin (canot, voilier, vedette…), le
// pêcheur de l'époque. Rien ici ne navigue : le plaisancier reste à quai.
const MOORED = {
  rowboat: ['pleasure', 0], dinghy: ['pleasure', 1], sail: ['pleasure', 2], motorboat: ['pleasure', 3],
  fisher: ['fisher', 0],
};
export function mooredSpec(role, band, seed = 1) {
  if (!BOATKIT.on) return null;
  const fl = fleetFor(band);
  if (!fl) return null;
  let id = null;
  // Au terminal, le porte-conteneurs À QUAI a sa taille de quai (il ne passe pas
  // sous le pont) ; ailleurs, le marchand signature de l'ère.
  if (role === 'container') id = band === 5 ? 'cargo-vapeur' : band === 6 ? 'porte-conteneurs-quai' : fl.trade && fl.trade[0];
  else if (role === 'steam') id = band === 5 ? 'cargo-vapeur' : fl.trade && (fl.trade[1] || fl.trade[0]);
  else if (MOORED[role]) {
    const [r, i] = MOORED[role];
    const list = fl[r] || fl.fisher;
    id = list && list[Math.min(i, list.length - 1)];
  }
  if (!id || !BOAT_MODELS[id]) return null;
  return { id, seed: seed % 9973 };
}
export function mooredFootprint(role, band) {
  return boatFootprint(mooredSpec(role, band));
}
// Cap ÉCRAN → cap MONDE (le kit cuit dans le repère du monde).
export function worldHeadingOfScreen(h) {
  const hx = Math.cos(h), hy = Math.sin(h);
  return Math.atan2(hy - hx / 2, hx / 2 + hy);
}
/**
 * Pose un bateau à quai du kit. Mêmes arguments que drawMooredHull : (x, y) en
 * tuiles monde, heading = cap ÉCRAN, z = niveau de l'eau (tuiles, négatif au pied
 * d'un mur de quai). Rend false si l'ère n'a pas de modèle pour ce rôle (repli
 * sur les sprites chez l'appelant).
 */
export function drawMooredKit(ctx, { role, heading, x, y, z = 0, now = 0, bob = true, band = null, seed = null }) {
  const b = band != null ? band : ((CM.layout && CM.layout.counts && CM.layout.counts.eraBand) | 0);
  const spec = mooredSpec(role, b, seed != null ? seed : (h32(Math.round(x * 10), Math.round(y * 10), 61) >>> 0));
  if (!spec) return false;
  const T = CM.TILE, zoom = CM.cam.zoom;
  const p = worldToScreen(x * T, y * T, z * T);
  const s = T * zoom;
  if (p.x < -s * 3 || p.x > CM.cw + s * 3 || p.y < -s * 3 || p.y > CM.ch + s * 3) return true;
  const dy = bob ? Math.sin((now || 0) / 1500 + x * 1.7 + y) * s * 0.012 : 0;
  // Amarré : VIDE (pas de pêcheur assis dans sa barque au port) et voiles ferlées.
  return !!drawBoat(ctx, spec, p.x, snapDev(p.y + dy), worldHeadingOfScreen(heading), zoom, now, { state: 'dock', empty: true });
}
