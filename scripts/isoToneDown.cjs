// isoToneDown.cjs — assagit une tuile de sol iso (PixelLab adore les joints
// marqués + un voile mauve) : désature vers la luminance, biais chaud léger,
// SANS toucher l'alpha ni les dimensions. Chantier iso, sol Phase 1+.
//
// Usage: node scripts/isoToneDown.cjs <png> [--sat 0.4] [--lift 0.06] [--warm 6]
//   --sat  part de couleur conservée (0..1, défaut 0.4 = 60 % désaturé)
//   --lift éclaircit vers le blanc (0..1, défaut 0.06)
//   --warm biais rouge-jaune en /255 (défaut 6 : tue le mauve)
const fs = require('fs');
const { PNG } = require('pngjs');

const argv = process.argv.slice(2);
const file = argv.find((a) => !a.startsWith('--'));
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] ? parseFloat(argv[i + 1]) : d; };
const SAT = opt('sat', 0.4), LIFT = opt('lift', 0.06), WARM = opt('warm', 6);
if (!file) { console.error('usage: node scripts/isoToneDown.cjs <png> [--sat 0.4] [--lift 0.06] [--warm 6]'); process.exit(1); }

const png = PNG.sync.read(fs.readFileSync(file));
const d = png.data;
for (let i = 0; i < d.length; i += 4) {
  if (d[i + 3] < 8) continue;
  const r = d[i], g = d[i + 1], b = d[i + 2];
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  let nr = lum + (r - lum) * SAT + WARM;
  let ng = lum + (g - lum) * SAT + WARM * 0.55;
  let nb = lum + (b - lum) * SAT - WARM * 0.4;
  nr += (255 - nr) * LIFT; ng += (255 - ng) * LIFT; nb += (255 - nb) * LIFT;
  d[i] = Math.max(0, Math.min(255, Math.round(nr)));
  d[i + 1] = Math.max(0, Math.min(255, Math.round(ng)));
  d[i + 2] = Math.max(0, Math.min(255, Math.round(nb)));
}
fs.writeFileSync(file, PNG.sync.write(png));
console.log('assagi →', file, `(sat ${SAT}, lift ${LIFT}, warm ${WARM})`);
