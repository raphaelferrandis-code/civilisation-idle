// Efface du sprite les éléments cuits désormais fournis par un overlay "patch"
// À FOND TRANSPARENT (t2 : tissus entre les mâts ; t4 : flamme de la torche).
// Sans effacement, le cuit resterait visible sous les trous d'alpha de la
// frame animée (vision double). Les patchs OPAQUES du t5 (mur derrière les
// bannières) n'ont pas besoin d'effacement. Réversible via git.
// Usage: node erase-baked-pop1m.cjs
const fs = require("fs");
const path = require("path");
const { PNG } = require(path.join(__dirname, "..", "..", "node_modules", "pngjs"));
const ROOT = path.join(__dirname, "..", "..", "public", "pixelart", "wonders");

const JOBS = [
  // t2 : tissu + bande d'enroulement des deux gonfalons (mâts x12-13/x26-27 épargnés)
  { file: "pop1m-t2.png", zones: [[14, 125, 25, 147], [88, 125, 99, 147]] },
  // t4 : flamme au-dessus de la vasque (la vasque y>=41 reste cuite)
  { file: "pop1m-t4.png", zones: [[72, 8, 88, 40]] },
];

for (const job of JOBS) {
  const p = path.join(ROOT, job.file);
  const png = PNG.sync.read(fs.readFileSync(p));
  let n = 0;
  for (const [x0, y0, x1, y1] of job.zones) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = (y * png.width + x) * 4;
      if (png.data[i + 3] === 0) continue;
      png.data[i] = 0; png.data[i + 1] = 0; png.data[i + 2] = 0; png.data[i + 3] = 0;
      n++;
    }
  }
  fs.writeFileSync(p, PNG.sync.write(png));
  console.log(`${job.file}: ${n} px effaces`);
}
