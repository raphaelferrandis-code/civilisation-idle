// assembleAgentClip.mjs — assemble UNE bande (une animation × une direction) depuis les
// URLs directes des frames PixelLab, vers un fichier arbitraire : clips de scènes
// (forager-walk-east.png…), bandes cardinales aux noms simples, etc. Complète
// scripts/fetchAgentFlat.mjs (zip 4 dirs) et scripts/assembleAgentUrls.mjs (URLs 4 diagonales).
//   node scripts/assembleAgentClip.mjs <outFile> <charId> <animId> <direction> <frames>
// animId = segment `animations/<id>/<direction>/N.png` des URLs de get_character.
import fs from 'node:fs';
import { PNG } from 'pngjs';

const [, , OUT_FILE, CHAR_ID, ANIM_ID, DIR, FRAMES_S] = process.argv;
const FRAMES = +FRAMES_S;
if (!OUT_FILE || !CHAR_ID || !ANIM_ID || !DIR || !FRAMES) {
  console.error('usage: node scripts/assembleAgentClip.mjs <outFile> <charId> <animId> <direction> <frames>');
  process.exit(1);
}
const BASE = 'https://backblaze.pixellab.ai/file/pixellab-characters/f1f2e80b-b12d-4940-a5a9-e76f8558b9e0';
const imgs = [];
for (let n = 0; n < FRAMES; n += 1) {
  const url = `${BASE}/${CHAR_ID}/animations/${ANIM_ID}/${DIR}/${n}.png`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status} sur ${url}`);
  imgs.push(PNG.sync.read(Buffer.from(await r.arrayBuffer())));
}
const fw = imgs[0].width, fh = imgs[0].height;
const strip = new PNG({ width: fw * FRAMES, height: fh });
for (let i = 0; i < FRAMES; i += 1) PNG.bitblt(imgs[i], strip, 0, 0, fw, fh, i * fw, 0);
fs.writeFileSync(OUT_FILE, PNG.sync.write(strip));
let top = -1, bot = -1;
for (let y = 0; y < fh; y += 1) for (let x = 0; x < fh; x += 1) {
  if (imgs[0].data[(y * fw + x) * 4 + 3] > 16) { if (top < 0) top = y; bot = y; break; }
}
console.log(`${OUT_FILE} ${fw * FRAMES}×${fh} — perso ${bot - top + 1}px/${fh} (ratio ${((bot - top + 1) / fh).toFixed(2)})`);
