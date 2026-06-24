// Génère les TILESETS DE RUES edge-Wang PAR ÈRE — rues PLEINE LARGEUR (1 tuile).
//   La tuile `m` (bitmask N=1,E=2,S=4,W=8) est ENTIÈREMENT chaussée. Les bords NON
//   connectés (qui bordent le sol) reçoivent l'effet « route en creux » : liseré
//   sombre net (haut + côtés) + lèvre claire (sud) + ombre de cuvette. Les bords
//   connectés vont jusqu'au bord de tuile → continuité avec la cellule voisine.
//   Surface échantillonnée en coord LOCALE (la surface PixelLab est tileable 32×32)
//   → toutes les tuiles montrent la même surface, raccords nets entre cellules.
//   Entrée : public/pixelart/_streets_src/band{N}.png. Sortie : streets-band{N}.png.
//   NON destructif. Lancer :
//     node scripts/fetchStreetSurfaces.mjs && node scripts/makeStreetTiles.mjs
import { PNG } from 'pngjs';
import fs from 'node:fs';
import path from 'node:path';

const SRC = 'public/pixelart/_streets_src';
const OUT = 'public/pixelart';
const S = 32, GRID = 4, W = S * GRID;
// Effet « route en creux sous le sol » (sur les bords ouverts uniquement).
const BASE = 0.9;      // chaussée globalement un peu plus sombre que le sol
const EDGE = 0.32;     // liseré sombre net (1px) au bord haut + côtés ouverts
const AO_R = 3;        // portée de l'ombre de cuvette (px)
const AO_N = 0.5;      // ombre côté NORD ouvert — forte
const AO_SIDE = 0.34;  // ombre côtés E/O ouverts — moyenne
const AO_S = 0.1;      // ombre côté SUD ouvert — faible
const LIP = 1.18;      // lèvre de trottoir éclairée au bord sud ouvert
const clamp = (c) => Math.max(0, Math.min(255, Math.round(c)));

if (!fs.existsSync(SRC)) {
  console.error('Manque', SRC, '— lance d’abord : node scripts/fetchStreetSurfaces.mjs');
  process.exit(1);
}
const srcs = fs.readdirSync(SRC).filter((f) => /^band\d+\.png$/.test(f));
for (const f of srcs) {
  const surf = PNG.sync.read(fs.readFileSync(path.join(SRC, f)));
  const sw = surf.width, shh = surf.height;
  const out = new PNG({ width: W, height: W });
  for (let m = 0; m < 16; m += 1) {
    const tx = m & 3, ty = m >> 2;
    const openN = !(m & 1), openE = !(m & 2), openS = !(m & 4), openW = !(m & 8);
    for (let ly = 0; ly < S; ly += 1) for (let lx = 0; lx < S; lx += 1) {
      const di = ((ty * S + ly) * W + (tx * S + lx)) * 4;
      const si = ((ly % shh) * sw + (lx % sw)) * 4; // surface locale (tileable)
      // distance au SOL = distance au bord de tuile, sur les côtés OUVERTS seulement.
      const dN = openN ? ly : 99, dS = openS ? (S - 1 - ly) : 99;
      const dW = openW ? lx : 99, dE = openE ? (S - 1 - lx) : 99;
      let fac;
      if (dN === 0 || dW === 0 || dE === 0) fac = EDGE;   // liseré net (haut + côtés)
      else if (dS === 0) fac = LIP;                        // lèvre éclairée (bas)
      else {
        let shd = 0;
        const acc = (d, s) => { if (d <= AO_R) shd = Math.max(shd, s * (AO_R + 1 - d) / AO_R); };
        acc(dN, AO_N); acc(dW, AO_SIDE); acc(dE, AO_SIDE); acc(dS, AO_S);
        fac = BASE * (1 - shd);
      }
      out.data[di] = clamp(surf.data[si] * fac);
      out.data[di + 1] = clamp(surf.data[si + 1] * fac);
      out.data[di + 2] = clamp(surf.data[si + 2] * fac);
      out.data[di + 3] = 255;
    }
  }
  const o = f.replace(/^band/, 'streets-band');
  fs.writeFileSync(path.join(OUT, o), PNG.sync.write(out));
  console.log('rues:', o);
}
console.log('OK —', srcs.length, 'planches de rues (pleine tuile).');
