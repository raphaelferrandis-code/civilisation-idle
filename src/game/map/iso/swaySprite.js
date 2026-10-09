// LE VENT SANS SACCADE : la couronne GLISSE d'un texel au lieu de sauter.
//
// Demande de Raph (2026-10-07) : « entendre le vent sans voir les arbres bouger est
// problématique. Trouve un moyen de faire faire aux arbres un mouvement pas saccadé. »
// Retenu : 1 (fondu entre deux positions), 2 (le revers pâle des feuilles), 3 (les
// rafales vues = les rafales entendues, cf. isoVie.vieTreeSway).
//
// LE FONDU. Un pixel d'art ne se pose qu'au texel entier : décaler une rangée d'un
// demi-texel en rééchantillonnant fait fourmiller la grille. On compose donc, dans la
// grille du sprite, chaque rangée posée à ⌊o⌋ avec le poids 1 − f et à ⌊o⌋ + 1 avec le
// poids f (f = o − ⌊o⌋, au huitième de texel) : en 'lighter' sur un fond vide, la somme
// prémultipliée est le mélange EXACT des deux poses, bords compris (le bord qui part
// s'efface de 1 à 0 pendant que celui qui arrive monte de 0 à 1). L'image composée se
// pose ensuite au même grain que le sprite : aucun rééchantillonnage, l'œil voit la
// couronne avancer d'un huitième de texel à la fois.
//
// LE REVERS DES FEUILLES. Une version PÂLE du sprite (le vert tiré vers un vert
// argenté, le tronc et la neige intacts), composée aux mêmes poses, se pose PAR-DESSUS
// à l'opacité du frisson : aucun pixel ne bouge, rien ne peut sauter.
//
// LE COÛT. Une composition par (image, pose, couche), gardée dans des pages d'atlas
// (4 × 1024², 16 Mo) : un arbre au vent coûte UN blit, deux pendant le frisson, comme
// un arbre immobile. Une pose n'a qu'un paramètre (le décalage du haut, au huitième de
// texel) : une vingtaine de poses par essence. Au-delà de COMPOSE_MAX compositions
// dans une image, l'arbre retombe sur trois bandes au texel entier, pour cette image-là.
import { CM } from '../layout.js';
import { lightCut, lightCutLive, lightCutImage } from '../lightLayer.js';

const PAGE = 1024, PAGES_MAX = 4, COMPOSE_MAX = 24;
const PALE_K = 0.45;                 // jusqu'où le revers tire le vert vers l'argent

const _ids = new WeakMap();
let _nextId = 1;
const idOf = (img) => {
  let id = _ids.get(img);
  if (!id) { id = _nextId++; _ids.set(img, id); }
  return id;
};

// ── La version pâle ─────────────────────────────────────────────────────────
// Un pixel pèse d'autant plus qu'il est VERT (g au-dessus de r et de b) : le tronc
// brun, la neige, l'écorce claire du bouleau ne bougent pas ; un feuillage d'automne
// frissonne moins. Le vert argenté a plus de bleu que de rouge (palette anti-jaune).
const _pale = new WeakMap();
function paleOf(img, sw, sh) {
  let p = _pale.get(img);
  if (p !== undefined) return p;
  p = null;
  try {
    const c = document.createElement('canvas');
    c.width = sw; c.height = sh;
    const cx = c.getContext('2d');
    if (cx && typeof cx.getImageData === 'function') {
      cx.drawImage(img, 0, 0);
      const id = cx.getImageData(0, 0, sw, sh), d = id.data;
      for (let i = 0; i < d.length; i += 4) {
        if (!d[i + 3]) continue;
        const r = d[i], g = d[i + 1], b = d[i + 2];
        const w = Math.max(0, Math.min(1, (g - Math.max(r, b)) / 25)) * PALE_K;
        if (!w) continue;
        const l = 0.3 * r + 0.59 * g + 0.11 * b;
        d[i] = r + (Math.min(255, l * 0.8 + 55) - r) * w;
        d[i + 1] = g + (Math.min(255, l * 0.95 + 68) - g) * w;
        d[i + 2] = b + (Math.min(255, l * 0.85 + 62) - b) * w;
      }
      cx.putImageData(id, 0, 0);
      p = c;
    }
  } catch { p = null; }
  _pale.set(img, p);
  return p;
}

// ── Les pages d'atlas ───────────────────────────────────────────────────────
// Rangées en étagères ; pleines, la plus ancienne est vidée et resservie (ses poses se
// recomposeront à la demande).
const _pages = [];
const _cache = new Map();
let _cur = -1, _shX = 0, _shY = 0, _shH = 0;
let _frame = NaN, _composed = 0, _vus = 0, _bougent = 0, _maxPx = 0;

function newPage() {
  const c = document.createElement('canvas');
  c.width = PAGE; c.height = PAGE;
  return { c, ctx: c.getContext('2d'), keys: [] };
}
function alloc(w, h) {
  if (w > PAGE || h > PAGE) return null;
  if (_cur >= 0 && _shX + w > PAGE) { _shY += _shH; _shX = 0; _shH = 0; }
  if (_cur < 0 || _shY + h > PAGE) {
    _cur = (_cur + 1) % PAGES_MAX;
    if (!_pages[_cur]) _pages[_cur] = newPage();
    else {
      const pg = _pages[_cur];
      for (const k of pg.keys) _cache.delete(k);
      pg.keys.length = 0;
      pg.ctx.clearRect(0, 0, PAGE, PAGE);
    }
    _shX = 0; _shY = 0; _shH = 0;
  }
  const at = { pg: _pages[_cur], x: _shX, y: _shY };
  _shX += w; _shH = Math.max(_shH, h);
  return at;
}

// LA COURBE. L'arbre plie depuis son PIED (`pivot`, fraction de la hauteur du sprite :
// 0,92 pour les arbres, le pied mesuré pour les objets de kit) : chaque rangée glisse de
// s × ((P − y) / P)^1,5 texels, P la rangée du pied. Le haut de la couronne suit tout le
// décalage, le bas du tronc ne bouge pas. Les rangées de même décalage (au huitième)
// sont posées d'un seul blit : une vingtaine de bandes pour un grand coup de vent.
// (Trois blocs décalés d'un texel, l'ancien vent, laissaient une marche en travers du
// feuillage dès que le haut dépassait le milieu.)
const q8 = (v) => Math.round(v * 8) / 8;
function shearRows(s, sh, pivot, fn) {
  const P = Math.max(1, pivot * sh);
  const off = (y) => (y >= P ? 0 : q8(s * Math.pow((P - y - 0.5) / P, 1.5)));
  let y = 0;
  while (y < sh) {
    const o = off(y);
    let y1 = y + 1;
    while (y1 < sh && off(y1) === o) y1 += 1;
    fn(y, y1, o, Math.max(0, Math.min(1, 1 - (y + y1) / 2 / P)));
    y = y1;
  }
}
function compose(src, sw, sh, sway, pivot, layer, key) {
  const R = Math.ceil(Math.abs(sway.s));
  const w = sw + 2 * R;
  const at = alloc(w + 1, sh + 1);
  if (!at) return null;
  const pc = at.pg.ctx;
  pc.save();
  pc.clearRect(at.x, at.y, w + 1, sh + 1);
  pc.globalCompositeOperation = 'lighter';
  pc.imageSmoothingEnabled = false;
  shearRows(sway.s, sh, pivot, (y0, y1, o, haut) => {
    // Le revers pâle se voit surtout en HAUT de la couronne (moitié moins au pied).
    const wb = layer ? 0.5 + 0.5 * haut : 1;
    const lo = Math.floor(o), f = o - lo;
    if (f < 1) { pc.globalAlpha = (1 - f) * wb; pc.drawImage(src, 0, y0, sw, y1 - y0, at.x + R + lo, at.y + y0, sw, y1 - y0); }
    if (f > 0) { pc.globalAlpha = f * wb; pc.drawImage(src, 0, y0, sw, y1 - y0, at.x + R + lo + 1, at.y + y0, sw, y1 - y0); }
  });
  pc.restore();
  const e = { c: at.pg.c, x: at.x, y: at.y, w, h: sh, R };
  at.pg.keys.push(key);
  _cache.set(key, e);
  return e;
}
function entry(src, sw, sh, sway, pivot, layer) {
  const key = ((idOf(src) * 1024 + sway.qS + 512) * 128 + Math.round(pivot * 64)) * 2 + layer;
  const e = _cache.get(key);
  if (e) return e;
  if (_composed >= COMPOSE_MAX) return null;
  _composed += 1;
  return compose(src, sw, sh, sway, pivot, layer, key);
}

// Pose un sprite au vent dans (dx, dy, dw, dh) et découpe les halos qu'il cache.
// `sway` : ce que rend isoVie.vieTreeSway (null = immobile, un blit tel quel) ;
// `pivot` : le pied, en fraction de la hauteur du sprite.
export function drawSwaySprite(ctx, img, sw, sh, dx, dy, dw, dh, sway, now, pivot = 0.92) {
  if (now !== _frame) { _frame = now; _composed = 0; _vus = 0; _bougent = 0; _maxPx = 0; }
  _vus += 1;
  if (sway) { _bougent += 1; _maxPx = Math.max(_maxPx, Math.abs(sway.s) * dw / sw); }
  if (!sway) {
    ctx.drawImage(img, dx, dy, dw, dh);
    lightCutImage(img, dx, dy, dw, dh);
    return;
  }
  const kx = dw / sw;
  const base = entry(img, sw, sh, sway, pivot, 0);
  if (!base) { drawBands(ctx, img, sw, sh, dx, dy, dw, dh, sway, pivot); return; }
  const bx = dx - base.R * kx, bw = dw + 2 * base.R * kx;
  ctx.drawImage(base.c, base.x, base.y, base.w, base.h, bx, dy, bw, dh);
  if (sway.reflet > 0) {
    const pale = paleOf(img, sw, sh);
    const pe = pale && entry(pale, sw, sh, sway, pivot, 1);
    if (pe) {
      const a = ctx.globalAlpha;
      ctx.globalAlpha = a * sway.reflet;
      ctx.drawImage(pe.c, pe.x, pe.y, pe.w, pe.h, bx, dy, bw, dh);
      ctx.globalAlpha = a;
    }
  }
  // La découpe du calque de lumière suit la couronne LÀ OÙ elle est posée (audit du
  // 05/10, PERF-73) : la silhouette de repos laissait une frange de halo la traverser.
  if (lightCutLive()) lightCut(bx, dy, bx + bw, dy + dh, (lc) => lc.drawImage(base.c, base.x, base.y, base.w, base.h, bx, dy, bw, dh));
}

// Le repli (budget de compositions épuisé pour cette image) : la même courbe en trois
// bandes au texel entier, sans revers. Coupures entre bandes au pixel DEVICE entier :
// une coupure fractionnaire laissait une ligne claire en travers de la couronne.
function drawBands(ctx, img, sw, sh, dx, dy, dw, dh, sway, pivot) {
  const kx = dw / sw, ky = dh / sh, dp = CM.dpr || 1;
  const bandY = (r) => (r <= 0 ? dy : r >= sh ? dy + dh : Math.round((dy + r * ky) * dp) / dp);
  const P = pivot * sh, c1 = Math.round(P * 0.33), c2 = Math.round(P * 0.66);
  const at = (y) => Math.round(sway.s * Math.pow(Math.max(0, (P - y) / P), 1.5));
  const bands = [[0, c1, at(c1 * 0.5)], [c1, c2, at((c1 + c2) * 0.5)], [c2, sh, at((c2 + P) * 0.5)]];
  const blit = (c) => {
    for (const [y0, y1, o] of bands) if (y1 > y0) c.drawImage(img, 0, y0, sw, y1 - y0, dx + o * kx, bandY(y0), dw, bandY(y1) - bandY(y0));
  };
  blit(ctx);
  if (!lightCutLive()) return;
  let reach = 0;
  for (const b of bands) reach = Math.max(reach, Math.abs(b[2]) * kx);
  lightCut(dx - reach, dy, dx + dw + reach, dy + dh, blit);
}

// Pour les tests et la sonde : l'état de l'atlas.
export const swaySpriteStats = () => ({
  poses: _cache.size, pages: _pages.filter(Boolean).length, composees: _composed,
  vus: _vus, bougent: _bougent, maxPx: Math.round(_maxPx * 100) / 100,   // à la dernière image
});
