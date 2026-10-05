// RUINES DE LA CHUTE — génération PixelLab (docs/PLAN-CHUTE.md).
//
// Chaque ruine est le sprite du jeu ÉDITÉ (« le même bâtiment, en ruine ») : même
// angle, même cadre, même palette — jamais réduit. Deux façons de remplir une tâche :
//   --mode multi : jusqu'à 16 images ≤ 64 px (ou 4 ≤ 128 px) de même taille, posées
//                  chacune dans un carré <cell> (pied en bas, centré) ;
//   --mode grid  : plusieurs images posées côte à côte dans UNE image ≤ 512 px
//                  (4 monuments 176×160 pour le prix d'un), éditée puis redécoupée.
// Sortie : les ruines brutes dans <dossier>/ et <dossier>/job.json, à passer à
// `node scripts/buildRuins.mjs <dossier>/job.json`.
//
// usage :
//   node scripts/ruinsPixellab.mjs <dossier> --mode multi --cell 64 --kind house --matiere pierre <png…>
//   node scripts/ruinsPixellab.mjs <dossier> --mode grid --cell 176x160 --cols 2 --kind prop --matiere brique <png…>
// Clé API : variable d'environnement PIXELLAB_API_KEY. Seed fixe (--seed, 4242 par défaut).
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const MATIERES = {
  bois: 'timber beams snapped, thatch and planks collapsed, charred wood',
  pierre: 'walls and columns broken off with jagged stepped tops, some columns fallen, fallen stones and broken roof tiles',
  brique: 'brick and stone walls broken off with jagged stepped tops, bent iron beams, fallen bricks and broken slates',
  beton: 'concrete floors pancaked, rebar sticking out, shattered glass panes, fallen concrete slabs',
  cosmique: 'crystal and alloy panels shattered, the frame cracked open, dead lights, shards heaped',
};
const prompt = (kind, mat, many) => (many
  ? 'Every building in this image becomes an abandoned ruin after the fall of the city: roofs caved in and gone, '
  : 'the same building turned into an abandoned ruin after the fall of the city: the roof has caved in and is gone, ')
  + (MATIERES[mat] || MATIERES.pierre)
  + (many ? ' heaped at the foot of each building, dark empty window and door holes. Keep every building exactly in its place with the same footprint'
    : ' heaped at its foot, dark empty window and door holes. Keep the same footprint and position')
  + ', same isometric camera angle, same pixel art style, outline and colour palette. No people, no smoke, no fire, transparent background.'
  + (kind === 'row' ? ' This is one house of a terraced row: keep its left and right party walls in place so it still lines up with its neighbours.' : '');

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); if (i < 0) return d; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const doCrop = argv.includes('--crop');
if (doCrop) argv.splice(argv.indexOf('--crop'), 1);
const mode = opt('mode', 'multi');
const cell = opt('cell', '64');
const cols = +opt('cols', '2');
const kindArg = opt('kind', 'house');
const mat = opt('matiere', 'pierre');
const seed = +opt('seed', '4242');
const [outDir, ...files] = argv;
const [CW, CH] = cell.includes('x') ? cell.split('x').map(Number) : [+cell, +cell];
const kind = kindArg === 'row' ? 'house' : kindArg;
fs.mkdirSync(outDir, { recursive: true });
const KEY = process.env.PIXELLAB_API_KEY;
if (!KEY) { console.error('PIXELLAB_API_KEY absente'); process.exit(1); }
const API = 'https://api.pixellab.ai/v2';

async function run(images, W, H, text) {
  const body = {
    method: 'edit_with_text',
    edit_images: images.map((png) => ({ image: { type: 'base64', base64: PNG.sync.write(png).toString('base64'), format: 'png' }, width: W, height: H })),
    image_size: { width: W, height: H }, description: text, no_background: true, seed,
  };
  const r = await fetch(API + '/edit-images-v2', { method: 'POST', headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error('PixelLab ' + r.status + ' ' + JSON.stringify(j).slice(0, 400));
  for (let k = 0; k < 200; k += 1) {
    await new Promise((ok) => setTimeout(ok, 5000));
    const res = await (await fetch(API + '/background-jobs/' + j.background_job_id, { headers: { Authorization: 'Bearer ' + KEY } })).json();
    if (res.status === 'completed') {
      console.log('tâche', j.background_job_id, 'coût', JSON.stringify(res.usage));
      return (res.last_response.images || []).map((im) => PNG.sync.read(Buffer.from(im.base64, 'base64')));
    }
    if (res.status === 'failed') throw new Error('tâche échouée ' + JSON.stringify(res).slice(0, 400));
  }
  throw new Error('tâche trop longue');
}

// --crop : chaque source est d'abord rognée sur son encre (les sprites de scène ont
// beaucoup de marge transparente) — on en loge davantage par tâche ; (cx0, cy0) = où
// tombait le coin rogné dans l'original, reporté dans le job.


function inkCrop(png) {
  let x0 = png.width, y0 = png.height, x1 = -1, y1 = -1;
  for (let y = 0; y < png.height; y++) for (let x = 0; x < png.width; x++) {
    if (png.data[(y * png.width + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  }
  if (x1 < 0) return { png, cx0: 0, cy0: 0 };
  const out = new PNG({ width: x1 - x0 + 1, height: y1 - y0 + 1 });
  PNG.bitblt(png, out, x0, y0, out.width, out.height, 0, 0);
  return { png: out, cx0: x0, cy0: y0 };
}
const srcs = files.filter((f) => !f.startsWith('--')).map((f) => {
  const png = PNG.sync.read(fs.readFileSync(f));
  const c = doCrop ? inkCrop(png) : { png, cx0: 0, cy0: 0 };
  return { f, key: path.basename(f, '.png'), png: c.png, cx0: c.cx0, cy0: c.cy0 };
});
const job = [];
if (mode === 'grid') {
  const ROWS = Math.ceil(srcs.length / cols), W = CW * cols, H = CH * ROWS;
  const grid = new PNG({ width: W, height: H });
  const cells = srcs.map((s, i) => {
    const cx = (i % cols) * CW + Math.floor((CW - s.png.width) / 2), cy = Math.floor(i / cols) * CH + (CH - s.png.height);
    PNG.bitblt(s.png, grid, 0, 0, s.png.width, s.png.height, cx, cy);
    return { ...s, cx, cy };
  });
  const [out] = await run([grid], W, H, prompt(kindArg, mat, true));
  for (const c of cells) {
    const p = new PNG({ width: c.png.width, height: c.png.height });
    PNG.bitblt(out, p, c.cx, c.cy, c.png.width, c.png.height, 0, 0);
    const raw = path.join(outDir, c.key + '.raw.png');
    fs.writeFileSync(raw, PNG.sync.write(p));
    job.push({ kind, key: c.key, src: c.f, raw, ox: -c.cx0, oy: -c.cy0 });
  }
} else {
  const placed = srcs.map((s) => {
    const dst = new PNG({ width: CW, height: CH });
    const ox = Math.floor((CW - s.png.width) / 2), oy = CH - s.png.height;
    PNG.bitblt(s.png, dst, 0, 0, s.png.width, s.png.height, ox, oy);
    return { ...s, dst, ox, oy };
  });
  const outs = await run(placed.map((p) => p.dst), CW, CH, prompt(kindArg, mat, false));
  outs.forEach((o, i) => {
    const p = placed[i];
    if (!p) return;
    const raw = path.join(outDir, p.key + '.raw.png');
    fs.writeFileSync(raw, PNG.sync.write(o));
    job.push({ kind, key: p.key, src: p.f, raw, ox: p.ox - p.cx0, oy: p.oy - p.cy0 });
  });
}
const jobPath = path.join(outDir, 'job.json');
const prev = fs.existsSync(jobPath) ? JSON.parse(fs.readFileSync(jobPath, 'utf8')) : [];
fs.writeFileSync(jobPath, JSON.stringify([...prev.filter((p) => !job.some((j) => j.key === p.key)), ...job], null, 1));
console.log(job.length, 'ruines brutes →', jobPath);
