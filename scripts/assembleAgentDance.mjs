// assembleAgentDance.mjs — bande de DANSE d'un personnage PixelLab (Maison des
// Plaisirs, 2026-10-03 : la troupe de la scène, cf. src/game/map/iso/plaisirsCast.js).
// Une danse se joue sur place, face à la salle : seules les vues sud-est et sud-ouest
// sont animées ; les bandes nord-est / nord-ouest les RECOPIENT (le rendu iso exige
// les quatre, on ne les voit jamais de dos).
//   node scripts/assembleAgentDance.mjs <name> <charId> <seAnim> <swAnim> [--frames=8] [--skip=1]
// <xxAnim> : l'id d'animation par direction (segment `animations/<id>/<direction>/N.png`
// des URLs de get_character). --skip : images de tête à sauter (la v3 garde l'image de
// référence en 0). Puis : quantize.cjs --colors 24, et fetchAgentFlat.mjs half <name>.
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { fetchAnimFrames, assembleStrip } from './lib/pixellab.mjs';

const opt = (k, d) => { const a = process.argv.find((s) => s.startsWith(`--${k}=`)); return a ? +a.split('=')[1] : d; };
const [, , NAME, CHAR_ID, SE, SW] = process.argv.filter((a) => !a.startsWith('--'));
if (!NAME || !CHAR_ID || !SE || !SW) {
  console.error('usage: node scripts/assembleAgentDance.mjs <name> <charId> <seAnim> <swAnim> [--frames=8] [--skip=1]');
  process.exit(1);
}
const FRAMES = opt('frames', 8), SKIP = opt('skip', 1);
const OUT = 'public/pixelart/agents/inhabitants';
const strips = {};
for (const [d, animId] of [['south-east', SE], ['south-west', SW]]) {
  strips[d] = PNG.sync.write(assembleStrip(await fetchAnimFrames(CHAR_ID, animId, d, FRAMES, SKIP)));
}
for (const [d, src] of [['southeast', 'south-east'], ['southwest', 'south-west'], ['northeast', 'south-east'], ['northwest', 'south-west']]) {
  fs.writeFileSync(path.join(OUT, `${NAME}-${d}.png`), strips[src]);
  console.log('bande', `${NAME}-${d}.png`);
}
