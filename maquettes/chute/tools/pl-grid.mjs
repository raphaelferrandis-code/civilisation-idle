// Édition PixelLab en GRILLE : plusieurs images posées côte à côte dans UNE image
// (≤ 512 px), éditées en un seul job, puis redécoupées. Chaque cellule garde la taille
// et la position d'origine de son image (aucune mise à l'échelle).
// usage : node pl-grid.mjs <dossierSortie> <cellW> <cellH> <cols> "<consigne>" <png...> [--seed N]
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/Hardware31/Desktop/Civilisation idle/CE 0.3/package.json');
const { PNG } = require('pngjs');
const args = process.argv.slice(2);
let seed = null;
const si = args.indexOf('--seed');
if (si >= 0) { seed = +args[si + 1]; args.splice(si, 2); }
const [outDir, cwS, chS, colsS, prompt, ...files] = args;
const CW = +cwS, CH = +chS, COLS = +colsS;
const ROWS = Math.ceil(files.length / COLS);
const W = CW * COLS, H = CH * ROWS;
fs.mkdirSync(outDir, { recursive: true });
const grid = new PNG({ width: W, height: H });
const cells = files.map((f, i) => {
  const src = PNG.sync.read(fs.readFileSync(f));
  const cx = (i % COLS) * CW + Math.floor((CW - src.width) / 2), cy = Math.floor(i / COLS) * CH + (CH - src.height);
  PNG.bitblt(src, grid, 0, 0, src.width, src.height, cx, cy);
  return { name: path.basename(f, '.png'), w: src.width, h: src.height, cx, cy };
});
fs.writeFileSync(path.join(outDir, '_grid_in.png'), PNG.sync.write(grid));
const KEY = process.env.PIXELLAB_API_KEY, API = 'https://api.pixellab.ai/v2';
const body = {
  method: 'edit_with_text',
  edit_images: [{ image: { type: 'base64', base64: PNG.sync.write(grid).toString('base64'), format: 'png' }, width: W, height: H }],
  image_size: { width: W, height: H }, description: prompt, no_background: true,
  ...(seed != null ? { seed } : {}),
};
const r = await fetch(API + '/edit-images-v2', { method: 'POST', headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const j = await r.json();
if (!r.ok) { console.error('ERREUR', r.status, JSON.stringify(j).slice(0, 800)); process.exit(1); }
console.log('job', j.background_job_id, W + 'x' + H);
let res;
for (let k = 0; k < 160; k += 1) {
  await new Promise((ok) => setTimeout(ok, 5000));
  res = await (await fetch(API + '/background-jobs/' + j.background_job_id, { headers: { Authorization: 'Bearer ' + KEY } })).json();
  if (res.status === 'completed' || res.status === 'failed') break;
}
if (res.status !== 'completed') { console.error('ÉCHEC', JSON.stringify(res).slice(0, 800)); process.exit(1); }
const im = (res.last_response.images || [])[0];
const out = PNG.sync.read(Buffer.from(im.base64, 'base64'));
fs.writeFileSync(path.join(outDir, '_grid_out.png'), PNG.sync.write(out));
console.log('usage', JSON.stringify(res.usage), 'out', out.width + 'x' + out.height);
for (const c of cells) {
  const p = new PNG({ width: c.w, height: c.h });
  PNG.bitblt(out, p, c.cx, c.cy, c.w, c.h, 0, 0);
  fs.writeFileSync(path.join(outDir, c.name + '.raw.png'), PNG.sync.write(p));
}
