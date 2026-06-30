// Télécharge l'animation de marche du villageois (PixelLab) et assemble une BANDE
// horizontale de frames par direction → public/pixelart/agents/villager-{dir}.png.
//   4 directions × 6 frames (68×68). Frames = URLs publiques backblaze.
//   Lancer : node scripts/fetchAgentVillager.mjs   (Node 18+ : fetch global)
import { PNG } from 'pngjs';
import fs from 'node:fs';

const OUT = 'public/pixelart/agents/inhabitants';
const CHAR = 'cb56bcdc-eb92-4298-a085-ddde3bcc05db';
const BASE = `https://backblaze.pixellab.ai/file/pixellab-characters/f1f2e80b-b12d-4940-a5a9-e76f8558b9e0/${CHAR}/animations`;
const FRAMES = 6;
const DIRS = {
  south: '56b4357b-d1ed-4930-a400-3012fda19715',
  east: '80f8726c-05e5-435e-bed8-e4823d280185',
  north: '238bfd8b-6394-4f58-b712-15ce5680f099',
  west: '18907eb7-ac90-4c2a-97f0-980ba3c8853c',
};

fs.mkdirSync(OUT, { recursive: true });
for (const [dir, animId] of Object.entries(DIRS)) {
  const imgs = [];
  for (let f = 0; f < FRAMES; f += 1) {
    const buf = Buffer.from(await fetch(`${BASE}/${animId}/${dir}/${f}.png`).then((r) => r.arrayBuffer()));
    imgs.push(PNG.sync.read(buf));
  }
  const W = imgs[0].width, H = imgs[0].height;
  const strip = new PNG({ width: W * FRAMES, height: H });
  imgs.forEach((im, f) => {
    for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
      const si = (y * W + x) * 4, di = (y * (W * FRAMES) + (f * W + x)) * 4;
      strip.data[di] = im.data[si]; strip.data[di + 1] = im.data[si + 1];
      strip.data[di + 2] = im.data[si + 2]; strip.data[di + 3] = im.data[si + 3];
    }
  });
  fs.writeFileSync(`${OUT}/villager-${dir}.png`, PNG.sync.write(strip));
  console.log(`villager-${dir}.png (${W}×${H} ×${FRAMES})`);
}
console.log('OK — bandes de marche dans', OUT);
