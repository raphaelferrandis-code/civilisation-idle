// Rogne une bande de frames à la bbox UNION du contenu opaque (alpha>=16)
// sur toutes les frames : la flamme remplit alors son canvas, et l'échelle
// d'overlay du moteur correspond à la taille réelle de la flamme.
// Usage: node trim-strip.cjs <strip.png> <fw> <fh> <frames> <out.png>
const fs = require("fs");
const path = require("path");
const { PNG } = require(path.join("C:/Users/Hardware31/Desktop/Civilisation idle/CE 0.3/node_modules/pngjs"));
const [, , inPath, fwA, fhA, nA, outPath] = process.argv;
const fw = +fwA, fh = +fhA, n = +nA;
const src = PNG.sync.read(fs.readFileSync(inPath));
let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1;
for (let k = 0; k < n; k++) {
  for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
    const i = (y * src.width + (k * fw + x)) * 4;
    if (src.data[i + 3] >= 16) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
}
const tw = maxX - minX + 1, th = maxY - minY + 1;
const dst = new PNG({ width: tw * n, height: th });
for (let k = 0; k < n; k++) PNG.bitblt(src, dst, k * fw + minX, minY, tw, th, k * tw, 0);
fs.writeFileSync(outPath, PNG.sync.write(dst));
console.log(`${path.basename(inPath)}: contenu ${tw}x${th} (bbox ${minX},${minY}..${maxX},${maxY}) -> ${dst.width}x${dst.height}`);
