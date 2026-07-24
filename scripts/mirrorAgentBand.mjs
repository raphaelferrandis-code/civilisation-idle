// mirrorAgentBand.mjs — reconstruit une bande de marche par MIROIR HORIZONTAL
// d'une autre bande du même personnage, frame par frame.
//
// À quoi ça sert : la génération PixelLab est inégale d'une direction à l'autre
// (jobs qui échouent puis se relancent, rotation source ratée). Or dans la
// projection iso, sud-est et sud-ouest sont symétriques par rapport à l'axe
// vertical de l'écran : le miroir de l'une EST géométriquement l'autre. Le
// reconstruire au lieu de le régénérer garantit le même gabarit, la même ligne
// de pieds et la même silhouette entre les deux vues — c'est justement leur
// divergence qui se voit en jeu (le personnage grandit ou rétrécit au virage).
// Seul l'éclairage bascule (haut-gauche → haut-droite), imperceptible sur un
// sprite de ~45 px à l'échelle de la carte ; même recette que le correctif des
// bandes sud des habitants (2 frames reconstruites, 6a15ffb).
//
//   node scripts/mirrorAgentBand.mjs basket-man southeast southwest
import { PNG } from 'pngjs';
import fs from 'node:fs';

const [name, src, dst] = process.argv.slice(2);
if (!name || !src || !dst) {
  console.error('usage : node scripts/mirrorAgentBand.mjs <perso> <dir-source> <dir-cible>');
  process.exit(1);
}
const sub = name.startsWith('rioter-') ? 'events' : (name === 'ox' || name === 'horse') ? 'animals' : 'inhabitants';
const dir = `public/pixelart/agents/${sub}`;
const from = `${dir}/${name}-${src}.png`;
const to = `${dir}/${name}-${dst}.png`;

const band = PNG.sync.read(fs.readFileSync(from));
const F = band.height;                                  // frames carrées
const nf = Math.round(band.width / F);
if (nf * F !== band.width) {
  console.error(`${from} : largeur ${band.width} pas un multiple de ${F}, découpe ambiguë`);
  process.exit(2);
}
const out = new PNG({ width: band.width, height: band.height });
for (let f = 0; f < nf; f += 1) {
  for (let y = 0; y < F; y += 1) for (let x = 0; x < F; x += 1) {
    const si = (y * band.width + f * F + x) * 4;
    const di = (y * band.width + f * F + (F - 1 - x)) * 4;
    for (let c = 0; c < 4; c += 1) out.data[di + c] = band.data[si + c];
  }
}
fs.writeFileSync(to, PNG.sync.write(out));
console.log(`${name}-${dst} ← miroir de ${name}-${src} (${F}px ×${nf}f)`);
