// TEMPORAIRE — réchauffe une tuile de sol (retire le voile lavande PixelLab) en
// recentrant la moyenne RGB des pixels opaques vers une teinte cible chaude, tout
// en préservant l'amplitude (contraste des joints). Même méthode que retintWater.
// Lancer : node scripts/_warmTile.mjs <png> <rr,gg,bb> [amp]   — À SUPPRIMER après.
import fs from 'node:fs';
import { PNG } from 'pngjs';

const [file, targetCsv, ampArg] = process.argv.slice(2);
if (!file || !targetCsv) { console.error('usage: node scripts/_warmTile.mjs <png> <r,g,b> [amp]'); process.exit(1); }
const T = targetCsv.split(',').map((n) => parseInt(n, 10));
const AMP = parseFloat(ampArg || '1.0');
const png = PNG.sync.read(fs.readFileSync(file));

let mr = 0, mg = 0, mb = 0, n = 0;
for (let i = 0; i < png.data.length; i += 4) { if (png.data[i + 3] < 128) continue; mr += png.data[i]; mg += png.data[i + 1]; mb += png.data[i + 2]; n++; }
mr /= n; mg /= n; mb /= n;
const cl = (v) => Math.max(0, Math.min(255, Math.round(v)));
for (let i = 0; i < png.data.length; i += 4) {
  if (png.data[i + 3] < 128) continue;
  png.data[i] = cl(T[0] + (png.data[i] - mr) * AMP);
  png.data[i + 1] = cl(T[1] + (png.data[i + 1] - mg) * AMP);
  png.data[i + 2] = cl(T[2] + (png.data[i + 2] - mb) * AMP);
}
fs.writeFileSync(file, PNG.sync.write(png));
console.log('warmed', file, '→ mean', [mr, mg, mb].map((v) => v | 0), '→ target', T, 'amp', AMP);
