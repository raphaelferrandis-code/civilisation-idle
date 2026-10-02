// stripOpaqueBg.mjs — efface le FOND OPAQUE qu'une génération PixelLab garde parfois
// (rectangle gris uni derrière le personnage, sur une direction ou une animation
// entière ; déjà vu sur les scènes de bâtiments, cf. PLAN-MAQUETTE-VIVANTE).
//   node scripts/stripOpaqueBg.mjs <bande.png> [...]   (frames carrées H×H)
// Par frame : on prend la boîte des pixels opaques ; si ses 4 coins sont opaques et
// de la même couleur (à 12 près par canal) — le rectangle du fond, qui peut garder
// une marge transparente —, remplissage par contagion depuis tout le bord de cette
// boîte des pixels de cette couleur → transparents. Le contour noir du personnage
// arrête la contagion. Une frame dont la boîte a un coin vide n'est pas touchée.
import fs from 'node:fs';
import { PNG } from 'pngjs';

const TOL = 12;
for (const f of process.argv.slice(2)) {
  const p = PNG.sync.read(fs.readFileSync(f));
  const fh = p.height, nf = Math.round(p.width / fh), W = p.width;
  let total = 0, frames = 0;
  for (let k = 0; k < nf; k += 1) {
    const x0 = k * fh;
    const at = (x, y) => (y * W + x0 + x) * 4;
    let bx0 = fh, by0 = fh, bx1 = -1, by1 = -1;
    for (let y = 0; y < fh; y += 1) for (let x = 0; x < fh; x += 1) {
      if (p.data[at(x, y) + 3] < 128) continue;
      if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y;
    }
    if (bx1 < 0) continue;
    const corners = [at(bx0, by0), at(bx1, by0), at(bx0, by1), at(bx1, by1)];
    if (corners.some((i) => p.data[i + 3] < 128)) continue;
    const ref = [p.data[corners[0]], p.data[corners[0] + 1], p.data[corners[0] + 2]];
    const same = (i) => p.data[i + 3] >= 128 && Math.abs(p.data[i] - ref[0]) <= TOL
      && Math.abs(p.data[i + 1] - ref[1]) <= TOL && Math.abs(p.data[i + 2] - ref[2]) <= TOL;
    if (!corners.every(same)) continue;
    const seen = new Uint8Array(fh * fh);
    const stack = [];
    for (let x = bx0; x <= bx1; x += 1) stack.push([x, by0], [x, by1]);
    for (let y = by0; y <= by1; y += 1) stack.push([bx0, y], [bx1, y]);
    while (stack.length) {
      const [x, y] = stack.pop();
      if (x < 0 || y < 0 || x >= fh || y >= fh || seen[y * fh + x]) continue;
      seen[y * fh + x] = 1;
      const i = at(x, y);
      if (!same(i)) continue;
      p.data[i + 3] = 0; total += 1;
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    frames += 1;
  }
  if (frames) fs.writeFileSync(f, PNG.sync.write(p));
  console.log(f.split(/[\\/]/).pop(), frames ? `— fond opaque retiré sur ${frames} frame(s), ${total} px` : '— pas de fond');
}
