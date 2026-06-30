// Télécharge les personnages PixelLab (zip /download) et assemble une BANDE de marche
// par direction → public/pixelart/agents/{name}-{dir}.png (6 frames de 68px).
//   Générique : ne nécessite que le charId. Attend que l'animation de marche soit dans
//   le zip (poll). Lancer : node scripts/fetchAgents.mjs
import { PNG } from 'pngjs';
import AdmZip from 'adm-zip';
import fs from 'node:fs';

const OUT = 'public/pixelart/agents/inhabitants';
const DIRS = ['south', 'east', 'north', 'west'];
const FRAMES = 6;
const CHARS = [
  { name: 'caveman', id: '76334486-ed97-4ebc-b99e-9055230fedfb' },
  { name: 'cavewoman', id: '25ec645b-bed2-4f1e-96aa-d2c55aa5b616' },
  { name: 'cavechild', id: 'ba22f75d-59a4-43b0-b2e8-006e05aa7867' },
  { name: 'villagerwoman', id: 'daad6147-6c7e-4f03-8980-d235d33b8db1' }, // v2 : cheveux longs + poitrine plus large
  { name: 'villagerchild', id: 'af535141-8b69-437d-9587-f20dfe1bb287' },
  { name: 'greekman', id: 'fdc84f08-aa25-49fc-9bce-1c267cc39ffc' },
  { name: 'greekwoman', id: 'aaa5b17f-5dc5-4ae5-a207-75cedd2e6fcc' },
  { name: 'greekchild', id: 'c12131fa-1b98-4b2c-933e-f79d5166c1e5' },
  { name: 'industrialman', id: '578c70d7-c0f4-4f30-aff5-e636d6b03864' },
  { name: 'industrialwoman', id: 'eaebab54-fb77-463a-8dbd-c874d81289a1' },
  { name: 'industrialchild', id: '9661ebd6-0673-4d7c-94f7-4366283e8268' },
  { name: 'futureman', id: 'bd007ccb-a6a1-418a-9603-13aa7f005837' },
  { name: 'futurewoman', id: '0863b200-735d-41c3-8c7f-68727eaff035' },
  { name: 'futurechild', id: '8d6acc25-a2b6-4e44-988e-5328071364b1' },
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const RX = /animations\/[^/]+\/(south|east|north|west)\/frame_(\d+)\.png$/i;

fs.mkdirSync(OUT, { recursive: true });
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
    const imgs = frames[d].slice(0, FRAMES).map((fr) => PNG.sync.read(fr.data));
    const W = imgs[0].width, H = imgs[0].height;
    const strip = new PNG({ width: W * FRAMES, height: H });
    imgs.forEach((im, f) => {
      for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
        const si = (y * W + x) * 4, di = (y * (W * FRAMES) + (f * W + x)) * 4;
        strip.data[di] = im.data[si]; strip.data[di + 1] = im.data[si + 1];
        strip.data[di + 2] = im.data[si + 2]; strip.data[di + 3] = im.data[si + 3];
      }
    });
    fs.writeFileSync(`${OUT}/${ch.name}-${d}.png`, PNG.sync.write(strip));
  }
  console.log(ch.name, '— 4 bandes (' + frames.south[0].data.length + 'o/frame)');
}
console.log('OK — habitants assemblés dans', OUT);
