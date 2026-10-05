"use strict";
// ── LES REFLETS DANS L'EAU — la rive d'en face, les bateaux, le mur du quai ─────
//
// Demande de Raph du 2026-09-30 (docs/PLAN-MAQUETTE-VIVANTE.md, lot 1) : l'eau
// calmée, « mais améliore les reflets pour qu'ils collent vraiment à la réalité ».
//
// CE QUE DIT LA PHYSIQUE, ET CE QU'ON EN GARDE :
//   · Un reflet est le MIROIR de l'objet par le PLAN DE L'EAU. En iso, la verticale
//     se projette en y d'écran pur : le reflet d'un point de hauteur h tombe h plus
//     bas que le pied de sa verticale. Le sprite est donc retourné COLONNE PAR
//     COLONNE autour du sol de chaque colonne — le même sol que l'ombre du soleil
//     (pivotGround, iso/isoSunShadow.js) : le pied de chaque mur touche son reflet.
//   · L'EAU EST PLUS BASSE QUE LA VILLE : le quai la tient 0,66 à 0,75 case sous la
//     promenade (quaysAndRiot, quayWallTiles). Le miroir passe sous le pied de
//     l'objet, à la hauteur du mur : un objet du quai se reflète décalé de DEUX
//     hauteurs de mur. C'est ce qui fait qu'une maison en retrait sur la promenade
//     montre ses étages et son TOIT dans l'eau, comme en vrai — son pied, le mur le
//     cache. Un bateau est posé sur l'eau : décalage nul.
//   · LE MUR DU QUAI SE REFLÈTE AUSSI, et DEVANT les maisons (il est plus près de
//     nous, son reflet aussi) : une bande de pierre juste sous le bord de l'eau,
//     pied sombre du mur d'abord, margelle claire au bout — la lecture d'un canal.
//   · Seule la RIVE D'EN FACE se voit dans l'eau : le reflet part vers le BAS de
//     l'écran, celui d'un objet de la rive proche tomberait sur sa propre berge.
//     On ne le dessine même pas.
//   · Une eau calme mais vivante casse le miroir en fines bandes qui ondulent :
//     décalage d'un ou deux pixels d'art, lent, dans les reflets SEULS — jamais sur
//     la surface nue (3 refus de vaguelettes au milieu du fleuve, cf. le plan §6).
//   · Le reflet prend un peu la couleur de l'eau et perd de sa force.
//
// COMMENT. Chaque sprite de la carte passe par drawSunShadow juste avant son blit ;
// le reflet s'y branche (setSunShadowReflectHook) — les habitations et les scènes
// cuites l'appellent en direct (noteReflection), avec l'image qu'elles peignent
// vraiment (teinte, neige). Pendant une frame, les reflets des objets riverains se
// peignent dans un CALQUE ; ce calque est posé sur l'eau à la frame SUIVANTE, à la
// fin de drawIsoRiver, clippé au ruban : donc SOUS la vie de surface, les quais, les
// bateaux, le pont et la ville, qui passent après. Une frame de retard, compensée
// par la caméra (pan et zoom) : invisible. Le calque ne garde trace que de ce qu'il
// porte, par BANDES de 32 px : la pose coûte la surface des reflets, pas l'écran.
//
// Molette : __reflect({ on, alpha, tint, wobble, speed, wall })
//   alpha  = force du reflet ; tint = part de couleur d'eau (0 : couleurs vraies) ;
//   wobble = amplitude de l'ondulation en pixels d'art (0 : miroir figé) ;
//   speed  = vitesse de l'ondulation ; wall = reflet du mur de quai.
import { CM } from '../layout.js';
import { worldToScreen } from './projection.js';
import { maskSlot, pivotGround, rectKey, setSunShadowReflectHook } from './isoSunShadow.js';

// Dosage choisi sur planche (2026-09-30, bande 4, zoom 2) entre quatre essais : à
// 0,5 / 0,35 le reflet virait au gris et on ne reconnaissait plus l'ocre des
// immeubles ; à 0,7 il pesait comme un bâtiment noyé. L'ondulation à 2 pixels
// casse assez les bords pour qu'on lise de l'eau, pas une vitre.
// Le reflet du MUR de quai est ÉTEINT par défaut (planche du 2026-09-30, zoom 1) :
// exact en physique, il se lisait comme une corniche pâle posée sur l'eau ; sans
// lui, l'eau montre les façades et les toits retournés et l'œil lit « la ville dans
// le fleuve ». Gardé pour l'A/B : __reflect({ wall: true }).
// `wallTaper` (2026-10-02) : le reflet descend de la hauteur du mur À CET ENDROIT (il
// s'enfonce dans la grève au bout d'un quai) ; false = l'ancien tout-ou-rien (A/B).
export const REFLECT = { on: true, alpha: 0.6, tint: 0.15, wobble: 2, speed: 1, wall: false, minZoom: 0.6, wallTaper: true };
// Force de la frame : coupée en vue lointaine (LOD), à l'effondrement, au palier
// « perf » ; en FONDU sous `minZoom` (0,6 → 0,7), comme l'ombre du soleil.
function reflectK() {
  if (!REFLECT.on || CM.lodActive || CM.collapseAt || CM.fxOn === false) return 0;
  const z = CM.cam && CM.cam.zoom != null ? CM.cam.zoom : 1;
  return Math.max(0, Math.min(1, (z - REFLECT.minZoom) / 0.1));
}
if (typeof window !== 'undefined') {
  window.__reflect = (o) => {
    if (o === false) REFLECT.on = false;
    else if (o === true) REFLECT.on = true;
    else if (o) Object.assign(REFLECT, o);
    return { ...REFLECT };
  };
}

// ── LE MIROIR D'UN SPRITE (pur, testable sans DOM) ───────────────────────────
// `data` = RGBA du rectangle source (w × h). Rend le reflet dans le repère du
// sprite : { ox, oy, w, h, data } — son coin haut-gauche tombe en (ox, oy). Le
// pixel juste au-dessus du sol d'une colonne se reflète juste en dessous ; ce qui
// est SOUS le sol (racines d'un arbre, marge d'un habitant) ne se reflète pas.
export function reflectPixels(data, w, h, pivot) {
  const alpha = (x, y) => (x < 0 || y < 0 || x >= w || y >= h) ? 0 : data[(y * w + x) * 4 + 3];
  const { bottom, g } = pivotGround(alpha, w, h, pivot);
  const mirror = (gg, y) => Math.round(2 * gg - y - 1);
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -Infinity;
  for (let x = 0; x < w; x += 1) {
    if (bottom[x] < 0) continue;
    const gg = g[x];
    for (let y = 0; y <= bottom[x]; y += 1) {
      if (!data[(y * w + x) * 4 + 3] || y + 0.5 >= gg) continue;
      const ty = mirror(gg, y);
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (ty < y0) y0 = ty; if (ty > y1) y1 = ty;
    }
  }
  if (x1 < 0) return null;
  const W = x1 - x0 + 1, H = y1 - y0 + 1;
  const out = new Uint8ClampedArray(W * H * 4);
  for (let x = x0; x <= x1; x += 1) {
    if (bottom[x] < 0) continue;
    const gg = g[x];
    for (let y = 0; y <= bottom[x]; y += 1) {
      const si = (y * w + x) * 4;
      if (!data[si + 3] || y + 0.5 >= gg) continue;
      const di = ((mirror(gg, y) - y0) * W + (x - x0)) * 4;
      out[di] = data[si]; out[di + 1] = data[si + 1]; out[di + 2] = data[si + 2]; out[di + 3] = data[si + 3];
    }
  }
  return { ox: x0, oy: y0, w: W, h: H, data: out };
}

// ── L'ONDULATION (pure) ──────────────────────────────────────────────────────
// Décalage de la rangée d'art `r` (rangées ancrées au MONDE : le motif suit la
// caméra au pan) à l'instant `t` (s) : −1, 0 ou +1. Deux ondes lentes de périodes
// sans commune mesure : aucun motif qui se répète à l'œil.
export function wobbleAt(r, t, speed = 1) {
  const s = Math.sin(r * 0.55 + t * 1.3 * speed) + 0.6 * Math.sin(r * 1.7 - t * 0.9 * speed);
  return s > 0.95 ? 1 : s < -0.95 ? -1 : 0;
}
// Rangées [r0, r1) en COURSES de même décalage : un blit par course, pas par rangée.
export function wobbleRuns(r0, r1, t, speed = 1) {
  const runs = [];
  let cur = null;
  for (let r = r0; r < r1; r += 1) {
    const d = wobbleAt(r, t, speed);
    if (cur && cur.d === d) cur.n += 1;
    else { cur = { r, n: 1, d }; runs.push(cur); }
  }
  return runs;
}

// ── L'EAU PAR COLONNE D'ÉCRAN ────────────────────────────────────────────────
// Pour chaque tranche de `step` px, le haut et le bas du ruban à l'écran. C'est ce
// qui trie, en quelques comparaisons, la rive d'en face (pied au-dessus de l'eau),
// ce qui flotte (pied dans l'eau) et la rive proche (pied sous l'eau : son reflet
// tomberait sur sa propre berge).
export function waterColumns(edges, cw, step = 8) {
  const n = Math.max(1, Math.ceil(cw / step) + 1);
  const top = new Float32Array(n).fill(Infinity), bot = new Float32Array(n).fill(-Infinity);
  const put = (i, y) => { if (i < 0 || i >= n) return; if (y < top[i]) top[i] = y; if (y > bot[i]) bot[i] = y; };
  const seg = (a, b) => {
    const ax = a.x / step, bx = b.x / step;
    const lo = Math.max(0, Math.ceil(Math.min(ax, bx))), hi = Math.min(n - 1, Math.floor(Math.max(ax, bx)));
    put(Math.round(ax), a.y); put(Math.round(bx), b.y);
    for (let i = lo; i <= hi; i += 1) {
      const u = bx === ax ? 0 : (i - ax) / (bx - ax);
      put(i, a.y + (b.y - a.y) * u);
    }
  };
  const { left, right } = edges;
  for (let i = 1; i < left.length; i += 1) seg(left[i - 1], left[i]);
  for (let i = 1; i < right.length; i += 1) seg(right[i - 1], right[i]);
  if (left.length && right.length) {
    seg(left[0], right[0]);
    seg(left[left.length - 1], right[right.length - 1]);
  }
  return { step, n, top, bot };
}

// ── LES MIROIRS CUITS, en cache ──────────────────────────────────────────────
// Par image source puis (pivot, rectangle) — le cache imbriqué de l'ombre, sans clé
// en chaîne (isoSunShadow.maskSlot, PERF-46). WeakMap : un canvas de teinte, de
// saison ou de scène qui meurt emporte son reflet.
const _cache = new WeakMap();
function reflectCanvas(img, sx, sy, sw, sh, pivot) {
  const m = maskSlot(_cache, img, pivot);
  const k = rectKey(sx, sy, sw, sh);
  let e = m.get(k);
  if (e !== undefined) return e;
  e = null;
  try {
    if (typeof document !== 'undefined' && sw > 0 && sh > 0) {
      const src = document.createElement('canvas');
      src.width = sw; src.height = sh;
      const sc = src.getContext('2d', { willReadFrequently: true });
      sc.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      const r = reflectPixels(sc.getImageData(0, 0, sw, sh).data, sw, sh, pivot);
      if (r) {
        const cv = document.createElement('canvas');
        cv.width = r.w; cv.height = r.h;
        cv.getContext('2d').putImageData(new ImageData(r.data, r.w, r.h), 0, 0);
        e = { canvas: cv, ox: r.ox, oy: r.oy };
      } else e = { canvas: null };
    }
  } catch { e = null; }                    // image pas décodée : on réessaiera
  if (e) m.set(k, e);
  return e;
}

// ── LE CALQUE ────────────────────────────────────────────────────────────────
const STRIP = 32;            // hauteur d'une bande de suivi, px device
let _layer = null, _lctx = null;
let _build = false;          // une frame est en train de le remplir
let _ref = null;             // caméra + transform de la frame de cuisson
let _cols = null;            // eau par colonne d'écran de la frame de cuisson
let _drop = 0;               // hauteur du mur de quai à l'écran (px) de la frame
let _wall = null;            // { runs, cols } : le mur de quai de la rive d'en face
let _wallCol = null;         // par colonne d'écran (cf. _cols) : part du mur plein sur ce bord d'eau (0..1)
// Ce que porte le calque, par bande : étendue x (px device), et bandes utilisées.
let _sx0 = null, _sx1 = null, _s0 = Infinity, _s1 = -Infinity;

// Marque sale un rectangle en px LOGIQUES de la frame de cuisson.
function markDirty(x, y, w, h) {
  const R = _ref, H = _layer.height;
  const X0 = R.a * x + R.e, X1 = R.a * (x + w) + R.e;
  const Y0 = Math.max(0, R.d * y + R.f), Y1 = Math.min(H, R.d * (y + h) + R.f);
  if (!(Y1 > Y0) || !(X1 > 0) || !(X0 < _layer.width)) return;
  const s0 = Math.floor(Y0 / STRIP), s1 = Math.floor((Y1 - 1e-6) / STRIP);
  for (let s = s0; s <= s1; s += 1) {
    if (X0 < _sx0[s]) _sx0[s] = X0;
    if (X1 > _sx1[s]) _sx1[s] = X1;
  }
  if (s0 < _s0) _s0 = s0;
  if (s1 > _s1) _s1 = s1;
}
// Étendue x (px device entiers, marge 2 px, bornée au calque) de la bande s, ou null.
function stripSpan(s) {
  if (!(_sx1[s] > _sx0[s])) return null;
  const x0 = Math.max(0, Math.floor(_sx0[s]) - 2), x1 = Math.min(_layer.width, Math.ceil(_sx1[s]) + 2);
  return x1 > x0 ? { x: x0, w: x1 - x0 } : null;
}

// Reflète un sprite dont la boîte ÉCRAN dessinée est (dx, dy, dw, dh), source
// (sx, sy, sw, sh) de `img` (par défaut l'image entière), si ce reflet peut tomber
// dans l'eau. À appeler juste avant son blit, dans le repère du canvas principal.
// `dropMode` : 'water' = l'objet est SUR l'eau (coque d'un bateau, tablier d'un pont) —
// miroir à sa propre ligne de flottaison, aucun décalage ; 'quay' = au niveau des
// quais, le miroir descend de toute la hauteur du mur ; absent = tri par colonne
// d'écran (rive d'en face, sur l'eau, rive proche).
// ⚠ RETOUR RAPH du 2026-10-01 (capture du port, « les reflets des bateaux et des ponts
// ne sont pas logiques ») : le pont passait en 'quay' — son reflet flottait en bande
// sombre loin sous le tablier, alors qu'à l'écran le fleuve est dessiné AU NIVEAU DU
// SOL et le tablier le touche ; et un bateau près d'une rive tombait dans le tri
// « rive d'en face » (colonnes de 8 px contre un bord en diagonale) : même décalage,
// reflet décollé de la coque. Les deux passent en 'water', déclaré par l'appelant.
export function noteReflection(ctx, img, dx, dy, dw, dh, sx = 0, sy = 0, sw = 0, sh = 0, pivot = 'column', dropMode = null) {
  if (!_build || !REFLECT.on || !img || !(dw > 0) || !(dh > 0)) return;
  const C = _cols;
  const i = Math.round((dx + dw / 2) / C.step);
  if (i < 0 || i >= C.n) return;
  const top = C.top[i], bot = C.bot[i];
  if (!(top < Infinity)) return;           // pas d'eau sous cette colonne d'écran
  const footY = dy + dh;
  let drop;
  if (dropMode === 'water') drop = 0;      // sur l'eau : à sa ligne de flottaison
  else if (dropMode === 'quay') drop = _drop;   // au niveau des quais, où qu'il soit
  // Rive d'en face : l'eau est sous le mur — LÀ OÙ IL Y EN A UN. Sur une grève (la
  // plage du port, 2026-10-01), l'eau est au niveau du sable : la maison du port et
  // l'arbre de la plage se reflétaient décalés de toute la hauteur d'un mur absent,
  // et leur reflet flottait au milieu du fleuve, détaché d'eux.
  // ⚠ PROGRESSIF, PAS TOUT-OU-RIEN (2026-10-02, retour Raph : la fin du quai sur la plage
  // du port « fait buguer le reflet ») : là où le mur s'enfonce dans la grève (TAPER
  // samples), un reflet tombait encore de toute sa hauteur — détaché de la rive, coupé
  // en biais contre ses voisins de la plage. Il descend désormais de la hauteur du mur
  // À CET ENDROIT (part du mur plein portée par les points du bord, cf. isoRiver).
  else if (footY < top) drop = !_wallCol ? _drop : _drop * _wallCol[i];
  else if (footY <= bot) drop = 0;         // posé sur l'eau (bateau)
  else return;                             // rive proche : reflet sur sa propre berge
  if (footY + dh + 2 * drop < top) return; // trop loin de l'eau pour l'atteindre
  if (!sw) sw = img.naturalWidth || img.width || 0;
  if (!sh) sh = img.naturalHeight || img.height || 0;
  const m = reflectCanvas(img, sx, sy, sw, sh, pivot);
  if (!m || !m.canvas) return;
  const kx = dw / sw, ky = dh / sh;
  const x = dx + m.ox * kx, y = dy + m.oy * ky + 2 * drop;
  const w = m.canvas.width * kx, h = m.canvas.height * ky;
  // Les fondus du peintre (naissance, visibilité) valent aussi pour le reflet.
  _lctx.globalAlpha = ctx ? ctx.globalAlpha : 1;
  _lctx.drawImage(m.canvas, x, y, w, h);
  markDirty(x, y, w, h);
}
setSunShadowReflectHook(noteReflection);

// Un reflet DÉJÀ RETOURNÉ par l'appelant, posé tel quel dans le calque (boîte ÉCRAN
// x, y, w, h). Pour ce qui sait calculer son miroir exactement au lieu de le laisser
// deviner colonne par colonne : le ponton du port (iso/isoPier.js) lance le rayon dans
// la scène retournée sous l'eau — son tablier n'a pas de « pixel le plus bas » qui
// soit sa ligne de flottaison, ses pieux si. Il reçoit la même teinte, la même force
// et la même ondulation que les autres.
export function noteReflectionImage(ctx, cv, x, y, w, h) {
  if (!_build || !REFLECT.on || !cv || !(w > 0) || !(h > 0)) return;
  _lctx.globalAlpha = ctx ? ctx.globalAlpha : 1;
  _lctx.drawImage(cv, x, y, w, h);
  markDirty(x, y, w, h);
}

// Pose le calque de la frame précédente sur l'eau, puis ouvre celui de cette
// frame. Appelé à la FIN de drawIsoRiver, qui fournit : le tracé du ruban (clip),
// ses bords à l'écran, la hauteur du mur de quai (px), la couleur de l'eau, et le
// mur de la rive d'en face ({ runs : polylignes du bord d'eau, cols }) ou null.
export function drawIsoReflections(ctx, now, clipPath, edges, drop, tintRGB, wall = null) {
  const k = reflectK();
  if (k > 0 && _layer && _ref && _s1 >= _s0) compositeLayer(ctx, now, clipPath, tintRGB, k);
  beginBuild(ctx, edges, drop, wall, k);
}

// Le peintre a fini : le mur de quai se reflète DEVANT les maisons (peint en
// dernier), puis plus rien ne s'ajoute au calque de cette frame.
export function endReflectionBuild() {
  if (_build && REFLECT.wall && _wall && _drop > 0) drawWallReflection();
  _build = false;
}

// Le reflet du mur : du bord de l'eau (pied du mur, sombre) jusqu'à deux hauteurs
// de mur sous la margelle (la margelle, claire) — le mur retourné.
function drawWallReflection() {
  const { runs, cols } = _wall, h = _drop;
  const bands = [[0, 0.5, cols.bot], [0.5, 0.86, cols.top], [0.86, 1, cols.coping]];
  _lctx.globalAlpha = 1;
  for (const run of runs) {
    if (!run || run.length < 2) continue;
    for (const [a, b, col] of bands) {
      _lctx.fillStyle = col;
      _lctx.beginPath();
      // Hauteur du mur À CET ENDROIT (`f`, cf. beginBuild) : il s'enfonce dans la grève.
      const hh = (p) => h * (p.f == null ? 1 : p.f);
      for (let i = 0; i < run.length; i += 1) {
        const p = run[i], y = p.y + hh(p) + a * hh(p);
        if (i) _lctx.lineTo(p.x, y); else _lctx.moveTo(p.x, y);
      }
      for (let i = run.length - 1; i >= 0; i -= 1) _lctx.lineTo(run[i].x, run[i].y + hh(run[i]) + b * hh(run[i]));
      _lctx.closePath();
      _lctx.fill();
    }
    for (let i = 1; i < run.length; i += 1) {
      const p = run[i - 1], q = run[i];
      const x0 = Math.min(p.x, q.x), y0 = Math.min(p.y, q.y) + h;
      markDirty(x0, y0, Math.abs(q.x - p.x) + 1, Math.abs(q.y - p.y) + h + 1);
    }
  }
}

function compositeLayer(ctx, now, clipPath, tintRGB, strength = 1) {
  const R = _ref;
  // Le reflet prend un peu la couleur de l'eau (source-atop : là où il y en a).
  if (REFLECT.tint > 0 && tintRGB) {
    _lctx.save();
    _lctx.setTransform(1, 0, 0, 1, 0, 0);
    _lctx.globalAlpha = 1;
    _lctx.globalCompositeOperation = 'source-atop';
    _lctx.fillStyle = 'rgba(' + tintRGB + ',' + REFLECT.tint + ')';
    for (let s = _s0; s <= _s1; s += 1) {
      const sp = stripSpan(s);
      if (sp) _lctx.fillRect(sp.x, s * STRIP, sp.w, STRIP);
    }
    _lctx.restore();
  }
  // Caméra : un point du calque (px device D, frame de cuisson) retombe en
  // D' = s·o + t + (D − t − s·o₀)·k, o = écran de l'origine du monde, k = zoom / zoom₀.
  const M = ctx.getTransform();
  const k = CM.cam.zoom / R.z;
  const o = worldToScreen(0, 0);
  let baseX = M.a * o.x + M.e - (R.e + R.a * R.ox) * k;
  let baseY = M.d * o.y + M.f - (R.f + R.d * R.oy) * k;
  // ⚠ TOUT AU PIXEL ENTIER. Un bord de blit fractionnaire est couvert À MOITIÉ (le
  // canvas l'adoucit même sans lissage) : deux morceaux jointifs y laissaient une
  // ligne claire en travers des reflets (vu aux coutures des bandes, 2026-09-30).
  if (Math.abs(k - 1) < 1e-6) { baseX = Math.round(baseX); baseY = Math.round(baseY); }
  // Une rangée d'art = un pixel monde au zoom de la cuisson ; rangées ancrées sur
  // l'origine du monde, pour que l'ondulation suive l'eau au pan.
  const band = Math.max(1, Math.round(R.z * R.d));
  const anchorY = Math.round(R.f + R.d * R.oy);
  const t = (now || 0) / 1000;
  const Y0 = _s0 * STRIP, Y1 = (_s1 + 1) * STRIP;
  const r0 = Math.floor((Y0 - anchorY) / band), r1 = Math.ceil((Y1 - anchorY) / band);
  const runs = REFLECT.wobble ? wobbleRuns(r0, r1, t, REFLECT.speed) : [{ r: r0, n: r1 - r0, d: 0 }];
  ctx.save();
  clipPath(ctx);
  ctx.clip('evenodd');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = REFLECT.alpha * strength;
  ctx.globalCompositeOperation = 'source-over';
  ctx.imageSmoothingEnabled = false;
  for (const run of runs) {
    const ya = Math.max(Y0, anchorY + run.r * band), yb = Math.min(Y1, anchorY + (run.r + run.n) * band);
    if (yb <= ya) continue;
    const off = run.d * REFLECT.wobble * band;
    for (let s = Math.floor(ya / STRIP), se = Math.floor((yb - 1e-6) / STRIP); s <= se; s += 1) {
      const sp = stripSpan(s);
      if (!sp) continue;
      const y0 = Math.max(ya, s * STRIP), y1 = Math.min(yb, (s + 1) * STRIP);
      if (y1 <= y0) continue;
      ctx.drawImage(_layer, sp.x, y0, sp.w, y1 - y0, baseX + (sp.x + off) * k, baseY + y0 * k, sp.w * k, (y1 - y0) * k);
    }
  }
  ctx.restore();
}

// Rend la mémoire du calque (un canvas de 0 × 0 ne tient plus de pixels) ; la
// première frame qui reflète de nouveau le réalloue à la taille de l'écran.
function releaseLayer() {
  _layer.width = 0; _layer.height = 0;
  _sx0 = null; _sx1 = null; _s0 = Infinity; _s1 = -Infinity;
  _ref = null; _cols = null; _wall = null; _wallCol = null;
}

function beginBuild(ctx, edges, drop, wall, k = 1) {
  _build = false;
  if (typeof document === 'undefined') return;
  const cv = ctx.canvas;
  if (!cv || !edges || !edges.left || edges.left.length < 2) return;
  // Reflets coupés : ni allouer ni redimensionner le calque plein écran pour rien —
  // 13,7 Mo à 2560×1340, ×4 à dpr 2, sur les machines mêmes qu'on veut soulager (audit
  // MEM-12). Coupure durable (palier « perf », effondrement, molette) : il est RENDU ;
  // passagère (LOD, zoom lointain) : gardé tel quel, juste vidé de ce qu'il porte.
  if (!(k > 0)) {
    if (!_layer || !_sx0) return;
    if (CM.fxOn === false || CM.collapseAt || !REFLECT.on) { releaseLayer(); return; }
  }
  if (!_layer) { _layer = document.createElement('canvas'); _lctx = _layer.getContext('2d'); }
  const nS = Math.ceil(cv.height / STRIP);
  if (k > 0 && (_layer.width !== cv.width || _layer.height !== cv.height || !_sx0 || _sx0.length !== nS)) {
    _layer.width = cv.width; _layer.height = cv.height;   // redimensionner vide le calque
    _sx0 = new Float32Array(nS); _sx1 = new Float32Array(nS);
    _sx0.fill(Infinity); _sx1.fill(-Infinity); _s0 = Infinity; _s1 = -Infinity;
  }
  // Effacer ce que portait le calque, bande par bande.
  _lctx.setTransform(1, 0, 0, 1, 0, 0);
  for (let s = _s0; s <= _s1; s += 1) {
    const sp = stripSpan(s);
    if (sp) _lctx.clearRect(sp.x, s * STRIP, sp.w, STRIP);
    _sx0[s] = Infinity; _sx1[s] = -Infinity;
  }
  _s0 = Infinity; _s1 = -Infinity;
  if (!(k > 0)) return;                    // calque vidé, rien à cuire cette frame
  const M = ctx.getTransform();
  _lctx.setTransform(M.a, M.b, M.c, M.d, M.e, M.f);
  _lctx.imageSmoothingEnabled = false;
  _lctx.globalAlpha = 1;
  _lctx.globalCompositeOperation = 'source-over';
  const o = worldToScreen(0, 0);
  _ref = { ox: o.x, oy: o.y, z: CM.cam.zoom, a: M.a, d: M.d, e: M.e, f: M.f };
  _cols = waterColumns(edges, CM.cw || cv.width);
  _drop = drop || 0;
  _wall = wall && wall.runs && wall.runs.length ? wall : null;
  // Colonnes dont le bord d'eau HAUT est un mur de quai (les tronçons de `wall`), avec la
  // PART du mur plein à cet endroit (`f` des points, 1 si absent) interpolée le long du
  // bord. Sans description du mur (`wall` absent), la règle d'avant : un mur partout.
  _wallCol = null;
  if (wall && wall.runs) {
    const C = _cols;
    _wallCol = new Float32Array(C.n);
    for (const run of wall.runs) {
      for (let k = 1; k < run.length; k += 1) {
        const p = run[k - 1], q = run[k];
        const fp = p.f == null || !REFLECT.wallTaper ? 1 : p.f, fq = q.f == null || !REFLECT.wallTaper ? 1 : q.f;
        const i0 = Math.max(0, Math.floor(Math.min(p.x, q.x) / C.step));
        const i1 = Math.min(C.n - 1, Math.ceil(Math.max(p.x, q.x) / C.step));
        const dx = q.x - p.x;
        for (let i = i0; i <= i1; i += 1) {
          const u = Math.abs(dx) > 1e-6 ? Math.max(0, Math.min(1, ((i + 0.5) * C.step - p.x) / dx)) : 0.5;
          const fv = fp + (fq - fp) * u;
          if (fv > _wallCol[i]) _wallCol[i] = fv;
        }
      }
    }
  }
  _build = true;
}
