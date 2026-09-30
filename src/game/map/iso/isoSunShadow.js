"use strict";
// ── L'OMBRE DU SOLEIL — une seule lumière pour toute la carte ────────────────
//
// Décision de Raph du 2026-09-30 (docs/PLAN-MAQUETTE-VIVANTE.md, lot 4) : « une
// ombre solaire pour tout ». Les images sont dessinées SANS ombre au sol ; le jeu
// projette la même ombre sous chaque bâtiment, arbre, habitant, véhicule et objet,
// à l'opposé du soleil (haut-gauche, la DA figée). Remplace les quatre ombres qui
// se contredisaient : ombres peintes des sprites (retirées par
// scripts/ombresPeintes.mjs), ellipses du campement, ombres calculées de quatre
// maisons (houseShadow.js, retiré), et rien du tout ailleurs.
//
// D'où elle vient : la maquette du 14/09 (branche `passe-visuelle-21-09`, validée
// par Raph « telle quelle »), qui penchait la silhouette par une transformation
// affine. Trois choses changent ici :
//   0. ELLE EST COUCHÉE SUR LE SOL. La silhouette penchée (décalage vertical 0,2 par
//      pixel de hauteur) restait debout aux 4/5 : l'ombre d'un toit se dessinait
//      au-dessus du pied, là où l'écran montre les bâtiments VOISINS — et quand le
//      voisin était peint avant, sa façade s'assombrissait (vu sur un temple, en
//      A/B figé, 2026-09-30). Couchée, l'ombre d'un point de hauteur h tombe AU SOL,
//      à h × `len` de son pied, dans la direction du soleil (écran (2, 1) = l'est du
//      monde, l'axe même des arêtes des losanges). Elle ne peut donc tomber que
//      DEVANT son objet — là où ne vivent que des objets peints APRÈS lui, qui la
//      recouvrent. Aucune façade n'est plus salie par l'ombre d'un voisin.
//   1. L'ombre est CUITE SUR LA GRILLE DE PIXELS DU SPRITE (une image par sprite,
//      mise en cache) puis blittée à la même échelle que lui : ses pixels ont la
//      taille des siens. La transformation affine rééchantillonnait la silhouette
//      en biais, et sortait des escaliers d'une autre taille que le sprite.
//   2. DEUX PIVOTS. Chaque pixel est décalé de sa HAUTEUR au-dessus du sol vers le
//      bas-droite ; tout est dans la façon de mesurer cette hauteur :
//      · 'column' (habitations, merveilles, petits objets) : le sol d'une colonne
//        est son pixel opaque le plus BAS. Le pied de chaque mur reste collé à son
//        ombre sur toute la largeur du bâtiment (avec un pivot unique, la base du
//        mur est, qui remonte en « V », s'en détachait).
//      · 'plate' (scènes posées sur un SOCLE, fontaines à bassin) : un pied commun
//        au CENTRE du losange de base (bas de l'encre − largeur/4). Un socle plat
//        ne projette alors rien de visible : les pixels de sa moitié arrière
//        retombent dans sa moitié avant, qu'il recouvre (démontré par le test) ; en
//        pivot par colonne, il aurait projeté une fausse bande sous son arête avant.
//      · un nombre (arbres, réverbères) : la rangée du PIED, commune à tout le
//        sprite — la couronne d'un arbre flotte, elle projette loin de son tronc.
//      · 'bottom' (habitants, véhicules, bêtes, bateaux) : le pied commun est la
//        rangée d'encre la plus BASSE de l'image — pied posé, roues, coque. Mesuré
//        sur chaque image d'animation : rien à régler par personnage.
//
// L'ombre est posée AVANT le sprite, au tri du peintre : ce qui est devant la
// recouvre, et elle s'efface la nuit (pas de soleil) et en dézoom (au loin elle ne
// ferait qu'un pixel de bruit par objet).
//
// SON PRIX (mesuré le 2026-09-30, Chrome en rendu LOGICIEL comme celui de Raph,
// bande 4) : c'est le NOMBRE d'appels de dessin qui coûte, pas le mode de fusion
// (multiply ≈ source-over) ni le JavaScript (masques en cache). 705 ombres par
// image au zoom 1, 1 893 au zoom 0,5 : +2,6 ms et +8 ms. D'où deux coupes :
//   · rien sous `minH` px de haut à l'écran (banc, jarre, caisse au loin : une
//     ombre de 1 à 4 px, du bruit — 22 % des appels en dézoom) ;
//   · le masque ne garde pas ce que le sprite recouvre de lui-même (il est peint
//     juste après) : moins de surface à remplir (1,3 Mpx d'ombre pour un écran
//     de 1,6 Mpx au zoom 1).
//
// Molette : __sunShadow({ on, len, alpha, col, mode, minH })
//   len    = longueur de l'ombre par pixel de hauteur (0,5 ≈ fin d'après-midi) ;
//   alpha  = dose ; col = teinte (froide : le ciel dans l'ombre, jamais du noir) ;
//   mode   = composition ('multiply' : l'ombre assombrit le sol en gardant sa
//            texture — un voile source-over se lisait comme de la peinture).
//   minH   = hauteur à l'écran (px) sous laquelle un objet ne projette rien.
import { CM } from '../layout.js';

export const SUN_SHADOW = { on: true, len: 0.5, alpha: 0.5, col: '#8e96ad', mode: 'multiply', minH: 12, minZoom: 0.6 };
// Direction du soleil à l'écran : (2, 1) normalisé — l'est du monde, l'axe des
// arêtes « avant-gauche » des losanges. Une ombre couchée l'y suit exactement.
const SUN_DIR_X = 2 / Math.sqrt(5), SUN_DIR_Y = 1 / Math.sqrt(5);
export function sunShear(len = SUN_SHADOW.len) { return { kx: len * SUN_DIR_X, ky: 1 + len * SUN_DIR_Y }; }
// Version de la GÉOMÉTRIE (longueur, teinte, seuil) : les scènes cuites la portent
// dans leur clé et se re-cuisent quand elle change. La force (jour, nuit, molette
// on/off, vue lointaine) ne se cuit jamais : elle s'applique au blit.
let _geoVer = 0;
export const sunShadowVersion = () => _geoVer;
if (typeof window !== 'undefined') {
  window.__sunShadow = (o) => {
    if (o === false) SUN_SHADOW.on = false;
    else if (o === true) SUN_SHADOW.on = true;
    else if (o) {
      const geo = ('len' in o) || ('col' in o) || ('minH' in o);
      Object.assign(SUN_SHADOW, o);
      if (geo) { _masks = new WeakMap(); _geoVer += 1; }
    }
    return { ...SUN_SHADOW };
  };
}

// ── LA MASSE CUITE ───────────────────────────────────────────────────────────
// Pure (testable sans DOM) : `alpha(x, y)` = alpha du sprite dans son rectangle
// source (0 hors de lui), `w`, `h` = sa taille. Rend les pixels d'ombre sous la
// forme { ox, oy, w, h, px } : `px` en coordonnées LOCALES du masque, dont le coin
// haut-gauche tombe en (ox, oy) dans le repère du sprite (ox, oy ≥ 0 : l'ombre ne
// part que vers la droite et le bas).
//   pivot 'column' : sol = pixel opaque le plus bas de chaque colonne ;
//   pivot 'plate'  : sol commun = bas de l'encre − largeur d'encre / 4 (le centre
//                    du losange de base) ;
//   pivot 'bottom' : sol commun = sous la rangée d'encre la plus basse ;
//   pivot f ∈ ]0, 1] : sol = la rangée f·h (pied commun).
//   Un pixel sous son sol a une hauteur ≤ 0 : il ne projette rien.
// `kx`, `ky` : cf. sunShear — un point de hauteur h part en (x + kx·h, sol + (ky−1)·h).
// LE SOL DE CHAQUE COLONNE selon le pivot — partagé avec les reflets dans l'eau
// (iso/isoReflect.js), qui retournent le sprite autour de ce même sol. Rend
// { bottom, g } : bottom[x] = dernière rangée opaque de la colonne (−1 : vide) ;
// g[x] = ligne de sol en coordonnée de BORD (un pixel y est à la hauteur g − (y + 0,5)).
export function pivotGround(alpha, w, h, pivot) {
  const bottom = new Int32Array(w).fill(-1);
  for (let x = 0; x < w; x += 1) {
    for (let y = h - 1; y >= 0; y -= 1) if (alpha(x, y) > 16) { bottom[x] = y; break; }
  }
  let foot = typeof pivot === 'number' ? pivot * h : 0;
  if (pivot === 'bottom') {
    let yb = -1;
    for (let x = 0; x < w; x += 1) if (bottom[x] > yb) yb = bottom[x];
    foot = yb + 1;
  }
  if (pivot === 'plate') {
    let xa = w, xb = -1, yb = -1;
    for (let x = 0; x < w; x += 1) if (bottom[x] >= 0) { if (x < xa) xa = x; if (x > xb) xb = x; if (bottom[x] > yb) yb = bottom[x]; }
    foot = yb + 1 - (xb - xa + 1) / 4;
  }
  const g = new Float64Array(w);
  for (let x = 0; x < w; x += 1) g[x] = bottom[x] < 0 ? -1 : (pivot === 'column' ? bottom[x] + 1 : foot);
  return { bottom, g };
}

export function sunShadowPixels(alpha, w, h, pivot, kx, ky) {
  const { bottom, g: ground } = pivotGround(alpha, w, h, pivot);
  const out = [];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const seen = new Set();
  for (let x = 0; x < w; x += 1) {
    if (bottom[x] < 0) continue;
    const g = ground[x];
    for (let y = 0; y <= bottom[x]; y += 1) {
      if (alpha(x, y) <= 16) continue;
      const hgt = g - (y + 0.5);
      if (hgt <= 0) continue;
      const tx = x + Math.round(kx * hgt), ty = y + Math.round(ky * hgt);
      const k = tx + ',' + ty;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(tx, ty);
      if (tx < x0) x0 = tx; if (tx > x1) x1 = tx;
      if (ty < y0) y0 = ty; if (ty > y1) y1 = ty;
    }
  }
  if (!out.length) return null;
  // Pas de trou : deux pixels voisins de la silhouette peuvent se décaler de
  // quantités qui diffèrent d'un pixel (arrondi) et laisser une fente. On bouche
  // chaque pixel vide dont les deux voisins horizontaux OU verticaux sont pleins.
  const fill = [];
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      if (seen.has(x + ',' + y)) continue;
      if ((seen.has((x - 1) + ',' + y) && seen.has((x + 1) + ',' + y))
        || (seen.has(x + ',' + (y - 1)) && seen.has(x + ',' + (y + 1)))) fill.push(x, y);
    }
  }
  for (let i = 0; i < fill.length; i += 2) out.push(fill[i], fill[i + 1]);
  // Ce que le sprite recouvre de lui-même ne se verra jamais : on ne le garde pas.
  // Un pixel à demi transparent (vitre, bord adouci) laisse voir l'ombre : gardé.
  const keep = [];
  let kx0 = Infinity, ky0 = Infinity, kx1 = -Infinity, ky1 = -Infinity;
  for (let i = 0; i < out.length; i += 2) {
    const x = out[i], y = out[i + 1];
    if (alpha(x, y) >= 250) continue;
    keep.push(x, y);
    if (x < kx0) kx0 = x; if (x > kx1) kx1 = x;
    if (y < ky0) ky0 = y; if (y > ky1) ky1 = y;
  }
  if (!keep.length) return null;
  const px = new Int32Array(keep.length);
  for (let i = 0; i < keep.length; i += 2) { px[i] = keep[i] - kx0; px[i + 1] = keep[i + 1] - ky0; }
  return { ox: kx0, oy: ky0, w: kx1 - kx0 + 1, h: ky1 - ky0 + 1, px };
}

// Cache par image source, puis par (rectangle source, pivot). WeakMap : un canvas
// de teinte ou de saison qui meurt emporte son ombre.
let _masks = new WeakMap();
function shadowMask(img, sx, sy, sw, sh, pivot) {
  let m = _masks.get(img);
  if (!m) { m = new Map(); _masks.set(img, m); }
  const k = sx + ':' + sy + ':' + sw + ':' + sh + ':' + pivot;
  let e = m.get(k);
  if (e !== undefined) return e;
  e = null;
  try {
    if (typeof document !== 'undefined' && sw > 0 && sh > 0) {
      const src = document.createElement('canvas');
      src.width = sw; src.height = sh;
      const sc = src.getContext('2d', { willReadFrequently: true });
      sc.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      const data = sc.getImageData(0, 0, sw, sh).data;
      const { kx, ky } = sunShear();
      const r = sunShadowPixels((x, y) => (x < 0 || y < 0 || x >= sw || y >= sh) ? 0 : data[(y * sw + x) * 4 + 3],
        sw, sh, pivot, kx, ky);
      if (r) {
        const cv = document.createElement('canvas');
        cv.width = r.w; cv.height = r.h;
        const cx = cv.getContext('2d');
        cx.fillStyle = SUN_SHADOW.col;
        for (let i = 0; i < r.px.length; i += 2) cx.fillRect(r.px[i], r.px[i + 1], 1, 1);
        e = { canvas: cv, ox: r.ox, oy: r.oy };
      } else e = { canvas: null };
    }
  } catch { e = null; }                    // image pas décodée : on réessaiera
  if (e) m.set(k, e);
  return e;
}

// Alpha effectif de la frame : nul la nuit, en dézoom (LOD), au palier « perf », ou
// molette éteinte ; et FONDU sous `minZoom` (0,6 → 0,7) — au loin l'ombre ne fait plus
// que 1 à 5 px et c'est là qu'elle coûte le plus (1 893 appels par image à 0,5).
export function sunShadowAlpha() {
  if (!SUN_SHADOW.on || CM.lodActive || CM.fxOn === false) return 0;
  const z = CM.cam && CM.cam.zoom != null ? CM.cam.zoom : 1;
  const zk = Math.max(0, Math.min(1, (z - SUN_SHADOW.minZoom) / 0.1));
  if (zk <= 0) return 0;
  const n = CM.nightF || 0;
  return SUN_SHADOW.alpha * Math.max(0, 1 - n * 1.6) * zk;
}

// Pose l'ombre du sprite dont la boîte ÉCRAN dessinée est (dx, dy, dw, dh) et la
// source (sx, sy, sw, sh) dans `img` (par défaut l'image entière). À appeler juste
// AVANT le blit du sprite. `pivot` : 'column' (habitations, merveilles), 'plate'
// (scènes sur socle, fontaines) ou la fraction de hauteur du pied (arbres, habitants).
export function drawSunShadow(ctx, img, dx, dy, dw, dh, sx = 0, sy = 0, sw = 0, sh = 0, pivot = 'column', reflect = true) {
  if (_mute) return;
  // Le REFLET dans l'eau se branche ici (iso/isoReflect.js) : tout sprite posé sur
  // la carte passe par cette porte juste avant son blit. Avant le seuil de taille
  // et la nuit : un reflet ne dépend pas du soleil. Jamais en cuisson de scène (le
  // repère n'est pas l'écran : la scène cuite se reflète au blit, cf. le cache).
  if (reflect && _reflHook && !_sink) _reflHook(ctx, img, dx, dy, dw, dh, sx, sy, sw, sh, pivot);
  if (!img || dw <= 0 || dh < SUN_SHADOW.minH) return;
  // En cuisson de scène, la force ne compte pas : elle sera appliquée au blit.
  const a = _sink ? 1 : sunShadowAlpha();
  if (a <= 0) return;
  if (!sw) sw = img.naturalWidth || img.width || 0;
  if (!sh) sh = img.naturalHeight || img.height || 0;
  const m = shadowMask(img, sx, sy, sw, sh, pivot);
  if (!m || !m.canvas) return;
  const kx = dw / sw, ky = dh / sh;
  const x = dx + m.ox * kx, y = dy + m.oy * ky, w = m.canvas.width * kx, h = m.canvas.height * ky;
  if (_sink) { _sink.push({ canvas: m.canvas, x, y, w, h }); return; }
  paintShadow(ctx, m.canvas, x, y, w, h, a);
}

function paintShadow(ctx, cv, x, y, w, h, a) {
  const prevA = ctx.globalAlpha, prevOp = ctx.globalCompositeOperation, prevS = ctx.imageSmoothingEnabled;
  // Conserve les fondus de naissance et de visibilité du peintre appelant.
  ctx.globalAlpha = prevA * a;
  if (SUN_SHADOW.mode) ctx.globalCompositeOperation = SUN_SHADOW.mode;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(cv, x, y, w, h);
  ctx.globalAlpha = prevA;
  ctx.globalCompositeOperation = prevOp;
  ctx.imageSmoothingEnabled = prevS;
}

// COUPURE : une passe qui redessine un objet HORS de sa place n'emporte pas son
// ombre — mesure d'encre et liseré de survol des scènes (dessinées en (0, 0) d'un
// canvas auxiliaire : l'ombre gonflerait l'encre et le liseré en épouserait la
// forme), passe FANTÔME des unités cachées derrière un bâtiment (l'ombre serait
// repeinte par-dessus la façade).
let _mute = 0;
// Crochet du reflet dans l'eau, posé par iso/isoReflect.js (injection : ce module-ci
// ne l'importe pas, c'est le reflet qui dépend de l'ombre — pivotGround).
let _reflHook = null;
export function setSunShadowReflectHook(fn) { _reflHook = fn; }
export function muteSunShadow(fn) {
  _mute += 1;
  try { return fn(); } finally { _mute -= 1; }
}

// Part de NUIT de l'ombre, de 0 (plein soleil) à 1 (aucune ombre : nuit, vue
// lointaine, molette coupée). Les quelques ellipses de contact qui restent (bateaux,
// émeutiers) la suivent : elles tiennent au sol ce que le soleil ne tient plus, en
// fondu inverse de l'ombre — jamais les deux à la fois.
export function sunShadowNightK() {
  const full = SUN_SHADOW.alpha > 0 ? SUN_SHADOW.alpha : 1;
  return Math.max(0, Math.min(1, 1 - sunShadowAlpha() / full));
}

// ── LES SCÈNES CUITES (engineSceneCache) ─────────────────────────────────────
// Une scène de bâtiment-moteur est cuite UNE fois dans un canvas TRANSPARENT puis
// blittée. Son ombre ne peut pas y être cuite : un multiply sur du vide rend la
// couleur de l'ombre elle-même, et la scène posait un VOILE gris-bleu sur le sol
// au lieu de l'assombrir (vu en A/B cache/direct, 2026-09-30) — rogné en plus par
// les marges du canvas. La cuisson RELÈVE donc les ombres de ses props au lieu de
// les peindre (captureSunShadows), les fond en UN calque (bakeSunShadowPlane :
// l'union — deux ombres qui se croisent ne foncent pas deux fois), que le blit
// pose en multiply avec la force du moment (drawSunShadowPlane).
let _sink = null;
export function captureSunShadows(fn) {
  const prev = _sink, list = [];
  _sink = list;
  try { fn(); } finally { _sink = prev; }
  return list;
}
// `list` en px LOGIQUES du repère de cuisson ; `mk(w, h)` fabrique un canvas.
// Rend { cv, x, y, w, h } (x, y, w, h logiques, calés sur la grille device) ou null.
export function bakeSunShadowPlane(list, dpr, mk) {
  if (!list || !list.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of list) {
    if (s.x < x0) x0 = s.x; if (s.y < y0) y0 = s.y;
    if (s.x + s.w > x1) x1 = s.x + s.w; if (s.y + s.h > y1) y1 = s.y + s.h;
  }
  const X0 = Math.floor(x0 * dpr), Y0 = Math.floor(y0 * dpr);
  const W = Math.ceil(x1 * dpr) - X0, H = Math.ceil(y1 * dpr) - Y0;
  if (!(W > 0 && H > 0)) return null;
  const cv = mk(W, H);
  const c = cv.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, -X0, -Y0);
  c.imageSmoothingEnabled = false;
  for (const s of list) c.drawImage(s.canvas, s.x, s.y, s.w, s.h);
  return { cv, x: X0 / dpr, y: Y0 / dpr, w: W / dpr, h: H / dpr };
}
export function drawSunShadowPlane(ctx, cv, x, y, w, h) {
  const a = sunShadowAlpha();
  if (a <= 0 || !cv) return;
  paintShadow(ctx, cv, x, y, w, h, a);
}
