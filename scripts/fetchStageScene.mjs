// fetchStageScene.mjs — range un objet PixelLab en scène de bâtiment-moteur à un STADE
// donné (images posées par blitProp / drawStagePix, pas par la tour cosmique) :
// public/pixelart/agents/buildings/<clé>.png, au canevas EXACT de l'image qu'elle remplace.
//
// ⚠ blitProp ÉTIRE le canevas sur sa fraction de boîte, sans garder le rapport : la
// nouvelle image doit donc avoir LE MÊME canevas que l'ancienne (112×88, 96×96, ou
// 176×160 pour les grandes halles) et la même façon de le remplir — l'encre presque
// pleine, centrée, pied à quelques pixels du bas (mesuré sur la série de la bande 6 :
// 3 à 15 px pour les petites, 8 à 35 pour les grandes).
//
// La rotation PixelLab arrive carrée : on recadre l'encre, on l'écrase ×0,5 si elle a
// été générée au double (`--x2`, moyenne 2×2 en alpha prémultiplié, alpha seuillé — le
// geste de fetchPlazaProp), puis, si elle déborde encore de la zone utile, on la réduit
// par moyenne de surface (facteur proche de 1, la netteté tient après quantize).
//
// `--fit` (à la place de `--x2`) : réduit l'encre au facteur qui REMPLIT la zone utile,
// quel qu'il soit (≤ 1). Un bâtiment-moteur est un repère : la série d'origine remplissait
// 69 à 104 px des 112 du canevas, et une génération étroite (une tour de presse, un
// observatoire) écrasée à ×0,5 tombait à 51-58 px — un tiers plus petite sur son lot que
// la boîte qu'elle remplace.
//
// Usage : node scripts/fetchStageScene.mjs <objectId> <clé> <L>x<H> [--x2|--fit] [--bas=6] [--rot=south-west]
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const args = process.argv.slice(2);
const [id, key, dims] = args.filter((a) => !a.startsWith('--'));
if (!id || !key || !dims) { console.error('usage : <objectId> <clé> <L>x<H> [--x2] [--bas=6] [--rot=…]'); process.exit(1); }
const [W, H] = dims.split('x').map(Number);
const x2 = args.includes('--x2');
const fit = args.includes('--fit');
const bas = Number((args.find((a) => a.startsWith('--bas=')) || '--bas=6').slice(6));
const rot = (args.find((a) => a.startsWith('--rot=')) || '--rot=south-west').slice(6);
const BASE = 'https://backblaze.pixellab.ai/file/pixellab-characters/objects/f1f2e80b-b12d-4940-a5a9-e76f8558b9e0';

const res = await fetch(`${BASE}/${id}/rotations/${rot}.png`);
if (!res.ok) { console.error('échec', res.status); process.exit(1); }
let img = PNG.sync.read(Buffer.from(await res.arrayBuffer()));

const crop = (p) => {
  let x0 = p.width, x1 = -1, y0 = p.height, y1 = -1;
  for (let y = 0; y < p.height; y += 1) for (let x = 0; x < p.width; x += 1) {
    if (p.data[(y * p.width + x) * 4 + 3] < 128) continue;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  const w = x1 - x0 + 1, h = y1 - y0 + 1, o = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    const s = ((y + y0) * p.width + x + x0) * 4, d = (y * w + x) * 4;
    for (let c = 0; c < 4; c += 1) o.data[d + c] = p.data[s + c];
  }
  return o;
};
// Réduction par moyenne de surface (prémultipliée), facteur quelconque ≤ 1.
const shrink = (p, f) => {
  const w = Math.max(1, Math.round(p.width * f)), h = Math.max(1, Math.round(p.height * f));
  const o = new PNG({ width: w, height: h });
  const sx = p.width / w, sy = p.height / h;
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    let r = 0, g = 0, b = 0, a = 0, n = 0;
    for (let yy = Math.floor(y * sy); yy < Math.min(p.height, Math.ceil((y + 1) * sy)); yy += 1) {
      for (let xx = Math.floor(x * sx); xx < Math.min(p.width, Math.ceil((x + 1) * sx)); xx += 1) {
        const i = (yy * p.width + xx) * 4, al = p.data[i + 3] / 255;
        r += p.data[i] * al; g += p.data[i + 1] * al; b += p.data[i + 2] * al; a += al; n += 1;
      }
    }
    const d = (y * w + x) * 4;
    if (a > 0) { o.data[d] = Math.round(r / a); o.data[d + 1] = Math.round(g / a); o.data[d + 2] = Math.round(b / a); }
    o.data[d + 3] = a / n >= 0.5 ? 255 : 0;
  }
  return o;
};

img = crop(img);
if (x2 && !fit) img = shrink(img, 0.5);
// En `--fit`, 4 px de marge par côté : la plus large de la série d'origine (104 sur 112).
const maxW = W - (fit ? 8 : 4), maxH = H - bas - 2;
let f = Math.min(1, maxW / img.width, maxH / img.height);
// ⚠ Un facteur PROCHE de 1 (0,8-1) est le pire : la moyenne de surface ne lâche qu'une
// colonne sur 10 ou 15, irrégulièrement, et l'alpha seuillé fait ONDULER les contours
// (le grand palais de justice à ×0,93 : marches « fondues », arêtes en vagues). On
// descend alors à ×0,75 — un bâtiment un peu moins large, mais des lignes nettes.
if (fit && f > 0.8 && f < 1) f = 0.75;
if (f < 1) img = shrink(img, f);

const out = new PNG({ width: W, height: H });
const ox = Math.round((W - img.width) / 2), oy = H - bas - img.height;
for (let y = 0; y < img.height; y += 1) for (let x = 0; x < img.width; x += 1) {
  const s = (y * img.width + x) * 4;
  if (img.data[s + 3] < 128) continue;
  const d = ((oy + y) * W + ox + x) * 4;
  out.data[d] = img.data[s]; out.data[d + 1] = img.data[s + 1]; out.data[d + 2] = img.data[s + 2]; out.data[d + 3] = 255;
}
const file = path.join('public/pixelart/agents/buildings', key + '.png');
fs.writeFileSync(file, PNG.sync.write(out));
console.log(`${key} ← ${rot}, encre ${img.width}×${img.height} dans ${W}×${H}${f < 1 ? ` (réduite ×${f.toFixed(2)})` : ''}`);
