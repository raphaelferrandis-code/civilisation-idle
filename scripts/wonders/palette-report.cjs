// Compare les couleurs dominantes d'une zone d'un PNG. Usage: node palette-report.cjs <png> [x y w h]
const fs = require("fs");
const path = require("path");
const { PNG } = require(path.join(__dirname, "..", "..", "node_modules", "pngjs"));
const [, , file, xa, ya, wa, ha] = process.argv;
const png = PNG.sync.read(fs.readFileSync(file));
const x0 = Number(xa) || 0, y0 = Number(ya) || 0;
const w = Number(wa) || png.width, h = Number(ha) || png.height;
const counts = new Map();
for (let y = y0; y < Math.min(png.height, y0 + h); y++) {
  for (let x = x0; x < Math.min(png.width, x0 + w); x++) {
    const i = (y * png.width + x) * 4;
    if (png.data[i + 3] < 200) continue;
    const key = `${png.data[i]},${png.data[i + 1]},${png.data[i + 2]}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
}
const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
console.log(path.basename(file), `zone(${x0},${y0},${w},${h})`);
for (const [c, n] of top) console.log(`  rgb(${c}) x${n}`);
