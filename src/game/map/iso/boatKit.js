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
// BUDGET DE CUISSON : une cuisson coûte 10 à 38 ms. Une flotte qui vire peut en
// demander plusieurs dans la même frame ; au-delà du budget EN TEMPS, partagé avec le
// métro (vehicleBakeBudget.js), un bateau garde sa dernière image (un cap de retard
// pendant une frame ne se voit pas, un hoquet de 50 ms si). Sa PREMIÈRE image passe
// aussi par le budget (audit du 05/10, PERF-14) : un bateau qui naît n'apparaît
// qu'une fois cuit, un bateau à quai garde celui de l'ère d'avant le temps de sa
// recuisson.
//
// Molette : __boatKit({ budgetMs }). (L'A/B `on: false`, qui rendait les sprites
// PixelLab, est parti avec eux : le kit couvre les dix bandes, boatKitCover.test ;
// audit du 05/10, MORT-6.)

import { CM } from '../layout.js';
import { worldToScreen } from './projection.js';
import { bakeBoat, dirIndex, dirTheta, h32 } from './boatBake.js';
import { BOAT_MODELS, fleetFor } from './boatKits.js';
import { noteReflectionImage } from './isoReflect.js';
import { HOVER } from './boatKitsCosmic.js';
import { drawHoverGlow, drawSmoke } from './boatFx.js';
import { drawSunShadow } from './isoSunShadow.js';
import { snapDev } from '../blitSnap.js';
import { agentFrameIso, agentIdleFrameIso, agentPoseFrameIso } from '../agents.js';
import { crewSpec, crewDir, isFerryPassenger, isBoatPassenger } from './boatCrew.js';
import { VEHICLE_BAKE, vehicleBakeOpen, vehicleBakeTimed } from './vehicleBakeBudget.js';

if (import.meta.env?.DEV && typeof window !== 'undefined') {
  window.__boatKit = (o) => {
    if (o && o.budgetMs != null) VEHICLE_BAKE.ms = o.budgetMs;
    return { budgetMs: VEHICLE_BAKE.ms, cached: _cache.size };
  };
}

const CACHE_MAX = 900;
const _cache = new Map();

// Raster RGBA → canvas SERRÉ, image calée en haut à gauche, plus UNE colonne et UNE
// rangée transparentes à droite et en bas (audit du 05/10, PERF-36, choix A de Raph).
// Le canvas était CARRÉ (côté = la plus grande dimension) : 1,8 fois la mémoire et
// les pixels composés de la coque, de son ombre et de son reflet. L'échelle de pose ne
// change pas (cf. drawBoat : k = snapDev(côté · z) / côté) ; la marge est OBLIGATOIRE :
// le bord droit et le bas de la pose tombent entre deux pixels device, et sur GPU le
// dernier texel s'y étirerait — c'est la marge vide qui s'étire.
function toCanvas(R) {
  if (typeof document === 'undefined') return null;
  const cv = document.createElement('canvas');
  cv.width = R.w + 1; cv.height = R.h + 1;
  cv.getContext('2d').putImageData(new ImageData(R.data, R.w, R.h), 0, 0);
  return cv;
}

// LE VIVIER DES GRAINES (audit du 05/10, PERF-14, décision de Raph). La graine VISUELLE
// d'un bateau (cargaison, fanion, place des marins : tout ce que lit la cuisson) était
// unique par bateau — et sh.id croît sans fin : aucun bateau ne réutilisait les
// cuissons d'un autre (10 à 38 ms chacune), le cache de 900 entrées tournait toute la
// session. Elle est tirée d'un vivier de BOAT_SEED_POOL graines par modèle : deux
// marchands identiques se croisent parfois, mais presque plus rien ne cuit après les
// premières minutes d'une ère. Ce qui ne cuit pas reste propre au bateau (`ident`,
// l'ancienne graine) : QUI sont ses marins (drawCrew), sa cadence d'animation, son halo.
export const BOAT_SEED_POOL = 16;

// Modèle d'un bateau de la flotte : métier → liste de l'ère → tirage stable par
// bateau (tous les marchands d'une époque ne sont plus des clones).
export function boatSpecFor(sh, band) {
  const fl = fleetFor(band);
  if (!fl) return null;
  const role = sh.kind || 'trade';
  const list = fl[role] || fl.trade;
  if (!list || !list.length) return null;
  // Les bateaux de service prennent le modèle de leur RANG (police, puis pompiers) :
  // tirés au hasard, deux patrouilles de police pouvaient se croiser sans pompiers.
  const id = role === 'service' && sh.svc != null ? list[sh.svc % list.length] : list[h32(sh.id | 0, 17, 3) % list.length];
  const ident = h32(sh.id | 0, 23, 5) % 9973;
  return { id, seed: ident % BOAT_SEED_POOL, ident };
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
export function boatHasLights(spec) {
  const M = spec && BOAT_MODELS[spec.id];
  return !!(M && M.lights);
}

// Pose d'animation courante : indice de pose et phase (rad) transmise au kit.
function animPose(M, state, now, salt, empty = false) {
  const A = M.anim;
  if (!A || (A.still && A.still.includes(state))) return { f: 0, k: 1.2 };
  if (empty && A.stillEmpty && A.stillEmpty.includes(state)) return { f: 0, k: 1.2 };
  const t = (now || 0) / 1000 / A.period + (salt % 97) / 97;
  const f = Math.floor((t - Math.floor(t)) * A.frames) % A.frames;
  return { f, k: (f / A.frames) * Math.PI * 2 };
}

// Cuisson en cache. `force` passe outre le budget (un appelant sans mémoire : les
// embarcadères, immobiles, une cuisson pour la partie) ; `noBake` : le cache seul.
// Un modèle `seedless` (son dessin ne lit pas la graine, et il n'a pas d'équipage :
// drague, sentinelles, plaisance cosmique) partage ses cuissons entre tous les
// bateaux — la graine dans la clé en faisait une par amarre, au pixel près identiques.
function getBake(spec, dir, state, pose, force, now, empty = false, noBake = false) {
  const M = BOAT_MODELS[spec.id];
  const key = spec.id + '|' + (M.seedless ? 0 : spec.seed) + '|' + dir + '|' + state + '|' + pose.f + (empty ? '|v' : '');
  let e = _cache.get(key);
  if (e) {
    _cache.delete(key); _cache.set(key, e);      // LRU : remis en queue
    return e;
  }
  if (noBake) return null;
  // Le budget se compte PAR FRAME (`now` : le même pour tous les véhicules d'une frame),
  // en millisecondes ; une cuisson forcée y est portée aussi.
  if (!vehicleBakeOpen(now) && !force) return null;
  e = vehicleBakeTimed(() => {
    const b = bakeBoat(M, dirTheta(dir), { variant: M.variant(spec.seed), state, k: pose.k, empty });
    // `side`, `rside` : le côté de l'ancien carré, qui règle toujours l'échelle de pose.
    return {
      cv: toCanvas(b.img), w: b.img.w, h: b.img.h, ox: b.img.ox, oy: b.img.oy, side: Math.max(b.img.w, b.img.h),
      rcv: toCanvas(b.refl), rw: b.refl.w, rh: b.refl.h, rox: b.refl.ox, roy: b.refl.oy, rside: Math.max(b.refl.w, b.refl.h),
      anchors: b.anchors,
      crew: b.crew, mcv: crewMaskCanvas(b.crew),
    };
  });
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
// comme l'image du bateau (k, l'échelle de pose de drawBoat) : ses bords tombent sur
// ceux du plat-bord.
let _crewCv = null;
// `po` (le bac, lot 5 de PLAN-COMPORTEMENTS ; la navette des Plaisirs à l'aller) :
// { names, hide } — ses places de voyageur reçoivent ceux qui attendaient au ponton
// (names[j], place de trop = vide), ou restent vides le temps qu'ils montent (hide).
// `now` : l'horloge de la FRAME, celle du reste de la flotte (audit du 2026-10-05,
// BUG-101 : sur performance.now(), respiration et salut échappaient aux captures à
// horloge figée et décrochaient de la scène quand l'horloge du jeu ralentit).
// `ident` (boatSpecFor) : l'identité du bateau, mêlée à celle de la place cuite — la
// cuisson est partagée par tout le vivier (PERF-14), ses marins non ; sans `ident`
// (embarcadères, amarres), la place cuite seule, comme avant.
// `onCrew(cr, who, sp, j, fx, fy, drawH, top, M)` : chaque marin PEINT, ses pieds (fx, fy)
// et son cadre à l'écran — la fiche d'habitant le rend cliquable (isoPort). `j` = son
// rang parmi les voyageurs de `po`, −1 pour un marin.
function drawCrew(ctx, e, M, bx, by, k, z, band, now, po = null, ident = null, onCrew = null) {
  if (!e.crew || !e.crew.length || !e.mcv) return;
  let pj = 0;
  const d = CM.dpr || 1;
  if (!_crewCv) _crewCv = document.createElement('canvas');
  const cv = _crewCv;
  for (let n = 0; n < e.crew.length; n += 1) {
    const cr = e.crew[n];
    const who = ident == null ? cr.id >>> 0 : h32(cr.id >>> 0, ident, 31);
    let sp = null, j = -1;
    if (po && isBoatPassenger(M, cr)) {
      j = pj; pj += 1;
      if (po.hide) continue;
      if (po.names) { sp = po.names[j]; if (!sp) continue; }
    }
    if (!sp) sp = crewSpec(band, M, cr, who);
    const F = agentFrameIso(sp.name, crewDir(cr.phi), z, sp.scale);
    if (!F) continue;
    // Il respire (lot 3 de PLAN-COMPORTEMENTS) : la bande d'attente, déphasée par marin.
    const I = agentIdleFrameIso(sp.name, crewDir(cr.phi), z, sp.scale, now || 0, (who % 97) / 97);
    // Le salut d'un bateau à l'autre (pose 'wave', §8) : la main levée, en boucle.
    const Wv = cr.pose === 'wave' ? agentPoseFrameIso(sp.name, crewDir(cr.phi), z, sp.scale, 'wave',
      (((now || 0) / 1400) + (who % 97) / 97) % 1) : null;
    const S = Wv || I || { img: F.img, sx: 0, fh: F.fh };
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
    g.drawImage(S.img, S.sx, 0, S.fh, S.fh, left - mx, top - my, F.drawH, F.drawH);
    g.globalCompositeOperation = 'destination-out';
    g.drawImage(e.mcv, 0, n * cr.h, cr.w, cr.h, ex0 - mx, ey0 - my, cr.w * k, cr.h * k);
    g.globalCompositeOperation = 'source-over';
    ctx.drawImage(cv, 0, 0, W, H, mx, my, W / d, H / d);
    if (onCrew) onCrew(cr, who, sp, j, fx, fy, F.drawH, top, M);
  }
}

// États de la flotte → états du kit (le kit ne connaît que ce qui change le
// dessin : voile serrée à quai, filet relevé au mouillage).
// ⚠ Le mouillage se décide par le MÉTIER du modèle, pas par son id (audit du
// 2026-10-05, BUG-65) : seule la scapha recevait 'anchor', les pêcheurs des neuf autres
// bandes ramaient sur place pendant leur pêche — pirogue, barques, bateau à moteur et
// barques de nacre ont pourtant leur pose (sagaie, filet relevé, ligne). Drague et
// pompiers (métier 'service') restent en 'cruise'.
export function kitState(spec, state) {
  if (state === 'dock' || state === 'board') return 'dock';
  if (state === 'salute') return 'salute';
  // La navette des Plaisirs : au retour, presque vide ; à la Maison, ses passagers sont montés.
  if (state === 'return' || state === 'unload') return state;
  if (state === 'anchor' || state === 'fish') {
    const M = spec && BOAT_MODELS[spec.id];
    return M && M.role === 'fisher' ? 'anchor' : 'cruise';
  }
  return 'cruise';
}

/**
 * Pose un bateau du kit. (x, y) = point de flottaison à l'écran (origine du
 * repère bateau), theta = cap MONDE (rad), z = zoom. `memo` (le bateau de la
 * flotte, ou n'importe quel objet stable) garde la dernière image quand le budget
 * de cuisson de la frame est épuisé — et, sans image encore, rien n'est posé (null)
 * jusqu'à la cuisson. Sans `memo`, la cuisson est forcée.
 * Rend { img, bx, by, dw, dh, iw, ih, anchors (écran) } ou null : `img` (canvas serré,
 * cf. toCanvas) se pose en (bx, by, dw, dh) ; la coque y occupe ses iw × ih premiers
 * pixels (la colonne et la rangée de plus sont vides).
 */
export function drawBoat(ctx, spec, x, y, theta, z, now, opts = {}) {
  const M = spec && BOAT_MODELS[spec.id];
  if (!M) return null;
  const state = kitState(spec, opts.state);
  // La cadence (et plus bas le halo) suit l'identité du bateau, pas sa graine de vivier :
  // deux bateaux qui partagent leurs cuissons ne rament pas en mesure.
  const ident = spec.ident != null ? spec.ident : null;
  const pose = animPose(M, state, now, ident != null ? ident : spec.seed, !!opts.empty);
  const dir = dirIndex(theta);
  const memo = opts.memo || null;
  // Un bateau encore invisible (fondu d'entrée à 0) ne dépense pas le budget.
  let e = getBake(spec, dir, state, pose, !memo, now, !!opts.empty, !!memo && !(ctx.globalAlpha > 0));
  if (!e && memo) e = memo._kitBake;
  if (!e || !e.cv) return null;
  if (memo) memo._kitBake = e;
  // L'échelle de l'ancien carré (snapDev(côté · z) / côté), posée sur le canvas serré :
  // chaque pixel source retombe où il tombait (PERF-36).
  const k = snapDev(e.side * z) / e.side;
  const bx = snapDev(x + e.ox * z), by = snapDev(y + e.oy * z);
  const dw = e.cv.width * k, dh = e.cv.height * k;
  if (opts.reflect !== false && e.rcv) {
    const kr = snapDev(e.rside * z) / e.rside;
    noteReflectionImage(ctx, e.rcv, snapDev(x + e.rox * z), snapDev(y + e.roy * z), e.rcv.width * kr, e.rcv.height * kr);
  }
  // LÉVITATION (Démiurge) : un halo sur l'eau sous la coque, et l'ombre portée
  // descend jusqu'à l'eau (son pivot est le pied de chaque colonne de l'image, qui
  // est ici le dessous de la coque, HOVER px plus haut).
  if (M.hover && opts.reflect !== false) drawHoverGlow(ctx, x, y, z, M.len * 0.5, M.glow || '#ffffff', now, ident != null ? ident : spec.seed);
  const prevSm = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  // L'ombre, elle, se lit sur l'ANCIEN CARRÉ (rectangle source côté × côté, rogné au
  // canvas serré à la cuisson du masque : vide au-delà, comme l'était le carré). Son
  // seuil de taille (SUN_SHADOW.minH) juge la hauteur POSÉE : avec la hauteur serrée,
  // une pirogue vue de flanc (48 × 11) ou une annexe (26 × 9) perdait son ombre aux
  // zooms 0,7 à 1 (95 cas sur 4 080 modèle × cap × zoom).
  const dS = snapDev(e.side * z);
  drawSunShadow(ctx, e.cv, bx, by + (M.hover ? snapDev(HOVER * z) : 0), dS, dS, 0, 0, e.side, e.side, 'column', false);
  ctx.drawImage(e.cv, bx, by, dw, dh);
  // L'équipage par-dessus, découpé par ce qui passe devant lui. L'ère des habits est
  // celle de la ville (un bateau de l'ère d'avant qui finit sa route s'est rhabillé).
  const band = opts.band != null ? opts.band : ((CM.layout && CM.layout.counts && CM.layout.counts.eraBand) | 0);
  const po = (opts.passNames || opts.hidePass) ? { names: opts.passNames || null, hide: !!opts.hidePass } : null;
  const crew = e.crew && e.crew.length ? (c2) => drawCrew(c2, e, M, bx, by, k, z, band, now, po, ident, opts.onCrew || null) : null;
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
  // Les places de VOYAGEUR du bac, en px monde autour de son origine (au cap de la
    // cuisson) : on y monte et on en descend à pied (boatScenes, lot 5).
  let pass = null;
  if (M.role === 'ferry' && e.crew) {
    const th = dirTheta(dir), fx = Math.cos(th), fy = Math.sin(th);
    pass = e.crew.filter((cr) => cr.a != null && isFerryPassenger(M, cr))
      .map((cr) => ({ dx: cr.a * fx - cr.c * fy, dy: cr.a * fy + cr.c * fx, h: cr.ft }));
  }
  return { img: e.cv, bx, by, dw, dh, iw: e.w, ih: e.h, anchors, model: M, crew, lamps: lamps.length ? lamps : null, pass };
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
function mooredSpec(role, band, seed = 1) {
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
  // Le vivier des graines vaut aussi à quai (PERF-14) : les amarres se partagent leurs
  // cuissons ; `ident` garde à chacune sa cadence.
  return { id, seed: seed % BOAT_SEED_POOL, ident: seed % 9973 };
}
export function mooredFootprint(role, band) {
  return boatFootprint(mooredSpec(role, band));
}
// Cap ÉCRAN → cap MONDE (le kit cuit dans le repère du monde).
function worldHeadingOfScreen(h) {
  const hx = Math.cos(h), hy = Math.sin(h);
  return Math.atan2(hy - hx / 2, hx / 2 + hy);
}
/**
 * Pose un bateau à quai du kit. Mêmes arguments que drawMooredHull : (x, y) en
 * tuiles monde, heading = cap ÉCRAN, z = niveau de l'eau (tuiles, négatif au pied
 * d'un mur de quai). Rend false si l'ère n'a pas de modèle pour ce rôle (rien n'est
 * posé ; cas impossible pour les rôles des ports, boatKitCover.test).
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
  // Un memo PAR AMARRE : sans lui, chaque cuisson était forcée (hors budget) ; partagé,
  // deux barques se prêteraient leur image quand le budget de la frame est épuisé.
  // Sans le modèle dans sa clé (audit du 05/10, PERF-14) : au changement d'ère, l'amarre
  // garde le bateau de l'ère d'avant le temps de cuire le sien — toutes les amarres
  // cuisaient de force dans la même frame (plusieurs centaines de ms).
  const mk = role + '|' + spec.seed + '|' + Math.round(x * 10) + '|' + Math.round(y * 10);
  let memo = _mooredMemo.get(mk);
  if (!memo) {
    if (_mooredMemo.size >= MOORED_MEMO_MAX) _mooredMemo.clear();
    memo = {};
    _mooredMemo.set(mk, memo);
  }
  const r = drawBoat(ctx, spec, p.x, snapDev(p.y + dy), worldHeadingOfScreen(heading), zoom, now, { state: 'dock', empty: true, memo });
  // Un vapeur à quai garde ses feux allumés : sa cheminée fume, droit (la flotte
  // le fait déjà pour les siens, isoPort.drawKitShip ; ceux des ports ne fumaient pas).
  if (r && r.anchors && r.anchors.smoke) drawSmoke(ctx, r.anchors.smoke, now, zoom, spec.ident | 0, heading, false);
  // L'ère a son modèle : true même si sa première image attend le budget (rien de posé
  // cette frame).
  return true;
}
const _mooredMemo = new Map();
const MOORED_MEMO_MAX = 512;
