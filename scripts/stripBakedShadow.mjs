// stripBakedShadow.mjs — retire l'ombre au sol que le gabarit de marche PixelLab
// colle sous les pieds (gris neutre opaque, sur une partie des images seulement).
// La charte du vivant (docs/PLAN-VIVANT.md §3) interdit toute ombre cuite : c'est
// le jeu qui pose l'ombre solaire, la même sous chaque objet.
//   node scripts/stripBakedShadow.mjs <bande.png> [...]   (frames carrées H×H)
// Critère (scripts/lib/pixellab.mjs, stripShadow — le même que fetchAgentIdle.mjs) :
// pixel opaque dans les 6 rangées du bas, gris neutre de luminance moyenne, ET qui
// touche le VIDE (par contagion d'un gris à l'autre). Une basket blanche ombrée de
// gris est DANS le contour noir, elle ne touche jamais le vide et reste intacte.
// Idempotent : une bande sans ombre n'est pas réécrite.
import fs from 'node:fs';
import { PNG } from 'pngjs';
import { stripShadow } from './lib/pixellab.mjs';

for (const f of process.argv.slice(2)) {
  const p = PNG.sync.read(fs.readFileSync(f));
  const n = stripShadow(p);
  if (n) fs.writeFileSync(f, PNG.sync.write(p));
  console.log(f.split(/[\\/]/).pop(), '—', n, 'px d\'ombre retirés');
}
