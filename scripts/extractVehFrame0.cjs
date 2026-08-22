// extractVehFrame0.cjs — extrait la FRAME 0 de la bande est de chaque véhicule
// (public/pixelart/agents/vehicles/veh-<type>-east.png, frames carrées) → PNG
// unitaires dans le scratchpad, pour servir de RÉFÉRENCE à create_8_direction_object
// (rotations du même objet = continuité visuelle des diagonales iso).
//   Usage : node scripts/extractVehFrame0.cjs <outDir>
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const SRC = 'public/pixelart/agents/vehicles';
const OUT = process.argv[2] || 'scratch-veh-ref';
// 'cart' et 'barrow' retirés le 2026-08-23 : leurs sprites sont sortis du dépôt
// (débranchés depuis agents.js, cf. étape 2 du plan de suppression du legacy).
const TYPES = ['wagon', 'chariot', 'caravan', 'car', 'tram'];

fs.mkdirSync(OUT, { recursive: true });
for (const t of TYPES) {
  const p = path.join(SRC, `veh-${t}-east.png`);
  if (!fs.existsSync(p)) { console.warn(t, '— bande est absente, skip'); continue; }
  const img = PNG.sync.read(fs.readFileSync(p));
  const fh = img.height;                     // frames carrées : côté = hauteur
  const f0 = new PNG({ width: fh, height: fh });
  PNG.bitblt(img, f0, 0, 0, fh, fh, 0, 0);
  fs.writeFileSync(path.join(OUT, `ref-${t}.png`), PNG.sync.write(f0));
  console.log(t, `→ ref-${t}.png (${fh}px)`);
}
