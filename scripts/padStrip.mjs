// padStrip.mjs — ramène des bandes de frames carrées à une toile commune N×N.
// Les animations v3 « bras levé » de PixelLab agrandissent la toile, et pas de la
// même quantité selon la direction (44 ou 48 px pour un personnage de 32) : servies
// telles quelles, le même émeutier changerait de taille (et de taille de pixel) en
// tournant. On rembourre chaque frame en haut et sur les côtés, PIEDS ALIGNÉS (la
// marge du bas est conservée), sans rééchantillonner un seul pixel.
//   node scripts/padStrip.mjs <N> <bande.png> [...]
import fs from 'node:fs';
import { PNG } from 'pngjs';

const [N, ...files] = process.argv.slice(2);
const S = +N;
if (!S || !files.length) { console.error('usage: node scripts/padStrip.mjs <N> <bande.png> [...]'); process.exit(1); }
for (const f of files) {
  const src = PNG.sync.read(fs.readFileSync(f));
  const fh = src.height, nf = Math.round(src.width / fh);
  if (fh > S) throw new Error(`${f} : frame ${fh} > ${S}`);
  if (fh === S) { console.log(f.split(/[\\/]/).pop(), '— déjà', S); continue; }
  const dx = Math.floor((S - fh) / 2), dy = S - fh;
  const out = new PNG({ width: S * nf, height: S });
  for (let i = 0; i < nf; i += 1) PNG.bitblt(src, out, i * fh, 0, fh, fh, i * S + dx, dy);
  fs.writeFileSync(f, PNG.sync.write(out));
  console.log(f.split(/[\\/]/).pop(), `— ${fh} → ${S} (${nf} frames)`);
}
