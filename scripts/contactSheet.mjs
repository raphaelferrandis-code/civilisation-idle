// Planches-contact des bandes de marche d'agents (audit visuel des frames).
// Pour chaque perso : 4 lignes (sud, nord, est, ouest) × ses frames, sur fond
// sombre. Une frame retournée/foireuse se repère d'un coup d'œil dans sa ligne.
//   Sortie : .preview-shots/contact-<band>.png (gitignoré). Lancer :
//     node scripts/contactSheet.mjs
import { PNG } from 'pngjs';
import fs from 'node:fs';

const DIR = 'public/pixelart/agents';
const OUT = '.preview-shots';
const DIRS = ['south', 'north', 'east', 'west'];
const GROUPS = {
  prehistoric: ['caveman', 'cavewoman', 'cavechild'],
  medieval: ['villager', 'villagerwoman', 'villagerchild'],
  antiquity: ['greekman', 'greekwoman', 'greekchild'],
  industrial: ['industrialman', 'industrialwoman', 'industrialchild'],
  future: ['futureman', 'futurewoman', 'futurechild'],
  animals: ['horse', 'ox'],
};
const GAP = 5, BG = [28, 28, 34];

fs.mkdirSync(OUT, { recursive: true });
for (const [band, names] of Object.entries(GROUPS)) {
  const rows = [];
  let maxW = 0, rowH = 0;
  for (const name of names) for (const dir of DIRS) {
    const f = `${DIR}/${name}-${dir}.png`;
    if (!fs.existsSync(f)) continue;
    const img = PNG.sync.read(fs.readFileSync(f));
    rows.push({ img, name });
    maxW = Math.max(maxW, img.width); rowH = Math.max(rowH, img.height);
  }
  if (!rows.length) continue;
  // hauteur = lignes + un gap entre chaque perso
  let groups = 0, last = null;
  for (const r of rows) { if (r.name !== last) groups += 1; last = r.name; }
  const H = rows.length * rowH + groups * GAP;
  const out = new PNG({ width: maxW, height: H });
  for (let i = 0; i < out.data.length; i += 4) { out.data[i] = BG[0]; out.data[i + 1] = BG[1]; out.data[i + 2] = BG[2]; out.data[i + 3] = 255; }
  let y = 0; last = null;
  for (const r of rows) {
    if (last && r.name !== last) y += GAP;
    last = r.name;
    const im = r.img;
    for (let ry = 0; ry < im.height; ry += 1) for (let rx = 0; rx < im.width; rx += 1) {
      const si = ((ry * im.width) + rx) * 4, di = (((y + ry) * maxW) + rx) * 4;
      const a = im.data[si + 3] / 255;
      out.data[di] = Math.round(im.data[si] * a + out.data[di] * (1 - a));
      out.data[di + 1] = Math.round(im.data[si + 1] * a + out.data[di + 1] * (1 - a));
      out.data[di + 2] = Math.round(im.data[si + 2] * a + out.data[di + 2] * (1 - a));
      out.data[di + 3] = 255;
    }
    y += im.height;
  }
  fs.writeFileSync(`${OUT}/contact-${band}.png`, PNG.sync.write(out));
  console.log(`contact-${band}.png  ${maxW}x${H}  (${names.join(', ')} × ${DIRS.join('/')})`);
}
console.log('OK — planches dans', OUT);
