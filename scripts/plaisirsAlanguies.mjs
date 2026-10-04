// plaisirsAlanguies.mjs — LES COURTISANES ALANGUIES (Maison des Plaisirs, 2026-10-04).
//
// Raph : « la luxure, pousse l'idée au max », puis « dessine sur PixelLab ». Une
// courtisane de chaque âge, allongée sur le meuble de son époque (peaux de bête, banc à
// coussins, lit de banquet, méridienne, sofa, divan de lumière), tirée d'une passe
// PixelLab « Create Image (Pro) » avec la fille de l'âge en référence de personnage
// (même visage, même tenue). Les tirages choisis sont gardés tels quels dans
// art/plaisirs/pixellab/<âge>-alanguie.png ; ce script n'en fait que l'export du jeu :
// alpha BINAIRE (le blit est au plus proche voisin, un bord semi-opaque salirait la
// silhouette), les ÎLOTS de pixels détachés retirés (paillettes, bouts de décor coupés
// par le cadre : ils flotteraient dans la salle), puis
// public/pixelart/agents/inhabitants/plaisirs-<âge>-alanguie.png.
// Elle regarde à droite ; la coupe la retourne quand elle est posée à droite d'un hall.
//
//   node scripts/plaisirsAlanguies.mjs
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const SRC = 'art/plaisirs/pixellab';
const OUT = 'public/pixelart/agents/inhabitants';
// Un îlot plus petit que ce rapport au morceau principal est retiré.
const ILOT = 0.05;

// Les morceaux d'un seul tenant (8-voisins) : la liste des pixels de chacun.
function morceaux(p) {
  const { width: W, height: H } = p;
  const vu = new Uint8Array(W * H), out = [];
  const plein = (x, y) => x >= 0 && y >= 0 && x < W && y < H && p.data[(y * W + x) * 4 + 3] > 0;
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      if (!plein(x, y) || vu[y * W + x]) continue;
      const px = [], pile = [[x, y]];
      vu[y * W + x] = 1;
      while (pile.length) {
        const [a, b] = pile.pop();
        px.push(b * W + a);
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            const u = a + dx, v = b + dy;
            if (plein(u, v) && !vu[v * W + u]) {
              vu[v * W + u] = 1;
              pile.push([u, v]);
            }
          }
        }
      }
      out.push(px);
    }
  }
  return out;
}

const files = fs.readdirSync(SRC).filter((f) => f.endsWith('-alanguie.png'));
for (const f of files) {
  const p = PNG.sync.read(fs.readFileSync(path.join(SRC, f)));
  for (let k = 0; k < p.data.length; k += 4) p.data[k + 3] = p.data[k + 3] >= 128 ? 255 : 0;
  const m = morceaux(p), grand = Math.max(...m.map((px) => px.length));
  let retires = 0;
  for (const px of m) {
    if (px.length >= grand * ILOT) continue;
    for (const k of px) p.data[k * 4 + 3] = 0;
    retires += px.length;
  }
  const out = path.join(OUT, `plaisirs-${f}`);
  fs.writeFileSync(out, PNG.sync.write(p));
  console.log(out, `${p.width}x${p.height}`, retires ? `(${retires} px d'îlots retirés)` : '');
}
