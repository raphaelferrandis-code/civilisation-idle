// Planche réduite (aperçu) : node strip.mjs <sortie.png> <largeurVignette> <colonnes> <png...>
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/Hardware31/Desktop/Civilisation idle/CE 0.3/package.json');
const { PNG } = require('pngjs');
const [out, twS, colsS, ...files] = process.argv.slice(2);
const tw = +twS, cols = +colsS;
const imgs = files.map((f) => PNG.sync.read(fs.readFileSync(f)));
const th = Math.round(imgs[0].height * tw / imgs[0].width);
const rows = Math.ceil(imgs.length / cols), G = 6;
const W = cols * (tw + G) + G, H = rows * (th + G) + G;
const o = new PNG({ width: W, height: H });
o.data.fill(24);
for (let i = 3; i < o.data.length; i += 4) o.data[i] = 255;
imgs.forEach((im, n) => {
  const bx = G + (n % cols) * (tw + G), by = G + Math.floor(n / cols) * (th + G);
  const k = im.width / tw;
  for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
    // moyenne 2×2 de points (aperçu seulement)
    let r = 0, g = 0, b = 0;
    for (const [u, v] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
      const sx = Math.min(im.width - 1, Math.floor((x + u) * k)), sy = Math.min(im.height - 1, Math.floor((y + v) * k));
      const s = (sy * im.width + sx) * 4; r += im.data[s]; g += im.data[s + 1]; b += im.data[s + 2];
    }
    const d = ((by + y) * W + bx + x) * 4;
    o.data[d] = r / 4; o.data[d + 1] = g / 4; o.data[d + 2] = b / 4; o.data[d + 3] = 255;
  }
});
fs.writeFileSync(out, PNG.sync.write(o));
console.log(out, W + 'x' + H);
