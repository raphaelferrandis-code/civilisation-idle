// Agrandisseur plus proche voisin pour MESURE visuelle (portes, fenetres, etages).
// Campagne d'egalisation du grain (docs/PLAN-EGALISATION-GRAIN.md, lot G0).
//
//   node scripts/spriteZoom.mjs <facteur> <dossier_sortie> <png...>
//
// Sort <nom>-x<K>.png : agrandissement xK + reglettes de lecture sur les bords
// gauche (y) et haut (x) — trait ROUGE long = 10 px natifs, gris court = 5.
// Log en console : dimensions natives + bbox d'encre (alpha > 16, meme seuil que
// contentBBox de pixelHouses.js). Ne modifie JAMAIS la source.
import fs from 'fs';
import path from 'path';
import { PNG } from 'pngjs';

const [, , facteurArg, outDir, ...files] = process.argv;
if (!outDir || !files.length) {
  console.error('usage: node scripts/spriteZoom.mjs <facteur> <dossier_sortie> <png...>');
  process.exit(1);
}
const K = Math.max(1, parseInt(facteurArg, 10) || 6);
fs.mkdirSync(outDir, { recursive: true });

function inkBBox(png, seuil) {
  let x0 = png.width, y0 = png.height, x1 = -1, y1 = -1;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      if (png.data[(y * png.width + x) * 4 + 3] > seuil) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return null;
  return { x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

function tick(dst, x, y, major, horizontal) {
  const len = (major ? 3 : 1) * K - Math.floor(K / 2);
  for (let d = 0; d < len; d++) {
    const px = horizontal ? x : x + d;
    const py = horizontal ? y + d : y;
    if (px < 0 || py < 0 || px >= dst.width || py >= dst.height) continue;
    const di = (py * dst.width + px) * 4;
    dst.data[di] = major ? 255 : 160;
    dst.data[di + 1] = major ? 0 : 160;
    dst.data[di + 2] = major ? 0 : 160;
    dst.data[di + 3] = 255;
  }
}

for (const f of files) {
  const src = PNG.sync.read(fs.readFileSync(f));
  const dst = new PNG({ width: src.width * K, height: src.height * K });
  for (let y = 0; y < dst.height; y++) {
    for (let x = 0; x < dst.width; x++) {
      const si = ((Math.floor(y / K) * src.width) + Math.floor(x / K)) * 4;
      const di = (y * dst.width + x) * 4;
      dst.data[di] = src.data[si];
      dst.data[di + 1] = src.data[si + 1];
      dst.data[di + 2] = src.data[si + 2];
      dst.data[di + 3] = src.data[si + 3];
    }
  }
  for (let yn = 0; yn < src.height; yn += 5) tick(dst, 0, yn * K, yn % 10 === 0, false);
  for (let xn = 0; xn < src.width; xn += 5) tick(dst, xn * K, 0, xn % 10 === 0, true);
  const base = path.basename(f, '.png');
  fs.writeFileSync(path.join(outDir, `${base}-x${K}.png`), PNG.sync.write(dst));
  const bb = inkBBox(src, 16);
  console.log(`${base}: ${src.width}x${src.height}` +
    (bb ? ` encre ${bb.w}x${bb.h} (x ${bb.x0}..${bb.x0 + bb.w - 1}, y ${bb.y0}..${bb.y0 + bb.h - 1})` : ' VIDE'));
}
