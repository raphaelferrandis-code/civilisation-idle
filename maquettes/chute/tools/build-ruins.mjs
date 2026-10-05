// Range les ruines générées dans art/ruines/<bande>/ + manifest.json.
// - alpha binarisé (pixel net), couleurs proches de la palette de l'original
//   ramenées SUR elle (le tint par tuile du jeu se transpose alors au pixel près) ;
// - houses : clé de sprite → { file, ox, oy } (ox, oy = position de l'original dans la ruine)
// - engines : empreinte du canvas de scène → { file, ox, oy }
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/Hardware31/Desktop/Civilisation idle/CE 0.3/package.json');
const { PNG } = require('pngjs');
const ART = 'maquettes/chute/art';
const HOUSES = 'public/pixelart/houses';
const band = process.argv[2] || 'b4';
const outDir = path.join(ART, 'ruines', band);
fs.mkdirSync(outDir, { recursive: true });
const manPath = path.join(ART, 'ruines', 'manifest.json');
const man = fs.existsSync(manPath) ? JSON.parse(fs.readFileSync(manPath, 'utf8')) : { houses: {}, engines: {} };

function snap(orig, ruin, ox, oy) {
  const pal = new Map();
  for (let i = 0; i < orig.data.length; i += 4) if (orig.data[i + 3] > 8) pal.set((orig.data[i] << 16) | (orig.data[i + 1] << 8) | orig.data[i + 2], [orig.data[i], orig.data[i + 1], orig.data[i + 2]]);
  const P = [...pal.values()];
  const d = ruin.data;
  let snapped = 0, kept = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 128) { d[i] = d[i + 1] = d[i + 2] = d[i + 3] = 0; continue; }
    d[i + 3] = 255;
    let best = 1e9, bc = null;
    for (const c of P) { const e = (c[0] - d[i]) ** 2 + (c[1] - d[i + 1]) ** 2 + (c[2] - d[i + 2]) ** 2; if (e < best) { best = e; bc = c; } }
    if (bc && best <= 18 * 18) { d[i] = bc[0]; d[i + 1] = bc[1]; d[i + 2] = bc[2]; snapped += 1; } else kept += 1;
  }
  // îlots isolés (≤ 3 px) : poussière d'encre parasite
  const W = ruin.width, H = ruin.height, seen = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const s = y * W + x; if (seen[s] || !d[s * 4 + 3]) continue;
    const comp = [s]; seen[s] = 1;
    for (let q = 0; q < comp.length && comp.length <= 3; q++) {
      const cx = comp[q] % W, cy = (comp[q] / W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const n = ny * W + nx; if (!seen[n] && d[n * 4 + 3]) { seen[n] = 1; comp.push(n); }
      }
    }
    if (comp.length <= 3) for (const c of comp) d[c * 4 + 3] = 0;
  }
  return { snapped, kept };
}

function addHouse(key, rawPath, S) {
  const orig = PNG.sync.read(fs.readFileSync(path.join(HOUSES, key + '.png')));
  const ruin = PNG.sync.read(fs.readFileSync(rawPath));
  const ox = S ? Math.floor((S - orig.width) / 2) : 0, oy = S ? S - orig.height : 0;
  const st = snap(orig, ruin, ox, oy);
  fs.writeFileSync(path.join(outDir, key + '.png'), PNG.sync.write(ruin));
  man.houses[key] = { file: band + '/' + key + '.png', ox, oy, w: ruin.width, h: ruin.height };
  console.log('maison', key, JSON.stringify(st));
}
function addEngine(srcPath, rawPath, S) {
  const name = path.basename(srcPath, '.png');
  const hash = name.split('-').pop();
  const orig = PNG.sync.read(fs.readFileSync(srcPath));
  const ruin = PNG.sync.read(fs.readFileSync(rawPath));
  const ox = S ? Math.floor((S - orig.width) / 2) : 0, oy = S ? S - orig.height : 0;
  const st = snap(orig, ruin, ox, oy);
  fs.writeFileSync(path.join(outDir, name + '.png'), PNG.sync.write(ruin));
  man.engines[hash] = { file: band + '/' + name + '.png', ox, oy, w: ruin.width, h: ruin.height, id: name.split('-').slice(1, -1).join('-') };
  console.log('moteur', name, JSON.stringify(st));
}

const job = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
for (const h of job.houses || []) addHouse(h.key, h.raw, h.S);
for (const e of job.engines || []) addEngine(e.src, e.raw, e.S || 0);
fs.writeFileSync(manPath, JSON.stringify(man, null, 1));
console.log('manifest', Object.keys(man.houses).length, 'maisons', Object.keys(man.engines).length, 'moteurs');
