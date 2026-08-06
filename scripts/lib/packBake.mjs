/**
 * CUISSON D'UN SPRITE DE PACK — atelier partagé par les imports de packs tiers.
 * ---------------------------------------------------------------------------
 * Les packs achetés ou libres arrivent en canevas larges (64 à 100 px), rendus
 * en 3D, avec des centaines de teintes. Le jeu, lui, dessine des bandes carrées
 * de 20 à 40 px, au plus proche voisin, dans une palette de douze à vingt-quatre
 * couleurs. Entre les deux il y a quatre opérations, toujours les mêmes, et
 * chacune répare une erreur qu'on ne voit qu'à la taille finale :
 *
 *   unionInk      la boîte d'encre est prise sur l'UNION des frames — recadrer
 *                 frame par frame fait trembler le sujet sur place.
 *   areaScale     réduction par moyenne de boîte, couleur pondérée par l'alpha —
 *                 le plus proche voisin, lui, mange une roue (ou une patte) sur
 *                 deux, et une moyenne non pondérée cerne le sujet de noir.
 *   desaturate    la saturation baisse VERS LA LUMINANCE, pas vers le blanc.
 *   quantize      médiane coupée, palette commune à toutes les frames et toutes
 *                 les directions d'un même sujet — une palette par fichier ferait
 *                 changer la teinte quand le sujet tourne.
 *
 * Aucune de ces fonctions ne décide de la TAILLE : c'est à l'appelant, qui seul
 * sait dans quelle boîte le rendu dessinera son sprite.
 */
import fs from 'node:fs';
import { PNG } from 'pngjs';

// Côté de frame à cuire pour un sujet dessiné dans une boîte de
// TILE × zoom × scaleTiles × unitScale pixels : à `zRef` le blit est 1:1.
export function bakeFrameSize(scaleTiles, unitScale, zRef = 2.2, tile = 32) {
  return 2 * Math.round((tile * zRef * scaleTiles * unitScale) / 2);
}

export function unionInk(frames) {
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (const p of frames) {
    for (let y = 0; y < p.height; y++) for (let x = 0; x < p.width; x++) {
      if (p.data[(y * p.width + x) * 4 + 3] < 8) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  return { x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

export function areaScale(src, box, tw, th, alphaCut = 110) {
  const out = new Uint8ClampedArray(tw * th * 4);
  for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
    const sx0 = box.x0 + (x * box.w) / tw, sx1 = box.x0 + ((x + 1) * box.w) / tw;
    const sy0 = box.y0 + (y * box.h) / th, sy1 = box.y0 + ((y + 1) * box.h) / th;
    let r = 0, g = 0, b = 0, a = 0, n = 0;
    for (let sy = Math.floor(sy0); sy < Math.ceil(sy1); sy++) {
      for (let sx = Math.floor(sx0); sx < Math.ceil(sx1); sx++) {
        if (sx < 0 || sy < 0 || sx >= src.width || sy >= src.height) continue;
        const i = (sy * src.width + sx) * 4, w = src.data[i + 3] / 255;
        r += src.data[i] * w; g += src.data[i + 1] * w; b += src.data[i + 2] * w;
        a += src.data[i + 3]; n++;
      }
    }
    if (!n) continue;
    const aw = Math.max(1e-6, a / 255), o = (y * tw + x) * 4;
    // Alpha BINAIRE : l'art du jeu est à 0/255, un bord flou ferait halo au blit.
    out[o] = r / aw; out[o + 1] = g / aw; out[o + 2] = b / aw; out[o + 3] = a / n >= alphaCut ? 255 : 0;
  }
  return out;
}

// Teinte gardée, saturation d'un cran en moins : chaque canal se rapproche de la
// LUMINANCE du pixel — c' = L + (c − L) × sat. Tirer vers le canal le plus fort
// délave au lieu d'assourdir : un bleu vif y devient un bleu PASTEL, plus clair
// qu'avant, exactement ce qu'on ne veut pas sur une carte sourde. Le plafond de
// valeur empêche les blancs purs de brûler au milieu d'un décor sombre.
export function desaturate(buf, sat, vmax) {
  for (let i = 0; i < buf.length; i += 4) {
    if (!buf[i + 3]) continue;
    const r = buf[i], g = buf[i + 1], b = buf[i + 2];
    const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    let nr = L + (r - L) * sat, ng = L + (g - L) * sat, nb = L + (b - L) * sat;
    const mx = Math.max(nr, ng, nb), cap = vmax * 255;
    if (mx > cap) { const k = cap / mx; nr *= k; ng *= k; nb *= k; }
    buf[i] = Math.round(nr); buf[i + 1] = Math.round(ng); buf[i + 2] = Math.round(nb);
  }
}

// Médiane coupée : on coupe la boîte des couleurs sur son axe le plus large,
// jusqu'à K boîtes, et chaque boîte rend sa moyenne. Pas de tramage — à vingt
// pixels de large il ne ferait que du bruit.
function medianCut(pixels, k) {
  let boxes = [pixels];
  while (boxes.length < k) {
    boxes.sort((a, b) => b.length - a.length);
    const box = boxes.find((bx) => bx.length > 1);
    if (!box) break;
    let best = 0, span = -1;
    for (let c = 0; c < 3; c++) {
      let mn = 255, mx = 0;
      for (const p of box) { if (p[c] < mn) mn = p[c]; if (p[c] > mx) mx = p[c]; }
      if (mx - mn > span) { span = mx - mn; best = c; }
    }
    if (span <= 0) break;
    box.sort((a, b) => a[best] - b[best]);
    const half = box.length >> 1;
    boxes = boxes.filter((bx) => bx !== box).concat([box.slice(0, half), box.slice(half)]);
  }
  return boxes.filter((bx) => bx.length).map((bx) => {
    let r = 0, g = 0, b = 0;
    for (const p of bx) { r += p[0]; g += p[1]; b += p[2]; }
    return [Math.round(r / bx.length), Math.round(g / bx.length), Math.round(b / bx.length)];
  });
}

export function quantize(buffers, k) {
  if (!k) return;
  const pixels = [];
  for (const buf of buffers) for (let i = 0; i < buf.length; i += 4) if (buf[i + 3]) pixels.push([buf[i], buf[i + 1], buf[i + 2]]);
  if (pixels.length <= k) return;
  const pal = medianCut(pixels, k);
  const cache = new Map();
  for (const buf of buffers) for (let i = 0; i < buf.length; i += 4) {
    if (!buf[i + 3]) continue;
    const key = (buf[i] << 16) | (buf[i + 1] << 8) | buf[i + 2];
    let hit = cache.get(key);
    if (hit === undefined) {
      let bd = Infinity;
      for (const c of pal) {
        // Pondération perceptuelle grossière (le vert porte la luminance).
        const d = 2 * (c[0] - buf[i]) ** 2 + 4 * (c[1] - buf[i + 1]) ** 2 + 3 * (c[2] - buf[i + 2]) ** 2;
        if (d < bd) { bd = d; hit = c; }
      }
      cache.set(key, hit);
    }
    buf[i] = hit[0]; buf[i + 1] = hit[1]; buf[i + 2] = hit[2];
  }
}

// Pose une image réduite dans une frame carrée : centrée en x, BAS D'ENCRE calé
// sur footFrac. Centrer verticalement ferait flotter le sujet au-dessus de
// l'ombre que le rendu pose, elle, à une fraction fixe de la boîte.
export function placeInFrame(small, tw, th, frame, footFrac) {
  const cell = new Uint8ClampedArray(frame * frame * 4);
  const dx = Math.round((frame - tw) / 2);
  const dy = Math.max(0, Math.round(frame * footFrac) - th);
  for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
    const X = dx + x, Y = dy + y;
    if (X < 0 || Y < 0 || X >= frame || Y >= frame) continue;
    const s = (y * tw + x) * 4, d = (Y * frame + X) * 4;
    cell[d] = small[s]; cell[d + 1] = small[s + 1]; cell[d + 2] = small[s + 2]; cell[d + 3] = small[s + 3];
  }
  return cell;
}

export function writeBand(file, cells, frame, dry) {
  const png = new PNG({ width: frame * cells.length, height: frame });
  cells.forEach((cell, f) => {
    for (let y = 0; y < frame; y++) for (let x = 0; x < frame; x++) {
      const s = (y * frame + x) * 4, d = (y * png.width + f * frame + x) * 4;
      png.data[d] = cell[s]; png.data[d + 1] = cell[s + 1]; png.data[d + 2] = cell[s + 2]; png.data[d + 3] = cell[s + 3];
    }
  });
  if (!dry) fs.writeFileSync(file, PNG.sync.write(png));
}
