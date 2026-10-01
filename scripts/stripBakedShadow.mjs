// stripBakedShadow.mjs — retire l'ombre au sol que le gabarit de marche PixelLab
// colle sous les pieds (gris neutre opaque, sur une partie des images seulement).
// La charte du vivant (docs/PLAN-VIVANT.md §3) interdit toute ombre cuite : c'est
// le jeu qui pose l'ombre solaire, la même sous chaque objet.
//   node scripts/stripBakedShadow.mjs <bande.png> [...]   (frames carrées H×H)
// Critère : pixel opaque dans les 6 rangées du bas de sa frame, gris neutre
// (écart max-min des canaux ≤ 24) de luminance moyenne (60-200). Le contour noir
// et les pieds colorés ne répondent pas à ce critère.
import fs from 'node:fs';
import { PNG } from 'pngjs';

const ROWS = 6;
for (const f of process.argv.slice(2)) {
  const p = PNG.sync.read(fs.readFileSync(f));
  const H = p.height;
  let n = 0;
  for (let y = Math.max(0, H - ROWS); y < H; y++) for (let x = 0; x < p.width; x++) {
    const i = (y * p.width + x) * 4;
    if (p.data[i + 3] < 128) continue;
    const r = p.data[i], g = p.data[i + 1], b = p.data[i + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), lum = (r + g + b) / 3;
    if (mx - mn <= 24 && lum >= 60 && lum <= 200) { p.data[i + 3] = 0; n++; }
  }
  fs.writeFileSync(f, PNG.sync.write(p));
  console.log(f.split(/[\\/]/).pop(), '—', n, 'px d\'ombre retirés');
}
