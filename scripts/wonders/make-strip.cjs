// Assemble des frames PNG en bande horizontale. Usage: node make-strip.cjs <dossier> <out.png> [i0 i1 ...]
const fs = require("fs");
const path = require("path");
const { PNG } = require(path.join(__dirname, "..", "..", "node_modules", "pngjs"));
const [, , dir, outPath, ...idxArgs] = process.argv;
const files = idxArgs.length
  ? idxArgs.map(i => path.join(dir, `${i}.png`))
  : fs.readdirSync(dir).filter(f => /^\d+\.png$/.test(f)).sort((a, b) => parseInt(a) - parseInt(b)).map(f => path.join(dir, f));
const frames = files.map(f => PNG.sync.read(fs.readFileSync(f)));
const fw = frames[0].width, fh = frames[0].height;
const strip = new PNG({ width: fw * frames.length, height: fh });
frames.forEach((fr, k) => {
  if (fr.width !== fw || fr.height !== fh) throw new Error(`frame ${k}: ${fr.width}x${fr.height} != ${fw}x${fh}`);
  PNG.bitblt(fr, strip, 0, 0, fw, fh, k * fw, 0);
});
fs.writeFileSync(outPath, PNG.sync.write(strip));
console.log(`${outPath}: ${frames.length} frames de ${fw}x${fh} -> ${strip.width}x${strip.height}`);
