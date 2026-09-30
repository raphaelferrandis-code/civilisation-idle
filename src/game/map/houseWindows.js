// ── LES FENÊTRES ALLUMÉES LA NUIT ────────────────────────────────────────────
// docs/PLAN-MAQUETTE-VIVANTE.md, lot 4 (audit du 2026-09-30 : « la nuit est belle mais
// AUCUNE fenêtre n'est allumée »). Repris de la branche `passe-visuelle-21-09`, où il
// avait été posé le 2026-09-21 sans verdict de Raph.
//
// Les fenêtres éclairées suivent les pixels des ouvertures du sprite : des taches
// SOMBRES, fermées (elles ne touchent pas le vide), petites, dans la bande des étages.
// Pas de rectangles flottants, pas de halo diffus, aucune modification de l'art. La
// lumière est déposée dans le calque de lumière (lightLayer) : elle s'ajoute APRÈS le
// voile de nuit, comme celle des lampadaires, et deux fenêtres sur cinq s'allument —
// une phase par maison, donc jamais le même motif d'une façade à la voisine.
import { CM, cmHash } from './layout.js';
import { lightCtx } from './lightLayer.js';

const HOMES = new Set(['townhouse', 'stonehouse', 'manor', 'block', 'tenement', 'insula', 'terrace', 'towerhouse',
  'domus', 'taberna', 'villa', 'insula2']);
const masks = new WeakMap();

export function windowPixels(data, width, height) {
  const seen = new Uint8Array(width * height);
  const groups = [];
  const dark = (i) => data[i * 4 + 3] > 240
    && Math.max(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]) < 68;
  for (let i = 0; i < seen.length; i += 1) {
    if (seen[i] || !dark(i)) continue;
    const stack = [i], pixels = [];
    seen[i] = 1;
    let x0 = width, x1 = 0, y0 = height, y1 = 0, open = false;
    while (stack.length) {
      const p = stack.pop(), x = p % width, y = Math.floor(p / width);
      pixels.push(p);
      x0 = Math.min(x0, x); x1 = Math.max(x1, x);
      y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) { open = true; continue; }
        const q = ny * width + nx;
        if (data[q * 4 + 3] < 240) open = true;
        if (!seen[q] && dark(q)) { seen[q] = 1; stack.push(q); }
      }
    }
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    // Écarte contour extérieur, toiture, grandes portes et masses de façade.
    if (!open && y0 > height * 0.3 && y1 < height * 0.88
      && pixels.length >= 3 && w <= 7 && h >= 2 && h <= 12
      && h >= w * 0.65 && pixels.length <= 50) groups.push(pixels);
  }
  return groups;
}

function maskFor(g, phase) {
  let entries = masks.get(g.img);
  if (!entries) { entries = new Map(); masks.set(g.img, entries); }
  const { x0, y0, w, h } = g.bb;
  const key = `${x0}:${y0}:${w}:${h}:${phase}`;
  if (entries.has(key)) return entries.get(key);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(g.img, x0, y0, w, h, 0, 0, w, h);
  const source = ctx.getImageData(0, 0, w, h);
  const out = ctx.createImageData(w, h);
  const groups = windowPixels(source.data, w, h);
  let count = 0;
  groups.forEach((pixels, index) => {
    if ((index * 7 + phase * 3) % 5 > 1) return;
    count += 1;
    for (const p of pixels) {
      out.data[p * 4] = 244; out.data[p * 4 + 1] = 168;
      out.data[p * 4 + 2] = 72; out.data[p * 4 + 3] = 210;
    }
  });
  ctx.putImageData(out, 0, 0);
  const result = count ? canvas : null;
  entries.set(key, result);
  return result;
}

export function drawHouseWindows(t, g) {
  const night = Math.max(0, Math.min(1, ((CM.nightF || 0) - 0.22) / 0.65));
  if (!night || CM.lodActive || !HOMES.has(t.variant) || typeof document === 'undefined') return;
  const mask = maskFor(g, cmHash(`windows:${t.gx}:${t.gy}`) % 5);
  if (!mask) return;
  const ctx = lightCtx(g.dx, g.dy, g.dx + g.dw, g.dy + g.dh);
  if (!ctx) return;
  ctx.save();
  ctx.globalAlpha = night * 0.72 * CM.ctx.globalAlpha;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(mask, g.dx, g.dy, g.dw, g.dh);
  ctx.restore();
}
