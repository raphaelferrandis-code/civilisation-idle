// assembleAgentClip.mjs — assemble UNE bande (une animation × une direction) depuis les
// URLs directes des frames PixelLab, vers un fichier arbitraire : clips de scènes
// (forager-walk-east.png…), bandes cardinales aux noms simples, etc. Complète
// scripts/fetchAgentFlat.mjs (zip 4 dirs) et scripts/assembleAgentUrls.mjs (URLs 4 diagonales).
//   node scripts/assembleAgentClip.mjs <outFile> <charId> <animId> <direction> <frames>
// animId = segment `animations/<id>/<direction>/N.png` des URLs de get_character.
import fs from 'node:fs';
import { PNG } from 'pngjs';
import { fetchAnimFrames, assembleStrip, inkRows } from './lib/pixellab.mjs';

const [, , OUT_FILE, CHAR_ID, ANIM_ID, DIR, FRAMES_S] = process.argv;
const FRAMES = +FRAMES_S;
if (!OUT_FILE || !CHAR_ID || !ANIM_ID || !DIR || !FRAMES) {
  console.error('usage: node scripts/assembleAgentClip.mjs <outFile> <charId> <animId> <direction> <frames>');
  process.exit(1);
}
const imgs = await fetchAnimFrames(CHAR_ID, ANIM_ID, DIR, FRAMES);
const strip = assembleStrip(imgs);
fs.writeFileSync(OUT_FILE, PNG.sync.write(strip));
// Hauteur du perso sur TOUTE la largeur de l'image (l'ancienne boucle s'arrêtait à
// x < fh : fausse pour des frames non carrées — audit 2026-10-05, SCRIPT-13).
const fh = imgs[0].height, { h } = inkRows(imgs[0]);
console.log(`${OUT_FILE} ${strip.width}×${fh} — perso ${h}px/${fh} (ratio ${(h / fh).toFixed(2)})`);
