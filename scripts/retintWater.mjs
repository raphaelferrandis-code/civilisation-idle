// retintWater.mjs — reteinte la tuile d'eau du fleuve (public/pixelart/water/water.png).
//   Refonte « wahou » 2026-07-02 (réfs de Raph) : ardoise #243F50 → teal vif,
//   en RECENTRANT la moyenne sur la cible et en scalant l'amplitude des
//   ondulations (même méthode que la recolor navy→ardoise d'origine, cf.
//   mémoire pixelart-river-migration ; PAS de remap luminance→gradient).
//   L'original est archivé une fois dans public/pixelart/_archive/ (gitignoré).
//
//   Lancer : node scripts/retintWater.mjs [--target 2f7386] [--amp 1.3]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const FILE = path.join(ROOT, 'public', 'pixelart', 'water', 'water.png');
const ARCHIVE_DIR = path.join(ROOT, 'public', 'pixelart', '_archive');
const ARCHIVE = path.join(ARCHIVE_DIR, 'water-ardoise-src.png');

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const targetHex = opt('--target', '2f7386').replace(/^#/, '');
const AMP = parseFloat(opt('--amp', '1.3'));
const T = [parseInt(targetHex.slice(0, 2), 16), parseInt(targetHex.slice(2, 4), 16), parseInt(targetHex.slice(4, 6), 16)];

// Archive l'original UNE fois (la reteinte est idempotente : on repart TOUJOURS
// de l'archive si elle existe → relancer avec d'autres réglages ne dérive pas).
fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
if (!fs.existsSync(ARCHIVE)) fs.copyFileSync(FILE, ARCHIVE);
const png = PNG.sync.read(fs.readFileSync(ARCHIVE));

const n = png.width * png.height;
let mr = 0, mg = 0, mb = 0;
for (let i = 0; i < png.data.length; i += 4) { mr += png.data[i]; mg += png.data[i + 1]; mb += png.data[i + 2]; }
mr /= n; mg /= n; mb /= n;
const cl = (v) => Math.max(0, Math.min(255, Math.round(v)));
for (let i = 0; i < png.data.length; i += 4) {
  png.data[i] = cl(T[0] + (png.data[i] - mr) * AMP);
  png.data[i + 1] = cl(T[1] + (png.data[i + 1] - mg) * AMP);
  png.data[i + 2] = cl(T[2] + (png.data[i + 2] - mb) * AMP);
}
fs.writeFileSync(FILE, PNG.sync.write(png));
console.log(`water.png reteintée : moyenne ${cl(mr)},${cl(mg)},${cl(mb)} → #${targetHex}, amplitude ×${AMP}`);
