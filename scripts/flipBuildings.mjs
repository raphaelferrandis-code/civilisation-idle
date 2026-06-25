// Correction de la DIRECTION DE LUMIÈRE des sprites de bâtiments PixelLab.
// Convention carte : lumière en HAUT-GAUCHE → ombres en BAS-DROITE (cf mémoire
// map-lighting-shadow-direction). Le 1er lot PixelLab a l'ombre du mauvais côté.
//   Sauvegarde les PNG d'origine dans _orig/ (une fois), puis applique une
//   transformation DEPUIS _orig/ → fichier live (rejouable avec un autre mode).
//   mode : 'h' (miroir horizontal, défaut) | 'v' (vertical) | 'hv' (180°).
//   filtre : sous-chaîne de nom (ex. 'granaries') pour ne traiter QUE ces sprites.
//   Lancer : node scripts/flipBuildings.mjs [h|v|hv] [filtre]
//   Ex     : node scripts/flipBuildings.mjs h granaries
import { PNG } from 'pngjs';
import fs from 'node:fs';
import path from 'node:path';

const DIR = 'public/pixelart/buildings';
const ORIG = path.join(DIR, '_orig');
const mode = process.argv[2] || 'h';
const filter = process.argv[3] || '';
const FILES = fs.readdirSync(DIR)
  .filter((f) => f.endsWith('.png') && f.includes(filter))
  .map((f) => f.replace(/\.png$/, ''));

fs.mkdirSync(ORIG, { recursive: true });
const fh = mode.includes('h'), fv = mode.includes('v');
for (const name of FILES) {
  const live = path.join(DIR, name + '.png');
  const orig = path.join(ORIG, name + '.png');
  if (!fs.existsSync(orig)) fs.copyFileSync(live, orig); // pristine une seule fois
  const png = PNG.sync.read(fs.readFileSync(orig));
  const W = png.width, H = png.height;
  const out = new PNG({ width: W, height: H });
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
    const sx = fh ? W - 1 - x : x;
    const sy = fv ? H - 1 - y : y;
    const si = (sy * W + sx) * 4, di = (y * W + x) * 4;
    out.data[di] = png.data[si]; out.data[di + 1] = png.data[si + 1];
    out.data[di + 2] = png.data[si + 2]; out.data[di + 3] = png.data[si + 3];
  }
  fs.writeFileSync(live, PNG.sync.write(out));
  console.log(name, '→', mode);
}
console.log('OK — originaux préservés dans', ORIG);
