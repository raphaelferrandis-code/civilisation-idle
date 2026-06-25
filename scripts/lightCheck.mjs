// Estime la direction de lumière d'un sprite : vecteur du centroïde des pixels
// SOMBRES vers le centroïde des pixels CLAIRS (≈ vers la source de lumière).
//   node scripts/lightCheck.mjs <fichier.png> [autres...]
import { PNG } from 'pngjs';
import fs from 'node:fs';

for (const f of process.argv.slice(2)) {
  const png = PNG.sync.read(fs.readFileSync(f));
  const W = png.width, H = png.height, d = png.data;
  const px = [];
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
    const i = (y * W + x) * 4;
    if (d[i + 3] > 200) px.push([x, y, 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]]);
  }
  px.sort((a, b) => a[2] - b[2]);
  const n = px.length, k = Math.max(1, Math.floor(n * 0.12));
  const cen = (arr) => { let sx = 0, sy = 0; for (const p of arr) { sx += p[0]; sy += p[1]; } return [sx / arr.length, sy / arr.length]; };
  const [dx, dy] = cen(px.slice(0, k));        // sombres
  const [lx, ly] = cen(px.slice(n - k));        // clairs
  const vx = lx - dx, vy = ly - dy;             // sombre → clair = vers la lumière
  const dir = (vy < 0 ? 'HAUT' : 'BAS') + '-' + (vx < 0 ? 'GAUCHE' : 'DROITE');
  console.log(f.split(/[\\/]/).pop().padEnd(26), 'lumière ≈', dir.padEnd(13), `(vx=${vx.toFixed(1)} vy=${vy.toFixed(1)})`);
}
