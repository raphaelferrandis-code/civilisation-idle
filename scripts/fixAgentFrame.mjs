// Corrige UNE frame défectueuse d'une bande de marche d'agent (ex. une frame
// retournée par un glitch v3 PixelLab). Remplace la frame BAD par la frame SRC,
// avec option de miroir horizontal (pour retrouver le pied opposé d'un cycle de
// marche symétrique vu de face). NON destructif au-delà de la frame visée.
//   Réglages en tête. Lancer : node scripts/fixAgentFrame.mjs
import { PNG } from 'pngjs';
import fs from 'node:fs';

const FILE = 'public/pixelart/agents/inhabitants/industrialwoman-south.png';
const FRAMES = 6;     // nb de frames de la bande
const BAD = 4;        // frame à corriger (0-indexée) — ici la frame de dos
const SRC = 1;        // frame source (demi-cycle plus tôt = pied opposé)
const MIRROR = true;  // miroir horizontal → inverse le pied (face = symétrique)

const png = PNG.sync.read(fs.readFileSync(FILE));
const W = png.width, H = png.height, FW = Math.round(W / FRAMES);
const at = (x, y) => ((y * W) + x) * 4;
for (let y = 0; y < H; y += 1) for (let lx = 0; lx < FW; lx += 1) {
  const sx = SRC * FW + (MIRROR ? (FW - 1 - lx) : lx);
  const di = at(BAD * FW + lx, y), si = at(sx, y);
  png.data[di] = png.data[si]; png.data[di + 1] = png.data[si + 1];
  png.data[di + 2] = png.data[si + 2]; png.data[di + 3] = png.data[si + 3];
}
fs.writeFileSync(FILE, PNG.sync.write(png));
console.log(`OK — ${FILE} : frame ${BAD} remplacée par la frame ${SRC}${MIRROR ? ' (miroir)' : ''}.`);
