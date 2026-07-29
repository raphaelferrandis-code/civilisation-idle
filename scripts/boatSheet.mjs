// Planche-contact des bateaux iso (audit visuel des 8 rotations).
// Une ligne par bateau, ses 8 secteurs en colonnes dans l'ordre du cap écran
// (est → sud-est → sud → …, celui de boatSector dans isoRenderer). Une rotation
// ratée, un sprite décentré ou une échelle qui décroche se voient d'un coup.
// Les MÉTIERS sont séparés par une bande : marchands (l'Histoire du port),
// plaisance (les trois âges), pêche (l'intemporel).
//   Sortie : .preview-shots/boats-iso.png (gitignoré). Lancer :
//     node scripts/boatSheet.mjs
import { PNG } from 'pngjs';
import fs from 'node:fs';

const DIR = 'public/pixelart/iso';
const OUT = '.preview-shots';
// Même ordre que BOAT_SECTORS (isoRenderer) : le cap tourne dans le sens des
// aiguilles depuis l'est, donc la planche se lit comme une rose des vents.
const SECTORS = ['east', 'southeast', 'south', 'southwest', 'west', 'northwest', 'north', 'northeast'];
const GROUPS = [
  { label: 'marchands', names: ['raft', 'sail', 'steam', 'container'] },
  { label: 'plaisance', names: ['rowboat', 'dinghy', 'motorboat'] },
  // Le pêcheur a DEUX poses : canne tendue à l'ancre, canne rangée en route.
  { label: 'peche', names: ['fisher', 'fisher-row'] },
];
const GAP = 4, SEP = 14, BG = [26, 30, 38];

fs.mkdirSync(OUT, { recursive: true });

const rows = [];
for (const g of GROUPS) {
  for (const name of g.names) {
    const imgs = SECTORS.map((s) => {
      const f = `${DIR}/boat-${name}-${s}.png`;
      return fs.existsSync(f) ? PNG.sync.read(fs.readFileSync(f)) : null;
    });
    if (imgs.every((i) => !i)) { console.warn('boat', name, '— aucun PNG, ligne sautee'); continue; }
    rows.push({ name, imgs });
  }
  rows.push({ sep: true });
}
rows.pop();                                  // pas de séparateur en fin de planche

const cell = Math.max(...rows.flatMap((r) => (r.imgs || []).filter(Boolean).map((i) => Math.max(i.width, i.height))));
const W = GAP + SECTORS.length * (cell + GAP);
const H = rows.reduce((acc, r) => acc + (r.sep ? SEP : cell + GAP), GAP);
const out = new PNG({ width: W, height: H });
for (let i = 0; i < out.data.length; i += 4) {
  out.data[i] = BG[0]; out.data[i + 1] = BG[1]; out.data[i + 2] = BG[2]; out.data[i + 3] = 255;
}

let y = GAP;
for (const r of rows) {
  if (r.sep) { y += SEP; continue; }
  r.imgs.forEach((img, c) => {
    if (!img) return;
    // Centré dans sa case : une coque plus petite que la case ne doit pas
    // fausser la lecture d'échelle d'une ligne à l'autre.
    const x0 = GAP + c * (cell + GAP) + ((cell - img.width) >> 1);
    const y0 = y + ((cell - img.height) >> 1);
    PNG.bitblt(img, out, 0, 0, img.width, img.height, x0, y0);
  });
  y += cell + GAP;
}
fs.writeFileSync(`${OUT}/boats-iso.png`, PNG.sync.write(out));
console.log('OK —', `${OUT}/boats-iso.png`, `(${W}x${H}, ${rows.filter((r) => !r.sep).length} bateaux)`);
