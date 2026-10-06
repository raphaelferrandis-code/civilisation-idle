// assembleAgentUrls.mjs — SECOURS du pipeline flat (cf. scripts/fetchAgentFlat.mjs) :
// assemble les bandes diagonales d'un perso depuis les URLs DIRECTES des frames
// d'animation, quand le zip /download reste verrouillé (HTTP 423 tant qu'un job de
// fond du personnage pend — 2e génération v3, direction re-queuée…).
//   node scripts/assembleAgentUrls.mjs <name> <charId> <seAnim> <swAnim> <neAnim> <nwAnim> [--out=<dossier>]
// --out : dossier de sortie (défaut agents/inhabitants ; agents/events pour les émeutiers).
// Les <xxAnim> sont les ids d'animation PAR DIRECTION, lisibles dans get_character
// (segment `animations/<id>/<direction>/N.png` des URLs). Backup tmp + bbox comme fetchAgentFlat.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';
import { fetchAnimFrames, assembleStrip, inkRows } from './lib/pixellab.mjs';

const OUT_ARG = process.argv.find((a) => a.startsWith('--out='));
const [, , NAME, CHAR_ID, SE, SW, NE, NW] = process.argv.filter((a) => !a.startsWith('--'));
if (!NAME || !CHAR_ID || !SE || !SW || !NE || !NW) {
  console.error('usage: node scripts/assembleAgentUrls.mjs <name> <charId> <seAnim> <swAnim> <neAnim> <nwAnim>');
  process.exit(1);
}
const OUT = OUT_ARG ? OUT_ARG.slice(6) : 'public/pixelart/agents/inhabitants';
const BACKUP = path.join(os.tmpdir(), 'civ-agents-backup');
const DIRS = [['south-east', SE], ['south-west', SW], ['north-east', NE], ['north-west', NW]];
const FRAMES = 6;

fs.mkdirSync(BACKUP, { recursive: true });
for (const [d, animId] of DIRS) {
  const fname = `${NAME}-${d.replace('-', '')}.png`;
  const dst = path.join(OUT, fname);
  if (fs.existsSync(dst) && !fs.existsSync(path.join(BACKUP, fname))) fs.copyFileSync(dst, path.join(BACKUP, fname));
  const imgs = await fetchAnimFrames(CHAR_ID, animId, d, FRAMES);
  const strip = assembleStrip(imgs);
  fs.writeFileSync(dst, PNG.sync.write(strip));
  const fh = imgs[0].height, { h } = inkRows(imgs[0]);
  console.log(`bande ${fname} ${strip.width}×${fh} — perso ${h}px/${fh} (ratio ${(h / fh).toFixed(2)})`);
}
