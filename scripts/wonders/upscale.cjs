// Upscale nearest-neighbor pour inspection visuelle. Usage: node upscale.cjs in.png out.png [facteur]
const fs = require("fs");
const path = require("path");
const { PNG } = require(path.join(__dirname, "..", "..", "node_modules", "pngjs"));
const [, , inPath, outPath, fArg] = process.argv;
const F = Number(fArg) || 4;
const src = PNG.sync.read(fs.readFileSync(inPath));
const dst = new PNG({ width: src.width * F, height: src.height * F });
for (let y = 0; y < dst.height; y++) {
  for (let x = 0; x < dst.width; x++) {
    const si = ((Math.floor(y / F)) * src.width + Math.floor(x / F)) * 4;
    const di = (y * dst.width + x) * 4;
    dst.data[di] = src.data[si]; dst.data[di + 1] = src.data[si + 1];
    dst.data[di + 2] = src.data[si + 2]; dst.data[di + 3] = src.data[si + 3];
  }
}
fs.writeFileSync(outPath, PNG.sync.write(dst));
console.log(`${outPath}: ${dst.width}x${dst.height}`);
