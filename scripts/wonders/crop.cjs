// Crop + upscale. Usage: node crop.cjs in.png out.png x y w h facteur
const fs = require("fs");
const path = require("path");
const { PNG } = require(path.join("C:/Users/Hardware31/Desktop/Civilisation idle/CE 0.3/node_modules/pngjs"));
const [, , inPath, outPath, xa, ya, wa, ha, fa] = process.argv;
const src = PNG.sync.read(fs.readFileSync(inPath));
const x0 = +xa, y0 = +ya, w = +wa, h = +ha, F = +fa || 6;
const dst = new PNG({ width: w * F, height: h * F });
for (let y = 0; y < dst.height; y++) for (let x = 0; x < dst.width; x++) {
  const sx = x0 + Math.floor(x / F), sy = y0 + Math.floor(y / F);
  if (sx < 0 || sy < 0 || sx >= src.width || sy >= src.height) continue;
  const si = (sy * src.width + sx) * 4, di = (y * dst.width + x) * 4;
  dst.data[di] = src.data[si]; dst.data[di+1] = src.data[si+1]; dst.data[di+2] = src.data[si+2]; dst.data[di+3] = src.data[si+3];
}
fs.writeFileSync(outPath, PNG.sync.write(dst));
console.log(outPath);
