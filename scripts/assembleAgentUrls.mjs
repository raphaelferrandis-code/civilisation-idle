// assembleAgentUrls.mjs — SECOURS du pipeline flat (cf. scripts/fetchAgentFlat.mjs) :
// assemble les bandes diagonales d'un perso depuis les URLs DIRECTES des frames
// d'animation, quand le zip /download reste verrouillé (HTTP 423 tant qu'un job de
// fond du personnage pend — 2e génération v3, direction re-queuée…).
//   node scripts/assembleAgentUrls.mjs <name> <charId> <seAnim> <swAnim> <neAnim> <nwAnim>
// Les <xxAnim> sont les ids d'animation PAR DIRECTION, lisibles dans get_character
// (segment `animations/<id>/<direction>/N.png` des URLs). Backup tmp + bbox comme fetchAgentFlat.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';

const [, , NAME, CHAR_ID, SE, SW, NE, NW] = process.argv;
if (!NAME || !CHAR_ID || !SE || !SW || !NE || !NW) {
  console.error('usage: node scripts/assembleAgentUrls.mjs <name> <charId> <seAnim> <swAnim> <neAnim> <nwAnim>');
  process.exit(1);
}
const OUT = 'public/pixelart/agents/inhabitants';
const BACKUP = path.join(os.tmpdir(), 'civ-agents-backup');
const BASE = 'https://backblaze.pixellab.ai/file/pixellab-characters/f1f2e80b-b12d-4940-a5a9-e76f8558b9e0';
const DIRS = [['south-east', SE], ['south-west', SW], ['north-east', NE], ['north-west', NW]];
const FRAMES = 6;

fs.mkdirSync(BACKUP, { recursive: true });
for (const [d, animId] of DIRS) {
  const fname = `${NAME}-${d.replace('-', '')}.png`;
  const dst = path.join(OUT, fname);
  if (fs.existsSync(dst) && !fs.existsSync(path.join(BACKUP, fname))) fs.copyFileSync(dst, path.join(BACKUP, fname));
  const imgs = [];
  for (let n = 0; n < FRAMES; n += 1) {
    const url = `${BASE}/${CHAR_ID}/animations/${animId}/${d}/${n}.png`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status} sur ${url}`);
    imgs.push(PNG.sync.read(Buffer.from(await r.arrayBuffer())));
  }
  const fw = imgs[0].width, fh = imgs[0].height;
  const strip = new PNG({ width: fw * FRAMES, height: fh });
  for (let i = 0; i < FRAMES; i += 1) PNG.bitblt(imgs[i], strip, 0, 0, fw, fh, i * fw, 0);
  fs.writeFileSync(dst, PNG.sync.write(strip));
  let top = -1, bot = -1;
  for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
    if (imgs[0].data[(y * fw + x) * 4 + 3] > 16) { if (top < 0) top = y; bot = y; break; }
  }
  console.log(`bande ${fname} ${fw * FRAMES}×${fh} — perso ${bot - top + 1}px/${fh} (ratio ${((bot - top + 1) / fh).toFixed(2)})`);
}
