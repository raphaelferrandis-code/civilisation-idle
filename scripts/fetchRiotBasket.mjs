// Télécharge les personnages PixelLab (porteurs de panier + émeutiers) et assemble
// une BANDE de marche par direction → public/pixelart/agents/{name}-{dir}.png (6×68px).
//   Même pipeline que fetchAgents.mjs : poll du zip /download jusqu'à ce que la marche
//   y soit, puis assemblage. Lancer : node scripts/fetchRiotBasket.mjs
import { PNG } from 'pngjs';
import AdmZip from 'adm-zip';
import fs from 'node:fs';

const OUT = 'public/pixelart/agents';
const sub = (n) => n.startsWith('rioter-') ? 'events' : 'inhabitants'; // porteurs→inhabitants, émeutiers→events
const DIRS = ['south', 'east', 'north', 'west'];
const FRAMES = 6;
const CHARS = [
  { name: 'basket-man',          id: '3840227c-b7a7-41bd-953c-775990cf546b' },
  { name: 'basket-woman',        id: '674cfd45-476d-42ef-b497-155d81012be8' },
  { name: 'rioter-man-fork',     id: '620cbbe4-0b1e-4331-8438-d0f4c2d2098c' },
  { name: 'rioter-man-torch',    id: '7c4d6293-4920-4421-a65c-919f2ab14b9c' },
  { name: 'rioter-woman-fork',   id: '9e0e9604-3cc9-42aa-825f-36c27a09bf1b' },
  { name: 'rioter-woman-torch',  id: 'e3ac1d17-2e15-4bee-8387-62ee193ea6fb' },
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const RX = /animations\/[^/]+\/(south|east|north|west)\/frame_(\d+)\.png$/i;

for (const s of ['inhabitants', 'events']) fs.mkdirSync(`${OUT}/${s}`, { recursive: true });
for (const ch of CHARS) {
  let frames = null;
  for (let t = 0; t < 30 && !frames; t += 1) {
    try {
      const buf = Buffer.from(await fetch(`https://api.pixellab.ai/mcp/characters/${ch.id}/download`).then((r) => r.arrayBuffer()));
      const byDir = { south: [], east: [], north: [], west: [] };
      for (const e of new AdmZip(buf).getEntries()) {
        const m = e.entryName.match(RX);
        if (m) byDir[m[1].toLowerCase()].push({ f: +m[2], data: e.getData() });
      }
      if (DIRS.every((d) => byDir[d].length >= FRAMES)) {
        for (const d of DIRS) byDir[d].sort((a, b) => a.f - b.f);
        frames = byDir;
      }
    } catch { /* zip pas prêt */ }
    if (!frames) await sleep(20000);
  }
  if (!frames) { console.warn(ch.name, '— marche pas prête (timeout), skip'); continue; }
  for (const d of DIRS) {
    // v3 rend 7 frames (frame_0 = pose de référence statique) ; le template `walk`
    // rend pile 6. On prend les 6 DERNIÈRES → on saute la référence pour le v3,
    // et on garde les 6 du template sans changement.
    const imgs = frames[d].slice(-FRAMES).map((fr) => PNG.sync.read(fr.data));
    const W = imgs[0].width, H = imgs[0].height;
    const strip = new PNG({ width: W * FRAMES, height: H });
    imgs.forEach((im, f) => {
      for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
        const si = (y * W + x) * 4, di = (y * (W * FRAMES) + (f * W + x)) * 4;
        strip.data[di] = im.data[si]; strip.data[di + 1] = im.data[si + 1];
        strip.data[di + 2] = im.data[si + 2]; strip.data[di + 3] = im.data[si + 3];
      }
    });
    fs.writeFileSync(`${OUT}/${sub(ch.name)}/${ch.name}-${d}.png`, PNG.sync.write(strip));
  }
  console.log(ch.name, '— 4 bandes (' + frames.south[0].data.length + 'o/frame)');
}
console.log('OK — porteurs + émeutiers assemblés dans', OUT);
