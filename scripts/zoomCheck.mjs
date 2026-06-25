// Upscale ×N (nearest-neighbor) de sprites pour inspection fine → _zoom/<name>.png
//   node scripts/zoomCheck.mjs <name-sans-ext> [autres...]
import { PNG } from 'pngjs';
import fs from 'node:fs';
import path from 'node:path';

const DIR = 'public/pixelart/buildings';
const OUT = path.join(DIR, '_zoom');
const SC = 5;
fs.mkdirSync(OUT, { recursive: true });
for (const name of process.argv.slice(2)) {
  const png = PNG.sync.read(fs.readFileSync(path.join(DIR, name + '.png')));
  const W = png.width, H = png.height;
  const out = new PNG({ width: W * SC, height: H * SC });
  for (let y = 0; y < H * SC; y += 1) for (let x = 0; x < W * SC; x += 1) {
    const si = (((y / SC) | 0) * W + ((x / SC) | 0)) * 4, di = (y * W * SC + x) * 4;
    out.data[di] = png.data[si]; out.data[di + 1] = png.data[si + 1];
    out.data[di + 2] = png.data[si + 2]; out.data[di + 3] = png.data[si + 3];
  }
  fs.writeFileSync(path.join(OUT, name + '.png'), PNG.sync.write(out));
  console.log('zoom', name);
}
