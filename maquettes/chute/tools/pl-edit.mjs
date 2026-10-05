// Édition PixelLab par lot (REST v2 /edit-images-v2), sans passer le base64 par MCP.
// usage : node pl-edit.mjs <dossierSortie> <taille> "<consigne>" <png...> [--seed N]
// Chaque PNG est posé dans un carré <taille>×<taille> (pieds en bas, centré), le lot
// part en UN job, puis chaque résultat est rogné à la boîte de départ et écrit
// <dossierSortie>/<nom>.png (+ <nom>.raw.png = le carré complet rendu).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/Hardware31/Desktop/Civilisation idle/CE 0.3/package.json');
const { PNG } = require('pngjs');

const args = process.argv.slice(2);
let seed = null;
const si = args.indexOf('--seed');
if (si >= 0) { seed = +args[si + 1]; args.splice(si, 2); }
const [outDir, sizeS, prompt, ...files] = args;
const S = +sizeS;
fs.mkdirSync(outDir, { recursive: true });
const KEY = process.env.PIXELLAB_API_KEY;
const API = 'https://api.pixellab.ai/v2';

const placed = files.map((f) => {
  const src = PNG.sync.read(fs.readFileSync(f));
  if (src.width > S || src.height > S) throw new Error(`${f} ${src.width}x${src.height} > ${S}`);
  const dst = new PNG({ width: S, height: S });
  const ox = Math.floor((S - src.width) / 2), oy = S - src.height;
  PNG.bitblt(src, dst, 0, 0, src.width, src.height, ox, oy);
  return { f, name: path.basename(f, '.png'), w: src.width, h: src.height, ox, oy, b64: PNG.sync.write(dst).toString('base64') };
});

const body = {
  method: 'edit_with_text',
  edit_images: placed.map((p) => ({ image: { type: 'base64', base64: p.b64, format: 'png' }, width: S, height: S })),
  image_size: { width: S, height: S },
  description: prompt,
  no_background: true,
  ...(seed != null ? { seed } : {}),
};
const r = await fetch(API + '/edit-images-v2', { method: 'POST', headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const j = await r.json();
if (!r.ok) { console.error('ERREUR', r.status, JSON.stringify(j).slice(0, 800)); process.exit(1); }
const id = j.background_job_id;
console.log('job', id);
let res;
for (let k = 0; k < 120; k += 1) {
  await new Promise((ok) => setTimeout(ok, 5000));
  const q = await fetch(API + '/background-jobs/' + id, { headers: { Authorization: 'Bearer ' + KEY } });
  res = await q.json();
  if (res.status === 'completed' || res.status === 'failed') break;
}
if (res.status !== 'completed') { console.error('ÉCHEC', JSON.stringify(res).slice(0, 800)); process.exit(1); }
const lr = res.last_response || {};
fs.writeFileSync(path.join(outDir, '_last_response.json'), JSON.stringify(lr, (k, v) => (typeof v === 'string' && v.length > 200 ? v.slice(0, 60) + '…' : v), 1));
const imgs = lr.images || lr.edited_images || lr.output_images || [];
console.log('images', imgs.length, 'usage', JSON.stringify(res.usage || j.usage));
imgs.forEach((im, i) => {
  const p = placed[i];
  if (!p) return;
  const b64 = (im.base64 || im.image?.base64 || im).toString().replace(/^data:image\/\w+;base64,/, '');
  const buf = Buffer.from(b64, 'base64');
  fs.writeFileSync(path.join(outDir, p.name + '.raw.png'), buf);
});
