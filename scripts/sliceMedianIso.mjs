// sliceMedianIso.mjs — découpe UNE bande de terre-plein diagonale (générée chez
// PixelLab, 256²) en 3 modules tuilables : start (cap début) · mid (période
// répétée) · end (cap fin). Même principe que sliceAqueduct, mais la bande court
// en DIAGONALE écran : on la REDRESSE d'abord à l'horizontale par l'angle iso
// EXACT de sa couture (SE 26.57° = atan2(0.5,1) ; SW 153.43° = atan2(0.5,-1)),
// puis on coupe en X. Le renderer re-pivote par CE MÊME angle → inversion exacte,
// éclairage préservé (chaque orientation part de sa propre source).
//
//   Lancer :  node scripts/sliceMedianIso.mjs <se|sw> [capFrac] [midFrac]
//     lit  public/pixelart/iso/median-<orient>-scene.png
//     écrit median-<orient>-{start,mid,end}.png (+ un aperçu -tiled.png)
//   capFrac (0.18) = fraction de longueur pour chaque cap ; midFrac (0.24) = période.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ISO = path.resolve(HERE, '..', 'public', 'pixelart', 'iso');

// node scripts/sliceMedianIso.mjs <se|sw> [c1Frac] [c2Frac]
//   start = [0, c1] · mid = [c1, c2] (UNE période) · end = [c2, 1]
//   Choisir c1 et c2 sur DEUX CENTRES DE BOULE consécutifs (inspecter
//   median-<orient>-flat.png + sa grille) → les demi-boules des jointures
//   fusionnent en boules entières au tuilage. Défaut 0.30 / 0.57.
const orient = (process.argv[2] || 'se').toLowerCase();
const c1Frac = Number(process.argv[3] || 0.30);
const c2Frac = Number(process.argv[4] || 0.57);

const srcPath = path.join(ISO, `median-${orient}-scene.png`);
if (!fs.existsSync(srcPath)) { console.error('manque', srcPath); process.exit(1); }
const src = PNG.sync.read(fs.readFileSync(srcPath));

// Rotation supersamplée (nearest ×SS puis box-downscale) de `deg` degrés autour du centre.
function rotate(img, deg, SS = 3) {
  const a = deg * Math.PI / 180, cosv = Math.cos(a), sinv = Math.sin(a);
  const W = img.width, H = img.height;
  const D = Math.ceil(Math.hypot(W, H));
  const bw = D * SS, bh = D * SS;
  const big = new PNG({ width: bw, height: bh });
  const cx = W / 2, cy = H / 2, ocx = D / 2, ocy = D / 2;
  for (let Y = 0; Y < bh; Y += 1) {
    for (let X = 0; X < bw; X += 1) {
      const ox = X / SS - ocx, oy = Y / SS - ocy;
      // inverse-rotation pour retrouver la source
      const sx = Math.round(cx + ox * cosv + oy * sinv);
      const sy = Math.round(cy - ox * sinv + oy * cosv);
      const di = (Y * bw + X) * 4;
      if (sx < 0 || sy < 0 || sx >= W || sy >= H) { big.data[di + 3] = 0; continue; }
      const si = (sy * W + sx) * 4;
      big.data[di] = img.data[si]; big.data[di + 1] = img.data[si + 1];
      big.data[di + 2] = img.data[si + 2]; big.data[di + 3] = img.data[si + 3];
    }
  }
  // box-downscale ×1/SS (moyenne, alpha-weighted sur RGB)
  const out = new PNG({ width: D, height: D });
  for (let y = 0; y < D; y += 1) for (let x = 0; x < D; x += 1) {
    let r = 0, g = 0, b = 0, al = 0, n = 0;
    for (let j = 0; j < SS; j += 1) for (let i = 0; i < SS; i += 1) {
      const si = ((y * SS + j) * bw + (x * SS + i)) * 4;
      const aa = big.data[si + 3];
      r += big.data[si] * aa; g += big.data[si + 1] * aa; b += big.data[si + 2] * aa;
      al += aa; n += 1;
    }
    const di = (y * D + x) * 4;
    out.data[di] = al ? Math.round(r / al) : 0;
    out.data[di + 1] = al ? Math.round(g / al) : 0;
    out.data[di + 2] = al ? Math.round(b / al) : 0;
    out.data[di + 3] = Math.round(al / n);
  }
  return out;
}

function trim(img, m = 1) {
  let x0 = img.width, y0 = img.height, x1 = -1, y1 = -1;
  for (let y = 0; y < img.height; y += 1) for (let x = 0; x < img.width; x += 1) {
    if (img.data[(y * img.width + x) * 4 + 3] > 24) {
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return img;
  x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m);
  x1 = Math.min(img.width - 1, x1 + m); y1 = Math.min(img.height - 1, y1 + m);
  const out = new PNG({ width: x1 - x0 + 1, height: y1 - y0 + 1 });
  PNG.bitblt(img, out, x0, y0, out.width, out.height, 0, 0);
  return out;
}

function subX(img, a, z) {
  const w = z - a, out = new PNG({ width: w, height: img.height });
  PNG.bitblt(img, out, a, 0, w, img.height, 0, 0);
  return out;
}

// Angle de l'axe principal du nuage opaque (PCA) → redressement EXACT (fini la
// pente : PixelLab ne dessine pas pile à l'angle iso). Le renderer re-pivote par
// l'angle iso de la COUTURE (constante projection), pas par le PCA — l'écart
// (1-3°) tilte imperceptiblement la végétation mais aligne la bande sur la route.
function pcaAngleDeg(img) {
  let mx = 0, my = 0, n = 0;
  for (let y = 0; y < img.height; y += 1) for (let x = 0; x < img.width; x += 1) {
    if (img.data[(y * img.width + x) * 4 + 3] > 40) { mx += x; my += y; n += 1; }
  }
  mx /= n; my /= n;
  let sxx = 0, sxy = 0, syy = 0;
  for (let y = 0; y < img.height; y += 1) for (let x = 0; x < img.width; x += 1) {
    if (img.data[(y * img.width + x) * 4 + 3] > 40) { const dx = x - mx, dy = y - my; sxx += dx * dx; sxy += dx * dy; syy += dy * dy; }
  }
  return 0.5 * Math.atan2(2 * sxy, sxx - syy) * 180 / Math.PI;
}

// 1) redresse à l'horizontale (PCA), 2) rogne, 3) coupe en start|mid|end.
const pca = pcaAngleDeg(src);
const horiz = trim(rotate(src, -pca));
fs.writeFileSync(path.join(ISO, `median-${orient}-flat.png`), PNG.sync.write(horiz)); // inspection
const W = horiz.width, H = horiz.height;
const c1 = Math.round(c1Frac * W), c2 = Math.round(c2Frac * W);
const pieces = {
  start: subX(horiz, 0, c1),
  mid: subX(horiz, c1, c2),
  end: subX(horiz, c2, W),
};
for (const [k, im] of Object.entries(pieces)) {
  fs.writeFileSync(path.join(ISO, `median-${orient}-${k}.png`), PNG.sync.write(im));
  console.log(`median-${orient}-${k}.png  ${im.width}x${im.height}`);
}

// Aperçu : start + mid×4 + end posés bout-à-bout (doit lire comme une bande continue).
{
  const tiles = [pieces.start, pieces.mid, pieces.mid, pieces.mid, pieces.mid, pieces.end];
  const totW = tiles.reduce((s, t) => s + t.width, 0);
  const prev = new PNG({ width: totW, height: H });
  let ox = 0;
  for (const t of tiles) { PNG.bitblt(t, prev, 0, 0, t.width, t.height, ox, 0); ox += t.width; }
  fs.writeFileSync(path.join(ISO, `median-${orient}-tiled.png`), PNG.sync.write(prev));
  console.log(`aperçu median-${orient}-tiled.png  ${totW}x${H} (PCA redressé ${(-pca).toFixed(1)}° ; W=${W} ; coupes ${c1}/${c2})`);
}
