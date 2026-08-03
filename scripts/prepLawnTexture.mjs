// prepLawnTexture.mjs — assainit une texture de gazon PixelLab pour l'emploi en
// PATTERN répété (gazon du terre-plein, cf. isoRenderer `median-lawn[-winter]`) :
//   1. CROP centré (les bords des gens de 64² portent souvent un liseré sale) ;
//   2. DÉ-GRADIENT vertical ET horizontal (les gens sortent plus sombres en bas
//      → bandes visibles à la répétition) : la moyenne de chaque ligne/colonne
//      est ramenée à la moyenne globale ;
//   3. WRAP-BLEND : fondu croisé de `blend` px avec le bord opposé → raccord
//      invisible au tuilage ;
//   4. RECOLOR optionnel vers une teinte cible (palette du jeu) : out = target +
//      (px − moyenne) · keep — garde le grain, recale la couleur. strength 0 =
//      texture brute.
//   Lancer :  node scripts/prepLawnTexture.mjs <in.png> <out.png> [r,g,b] [keep] [crop]
//   Ex.    :  node scripts/prepLawnTexture.mjs raw.png public/pixelart/iso/median-lawn.png 122,150,82 0.7 56
import fs from 'node:fs';
import { PNG } from 'pngjs';

const [inPath, outPath, targetArg, keepArg, cropArg] = process.argv.slice(2);
if (!inPath || !outPath) { console.error('usage: node scripts/prepLawnTexture.mjs <in> <out> [r,g,b | -] [keep] [crop]'); process.exit(1); }
// `-` = PAS de recolor (permet de passer keep/crop quand même — un argument
// VIDE "" est avalé par PowerShell et décale tout, piège vécu).
const target = targetArg && targetArg !== '-' ? targetArg.split(',').map(Number) : null;
const keep = keepArg === undefined ? 0.7 : Number(keepArg);
const cropN = cropArg === undefined ? 56 : Number(cropArg);
const src = PNG.sync.read(fs.readFileSync(inPath));

// 1. crop centré
const cx0 = (src.width - cropN) >> 1, cy0 = (src.height - cropN) >> 1;
const W = cropN, H = cropN;
const px = new Float64Array(W * H * 3);
for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
  const si = ((cy0 + y) * src.width + (cx0 + x)) * 4, di = (y * W + x) * 3;
  px[di] = src.data[si]; px[di + 1] = src.data[si + 1]; px[di + 2] = src.data[si + 2];
}

// 2. dé-gradient (lignes puis colonnes, par canal)
const mean = [0, 0, 0];
for (let i = 0; i < W * H; i += 1) for (let c = 0; c < 3; c += 1) mean[c] += px[i * 3 + c];
for (let c = 0; c < 3; c += 1) mean[c] /= W * H;
for (let y = 0; y < H; y += 1) {
  const rm = [0, 0, 0];
  for (let x = 0; x < W; x += 1) for (let c = 0; c < 3; c += 1) rm[c] += px[(y * W + x) * 3 + c];
  for (let c = 0; c < 3; c += 1) rm[c] = rm[c] / W - mean[c];
  for (let x = 0; x < W; x += 1) for (let c = 0; c < 3; c += 1) px[(y * W + x) * 3 + c] -= rm[c];
}
for (let x = 0; x < W; x += 1) {
  const cm = [0, 0, 0];
  for (let y = 0; y < H; y += 1) for (let c = 0; c < 3; c += 1) cm[c] += px[(y * W + x) * 3 + c];
  for (let c = 0; c < 3; c += 1) cm[c] = cm[c] / H - mean[c];
  for (let y = 0; y < H; y += 1) for (let c = 0; c < 3; c += 1) px[(y * W + x) * 3 + c] -= cm[c];
}

// 3. wrap-blend des bords (fondu linéaire avec le bord opposé)
const BLEND = 8;
const at = (x, y, c) => px[(((y + H) % H) * W + ((x + W) % W)) * 3 + c];
const out3 = new Float64Array(px);
for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
  const dx = Math.min(x, W - 1 - x), dy = Math.min(y, H - 1 - y);
  const d = Math.min(dx, dy);
  if (d >= BLEND) continue;
  const k = 0.5 - (d / BLEND) * 0.5;            // 0.5 au bord → 0 à BLEND px
  for (let c = 0; c < 3; c += 1) {
    out3[(y * W + x) * 3 + c] = at(x, y, c) * (1 - k) + at(x + W / 2, y + H / 2, c) * k;
  }
}

// 4. recolor vers la cible (optionnel)
const png = new PNG({ width: W, height: H });
for (let i = 0; i < W * H; i += 1) {
  for (let c = 0; c < 3; c += 1) {
    let v = out3[i * 3 + c];
    if (target) v = target[c] + (v - mean[c]) * keep;
    png.data[i * 4 + c] = Math.max(0, Math.min(255, Math.round(v)));
  }
  png.data[i * 4 + 3] = 255;
}
fs.writeFileSync(outPath, PNG.sync.write(png));
console.log(`${outPath}  ${W}x${H}  (moyenne source ${mean.map((m) => m.toFixed(0)).join(',')} → cible ${target ? target.join(',') : 'inchangée'})`);
