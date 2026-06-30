// Télécharge le personnage PAYSAN PixelLab (chapeau de paille + fourche) et assemble
// une BANDE de marche par direction → public/pixelart/agents/farmer-{dir}.png
// (6 frames de 68px). Perso de décor des CHAMPS (irrigated_fields) : il marche le long
// du champ (cf. cityEngineSprites.js). Calqué sur fetchAgents.mjs.
//   Anim = template 'walking-6-frames' (4 directions). Lancer : node scripts/fetchFarmer.mjs
//   ⚠ Le perso/anim PixelLab peut expirer ; régénérer via create_character + animate_character
//   (mêmes params : view low top-down, size 48, n_directions 4) puis remettre l'id ici.
import { PNG } from 'pngjs';
import AdmZip from 'adm-zip';
import fs from 'node:fs';

const OUT = 'public/pixelart/agents/inhabitants';
const DIRS = ['south', 'east', 'north', 'west'];
const FRAMES = 6;
const ID = '4d7126d8-7c29-4d7a-94a4-85d27c99f8ac'; // « Field Farmer » — chapeau de paille + fourche
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const RX = /animations\/[^/]+\/(south|east|north|west)\/frame_(\d+)\.png$/i;

fs.mkdirSync(OUT, { recursive: true });
let frames = null;
for (let t = 0; t < 30 && !frames; t += 1) {
  try {
    const buf = Buffer.from(await fetch(`https://api.pixellab.ai/mcp/characters/${ID}/download`).then((r) => r.arrayBuffer()));
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
if (!frames) { console.warn('paysan — marche pas prête (timeout)'); process.exit(1); }
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
  fs.writeFileSync(`${OUT}/farmer-${d}.png`, PNG.sync.write(strip));
  console.log('farmer-' + d, '—', W + 'x' + H, '(' + FRAMES + 'f)');
}
console.log('OK — paysan assemblé dans', OUT);
