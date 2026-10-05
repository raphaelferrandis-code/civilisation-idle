// RUINES DE LA CHUTE — range les ruines générées dans public/pixelart/ruins/ et
// régénère src/game/map/ruinArt.js (docs/PLAN-CHUTE.md).
//
// usage : node scripts/buildRuins.mjs <job.json>
// job.json : [{ kind: 'house'|'prop', key, src, raw, ox, oy }]
//   src : le sprite d'origine (houses/<clé>.png ou agents/buildings/<clé>.png)
//   raw : la ruine telle que PixelLab l'a rendue (même cadre que l'original, posé en ox, oy)
//
// Pour chaque ruine :
//   - alpha binarisé (pixel net, pas de demi-teinte au bord) ;
//   - toute couleur à ≤ 18 de la palette de l'ORIGINAL y est ramenée : la teinte par
//     tuile du jeu (housePalette, rowVariants) est un remplacement EXACT de couleurs,
//     elle s'applique alors à la ruine comme à la maison debout ;
//   - îlots de ≤ 3 px retirés (poussière d'encre parasite) ;
//   - recadrage sur l'encre ; on note où tombe le coin (0,0) de l'original dans la ruine.
// L'index `public/pixelart/ruins/offsets.json` est la source de vérité, le module JS
// en est la copie importable (aucun fetch au runtime).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public/pixelart/ruins');
const INDEX = path.join(OUT, 'offsets.json');

function snapAndClean(orig, ruin) {
  const pal = new Map();
  for (let i = 0; i < orig.data.length; i += 4) {
    if (orig.data[i + 3] > 8) pal.set((orig.data[i] << 16) | (orig.data[i + 1] << 8) | orig.data[i + 2], [orig.data[i], orig.data[i + 1], orig.data[i + 2]]);
  }
  const P = [...pal.values()];
  const d = ruin.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 128) { d[i] = d[i + 1] = d[i + 2] = d[i + 3] = 0; continue; }
    d[i + 3] = 255;
    let best = 1e9, bc = null;
    for (const c of P) {
      const e = (c[0] - d[i]) ** 2 + (c[1] - d[i + 1]) ** 2 + (c[2] - d[i + 2]) ** 2;
      if (e < best) { best = e; bc = c; }
    }
    if (bc && best <= 18 * 18) { d[i] = bc[0]; d[i + 1] = bc[1]; d[i + 2] = bc[2]; }
  }
  const W = ruin.width, H = ruin.height, seen = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const s = y * W + x;
    if (seen[s] || !d[s * 4 + 3]) continue;
    const comp = [s]; seen[s] = 1;
    for (let q = 0; q < comp.length && comp.length <= 3; q++) {
      const cx = comp[q] % W, cy = (comp[q] / W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const n = ny * W + nx;
        if (!seen[n] && d[n * 4 + 3]) { seen[n] = 1; comp.push(n); }
      }
    }
    if (comp.length <= 3) for (const c of comp) d[c * 4 + 3] = 0;
  }
}

function crop(png) {
  let x0 = png.width, y0 = png.height, x1 = -1, y1 = -1;
  for (let y = 0; y < png.height; y++) for (let x = 0; x < png.width; x++) {
    if (png.data[(y * png.width + x) * 4 + 3]) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  }
  if (x1 < 0) return null;
  const out = new PNG({ width: x1 - x0 + 1, height: y1 - y0 + 1 });
  PNG.bitblt(png, out, x0, y0, out.width, out.height, 0, 0);
  return { png: out, x0, y0 };
}

const jobs = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const index = fs.existsSync(INDEX) ? JSON.parse(fs.readFileSync(INDEX, 'utf8')) : { houses: {}, props: {} };
for (const j of jobs) {
  const orig = PNG.sync.read(fs.readFileSync(j.src));
  const ruin = PNG.sync.read(fs.readFileSync(j.raw));
  snapAndClean(orig, ruin);
  const c = crop(ruin);
  if (!c) { console.warn('ruine vide, ignorée :', j.key); continue; }
  const dir = path.join(OUT, j.kind === 'house' ? 'houses' : 'props');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, j.key + '.png'), PNG.sync.write(c.png));
  // Coin (0,0) de l'original, en px de la ruine recadrée.
  const ox = (j.ox | 0) - c.x0, oy = (j.oy | 0) - c.y0;
  index[j.kind === 'house' ? 'houses' : 'props'][j.key] = [ox, oy];
  console.log(j.kind, j.key, c.png.width + 'x' + c.png.height, 'origine', ox, oy);
}
const sortObj = (o) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));
index.houses = sortObj(index.houses);
index.props = sortObj(index.props);
fs.writeFileSync(INDEX, JSON.stringify(index, null, 1) + '\n');

const js = `// GÉNÉRÉ par scripts/buildRuins.mjs depuis public/pixelart/ruins/offsets.json — ne pas éditer.
// Les RUINES DESSINÉES de la Chute (docs/PLAN-CHUTE.md) : pour chaque sprite qui en a
// une, [ox, oy] = où tombe le coin (0,0) du sprite d'origine dans l'image de la ruine.
// Images : /pixelart/ruins/houses/<clé>.png (habitations), /pixelart/ruins/props/<clé>.png
// (bâtiments des scènes moteur, clé de prop après substitution « -grand »).
// Un sprite absent d'ici tombe quand même : il est ARASÉ (iso/isoChute.js, repli).
export const RUIN_HOUSES = ${JSON.stringify(index.houses, null, 1)};
export const RUIN_PROPS = ${JSON.stringify(index.props, null, 1)};
`;
fs.writeFileSync(path.join(ROOT, 'src/game/map/ruinArt.js'), js);
console.log('ruinArt.js :', Object.keys(index.houses).length, 'habitations,', Object.keys(index.props).length, 'props');
