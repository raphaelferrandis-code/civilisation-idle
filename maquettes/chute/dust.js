// POUSSIÈRE D'EFFONDREMENT — un sprite animé dessiné AU PIXEL, pas des particules.
//
// Chaque bâtiment qui tombe lève UN nuage : une douzaine de volutes rondes à bords
// francs, ombrées comme le reste de la carte (lumière en haut à gauche : clair en
// haut à gauche, croissant d'ombre en bas à droite), cernées d'un liseré d'un pixel
// autour de la masse. Le nuage ENFLE jusqu'à couvrir le bâtiment (c'est lui qui
// cache l'instant où le sprite debout cède la place à la ruine), tient, puis chaque
// volute rapetisse en montant et disparaît : pas de fondu, pas de tramage.
//
// Le canvas est dessiné dans l'unité de pixel du SPRITE du bâtiment : posé à la même
// échelle que lui, il a exactement son grain.

export const DUST_FRAMES = 18;
const cache = new Map();

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
const mix = (a, b, k) => [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * k));
const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

// Teintes du nuage : la matière du bâtiment (couleur moyenne des murs), très
// ramenée vers une poussière claire et neutre.
export function dustPalette(rgb) {
  const base = mix(rgb, [204, 194, 176], 0.72);
  return {
    hi: mix(base, [242, 236, 224], 0.5),
    mid: base,
    lo: mix(base, [96, 86, 80], 0.3),
    line: mix(base, [52, 44, 42], 0.58),
  };
}

// w, h : emprise d'encre du bâtiment (px sprite). seed : tirage par bâtiment.
// f : image 0..DUST_FRAMES-1. Renvoie { c, ax, ay } — canvas et point d'ancrage
// (pied du bâtiment, au centre) dans le canvas.
export function dustFrame(w, h, seed, pal, f) {
  const key = w + 'x' + h + ':' + seed + ':' + pal.mid.join(',') + ':' + f;
  const hit = cache.get(key);
  if (hit) return hit;
  const R = rng(seed);
  const n = 7 + Math.floor(R() * 4);
  const puffs = [];
  for (let i = 0; i < n; i += 1) {
    const u = Math.pow(R(), 1.5);                          // surtout près du pied
    const side = (i + 0.5) / n + (R() - 0.5) * 0.2;
    puffs.push({
      x: (side - 0.5) * w * (1.05 + 0.25 * (1 - u)),
      y: -u * h * 0.78,
      // au pied, la poussière roule au sol : volutes écrasées, plus larges que hautes
      ax: 1.3 - 0.3 * u, ay: 0.74 + 0.26 * u,
      r: (0.16 + R() * 0.11 + (1 - u) * 0.08) * w,
      delay: u * 0.1 + R() * 0.06,
      life: 0.75 + R() * 0.25,
      rise: (0.12 + R() * 0.2) * h,
      spread: (side - 0.5) * w * (0.25 + R() * 0.2),
    });
  }
  // Volutes du haut d'abord, celles du pied ensuite (elles passent devant).
  puffs.sort((a, b) => a.y - b.y);
  const p = f / (DUST_FRAMES - 1);
  const W = Math.ceil(w * 2.1) + 6, H = Math.ceil(h * 1.4 + w * 0.6) + 6;
  const ax = Math.floor(W / 2), ay = H - Math.ceil(w * 0.22) - 3;
  const id = new Uint8ClampedArray(W * H * 4);
  const mask = new Uint8Array(W * H);
  const put = (x, y, c) => { const o = (y * W + x) * 4; id[o] = c[0]; id[o + 1] = c[1]; id[o + 2] = c[2]; id[o + 3] = 255; mask[y * W + x] = 1; };
  for (const pf of puffs) {
    const q = (p - pf.delay) / pf.life;
    if (q <= 0 || q >= 1) continue;
    // enfle (0 → 0,2), tient (→ 0,42), puis rapetisse jusqu'à rien en montant
    const k = q < 0.2 ? 1 - (1 - q / 0.2) ** 2 : q < 0.42 ? 1 : 1 - smooth((q - 0.42) / 0.58);
    const r = pf.r * (0.3 + 0.7 * k) * (q < 0.42 ? 1 : k);
    if (r < 0.9) continue;
    const cx = ax + pf.x + pf.spread * q, cy = ay + pf.y - pf.rise * q;
    const rx = r * pf.ax, ry = r * pf.ay;
    const x0 = Math.max(0, Math.floor(cx - rx - 1)), x1 = Math.min(W - 1, Math.ceil(cx + rx + 1));
    const y0 = Math.max(0, Math.floor(cy - ry - 1)), y1 = Math.min(H - 1, Math.ceil(cy + ry + 1));
    for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) {
      const dx = (x + 0.5 - cx) / pf.ax, dy = (y + 0.5 - cy) / pf.ay;
      if (dx * dx + dy * dy > r * r) continue;
      const hx = dx + r * 0.36, hy = dy + r * 0.4;
      const sx = dx + r * 0.2, sy = dy + r * 0.26;
      let c = pal.mid;
      if (sx * sx + sy * sy > (r * 0.88) * (r * 0.88)) c = pal.lo;
      else if (hx * hx + hy * hy < (r * 0.42) * (r * 0.42)) c = pal.hi;
      put(x, y, c);
    }
  }
  // Liseré d'un pixel autour de la masse (comme les sprites du jeu).
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
    if (!mask[y * W + x]) continue;
    if (x === 0 || y === 0 || x === W - 1 || y === H - 1
      || !mask[y * W + x - 1] || !mask[y * W + x + 1] || !mask[(y - 1) * W + x] || !mask[(y + 1) * W + x]) {
      const o = (y * W + x) * 4; id[o] = pal.line[0]; id[o + 1] = pal.line[1]; id[o + 2] = pal.line[2];
    }
  }
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  c.getContext('2d').putImageData(new ImageData(id, W, H), 0, 0);
  const out = { c, ax, ay };
  cache.set(key, out);
  if (cache.size > 6000) cache.clear();
  return out;
}
