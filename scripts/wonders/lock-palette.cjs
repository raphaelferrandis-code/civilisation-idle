// Verrouille la palette d'une bande de frames sur celle de la FRAME 0 :
// chaque pixel des frames 1..n-1 est remappé vers la couleur la plus proche
// de la frame de référence. Tue la dérive chromatique des anims PixelLab
// (tissu qui vire à l'orange sur certaines frames) en gardant le mouvement.
// Usage: node lock-palette.cjs <strip.png> <fw> <n> <out.png>
const fs = require("fs");
const path = require("path");
const { PNG } = require(path.join(__dirname, "..", "..", "node_modules", "pngjs"));
const [, , inPath, fwA, nA, outPath] = process.argv;
const fw = +fwA, n = +nA;
const png = PNG.sync.read(fs.readFileSync(inPath));
const fh = png.height;

// Palette de référence = couleurs opaques de la frame 0.
const pal = [];
const seen = new Set();
for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
  const i = (y * png.width + x) * 4;
  if (png.data[i + 3] < 200) continue;
  const key = (png.data[i] << 16) | (png.data[i + 1] << 8) | png.data[i + 2];
  if (seen.has(key)) continue;
  seen.add(key);
  pal.push([png.data[i], png.data[i + 1], png.data[i + 2]]);
}

let remapped = 0;
for (let k = 1; k < n; k++) {
  for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
    const i = (y * png.width + (k * fw + x)) * 4;
    if (png.data[i + 3] < 200) continue;
    const r = png.data[i], g = png.data[i + 1], b = png.data[i + 2];
    let best = null, bestD = Infinity;
    for (const [pr, pg, pb] of pal) {
      const d = (r - pr) * (r - pr) + (g - pg) * (g - pg) + (b - pb) * (b - pb);
      if (d < bestD) { bestD = d; best = [pr, pg, pb]; }
    }
    if (bestD > 0) {
      png.data[i] = best[0]; png.data[i + 1] = best[1]; png.data[i + 2] = best[2];
      remapped++;
    }
  }
}
fs.writeFileSync(outPath, PNG.sync.write(png));
console.log(`${path.basename(inPath)}: palette ref ${pal.length} teintes, ${remapped} px remappes -> ${outPath}`);
