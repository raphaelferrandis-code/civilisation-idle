// Planche-contact : node sheet.mjs <sortie.png> <échelle> <colonnes> <png...>  (fond damier gris)
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/Hardware31/Desktop/Civilisation idle/CE 0.3/package.json');
const { PNG } = require('pngjs');
const [out, kS, colsS, ...files] = process.argv.slice(2);
const k = +kS, cols = +colsS;
const imgs = files.map((f) => PNG.sync.read(fs.readFileSync(f)));
const cw = Math.max(...imgs.map((i) => i.width)) * k + 8, ch = Math.max(...imgs.map((i) => i.height)) * k + 8;
const rows = Math.ceil(imgs.length / cols);
const W = cw * cols, H = ch * rows;
const o = new PNG({ width: W, height: H });
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const c = ((x >> 3) + (y >> 3)) & 1 ? 150 : 170; const i = (y * W + x) * 4;
  o.data[i] = c; o.data[i + 1] = c + 6; o.data[i + 2] = c - 10; o.data[i + 3] = 255;
}
imgs.forEach((im, n) => {
  const bx = (n % cols) * cw + 4, by = Math.floor(n / cols) * ch + 4 + (ch - 8 - im.height * k);
  for (let y = 0; y < im.height * k; y++) for (let x = 0; x < im.width * k; x++) {
    const s = ((Math.floor(y / k)) * im.width + Math.floor(x / k)) * 4, a = im.data[s + 3] / 255;
    if (!a) continue;
    const d = ((by + y) * W + bx + x) * 4;
    for (let c = 0; c < 3; c++) o.data[d + c] = Math.round(im.data[s + c] * a + o.data[d + c] * (1 - a));
  }
});
fs.writeFileSync(out, PNG.sync.write(o));
console.log(out, W + 'x' + H);
