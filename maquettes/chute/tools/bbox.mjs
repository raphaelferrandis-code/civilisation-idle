import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/Hardware31/Desktop/Civilisation idle/CE 0.3/package.json');
const { PNG } = require('pngjs');
for (const f of process.argv.slice(2)) {
  const p = PNG.sync.read(fs.readFileSync(f));
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let y = 0; y < p.height; y++) for (let x = 0; x < p.width; x++) if (p.data[(y * p.width + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  console.log(f.split('/').pop(), p.width + 'x' + p.height, 'ink', x0, y0, (x1 - x0 + 1) + 'x' + (y1 - y0 + 1));
}
