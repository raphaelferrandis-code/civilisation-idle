// ── LA VILLE COSMIQUE S'ALLUME LA NUIT ──────────────────────────────────────
// 2026-10-01 (Raph : « le meilleur rendu futuriste possible »). Les scènes moteur des
// bandes 7-9 sont redessinées en nacre et en VERRE TEINTÉ de la couleur de l'ère (jade,
// or, violet ; cf. scripts/fetchCosmicScene.mjs). Le jour, ce verre est une couleur ;
// la nuit, il doit être une LUMIÈRE — c'est toute la différence entre une maquette
// éteinte et une ville du futur.
//
// Même principe que les fenêtres des maisons (houseWindows.js) : on ne peint rien de
// nouveau, on RELÈVE dans le sprite les pixels qui portent la teinte de l'ère, et on les
// dépose dans le calque de lumière (lightLayer.js), qui s'ajoute APRÈS le voile de nuit.
// Le feuillage (vert jaune), la nacre (sans saturation) et les ombres (trop sombres)
// restent éteints : seuls le verre et les bandes lumineuses s'allument.
import { CM } from './layout.js';
import { LIGHT_LAYER, lightCtx, litBox } from './lightLayer.js';

// Fenêtre de teinte par bande, en degrés, et planchers de saturation / valeur.
export const EMISSIVE_BANDS = {
  // jade : mesuré sur l'art livré, le verre tombe entre 140 et 150 (vert d'eau) et le
  // feuillage sous 105 — la fenêtre passe entre les deux.
  7: { h0: 125, h1: 195, s: 0.15, v: 0.42, glow: [120, 255, 200] },
  8: { h0: 30, h1: 58, s: 0.34, v: 0.52, glow: [255, 214, 130] },      // or
  9: { h0: 245, h1: 305, s: 0.18, v: 0.42, glow: [200, 170, 255] },    // violet
};
export const EMISSIVE = { on: true, k: 0.7, mix: 0.45 };
// Part de cette lumière laissée aux MAISONS, par bande (les scènes moteur gardent tout :
// ce sont les repères). Depuis que les maisons en nacre ont leur skin d'ère (2026-10-01),
// à la bande 7 les bassins et les anneaux jade des dômes s'allumaient avec le reste —
// toute la ville brillait autant que ses monuments. L'or (8) tenait déjà.
export const EMISSIVE_HOUSE = { 7: 0.45, 8: 1, 9: 0.7 };

const hsv = (r, g, b) => {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d > 0) {
    if (mx === r) h = 60 * (((g - b) / d) % 6);
    else if (mx === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;
  return [h, mx === 0 ? 0 : d / mx, mx / 255];
};

// Masque des pixels émissifs d'une image RGBA (pur, testable) : 1 = s'allume.
export function emissivePixels(data, width, height, band) {
  const cfg = EMISSIVE_BANDS[band];
  const out = new Uint8Array(width * height);
  if (!cfg) return out;
  for (let i = 0; i < width * height; i += 1) {
    if (data[i * 4 + 3] < 200) continue;
    const [h, s, v] = hsv(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
    if (s >= cfg.s && v >= cfg.v && h >= cfg.h0 && h <= cfg.h1) out[i] = 1;
  }
  return out;
}

const masks = new WeakMap();   // img → Map(band → { cv, u0, v0, u1, v1 } | null)
// Audit du 2026-10-05 (PERF-2) : le masque vivait dans le canevas de LECTURE
// (willReadFrequently, gardé en mémoire CPU) — c'est lui qui était blitté chaque nuit
// dans le calque. Il est désormais posé dans un SECOND canevas, ordinaire : mêmes
// octets (alpha 0 ou 255, aucune prémultiplication à arrondir). (u0, v0)-(u1, v1) =
// boîte des pixels allumés dans l'image, cf. lightLayer.litBox.
function maskFor(img, band) {
  let m = masks.get(img);
  if (!m) { m = new Map(); masks.set(img, m); }
  if (m.has(band)) return m.get(band);
  // Image OU canevas (les maisons passent parfois une variante cuite, enneigée).
  const w = (img.naturalWidth || img.width) | 0, h = (img.naturalHeight || img.height) | 0;
  if (!w || !h || typeof document === 'undefined') { m.set(band, null); return null; }
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(img, 0, 0);
  const src = x.getImageData(0, 0, w, h);
  const on = emissivePixels(src.data, w, h, band);
  const out = x.createImageData(w, h);
  const g = EMISSIVE_BANDS[band].glow, k = EMISSIVE.mix;
  let n = 0, u0 = w, v0 = h, u1 = 0, v1 = 0;
  for (let i = 0; i < w * h; i += 1) {
    if (!on[i]) continue;
    n += 1;
    // La lumière garde la nuance du verre, tirée vers la couleur pure de l'ère.
    out.data[i * 4] = Math.round(src.data[i * 4] + (g[0] - src.data[i * 4]) * k);
    out.data[i * 4 + 1] = Math.round(src.data[i * 4 + 1] + (g[1] - src.data[i * 4 + 1]) * k);
    out.data[i * 4 + 2] = Math.round(src.data[i * 4 + 2] + (g[2] - src.data[i * 4 + 2]) * k);
    out.data[i * 4 + 3] = 255;
    const px = i % w, py = (i / w) | 0;
    if (px < u0) u0 = px; if (px + 1 > u1) u1 = px + 1;
    if (py < v0) v0 = py; if (py + 1 > v1) v1 = py + 1;
  }
  let res = null;
  if (n) {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    cv.getContext('2d').putImageData(out, 0, 0);
    res = { cv, u0, v0, u1, v1 };
  }
  m.set(band, res);
  return res;
}

// Dépose la lumière d'une scène blittée en (dx, dy, dw, dh) — depuis le rectangle
// source (sx, sy, sw, sh) quand le blit en prend un (les maisons blittent leur boîte
// d'encre). Sans effet le jour, en vue lointaine, ou quand le calque n'est pas armé.
export function drawSceneEmissive(img, dx, dy, dw, dh, band, sx, sy, sw, sh, kMul = 1) {
  if (!EMISSIVE.on || !img) return;
  const night = Math.max(0, Math.min(1, ((CM.nightF || 0) - 0.22) / 0.65));
  if (!night || CM.lodActive) return;
  const mask = maskFor(img, band);
  if (!mask) return;
  // Emprise serrée sur les pixels allumés (la part qui tombe dans le rectangle source) ;
  // molette tight: false = le sprite entier, comme avant. Le blit ne change pas.
  let b = { x0: dx, y0: dy, x1: dx + dw, y1: dy + dh };
  if (LIGHT_LAYER.tight !== false) {
    const ox = sw == null ? 0 : sx, oy = sw == null ? 0 : sy;
    const kx = sw == null ? dw / mask.cv.width : dw / sw, ky = sw == null ? dh / mask.cv.height : dh / sh;
    const u0 = Math.max(mask.u0, ox), v0 = Math.max(mask.v0, oy);
    const u1 = Math.min(mask.u1, sw == null ? mask.cv.width : sx + sw), v1 = Math.min(mask.v1, sw == null ? mask.cv.height : sy + sh);
    if (!(u1 > u0 && v1 > v0)) return;           // aucun pixel allumé dans la source
    b = litBox(dx, dy, kx, ky, u0 - ox, v0 - oy, u1 - ox, v1 - oy);
  }
  const lc = lightCtx(b.x0, b.y0, b.x1, b.y1);
  if (!lc) return;
  lc.save();
  lc.globalAlpha = night * EMISSIVE.k * kMul;
  lc.imageSmoothingEnabled = false;
  if (sw == null) lc.drawImage(mask.cv, dx, dy, dw, dh);
  else lc.drawImage(mask.cv, sx, sy, sw, sh, dx, dy, dw, dh);
  lc.restore();
}
if (typeof window !== 'undefined') {
  // Molette : __emissive({ on, k, mix, house: { 7: 0.45 } }) — k = intensité, mix = part
  // de couleur pure, house = part laissée aux maisons par bande.
  window.__emissive = (o) => {
    if (o && typeof o === 'object') {
      const { house, ...rest } = o;
      Object.assign(EMISSIVE, rest);
      if (house) Object.assign(EMISSIVE_HOUSE, house);
    }
    return { ...EMISSIVE, house: { ...EMISSIVE_HOUSE } };
  };
}
