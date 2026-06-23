// Sépare herbe / routes des tilesets Wang couplés (PixelLab).
//   Source : public/pixelart/_archive/coupled/ (les tilesets herbe+route couplés)
//   Sorties :
//     public/pixelart/grass.png            ← l'herbe en 1 tuile 32×32 (couche sol)
//     public/pixelart/roads/<band>.png     ← la route sur fond TRANSPARENT (overlay)
//   Méthode : on relève la palette de la tuile « tout-herbe » de chaque tileset
//   et on rend ces couleurs transparentes → il ne reste que la route + son contour.
//   Idempotent : lit toujours depuis _archive/coupled, écrit dans roads/.
//   Lancer : node scripts/separatePixelTerrain.mjs
import { PNG } from 'pngjs';
import fs from 'node:fs';
import path from 'node:path';

const SRC = 'public/pixelart/_archive/coupled';
const DST = 'public/pixelart/roads';
const GRASS_OUT = 'public/pixelart/grass.png';
const MARGIN = 14; // « dominance du vert » : g doit dépasser r ET b de MARGIN.

// Herbe = pixel dont le vert domine nettement (toutes teintes d'herbe), ce qui
// épargne les routes (terre/pavé/béton/néon ne sont jamais vert-dominantes).
const isGrass = (r, g, b) => (g - r > MARGIN) && (g - b > MARGIN);

const files = fs.readdirSync(SRC).filter((f) => f.endsWith('.png'));
let grassDone = false;

for (const f of files) {
  const base = f.replace('.png', '');
  const meta = JSON.parse(fs.readFileSync(path.join(SRC, base + '.json'), 'utf8'));
  const tiles = meta.tileset_data.tiles;
  const ag = tiles.find((t) => t.corners.NW === 'upper' && t.corners.NE === 'upper' && t.corners.SE === 'upper' && t.corners.SW === 'upper');
  const png = PNG.sync.read(fs.readFileSync(path.join(SRC, f)));
  const W = png.width;
  const bx = ag.bounding_box.x, by = ag.bounding_box.y;

  // grass.png (une seule fois) = la tuile tout-herbe de la 1re bande.
  if (!grassDone) {
    const grass = new PNG({ width: 32, height: 32 });
    for (let y = 0; y < 32; y += 1) for (let x = 0; x < 32; x += 1) {
      const si = ((by + y) * W + (bx + x)) * 4, di = (y * 32 + x) * 4;
      grass.data[di] = png.data[si]; grass.data[di + 1] = png.data[si + 1];
      grass.data[di + 2] = png.data[si + 2]; grass.data[di + 3] = 255;
    }
    fs.writeFileSync(GRASS_OUT, PNG.sync.write(grass));
    grassDone = true;
  }

  // Keyer l'herbe → transparent (il reste la route + son contour).
  let keyed = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    if (png.data[i + 3] === 0) continue;
    if (isGrass(png.data[i], png.data[i + 1], png.data[i + 2])) { png.data[i + 3] = 0; keyed += 1; }
  }
  fs.writeFileSync(path.join(DST, f), PNG.sync.write(png));
  fs.copyFileSync(path.join(SRC, base + '.json'), path.join(DST, base + '.json'));
  console.log(base, '— keyed', keyed, 'px');
}
console.log('OK : grass.png + ' + files.length + ' overlays de route écrits dans roads/');
