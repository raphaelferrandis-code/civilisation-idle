// crop-region.cjs — extrait une zone d'un PNG et l'agrandit (inspection).
// Usage: node crop-region.cjs <in> <out> <x> <y> <w> <h> [scale]
const fs = require("fs");
const { PNG } = require("pngjs");
const [, , inp, outp, X, Y, CW, CH, SC] = process.argv;
const x = +X, y = +Y, w = +CW, h = +CH, sc = SC ? +SC : 2;
const src = PNG.sync.read(fs.readFileSync(inp));
const out = new PNG({ width: w * sc, height: h * sc });
for (let j = 0; j < h * sc; j++) {
  for (let i = 0; i < w * sc; i++) {
    const sxp = x + Math.floor(i / sc), syp = y + Math.floor(j / sc);
    const si = (syp * src.width + sxp) * 4, di = (j * w * sc + i) * 4;
    for (let c = 0; c < 4; c++) out.data[di + c] = src.data[si + c];
  }
}
fs.writeFileSync(outp, PNG.sync.write(out));
console.log("cropped", w + "x" + h, "->", (w * sc) + "x" + (h * sc));
