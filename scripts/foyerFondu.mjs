/**
 * LE FOYER FONDU DANS LA TERRE — le disque du feu du campement cesse d'être posé.
 * ---------------------------------------------------------------------------
 * Chantier « cohérence de l'univers » (Raph, 2026-09-29) : « pas juste des
 * éléments copiés-collés les uns sur les autres ». Le sol du foyer
 * (`camp-hearth.png`, copie du sol des Conteurs sans le livre) est un disque brun
 * à bord en escalier, cerné d'un anneau sombre et d'une TRANCHE sombre en bas :
 * l'épaisseur d'une estrade. Posé sur la terre battue du camp, il se lisait comme
 * un autocollant, pas comme la terre tassée autour d'un feu.
 *
 * Même geste que le livre et les pixels perdus (scripts/pixelsPerdus.mjs) : on
 * RETIRE des pixels précis, on ne regénère rien (PixelLab est coupé).
 *   - les pixels de DISQUE (corps 168,112,74, anneau 122,74,57, tranche 77,67,56)
 *     à 1 pas du bord extérieur partent tous, à 2 pas un sur deux (damier), à 3
 *     pas un sur quatre : le fondu tramé du pixel art, la terre dessous
 *     transparaît ;
 *   - la TRANCHE part en entier jusqu'à 4 pas : tramée, elle laissait un
 *     pointillé sombre sous le disque ;
 *   - le bord extérieur est l'extérieur RELIÉ au bord de l'image : les trous où
 *     peint le feu (calques complémentaires, cf. pixelsPerdus) ne comptent pas ;
 *   - les accessoires (souches, marmite, coffre, pierres) ne sont jamais touchés,
 *     leurs couleurs ne sont pas celles du disque.
 * L'ALPHA seul est écrit (0), jamais une couleur.
 *
 * ⚠ UN SEUL PASSAGE. Rejoué sur le résultat, il rongerait le disque d'un cran de
 * plus : `--apply` refuse un sprite dont la tranche a déjà disparu du bord.
 *
 * Usage :
 *   node scripts/foyerFondu.mjs                 # mesure seule, n'écrit rien
 *   node scripts/foyerFondu.mjs --apply         # réécrit camp-hearth.png
 *   node scripts/foyerFondu.mjs --proof <png>   # planche avant | après (×6)
 */
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const PROOF = (() => { const i = argv.indexOf('--proof'); return i >= 0 ? argv[i + 1] : null; })();
const FILE = path.join('public', 'pixelart', 'agents', 'buildings', 'camp-hearth.png');

const BODY = '168,112,74', RING = '122,74,57', EDGE = '77,67,56';
const DISC = new Set([BODY, RING, EDGE]);

const p = PNG.sync.read(fs.readFileSync(FILE));
const W = p.width, H = p.height;
const alpha = (x, y) => p.data[(y * W + x) * 4 + 3];
const col = (x, y) => { const i = (y * W + x) * 4; return p.data[i] + ',' + p.data[i + 1] + ',' + p.data[i + 2]; };
const O4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// 1. L'extérieur : les pixels transparents reliés au bord de l'image.
const outside = new Uint8Array(W * H);
const q = [];
const seedOut = (x, y) => { if (!alpha(x, y) && !outside[y * W + x]) { outside[y * W + x] = 1; q.push([x, y]); } };
for (let x = 0; x < W; x += 1) { seedOut(x, 0); seedOut(x, H - 1); }
for (let y = 0; y < H; y += 1) { seedOut(0, y); seedOut(W - 1, y); }
for (let i = 0; i < q.length; i += 1) {
  const [x, y] = q[i];
  for (const [dx, dy] of O4) {
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && ny >= 0 && nx < W && ny < H) seedOut(nx, ny);
  }
}
// 2. Distance (en pas orthogonaux) de chaque pixel opaque à l'extérieur.
const dist = new Int16Array(W * H).fill(-1);
const q2 = [];
for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) if (outside[y * W + x]) { dist[y * W + x] = 0; q2.push([x, y]); }
for (let i = 0; i < q2.length; i += 1) {
  const [x, y] = q2[i];
  for (const [dx, dy] of O4) {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
    const k = ny * W + nx;
    if (dist[k] !== -1 || !alpha(nx, ny)) continue;
    dist[k] = dist[y * W + x] + 1;
    q2.push([nx, ny]);
  }
}

// Garde du passage unique : la tranche longe le bord d'un sprite non traité.
let edgeAtRim = 0;
for (let k = 0; k < W * H; k += 1) if (dist[k] >= 1 && dist[k] <= 2 && col(k % W, (k / W) | 0) === EDGE) edgeAtRim += 1;

// 3. Le fondu.
const before = Buffer.from(p.data);
let cut = 0;
for (let y = 0; y < H; y += 1) {
  for (let x = 0; x < W; x += 1) {
    const k = y * W + x, d = dist[k];
    if (d < 1 || d > 4) continue;
    const c = col(x, y);
    if (!DISC.has(c)) continue;
    const clear = c === EDGE
      || d === 1
      || (d === 2 && ((x + y) & 1) === 0)
      || (d === 3 && (x & 1) === 0 && (y & 1) === 0);
    if (clear) { p.data[k * 4 + 3] = 0; cut += 1; }
  }
}
console.log(`${FILE} : ${cut} pixels de disque rendus à la terre (tranche au bord avant : ${edgeAtRim} px)`);

if (PROOF) {
  const K = 6, GAP = 12, BG = [187, 135, 82];          // ton moyen mesuré de ground-earth
  const b = new PNG({ width: W * K * 2 + GAP, height: H * K });
  for (let i = 0; i < b.width * b.height; i += 1) {
    b.data[i * 4] = BG[0]; b.data[i * 4 + 1] = BG[1]; b.data[i * 4 + 2] = BG[2]; b.data[i * 4 + 3] = 255;
  }
  for (const [src, ox] of [[before, 0], [p.data, W * K + GAP]]) {
    for (let y = 0; y < H * K; y += 1) {
      for (let x = 0; x < W * K; x += 1) {
        const si = (((y / K) | 0) * W + ((x / K) | 0)) * 4;
        if (!src[si + 3]) continue;
        const di = (y * b.width + ox + x) * 4;
        b.data[di] = src[si]; b.data[di + 1] = src[si + 1]; b.data[di + 2] = src[si + 2];
      }
    }
  }
  fs.writeFileSync(PROOF, PNG.sync.write(b));
  console.log('planche →', PROOF);
}

if (APPLY) {
  if (!edgeAtRim) {
    console.error('Refusé : la tranche a déjà quitté le bord — le fondu est déjà appliqué.');
    process.exit(1);
  }
  fs.writeFileSync(FILE, PNG.sync.write(p));
  console.log('écrit.');
} else {
  console.log('Rien écrit (ajouter --apply).');
}
