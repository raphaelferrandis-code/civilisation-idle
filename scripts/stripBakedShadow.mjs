// stripBakedShadow.mjs — retire l'ombre au sol que le gabarit de marche PixelLab
// colle sous les pieds (gris neutre opaque, sur une partie des images seulement).
// La charte du vivant (docs/PLAN-VIVANT.md §3) interdit toute ombre cuite : c'est
// le jeu qui pose l'ombre solaire, la même sous chaque objet.
//   node scripts/stripBakedShadow.mjs <bande.png> [...]   (frames carrées H×H)
// Critère : pixel opaque dans les 6 rangées du bas, gris neutre (écart max-min des
// canaux ≤ 24) de luminance moyenne (60-200), ET qui touche le VIDE (voisin
// transparent, par contagion d'un gris à l'autre). L'ombre est posée HORS du
// contour noir ; une basket blanche ombrée de gris est DANS le contour, elle ne
// touche jamais le vide et reste intacte (leçon du 2026-10-02, modernman2).
import fs from 'node:fs';
import { PNG } from 'pngjs';

const ROWS = 6;
for (const f of process.argv.slice(2)) {
  const p = PNG.sync.read(fs.readFileSync(f));
  const W = p.width, H = p.height;
  const at = (x, y) => (y * W + x) * 4;
  const grey = (i) => {
    if (p.data[i + 3] < 128) return false;
    const r = p.data[i], g = p.data[i + 1], b = p.data[i + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), lum = (r + g + b) / 3;
    return mx - mn <= 24 && lum >= 60 && lum <= 200;
  };
  const empty = (x, y) => x < 0 || y < 0 || x >= W || y >= H || p.data[at(x, y) + 3] < 128;
  let n = 0, changed = true;
  while (changed) {
    changed = false;
    for (let y = Math.max(0, H - ROWS); y < H; y++) for (let x = 0; x < W; x++) {
      const i = at(x, y);
      if (!grey(i)) continue;
      if (empty(x - 1, y) || empty(x + 1, y) || empty(x, y - 1) || empty(x, y + 1)) {
        p.data[i + 3] = 0; n++; changed = true;
      }
    }
  }
  fs.writeFileSync(f, PNG.sync.write(p));
  console.log(f.split(/[\\/]/).pop(), '—', n, 'px d\'ombre retirés');
}
