// fetchEraVehicle.mjs — assemble un VÉHICULE D'ÉPOQUE (docs/PLAN-VIVANT.md) depuis
// un objet 8 directions PixelLab animé : 4 bandes diagonales au VRAI sens écran +
// palette 24 + bandes -half (÷2, même recette que les habitants : moyenne 2×2 pondérée par
// l'alpha, rabattue sur la palette de la bande, alpha binaire).
//   node scripts/fetchEraVehicle.mjs <type> <skin> <objectId> <seAnim> <swAnim> <neAnim> <nwAnim> [--swap-south]
//     → public/pixelart/agents/vehicles/veh-<type>-<skin>-{southeast,…}[-half].png
// Les <xxAnim> sont les ids d'animation PAR DIRECTION (get_object, segment
// `animations/<id>/<direction>/N.png`).
// --swap-south : le générateur INVERSE souvent les deux vues SUD d'un objet (la bête
// regarde en bas à gauche dans « south-east ») — cf. VEH_DIAG_MAP d'isoUnits.js.
// Vérifier sur planche AVANT d'assembler ; avec ce drapeau les fichiers portent le
// sens VRAI et le rendu n'a plus de correction à faire.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { PNG } from 'pngjs';

const flags = process.argv.filter((a) => a.startsWith('--'));
const [, , TYPE, SKIN, OBJ, SE, SW, NE, NW] = process.argv.filter((a) => !a.startsWith('--'));
if (!TYPE || !SKIN || !OBJ || !SE || !SW || !NE || !NW) {
  console.error('usage: node scripts/fetchEraVehicle.mjs <type> <skin> <objectId> <seAnim> <swAnim> <neAnim> <nwAnim> [--swap-south]');
  process.exit(1);
}
const SWAP = flags.includes('--swap-south');
const OUT = 'public/pixelart/agents/vehicles';
const BASE = 'https://backblaze.pixellab.ai/file/pixellab-characters/objects/f1f2e80b-b12d-4940-a5a9-e76f8558b9e0';
const FRAMES = 6;
// [direction PixelLab, id d'animation, fichier écrit]
const JOBS = [
  ['south-east', SE, SWAP ? 'southwest' : 'southeast'],
  ['south-west', SW, SWAP ? 'southeast' : 'southwest'],
  ['north-east', NE, 'northeast'],
  ['north-west', NW, 'northwest'],
];

const px = (img, x, y) => { const i = (y * img.width + x) * 4; return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]]; };
function half(src) {
  const pal = new Map();
  for (let i = 0; i < src.data.length; i += 4) if (src.data[i + 3] > 128) pal.set((src.data[i] << 16) | (src.data[i + 1] << 8) | src.data[i + 2], [src.data[i], src.data[i + 1], src.data[i + 2]]);
  const colors = [...pal.values()];
  const w = Math.floor(src.width / 2), h = Math.floor(src.height / 2);
  const out = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const [pr, pg, pb, pa] = px(src, x * 2 + dx, y * 2 + dy);
      r += pr * pa; g += pg * pa; b += pb * pa; a += pa;
    }
    const o = (y * w + x) * 4;
    if (a / 4 < 128) { out.data[o + 3] = 0; continue; }
    const m = [r / a, g / a, b / a];
    let best = colors[0], bd = Infinity;
    for (const c of colors) {
      const d = (c[0] - m[0]) ** 2 + (c[1] - m[1]) ** 2 + (c[2] - m[2]) ** 2;
      if (d < bd) { bd = d; best = c; }
    }
    out.data[o] = best[0]; out.data[o + 1] = best[1]; out.data[o + 2] = best[2]; out.data[o + 3] = 255;
  }
  return out;
}

for (const [dir, anim, file] of JOBS) {
  const imgs = [];
  for (let n = 0; n < FRAMES; n += 1) {
    const url = `${BASE}/${OBJ}/animations/${anim}/${dir}/${n}.png`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status} sur ${url}`);
    imgs.push(PNG.sync.read(Buffer.from(await r.arrayBuffer())));
  }
  const fw = imgs[0].width, fh = imgs[0].height;
  const strip = new PNG({ width: fw * FRAMES, height: fh });
  imgs.forEach((im, i) => PNG.bitblt(im, strip, 0, 0, fw, fh, i * fw, 0));
  // Alpha binaire : une frange semi-transparente ferait un liseré au blit sans lissage.
  for (let i = 3; i < strip.data.length; i += 4) strip.data[i] = strip.data[i] >= 128 ? 255 : 0;
  const stem = `${OUT}/veh-${TYPE}-${SKIN}-${file}`;
  fs.writeFileSync(stem + '.png', PNG.sync.write(strip));
  // Palette de 24 teintes (comme les maisons et les habitants), PUIS la -half, qui se
  // rabat sur la palette de la bande pleine.
  execFileSync('node', ['scripts/quantize.cjs', stem + '.png', '--colors', '24']);
  fs.writeFileSync(stem + '-half.png', PNG.sync.write(half(PNG.sync.read(fs.readFileSync(stem + '.png')))));
  console.log(`${dir} → veh-${TYPE}-${SKIN}-${file}.png ${fw * FRAMES}×${fh} (+ -half)`);
}
