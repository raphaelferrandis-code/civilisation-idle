// find-iris.cjs — localise le centre lumineux (iris) d'un sprite de merveille.
// Usage: node find-iris.cjs <png> [--warm]
// Cherche le centroïde des pixels les plus clairs (l'iris rayonnant), plus la bbox opaque.
const fs = require("fs");
const { PNG } = require("pngjs");

const file = process.argv[2];
if (!file) { console.error("usage: node find-iris.cjs <png>"); process.exit(1); }
const png = PNG.sync.read(fs.readFileSync(file));
const { width: W, height: H, data } = png;

// bbox opaque
let minX = W, minY = H, maxX = 0, maxY = 0, opaque = 0;
// centroïde pondéré par la luminance des pixels vraiment clairs (iris)
let sx = 0, sy = 0, sw = 0, bright = 0;
// centroïde de tous les pixels opaques (centre géométrique du sprite)
let gx = 0, gy = 0, gcount = 0;

for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    const a = data[i + 3];
    if (a < 40) continue;
    opaque++;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    gx += x; gy += y; gcount++;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    if (lum > 210) { // pixels très clairs = cœur de l'iris
      const wgt = (lum - 210) * (lum - 210);
      sx += x * wgt; sy += y * wgt; sw += wgt; bright++;
    }
  }
}
const irisX = sw > 0 ? Math.round(sx / sw) : Math.round((minX + maxX) / 2);
const irisY = sw > 0 ? Math.round(sy / sw) : Math.round((minY + maxY) / 2);
const geoX = Math.round(gx / gcount), geoY = Math.round(gy / gcount);

console.log(JSON.stringify({
  file: file.replace(/\\/g, "/").split("/").pop(),
  W, H,
  bbox: { minX, minY, maxX, maxY, w: maxX - minX + 1, h: maxY - minY + 1 },
  opaque,
  iris: { x: irisX, y: irisY, brightPx: bright },
  geo: { x: geoX, y: geoY }
}));
