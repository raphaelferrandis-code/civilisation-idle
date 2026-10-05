// node crop.mjs <in.png> <out.png> x y w h [échelle entière]
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/Hardware31/Desktop/Civilisation idle/CE 0.3/package.json');
const { PNG } = require('pngjs');
const [i, o, xs, ys, ws, hs, ks] = process.argv.slice(2);
const src = PNG.sync.read(fs.readFileSync(i));
const x = +xs, y = +ys, w = +ws, h = +hs, k = +(ks || 1);
const out = new PNG({ width: w * k, height: h * k });
for (let yy = 0; yy < h * k; yy++) for (let xx = 0; xx < w * k; xx++) {
  const sx = x + Math.floor(xx / k), sy = y + Math.floor(yy / k);
  const s = (sy * src.width + sx) * 4, d = (yy * w * k + xx) * 4;
  if (sx < 0 || sy < 0 || sx >= src.width || sy >= src.height) continue;
  out.data[d] = src.data[s]; out.data[d + 1] = src.data[s + 1]; out.data[d + 2] = src.data[s + 2]; out.data[d + 3] = 255;
}
fs.writeFileSync(o, PNG.sync.write(out));
